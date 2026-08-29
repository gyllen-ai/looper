import { isNamed, type Concessions } from "../concessions.ts";
import type { Check, Finding, Subject } from "../engine.ts";
import type { Rule } from "../rule.ts";
import { bearsAColour, isNamedColour } from "./colours.ts";
import {
  cssViewOf,
  declarationsIn,
  endsAtNewline,
  isStyling,
  lineAt,
  withoutTokenNames,
  type Declaration,
} from "./read.ts";

export const LITERAL_COLOUR: Rule = {
  id: "CSS-TRUTH:1",
  category: "TRUTH",
  pass: "fast",
  bans:
    "a colour written where it is used — a hex, an `rgb()` or `hsl()` with numbers in it, or one of the 148 colours CSS has a name for on a property that takes a colour — anywhere but the file the palette lives in",
  why:
    "a colour is a fact about the brand, and it has one home. Pasted where it is used it cannot be changed with the brand, and the second copy is never found: #f5f5f6 and #f5f5f5 look the same on the screen and are two different colours in the diff. The file that owns the palette is the one place a person can read to know what this product looks like",
  instead: [
    "color: var(--color-brand)",
    "a colour with no token yet gets one in the palette file first, then is used by that name",
    "hsl(var(--brand-h) var(--brand-s) var(--brand-l)) is a token in three parts, not a literal",
  ],
  valve: {
    kind: "knob",
    key: "[css] palette",
    note: "the file or files the palette lives in, where a colour may be written out. Defaults to tokens.css, matched by name in any directory",
  },
};

const A_HEX = /#[0-9a-fA-F]+/g;

const HEX_LENGTHS: readonly number[] = [3, 4, 6, 8];

const A_COLOUR_FUNCTION = /\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\s*\(/gi;

const A_WORD = /[A-Za-z-]+/g;

const A_DIGIT = /[0-9]/;

function argumentsAfter(value: string, from: number): string {
  let depth = 1;
  let at = from;
  while (at < value.length && depth > 0) {
    const char = value.charAt(at);
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    at += 1;
  }
  return value.slice(from, at);
}

type Spotted = { readonly at: number; readonly said: string };

function hexesIn(value: string): readonly Spotted[] {
  const found: Spotted[] = [];
  A_HEX.lastIndex = 0;
  let held = A_HEX.exec(value);
  while (held !== null) {
    const digits = held[0].length - 1;
    if (HEX_LENGTHS.includes(digits)) found.push({ at: held.index, said: held[0] });
    held = A_HEX.exec(value);
  }
  return found;
}

function functionsIn(value: string): readonly Spotted[] {
  const found: Spotted[] = [];
  A_COLOUR_FUNCTION.lastIndex = 0;
  let held = A_COLOUR_FUNCTION.exec(value);
  while (held !== null) {
    const args = argumentsAfter(value, held.index + held[0].length);
    if (A_DIGIT.test(args)) found.push({ at: held.index, said: `${String(held[1])}(${args}` });
    held = A_COLOUR_FUNCTION.exec(value);
  }
  return found;
}

function namesIn(value: string): readonly Spotted[] {
  const found: Spotted[] = [];
  A_WORD.lastIndex = 0;
  let held = A_WORD.exec(value);
  while (held !== null) {
    if (isNamedColour(held[0])) found.push({ at: held.index, said: held[0] });
    held = A_WORD.exec(value);
  }
  return found;
}

function literalsIn(declaration: Declaration): readonly Spotted[] {
  const value = withoutTokenNames(declaration.value);
  const found = [...hexesIn(value), ...functionsIn(value)];
  if (bearsAColour(declaration.property)) found.push(...namesIn(value));
  return found;
}

export const literalColourCheck: Check = {
  rule: LITERAL_COLOUR,

  run(subject: Subject, concessions: Concessions): readonly Finding[] {
    if (!isStyling(subject.file)) return [];
    if (isNamed(subject.file, concessions.palette)) return [];

    const view = cssViewOf(subject.file, subject.text);
    const found: Finding[] = [];
    for (const declaration of declarationsIn(view, endsAtNewline(subject.file))) {
      for (const held of literalsIn(declaration)) {
        found.push({ line: lineAt(subject.text, declaration.at + held.at), said: held.said });
      }
    }
    return found;
  },
};
