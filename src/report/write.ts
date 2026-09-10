import { readFileSync } from "node:fs";
import { extname, join } from "node:path";

import { writeAtomically } from "../atomic.ts";
import { A_NAME_IN_CODE, REPORT_DEPTH, REPORT_PATH, SERVER_VERSION } from "../config.ts";
import { SKELETON_WORDS, render, shapeFor } from "./skeleton.ts";
import { judgedFiles } from "../law/project.ts";
import { looperRoot } from "../law/readers.ts";
import { reasonFrom } from "../fields.ts";

const WORD = new RegExp(A_NAME_IN_CODE, "g");

const SAYABLE: ReadonlySet<string> = new Set([
  ...SKELETON_WORDS,
  "value",
  "removed",
]);

export type Leak = { readonly word: string };

export function wordsIn(text: string): ReadonlySet<string> {
  const words = text.match(WORD);
  return new Set(words === null ? [] : words);
}

const A_NODE_TYPE = /^[A-Z][A-Za-z0-9]*$/;

const A_GIVEN_NAME = /^name[0-9]+$/;

export function leaksInShape(shape: string): readonly Leak[] {
  const leaks: Leak[] = [];
  for (const word of wordsIn(shape)) {
    if (SAYABLE.has(word)) continue;
    if (A_GIVEN_NAME.test(word)) continue;
    if (A_NODE_TYPE.test(word)) continue;
    leaks.push({ word });
  }
  return leaks;
}

export type Vocabulary = {
  readonly words: ReadonlySet<string>;
  readonly unreadable: readonly string[];
};

const HASH_COMMENTS: readonly string[] = [".py"];

type Scan = { readonly at: number; readonly keep: boolean };

function skipString(text: string, from: number, quote: string): number {
  let at = from + 1;
  while (at < text.length) {
    const here = text[at];
    if (here === "\\") {
      at += 2;
      continue;
    }
    if (here === quote) return at + 1;
    if (here === "\n" && quote !== "`") return at;
    at += 1;
  }
  return at;
}

function skipToEndOfLine(text: string, from: number): number {
  const ends = text.indexOf("\n", from);
  return ends === -1 ? text.length : ends;
}

function skipBlockComment(text: string, from: number): number {
  const ends = text.indexOf("*/", from + 2);
  return ends === -1 ? text.length : ends + 2;
}

export function withoutComments(path: string, text: string): string {
  const hash = HASH_COMMENTS.includes(extname(path));
  const quotes = hash ? ['"', "'"] : extname(path) === ".rs" ? ['"'] : ['"', "'", "`"];
  const kept: string[] = [];
  let at = 0;
  let from = 0;

  while (at < text.length) {
    const here = text[at];
    if (here === undefined) break;
    if (quotes.includes(here)) {
      at = skipString(text, at, here);
      continue;
    }
    if (hash && here === "#") {
      kept.push(text.slice(from, at));
      at = skipToEndOfLine(text, at);
      from = at;
      continue;
    }
    if (!hash && here === "/" && text[at + 1] === "/") {
      kept.push(text.slice(from, at));
      at = skipToEndOfLine(text, at);
      from = at;
      continue;
    }
    if (!hash && here === "/" && text[at + 1] === "*") {
      kept.push(text.slice(from, at));
      at = skipBlockComment(text, at);
      from = at;
      continue;
    }
    at += 1;
  }
  kept.push(text.slice(from));
  return kept.join("\n");
}

export function everyWordInProject(root: string): Vocabulary {
  const words = new Set<string>();
  const unreadable: string[] = [];

  for (const path of judgedFiles(root)) {
    try {
      for (const word of wordsIn(withoutComments(path, readFileSync(path, "utf8")))) words.add(word);
    } catch (cause) {
      unreadable.push(`${path} (${reasonFrom(cause)})`);
    }
  }

  return { words, unreadable };
}

const A_NAME_FROM_CODE = /[A-Z0-9_$]/;

export function leaksInTyped(
  typed: string,
  theirs: ReadonlySet<string>,
  named: ReadonlySet<string>,
): readonly Leak[] {
  const leaks: Leak[] = [];
  for (const word of wordsIn(typed)) {
    if (named.has(word)) continue;
    if (!theirs.has(word)) continue;
    if (!A_NAME_FROM_CODE.test(word.slice(1))) continue;
    leaks.push({ word });
  }
  return leaks;
}

export type Written =
  | { readonly kind: "no-shape"; readonly why: string }
  | { readonly kind: "cannot-be-sure"; readonly unreadable: readonly string[] }
  | { readonly kind: "would-leak"; readonly leaks: readonly Leak[] }
  | { readonly kind: "written"; readonly path: string; readonly body: string };

export type Request = {
  readonly root: string;
  readonly ruleId: string;
  readonly file: string;
  readonly line: number;
  readonly tried: string;
};

export function buildReport(request: Request): Written {
  const path = join(request.root, request.file);
  const source = readFileSync(path, "utf8");
  const located = shapeFor(looperRoot(), path, source, request.line, REPORT_DEPTH);
  if (located.kind === "not-found") return { kind: "no-shape", why: located.why };

  const shape = render(located.shape, 0);
  const startsNothing =
    located.kind === "around"
      ? [
          `## Line ${request.line} starts no statement`,
          ``,
          `Nothing begins on the line the rule named. The shape below is the statement`,
          `that contains it, which begins at line ${located.startsAt}. If the rule named this`,
          `line, either it means the statement around it or it has the wrong line, and`,
          `that difference is the thing worth reading here.`,
          ``,
        ]
      : [];
  const body = [
    `# looper report`,
    ``,
    `version: ${SERVER_VERSION}`,
    `rule: ${request.ruleId}`,
    ``,
    ...startsNothing,
    `## What was tried`,
    ``,
    request.tried,
    ``,
    `## The shape it fired on`,
    ``,
    "```",
    shape,
    "```",
    ``,
    `## What is not here`,
    ``,
    `The shape above carries no name, no value and no path. It is built only from`,
    `words looper itself can write — syntax kinds, structural keys, and a numbered`,
    `stand-in for each name — and every word of it was checked against that list`,
    `before this file was written.`,
    ``,
    `The sentence under "What was tried" is yours, not looper's. Anything shaped`,
    `like a name from your code was refused, but a plain English word that is also`,
    `a name here would pass. Read that line before this goes anywhere.`,
    ``,
    `Read it yourself before it goes anywhere. looper cannot send it: it has no`,
    `way to reach the network at all.`,
    ``,
  ].join("\n");

  const leaks = leaksInShape(shape);
  if (leaks.length > 0) return { kind: "would-leak", leaks };

  const vocabulary = everyWordInProject(request.root);
  if (vocabulary.unreadable.length > 0) {
    return { kind: "cannot-be-sure", unreadable: vocabulary.unreadable };
  }
  const typed = leaksInTyped(
    request.tried,
    new Set([...vocabulary.words, ...wordsIn(withoutComments(path, source))]),
    wordsIn(request.ruleId),
  );
  if (typed.length > 0) return { kind: "would-leak", leaks: typed };

  const written = join(request.root, REPORT_PATH);
  writeAtomically(written, body);
  return { kind: "written", path: written, body };
}
