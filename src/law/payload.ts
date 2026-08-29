import { relative, resolve } from "node:path";

import { JUDGED_EXTENSIONS, OUTSIDE_THE_LAW } from "../config.ts";
import { fieldAt, reasonFrom } from "../fields.ts";
import { intentOf } from "./commit-command.ts";
import { underAnotherLaw } from "./project.ts";

export type Named =
  | { readonly kind: "none"; readonly why: string }
  | { readonly kind: "named"; readonly path: string };

export type Target =
  | { readonly kind: "none"; readonly why: string }
  | { readonly kind: "outside"; readonly path: string }
  | { readonly kind: "not-ours"; readonly path: string }
  | { readonly kind: "judge"; readonly path: string; readonly relative: string };

type FromInput =
  | { readonly kind: "none"; readonly why: string }
  | { readonly kind: "read"; readonly value: string };

function fromToolInput(payload: string, key: string, called: string): FromInput {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch (cause) {
    const detail = reasonFrom(cause);
    return { kind: "none", why: `the hook payload was not JSON (${detail})` };
  }
  if (parsed === null || typeof parsed !== "object") {
    return { kind: "none", why: "the hook payload was not an object" };
  }
  const input = fieldAt(parsed, "tool_input");
  if (input === null || typeof input !== "object") {
    return { kind: "none", why: "the hook payload named no tool input" };
  }
  const value = fieldAt(input, key);
  if (typeof value !== "string") {
    return { kind: "none", why: `the tool input carried no ${called}` };
  }
  return { kind: "read", value };
}

function fileFrom(payload: string): Named {
  const held = fromToolInput(payload, "file_path", "file");
  if (held.kind === "none") return held;
  return { kind: "named", path: held.value };
}

type Tool =
  | { readonly kind: "unreadable"; readonly why: string }
  | { readonly kind: "named"; readonly name: string };

function toolNamed(payload: string): Tool {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch (cause) {
    return { kind: "unreadable", why: reasonFrom(cause) };
  }
  const named = fieldAt(parsed, "tool_name");
  if (typeof named !== "string") {
    return { kind: "unreadable", why: "the payload names no tool" };
  }
  return { kind: "named", name: named };
}

export function isBash(payload: string): boolean {
  const tool = toolNamed(payload);
  return tool.kind === "named" && tool.name === "Bash";
}

export function targetOf(root: string, payload: string): Target {
  const named = fileFrom(payload);
  if (named.kind === "none") return named;

  const full = resolve(root, named.path);
  const inside = relative(resolve(root), full);
  if (inside.startsWith("..") || inside.length === 0) {
    return { kind: "outside", path: full };
  }
  if (OUTSIDE_THE_LAW.some((part) => inside.split("/").includes(part))) {
    return { kind: "not-ours", path: inside };
  }
  if (underAnotherLaw(root, inside)) return { kind: "not-ours", path: inside };
  if (!JUDGED_EXTENSIONS.some((suffix) => inside.endsWith(suffix))) {
    return { kind: "not-ours", path: inside };
  }
  return { kind: "judge", path: full, relative: inside };
}

export type Typed =
  | { readonly kind: "none"; readonly why: string }
  | { readonly kind: "command"; readonly text: string };

export function commandFrom(payload: string): Typed {
  const held = fromToolInput(payload, "command", "command");
  if (held.kind === "none") return { kind: "none", why: held.why };
  return { kind: "command", text: held.value };
}

export function aboutToCommit(payload: string): boolean {
  const typed = commandFrom(payload);
  if (typed.kind === "none") return false;
  return intentOf(typed.text).kind === "commit";
}
