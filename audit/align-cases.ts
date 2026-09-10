import type { Box, Mark } from "../src/align/frame.ts";

export function box(left: number, top: number, right: number, bottom: number): Box {
  return { left, top, right, bottom };
}

export function ghost(at: string, held: Box): Mark {
  return { at, box: held, sides: [], ink: null, inner: null, baseline: null };
}

export function painted(at: string, held: Box): Mark {
  return {
    at,
    box: held,
    sides: ["left", "top", "right", "bottom"],
    ink: null,
    inner: null,
    baseline: null,
  };
}

export function bordered(at: string, held: Box, width: number): Mark {
  return {
    at,
    box: held,
    sides: ["left", "top", "right", "bottom"],
    ink: null,
    inner: box(
      held.left + width,
      held.top + width,
      held.right - width,
      held.bottom - width,
    ),
    baseline: null,
  };
}

export function drawn(at: string, held: Box, ink: Box): Mark {
  return { at, box: held, sides: [], ink, inner: null, baseline: null };
}

export function lettered(at: string, held: Box, ink: Box, baseline: number): Mark {
  return { at, box: held, sides: [], ink, inner: null, baseline };
}

export function frameOf(marks: readonly Mark[]): string {
  return JSON.stringify({
    page: "case",
    state: "default",
    captured: new Date().toISOString(),
    width: 1000,
    height: 800,
    marks,
    switches: [],
  });
}
