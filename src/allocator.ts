import { HOOK_OUTPUT_CEILING, HOOK_PREVIEW_CHARS, INJECTION_SEPARATOR } from "./config.ts";
import type { Capability, InjectContext, Injection } from "./capability.ts";
import { isOursToFix } from "./errors.ts";
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
  readonly unrecorded: readonly string[];
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
      complaints.push({ capability: capability.name, detail, ours: isOursToFix(cause) });
    }
  }
  return { injections, complaints };
}

function byPriority(left: Injection, right: Injection): number {
  return left.priority - right.priority;
}

const A_RULE_SET = "doctrine:";

const NAMED_AS_DROPPED = "dropped:";

const A_SUMMARY_AT_MOST = 100;

function firstLineOf(text: string): string {
  const [first] = text.trim().split("\n", 1);
  const line = first === undefined ? "" : first.trim();
  return line.length <= A_SUMMARY_AT_MOST ? line : `${line.slice(0, A_SUMMARY_AT_MOST)}…`;
}

function asDropped(injection: Injection): Weighed {
  return {
    source: injection.source,
    chars: injection.text.length,
    notice: injection.notice,
    summary: injection.summary === undefined ? firstLineOf(injection.text) : injection.summary,
  };
}

function howItArrives(one: Weighed): string {
  if (one.source.startsWith(A_RULE_SET)) {
    return `the doctrine tool serves it as ${one.source.slice(A_RULE_SET.length)}`;
  }
  if (one.notice) return "a notice: said on a later turn it fits while it still applies, and named here once";
  return "said again on the next turn it fits";
}

function lineFor(one: Weighed): string {
  const said = one.summary === undefined ? "" : `: ${one.summary}`;
  return `  ${one.source} (${one.chars} chars)${said} — ${howItArrives(one)}`;
}

function droppedMarker(dropped: readonly Weighed[]): string {
  const named = dropped.map((one) => `\n${lineFor(one)}`).join("");
  return `[looper: ${dropped.length} contribution(s) dropped for budget, each named with what it holds and how it arrives, so this is an index and not a silence:${named}\n]`;
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

function clamp(text: string, ceiling: number): string {
  if (text.length <= ceiling) return text;
  const widest = clampedMarker(text.length).length;
  const room = ceiling - widest - INJECTION_SEPARATOR.length;
  if (room <= 0) return clampedMarker(text.length).slice(0, Math.max(ceiling, 0));
  const kept = text.slice(0, room);
  return [kept, clampedMarker(text.length - kept.length)].join(INJECTION_SEPARATOR);
}

function withWhatFailed(spoken: string, failed: string): string {
  if (failed.length === 0) return clamp(spoken, HOOK_OUTPUT_CEILING);
  if (spoken.length === 0) return clamp(failed, HOOK_OUTPUT_CEILING);
  const left = HOOK_OUTPUT_CEILING - failed.length - INJECTION_SEPARATOR.length;
  return clamp([clamp(spoken, left), failed].join(INJECTION_SEPARATOR), HOOK_OUTPUT_CEILING);
}

export function allocate(
  capabilities: readonly Capability[],
  context: InjectContext,
): AllocationRun {
  const { injections, complaints } = gather(capabilities, context);
  const ordered = [...injections].sort(byPriority);
  const failed = complaints.map((held) => couldNotSpeak(held.capability, held.detail, held.ours));
  const owed = failed.reduce((sum, one) => sum + one.length + INJECTION_SEPARATOR.length, 0);
  const room = context.budget - owed;

  const parts: string[] = [];
  const contributors: string[] = [];
  const weighed: Weighed[] = [];
  const taken: Injection[] = [];
  const dropped: Weighed[] = [];
  const droppedNotices: Injection[] = [];
  const waiting = new Set<string>();
  let used = 0;

  const take = (injection: Injection): void => {
    const width = injection.text.length;
    const separator = parts.length === 0 ? 0 : INJECTION_SEPARATOR.length;
    parts.push(injection.text);
    contributors.push(injection.source);
    taken.push(injection);
    weighed.push({
      source: injection.source,
      chars: width,
      notice: injection.notice,
      summary: injection.summary,
    });
    used += separator + width;
  };

  const drop = (injection: Injection): void => {
    dropped.push(asDropped(injection));
    if (injection.notice) droppedNotices.push(injection);
  };

  for (const injection of ordered) {
    if (injection.notice && heardBefore(context.said, injection.source, injection.text)) continue;
    if (injection.required) {
      take(injection);
      continue;
    }
    const waits =
      injection.waits === true ||
      (injection.notice && heardBefore(context.said, `${NAMED_AS_DROPPED}${injection.source}`, injection.text));
    const separator = parts.length === 0 ? 0 : INJECTION_SEPARATOR.length;
    if (used + separator + injection.text.length <= room) {
      take(injection);
      if (waits) waiting.add(injection.source);
      continue;
    }
    if (waits) continue;
    drop(injection);
  }

  const requiredAlone = used > room;

  while (dropped.length > 0 && parts.length > 1 && !requiredAlone) {
    const projected = used + INJECTION_SEPARATOR.length + droppedMarker(dropped).length;
    if (projected <= room) break;
    const last = parts.pop();
    const name = contributors.pop();
    const held = weighed.pop();
    const injection = taken.pop();
    if (last === undefined || name === undefined || held === undefined || injection === undefined) break;
    if (injection.required) {
      parts.push(last);
      contributors.push(name);
      weighed.push(held);
      taken.push(injection);
      break;
    }
    used -= last.length + INJECTION_SEPARATOR.length;
    if (!waiting.has(name)) drop(injection);
  }

  const heard = contributors.flatMap((name) => ordered.filter((one) => one.source === name && one.notice));

  if (dropped.length > 0) parts.push(droppedMarker(dropped));
  if (requiredAlone) parts.push(overBudgetMarker(used, room));

  const spoken = parts.join(INJECTION_SEPARATOR);
  const text = withWhatFailed(spoken, failed.join(INJECTION_SEPARATOR));

  const unrecorded: string[] = [];
  const remember = (source: string, said: string): void => {
    try {
      noteSaid(context.said, source, said);
    } catch (cause) {
      unrecorded.push(reasonFrom(cause));
    }
  };
  for (const notice of heard) {
    if (text.includes(notice.text)) remember(notice.source, notice.text);
  }
  for (const notice of droppedNotices) {
    if (text.includes(lineFor(asDropped(notice)))) remember(`${NAMED_AS_DROPPED}${notice.source}`, notice.text);
  }

  return {
    allocation: {
      text,
      contributors,
      weighed,
      dropped,
      overflowed: requiredAlone || spoken.length > room,
      chars: text.length,
    },
    complaints,
    unrecorded,
  };
}
