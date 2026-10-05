import { closeSync, constants, fstatSync, openSync, readFileSync, statSync, writeSync, type Stats } from "node:fs";

import { CouldNotRead } from "./errors.ts";
import { fieldAt, reasonFrom } from "./fields.ts";

export type Ordinary =
  | { readonly kind: "absent" }
  | { readonly kind: "unreadable"; readonly why: string }
  | { readonly kind: "text"; readonly text: string };

export type Held<T> =
  | { readonly kind: "absent" }
  | { readonly kind: "unreadable"; readonly why: string }
  | { readonly kind: "held"; readonly value: T };

const NOT_WAITING = typeof constants.O_NONBLOCK === "number" ? constants.O_NONBLOCK : 0;

const WITHOUT_WAITING = constants.O_RDONLY | NOT_WAITING;

const ADDING_WITHOUT_WAITING = constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | NOT_WAITING;

const AS_A_NEW_FILE_IS_MADE = 0o666;

function whatItIs(held: Stats): string {
  if (held.isFIFO()) return "a named pipe";
  if (held.isDirectory()) return "a directory";
  if (held.isSocket()) return "a socket";
  if (held.isCharacterDevice() || held.isBlockDevice()) return "a device";
  return "something other than a file";
}

export function holdOrdinary<T>(path: string, use: (handle: number, bytes: number) => T): Held<T> {
  let handle: number;
  try {
    handle = openSync(path, WITHOUT_WAITING);
  } catch (cause) {
    if (fieldAt(cause, "code") === "ENOENT") return { kind: "absent" };
    return { kind: "unreadable", why: `${path} could not be opened (${reasonFrom(cause)})` };
  }
  try {
    const held = fstatSync(handle);
    if (!held.isFile()) {
      return { kind: "unreadable", why: `${path} is ${whatItIs(held)}, not a file, so looper did not read from it` };
    }
    return { kind: "held", value: use(handle, held.size) };
  } catch (cause) {
    return { kind: "unreadable", why: `${path} could not be read (${reasonFrom(cause)})` };
  } finally {
    closeSync(handle);
  }
}

export function readOrdinary(path: string): Ordinary {
  const held = holdOrdinary(path, (handle) => readFileSync(handle, "utf8"));
  if (held.kind === "held") return { kind: "text", text: held.value };
  return held;
}

export type Present = { readonly kind: "absent" } | { readonly kind: "text"; readonly text: string };

export function readOrdinaryOrSay(path: string): Present {
  const read = readOrdinary(path);
  if (read.kind === "unreadable") throw new CouldNotRead(read.why);
  return read;
}

export type Added = { readonly kind: "added" } | { readonly kind: "not-added"; readonly why: string };

function whatStandsAt(path: string, cause: unknown): string {
  try {
    const held = statSync(path);
    if (!held.isFile()) return `${path} is ${whatItIs(held)}, not a file, so looper did not write to it`;
  } catch (unseen) {
    return `${path} could not be opened to add to (${reasonFrom(cause)}; looking at it said ${reasonFrom(unseen)})`;
  }
  return `${path} could not be opened to add to (${reasonFrom(cause)})`;
}

export function addToOrdinary(path: string, text: string): Added {
  let handle: number;
  try {
    handle = openSync(path, ADDING_WITHOUT_WAITING, AS_A_NEW_FILE_IS_MADE);
  } catch (cause) {
    return { kind: "not-added", why: whatStandsAt(path, cause) };
  }
  try {
    const held = fstatSync(handle);
    if (!held.isFile()) {
      return { kind: "not-added", why: `${path} is ${whatItIs(held)}, not a file, so looper did not write to it` };
    }
    writeSync(handle, text);
    return { kind: "added" };
  } catch (cause) {
    return { kind: "not-added", why: `${path} could not be added to (${reasonFrom(cause)})` };
  } finally {
    closeSync(handle);
  }
}

export function textOfOrdinary(path: string): string {
  const read = readOrdinary(path);
  if (read.kind === "text") return read.text;
  throw new CouldNotRead(read.kind === "absent" ? `${path} is not there` : read.why);
}
