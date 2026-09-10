import { DRIFT_PX, SAME_LINE_PX } from "../config.ts";
import type { Frame } from "../frame/frame.ts";
import { linesOf, onAxis, type Line } from "./lines.ts";

export type Stand = {
  readonly frame: string;
  readonly at: number;
  readonly marks: number;
};

export type Drift = {
  readonly key: string;
  readonly here: Stand;
  readonly there: Stand;
  readonly by: number;
  readonly edges: number;
};

type Placed = ReadonlyMap<string, readonly number[]>;

type Seen = {
  readonly name: string;
  readonly width: number;
  readonly placed: Placed;
  readonly crowd: ReadonlyMap<string, number>;
};

function keyOf(frame: Frame, line: Line): string | null {
  const mark = frame.marks[line.mark];
  if (mark === undefined) return null;
  return `${mark.at} — ${line.from}`;
}

function seenIn(frame: Frame): Seen {
  const placed = new Map<string, number[]>();
  const crowd = new Map<string, number>();
  const lines = onAxis(linesOf(frame.marks), "down");
  for (const line of lines) {
    const key = keyOf(frame, line);
    if (key === null) continue;
    const held = placed.get(key);
    if (held === undefined) {
      placed.set(key, [line.at]);
      continue;
    }
    if (!held.some((at) => Math.abs(at - line.at) <= SAME_LINE_PX)) held.push(line.at);
  }
  for (const line of lines) {
    const at = `${Math.round(line.at * 2)}`;
    const held = crowd.get(at);
    crowd.set(at, held === undefined ? 1 : held + 1);
  }
  return { name: `${frame.page} · ${frame.state}`, width: frame.width, placed, crowd };
}

function crowdAt(seen: Seen, at: number): number {
  const held = seen.crowd.get(`${Math.round(at * 2)}`);
  return held === undefined ? 1 : held;
}

function nearestIn(theirs: readonly number[], at: number): number | null {
  let best: number | null = null;
  for (const there of theirs) {
    const gap = Math.abs(there - at);
    if (gap > DRIFT_PX || gap <= SAME_LINE_PX) continue;
    if (best !== null && Math.abs(best - at) <= gap) continue;
    best = there;
  }
  return best;
}

function stoodElsewhere(here: Seen, there: Seen, key: string, mine: readonly number[]): readonly Drift[] {
  const theirs = there.placed.get(key);
  if (theirs === undefined) return [];
  const found: Drift[] = [];
  for (const at of mine) {
    if (theirs.some((other) => Math.abs(other - at) <= SAME_LINE_PX)) continue;
    const moved = nearestIn(theirs, at);
    if (moved === null) continue;
    found.push({
      key,
      here: { frame: here.name, at, marks: crowdAt(here, at) },
      there: { frame: there.name, at: moved, marks: crowdAt(there, moved) },
      by: Math.round(Math.abs(moved - at) * 100) / 100,
      edges: 1,
    });
  }
  return oncePerMark(found);
}

function markIn(key: string): string {
  const cut = key.indexOf(" \u2014 ");
  return cut === -1 ? key : key.slice(0, cut);
}

function oncePerMark(found: readonly Drift[]): readonly Drift[] {
  const kept = new Map<string, Drift>();
  const order: string[] = [];
  for (const drift of found) {
    const key = `${markIn(drift.key)}|${drift.by}|${drift.here.frame}|${drift.there.frame}`;
    const held = kept.get(key);
    if (held === undefined) {
      kept.set(key, drift);
      order.push(key);
      continue;
    }
    kept.set(key, { ...held, edges: held.edges + 1 });
  }
  const out: Drift[] = [];
  for (const key of order) {
    const held = kept.get(key);
    if (held !== undefined) out.push(held);
  }
  return out;
}

export function driftAcross(frames: readonly Frame[]): readonly Drift[] {
  const seen = frames.map(seenIn);
  const found: Drift[] = [];
  const said = new Set<string>();

  for (let one = 0; one < seen.length; one += 1) {
    for (let two = one + 1; two < seen.length; two += 1) {
      const here = seen[one];
      const there = seen[two];
      if (here === undefined || there === undefined) continue;
      if (here.width !== there.width) continue;
      for (const [key, mine] of here.placed) {
        for (const drift of stoodElsewhere(here, there, key, mine)) {
          const mark = `${key} ${drift.here.at} ${drift.there.at}`;
          if (said.has(mark)) continue;
          said.add(mark);
          found.push(drift);
        }
      }
    }
  }
  return oncePerMark(found);
}
