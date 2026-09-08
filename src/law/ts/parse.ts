import { parse } from "@babel/parser";

import { fieldAt, reasonFrom } from "../../fields.ts";

export type Node = {
  readonly type: string;
  readonly loc: { readonly start: { readonly line: number } } | null;
  readonly [key: string]: unknown;
};

export type Where = { readonly start: { readonly line: number; readonly column: number } };

export type Comment = {
  readonly kind: "line" | "block";
  readonly value: string;
  readonly loc: Where | null;
};

export type Parsed =
  | {
      readonly kind: "parsed";
      readonly root: Node;
      readonly comments: readonly Comment[];
    }
  | { readonly kind: "unreadable"; readonly line: number; readonly detail: string };

const TS_PLUGINS: readonly string[] = ["typescript", "decorators", "decoratorAutoAccessors"];

const TSX_PLUGINS: readonly string[] = [
  "typescript",
  "jsx",
  "decorators",
  "decoratorAutoAccessors",
];

const TS_PLUGINS_LEGACY: readonly string[] = [
  "typescript",
  "decorators-legacy",
  "decoratorAutoAccessors",
];

const TSX_PLUGINS_LEGACY: readonly string[] = [
  "typescript",
  "jsx",
  "decorators-legacy",
  "decoratorAutoAccessors",
];

export function pluginsFor(file: string): readonly string[] {
  if (file.endsWith(".tsx") || file.endsWith(".jsx")) return TSX_PLUGINS;
  return TS_PLUGINS;
}

export function legacyPluginsFor(file: string): readonly string[] {
  if (file.endsWith(".tsx") || file.endsWith(".jsx")) return TSX_PLUGINS_LEGACY;
  return TS_PLUGINS_LEGACY;
}

type Remembered = {
  readonly file: string;
  readonly text: string;
  readonly parsed: Parsed;
};

let lastParse: Remembered | null = null;

let parsesDone = 0;

export function parsesSoFar(): number {
  return parsesDone;
}

export function parseSource(file: string, text: string): Parsed {
  if (lastParse !== null && lastParse.file === file && lastParse.text === text) {
    return lastParse.parsed;
  }
  parsesDone += 1;
  const parsed = parseFresh(file, text);
  lastParse = { file, text, parsed };
  return parsed;
}

function parseFresh(file: string, text: string): Parsed {
  const standing = parseWith(file, text, pluginsFor(file));
  if (standing.kind === "parsed") return standing;
  const legacy = parseWith(file, text, legacyPluginsFor(file));
  if (legacy.kind === "parsed") return legacy;
  return standing;
}

function parseWith(file: string, text: string, plugins: readonly string[]): Parsed {
  try {
    const ast = parse(text, {
      sourceType: "module",
      errorRecovery: false,
      plugins: [...plugins],
    });
    const program: unknown = ast.program;
    if (!isNode(program)) {
      return { kind: "unreadable", line: 0, detail: "the parser returned no program" };
    }
    return { kind: "parsed", root: program, comments: commentsIn(ast.comments) };
  } catch (cause) {
    const line = lineOf(cause);
    const detail = reasonFrom(cause);
    return { kind: "unreadable", line, detail };
  }
}

function lineOf(cause: unknown): number {
  if (cause === null || typeof cause !== "object") return 0;
  const held = fieldAt(cause, "loc");
  if (held === null || typeof held !== "object") return 0;
  const line = fieldAt(held, "line");
  if (typeof line === "number") return line;
  return 0;
}

export function lineOfNode(node: Node): number {
  if (node.loc === null) return 0;
  return node.loc.start.line;
}

function whereOf(held: unknown): Where | null {
  const start = fieldAt(fieldAt(held, "loc"), "start");
  const line = fieldAt(start, "line");
  const column = fieldAt(start, "column");
  if (typeof line !== "number" || typeof column !== "number") return null;
  return { start: { line, column } };
}

function commentOf(held: unknown): Comment | null {
  const said = fieldAt(held, "value");
  if (typeof said !== "string") return null;
  const kind = fieldAt(held, "type") === "CommentLine" ? "line" : "block";
  return { kind, value: said, loc: whereOf(held) };
}

function commentsIn(held: unknown): readonly Comment[] {
  if (!Array.isArray(held)) return [];
  const found: Comment[] = [];
  for (const item of held) {
    const comment = commentOf(item);
    if (comment !== null) found.push(comment);
  }
  return found;
}

export function isNode(value: unknown): value is Node {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  return typeof fieldAt(value, "type") === "string";
}

export function walk(root: Node, visit: (node: Node) => void): void {
  visit(root);
  for (const key of Object.keys(root)) {
    if (key === "loc") continue;
    const held = root[key];
    if (Array.isArray(held)) {
      for (const item of held) {
        if (isNode(item)) walk(item, visit);
      }
      continue;
    }
    if (isNode(held)) walk(held, visit);
  }
}

