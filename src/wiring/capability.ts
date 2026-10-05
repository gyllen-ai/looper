import { join } from "node:path";

import { writeKeepingPrior, type Backup } from "../atomic.ts";
import type { Capability, HookEvent, InjectContext, Injection, Outcome, ToolCall, ToolDef, ToolResult } from "../capability.ts";
import { LOOPER_COMMAND, SETTINGS_PATH, WIRING_PRIORITY } from "../config.ts";
import { reasonFrom } from "../fields.ts";
import { readExisting } from "../init.ts";
import { matcherText, mergeSettings, startedIn } from "../settings.ts";
import type { HookSpec, Wired } from "../types.ts";
import { looperHooksStartedBy } from "./hooks.ts";

const SILENT: readonly Injection[] = [];

const NO_TOOLS: readonly ToolDef[] = [];

const NO_EVENTS: readonly HookEvent[] = [];

function whatItRuns(entry: string, command: string): string {
  return command.slice(entry.length).trim();
}

function changesIn(entry: string, wanted: readonly HookSpec[], outcome: Wired): readonly string[] {
  const lines: string[] = [];
  for (const one of outcome.moved) {
    lines.push(`  ${one.event} \`${whatItRuns(entry, one.command)}\` now runs for ${one.now}, where it ran for ${one.was}`);
  }
  for (const spec of wanted) {
    if (!outcome.added.includes(spec.command)) continue;
    lines.push(`  ${spec.event} \`${whatItRuns(entry, spec.command)}\` was missing, and now runs for ${matcherText(spec.matcher)}`);
  }
  for (const older of outcome.rewired) lines.push(`  an older form of one was replaced: ${older}`);
  for (const command of outcome.folded) {
    lines.push(`  \`${whatItRuns(entry, command)}\` was written more than once, and is now written once`);
  }
  return lines;
}

function keptAt(backup: Backup): string {
  return backup.kind === "kept" ? `; the file as it was is kept at ${backup.path}` : "";
}

export class Wiring implements Capability {
  readonly name = "wiring";

  inject(context: InjectContext): readonly Injection[] {
    if (context.turn.session.kind === "unknown") return SILENT;
    const path = join(context.root, SETTINGS_PATH);
    try {
      const existing = readExisting(path);
      const started = startedIn(existing, looperHooksStartedBy(LOOPER_COMMAND));
      if (started.kind === "not-here") return SILENT;
      const wanted = looperHooksStartedBy(started.entry);
      const outcome = mergeSettings(existing, wanted);
      if (outcome.kind === "unchanged") return SILENT;
      const written = writeKeepingPrior(path, outcome.text);
      return [
        {
          source: this.name,
          priority: WIRING_PRIORITY,
          required: false,
          notice: true,
          summary: `looper's own hook entries in ${SETTINGS_PATH} were brought up to date`,
          text: [
            `looper: its own hook entries in ${SETTINGS_PATH} were older than this looper, and were brought up to date:`,
            ...changesIn(started.entry, wanted, outcome),
            `Nothing that is not looper's was touched${keptAt(written.backup)}. A session reads its hooks when it starts, so this one keeps the old ones until it is restarted.`,
          ].join("\n"),
        },
      ];
    } catch (cause) {
      return [
        {
          source: this.name,
          priority: WIRING_PRIORITY,
          required: false,
          notice: true,
          text: `looper: its own hook entries in ${SETTINGS_PATH} could not be checked (${reasonFrom(cause)}), so they may be older than this looper and nobody would know.`,
        },
      ];
    }
  }

  hooks(): readonly HookEvent[] {
    return NO_EVENTS;
  }

  onHook(): Outcome {
    return { kind: "pass" };
  }

  tools(): readonly ToolDef[] {
    return NO_TOOLS;
  }

  call(request: ToolCall): ToolResult {
    return { kind: "unknown-tool", asked: request.tool };
  }
}
