import { existsSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";

import { standingOf, type Concessions } from "./concessions.ts";
import type { Rule, Violation } from "./rule.ts";

export const VARIANT_FILE: Rule = {
  id: "COPY:1",
  category: "TRUTH",
  pass: "fast",
  bans:
    "a file whose name says it is a second go at the one beside it — `helper-old.py` next to `helper.py`, and the rest of that family: `-new`, `-final`, `-orig`, `-tmp`, `-bak`, `-updated`, `-improved`, `-enhanced`, `report copy.ts` and `report (1).ts`. Every language, judged by the name",
  why:
    "the second file exists because changing the first one felt risky, and from that moment the two drift. Callers split between them, a fix lands in one of them, and a year later nobody can say which is the real one — the name is the only evidence there ever was, and `old`, `new` and `final` are the confession that the change was dodged rather than made. It compounds: a codebase with one of these gets a third, because the second one proved it was allowed",
  instead: [
    "change the original, and let the tests and the diff be the safety net the copy was pretending to be",
    "if the two really are different things, name them after what makes them different — `parseIsoDate` and `parseHumanDate`, never `parseDate-new`",
    "if the old one is dead, delete it; git still has it",
  ],
  valve: { kind: "none" },
};

const A_SECOND_GO: readonly string[] = [
  "old",
  "new",
  "final",
  "orig",
  "original",
  "tmp",
  "bak",
  "enhanced",
  "improved",
  "updated",
];

const A_SEPARATOR: readonly string[] = ["-", "_", " "];

const A_DUPLICATE = " copy";

const A_COPY_NUMBER = /^(.*[A-Za-z])\s*\((\d+)\)$/;

function stemOf(name: string): string {
  return name.slice(0, name.length - extname(name).length);
}

function withoutSecondGo(stem: string): string {
  const low = stem.toLowerCase();
  for (const separator of A_SEPARATOR) {
    for (const word of A_SECOND_GO) {
      const tail = `${separator}${word}`;
      if (low.endsWith(tail)) return stem.slice(0, stem.length - tail.length);
    }
  }
  if (low.endsWith(A_DUPLICATE)) return stem.slice(0, stem.length - A_DUPLICATE.length);
  return "";
}

export function originalStemFor(name: string): string {
  const stem = stemOf(name);
  if (stem.length === 0) return "";

  const worded = withoutSecondGo(stem);
  if (worded.length > 0) return worded;

  const copied = A_COPY_NUMBER.exec(stem);
  if (copied === null) return "";
  const before = copied[1];
  return before === undefined ? "" : before.trimEnd();
}

export function variantsIn(
  root: string,
  named: readonly string[],
  concessions: Concessions,
): readonly Violation[] {
  const found: Violation[] = [];
  for (const path of named) {
    if (standingOf(concessions, path, VARIANT_FILE.id).kind !== "stands") continue;
    const name = basename(path);
    const stem = originalStemFor(name);
    if (stem.length === 0) continue;
    const original = `${stem}${extname(name)}`;
    if (original === name) continue;
    const beside = join(root, dirname(path), original);
    if (!existsSync(beside)) continue;
    found.push({
      rule: VARIANT_FILE,
      file: path,
      line: 1,
      said: `${original} is beside it`,
    });
  }
  return found;
}
