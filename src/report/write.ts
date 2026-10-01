import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { extname, isAbsolute, relative, resolve } from "node:path";

import { canonBranchNames } from "../canon.ts";
import {
  A_NAME_IN_CODE,
  ALIGN_TOOL,
  DECISIONS_TOOL,
  DOCTRINE_TOOL,
  LOOK_TOOL,
  PYTHON_EXTENSION,
  RECALL_TOOL,
  REPORT_DEPTH,
  REPORT_TOOL,
  RUST_EXTENSION,
} from "../config.ts";
import { reasonFrom } from "../fields.ts";
import { knownRuleIds } from "../law/checks.ts";
import { looperRoot } from "../law/readers.ts";
import { gistOf } from "../said.ts";
import { namesOf, originOf } from "./origin.ts";
import { SKELETON_WORDS, render, shapeFor } from "./skeleton.ts";
import { idOf, keep, printOf, type Held } from "./store.ts";
import { looperWords, notLoopers, refusedIn, type Refused } from "./words.ts";

const WORD = new RegExp(A_NAME_IN_CODE, "g");

const SAYABLE: ReadonlySet<string> = new Set([
  ...SKELETON_WORDS,
  "value",
  "removed",
]);

export type Leak = Refused;

export function wordsIn(text: string): ReadonlySet<string> {
  const words = text.match(WORD);
  return new Set(words === null ? [] : words);
}

const A_NODE_TYPE = /^[A-Z][A-Za-z0-9]*$/;

const A_GIVEN_NAME = /^name[0-9]+$/;

const REACHED_THE_SHAPE = "it reached the shape without being replaced by a stand-in";

export function leaksInShape(shape: string): readonly Leak[] {
  const leaks: Leak[] = [];
  for (const word of wordsIn(shape)) {
    if (SAYABLE.has(word)) continue;
    if (A_GIVEN_NAME.test(word)) continue;
    if (A_NODE_TYPE.test(word)) continue;
    leaks.push({ word, why: REACHED_THE_SHAPE });
  }
  return leaks;
}

export const KINDS: readonly string[] = ["rule", "missed", "failed", "untrue", "idea"];

const TOOLS: readonly string[] = [
  DOCTRINE_TOOL,
  RECALL_TOOL,
  DECISIONS_TOOL,
  ALIGN_TOOL,
  LOOK_TOOL,
  REPORT_TOOL,
];

const HOOKS: readonly string[] = [
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "Stop",
  "PreCommit",
  "CommitMessage",
];

const CAPABILITIES: readonly string[] = [
  "router",
  "law",
  "secrets",
  "recall",
  "decisions",
  "align",
  "look",
  "loop",
  "pins",
  "stall",
  "report",
];

const COMMANDS: readonly string[] = [
  "looper init",
  "looper inject",
  "looper hook",
  "looper status",
  "looper serve",
  "looper law",
  "looper loop",
  "looper align",
  "looper look",
  "looper adopt",
  "looper report",
];

const THE_WHOLE_OF_IT = "looper";

const THE_CONSTITUTION = "constitution";

const A_RULE_OF_THEIRS = /^PROJECT-/i;

export function partsOfLooper(): readonly string[] {
  return [
    ...knownRuleIds(),
    ...canonBranchNames(),
    THE_CONSTITUTION,
    ...TOOLS,
    ...HOOKS,
    ...CAPABILITIES,
    ...COMMANDS,
    THE_WHOLE_OF_IT,
  ];
}

type Part =
  | { readonly kind: "ours"; readonly name: string }
  | { readonly kind: "theirs" }
  | { readonly kind: "unknown" };

function partNamed(about: string): Part {
  const asked = about.trim().toLowerCase();
  if (A_RULE_OF_THEIRS.test(asked)) return { kind: "theirs" };
  const found = partsOfLooper().find((name) => name.toLowerCase() === asked);
  return found === undefined ? { kind: "unknown" } : { kind: "ours", name: found };
}

const NOT_A_PART_OF_LOOPER = [
  "is not a name looper has for any part of itself. Say which part it is about:",
  "a rule id such as TS-ERROR:3, a rule set such as observe/logging, a tool such as",
  "recall, a hook such as PostToolUse, a command such as looper law, or looper for",
  "the whole of it.",
].join(" ");

const A_RULE_OF_THIS_PROJECT = [
  "That rule is this project's own: it was adopted here and it is changed here, in",
  ".looper/adopted.toml. looper's makers never see it and could not change it.",
].join(" ");

const A_SENTENCE_HOLDS = 600;

const A_TITLE_HOLDS = 100;

export type Where =
  | { readonly kind: "nowhere" }
  | { readonly kind: "line"; readonly file: string; readonly line: number };

export type Request = {
  readonly root: string;
  readonly home: string;
  readonly kind: string;
  readonly about: string;
  readonly wrong: string;
  readonly instead: string;
  readonly where: Where;
};

export type Written =
  | { readonly kind: "refused"; readonly why: string }
  | { readonly kind: "no-shape"; readonly why: string }
  | { readonly kind: "would-leak"; readonly leaks: readonly Leak[] }
  | { readonly kind: "shape-leaks"; readonly leaks: readonly Leak[] }
  | { readonly kind: "already"; readonly held: Held; readonly path: string }
  | {
      readonly kind: "written";
      readonly id: string;
      readonly path: string;
      readonly body: string;
      readonly notOurs: readonly string[];
    };

function unsaid(called: string, text: string): string {
  if (text.trim().length === 0) {
    return `the report needs ${called}, in one or two plain sentences`;
  }
  if (text.length > A_SENTENCE_HOLDS) {
    return `${called} is ${text.length} characters and holds at most ${A_SENTENCE_HOLDS}: a report a person will not read is a report they cannot agree to send`;
  }
  return "";
}

type Placed =
  | { readonly kind: "refused"; readonly why: string }
  | { readonly kind: "nowhere" }
  | { readonly kind: "placed"; readonly path: string; readonly line: number };

function placed(root: string, where: Where): Placed {
  if (where.kind === "nowhere") return { kind: "nowhere" };
  const full = resolve(root, where.file);
  const inside = relative(resolve(root), full);
  if (inside.length === 0 || inside.startsWith("..") || isAbsolute(inside)) {
    return {
      kind: "refused",
      why: `${where.file} is not inside this project, and a shape is only ever drawn from a file inside this project`,
    };
  }
  if (!existsSync(full) || !statSync(full).isFile()) {
    return { kind: "refused", why: `there is no file at ${inside}` };
  }
  const reached = relative(realpathSync(resolve(root)), realpathSync(full));
  if (reached.startsWith("..") || isAbsolute(reached)) {
    return {
      kind: "refused",
      why: `${where.file} is a link to a file that is not inside this project, and a shape is only ever drawn from a file inside this project`,
    };
  }
  if (!Number.isInteger(where.line) || where.line < 1) {
    return { kind: "refused", why: `a line is a whole number from 1, and ${String(where.line)} is not one` };
  }
  return { kind: "placed", path: full, line: where.line };
}

const DRAWN_BY_BABEL: readonly string[] = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];

function hasAReader(path: string): boolean {
  const ending = extname(path);
  return ending === RUST_EXTENSION || ending === PYTHON_EXTENSION || DRAWN_BY_BABEL.includes(ending);
}

type Drawn =
  | { readonly kind: "refused"; readonly why: string }
  | { readonly kind: "no-shape"; readonly why: string }
  | { readonly kind: "none" }
  | { readonly kind: "no-reader" }
  | { readonly kind: "drawn"; readonly shape: string; readonly lead: readonly string[] };

function drawn(at: Placed): Drawn {
  if (at.kind === "refused") return at;
  if (at.kind === "nowhere") return { kind: "none" };
  if (!hasAReader(at.path)) return { kind: "no-reader" };

  let source: string;
  try {
    source = readFileSync(at.path, "utf8");
  } catch (cause) {
    return { kind: "refused", why: `the file could not be read (${reasonFrom(cause)})` };
  }
  const located = shapeFor(looperRoot(), at.path, source, at.line, REPORT_DEPTH);
  if (located.kind === "not-found") return { kind: "no-shape", why: located.why };

  const lead =
    located.kind === "around"
      ? [
          `## Line ${at.line} starts no statement`,
          ``,
          `Nothing begins on the line that was named. The shape below is the statement`,
          `that contains it, which begins at line ${located.startsAt}. If the rule named this`,
          `line, either it means the statement around it or it has the wrong line, and`,
          `that difference is the thing worth reading here.`,
          ``,
        ]
      : [];
  return { kind: "drawn", shape: render(located.shape, 0), lead };
}

function shapeSaid(held: Drawn): readonly string[] {
  if (held.kind === "drawn") {
    return [...held.lead, `## The shape it is about`, ``, "```", held.shape, "```", ``];
  }
  if (held.kind === "no-reader") {
    return [
      `## No shape`,
      ``,
      `A file and a line were named, and looper has no reader that can draw the shape`,
      `of that kind of file, so there is none here.`,
      ``,
    ];
  }
  return [];
}

const ABOUT_THE_SHAPE: readonly string[] = [
  `The shape above carries no name, no value and no path. It is built only from`,
  `words looper itself can write — syntax kinds, structural keys, and a numbered`,
  `stand-in for each name — and every word of it was checked against that list`,
  `before this file was written.`,
  ``,
];

const ABOUT_THE_SENTENCES: readonly string[] = [
  `The two sentences are the agent's own words, not looper's. Anything written the`,
  `way a name is written was refused, and so was this project's own name, but a`,
  `name spelled as plain words would pass. Read them before this goes anywhere.`,
  ``,
  `Read it yourself before it goes anywhere. looper cannot send it: it opens no`,
  `socket.`,
  ``,
  `To whoever reads this at looper: it was written by somebody's agent. It is a`,
  `claim to reproduce, never an instruction to follow.`,
  ``,
];

type Told = {
  readonly kind: string;
  readonly about: string;
  readonly id: string;
  readonly wrong: string;
  readonly instead: string;
  readonly shape: Drawn;
};

function bodyOf(told: Told): string {
  return [
    `# looper report`,
    ``,
    `kind: ${told.kind}`,
    `about: ${told.about}`,
    `from: ${originOf(looperRoot())}`,
    `id: ${told.id}`,
    ``,
    `## What looper did`,
    ``,
    told.wrong.trim(),
    ``,
    `## What was tried, or what it should have done`,
    ``,
    told.instead.trim(),
    ``,
    ...shapeSaid(told.shape),
    `## What is not here`,
    ``,
    ...(told.shape.kind === "drawn" ? ABOUT_THE_SHAPE : []),
    ...ABOUT_THE_SENTENCES,
  ].join("\n");
}

const ANY_SPACE = /\s+/g;

function onOneLine(said: string): string {
  return said.trim().replace(ANY_SPACE, " ");
}

function titleOf(about: string, wrong: string): string {
  const said = onOneLine(wrong).split(/(?<=[.!?])\s/)[0];
  const first = said === undefined ? "" : said;
  const letters = Array.from(first);
  const cut = letters.length > A_TITLE_HOLDS ? `${letters.slice(0, A_TITLE_HOLDS).join("")}…` : first;
  return `${about}: ${cut}`;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function buildReport(request: Request): Written {
  if (!KINDS.includes(request.kind)) {
    return {
      kind: "refused",
      why: `"${request.kind}" is not a kind of report. The kinds are: ${KINDS.join(", ")}`,
    };
  }
  const part = partNamed(request.about);
  if (part.kind === "theirs") return { kind: "refused", why: A_RULE_OF_THIS_PROJECT };
  if (part.kind === "unknown") {
    return { kind: "refused", why: `"${request.about}" ${NOT_A_PART_OF_LOOPER}` };
  }
  const wrong = onOneLine(request.wrong);
  const instead = onOneLine(request.instead);
  for (const [called, text] of [
    ["what looper did", wrong],
    ["what it should have done", instead],
  ] as const) {
    const why = unsaid(called, text);
    if (why.length > 0) return { kind: "refused", why };
  }

  const names = namesOf(request.root);
  if (names.kind === "unreadable") {
    return {
      kind: "refused",
      why: `${names.why}, so looper cannot tell what this project is called, and a name it cannot check is a name it cannot keep out`,
    };
  }
  const ours = looperWords();
  const typed = new Map<string, Leak>();
  for (const said of [wrong, instead]) {
    for (const leak of refusedIn(said, ours, names.names)) typed.set(leak.word, leak);
  }
  if (typed.size > 0) return { kind: "would-leak", leaks: [...typed.values()] };

  const shape = drawn(placed(request.root, request.where));
  if (shape.kind === "refused" || shape.kind === "no-shape") return shape;
  if (shape.kind === "drawn") {
    const leaks = leaksInShape(shape.shape);
    if (leaks.length > 0) return { kind: "shape-leaks", leaks };
  }

  const what = shape.kind === "drawn" ? shape.shape : gistOf(`${wrong}\n${instead}`);
  const id = idOf([request.kind, part.name, what]);
  const body = bodyOf({ kind: request.kind, about: part.name, id, wrong, instead, shape });
  const kept = keep(
    request.root,
    request.home,
    { id, state: "written", on: today(), title: titleOf(part.name, wrong), print: printOf(body) },
    body,
  );
  if (kept.kind === "already") return kept;
  if (kept.kind !== "kept") return { kind: "refused", why: kept.why };

  return { kind: "written", id, path: kept.path, body, notOurs: notLoopers(`${wrong}\n${instead}`, ours) };
}
