import type { Check, Finding, Subject } from "../engine.ts";
import type { Rule } from "../rule.ts";
import { blankedCss, blankedPage, isPage, lineAt } from "./read.ts";

export const INLINE_STYLE: Rule = {
  id: "CSS-LAYER:1",
  category: "LAYER",
  pass: "fast",
  bans: "a `style=` attribute on an element",
  why:
    "an inline style outranks every stylesheet and is read by no rule here, so it is where a workaround goes to live. The look of the page then has two homes, and the stylesheet — the one a person opens to find out what this looks like — is the one that lies. It is also unreachable from a theme: nothing can change it but editing the markup again",
  instead: [
    "give the element a class and declare the look in the stylesheet",
    "a value that really is per-element goes through a custom property the sheet reads",
  ],
  valve: { kind: "none" },
};

const A_TAG_NAME = /[A-Za-z]/;

const A_STYLE_ATTRIBUTE = /(^|\s)style\s*=/i;

type Tag = { readonly body: string; readonly at: number };

function tagsIn(page: string): readonly Tag[] {
  const found: Tag[] = [];
  let at = page.indexOf("<");
  while (at !== -1) {
    if (!A_TAG_NAME.test(page.charAt(at + 1))) {
      at = page.indexOf("<", at + 1);
      continue;
    }
    let end = at + 1;
    let quote = "";
    while (end < page.length) {
      const char = page.charAt(end);
      if (quote.length > 0) {
        if (char === quote) quote = "";
        end += 1;
        continue;
      }
      if (char === '"' || char === "'") {
        quote = char;
        end += 1;
        continue;
      }
      if (char === ">") break;
      end += 1;
    }
    found.push({ body: page.slice(at, end), at });
    at = page.indexOf("<", end);
  }
  return found;
}

export const inlineStyleCheck: Check = {
  rule: INLINE_STYLE,

  run(subject: Subject): readonly Finding[] {
    if (!isPage(subject.file)) return [];

    const found: Finding[] = [];
    for (const tag of tagsIn(blankedPage(subject.text))) {
      const held = A_STYLE_ATTRIBUTE.exec(blankedCss(tag.body, false));
      if (held === null) continue;
      found.push({ line: lineAt(subject.text, tag.at + held.index), said: "style=" });
    }
    return found;
  },
};
