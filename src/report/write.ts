import { existsSync, realpathSync, statSync } from "node:fs";
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
  RELEASE_TOOL,
  REPORT_DEPTH,
  REPORT_TOOL,
  RUST_EXTENSION,
} from "../config.ts";
import { knownRuleIds } from "../law/checks.ts";
import { looperRoot } from "../law/readers.ts";
import { readOrdinary } from "../ordinary.ts";
import { gistOf } from "../said.ts";
import { bodyOf, onOneLine, titleOf, unsaid, type Shape, type Told } from "./body.ts";
import { A_SOURCE, namesOf, originOf } from "./origin.ts";
import { SKELETON_WORDS, render, shapeFor } from "./skeleton.ts";
import { idOf, isAnId, keep, printOf, type Held } from "./store.ts";
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
  RELEASE_TOOL,
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
  "wiring",
];

const COMMANDS: readonly string[] = [
  "looper init",
  "looper inject",
  "looper hook",
  "looper reached",
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
      readonly title: string;
      readonly path: string;
      readonly body: string;
      readonly notOurs: readonly string[];
    };

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
  | Shape;

function drawn(at: Placed): Drawn {
  if (at.kind === "refused") return at;
  if (at.kind === "nowhere") return { kind: "none" };
  if (!hasAReader(at.path)) return { kind: "no-reader" };

  const read = readOrdinary(at.path);
  if (read.kind === "absent") return { kind: "refused", why: "the file was gone by the time it was read" };
  if (read.kind === "unreadable") return { kind: "refused", why: read.why };
  const located = shapeFor(looperRoot(), at.path, read.text, at.line, REPORT_DEPTH);
  if (located.kind === "not-found") return { kind: "no-shape", why: located.why };

  return {
    kind: "drawn",
    shape: render(located.shape, 0),
    around:
      located.kind === "around"
        ? { kind: "statement", line: at.line, startsAt: located.startsAt }
        : { kind: "exact" },
  };
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
  const body = bodyOf({ kind: request.kind, about: part.name, from: originOf(looperRoot()), id, wrong, instead, shape });
  const title = titleOf(part.name, wrong);
  const kept = keep(
    request.root,
    request.home,
    { id, state: "written", on: today(), title, print: printOf(body) },
    body,
  );
  if (kept.kind === "already") return kept;
  if (kept.kind !== "kept") return { kind: "refused", why: kept.why };

  return { kind: "written", id, title, path: kept.path, body, notOurs: notLoopers(`${wrong}\n${instead}`, ours) };
}

function refusedNow(told: Told, root: string): string {
  const names = namesOf(root);
  if (names.kind === "unreadable") return names.why;
  const ours = looperWords();
  const stopped = [told.wrong, told.instead].flatMap((said) => refusedIn(said, ours, names.names));
  if (stopped.length > 0) return `these would be refused: ${stopped.map((one) => one.word).join(", ")}`;
  if (told.shape.kind !== "drawn") return "";
  const leaks = leaksInShape(told.shape.shape);
  return leaks.length === 0 ? "" : `its shape carries ${leaks.map((one) => one.word).join(", ")}`;
}

export function whyNotNow(told: Told, root: string): string {
  if (!KINDS.includes(told.kind)) return `"${told.kind}" is not a kind of report`;
  const part = partNamed(told.about);
  if (part.kind !== "ours" || part.name !== told.about) return `"${told.about}" is not one of looper's own names`;
  if (!A_SOURCE.test(told.from)) return "the line that says which looper wrote it is not one looper writes";
  if (!isAnId(told.id)) return "its id is not the id of a report";
  for (const [called, said] of [
    ["what looper did", told.wrong],
    ["what it should have done", told.instead],
  ] as const) {
    const why = unsaid(called, said);
    if (why.length > 0) return why;
    if (onOneLine(said) !== said) return `${called} is not written on one line`;
  }
  return refusedNow(told, root);
}
