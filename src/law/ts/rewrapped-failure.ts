import type { Check, Finding, Subject } from "../engine.ts";
import type { Rule } from "../rule.ts";
import { isNode, lineOfNode, parseSource, type Node } from "./parse.ts";
import { fieldAt } from "../../fields.ts";

export const REWRAPPED_FAILURE: Rule = {
  id: "TS-ERROR:10",
  category: "ERROR",
  pass: "fast",
  bans: "throwing a built-in `Error`, `TypeError` or the rest of that family from inside a `catch`",
  why:
    "every generic wrap adds one sentence and removes one trace. Three layers of it and the log says 'could not save', 'could not save order' and 'request failed', and none of the three names the file that actually broke. A built-in Error also cannot be caught by kind — the caller who wants to retry the network failure and give up on the bad input has one type for both, so it does neither",
  instead: [
    "throw new CouldNotRead(path, { cause }) — a class named after the failure, which the caller can catch by name",
    "rethrow the original and let the layer that knows what to do with it decide",
    "hand it back as a value: return { kind: 'unreadable', detail: reasonFrom(cause) }",
  ],
  valve: { kind: "none" },
};

const BUILT_IN_ERRORS = new Set([
  "Error",
  "TypeError",
  "RangeError",
  "SyntaxError",
  "EvalError",
  "ReferenceError",
  "URIError",
  "AggregateError",
]);

const A_FUNCTION: readonly string[] = [
  "FunctionDeclaration",
  "FunctionExpression",
  "ArrowFunctionExpression",
  "ObjectMethod",
  "ClassMethod",
];

function nameOf(value: unknown): string {
  const name = fieldAt(value, "name");
  return typeof name === "string" ? name : "";
}

function isABuiltInError(value: unknown): boolean {
  if (fieldAt(value, "type") !== "NewExpression") return false;
  return BUILT_IN_ERRORS.has(nameOf(fieldAt(value, "callee")));
}

function throwsInside(node: Node, found: Finding[]): void {
  if (node.type === "ThrowStatement" && isABuiltInError(node["argument"])) {
    found.push({ line: lineOfNode(node) });
  }
  for (const key of Object.keys(node)) {
    if (key === "loc") continue;
    const held = node[key];
    if (Array.isArray(held)) {
      for (const item of held) {
        if (isNode(item) && !A_FUNCTION.includes(item.type)) throwsInside(item, found);
      }
      continue;
    }
    if (isNode(held) && !A_FUNCTION.includes(held.type)) throwsInside(held, found);
  }
}

function catchesIn(node: Node, found: Finding[]): void {
  if (node.type === "CatchClause") {
    const body = node["body"];
    if (isNode(body)) throwsInside(body, found);
  }
  for (const key of Object.keys(node)) {
    if (key === "loc") continue;
    const held = node[key];
    if (Array.isArray(held)) {
      for (const item of held) {
        if (isNode(item)) catchesIn(item, found);
      }
      continue;
    }
    if (isNode(held)) catchesIn(held, found);
  }
}

export const rewrappedFailureCheck: Check = {
  rule: REWRAPPED_FAILURE,

  run(subject: Subject): readonly Finding[] {
    const parsed = parseSource(subject.file, subject.text);
    if (parsed.kind === "unreadable") return [];
    const found: Finding[] = [];
    catchesIn(parsed.root, found);
    return found;
  },
};
