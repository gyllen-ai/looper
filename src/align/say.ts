import { ALONE_SHOWN, UNMOVED_SHOWN } from "../config.ts";
import type { Drift } from "./across.ts";
import type { Alone, Unmoved, Verdict } from "./judge.ts";
import type { Stale, Unreadable } from "./store.ts";

function axisLetter(alone: Alone): string {
  return alone.axis === "down" ? "x" : "y";
}

function place(alone: Alone): string {
  return `${axisLetter(alone)} ${alone.at}`.padEnd(12);
}

function nearMisses(verdict: Verdict): readonly Alone[] {
  return verdict.alone.filter((one) => one.miss !== null);
}

function standingAlone(verdict: Verdict): readonly Alone[] {
  return verdict.alone.filter((one) => one.miss === null);
}

function missLines(alone: Alone): readonly string[] {
  const miss = alone.miss;
  if (miss === null) return [];
  const gap = Math.round(miss.by * 100) / 100;
  const other = alone.mutual
    ? `is ${gap} from ${miss.sharedWith}, and neither of them is on a line anything else shares`
    : `is ${gap} from the line at ${miss.at}, which ${miss.sharedWith} is already on`;
  return [`    ${place(alone)} ${other}`, `                 ${alone.mark} — ${alone.from}`];
}

function aloneLines(alone: Alone): readonly string[] {
  return [`    ${place(alone)} ${alone.mark} — ${alone.from}`];
}

export function titleOf(verdict: Verdict): string {
  return `${verdict.page} · ${verdict.state}`;
}

export function summaryOf(verdict: Verdict): string {
  const counted =
    verdict.alone.length === 0
      ? "every line connects"
      : `${verdict.alone.length} line(s) connect to nothing`;
  const facts = `${verdict.marks} marks, ${verdict.lines} lines, ${verdict.columns} columns`;
  return `  ${titleOf(verdict).padEnd(34)}${facts.padEnd(40)}${counted}`;
}

export function detailOf(verdict: Verdict): readonly string[] {
  if (verdict.alone.length === 0) return [];
  const near = nearMisses(verdict);
  const solo = standingAlone(verdict);
  const said: string[] = ["", titleOf(verdict)];
  if (near.length > 0) {
    said.push(`  ${near.length} near miss(es) — a line trying to align and failing:`);
    for (const one of near.slice(0, ALONE_SHOWN)) said.push(...missLines(one));
    if (near.length > ALONE_SHOWN) said.push(`    …and ${near.length - ALONE_SHOWN} more`);
  }
  if (solo.length > 0) {
    said.push(`  ${solo.length} standing alone — nothing else on the page shares this line:`);
    for (const one of solo.slice(0, ALONE_SHOWN)) said.push(...aloneLines(one));
    if (solo.length > ALONE_SHOWN) said.push(`    …and ${solo.length - ALONE_SHOWN} more`);
  }
  return said;
}

export function driftLines(drift: readonly Drift[]): readonly string[] {
  if (drift.length === 0) return [];
  return [
    "",
    `${drift.length} thing(s) that stand in one place on one page and somewhere else on another of the same width:`,
    ...drift.flatMap((one) => [
      `    x ${one.here.at} in ${one.here.frame}, x ${one.there.at} in ${one.there.frame} — ${one.by} apart${one.edges > 1 ? `, on ${one.edges} of its own lines` : ""}`,
      `                 ${one.key}`,
    ]),
    `  One of the two is wrong. A column a person learns on one page is a column they expect on the next.`,
  ];
}

export function unmovedLines(held: readonly Unmoved[]): readonly string[] {
  if (held.length === 0) return [];
  return [
    "",
    `${held.length} control(s) declare a state and were only ever captured in one of them, so half of what they draw was never judged:`,
    ...held.slice(0, UNMOVED_SHOWN).map((one) => `    ${one.kind.padEnd(16)}${one.at} (always ${JSON.stringify(one.seen[0])})`),
    ...(held.length > UNMOVED_SHOWN ? [`    …and ${held.length - UNMOVED_SHOWN} more`] : []),
    `  Move each one and capture the frame again.`,
  ];
}

export function staleLines(stale: readonly Stale[]): readonly string[] {
  if (stale.length === 0) return [];
  return [
    "",
    `${stale.length} frame(s) were captured before the last change to what this project draws, so they answer for code that is gone:`,
    ...stale.map((one) => `    ${one.frame.page} · ${one.frame.state} — captured ${one.frame.captured}, ${one.file} changed after it`),
    `  Capture them again. A green verdict from before the edit is worse than no verdict.`,
  ];
}

export function unreadableLines(held: readonly Unreadable[]): readonly string[] {
  if (held.length === 0) return [];
  return [
    "",
    `${held.length} frame file(s) could not be read, and were judged for nothing:`,
    ...held.map((one) => `    ${one.path} — ${one.why}`),
  ];
}

export const NOTHING_CAPTURED: readonly string[] = [
  "looper align: no frames captured, so nothing about this project's alignment is known.",
  "",
  "  Ask the `align` tool for the probe, run it in the page, and hand back what it printed.",
  "  Nothing about a screen is judged here until somebody does that.",
];
