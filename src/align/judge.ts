import { NEAR_MISS_PX, SAME_LINE_PX } from "../config.ts";
import type { Frame, Mark } from "../frame/frame.ts";
import { linesOf, onAxis, type Axis, type Line } from "./lines.ts";

export type Miss = { readonly at: number; readonly by: number; readonly sharedWith: string };

export type Alone = {
  readonly mark: string;
  readonly axis: Axis;
  readonly at: number;
  readonly from: string;
  readonly miss: Miss | null;
  readonly mutual: boolean;
};

export type Verdict = {
  readonly page: string;
  readonly state: string;
  readonly captured: string;
  readonly marks: number;
  readonly lines: number;
  readonly columns: number;
  readonly alone: readonly Alone[];
};

export type Unmoved = {
  readonly at: string;
  readonly kind: string;
  readonly seen: readonly string[];
};

export function sortedByPlace(lines: readonly Line[]): readonly Line[] {
  return [...lines].sort((one, two) => (one.at === two.at ? one.mark - two.mark : one.at - two.at));
}

function firstFrom(sorted: readonly Line[], at: number): number {
  let low = 0;
  let high = sorted.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    const line = sorted[middle];
    if (line === undefined) return low;
    if (line.at < at) low = middle + 1;
    else high = middle;
  }
  return low;
}

export function neighbours(
  sorted: readonly Line[],
  at: number,
  within: number,
): readonly Line[] {
  const found: Line[] = [];
  for (let index = firstFrom(sorted, at - within); index < sorted.length; index += 1) {
    const line = sorted[index];
    if (line === undefined) break;
    if (line.at > at + within) break;
    found.push(line);
  }
  return found;
}

export function marksOn(sorted: readonly Line[], at: number, within: number): readonly number[] {
  const held: number[] = [];
  for (const line of neighbours(sorted, at, within)) {
    if (!held.includes(line.mark)) held.push(line.mark);
  }
  return held;
}

export function placesIn(sorted: readonly Line[], within: number): number {
  let counted = 0;
  for (let index = 0; index < sorted.length; index += 1) {
    const line = sorted[index];
    const before = sorted[index - 1];
    if (line === undefined) continue;
    if (before !== undefined && line.at - before.at <= within) continue;
    counted += 1;
  }
  return counted;
}

function nameOf(marks: readonly Mark[], index: number): string {
  const mark = marks[index];
  return mark === undefined ? "an unnamed mark" : mark.at;
}

function connected(sorted: readonly Line[], line: Line, tolerance: number): boolean {
  return neighbours(sorted, line.at, tolerance).some((other) => other.mark !== line.mark);
}

function nearestMiss(
  sorted: readonly Line[],
  marks: readonly Mark[],
  line: Line,
  tolerance: number,
  window: number,
): Miss | null {
  let best: Line | null = null;
  for (const other of neighbours(sorted, line.at, window)) {
    if (other.mark === line.mark) continue;
    const gap = Math.abs(other.at - line.at);
    if (gap <= tolerance) continue;
    if (best !== null && Math.abs(best.at - line.at) <= gap) continue;
    best = other;
  }
  if (best === null) return null;
  return {
    at: best.at,
    by: Math.round(Math.abs(best.at - line.at) * 1000) / 1000,
    sharedWith: nameOf(marks, best.mark),
  };
}

function worthReporting(mine: readonly Line[], axis: Axis): readonly Line[] {
  if (axis === "across") {
    const standing = mine.filter((line) => line.kind === "baseline");
    return standing.length > 0 ? standing : mine;
  }
  const bounds = mine.filter((line) => line.kind === "ink");
  if (bounds.length === 0) return mine;
  let start = bounds[0];
  for (const line of bounds) {
    if (start === undefined || line.at < start.at) start = line;
  }
  return start === undefined ? mine : [start];
}

function inkAlone(
  sorted: readonly Line[],
  marks: readonly Mark[],
  mine: readonly Line[],
  tolerance: number,
  window: number,
): Alone | null {
  for (const line of mine) {
    if (connected(sorted, line, tolerance)) return null;
  }
  let best: Alone | null = null;
  const axis = mine[0];
  if (axis === undefined) return null;
  for (const line of worthReporting(mine, axis.axis)) {
    const miss = nearestMiss(sorted, marks, line, tolerance, window);
    const alone: Alone = {
      mark: nameOf(marks, line.mark),
      axis: line.axis,
      at: line.at,
      from: line.from,
      miss,
      mutual: false,
    };
    if (best === null) {
      best = alone;
      continue;
    }
    if (miss === null) continue;
    if (best.miss === null || miss.by < best.miss.by) best = alone;
  }
  return best;
}

function byMark(lines: readonly Line[], count: number): readonly (readonly Line[])[] {
  const held: Line[][] = [];
  for (let index = 0; index < count; index += 1) held.push([]);
  for (const line of lines) {
    const bucket = held[line.mark];
    if (bucket !== undefined) bucket.push(line);
  }
  return held;
}

function pointsBack(here: Alone, there: Alone, tolerance: number): boolean {
  if (here.miss === null || there.miss === null) return false;
  if (here.axis !== there.axis) return false;
  if (Math.abs(there.at - here.miss.at) > tolerance) return false;
  return Math.abs(here.at - there.miss.at) <= tolerance;
}

function collapsed(alone: readonly Alone[], tolerance: number): readonly Alone[] {
  const dropped = new Set<number>();
  const paired = new Set<number>();
  for (let one = 0; one < alone.length; one += 1) {
    if (dropped.has(one)) continue;
    const here = alone[one];
    if (here === undefined) continue;
    for (let two = one + 1; two < alone.length; two += 1) {
      if (dropped.has(two)) continue;
      const there = alone[two];
      if (there === undefined) continue;
      if (!pointsBack(here, there, tolerance)) continue;
      dropped.add(two);
      paired.add(one);
    }
  }
  const found: Alone[] = [];
  for (let index = 0; index < alone.length; index += 1) {
    if (dropped.has(index)) continue;
    const held = alone[index];
    if (held === undefined) continue;
    found.push(paired.has(index) ? { ...held, mutual: true } : held);
  }
  return found;
}

export function judgeFrame(frame: Frame): Verdict {
  const lines = linesOf(frame.marks);
  const alone: Alone[] = [];
  let columns = 0;

  for (const axis of ["down", "across"] as const) {
    const here = onAxis(lines, axis);
    const sorted = sortedByPlace(here);
    columns += placesIn(sorted, SAME_LINE_PX);
    const mine = byMark(here, frame.marks.length);

    for (let index = 0; index < frame.marks.length; index += 1) {
      const held = mine[index];
      if (held === undefined) continue;
      const ink: Line[] = [];
      for (const line of held) {
        if (line.kind === "inside") continue;
        if (line.kind === "edge") {
          if (connected(sorted, line, SAME_LINE_PX)) continue;
          alone.push({
            mark: nameOf(frame.marks, index),
            axis,
            at: line.at,
            from: line.from,
            miss: nearestMiss(sorted, frame.marks, line, SAME_LINE_PX, NEAR_MISS_PX),
            mutual: false,
          });
          continue;
        }
        ink.push(line);
      }
      if (ink.length === 0) continue;
      const orphan = inkAlone(sorted, frame.marks, ink, SAME_LINE_PX, NEAR_MISS_PX);
      if (orphan !== null) alone.push(orphan);
    }
  }

  return {
    page: frame.page,
    state: frame.state,
    captured: frame.captured,
    marks: frame.marks.length,
    lines: lines.length,
    columns,
    alone: collapsed(alone, SAME_LINE_PX),
  };
}

export function unmoved(frames: readonly Frame[]): readonly Unmoved[] {
  const seen = new Map<string, { kind: string; values: string[] }>();
  for (const frame of frames) {
    for (const one of frame.switches) {
      const key = `${one.kind} ${one.at}`;
      const held = seen.get(key);
      if (held === undefined) {
        seen.set(key, { kind: one.kind, values: [one.value] });
        continue;
      }
      if (!held.values.includes(one.value)) held.values.push(one.value);
    }
  }
  const found: Unmoved[] = [];
  for (const [key, held] of seen) {
    if (held.values.length > 1) continue;
    found.push({ at: key.slice(held.kind.length + 1), kind: held.kind, seen: held.values });
  }
  return found;
}
