import type { Check, Finding, Subject } from "../engine.ts";
import type { Rule } from "../rule.ts";
import { lineOfNode, parseSource, walk, isNode, type Node } from "./parse.ts";
import { fieldAt } from "../../fields.ts";
import { anyTraced, tracedFrom, valuesBoundIn, type Bindings } from "./bindings.ts";

export const STUB_VALUE: Rule = {
  id: "TS-ERROR:3",
  category: "ERROR",
  pass: "fast",
  bans:
    "answering a failure with a made-up value: `catch { return null }`, `return []`, `return {}`, `return 0`, or `.catch(() => [])`",
  why:
    "one line later nothing can tell the made-up value from a real one, so a database that was down becomes an empty list of users, and a parse that failed becomes a zero in a report. The person who sees it has no way to know anything went wrong",
  instead: [
    "throw new NotFound(id)",
    "catch (cause) { throw new CouldNotRead(path, cause) }",
    "catch (cause) { logger.warn({ cause }, 'cache unreadable'); return { kind: 'absent' } }, which observes it and answers with a named absence. Answering by calling a second route is a fallback, which TS-TRUTH:4 refuses",
    "if the handler's answer is one the `try` already returns, return it from inside the `try` too — a check before the `try` does not count, because the value has to stand on the success path for a reader to see it is the answer rather than a patch over the failure",
  ],
  valve: { kind: "none" },
};

const FABRICATIONS: readonly string[] = [
  "NullLiteral",
  "NumericLiteral",
  "StringLiteral",
  "BooleanLiteral",
];

const ASSERTIONS: readonly string[] = ["TSAsExpression", "TSTypeAssertion", "TSNonNullExpression"];

function withoutAssertion(value: unknown): unknown {
  const type = fieldAt(value, "type");
  if (typeof type !== "string" || !ASSERTIONS.includes(type)) return value;
  return withoutAssertion(fieldAt(value, "expression"));
}

function isFabricated(held: unknown): boolean {
  const value = withoutAssertion(held);
  const type = fieldAt(value, "type");
  if (typeof type !== "string") return false;
  if (type === "UnaryExpression" && fieldAt(value, "operator") === "void") return true;
  if (FABRICATIONS.includes(type)) return true;
  if (type === "Identifier") {
    const name = fieldAt(value, "name");
    return name === "undefined" || name === "NaN";
  }
  if (type === "ArrayExpression") {
    const elements = fieldAt(value, "elements");
    return Array.isArray(elements) && elements.length === 0;
  }
  if (type === "ObjectExpression") {
    const properties = fieldAt(value, "properties");
    return Array.isArray(properties) && properties.length === 0;
  }
  return false;
}

function shapeOf(value: unknown): string | null {
  const held = withoutAssertion(value);
  const type = fieldAt(held, "type");
  if (typeof type !== "string") return null;
  if (type === "ArrayExpression" || type === "ObjectExpression") return type;
  const inner = fieldAt(held, "value");
  if (type === "Identifier") return `name:${String(fieldAt(held, "name"))}`;
  if (inner === null || inner === undefined) return type;
  return `${type}:${String(inner)}`;
}

function answersAlreadyGiven(block: unknown): ReadonlySet<string> {
  const found = new Set<string>();
  if (block === null || typeof block !== "object") return found;
  walk(block, (node) => {
    if (node.type !== "ReturnStatement") return;
    const shape = shapeOf(node["argument"]);
    if (shape !== null) found.add(shape);
  });
  return found;
}

function looksAtTheError(handler: Node): boolean {
  const caught = fieldAt(handler["param"], "name");
  if (typeof caught !== "string") return false;
  let found = false;
  walk(handler, (node) => {
    const test =
      node.type === "IfStatement" || node.type === "ConditionalExpression"
        ? node["test"]
        : node.type === "SwitchStatement"
          ? node["discriminant"]
          : null;
    if (test === null || typeof test !== "object") return;
    walk(test, (held) => {
      if (held.type === "Identifier" && fieldAt(held, "name") === caught) found = true;
    });
  });
  return found;
}

function alsoKnowing(outer: Bindings, inner: Bindings): Bindings {
  const merged = new Map<string, readonly unknown[]>(outer);
  for (const [name, values] of inner) {
    const held = merged.get(name);
    merged.set(name, held === undefined ? values : [...held, ...values]);
  }
  return merged;
}

function fabricatedReturnsIn(body: Node, outer: Bindings): readonly Finding[] {
  const bindings = alsoKnowing(outer, valuesBoundIn(body));
  const found: Finding[] = [];
  walk(body, (node) => {
    if (node.type !== "ReturnStatement") return;
    if (anyTraced(node["argument"], bindings, isFabricated)) {
      found.push({ line: lineOfNode(node) });
    }
  });
  return found;
}

function catchHandlerFindings(node: Node, block: unknown, outer: Bindings): readonly Finding[] {
  const body = node["body"];
  if (body === null || typeof body !== "object") return [];
  if (looksAtTheError(node)) return [];

  const already = answersAlreadyGiven(block);
  const found: Finding[] = [];
  if (!isNode(body)) return [];
  walk(body, (held) => {
    if (held.type !== "ReturnStatement") return;
    const argument = held["argument"];
    const shape = shapeOf(argument);
    if (shape !== null && already.has(shape)) return;
    const bindings = alsoKnowing(outer, valuesBoundIn(body));
    if (!anyTraced(argument, bindings, isFabricated)) return;
    found.push({ line: lineOfNode(held) });
  });
  return found;
}

const HANDLING: readonly string[] = ["catch", "then"];

function isCatchCall(node: Node): boolean {
  if (node.type !== "CallExpression") return false;
  const callee = node["callee"];
  const type = fieldAt(callee, "type");
  if (type !== "MemberExpression") return false;
  const name = fieldAt(fieldAt(callee, "property"), "name");
  return typeof name === "string" && HANDLING.includes(name);
}

function handlersOf(node: Node): readonly unknown[] {
  const args = node["arguments"];
  if (!Array.isArray(args)) return [];
  const name = fieldAt(fieldAt(node["callee"], "property"), "name");
  return name === "then" ? args.slice(1) : args;
}

function catchArgumentFindings(node: Node, bindings: Bindings): readonly Finding[] {
  const found: Finding[] = [];
  for (const held of handlersOf(node)) {
    for (const argument of tracedFrom(held, bindings)) {
      const type = fieldAt(argument, "type");
      if (type !== "ArrowFunctionExpression" && type !== "FunctionExpression") continue;
      const body = fieldAt(argument, "body");
      if (isFabricated(body)) {
        found.push({ line: lineOfNode(node) });
        continue;
      }
      if (isNode(body)) {
        found.push(...fabricatedReturnsIn(body, bindings));
      }
    }
  }
  return found;
}

export const stubValueCheck: Check = {
  rule: STUB_VALUE,

  run(subject: Subject): readonly Finding[] {
    const parsed = parseSource(subject.file, subject.text);
    if (parsed.kind === "unreadable") return [];

    const bindings: Bindings = valuesBoundIn(parsed.root);
    const found: Finding[] = [];
    walk(parsed.root, (node) => {
      if (node.type === "TryStatement") {
        const handler = node["handler"];
        if (!isNode(handler)) return;
        found.push(...catchHandlerFindings(handler, node["block"], bindings));
        return;
      }
      if (isCatchCall(node)) found.push(...catchArgumentFindings(node, bindings));
    });
    return found;
  },
};
