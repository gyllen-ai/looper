import type { Box, Mark, Side } from "./frame.ts";

export type Axis = "down" | "across";

export type LineKind = "edge" | "inside" | "ink" | "centre" | "baseline";

export type Line = {
  readonly mark: number;
  readonly axis: Axis;
  readonly kind: LineKind;
  readonly at: number;
  readonly from: string;
};

export function axisOf(side: Side): Axis {
  return side === "left" || side === "right" ? "down" : "across";
}

function edgeOf(box: Box, side: Side): number {
  if (side === "left") return box.left;
  if (side === "right") return box.right;
  if (side === "top") return box.top;
  return box.bottom;
}

function inkLines(mark: number, ink: Box, axis: Axis): readonly Line[] {
  const low = axis === "down" ? ink.left : ink.top;
  const high = axis === "down" ? ink.right : ink.bottom;
  const middle = (low + high) / 2;
  const centre: Line = { mark, axis, kind: "centre", at: middle, from: "the middle of what it draws" };
  if (high - low <= 0) return [centre];
  const lowName = axis === "down" ? "the left of what it draws" : "the top of what it draws";
  const highName = axis === "down" ? "the right of what it draws" : "the bottom of what it draws";
  return [
    { mark, axis, kind: "ink", at: low, from: lowName },
    centre,
    { mark, axis, kind: "ink", at: high, from: highName },
  ];
}

export function linesOf(marks: readonly Mark[]): readonly Line[] {
  const found: Line[] = [];
  for (let index = 0; index < marks.length; index += 1) {
    const mark = marks[index];
    if (mark === undefined) continue;
    for (const side of mark.sides) {
      found.push({
        mark: index,
        axis: axisOf(side),
        kind: "edge",
        at: edgeOf(mark.box, side),
        from: `its painted ${side} edge`,
      });
      const inner = mark.inner;
      if (inner === null) continue;
      const inside = edgeOf(inner, side);
      if (inside === edgeOf(mark.box, side)) continue;
      found.push({
        mark: index,
        axis: axisOf(side),
        kind: "inside",
        at: inside,
        from: `the inside of its ${side} border`,
      });
    }
    if (mark.baseline !== null) {
      found.push({
        mark: index,
        axis: "across",
        kind: "baseline",
        at: mark.baseline,
        from: "the baseline its letters stand on",
      });
    }
    const ink = mark.ink;
    if (ink === null) continue;
    found.push(...inkLines(index, ink, "down"));
    found.push(...inkLines(index, ink, "across"));
  }
  return found;
}

export function onAxis(lines: readonly Line[], axis: Axis): readonly Line[] {
  return lines.filter((line) => line.axis === axis);
}
