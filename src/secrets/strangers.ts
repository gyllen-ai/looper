import {
  additionsAgainst,
  additionsInHand,
  everyWordAt,
  whatTheRemoteAlreadyHas,
} from "../git.ts";
import { A_WRITTEN_TOKEN } from "../config.ts";
import { readConcessions } from "../law/concessions.ts";

export type Stranger = {
  readonly word: string;
  readonly file: string;
  readonly line: number;
};

export type Sweep =
  | { readonly kind: "cannot-tell"; readonly why: string }
  | { readonly kind: "swept"; readonly against: string; readonly strangers: readonly Stranger[] };

const NOBODY_ELSE_WROTE_THESE: readonly string[] = ["vendor", "package-lock.json"];

const A_TOKEN = new RegExp(A_WRITTEN_TOKEN, "g");

export function tokensIn(text: string): ReadonlySet<string> {
  const found = text.match(A_TOKEN);
  return new Set(found === null ? [] : found);
}

export type Reach = "leaving" | "in-hand";

export function strangersLeaving(root: string): Sweep {
  const against = whatTheRemoteAlreadyHas(root);
  if (against.kind === "cannot-tell") return { kind: "cannot-tell", why: against.why };
  return sweep(root, against.revision, "leaving");
}

export function strangersInHand(root: string): Sweep {
  const against = whatTheRemoteAlreadyHas(root);
  if (against.kind === "cannot-tell") return { kind: "cannot-tell", why: against.why };
  return sweep(root, against.revision, "in-hand");
}

export function strangersAgainst(root: string, revision: string): Sweep {
  return sweep(root, revision, "in-hand");
}

function sweep(root: string, revision: string, reach: Reach): Sweep {
  const against = { revision };
  const unwritten = [...NOBODY_ELSE_WROTE_THESE, ...readConcessions(root).generated];

  const known = everyWordAt(root, against.revision, unwritten);
  if (known.kind === "cannot-tell") return { kind: "cannot-tell", why: known.why };

  const going =
    reach === "leaving"
      ? additionsAgainst(root, against.revision)
      : additionsInHand(root, against.revision);
  if (going.kind === "unavailable") return { kind: "cannot-tell", why: going.why };

  const seen = new Set<string>();
  const strangers: Stranger[] = [];
  for (const added of going.added) {
    if (unwritten.some((part) => added.file.split("/").includes(part))) continue;
    if (unwritten.includes(added.file)) continue;
    for (const word of tokensIn(added.text)) {
      if (known.words.has(word) || seen.has(word)) continue;
      seen.add(word);
      strangers.push({ word, file: added.file, line: added.line });
    }
  }
  return { kind: "swept", against: against.revision, strangers };
}

export function saidAboutStrangers(sweep: Sweep): string {
  if (sweep.kind === "cannot-tell") {
    return `looper: the words about to leave this machine were not checked, because ${sweep.why}. That scan reads every word this repository already holds, so it runs out of time when a large generated tree is committed: name those directories as \`generated\` in law.toml and it will not read them. Nothing is blocked, and nothing here is a verdict on them.`;
  }
  if (sweep.strangers.length === 0) return "";
  const named = sweep.strangers.map(
    (one) => `  ${one.word}  ${one.file}:${one.line}`,
  );
  return [
    ``,
    `looper: ${sweep.strangers.length} word(s) in what you are about to push appear`,
    `nowhere else in this repository as ${sweep.against} has it. Read the list before it goes.`,
    ``,
    ...named,
    ``,
    `A new name is usually just new. This is not a gate and nothing is blocked —`,
    `it is here because a check that greps for words somebody thought of can only`,
    `find those, and the one that got out was the one nobody pictured.`,
  ].join("\n");
}
