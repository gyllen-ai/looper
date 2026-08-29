import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  ALLOW_MARKER,
  BASELINE_PATH,
  NOT_A_WAY_THROUGH,
  SECRETS_ALLOW_PATH,
  SKIP_SUFFIXES,
} from "../config.ts";
import { SILENT } from "../capability.ts";
import type {
  Capability,
  HookContext,
  HookEvent,
  Injection,
  Outcome,
  ToolCall,
  ToolDef,
  ToolResult,
} from "../capability.ts";
import { stagedAdditions } from "../git.ts";
import { commandFrom } from "../law/payload.ts";
import { intentOf } from "../law/commit-command.ts";
import { saidAboutStrangers, strangersLeaving } from "./strangers.ts";
import { findingsIn } from "./detect.ts";

const COMMIT_EVENTS: readonly HookEvent[] = [
  "PreToolUse",
  "PreCommit",
  "CommitMessage",
];

const NO_TOOLS: readonly ToolDef[] = [];

const IN_THE_MESSAGE = "the commit message";

const AS_TYPED = "the command you typed";

export type Caught = {
  readonly file: string;
  readonly line: number;
  readonly kind: string;
  readonly excerpt: string;
};

export function allowedValues(root: string): ReadonlySet<string> {
  const path = join(root, SECRETS_ALLOW_PATH);
  if (!existsSync(path)) return new Set();
  const allowed = new Set<string>();
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const value = line.trim();
    if (value.length === 0 || value.startsWith("#")) continue;
    allowed.add(value);
  }
  return allowed;
}

export function scanStaged(root: string): readonly Caught[] {
  const staged = stagedAdditions(root);
  if (staged.kind === "unavailable") return [];

  const allowed = allowedValues(root);
  const caught: Caught[] = [];

  for (const added of staged.added) {
    if (SKIP_SUFFIXES.some((suffix) => added.file.endsWith(suffix))) continue;
    if (added.file.endsWith(SECRETS_ALLOW_PATH)) continue;
    if (added.file.endsWith(BASELINE_PATH)) continue;
    if (added.text.includes(ALLOW_MARKER)) continue;
    for (const finding of findingsIn(added.text, allowed)) {
      caught.push({ file: added.file, line: added.line, ...finding });
    }
  }

  return caught;
}

export function scanText(root: string, text: string, called: string): readonly Caught[] {
  const allowed = allowedValues(root);
  const caught: Caught[] = [];
  let at = 0;

  for (const line of text.split("\n")) {
    at += 1;
    if (line.startsWith("#")) continue;
    if (line.includes(ALLOW_MARKER)) continue;
    for (const finding of findingsIn(line, allowed)) {
      caught.push({ file: called, line: at, ...finding });
    }
  }
  return caught;
}

export function scanMessage(root: string, message: string): readonly Caught[] {
  return scanText(root, message, IN_THE_MESSAGE);
}

export function reportOn(caught: readonly Caught[]): string {
  const opening =
    caught.length === 1
      ? "looper found something that looks like a password or a key"
      : `looper found ${caught.length} things that look like passwords or keys`;
  const lines = [``, `${opening} in what you are about to commit.`, ``];
  for (const held of caught) {
    lines.push(`  ${held.file}:${held.line}`, `    ${held.kind} — ${held.excerpt}`);
  }
  lines.push(
    ``,
    `Nothing was committed.`,
    ``,
    NOT_A_WAY_THROUGH,
    ``,
    `If it is real: take it out of the file, put it in a setting instead, and`,
    `change the key at whoever issued it. That last step is not optional. Once a`,
    `key has been committed, deleting it later does not help — everyone who has`,
    `ever copied this project already has a copy of it, and no change you make`,
    `here can reach them.`,
    ``,
    `If it is genuinely safe to publish: add the exact value to`,
    `${SECRETS_ALLOW_PATH}, one per line, with a note above it saying why. That`,
    `line is the review. Or put ${ALLOW_MARKER} on the line itself.`,
  );
  return lines.join("\n");
}

export class Secrets implements Capability {
  readonly name = "secrets";

  inject(): readonly Injection[] {
    return SILENT;
  }

  hooks(): readonly HookEvent[] {
    return COMMIT_EVENTS;
  }

  onHook(context: HookContext): Outcome {
    if (context.event === "CommitMessage") {
      if (context.payload.kind === "none") return { kind: "pass" };
      const inMessage = scanMessage(context.root, context.payload.text);
      if (inMessage.length === 0) return { kind: "pass" };
      return { kind: "block", reason: reportOn(inMessage) };
    }

    const alsoTyped: Caught[] = [];
    if (context.event === "PreToolUse") {
      if (context.payload.kind === "none") return { kind: "pass" };
      const typed = commandFrom(context.payload.text);
      if (typed.kind === "none") return { kind: "pass" };
      const intent = intentOf(typed.text);
      if (intent.kind === "push") {
        const note = saidAboutStrangers(strangersLeaving(context.root));
        return note.length === 0 ? { kind: "pass" } : { kind: "mention", note };
      }
      if (intent.kind !== "commit") return { kind: "pass" };
      alsoTyped.push(...scanText(context.root, typed.text, AS_TYPED));
    }
    const caught = [...alsoTyped, ...scanStaged(context.root)];
    if (caught.length === 0) return { kind: "pass" };
    return { kind: "block", reason: reportOn(caught) };
  }

  tools(): readonly ToolDef[] {
    return NO_TOOLS;
  }

  call(request: ToolCall): ToolResult {
    return { kind: "unknown-tool", asked: request.tool };
  }
}
