import type { Check, Finding, Subject } from "../engine.ts";
import type { Rule } from "../rule.ts";
import {
  cssViewOf,
  declarationsIn,
  endsAtNewline,
  isStyling,
  lineAt,
  withoutArithmetic,
  withoutTokenNames,
} from "./read.ts";

export const NEGATIVE_MARGIN: Rule = {
  id: "CSS-TRUTH:3",
  category: "TRUTH",
  pass: "fast",
  bans: "a negative margin",
  why:
    "it does not place this box, it un-places the one before it. The spacing is declared in one rule and fought from a second, so the distance a person actually sees is written in neither, and the layout only holds while somebody reads both rules together — which nobody does. It is also the repair that survives longest: the box it pulls moves, and the pull stays",
  instead: [
    "take the spacing out where it was declared, rather than cancelling it here",
    "let the container own the distance, with gap or padding",
    "margin: calc(var(--space-4) - var(--border)) is arithmetic and is allowed",
  ],
  valve: { kind: "none" },
};

const MARGINS: readonly string[] = [
  "margin",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "margin-block",
  "margin-block-start",
  "margin-block-end",
  "margin-inline",
  "margin-inline-start",
  "margin-inline-end",
];

const IS_A_MARGIN = new Set(MARGINS);

const A_NEGATIVE_NUMBER = /-\s*\.?\d/;

export const negativeMarginCheck: Check = {
  rule: NEGATIVE_MARGIN,

  run(subject: Subject): readonly Finding[] {
    if (!isStyling(subject.file)) return [];

    const view = cssViewOf(subject.file, subject.text);
    const found: Finding[] = [];
    for (const declaration of declarationsIn(view, endsAtNewline(subject.file))) {
      if (!IS_A_MARGIN.has(declaration.property.toLowerCase())) continue;
      const value = withoutArithmetic(withoutTokenNames(declaration.value));
      const held = A_NEGATIVE_NUMBER.exec(value);
      if (held === null) continue;
      found.push({
        line: lineAt(subject.text, declaration.at + held.index),
        said: `${declaration.property}:${declaration.value.trimEnd()}`,
      });
    }
    return found;
  },
};
