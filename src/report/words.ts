import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";

import { looperRoot } from "../law/readers.ts";
import { findingsIn } from "../secrets/detect.ts";

export type Refused = { readonly word: string; readonly why: string };

const OURS_ARE_WRITTEN_IN: readonly string[] = [".ts", ".md", ".py"];

const WHERE_OURS_LIVE = "src";

const NOT_WRITTEN_BY_US: readonly string[] = ["__pycache__"];

const A_WORD = /[A-Za-z_$][A-Za-z0-9_$]+/g;

const SENTENCE_MARKS_BEFORE = /^["'“‘`*_≥≤±~]+/;

const SENTENCE_MARKS_AFTER = /[.,;:!?"'”’`*_…+]+$/;

const A_POSSESSIVE = /['’]s$/;

const PAIRS: readonly (readonly [string, string])[] = [
  ["(", ")"],
  ["[", "]"],
  ["{", "}"],
  ["<", ">"],
];

const ENDS_A_SENTENCE = /[.!?:]["'”’)\]]*$/;

const A_NUMBER = /^#?[0-9][0-9.,:%x×/-]*$/;

const A_MEASURE = /^[0-9][0-9.,]*(?:[A-Za-z]{1,2}|(?:-?[a-z]+)+)$/;

const JOINED_BY_HYPHENS = /^[A-Za-z0-9'’]+(?:-[A-Za-z0-9'’]+)+$/;

const A_CONTRACTION = /^I['’][a-z]+$/;

const LETTERS_WITH_DOTS = /^[a-z](?:\.[a-z])+$/;

const A_LETTER_OR_DIGIT = /[A-Za-z0-9]/;

const TOO_LONG_FOR_A_COUNT = /[0-9]{5,}/;

const OTHER_THAN_PLAIN = /[^A-Za-z0-9'’-]/;

const A_LETTER_FROM_ELSEWHERE = /[^\x00-\x7F‘’“”…]/;

const BETWEEN_WORDS = /[\s—–]+/;

const A_CAPITAL_OR_DIGIT = /[A-Z0-9]/;

const OPENS_WITH_A_CAPITAL = /^[A-Z]/;

const A_PLACE_IN_A_FILE = /:[0-9]+(?::[0-9]+)?$/;

const NOT_A_PART = /[^a-z0-9]+/;

const LETTERS_ONLY = /^[a-z]+$/;

const SHORTEST_NAME = 3;

const NOTHING_ALLOWED: ReadonlySet<string> = new Set();

function unwrapped(token: string): string {
  let held = token;
  for (const [opens, closes] of PAIRS) {
    if (held.startsWith(opens) && held.endsWith(closes)) {
      held = held.slice(opens.length, -closes.length);
      continue;
    }
    if (held.startsWith(opens) && !held.includes(closes)) held = held.slice(opens.length);
    if (held.endsWith(closes) && !held.includes(opens)) held = held.slice(0, -closes.length);
  }
  return held;
}

export function bare(raw: string): string {
  let held = raw;
  let before = "";
  while (before !== held) {
    before = held;
    held = unwrapped(held.replace(SENTENCE_MARKS_BEFORE, "").replace(SENTENCE_MARKS_AFTER, ""));
  }
  return held.replace(A_POSSESSIVE, "");
}

function filesUnder(dir: string): readonly string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (NOT_WRITTEN_BY_US.includes(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...filesUnder(path));
      continue;
    }
    if (OURS_ARE_WRITTEN_IN.includes(extname(entry.name))) found.push(path);
  }
  return found;
}

export function looperWords(): ReadonlySet<string> {
  const words = new Set<string>();
  for (const path of filesUnder(join(looperRoot(), WHERE_OURS_LIVE))) {
    const text = readFileSync(path, "utf8");
    for (const raw of text.split(/\s+/)) {
      const held = bare(raw);
      if (held.length > 0) words.add(held.toLowerCase());
    }
    const named = text.match(A_WORD);
    if (named === null) continue;
    for (const word of named) words.add(word.toLowerCase());
  }
  return words;
}

function partsOf(token: string): readonly string[] {
  return token.toLowerCase().split(NOT_A_PART).filter((part) => part.length > 0);
}

function theirNames(theirs: readonly string[], ours: ReadonlySet<string>): ReadonlySet<string> {
  const names = new Set<string>();
  for (const named of theirs) {
    for (const part of partsOf(named)) {
      if (part.length >= SHORTEST_NAME && !ours.has(part)) names.add(part);
    }
  }
  return names;
}

function isOursOnDisk(token: string): boolean {
  if (token.includes("..") || token.startsWith("/") || token.startsWith("~")) return false;
  const path = join(looperRoot(), token.replace(A_PLACE_IN_A_FILE, ""));
  return existsSync(path) && statSync(path).isFile();
}

function isOnlyWriting(token: string): boolean {
  return (
    token.length <= 1 ||
    !A_LETTER_OR_DIGIT.test(token) ||
    A_CONTRACTION.test(token) ||
    LETTERS_WITH_DOTS.test(token)
  );
}

function whyNot(token: string, opens: boolean, ours: ReadonlySet<string>, names: ReadonlySet<string>): string {
  if (isOnlyWriting(token) || ours.has(token.toLowerCase())) return "";
  if (partsOf(token).some((part) => names.has(part))) return "it is this project's own name";
  if (isOursOnDisk(token)) return "";
  if (JOINED_BY_HYPHENS.test(token)) {
    const whys = token.split("-").map((part, at) => whyNot(part, opens && at === 0, ours, names));
    const first = whys.find((why) => why.length > 0);
    return first === undefined ? "" : first;
  }
  if (A_NUMBER.test(token) || A_MEASURE.test(token)) {
    return TOO_LONG_FOR_A_COUNT.test(token) ? "a number this long reads like a ticket or an account" : "";
  }
  if (A_LETTER_FROM_ELSEWHERE.test(token)) {
    return "it has a letter outside a to z, and a report is written in plain English so that every word of it can be checked";
  }
  if (OTHER_THAN_PLAIN.test(token)) return "it is written like a path, an address or a piece of code";
  if (A_CAPITAL_OR_DIGIT.test(token.slice(1))) return "a capital or a digit inside a word is how code writes a name";
  if (OPENS_WITH_A_CAPITAL.test(token) && !opens) return "a capital in the middle of a sentence is a name";
  return "";
}

function credentialsIn(text: string): readonly Refused[] {
  const found: Refused[] = [];
  for (const line of text.split("\n")) {
    for (const held of findingsIn(line, NOTHING_ALLOWED)) {
      found.push({ word: held.excerpt, why: `it looks like ${held.kind}` });
    }
  }
  return found;
}

export function refusedIn(
  text: string,
  ours: ReadonlySet<string>,
  theirs: readonly string[],
): readonly Refused[] {
  const names = theirNames(theirs, ours);
  const refused = new Map<string, string>();

  for (const line of text.split("\n")) {
    let opens = true;
    for (const raw of line.split(BETWEEN_WORDS)) {
      const token = bare(raw);
      if (token.length === 0) continue;
      const why = whyNot(token, opens, ours, names);
      if (why.length > 0 && !refused.has(token)) refused.set(token, why);
      opens = ENDS_A_SENTENCE.test(raw);
    }
  }

  const stopped: Refused[] = [...refused].map(([word, why]) => ({ word, why }));
  if (stopped.length > 0) return stopped;
  return credentialsIn(text);
}

export function notLoopers(text: string, ours: ReadonlySet<string>): readonly string[] {
  const found = new Set<string>();
  for (const raw of text.split(BETWEEN_WORDS)) {
    for (const part of partsOf(bare(raw))) {
      if (part.length >= SHORTEST_NAME && LETTERS_ONLY.test(part) && !ours.has(part)) found.add(part);
    }
  }
  return [...found].sort();
}
