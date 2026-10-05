import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  BULLET_CEILING,
  CANON_SOURCE_DIR,
  CONSTITUTION_CEILING,
  DOCTRINE_DIR,
  DOCTRINE_FILE_CEILING,
  DOCTRINE_README_PATH,
} from "./config.ts";
import { stagedFiles, stagedText } from "./git.ts";
import { readOrdinaryOrSay } from "./ordinary.ts";

export type Bullet = { readonly line: number; readonly chars: number };

export type Oversized =
  | {
      readonly kind: "bullet";
      readonly path: string;
      readonly line: number;
      readonly chars: number;
      readonly ceiling: number;
    }
  | { readonly kind: "file"; readonly path: string; readonly chars: number; readonly ceiling: number };

export type Measured =
  | { readonly kind: "unavailable"; readonly detail: string }
  | { readonly kind: "measured"; readonly oversized: readonly Oversized[] };

const A_BULLET = /^\s*[-*]\s+/;

const INDENTED = /^\s+\S/;

type Open = { readonly line: number; readonly parts: string[] };

function widthOf(open: Open): Bullet {
  return { line: open.line, chars: open.parts.join(" ").replace(/\s+/g, " ").trim().length };
}

export function bulletsIn(text: string): readonly Bullet[] {
  const found: Bullet[] = [];
  let open: Open | undefined;
  for (const [at, raw] of text.split("\n").entries()) {
    if (A_BULLET.test(raw)) {
      if (open !== undefined) found.push(widthOf(open));
      open = { line: at + 1, parts: [raw.replace(A_BULLET, "")] };
      continue;
    }
    if (raw.trim().length === 0) continue;
    if (open === undefined) continue;
    if (INDENTED.test(raw)) {
      open.parts.push(raw.trim());
      continue;
    }
    found.push(widthOf(open));
    open = undefined;
  }
  if (open !== undefined) found.push(widthOf(open));
  return found;
}

export function isDoctrinePath(path: string): boolean {
  if (!path.endsWith(".md")) return false;
  if (path === DOCTRINE_README_PATH) return false;
  return path.startsWith(`${DOCTRINE_DIR}/`) || path.startsWith(`${CANON_SOURCE_DIR}/`);
}

function ceilingFor(path: string): number {
  return path.endsWith("/constitution.md") ? CONSTITUTION_CEILING : DOCTRINE_FILE_CEILING;
}

export function oversizedIn(path: string, text: string): readonly Oversized[] {
  const found: Oversized[] = [];
  const whole = text.trim().length;
  const ceiling = ceilingFor(path);
  if (whole > ceiling) found.push({ kind: "file", path, chars: whole, ceiling });
  for (const bullet of bulletsIn(text)) {
    if (bullet.chars <= BULLET_CEILING) continue;
    found.push({ kind: "bullet", path, line: bullet.line, chars: bullet.chars, ceiling: BULLET_CEILING });
  }
  return found;
}

export function sizeOfStaged(root: string): Measured {
  const staged = stagedFiles(root);
  if (staged.kind === "unavailable") return { kind: "unavailable", detail: staged.detail };
  const oversized: Oversized[] = [];
  for (const path of staged.paths) {
    if (!isDoctrinePath(path)) continue;
    const held = stagedText(root, path);
    if (held.kind === "unreadable") return { kind: "unavailable", detail: `${path}: ${held.detail}` };
    oversized.push(...oversizedIn(path, held.text));
  }
  return { kind: "measured", oversized };
}

function markdownUnder(root: string, dir: string): readonly string[] {
  const here = join(root, dir);
  if (!existsSync(here)) return [];
  const found: string[] = [];
  for (const entry of readdirSync(here, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) found.push(...markdownUnder(root, path));
    else if (isDoctrinePath(path)) found.push(path);
  }
  return found;
}

export function doctrineFilesUnder(root: string): readonly string[] {
  return [...markdownUnder(root, DOCTRINE_DIR), ...markdownUnder(root, CANON_SOURCE_DIR)].sort();
}

export function sizeOfTree(root: string): readonly Oversized[] {
  const found: Oversized[] = [];
  for (const path of doctrineFilesUnder(root)) {
    const read = readOrdinaryOrSay(join(root, path));
    if (read.kind === "text") found.push(...oversizedIn(path, read.text));
  }
  return found;
}

export function lineFor(one: Oversized): string {
  if (one.kind === "bullet") {
    return `  ${one.path}:${one.line}  a bullet of ${one.chars} chars; the ceiling is ${one.ceiling}`;
  }
  return `  ${one.path}  ${one.chars} chars; the ceiling is ${one.ceiling}`;
}

export function saidAboutSize(oversized: readonly Oversized[]): string {
  return [
    "",
    "looper: a rule set grew past what a turn can carry.",
    "",
    ...oversized.map(lineFor),
    "",
    "A bullet is the rule, the number and the date. The story behind it goes to recall",
    "(the recall tool writes .looper/recall.md), where it is found by topic instead of",
    "paid for on every turn. A file past its ceiling is two branches: split it, and name",
    "the new one in map.toml. There is no line that waves this through.",
    "",
  ].join("\n");
}
