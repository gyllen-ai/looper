import type { Check, Finding, Subject } from "../engine.ts";
import type { Rule } from "../rule.ts";
import { cssViewOf, isStyling, lineAt } from "./read.ts";

export const CASCADE_OVERRULED: Rule = {
  id: "CSS-TYPE:1",
  category: "TYPE",
  pass: "fast",
  bans: "`!important`, in any casing and any spacing",
  why:
    "it does not settle a conflict, it escalates one. The cascade already decided which rule wins; !important overrules that decision without touching the specificity that lost, so the sheet no longer means what it reads as and the next change needs a bigger hammer than this one. The rule it beat is still there, still wrong, and now unreachable",
  instead: [
    "raise the specificity of the selector that lost, or lower the one that won",
    "move the declaration to where the cascade already favours it",
    "if what is being fought is a token's value, change the token",
  ],
  valve: { kind: "none" },
};

const AN_OVERRIDE = /!\s*important/gi;

export const cascadeOverruledCheck: Check = {
  rule: CASCADE_OVERRULED,

  run(subject: Subject): readonly Finding[] {
    if (!isStyling(subject.file)) return [];

    const view = cssViewOf(subject.file, subject.text);
    const found: Finding[] = [];
    AN_OVERRIDE.lastIndex = 0;
    let held = AN_OVERRIDE.exec(view);
    while (held !== null) {
      found.push({ line: lineAt(subject.text, held.index), said: held[0] });
      held = AN_OVERRIDE.exec(view);
    }
    return found;
  },
};
