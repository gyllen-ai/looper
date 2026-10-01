import { existsSync } from "node:fs";
import { join } from "node:path";

import { PYTHON_COMMAND, PYTHON_READER, PYTHON_SKELETON } from "../../config.ts";
import { fieldAt, reasonFrom } from "../../fields.ts";
import { runPython } from "../../start.ts";

export type PythonHit = {
  readonly rule: string;
  readonly file: string;
  readonly line: number;
};

export type Unreadable = {
  readonly file: string;
  readonly detail: string;
};

export type Judged =
  | { readonly kind: "unavailable"; readonly detail: string }
  | { readonly kind: "refused"; readonly detail: string }
  | {
      readonly kind: "found";
      readonly hits: readonly PythonHit[];
      readonly unreadable: readonly Unreadable[];
    };

function readerAt(looperRoot: string): string {
  return join(looperRoot, PYTHON_READER);
}

export function readerIsHere(looperRoot: string): boolean {
  return existsSync(readerAt(looperRoot));
}

function hitsFrom(payload: unknown): readonly PythonHit[] {
  const held = fieldAt(payload, "violations");
  if (!Array.isArray(held)) return [];
  const found: PythonHit[] = [];
  for (const one of held) {
    const rule = fieldAt(one, "rule");
    const file = fieldAt(one, "file");
    const line = fieldAt(one, "line");
    if (typeof rule !== "string" || typeof file !== "string" || typeof line !== "number") continue;
    found.push({ rule, file, line });
  }
  return found;
}

function unreadableFrom(payload: unknown): readonly Unreadable[] {
  const held = fieldAt(payload, "unreadable");
  if (!Array.isArray(held)) return [];
  const found: Unreadable[] = [];
  for (const one of held) {
    const file = fieldAt(one, "file");
    const detail = fieldAt(one, "detail");
    if (typeof file !== "string" || typeof detail !== "string") continue;
    found.push({ file, detail });
  }
  return found;
}

export function judgePython(looperRoot: string, files: readonly string[]): Judged {
  if (files.length === 0) return { kind: "found", hits: [], unreadable: [] };
  if (!readerIsHere(looperRoot)) {
    return { kind: "unavailable", detail: `looper's Python reader is not at ${PYTHON_READER}` };
  }

  let output = "";
  try {
    output = runPython(looperRoot, "rules", files);
  } catch (cause) {
    return {
      kind: "unavailable",
      detail: `${PYTHON_COMMAND} could not run looper's Python reader (${reasonFrom(cause)})`,
    };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(output);
  } catch (cause) {
    return { kind: "unavailable", detail: `it did not answer in JSON (${reasonFrom(cause)})` };
  }

  const refused = fieldAt(payload, "error");
  if (typeof refused === "string") return { kind: "refused", detail: refused };
  return { kind: "found", hits: hitsFrom(payload), unreadable: unreadableFrom(payload) };
}

export type Shaped =
  | { readonly kind: "unavailable"; readonly detail: string }
  | { readonly kind: "found"; readonly payload: unknown };

export function shapeFromPython(
  looperRoot: string,
  path: string,
  line: number,
  depth: number,
): Shaped {
  const reader = join(looperRoot, PYTHON_SKELETON);
  if (!existsSync(reader)) {
    return { kind: "unavailable", detail: `looper's Python shape reader is not at ${PYTHON_SKELETON}` };
  }
  let output = "";
  try {
    output = runPython(looperRoot, "shape", [path, String(line), String(depth)]);
  } catch (cause) {
    return {
      kind: "unavailable",
      detail: `${PYTHON_COMMAND} could not run looper's Python reader (${reasonFrom(cause)})`,
    };
  }
  try {
    return { kind: "found", payload: JSON.parse(output) };
  } catch (cause) {
    return { kind: "unavailable", detail: `it did not answer in JSON (${reasonFrom(cause)})` };
  }
}
