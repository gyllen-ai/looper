import { DECISIONS_PATH } from "../config.ts";
import { DECISIONS_HEADER } from "../stubs.ts";
import { createHash, type Hash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { withLock, writeAtomically } from "../atomic.ts";
import { reasonFrom } from "../fields.ts";
import { required } from "../present.ts";

export const HASH_LENGTH = 12;

export const NOTHING_UNDER_IT = "none";

export type Decision = {
  readonly taken: string;
  readonly summary: string;
  readonly kind: string;
  readonly depends: readonly string[];
  readonly checked: string;
  readonly hash: string;
  readonly body: string;
};

export type Standing =
  | { readonly kind: "watched"; readonly decision: Decision }
  | { readonly kind: "moved"; readonly decision: Decision; readonly now: string }
  | { readonly kind: "gone"; readonly decision: Decision; readonly missing: readonly string[] }
  | { readonly kind: "unreadable"; readonly decision: Decision; readonly why: string }
  | { readonly kind: "unwatchable"; readonly decision: Decision };

export type Hashed =
  | { readonly kind: "hashed"; readonly hash: string }
  | { readonly kind: "unreadable"; readonly why: string };

const ENTRY = /^##\s+(\d{4}-\d{2}-\d{2})\s+[—-]\s+(.*)$/;
const FIELD = /^(kind|depends|checked):\s*(.*)$/;

function listFrom(written: string): readonly string[] {
  if (written === NOTHING_UNDER_IT) return [];
  return written
    .split(",")
    .map((one) => one.trim())
    .filter((one) => one.length > 0);
}

export function parseDecisions(source: string): readonly Decision[] {
  const decisions: Decision[] = [];
  let taken = "";
  let summary = "";
  let kind = "";
  let depends: readonly string[] = [];
  let checked = "";
  let hash = "";
  let body: string[] = [];

  const close = (): void => {
    if (summary.length === 0) return;
    decisions.push({ taken, summary, kind, depends, checked, hash, body: body.join("\n").trim() });
  };

  for (const line of source.split("\n")) {
    const heading = ENTRY.exec(line);
    if (heading !== null) {
      close();
      taken = required(heading[1], "the date on a decision heading");
      summary = required(heading[2], "the summary on a decision heading");
      kind = "";
      depends = [];
      checked = "";
      hash = "";
      body = [];
      continue;
    }
    if (summary.length === 0) continue;
    const field = FIELD.exec(line);
    if (field === null) {
      body.push(line);
      continue;
    }
    const name = required(field[1], "the name of a decision field");
    const written = required(field[2], "the value of a decision field");
    if (name === "kind") kind = written;
    if (name === "depends") depends = listFrom(written);
    if (name === "checked") {
      const parts = written.split(/\s+/);
      checked = required(parts[0], "the date a decision was last read");
      const stamp = parts[1];
      if (stamp !== undefined) hash = stamp;
    }
  }
  close();
  return decisions;
}

export function readDecisions(root: string): readonly Decision[] {
  const path = join(root, DECISIONS_PATH);
  if (!existsSync(path)) return [];
  return parseDecisions(readFileSync(path, "utf8"));
}

function hashInto(digest: Hash, root: string, rel: string): void {
  const full = join(root, rel);
  if (!statSync(full).isDirectory()) {
    digest.update(readFileSync(full));
    return;
  }
  for (const name of readdirSync(full).sort()) {
    digest.update(name);
    hashInto(digest, root, join(rel, name));
  }
}

export function hashOf(root: string, depends: readonly string[]): string {
  const digest = createHash("sha256");
  for (const one of depends) hashInto(digest, root, one);
  return digest.digest("hex").slice(0, HASH_LENGTH);
}

export function hashing(root: string, depends: readonly string[]): Hashed {
  try {
    return { kind: "hashed", hash: hashOf(root, depends) };
  } catch (cause) {
    return { kind: "unreadable", why: reasonFrom(cause) };
  }
}

export function standingOf(root: string, decision: Decision): Standing {
  if (decision.depends.length === 0) return { kind: "unwatchable", decision };
  const missing = decision.depends.filter((one) => !existsSync(join(root, one)));
  if (missing.length > 0) return { kind: "gone", decision, missing };
  const now = hashing(root, decision.depends);
  if (now.kind === "unreadable") return { kind: "unreadable", decision, why: now.why };
  if (now.hash !== decision.hash) return { kind: "moved", decision, now: now.hash };
  return { kind: "watched", decision };
}

export function standings(root: string): readonly Standing[] {
  return readDecisions(root).map((decision) => standingOf(root, decision));
}

export function render(decisions: readonly Decision[]): string {
  const lines = [DECISIONS_HEADER];
  for (const one of decisions) {
    const depends = one.depends.length === 0 ? NOTHING_UNDER_IT : one.depends.join(", ");
    lines.push(
      ``,
      `## ${one.taken} — ${one.summary}`,
      `kind: ${one.kind}`,
      `depends: ${depends}`,
      `checked: ${one.checked}  ${one.hash}`,
      ``,
    );
    if (one.body.length > 0) lines.push(one.body);
  }
  return `${lines.join("\n")}\n`;
}

export type Written =
  | { readonly kind: "added"; readonly total: number }
  | { readonly kind: "replaced"; readonly total: number }
  | { readonly kind: "unreadable"; readonly why: string }
  | { readonly kind: "busy"; readonly why: string };

export type Forgotten =
  | { readonly kind: "gone" }
  | { readonly kind: "not-there" }
  | { readonly kind: "busy"; readonly why: string };

export type Reread =
  | { readonly kind: "gone" }
  | { readonly kind: "not-there" }
  | { readonly kind: "unreadable"; readonly why: string }
  | { readonly kind: "busy"; readonly why: string };

export function record(root: string, decision: Decision): Written {
  const path = join(root, DECISIONS_PATH);
  const missing = decision.depends.filter((one) => !existsSync(join(root, one)));
  if (missing.length > 0) {
    return { kind: "unreadable", why: `it depends on ${missing.join(", ")}, which is not there` };
  }

  const now = hashing(root, decision.depends);
  if (now.kind === "unreadable") {
    return { kind: "unreadable", why: `it depends on something looper cannot read: ${now.why}` };
  }

  let written: Written = { kind: "added", total: 0 };
  const stamped = { ...decision, hash: now.hash };

  const lock = withLock(path, () => {
    const held = readDecisions(root);
    const without = held.filter((one) => one.summary !== decision.summary);
    writeAtomically(path, render([...without, stamped]));
    written = {
      kind: without.length !== held.length ? "replaced" : "added",
      total: without.length + 1,
    };
  });

  if (lock.kind === "busy") return { kind: "busy", why: lock.why };
  return written;
}

export function reread(root: string, summary: string, today: string): Reread {
  const path = join(root, DECISIONS_PATH);
  let found = false;
  let unreadable = "";

  const lock = withLock(path, () => {
    const held = readDecisions(root);
    const wanted = held.filter((one) => one.summary === summary);
    if (wanted.length === 0) return;
    const stamps = new Map<string, string>();
    for (const one of wanted) {
      const now = hashing(root, one.depends);
      if (now.kind === "unreadable") {
        unreadable = now.why;
        return;
      }
      stamps.set(one.summary, now.hash);
    }
    found = true;
    writeAtomically(
      path,
      render(
        held.map((one) => {
          const stamp = stamps.get(one.summary);
          if (stamp === undefined) return one;
          return { ...one, checked: today, hash: stamp };
        }),
      ),
    );
  });

  if (lock.kind === "busy") return { kind: "busy", why: lock.why };
  if (unreadable.length > 0) return { kind: "unreadable", why: unreadable };
  return found ? { kind: "gone" } : { kind: "not-there" };
}

export function forget(root: string, summary: string): Forgotten {
  const path = join(root, DECISIONS_PATH);
  let found = false;

  const lock = withLock(path, () => {
    const held = readDecisions(root);
    const without = held.filter((one) => one.summary !== summary);
    if (without.length === held.length) return;
    found = true;
    writeAtomically(path, render(without));
  });

  if (lock.kind === "busy") return { kind: "busy", why: lock.why };
  return found ? { kind: "gone" } : { kind: "not-there" };
}

export function matching(decisions: readonly Decision[], query: string): readonly Decision[] {
  const wanted = query.toLowerCase();
  return decisions.filter(
    (one) =>
      one.summary.toLowerCase().includes(wanted) ||
      one.kind.toLowerCase().includes(wanted) ||
      one.body.toLowerCase().includes(wanted),
  );
}
