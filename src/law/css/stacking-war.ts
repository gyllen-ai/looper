import type { Concessions } from "../concessions.ts";
import type { Check, Finding, Subject } from "../engine.ts";
import type { Rule } from "../rule.ts";
import {
  cssViewOf,
  declarationsIn,
  endsAtNewline,
  isStyling,
  lineAt,
  withoutTokenNames,
} from "./read.ts";

export const STACKING_WAR: Rule = {
  id: "CSS-TRUTH:2",
  category: "TRUTH",
  pass: "fast",
  bans: "a z-index above the cap, written on `z-index` or on a token that names one",
  why:
    "999 beats 99 until somebody writes 9999. Past a small scale the number has stopped saying which layer this is and started saying who edited last, and there is no file left that says what the real order is. The next person cannot raise one layer without guessing at every other",
  instead: [
    "z-index: var(--layer-modal), with the scale written once where the tokens live",
    "keep every layer inside the cap and move the neighbour down instead of moving this one up",
  ],
  valve: {
    kind: "knob",
    key: "[css] z_max",
    note: "the highest z-index this project allows. Raise it only if the scale it names is written down somewhere a person can read",
  },
};

const A_WHOLE_NUMBER = /^\s*(\d+)\s*$/;

const A_LAYER_TOKEN = /^[$-]*z(-|index)|z-?index/i;

const DECIMAL = 10;

function namesALayer(property: string): boolean {
  if (property.toLowerCase() === "z-index") return true;
  if (!property.startsWith("--") && !property.startsWith("$")) return false;
  return A_LAYER_TOKEN.test(property);
}

export const stackingWarCheck: Check = {
  rule: STACKING_WAR,

  run(subject: Subject, concessions: Concessions): readonly Finding[] {
    if (!isStyling(subject.file)) return [];

    const view = cssViewOf(subject.file, subject.text);
    const found: Finding[] = [];
    for (const declaration of declarationsIn(view, endsAtNewline(subject.file))) {
      if (!namesALayer(declaration.property)) continue;
      const held = A_WHOLE_NUMBER.exec(withoutTokenNames(declaration.value));
      if (held === null) continue;
      const written = Number.parseInt(String(held[1]), DECIMAL);
      if (written <= concessions.zIndexCap) continue;
      found.push({
        line: lineAt(subject.text, declaration.at),
        said: `${declaration.property}: ${String(written)}`,
      });
    }
    return found;
  },
};
