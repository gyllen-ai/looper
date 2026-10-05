import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { fieldAt } from "../src/fields.ts";
import { heardFrom } from "../src/stall/capability.ts";
import type { Reached } from "../src/stall/stream.ts";

export const SECOND = 1000;

export const MINUTE = 60 * SECOND;

export function reachedBy(payload: unknown, at: number): Reached {
  const heard = heardFrom(JSON.stringify(payload), at);
  if (heard.kind !== "reached") assert.fail(`the hook did not count this call (${heard.kind})`);
  return heard.reached;
}

export function ran(session: string, command: string): unknown {
  return { session_id: session, tool_name: "Bash", tool_input: { command } };
}

export function opened(session: string, file: string): unknown {
  return { session_id: session, tool_name: "Read", tool_input: { file_path: file } };
}

export function edited(file: string, before: string, gone: string, put: string): unknown {
  return {
    session_id: "s",
    tool_name: "Edit",
    tool_input: { file_path: file, old_string: gone, new_string: put, replace_all: false },
    tool_response: { filePath: file, oldString: gone, newString: put, originalFile: before, replaceAll: false },
  };
}

export type Step = { readonly gone: string; readonly put: string };

export function editedInTurn(
  file: string,
  start: string,
  steps: readonly Step[],
  from: number,
  apart: number,
): readonly Reached[] {
  const reached: Reached[] = [];
  let text = start;
  for (const [at, step] of steps.entries()) {
    reached.push(reachedBy(edited(file, text, step.gone, step.put), from + at * apart));
    text = text.replace(step.gone, () => step.put);
  }
  return reached;
}

export function captured(name: string): readonly unknown[] {
  const held: unknown = JSON.parse(readFileSync(join(import.meta.dirname, "fixtures", "stall", `${name}.json`), "utf8"));
  const payloads = fieldAt(held, "payloads");
  if (!Array.isArray(payloads)) assert.fail(`${name} holds no payloads`);
  return payloads;
}
