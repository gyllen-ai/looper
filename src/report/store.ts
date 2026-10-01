import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

import { withLock, writeAtomically } from "../atomic.ts";
import { JSON_INDENT } from "../config.ts";
import { fieldAt, reasonFrom } from "../fields.ts";

const REPORTS_DIR = join(".looper", "reports");

const WHAT_WAS_DECIDED = "decided.json";

const NAME_LENGTH = 12;

export type State = "written" | "released" | "sent" | "kept";

const STATES: readonly State[] = ["written", "released", "sent", "kept"];

export type Held = {
  readonly id: string;
  readonly state: State;
  readonly on: string;
  readonly title: string;
  readonly print: string;
};

export type Read =
  | { readonly kind: "unreadable"; readonly why: string }
  | { readonly kind: "read"; readonly held: readonly Held[] };

export type Kept =
  | { readonly kind: "busy"; readonly why: string }
  | { readonly kind: "unreadable"; readonly why: string }
  | { readonly kind: "kept"; readonly path: string };

export type Decided =
  | { readonly kind: "busy"; readonly why: string }
  | { readonly kind: "unreadable"; readonly why: string }
  | { readonly kind: "none" }
  | { readonly kind: "decided"; readonly held: Held };

function shortHash(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, NAME_LENGTH);
}

export function idOf(parts: readonly string[]): string {
  return shortHash(parts.join("\0"));
}

export function printOf(body: string): string {
  return createHash("sha256").update(body).digest("hex");
}

export function reportsIn(root: string, home: string): string {
  return join(home, REPORTS_DIR, `${basename(root)}-${shortHash(root)}`);
}

export function pathOf(root: string, home: string, id: string): string {
  return join(reportsIn(root, home), `${id}.md`);
}

function decidedAt(root: string, home: string): string {
  return join(reportsIn(root, home), WHAT_WAS_DECIDED);
}

function stateFrom(value: unknown): State | undefined {
  return STATES.find((one) => one === value);
}

function heldFrom(id: string, value: unknown): Held | undefined {
  const state = stateFrom(fieldAt(value, "state"));
  const on = fieldAt(value, "on");
  const title = fieldAt(value, "title");
  const print = fieldAt(value, "print");
  if (state === undefined || typeof on !== "string" || typeof title !== "string" || typeof print !== "string") {
    return undefined;
  }
  return { id, state, on, title, print };
}

export function heldIn(root: string, home: string): Read {
  const path = decidedAt(root, home);
  if (!existsSync(path)) return { kind: "read", held: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (cause) {
    return { kind: "unreadable", why: `${path} could not be read (${reasonFrom(cause)})` };
  }
  if (parsed === null || typeof parsed !== "object") {
    return { kind: "unreadable", why: `${path} holds no record` };
  }
  const held: Held[] = [];
  for (const [id, value] of Object.entries(parsed)) {
    const one = heldFrom(id, value);
    if (one === undefined) return { kind: "unreadable", why: `${path} has an entry for ${id} that is not a report` };
    held.push(one);
  }
  return { kind: "read", held };
}

function recorded(root: string, home: string, held: readonly Held[]): void {
  const record: Record<string, unknown> = {};
  for (const one of held) {
    record[one.id] = { state: one.state, on: one.on, title: one.title, print: one.print };
  }
  writeAtomically(decidedAt(root, home), `${JSON.stringify(record, null, JSON_INDENT)}\n`);
}

export function keep(root: string, home: string, report: Held, body: string): Kept {
  let outcome: Kept = { kind: "kept", path: pathOf(root, home, report.id) };
  const lock = withLock(decidedAt(root, home), () => {
    const before = heldIn(root, home);
    if (before.kind === "unreadable") {
      outcome = before;
      return;
    }
    writeAtomically(pathOf(root, home, report.id), body);
    recorded(root, home, [...before.held.filter((one) => one.id !== report.id), report]);
  });
  if (lock.kind === "busy") return lock;
  return outcome;
}

export function decide(root: string, home: string, id: string, state: State): Decided {
  let outcome: Decided = { kind: "none" };
  const lock = withLock(decidedAt(root, home), () => {
    const before = heldIn(root, home);
    if (before.kind === "unreadable") {
      outcome = before;
      return;
    }
    const found = before.held.find((one) => one.id === id);
    if (found === undefined) return;
    const now: Held = { id, state, on: found.on, title: found.title, print: found.print };
    recorded(root, home, before.held.map((one) => (one.id === id ? now : one)));
    outcome = { kind: "decided", held: now };
  });
  if (lock.kind === "busy") return lock;
  return outcome;
}
