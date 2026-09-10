import { fieldAt } from "../fields.ts";

export type Side = "left" | "right" | "top" | "bottom";

export const SIDES: readonly Side[] = ["left", "top", "right", "bottom"];

export type Box = {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
};

export type Mark = {
  readonly at: string;
  readonly box: Box;
  readonly sides: readonly Side[];
  readonly ink: Box | null;
  readonly inner: Box | null;
  readonly baseline: number | null;
};

export type Switch = {
  readonly at: string;
  readonly kind: string;
  readonly value: string;
};

export type Frame = {
  readonly page: string;
  readonly state: string;
  readonly captured: string;
  readonly width: number;
  readonly height: number;
  readonly marks: readonly Mark[];
  readonly switches: readonly Switch[];
};

export type Reading =
  | { readonly kind: "frame"; readonly frame: Frame }
  | { readonly kind: "unreadable"; readonly why: string };

const A_LABEL = /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,79}$/;

function numberAt(held: unknown, key: string, where: string): number | string {
  const value = fieldAt(held, key);
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return `${where} has no finite "${key}"`;
  }
  return value;
}

function stringAt(held: unknown, key: string, where: string): string {
  const value = fieldAt(held, key);
  if (typeof value !== "string" || value.length === 0) {
    return `${where} has no "${key}"`;
  }
  return "";
}

function textIn(held: unknown, key: string): string {
  const value = fieldAt(held, key);
  return typeof value === "string" ? value : "";
}

function boxAt(held: unknown, key: string, where: string): Box | string {
  const raw = fieldAt(held, key);
  if (raw === null || typeof raw !== "object") return `${where} has no "${key}" box`;
  const edges: number[] = [];
  for (const side of SIDES) {
    const value = numberAt(raw, side, `${where} "${key}"`);
    if (typeof value === "string") return value;
    edges.push(value);
  }
  const [left, top, right, bottom] = edges;
  if (left === undefined || top === undefined || right === undefined || bottom === undefined) {
    return `${where} "${key}" lost an edge on the way in`;
  }
  if (right < left || bottom < top) return `${where} "${key}" is inside out`;
  return { left, top, right, bottom };
}

function sidesAt(held: unknown, where: string): readonly Side[] | string {
  const raw = fieldAt(held, "sides");
  if (!Array.isArray(raw)) return `${where} has no "sides" list, and an absent list is not an empty one`;
  const found: Side[] = [];
  for (const one of raw) {
    if (one !== "left" && one !== "right" && one !== "top" && one !== "bottom") {
      return `${where} lists a side called ${JSON.stringify(one)}`;
    }
    if (!found.includes(one)) found.push(one);
  }
  return found;
}

function markAt(raw: unknown, index: number): Mark | string {
  const where = `mark ${index}`;
  const missing = stringAt(raw, "at", where);
  if (missing.length > 0) return missing;
  const box = boxAt(raw, "box", where);
  if (typeof box === "string") return box;
  const sides = sidesAt(raw, where);
  if (typeof sides === "string") return sides;
  const rawInner = fieldAt(raw, "inner");
  if (rawInner === undefined) {
    return `${where} does not say what is inside its border; say null if it paints none`;
  }
  let inner: Box | null = null;
  if (rawInner !== null) {
    const held = boxAt(raw, "inner", where);
    if (typeof held === "string") return held;
    inner = held;
  }
  const rawBase = fieldAt(raw, "baseline");
  if (rawBase === undefined) {
    return `${where} does not say whether it sits on a baseline; say null if it draws no text`;
  }
  if (rawBase !== null && (typeof rawBase !== "number" || !Number.isFinite(rawBase))) {
    return `${where} has a baseline that is not a number`;
  }
  const baseline = rawBase === null ? null : rawBase;
  const rawInk = fieldAt(raw, "ink");
  if (rawInk === undefined) return `${where} does not say whether it draws ink; say null if it draws none`;
  if (rawInk === null) return { at: textIn(raw, "at"), box, sides, ink: null, inner, baseline };
  const ink = boxAt(raw, "ink", where);
  if (typeof ink === "string") return ink;
  return { at: textIn(raw, "at"), box, sides, ink, inner, baseline };
}

function switchAt(raw: unknown, index: number): Switch | string {
  const where = `switch ${index}`;
  for (const key of ["at", "kind", "value"]) {
    const missing = stringAt(raw, key, where);
    if (missing.length > 0) return missing;
  }
  return { at: textIn(raw, "at"), kind: textIn(raw, "kind"), value: textIn(raw, "value") };
}

function labelAt(raw: unknown, key: string): string | undefined {
  const value = fieldAt(raw, key);
  if (typeof value !== "string" || !A_LABEL.test(value)) return undefined;
  return value;
}

export function readFrame(source: string): Reading {
  let raw: unknown;
  try {
    raw = JSON.parse(source);
  } catch (cause) {
    const why = cause instanceof Error ? cause.message : String(cause);
    return { kind: "unreadable", why: `that is not JSON (${why})` };
  }
  if (raw === null || typeof raw !== "object") {
    return { kind: "unreadable", why: "a frame is an object, and that is not one" };
  }

  const page = labelAt(raw, "page");
  const state = labelAt(raw, "state");
  if (page === undefined) return { kind: "unreadable", why: `the frame has no "page" name` };
  if (state === undefined) return { kind: "unreadable", why: `the frame has no "state" name` };

  const captured = fieldAt(raw, "captured");
  if (typeof captured !== "string" || Number.isNaN(Date.parse(captured))) {
    return { kind: "unreadable", why: `the frame has no "captured" time looper can read` };
  }

  const width = numberAt(raw, "width", "the frame");
  if (typeof width === "string") return { kind: "unreadable", why: width };
  const height = numberAt(raw, "height", "the frame");
  if (typeof height === "string") return { kind: "unreadable", why: height };

  const rawMarks = fieldAt(raw, "marks");
  if (!Array.isArray(rawMarks)) return { kind: "unreadable", why: `the frame has no "marks" list` };
  const marks: Mark[] = [];
  for (let index = 0; index < rawMarks.length; index += 1) {
    const held = markAt(rawMarks[index], index);
    if (typeof held === "string") return { kind: "unreadable", why: held };
    marks.push(held);
  }

  const rawSwitches = fieldAt(raw, "switches");
  if (!Array.isArray(rawSwitches)) {
    return { kind: "unreadable", why: `the frame has no "switches" list; say [] if the page declares none` };
  }
  const switches: Switch[] = [];
  for (let index = 0; index < rawSwitches.length; index += 1) {
    const held = switchAt(rawSwitches[index], index);
    if (typeof held === "string") return { kind: "unreadable", why: held };
    switches.push(held);
  }

  return { kind: "frame", frame: { page, state, captured, width, height, marks, switches } };
}
