import { createHash } from "node:crypto";
import { basename, join } from "node:path";

import { JSON_INDENT } from "./config.ts";
import { writeAtomically } from "./atomic.ts";
import { reasonFrom } from "./fields.ts";
import { readOrdinary } from "./ordinary.ts";

export interface SaidStore {
  readonly trouble: string;
  heard(source: string, text: string): boolean;
  note(source: string, text: string): void;
}

export type Said =
  | { readonly kind: "nobody" }
  | { readonly kind: "session"; readonly store: SaidStore };

export const NEVER_SAID: Said = { kind: "nobody" };

export function heardBefore(said: Said, source: string, text: string): boolean {
  return said.kind === "session" && said.store.heard(source, text);
}

export function noteSaid(said: Said, source: string, text: string): void {
  if (said.kind === "session") said.store.note(source, text);
}

export function troubleWith(said: Said): string {
  return said.kind === "session" ? said.store.trouble : "";
}

const SAID_DIR = join(".looper", "seen");

const NAME_LENGTH = 12;

const A_NUMBER = /\d+/g;

export function gistOf(text: string): string {
  return createHash("sha256").update(text.replace(A_NUMBER, "#")).digest("hex").slice(0, 16);
}

export function saidPath(root: string, home: string, session: string): string {
  const print = createHash("sha256").update(root).digest("hex").slice(0, NAME_LENGTH);
  const who = createHash("sha256").update(session).digest("hex").slice(0, NAME_LENGTH);
  return join(home, SAID_DIR, `${basename(root)}-${print}.said-${who}.json`);
}

type Gists =
  | { readonly kind: "read"; readonly gists: Map<string, string> }
  | { readonly kind: "unreadable"; readonly why: string };

function readGists(path: string): Gists {
  const gists = new Map<string, string>();
  const read = readOrdinary(path);
  if (read.kind === "absent") return { kind: "read", gists };
  if (read.kind === "unreadable") return { kind: "unreadable", why: read.why };
  let held: unknown;
  try {
    held = JSON.parse(read.text);
  } catch (cause) {
    return { kind: "unreadable", why: reasonFrom(cause) };
  }
  if (held === null || typeof held !== "object") return { kind: "unreadable", why: `${path} holds no record` };
  for (const [source, gist] of Object.entries(held)) {
    if (typeof gist === "string") gists.set(source, gist);
  }
  return { kind: "read", gists };
}

export class SaidInSession implements SaidStore {
  private readonly path: string;
  private readonly gists: Map<string, string>;
  readonly trouble: string;

  constructor(root: string, home: string, session: string) {
    this.path = saidPath(root, home, session);
    const read = readGists(this.path);
    this.gists = read.kind === "read" ? read.gists : new Map<string, string>();
    this.trouble = read.kind === "read" ? "" : read.why;
  }

  heard(source: string, text: string): boolean {
    if (this.trouble.length > 0) return false;
    return this.gists.get(source) === gistOf(text);
  }

  note(source: string, text: string): void {
    this.gists.set(source, gistOf(text));
    writeAtomically(this.path, `${JSON.stringify(Object.fromEntries(this.gists), null, JSON_INDENT)}\n`);
  }
}
