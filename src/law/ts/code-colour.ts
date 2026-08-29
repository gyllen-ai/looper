import type { Check, Finding, Subject } from "../engine.ts";
import type { Rule } from "../rule.ts";
import { isNamed, type Concessions } from "../concessions.ts";
import { fieldAt } from "../../fields.ts";
import { lineOfNode, parseSource, walk, type Node } from "./parse.ts";

export const CODE_COLOUR: Rule = {
  id: "TS-TRUTH:3",
  category: "TRUTH",
  pass: "fast",
  bans: "a colour written in TypeScript: a hex, or an rgb(), hsl() or oklch() call, in a string outside the files the palette names",
  why:
    "a colour in code is a second palette that the stylesheet cannot see. The token in tokens.css changes and this one does not, the canvas and the page drift apart, and nobody can say what the product's ink is without reading every file that paints",
  instead: [
    'a custom property in the palette file, read once where the code paints: `getComputedStyle(element).getPropertyValue("--ink")`',
    'a class in the stylesheet for an element, and `style={{ "--tint": tint }}` when the value really is per element',
    'if this file is the palette, name it: `[css] palette = ["design/tokens.css", "src/theme.ts"]`',
  ],
  valve: {
    kind: "knob",
    key: "[css] palette",
    note: "the file or files the palette lives in, in any language the law reads; a colour written there is the palette, and everywhere else it is a copy",
  },
};

const A_WHOLE_HEX = /^#[0-9a-fA-F]+$/;

const HEX_LENGTHS: readonly number[] = [3, 4, 6, 8];

const A_HEX_INSIDE = /#([0-9a-fA-F]+)\b/g;

const A_COLOUR_FUNCTION = /\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\s*\(([^)]*)\)/gi;

const NUMBERS_ONLY = /^[\s\d.,%/+-]*(?:(?:none|deg|grad|rad|turn)[\s\d.,%/+-]*)*$/i;

const A_COLOUR_SPACE =
  /^\s*(?:srgb|srgb-linear|display-p3|a98-rgb|prophoto-rgb|rec2020|xyz|xyz-d50|xyz-d65)\b/i;

const A_GRADIENT = /gradient\s*\(/i;

const SELECTOR_TAKERS: readonly string[] = ["querySelector", "querySelectorAll", "closest", "matches"];

function isAHex(digits: string): boolean {
  return HEX_LENGTHS.includes(digits.length);
}

function colourIn(text: string): string | null {
  const whole = text.trim();
  if (A_WHOLE_HEX.test(whole) && isAHex(whole.slice(1))) return whole;
  for (const call of whole.matchAll(A_COLOUR_FUNCTION)) {
    const name = call[1];
    const inside = call[2];
    if (name === undefined || inside === undefined || !/\d/.test(inside)) continue;
    if (name.toLowerCase() === "color" ? A_COLOUR_SPACE.test(inside) : NUMBERS_ONLY.test(inside)) {
      return call[0];
    }
  }
  if (!A_GRADIENT.test(whole)) return null;
  for (const hex of whole.matchAll(A_HEX_INSIDE)) {
    const digits = hex[1];
    if (digits !== undefined && isAHex(digits)) return hex[0];
  }
  return null;
}

function textOf(node: Node): string | null {
  if (node.type === "StringLiteral") {
    const value = node["value"];
    return typeof value === "string" ? value : null;
  }
  if (node.type !== "TemplateElement") return null;
  const cooked = fieldAt(node["value"], "cooked");
  if (typeof cooked === "string") return cooked;
  const raw = fieldAt(node["value"], "raw");
  return typeof raw === "string" ? raw : null;
}

function selectorsIn(root: Node): Set<unknown> {
  const taken = new Set<unknown>();
  walk(root, (node) => {
    if (node.type !== "CallExpression") return;
    const callee = node["callee"];
    if (fieldAt(callee, "type") !== "MemberExpression") return;
    const property = fieldAt(fieldAt(callee, "property"), "name");
    if (typeof property !== "string" || !SELECTOR_TAKERS.includes(property)) return;
    const given = node["arguments"];
    if (Array.isArray(given)) for (const one of given) taken.add(one);
  });
  return taken;
}

export const codeColourCheck: Check = {
  rule: CODE_COLOUR,

  run(subject: Subject, concessions: Concessions): readonly Finding[] {
    if (isNamed(subject.file, concessions.palette)) return [];
    const parsed = parseSource(subject.file, subject.text);
    if (parsed.kind === "unreadable") return [];

    const selectors = selectorsIn(parsed.root);
    const found: Finding[] = [];
    walk(parsed.root, (node) => {
      if (selectors.has(node)) return;
      const text = textOf(node);
      if (text === null) return;
      const colour = colourIn(text);
      if (colour !== null) found.push({ line: lineOfNode(node), said: colour });
    });
    return found;
  },
};
