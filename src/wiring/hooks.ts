import { COMMIT_GATE_TIMEOUT_SECONDS, entryFor, type Invocation } from "../config.ts";
import type { HookSpec } from "../types.ts";

export const EDIT_TOOLS = "Edit|MultiEdit|Write|Bash";

export const READ_TOOLS = "Read";

export function looperHooks(invocation: Invocation): readonly HookSpec[] {
  return looperHooksStartedBy(entryFor(invocation));
}

export function looperHooksStartedBy(entry: string): readonly HookSpec[] {
  return [
    {
      event: "UserPromptSubmit",
      matcher: { kind: "all" },
      command: `${entry} inject`,
      statusMessage: "looper: reading this project's rules",
    },
    {
      event: "PostToolUse",
      matcher: { kind: "match", pattern: EDIT_TOOLS },
      command: `${entry} hook PostToolUse`,
      statusMessage: "looper: checking that edit",
    },
    {
      event: "PostToolUse",
      matcher: { kind: "match", pattern: READ_TOOLS },
      command: `${entry} reached`,
      statusMessage: "looper: noting what was read",
    },
    {
      event: "PreToolUse",
      matcher: { kind: "match", pattern: "Bash" },
      command: `${entry} hook PreToolUse`,
      statusMessage: "looper: checking what is about to be committed",
      timeoutSeconds: COMMIT_GATE_TIMEOUT_SECONDS,
    },
    {
      event: "Stop",
      matcher: { kind: "all" },
      command: `${entry} hook Stop`,
      statusMessage: "looper: updating what is left to fix",
    },
  ];
}
