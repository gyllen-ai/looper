import { fieldAt } from "../src/fields.ts";
import { isNode, parseSource, type Node } from "../src/law/ts/parse.ts";

export type Reach = { readonly line: number; readonly what: string };

export const STARTS_A_PROCESS = "child_process";

const SPEAKS_OR_LISTENS: readonly string[] = [
  "net",
  "http",
  "https",
  "http2",
  "tls",
  "dgram",
  "dns",
  "inspector",
  "cluster",
  "worker_threads",
  "quic",
];

const CONNECTS_WITH_NO_IMPORT: readonly string[] = ["fetch", "WebSocket", "EventSource", "XMLHttpRequest"];

const THE_WHOLE_PROGRAM: readonly string[] = ["globalThis", "global", "self", "window"];

const REACHES_PAST_THE_IMPORTS: readonly string[] = ["binding", "dlopen", "_linkedBinding", "getBuiltinModule"];

const LOADS_BY_NAME: readonly string[] = ["require", "createRequire"];

const NAMES_A_MEMBER: readonly string[] = ["MemberExpression", "OptionalMemberExpression"];

const NAMES_A_KEY: readonly string[] = [
  "ObjectProperty",
  "ObjectMethod",
  "ClassMethod",
  "ClassProperty",
  "TSPropertySignature",
  "TSMethodSignature",
];

const IMPORTS_FROM: readonly string[] = ["ImportDeclaration", "ExportNamedDeclaration", "ExportAllDeclaration"];

const NODE_PREFIX = /^node:/;

function moduleNamed(specifier: string): string {
  const [first] = specifier.replace(NODE_PREFIX, "").split("/");
  return first === undefined ? "" : first;
}

function lineOf(node: Node): number {
  return node.loc === null ? 0 : node.loc.start.line;
}

function textOf(node: unknown): string | undefined {
  if (!isNode(node)) return undefined;
  if (node.type !== "StringLiteral") return undefined;
  const value = node["value"];
  return typeof value === "string" ? value : undefined;
}

function nameOf(node: unknown): string | undefined {
  if (!isNode(node) || node.type !== "Identifier") return undefined;
  const name = node["name"];
  return typeof name === "string" ? name : undefined;
}

function whyNotThisModule(specifier: string): string {
  const named = moduleNamed(specifier);
  if (named === STARTS_A_PROCESS) return `it loads ${specifier}, which starts other programs`;
  if (SPEAKS_OR_LISTENS.includes(named)) return `it loads ${specifier}, which can open a connection`;
  return "";
}

function whyNotThisLoad(source: unknown, how: string): string {
  const specifier = textOf(source);
  if (specifier === undefined) return `it ${how} a module whose name is put together when the program runs, so nothing that reads the source can tell which`;
  return whyNotThisModule(specifier);
}

function isOnlyAName(node: Node, parent: Node | undefined): boolean {
  if (parent === undefined) return false;
  if (NAMES_A_MEMBER.includes(parent.type)) return parent["property"] === node && parent["computed"] !== true;
  if (NAMES_A_KEY.includes(parent.type)) return parent["key"] === node && parent["computed"] !== true;
  return false;
}

function memberNamed(node: Node): string | undefined {
  const property = node["property"];
  return node["computed"] === true ? textOf(property) : nameOf(property);
}

function whyNot(node: Node, parent: Node | undefined): string {
  if (IMPORTS_FROM.includes(node.type)) {
    const source = node["source"];
    return source === null || source === undefined ? "" : whyNotThisLoad(source, "imports");
  }
  if (node.type === "ImportExpression") return whyNotThisLoad(node["source"], "imports");
  if (node.type === "TSExternalModuleReference") return whyNotThisLoad(node["expression"], "imports");
  if (node.type === "CallExpression") {
    const callee = node["callee"];
    const [first] = Array.isArray(node["arguments"]) ? node["arguments"] : [];
    if (isNode(callee) && callee.type === "Import") return whyNotThisLoad(first, "imports");
    const called = nameOf(callee);
    if (called !== undefined && LOADS_BY_NAME.includes(called)) return whyNotThisLoad(first, "loads");
    return "";
  }
  if (NAMES_A_MEMBER.includes(node.type)) {
    const owner = nameOf(node["object"]);
    const named = memberNamed(node);
    if (owner === undefined || named === undefined) return "";
    if (owner === "process" && REACHES_PAST_THE_IMPORTS.includes(named)) {
      return `it uses process.${named}, which hands out Node's own modules without an import anybody can read`;
    }
    if (THE_WHOLE_PROGRAM.includes(owner) && CONNECTS_WITH_NO_IMPORT.includes(named)) {
      return `it uses ${owner}.${named}, which connects without importing anything`;
    }
    return "";
  }
  if (node.type === "Identifier") {
    const name = nameOf(node);
    if (name === undefined || isOnlyAName(node, parent)) return "";
    if (CONNECTS_WITH_NO_IMPORT.includes(name)) return `it uses ${name}, which connects without importing anything`;
    if (name === "createRequire") return "it uses createRequire, which loads a module by a name no import shows";
  }
  return "";
}

function visit(node: Node, parent: Node | undefined, found: Reach[]): void {
  const why = whyNot(node, parent);
  if (why.length > 0) found.push({ line: lineOf(node), what: why });
  for (const key of Object.keys(node)) {
    if (key === "loc") continue;
    const held = node[key];
    if (Array.isArray(held)) {
      for (const item of held) {
        if (isNode(item)) visit(item, node, found);
      }
      continue;
    }
    if (isNode(held)) visit(held, node, found);
  }
}

export function reachesIn(file: string, text: string): readonly Reach[] {
  const parsed = parseSource(file, text);
  if (parsed.kind === "unreadable") {
    return [{ line: parsed.line, what: `it could not be read as code (${parsed.detail}), so nothing can be said about what it loads` }];
  }
  const found: Reach[] = [];
  visit(parsed.root, undefined, found);
  return found;
}

export function sourceOf(node: unknown, text: string): string {
  const start = fieldAt(node, "start");
  const end = fieldAt(node, "end");
  return typeof start === "number" && typeof end === "number" ? text.slice(start, end) : "";
}
