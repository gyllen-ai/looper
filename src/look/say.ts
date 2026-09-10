import { WORN_SHOWN } from "../config.ts";
import type { Spread } from "./census.ts";
import type { Told } from "./contrast.ts";
import type { Disagreement, Split } from "./kinds.ts";

function firstWearer(worn: Split["most"]): string {
  const held = worn.wearers[0];
  return held === undefined ? "nowhere" : `${held.at} in ${held.frame}`;
}

function wearerKey(worn: Split["most"]): string {
  return worn.wearers.map((one) => `${one.frame}|${one.at}`).sort().join("+");
}

function oddOneOut(one: Disagreement): string | null {
  if (one.splits.length < 4) return null;
  const counts = new Map<string, number>();
  for (const split of one.splits) {
    for (const other of split.others) {
      const key = wearerKey(other);
      const held = counts.get(key);
      counts.set(key, held === undefined ? 1 : held + 1);
    }
  }
  for (const [key, seen] of counts) {
    if (seen * 2 >= one.splits.length) return key;
  }
  return null;
}

function toldOf(split: Split): string {
  const other = split.others[0];
  if (other === undefined) return split.property;
  return `${split.property} ${other.value} against ${split.most.value}`;
}

const TELLING = 4;

function apartLines(one: Disagreement): readonly string[] {
  const said: string[] = [`    ${one.kind}   ${one.wearers} of them, at ${one.width} wide`];
  const odd = oddOneOut(one);
  if (odd !== null) {
    const first = one.splits[0];
    const wearer = first === undefined ? undefined : first.others[0]?.wearers[0];
    said.push(
      `      one of them is a different thing under the same name: it differs on ${one.splits.length} properties`,
    );
    for (const split of one.splits.slice(0, TELLING)) said.push(`        ${toldOf(split)}`);
    if (one.splits.length > TELLING) {
      said.push(`        …and ${one.splits.length - TELLING} more properties`);
    }
    if (wearer !== undefined) said.push(`        ${wearer.at} in ${wearer.frame}`);
    return said;
  }
  for (const split of one.splits.slice(0, TELLING)) {
    said.push(`      ${split.property}: ${split.most.value} on ${split.most.wearers.length}`);
    for (const other of split.others) {
      said.push(
        `        ${" ".repeat(split.property.length)}  ${other.value} on ${other.wearers.length} — ${firstWearer(other)}`,
      );
    }
  }
  if (one.splits.length > TELLING) {
    said.push(`      …and ${one.splits.length - TELLING} more properties`);
  }
  return said;
}

export function disagreementLines(held: readonly Disagreement[]): readonly string[] {
  if (held.length === 0) return [];
  const said: string[] = [
    "",
    `${held.length} thing(s) of one kind that do not wear the same look:`,
  ];
  for (const one of held.slice(0, WORN_SHOWN)) said.push(...apartLines(one));
  if (held.length > WORN_SHOWN) said.push(`    …and ${held.length - WORN_SHOWN} more`);
  said.push("  The one worn by fewer is the one to look at first.");
  return said;
}

export function contrastLines(told: Told): readonly string[] {
  const said: string[] = [];
  if (told.pairings.length > 0) {
    said.push("");
    said.push(
      `${told.faint} of ${told.looked} thing(s) cannot be read against what is behind them, from ${told.pairings.length} colour pair(s):`,
    );
    for (const one of told.pairings.slice(0, WORN_SHOWN)) {
      said.push(
        `    ${one.ratio} where ${one.needs} is needed — ${one.ink} on ${one.ground}, on ${one.on} thing(s):`,
      );
      for (const held of one.examples) {
        said.push(`                 ${held.what} of ${held.at} in ${held.frame}`);
      }
      if (one.on > one.examples.length) {
        said.push(`                 …and ${one.on - one.examples.length} more wearing the same pair`);
      }
    }
    if (told.pairings.length > WORN_SHOWN) {
      said.push(`    …and ${told.pairings.length - WORN_SHOWN} more pairs`);
    }
  }
  if (told.unknowable.length > 0) {
    said.push("");
    said.push(`${told.unknowable.length} thing(s) whose contrast could not be worked out, so they were judged for nothing:`);
    for (const one of told.unknowable.slice(0, WORN_SHOWN)) {
      said.push(`    ${one.at} in ${one.frame} — ${one.why}`);
    }
    if (told.unknowable.length > WORN_SHOWN) {
      said.push(`    …and ${told.unknowable.length - WORN_SHOWN} more`);
    }
  }
  return said;
}

export function censusLines(spread: readonly Spread[]): readonly string[] {
  if (spread.length === 0) return [];
  const said: string[] = ["", "What this project draws with, widest first:"];
  for (const one of spread.slice(0, WORN_SHOWN)) {
    const once = one.onceOnly.length === 0 ? "" : `, ${one.onceOnly.length} used exactly once`;
    said.push(`    ${String(one.values).padStart(4)} ${one.property}${once}`);
    for (const value of one.onceOnly.slice(0, 3)) said.push(`         once: ${value}`);
    if (one.onceOnly.length > 3) said.push(`         …and ${one.onceOnly.length - 3} more used once`);
  }
  if (spread.length > WORN_SHOWN) said.push(`    …and ${spread.length - WORN_SHOWN} more properties`);
  said.push("  A value used once is a decision nobody else followed.");
  return said;
}

export const NOTHING_CAPTURED: readonly string[] = [
  "looper look: no frames captured, so nothing about this project's look is known.",
  "",
  "  Ask the `align` tool for the probe, run it in the page, and hand back what it printed.",
  "  One capture answers both: whether the lines connect, and whether everything of a",
  "  kind wears the same look.",
];
