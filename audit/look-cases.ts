import type { Frame, Mark } from "../src/frame/frame.ts";
import { readFrame } from "../src/frame/frame.ts";

export type Wearing = Readonly<Record<string, string>>;

export const BLACK = "rgb(0, 0, 0)";
export const WHITE = "rgb(255, 255, 255)";
export const NEAR_BLACK = "rgb(10, 10, 10)";
export const DIM_GREY = "rgb(120, 120, 120)";
export const MID_GREY = "rgb(90, 90, 90)";
export const DARK_GREY = "rgb(30, 30, 30)";
export const EDGE_GREY = "rgb(70, 70, 70)";
export const OFF_BLACK = "rgb(10, 10, 10)";
export const WIDE_BLACK = "color(srgb 0 0 0)";
export const WIDE_WHITE = "color(srgb 1 1 1)";
export const STRIPE_ONE = "rgb(0, 0, 0)";
export const STRIPE_TWO = "rgb(10, 10, 10)";
export const ON_TAB = "rgb(255, 255, 255)";
export const OFF_TAB = "rgb(120, 120, 120)";

const NO_BOX = { left: 0, top: 0, right: 10, bottom: 10 };

export function worn(kind: string, wearing: Wearing, top: number): unknown {
  return {
    at: `main > ${kind}`,
    kind,
    look: wearing,
    box: { ...NO_BOX, top, bottom: top + 10 },
    sides: [],
    ink: null,
    inner: null,
    baseline: null,
  };
}

export function painted(kind: string, wearing: Wearing, sides: readonly string[]): unknown {
  return {
    at: `main > ${kind}`,
    kind,
    look: wearing,
    box: NO_BOX,
    sides,
    ink: null,
    inner: null,
    baseline: null,
  };
}

export function frameOf(
  state: string,
  width: number,
  marks: readonly unknown[],
  asShipped: Wearing,
): Frame {
  const held = readFrame(
    JSON.stringify({
      page: "case",
      state,
      captured: new Date().toISOString(),
      width,
      height: 800,
      initial: asShipped,
      marks,
      switches: [],
    }),
  );
  if (held.kind !== "frame") throw new Error(held.why);
  return held.frame;
}

export function marksIn(frame: Frame): readonly Mark[] {
  return frame.marks;
}
