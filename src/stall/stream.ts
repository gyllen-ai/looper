import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

import { reasonFrom } from "../fields.ts";
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
  | { readonly kind: "not-noted"; readonly why: string };

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
    return { kind: "noted" };
  } catch (cause) {
    return { kind: "not-noted", why: reasonFrom(cause) };
  }
}

const FIELDS = 6;

export function reachedFor(root: string, home: string, session: string): Stream {
  const path = streamPath(root, home);
  if (!existsSync(path)) return { kind: "none" };
  let held = "";
  try {
    held = readFileSync(path, "utf8");
  } catch (cause) {
    return { kind: "unreadable", why: reasonFrom(cause) };
  }
  const reached: Reached[] = [];
  for (const line of held.split("\n").slice(-A_STREAM_HOLDS)) {
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
