import { existsSync, readFileSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";

import { FRAMES_DIR } from "../config.ts";
import { reasonFrom } from "../fields.ts";
import { trackedFiles } from "../git.ts";
import { writeAtomically } from "../atomic.ts";
import { readFrame, type Frame } from "./frame.ts";

export type Unreadable = { readonly path: string; readonly why: string };

export type Held = {
  readonly frames: readonly Frame[];
  readonly unreadable: readonly Unreadable[];
};

export type Stale = {
  readonly frame: Frame;
  readonly file: string;
};

const LOOKS: readonly string[] = [
  ".css",
  ".scss",
  ".sass",
  ".html",
  ".htm",
  ".razor",
  ".tsx",
  ".jsx",
  ".vue",
  ".svelte",
];

function safe(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]+/g, "-");
}

export function fileFor(page: string, state: string): string {
  return join(FRAMES_DIR, `${safe(page)}.${safe(state)}.json`);
}

export function keep(root: string, frame: Frame, source: string): string {
  const path = fileFor(frame.page, frame.state);
  writeAtomically(join(root, path), `${source.trim()}\n`);
  return path;
}

export function heldIn(root: string): Held {
  const dir = join(root, FRAMES_DIR);
  if (!existsSync(dir)) return { frames: [], unreadable: [] };
  const frames: Frame[] = [];
  const unreadable: Unreadable[] = [];
  for (const entry of readdirSync(dir).sort()) {
    if (!entry.endsWith(".json")) continue;
    const path = join(FRAMES_DIR, entry);
    let text: string;
    try {
      text = readFileSync(join(dir, entry), "utf8");
    } catch (cause) {
      unreadable.push({ path, why: reasonFrom(cause) });
      continue;
    }
    const held = readFrame(text);
    if (held.kind === "unreadable") {
      unreadable.push({ path, why: held.why });
      continue;
    }
    frames.push(held.frame);
  }
  return { frames, unreadable };
}

export function forget(root: string, page: string): readonly string[] {
  const dir = join(root, FRAMES_DIR);
  if (!existsSync(dir)) return [];
  const gone: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (!entry.startsWith(`${safe(page)}.`) || !entry.endsWith(".json")) continue;
    unlinkSync(join(dir, entry));
    gone.push(join(FRAMES_DIR, entry));
  }
  return gone;
}

export type Newest =
  | { readonly kind: "unknown"; readonly why: string }
  | { readonly kind: "seen"; readonly at: number; readonly file: string };

export function newestLook(root: string): Newest {
  const tracked = trackedFiles(root);
  if (tracked.kind === "unavailable") {
    return { kind: "unknown", why: "git could not list this project's files" };
  }
  let at = 0;
  let file = "";
  for (const path of tracked.paths) {
    if (!LOOKS.some((ending) => path.endsWith(ending))) continue;
    const full = join(root, path);
    if (!existsSync(full)) continue;
    const when = statSync(full).mtimeMs;
    if (when <= at) continue;
    at = when;
    file = path;
  }
  if (file.length === 0) {
    return { kind: "unknown", why: "this project has no stylesheet or component file to date a frame against" };
  }
  return { kind: "seen", at, file };
}

export function staleAgainst(frames: readonly Frame[], newest: Newest): readonly Stale[] {
  if (newest.kind === "unknown") return [];
  const found: Stale[] = [];
  for (const frame of frames) {
    const when = Date.parse(frame.captured);
    if (Number.isNaN(when) || when >= newest.at) continue;
    found.push({ frame, file: newest.file });
  }
  return found;
}
