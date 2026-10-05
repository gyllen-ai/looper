import { closeSync, constants, fstatSync, openSync, readFileSync, type Stats } from "node:fs";

import { CouldNotRead } from "./errors.ts";
import { fieldAt, reasonFrom } from "./fields.ts";

export type Ordinary =
  | { readonly kind: "absent" }
  | { readonly kind: "unreadable"; readonly why: string }
  | { readonly kind: "text"; readonly text: string };

const WITHOUT_WAITING =
  typeof constants.O_NONBLOCK === "number" ? constants.O_RDONLY | constants.O_NONBLOCK : constants.O_RDONLY;

function whatItIs(held: Stats): string {
  if (held.isFIFO()) return "a named pipe";
  if (held.isDirectory()) return "a directory";
  if (held.isSocket()) return "a socket";
  if (held.isCharacterDevice() || held.isBlockDevice()) return "a device";
  return "something other than a file";
}

export function readOrdinary(path: string): Ordinary {
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
    return { kind: "text", text: readFileSync(handle, "utf8") };
  } catch (cause) {
    return { kind: "unreadable", why: `${path} could not be read (${reasonFrom(cause)})` };
  } finally {
    closeSync(handle);
  }
}

export type Present = { readonly kind: "absent" } | { readonly kind: "text"; readonly text: string };

export function readOrdinaryOrSay(path: string): Present {
  const read = readOrdinary(path);
  if (read.kind === "unreadable") throw new CouldNotRead(read.why);
  return read;
}
