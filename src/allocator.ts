import { HOOK_OUTPUT_CEILING, HOOK_PREVIEW_CHARS, INJECTION_SEPARATOR } from "./config.ts";
import type { Capability, InjectContext, Injection } from "./capability.ts";
import { NotOursToFix } from "./errors.ts";
import { reasonFrom } from "./fields.ts";
import { couldNotSpeak } from "./report/say.ts";
import { heardBefore, noteSaid } from "./said.ts";

export type Weighed = {
  readonly source: string;
  readonly chars: number;
  readonly notice: boolean;
  readonly summary?: string;
};

export type Allocation = {
  readonly text: string;
  readonly contributors: readonly string[];
  readonly weighed: readonly Weighed[];
  readonly dropped: readonly Weighed[];
  readonly overflowed: boolean;
  readonly chars: number;
};

export type Complaint = {
  readonly capability: string;
  readonly detail: string;
  readonly ours: boolean;
};

export type AllocationRun = {
  readonly allocation: Allocation;
  readonly complaints: readonly Complaint[];
};

function gather(
  capabilities: readonly Capability[],
  context: InjectContext,
): { injections: Injection[]; complaints: Complaint[] } {
  const injections: Injection[] = [];
  const complaints: Complaint[] = [];
  for (const capability of capabilities) {
    try {
      injections.push(...capability.inject(context));
    } catch (cause) {
      const detail = reasonFrom(cause);
      complaints.push({ capability: capability.name, detail, ours: !(cause instanceof NotOursToFix) });
    }
  }
  return { injections, complaints };
}

function byPriority(left: Injection, right: Injection): number {
  return left.priority - right.priority;
}

function droppedMarker(dropped: readonly Weighed[]): string {
  const named = dropped
    .map((one) => {
      const said = one.summary === undefined ? "" : `: ${one.summary}`;
      return `\n  ${one.source} (${one.chars} chars)${said}`;
    })
    .join("");
  return `[looper: ${dropped.length} contribution(s) dropped for budget. Each is listed with what it holds, so this is an index and not a silence: pull the one your work touches by name with the doctrine tool, and run looper law for the outstanding-work count.${named}\n]`;
}

function overBudgetMarker(chars: number, budget: number): string {
  return [
    `[looper: the rules for what you are touching came to ${chars} characters and the`,
    `budget is ${budget}. Every one of them is below anyway, because a rule that never`,
    `arrived reads exactly like a rule that was followed. Nothing was silently cut.]`,
  ].join(" ");
}

function clampedMarker(cut: number): string {
  return [
    `[looper: ${cut} characters were cut here to stay under the ${HOOK_OUTPUT_CEILING}-character`,
    `ceiling the hook itself has. Past that ceiling nothing arrives at all but a`,
    `${HOOK_PREVIEW_CHARS}-character preview and a path to a file, so a cut that is stated keeps`,
    `far more than one that is not. Ask the doctrine tool for a rule set by name.]`,
  ].join(" ");
}

function clamp(text: string): string {
  if (text.length <= HOOK_OUTPUT_CEILING) return text;
  const widest = clampedMarker(text.length).length;
  const room = HOOK_OUTPUT_CEILING - widest - INJECTION_SEPARATOR.length;
  if (room <= 0) return clampedMarker(text.length).slice(0, HOOK_OUTPUT_CEILING);
  const kept = text.slice(0, room);
  return [kept, clampedMarker(text.length - kept.length)].join(INJECTION_SEPARATOR);
}

export function allocate(
  capabilities: readonly Capability[],
  context: InjectContext,
): AllocationRun {
  const { injections, complaints } = gather(capabilities, context);
  const ordered = [...injections].sort(byPriority);

  const parts: string[] = [];
  const contributors: string[] = [];
  const weighed: Weighed[] = [];
  const dropped: Weighed[] = [];
  const waiting = new Set<string>();
  let used = 0;

  const take = (injection: Injection): void => {
    const width = injection.text.length;
    const separator = parts.length === 0 ? 0 : INJECTION_SEPARATOR.length;
    parts.push(injection.text);
    contributors.push(injection.source);
    weighed.push({
      source: injection.source,
      chars: width,
      notice: injection.notice,
      summary: injection.summary,
    });
    used += separator + width;
  };

  for (const injection of ordered) {
    if (injection.notice && heardBefore(context.said, injection.source, injection.text)) continue;
    if (injection.required) {
      take(injection);
      continue;
    }
    const separator = parts.length === 0 ? 0 : INJECTION_SEPARATOR.length;
    if (used + separator + injection.text.length <= context.budget) {
      take(injection);
      if (injection.waits === true) waiting.add(injection.source);
      continue;
    }
    if (injection.waits === true) continue;
    dropped.push({
      source: injection.source,
      chars: injection.text.length,
      notice: injection.notice,
      summary: injection.summary,
    });
  }

  const requiredAlone = used > context.budget;

  while (dropped.length > 0 && parts.length > 1 && !requiredAlone) {
    const projected = used + INJECTION_SEPARATOR.length + droppedMarker(dropped).length;
    if (projected <= context.budget) break;
    const last = parts.pop();
    const name = contributors.pop();
    const held = weighed.pop();
    if (last === undefined || name === undefined || held === undefined) break;
    if (ordered.some((one) => one.source === name && one.required)) {
      parts.push(last);
      contributors.push(name);
      weighed.push(held);
      break;
    }
    used -= last.length + INJECTION_SEPARATOR.length;
    if (!waiting.has(name)) dropped.push(held);
  }

  for (const name of contributors) {
    const spoken = ordered.find((one) => one.source === name && one.notice);
    if (spoken !== undefined) noteSaid(context.said, spoken.source, spoken.text);
  }

  if (dropped.length > 0) parts.push(droppedMarker(dropped));
  if (requiredAlone) parts.push(overBudgetMarker(used, context.budget));

  const spoken = parts.join(INJECTION_SEPARATOR);
  const failed = complaints.map((held) => couldNotSpeak(held.capability, held.detail, held.ours));
  const text = clamp([...(spoken.length === 0 ? [] : [spoken]), ...failed].join(INJECTION_SEPARATOR));
  return {
    allocation: {
      text,
      contributors,
      weighed,
      dropped,
      overflowed: requiredAlone || spoken.length > context.budget,
      chars: text.length,
    },
    complaints,
  };
}
