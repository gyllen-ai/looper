import { posix } from "node:path";

import { fieldAt } from "../src/fields.ts";
import { isNode, parseSource, type Node } from "../src/law/ts/parse.ts";

export type Reach = { readonly line: number; readonly what: string };

export type Held = "ours" | "installed";

export const STARTS_A_PROCESS = "node:child_process";

export const WHERE_PROGRAMS_ARE_STARTED = "src/start.ts";

const LOADS_OUR_SOURCE = "node:module";

const WHERE_OUR_SOURCE_IS_LOADED = "bin/looper.js";

const MAY_BE_LOADED_ANYWHERE: readonly string[] = [
  "node:fs",
  "node:path",
  "node:os",
  "node:crypto",
  "node:readline",
  "@babel/parser",
];

const MAY_BE_LOADED_ONLY_IN: Readonly<Record<string, string>> = {
  [STARTS_A_PROCESS]: WHERE_PROGRAMS_ARE_STARTED,
  [LOADS_OUR_SOURCE]: WHERE_OUR_SOURCE_IS_LOADED,
};

const OF_THE_LOADER: readonly string[] = ["registerHooks", "stripTypeScriptTypes"];

const OF_PROCESS: readonly string[] = [
  "argv",
  "cwd",
  "env",
  "exit",
  "exitCode",
  "on",
  "platform",
  "removeAllListeners",
  "stdin",
  "stdout",
  "version",
];

const OF_THIS_MODULE: readonly string[] = ["dirname", "filename", "url"];

const THE_OUTPUT = "stdout";

const THE_INPUT = "stdin";

const OF_THE_OUTPUT: readonly string[] = ["write"];

const THE_INPUT_IS_HANDED_OVER_AS = "input";

const NEVER_NAMED: readonly string[] = [
  "globalThis",
  "global",
  "eval",
  "Function",
  "Reflect",
  "require",
  "createRequire",
  "fetch",
  "WebSocket",
  "EventSource",
  "XMLHttpRequest",
  "navigator",
  "Worker",
];

const MAKES_CODE_FROM_TEXT = "constructor";

const WHERE_OURS_LIVES: readonly string[] = ["src/", "bin/"];

const READ_AS_CODE: readonly string[] = [".ts", ".js"];

const AN_INSTALLED_FILE_MAY_NOT_LOAD: readonly string[] = [
  "child_process",
  "cluster",
  "dgram",
  "dns",
  "http",
  "http2",
  "https",
  "inspector",
  "module",
  "net",
  "quic",
  "repl",
  "test",
  "tls",
  "vm",
  "wasi",
  "worker_threads",
];

const AN_INSTALLED_FILE_MAY_NOT_NAME: readonly string[] = ["fetch", "WebSocket", "EventSource", "XMLHttpRequest", "eval"];

const HIDDEN_DOORS_OF_PROCESS: readonly string[] = ["binding", "dlopen", "_linkedBinding", "getBuiltinModule", "mainModule"];

const NAMES_A_MEMBER: readonly string[] = ["MemberExpression", "OptionalMemberExpression"];

const NAMES_A_KEY: readonly string[] = ["ObjectProperty", "ObjectMethod", "ClassMethod", "ClassProperty", "ClassAccessorProperty"];

const NAMES_A_LABEL: readonly string[] = ["LabeledStatement", "BreakStatement", "ContinueStatement"];

const IMPORTS_FROM: readonly string[] = ["ImportDeclaration", "ExportNamedDeclaration", "ExportAllDeclaration"];

const WRAPS_AN_EXPRESSION: readonly string[] = [
  "TSAsExpression",
  "TSSatisfiesExpression",
  "TSNonNullExpression",
  "TSTypeAssertion",
  "TSInstantiationExpression",
];

const HOLDS_CODE_THOUGH_NAMED_FOR_TYPES: readonly string[] = [
  "TSImportEqualsDeclaration",
  "TSExternalModuleReference",
  "TSEnumDeclaration",
  "TSEnumBody",
  "TSEnumMember",
  "TSModuleDeclaration",
  "TSModuleBlock",
  "TSParameterProperty",
  "TSExportAssignment",
];

const ONLY_ABOUT_TYPES: readonly string[] = [
  "typeAnnotation",
  "typeParameters",
  "typeArguments",
  "returnType",
  "superTypeParameters",
  "superTypeArguments",
  "implements",
];

const NODE_PREFIX = /^node:/;

export type Aliases = ReadonlyMap<string, readonly string[]>;

export const NO_ALIASES: Aliases = new Map<string, readonly string[]>();

type Reading = {
  readonly file: string;
  readonly held: Held;
  readonly aliases: Aliases;
  readonly loader: Set<string>;
  readonly found: Reach[];
};

function lineOf(node: Node): number {
  return node.loc === null ? 0 : node.loc.start.line;
}

function textOf(node: unknown): string | undefined {
  if (!isNode(node) || node.type !== "StringLiteral") return undefined;
  const value = node["value"];
  return typeof value === "string" ? value : undefined;
}

function nameOf(node: unknown): string | undefined {
  if (!isNode(node) || node.type !== "Identifier") return undefined;
  const name = node["name"];
  return typeof name === "string" ? name : undefined;
}

function unwrapped(node: unknown): unknown {
  if (isNode(node) && (WRAPS_AN_EXPRESSION.includes(node.type) || node.type === "ParenthesizedExpression")) {
    return unwrapped(node["expression"]);
  }
  return node;
}

function memberNamed(node: Node): string | undefined {
  const property = node["property"];
  return node["computed"] === true ? textOf(property) : nameOf(property);
}

function builtInNamed(specifier: string): string {
  const [first] = specifier.replace(NODE_PREFIX, "").split("/");
  return first === undefined ? "" : first;
}

function whyNotOurLoad(specifier: string, file: string): string {
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    const reached = posix.normalize(posix.join(posix.dirname(file), specifier));
    const kept = WHERE_OURS_LIVES.some((part) => reached.startsWith(part));
    const read = READ_AS_CODE.some((ending) => reached.endsWith(ending));
    return kept && read ? "" : `it loads ${specifier}, which is not one of looper's own source files, so nothing here has read it`;
  }
  const only = MAY_BE_LOADED_ONLY_IN[specifier];
  if (only !== undefined) {
    return only === file ? "" : `it loads ${specifier}, which only ${only} may: it ${specifier === STARTS_A_PROCESS ? "starts other programs" : "can load anything at all"}`;
  }
  if (MAY_BE_LOADED_ANYWHERE.includes(specifier)) return "";
  return `it loads ${specifier}, which is not on the short list of what looper loads`;
}

function whyNotThisLoad(source: unknown, reading: Reading): string {
  const specifier = textOf(source);
  if (specifier === undefined) {
    return "it loads a module whose name is put together when the program runs, so nothing that reads the source can tell which";
  }
  if (reading.held === "ours") return whyNotOurLoad(specifier, reading.file);
  if (specifier.startsWith("#")) {
    const leads = reading.aliases.get(specifier);
    return leads !== undefined && leads.length > 0 && leads.every((one) => one.startsWith("./"))
      ? ""
      : `it loads ${specifier}, a name its package resolves to something other than a file of its own`;
  }
  if (specifier.includes(":") !== NODE_PREFIX.test(specifier)) {
    return `it loads ${specifier}, which is not the name of a module but an address`;
  }
  const named = builtInNamed(specifier);
  return AN_INSTALLED_FILE_MAY_NOT_LOAD.includes(named) ? `it loads ${specifier}, which can connect, listen, start a program or load one` : "";
}

function isOnlyAName(node: Node, parent: Node | undefined): boolean {
  if (parent === undefined) return false;
  if (NAMES_A_MEMBER.includes(parent.type)) return parent["property"] === node && parent["computed"] !== true;
  if (NAMES_A_KEY.includes(parent.type)) return parent["key"] === node && parent["computed"] !== true;
  if (NAMES_A_LABEL.includes(parent.type)) return parent["label"] === node;
  if (parent.type === "ImportSpecifier") return parent["imported"] === node && parent["local"] !== node;
  if (parent.type === "ExportSpecifier") return parent["exported"] === node && parent["local"] !== node;
  return false;
}

function reachedThrough(node: Node, parent: Node | undefined, allowed: readonly string[]): boolean {
  if (parent === undefined || !NAMES_A_MEMBER.includes(parent.type)) return false;
  if (unwrapped(parent["object"]) !== node || parent["computed"] === true) return false;
  const named = nameOf(parent["property"]);
  return named !== undefined && allowed.includes(named);
}

function isHandedOverAs(node: Node, above: Node | undefined, key: string): boolean {
  return above !== undefined && above.type === "ObjectProperty" && above["value"] === node && nameOf(above["key"]) === key;
}

function whyNotThisStream(parent: Node | undefined, above: Node | undefined): string {
  if (parent === undefined) return "";
  const stream = nameOf(parent["property"]);
  if (stream === THE_OUTPUT && !reachedThrough(parent, above, OF_THE_OUTPUT)) {
    return "it uses process.stdout for something other than writing to it. Piped, the output is a socket, and a socket connects";
  }
  if (stream === THE_INPUT && !isHandedOverAs(parent, above, THE_INPUT_IS_HANDED_OVER_AS)) {
    return "it uses process.stdin for something other than handing it to the reader of lines. Piped, the input is a socket, and a socket connects";
  }
  return "";
}

function whyNotThisName(node: Node, parent: Node | undefined, above: Node | undefined, reading: Reading): string {
  const name = nameOf(node);
  if (name === undefined || isOnlyAName(node, parent)) return "";
  if (reading.held === "installed") {
    return AN_INSTALLED_FILE_MAY_NOT_NAME.includes(name) ? `it names ${name}, which connects or makes code from text with no import` : "";
  }
  if (NEVER_NAMED.includes(name)) {
    return `it names ${name}, which connects, loads or makes code with no import anybody can read. Nothing in looper is called that`;
  }
  if (name === "process" && !reachedThrough(node, parent, OF_PROCESS)) {
    return `it uses process for something other than ${OF_PROCESS.join(", ")}. Held in a variable or asked for anything else, it hands out Node's own modules without an import`;
  }
  if (name === "process") return whyNotThisStream(parent, above);
  if (reading.loader.has(name) && parent?.type !== "ImportDefaultSpecifier" && !reachedThrough(node, parent, OF_THE_LOADER)) {
    return `it uses ${LOADS_OUR_SOURCE} for something other than ${OF_THE_LOADER.join(" and ")}, and that module can load anything by name`;
  }
  return "";
}

function whyNotThisMember(node: Node, reading: Reading): string {
  const named = memberNamed(node);
  if (reading.held === "installed") {
    const owner = nameOf(unwrapped(node["object"]));
    return owner === "process" && named !== undefined && HIDDEN_DOORS_OF_PROCESS.includes(named)
      ? `it uses process.${named}, which hands out Node's own modules without an import`
      : "";
  }
  return named === MAKES_CODE_FROM_TEXT ? "it reaches for .constructor, and a function's constructor makes code out of text" : "";
}

function whyNotThisImport(node: Node, reading: Reading): string {
  const from = textOf(node["source"]);
  if (reading.held !== "ours" || from !== LOADS_OUR_SOURCE || !Array.isArray(node["specifiers"])) return "";
  for (const one of node["specifiers"]) {
    if (!isNode(one)) continue;
    const local = nameOf(one["local"]);
    if (one.type === "ImportSpecifier") {
      const taken = nameOf(one["imported"]);
      if (taken === undefined || !OF_THE_LOADER.includes(taken)) {
        return `it takes ${String(taken)} from ${LOADS_OUR_SOURCE}, which can load anything by name`;
      }
      continue;
    }
    if (local !== undefined) reading.loader.add(local);
  }
  return "";
}

function whyNotThisKey(node: Node): string {
  const key = node["key"];
  const named = node["computed"] === true ? textOf(key) : nameOf(key) === undefined ? textOf(key) : nameOf(key);
  return named === MAKES_CODE_FROM_TEXT ? "it takes a constructor out by name, and a function's constructor makes code out of text" : "";
}

function whyNot(node: Node, parent: Node | undefined, above: Node | undefined, reading: Reading): string {
  if (IMPORTS_FROM.includes(node.type)) {
    const source = node["source"];
    if (source === null || source === undefined) return "";
    const why = whyNotThisLoad(source, reading);
    return why.length > 0 ? why : whyNotThisImport(node, reading);
  }
  if (node.type === "ImportExpression") return whyNotThisLoad(node["source"], reading);
  if (node.type === "TSExternalModuleReference") return whyNotThisLoad(node["expression"], reading);
  if (node.type === "CallExpression") {
    const callee = unwrapped(node["callee"]);
    const [first] = Array.isArray(node["arguments"]) ? node["arguments"] : [];
    if (isNode(callee) && callee.type === "Import") return whyNotThisLoad(first, reading);
    if (reading.held === "installed" && nameOf(callee) === "require") return whyNotThisLoad(first, reading);
    return "";
  }
  if (node.type === "MetaProperty") {
    return reading.held === "installed" || reachedThrough(node, parent, OF_THIS_MODULE)
      ? ""
      : `it uses import.meta for something other than ${OF_THIS_MODULE.join(", ")}`;
  }
  if (NAMES_A_MEMBER.includes(node.type)) return whyNotThisMember(node, reading);
  if (node.type === "ObjectProperty" && reading.held === "ours") return whyNotThisKey(node);
  if (node.type === "Identifier") return whyNotThisName(node, parent, above, reading);
  return "";
}

function isOnlyAboutTypes(node: Node): boolean {
  return node.type.startsWith("TS") && !WRAPS_AN_EXPRESSION.includes(node.type) && !HOLDS_CODE_THOUGH_NAMED_FOR_TYPES.includes(node.type);
}

function visit(node: Node, parent: Node | undefined, above: Node | undefined, reading: Reading): void {
  if (isOnlyAboutTypes(node)) return;
  const why = whyNot(node, parent, above, reading);
  if (why.length > 0) reading.found.push({ line: lineOf(node), what: why });
  if (node.type === "MetaProperty") return;
  const seenThrough = WRAPS_AN_EXPRESSION.includes(node.type) || node.type === "ParenthesizedExpression";
  const within = seenThrough ? parent : node;
  const over = seenThrough ? above : parent;
  for (const key of Object.keys(node)) {
    if (key === "loc" || ONLY_ABOUT_TYPES.includes(key)) continue;
    const held = node[key];
    if (Array.isArray(held)) {
      for (const item of held) {
        if (isNode(item)) visit(item, within, over, reading);
      }
      continue;
    }
    if (isNode(held)) visit(held, within, over, reading);
  }
}

export function reachesIn(file: string, text: string, held: Held, aliases: Aliases): readonly Reach[] {
  const parsed = parseSource(file, text);
  if (parsed.kind === "unreadable") {
    return [{ line: parsed.line, what: `it could not be read as code (${parsed.detail}), so nothing can be said about what it loads` }];
  }
  const reading: Reading = { file, held, aliases, loader: new Set<string>(), found: [] };
  visit(parsed.root, undefined, undefined, reading);
  return reading.found;
}

export function sourceOf(node: unknown, text: string): string {
  const start = fieldAt(node, "start");
  const end = fieldAt(node, "end");
  return typeof start === "number" && typeof end === "number" ? text.slice(start, end) : "";
}
