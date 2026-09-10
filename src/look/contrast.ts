import { LARGE_TEXT_PX, LARGE_WHEN_BOLD_PX, TEXT_RATIO, THING_RATIO } from "../config.ts";
import type { Frame, Mark } from "../frame/frame.ts";
import { OBSERVED_BEHIND, wornOn, type Look } from "../frame/look.ts";

export type Faint = {
  readonly frame: string;
  readonly at: string;
  readonly what: string;
  readonly ratio: number;
  readonly needs: number;
  readonly ink: string;
  readonly ground: string;
};

export type Pairing = {
  readonly ink: string;
  readonly ground: string;
  readonly ratio: number;
  readonly needs: number;
  readonly on: number;
  readonly examples: readonly Faint[];
};

export type Unknowable = {
  readonly frame: string;
  readonly at: string;
  readonly why: string;
};

export type Told = {
  readonly pairings: readonly Pairing[];
  readonly faint: number;
  readonly unknowable: readonly Unknowable[];
  readonly looked: number;
};

const A_COLOUR = /^rgba?\(([^)]+)\)$/;

const A_WIDE_COLOUR = /^color\(srgb ([^)]+)\)$/;

const TO_BYTES = 255;

export type Colour =
  | { readonly kind: "read"; readonly channels: readonly number[] }
  | { readonly kind: "unreadable" };

export type Ratio =
  | { readonly kind: "measured"; readonly ratio: number }
  | { readonly kind: "unreadable" };

function partsOf(said: string, scale: number): Colour {
  const parts = said
    .split(/[\s,/]+/)
    .filter((one) => one.length > 0)
    .map(Number);
  if (parts.length < 3 || parts.some((one) => Number.isNaN(one))) return { kind: "unreadable" };
  return { kind: "read", channels: parts.map((one) => one * scale) };
}

export function channelsIn(value: string): Colour {
  const said = value.trim();
  const held = A_COLOUR.exec(said);
  if (held !== null) return partsOf(held[1] === undefined ? "" : held[1], 1);
  const wide = A_WIDE_COLOUR.exec(said);
  if (wide !== null) return partsOf(wide[1] === undefined ? "" : wide[1], TO_BYTES);
  return { kind: "unreadable" };
}

function channel(raw: number): number {
  const held = raw / 255;
  return held <= 0.03928 ? held / 12.92 : Math.pow((held + 0.055) / 1.055, 2.4);
}

export function luminanceOf(colour: readonly number[]): number {
  const red = colour[0];
  const green = colour[1];
  const blue = colour[2];
  if (red === undefined || green === undefined || blue === undefined) return 0;
  return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
}

export function ratioBetween(one: string, two: string): Ratio {
  const first = channelsIn(one);
  const second = channelsIn(two);
  if (first.kind === "unreadable" || second.kind === "unreadable") return { kind: "unreadable" };
  const light = Math.max(luminanceOf(first.channels), luminanceOf(second.channels));
  const dark = Math.min(luminanceOf(first.channels), luminanceOf(second.channels));
  return { kind: "measured", ratio: Math.round(((light + 0.05) / (dark + 0.05)) * 100) / 100 };
}

function sizeOf(look: Look): number {
  return Number.parseFloat(wornOn(look, "font-size"));
}

function boldness(look: Look): number {
  const held = Number.parseFloat(wornOn(look, "font-weight"));
  return Number.isNaN(held) ? 400 : held;
}

export function neededFor(look: Look): number {
  const size = sizeOf(look);
  if (Number.isNaN(size)) return TEXT_RATIO;
  if (size >= LARGE_TEXT_PX) return THING_RATIO;
  if (size >= LARGE_WHEN_BOLD_PX && boldness(look) >= 700) return THING_RATIO;
  return TEXT_RATIO;
}

const BORDER_SIDES: readonly string[] = [
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
];

function isSeeThrough(value: string): boolean {
  const held = channelsIn(value);
  if (held.kind === "unreadable") return true;
  const alpha = held.channels[3];
  return alpha !== undefined && alpha === 0;
}

function drawsWords(mark: Mark): boolean {
  return mark.kind.endsWith("(text)");
}

function judge(
  mark: Mark,
  frame: string,
  ink: string,
  needs: number,
  what: string,
  faint: Faint[],
  unknowable: Unknowable[],
): void {
  const ground = wornOn(mark.look, OBSERVED_BEHIND);
  if (channelsIn(ground).kind === "unreadable") {
    unknowable.push({
      frame,
      at: mark.at,
      why: "nothing opaque was found behind it, so what it sits on is a picture or the page itself",
    });
    return;
  }
  const held = ratioBetween(ink, ground);
  if (held.kind === "unreadable" || held.ratio >= needs) return;
  faint.push({ frame, at: mark.at, what, ratio: held.ratio, needs, ink, ground });
}

export function tooFaintIn(frames: readonly Frame[]): Told {
  const faint: Faint[] = [];
  const unknowable: Unknowable[] = [];
  let looked = 0;

  for (const frame of frames) {
    const name = `${frame.page} · ${frame.state}`;
    for (const mark of frame.marks) {
      if (drawsWords(mark)) {
        const ink = wornOn(mark.look, "color");
        if (channelsIn(ink).kind === "read") {
          looked += 1;
          judge(mark, name, ink, neededFor(mark.look), "its words", faint, unknowable);
        }
        continue;
      }
      for (const side of BORDER_SIDES) {
        if (!mark.sides.some((one) => side.includes(one))) continue;
        const edge = wornOn(mark.look, side);
        if (isSeeThrough(edge)) continue;
        looked += 1;
        judge(mark, name, edge, THING_RATIO, `its ${side.slice(7, -6)} border`, faint, unknowable);
        break;
      }
    }
  }
  return { pairings: pairedUp(faint), faint: faint.length, unknowable, looked };
}

function pairedUp(faint: readonly Faint[]): readonly Pairing[] {
  const byPair = new Map<string, Faint[]>();
  for (const one of faint) {
    const key = `${one.ink} on ${one.ground} needing ${one.needs}`;
    const held = byPair.get(key);
    if (held === undefined) byPair.set(key, [one]);
    else held.push(one);
  }
  const found: Pairing[] = [];
  for (const held of byPair.values()) {
    const first = held[0];
    if (first === undefined) continue;
    found.push({
      ink: first.ink,
      ground: first.ground,
      ratio: first.ratio,
      needs: first.needs,
      on: held.length,
      examples: held.slice(0, 3),
    });
  }
  return found.sort((one, two) => one.ratio - two.ratio);
}
