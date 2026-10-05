import { WRITING, type Change } from "./placed.ts";
import type { Reached } from "./stream.ts";

export type Fingerprint = {
  readonly shape: string;
  readonly times: number;
  readonly minutes: number;
  readonly means: string;
};

const A_WINDOW_MINUTES = 40;

const REPEATED_ENOUGH = 4;

const A_LONG_READ_RUN = 8;

const RE_READING_AT_MOST = 2;

const MINUTE = 60 * 1000;

function within(reached: readonly Reached[], now: number): readonly Reached[] {
  return reached.filter((one) => now - one.at <= A_WINDOW_MINUTES * MINUTE);
}

function spanOf(held: readonly Reached[]): number {
  if (held.length < 2) return 0;
  const first = held[0];
  const last = held[held.length - 1];
  if (first === undefined || last === undefined) return 0;
  return Math.max(1, Math.round((last.at - first.at) / MINUTE));
}

function byPrint(held: readonly Reached[], counted: (one: Reached) => boolean): ReadonlyMap<string, readonly Reached[]> {
  const grouped = new Map<string, Reached[]>();
  for (const one of held) {
    if (!counted(one)) continue;
    const kept = grouped.get(one.print);
    if (kept === undefined) grouped.set(one.print, [one]);
    else kept.push(one);
  }
  return grouped;
}

function repeatedShapes(held: readonly Reached[], tool: string, means: string): readonly Fingerprint[] {
  const found: Fingerprint[] = [];
  for (const ones of byPrint(held, (one) => one.tool === tool).values()) {
    const earliest = ones[0];
    if (earliest === undefined || ones.length < REPEATED_ENOUGH) continue;
    found.push({ shape: earliest.shape, times: ones.length, minutes: spanOf(ones), means });
  }
  return found;
}

function readAgainUnwritten(held: readonly Reached[]): readonly Fingerprint[] {
  const running = new Map<string, readonly Reached[]>();
  const longest = new Map<string, readonly Reached[]>();
  for (const one of held) {
    if (WRITING.includes(one.tool)) {
      running.delete(one.print);
      continue;
    }
    if (one.tool !== "Read") continue;
    const before = running.get(one.print);
    const run = before === undefined ? [one] : [...before, one];
    running.set(one.print, run);
    const best = longest.get(one.print);
    if (best === undefined || run.length > best.length) longest.set(one.print, run);
  }
  const found: Fingerprint[] = [];
  for (const run of longest.values()) {
    const earliest = run[0];
    if (earliest === undefined || run.length < REPEATED_ENOUGH) continue;
    found.push({ shape: earliest.shape, times: run.length, minutes: spanOf(run), means: "a dump where a view was needed" });
  }
  return found;
}

function longReadRun(held: readonly Reached[]): readonly Fingerprint[] {
  let run: Reached[] = [];
  let longest: Reached[] = [];
  for (const one of held) {
    if (WRITING.includes(one.tool)) {
      if (run.length > longest.length) longest = run;
      run = [];
      continue;
    }
    run.push(one);
  }
  if (run.length > longest.length) longest = run;
  if (longest.length < A_LONG_READ_RUN) return [];
  const targets = new Set(longest.map((one) => one.print));
  if (targets.size > RE_READING_AT_MOST) return [];
  return [
    {
      shape: `${longest.length} reads of the same ${targets.size} thing(s) with no write between them`,
      times: longest.length,
      minutes: spanOf(longest),
      means: "re-reading instead of acting on what was read",
    },
  ];
}

const REWRITTEN_WITHIN_MINUTES = 5;

type Written = { readonly from: number; readonly to: number; readonly by: Reached };

type Chain = { readonly kind: "broken" } | { readonly kind: "at"; readonly after: string };

function touches(span: Written, change: Change): boolean {
  const end = change.at + change.removed;
  if (span.from === span.to) {
    if (change.removed === 0) return change.at === span.from;
    return change.at < span.from && span.from < end;
  }
  if (change.removed === 0) return span.from < change.at && change.at < span.to;
  return change.at < span.to && span.from < end;
}

function carried(span: Written, change: Change): readonly Written[] {
  const end = change.at + change.removed;
  const shift = change.added - change.removed;
  if (!touches(span, change)) {
    if (span.to <= change.at) return [span];
    return [{ from: span.from + shift, to: span.to + shift, by: span.by }];
  }
  const kept: Written[] = [];
  if (span.from < change.at) kept.push({ from: span.from, to: Math.min(span.to, change.at), by: span.by });
  if (span.to > end) kept.push({ from: Math.max(span.from, end) + shift, to: span.to + shift, by: span.by });
  return kept;
}

function rewritesIn(writes: readonly Reached[]): ReadonlySet<Reached> {
  const involved = new Set<Reached>();
  let chain: Chain = { kind: "broken" };
  let written: readonly Written[] = [];
  for (const write of writes) {
    const placed = write.placed;
    if (placed.kind !== "placed") {
      chain = { kind: "broken" };
      written = [];
      continue;
    }
    if (chain.kind === "broken" || chain.after !== placed.before) written = [];
    written = written.filter((span) => write.at - span.by.at <= REWRITTEN_WITHIN_MINUTES * MINUTE);
    for (const change of placed.changes) {
      for (const span of written) {
        if (span.by === write || !touches(span, change)) continue;
        involved.add(span.by);
        involved.add(write);
      }
      written = [
        ...written.flatMap((span) => carried(span, change)),
        { from: change.at, to: change.at + change.added, by: write },
      ];
    }
    chain = { kind: "at", after: placed.after };
  }
  return involved;
}

function rewrittenSoon(held: readonly Reached[]): readonly Fingerprint[] {
  const found: Fingerprint[] = [];
  for (const writes of byPrint(held, (one) => WRITING.includes(one.tool)).values()) {
    const involved = [...rewritesIn(writes)].sort((one, other) => one.at - other.at);
    const earliest = involved[0];
    if (earliest === undefined) continue;
    found.push({
      shape: earliest.shape,
      times: involved.length,
      minutes: spanOf(involved),
      means: "acting on a guess, because looking was too expensive",
    });
  }
  return found;
}

export function stallsIn(reached: readonly Reached[], now: number): readonly Fingerprint[] {
  const held = within(reached, now);
  return [
    ...repeatedShapes(held, "Bash", "no single call answers the question"),
    ...readAgainUnwritten(held),
    ...rewrittenSoon(held),
    ...longReadRun(held),
  ];
}

export type Metric = {
  readonly writes: number;
  readonly reaches: number;
  readonly stalls: readonly Fingerprint[];
};

export function metricOf(reached: readonly Reached[], now: number): Metric {
  const held = within(reached, now);
  let writes = 0;
  for (const one of held) {
    if (WRITING.includes(one.tool)) writes += 1;
  }
  return { writes, reaches: held.length, stalls: stallsIn(reached, now) };
}
