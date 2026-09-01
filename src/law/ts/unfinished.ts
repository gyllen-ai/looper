import type { Check, Finding, Subject } from "../engine.ts";
import type { Rule } from "../rule.ts";
import { lineOfNode, parseSource, walk, isNode, type Node } from "./parse.ts";
import { fieldAt } from "../../fields.ts";

export const UNFINISHED: Rule = {
  id: "TS-DEAD:3",
  category: "DEAD",
  pass: "fast",
  bans:
    "a function that exists under a name but does nothing — a declaration, a method, or one bound to a variable — and `throw new Error('not implemented')`",
  why:
    "half-built code that compiles is worse than code that is missing. It passes every check, it looks finished to anyone reading the list of what exists, and it fails in front of whoever is using the thing rather than in front of you. Missing code fails immediately and loudly, which is the cheapest failure there is",
  instead: [
    "write it now, even roughly, so it does something real",
    "delete it, and let whatever calls it fail to build — that is the loudest and cheapest error available",
    "if a step genuinely does nothing yet, say so where the caller can see it, not inside a body that looks complete",
    "a function with no name is not this rule — an argument, a branch of a `??`, a value handed back: it has no name to go stale and says that nothing happens, which is a decision",
  ],
  valve: { kind: "none" },
};

const UNBUILT = /not[ _-]?implemented|unimplemented|\bto[ _-]?do\b|\bfixme\b/i;

function isEmptyBody(value: unknown): boolean {
  if (fieldAt(value, "type") !== "BlockStatement") {
    return false;
  }
  const body = fieldAt(value, "body");
  if (!Array.isArray(body)) return false;
  if (body.length === 0) return true;
  return body.every((held) => {
    if (fieldAt(held, "type") !== "ReturnStatement") return false;
    return fieldAt(held, "argument") === null;
  });
}

function doesItsWorkInTheSignature(node: Node): boolean {
  if (node.type !== "ClassMethod") return false;
  if (fieldAt(node, "kind") !== "constructor") return false;
  if (fieldAt(node, "accessibility") === "private") return true;
  const params = node["params"];
  if (!Array.isArray(params)) return false;
  return params.some((held) => fieldAt(held, "type") === "TSParameterProperty");
}

function functionBody(node: Node): unknown {
  if (doesItsWorkInTheSignature(node)) return null;
  if (
    node.type === "FunctionDeclaration" ||
    node.type === "FunctionExpression" ||
    node.type === "ArrowFunctionExpression" ||
    node.type === "ClassMethod" ||
    node.type === "ObjectMethod"
  ) {
    return node["body"];
  }
  return null;
}

function saysUnbuilt(node: Node): boolean {
  const argument = node["argument"];
  if (argument === null || typeof argument !== "object") return false;
  let found = false;
  walk(argument, (held) => {
    if (held.type !== "StringLiteral" && held.type !== "TemplateElement") return;
    const value = held["value"];
    if (typeof value === "string" && UNBUILT.test(value)) found = true;
    if (value !== null && typeof value === "object") {
      const raw = fieldAt(value, "raw");
      if (typeof raw === "string" && UNBUILT.test(raw)) found = true;
    }
  });
  return found;
}

const WRITTEN_INLINE: readonly string[] = ["ArrowFunctionExpression", "FunctionExpression"];

const HOLDS_A_NAME: readonly string[] = [
  "VariableDeclarator",
  "ObjectProperty",
  "ClassProperty",
];

function boundToAName(root: Node): ReadonlySet<Node> {
  const named = new Set<Node>();

  const take = (value: unknown): void => {
    if (!isNode(value)) return;
    if (WRITTEN_INLINE.includes(value.type)) named.add(value);
  };

  walk(root, (node) => {
    if (HOLDS_A_NAME.includes(node.type)) {
      take(node["init"]);
      take(node["value"]);
      return;
    }
    if (node.type === "AssignmentExpression") {
      take(node["right"]);
    }
  });

  return named;
}

function existsUnderAName(node: Node, named: ReadonlySet<Node>): boolean {
  if (WRITTEN_INLINE.includes(node.type)) return named.has(node);
  return true;
}

export const unfinishedCheck: Check = {
  rule: UNFINISHED,

  run(subject: Subject): readonly Finding[] {
    const parsed = parseSource(subject.file, subject.text);
    if (parsed.kind === "unreadable") return [];

    const found: Finding[] = [];
    const named = boundToAName(parsed.root);
    walk(parsed.root, (node) => {
      if (node.type === "ThrowStatement" && saysUnbuilt(node)) {
        found.push({ line: lineOfNode(node) });
        return;
      }
      if (!existsUnderAName(node, named)) return;
      if (isEmptyBody(functionBody(node))) found.push({ line: lineOfNode(node) });
    });
    return found;
  },
};
