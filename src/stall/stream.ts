import { createHash } from "node:crypto";
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readSync, renameSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";

import { withLockFor, type Patience } from "../atomic.ts";
import { fieldAt, reasonFrom } from "../fields.ts";
import { readAs, writtenAs, type Placed } from "./placed.ts";

const STREAM_DIR = join(".looper", "seen");

const NAME_LENGTH = 12;

export const A_STREAM_HOLDS = 400;

export type Reached = {
  readonly at: number;
  readonly tool: string;
  readonly shape: string;
  readonly print: string;
  readonly placed: Placed;
  readonly session: string;
};

export type Stream =
  | { readonly kind: "none" }
  | { readonly kind: "unreadable"; readonly why: string }
  | { readonly kind: "reached"; readonly reached: readonly Reached[] };

export function streamPath(root: string, home: string): string {
  const print = createHash("sha256").update(root).digest("hex").slice(0, NAME_LENGTH);
  return join(home, STREAM_DIR, `${basename(root)}-${print}.reached`);
}

const SHAPE_WIDTH = 160;

const CUT_SHORT = "…";

function flattened(detail: string): string {
  return detail.replace(/\s+/g, " ").trim();
}

export function shapeOf(tool: string, detail: string): string {
  const flat = flattened(detail);
  if (flat.length === 0) return tool;
  if (flat.length <= SHAPE_WIDTH) return flat;
  return `${flat.slice(0, SHAPE_WIDTH)}${CUT_SHORT}`;
}

export function printOf(tool: string, detail: string): string {
  const flat = flattened(detail);
  return createHash("sha256")
    .update(flat.length === 0 ? tool : flat)
    .digest("hex")
    .slice(0, NAME_LENGTH);
}

export type Noted =
  | { readonly kind: "noted" }
  | { readonly kind: "not-noted"; readonly why: string }
  | { readonly kind: "kept-long"; readonly why: string };

export const A_STREAM_IS_CUT_AT_BYTES = 256 * 1024;

const OLDER = ".older";

export function olderStreamPath(root: string, home: string): string {
  return `${streamPath(root, home)}${OLDER}`;
}

const ONE_CUT_AT_A_TIME: Patience = { waitMs: 0, giveUpMs: 0, staleMs: 5000 };

type Size = { readonly kind: "gone" } | { readonly kind: "sized"; readonly bytes: number };

function sizeOf(path: string): Size {
  try {
    return { kind: "sized", bytes: statSync(path).size };
  } catch (cause) {
    if (fieldAt(cause, "code") === "ENOENT") return { kind: "gone" };
    throw cause;
  }
}

function longerThanACut(path: string): boolean {
  const size = sizeOf(path);
  return size.kind === "sized" && size.bytes > A_STREAM_IS_CUT_AT_BYTES;
}

function cutIfLong(path: string, older: string): void {
  if (!longerThanACut(path)) return;
  withLockFor(path, ONE_CUT_AT_A_TIME, () => {
    if (longerThanACut(path)) renameSync(path, older);
  });
}

function oneLine(text: string): string {
  return text.replace(/[\t\n]/g, " ");
}

export function note(root: string, home: string, one: Reached): Noted {
  const path = streamPath(root, home);
  try {
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(
      path,
      `${one.at}\t${one.tool}\t${oneLine(one.shape)}\t${oneLine(one.session)}\t${one.print}\t${writtenAs(one.placed)}\n`,
    );
  } catch (cause) {
    return { kind: "not-noted", why: reasonFrom(cause) };
  }
  try {
    cutIfLong(path, olderStreamPath(root, home));
    return { kind: "noted" };
  } catch (cause) {
    return { kind: "kept-long", why: reasonFrom(cause) };
  }
}

type Tail = { readonly text: string; readonly bytes: number; readonly whole: boolean };

function tailOf(path: string, upTo: number): Tail {
  const size = sizeOf(path);
  if (size.kind === "gone") return { text: "", bytes: 0, whole: true };
  const take = Math.min(size.bytes, upTo);
  const into = new Uint8Array(take);
  const handle = openSync(path, "r");
  let got = 0;
  try {
    got = readSync(handle, into, 0, take, size.bytes - take);
  } finally {
    closeSync(handle);
  }
  return { text: new TextDecoder().decode(into.subarray(0, got)), bytes: got, whole: take === size.bytes };
}

function fromALineStart(tail: Tail): string {
  return tail.whole ? tail.text : tail.text.slice(tail.text.indexOf("\n") + 1);
}

function windowOf(path: string, older: string): string {
  const recent = tailOf(path, A_STREAM_IS_CUT_AT_BYTES);
  const room = A_STREAM_IS_CUT_AT_BYTES - recent.bytes;
  if (!recent.whole || room <= 0) return fromALineStart(recent);
  return `${fromALineStart(tailOf(older, room))}${recent.text}`;
}

const FIELDS = 6;

export function reachedFor(root: string, home: string, session: string): Stream {
  const path = streamPath(root, home);
  const older = olderStreamPath(root, home);
  if (!existsSync(path) && !existsSync(older)) return { kind: "none" };
  let held = "";
  try {
    held = windowOf(path, older);
  } catch (cause) {
    return { kind: "unreadable", why: reasonFrom(cause) };
  }
  const reached: Reached[] = [];
  for (const line of held.split("\n").filter((one) => one.length > 0).slice(-A_STREAM_HOLDS)) {
    const parts = line.split("\t");
    if (parts.length !== FIELDS) continue;
    const at = Number(parts[0]);
    const tool = parts[1];
    const shape = parts[2];
    const who = parts[3];
    const print = parts[4];
    const placed = parts[5];
    if (!Number.isFinite(at) || tool === undefined || shape === undefined || who === undefined) continue;
    if (print === undefined || placed === undefined) continue;
    if (who !== session) continue;
    reached.push({ at, tool, shape, print, placed: readAs(placed), session: who });
  }
  return { kind: "reached", reached };
}
