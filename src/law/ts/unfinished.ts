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
    "an empty callback written inline — `addEventListener('click', () => {})` — is not this rule: it has no name to go stale and says that nothing happens, which is a decision",
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

function writtenInlineAsAnArgument(root: Node): ReadonlySet<Node> {
  const inline = new Set<Node>();

  const take = (value: unknown): void => {
    if (value === null || typeof value !== "object") return;
    const held = fieldAt(value, "type");
    if (held === "ArrowFunctionExpression" || held === "FunctionExpression") {
      if (isNode(value)) inline.add(value);
    }
  };

  walk(root, (node) => {
    if (node.type === "CallExpression" || node.type === "NewExpression") {
      const args = node["arguments"];
      if (Array.isArray(args)) for (const one of args) take(one);
      return;
    }
    if (node.type === "JSXExpressionContainer") {
      take(node["expression"]);
    }
  });

  return inline;
}

export const unfinishedCheck: Check = {
  rule: UNFINISHED,

  run(subject: Subject): readonly Finding[] {
    const parsed = parseSource(subject.file, subject.text);
    if (parsed.kind === "unreadable") return [];

    const found: Finding[] = [];
    const inline = writtenInlineAsAnArgument(parsed.root);
    walk(parsed.root, (node) => {
      if (node.type === "ThrowStatement" && saysUnbuilt(node)) {
        found.push({ line: lineOfNode(node) });
        return;
      }
      if (inline.has(node)) return;
      if (isEmptyBody(functionBody(node))) found.push({ line: lineOfNode(node) });
    });
    return found;
  },
};
