import type { Concessions } from "../concessions.ts";
import type { Check, Finding, Subject } from "../engine.ts";
import type { Rule } from "../rule.ts";
import { isNode, lineOfNode, parseSource, walk, type Node } from "./parse.ts";
import { fieldAt } from "../../fields.ts";
import { convertsOnly } from "./vanished-error.ts";

export const FALLBACK_ROUTE: Rule = {
  id: "TS-TRUTH:4",
  category: "TRUTH",
  pass: "fast",
  bans:
    "a second route taken because the first one failed or was not there: a `catch` or a `.catch()` handler that answers by calling something else, `x || other()` and `x ?? other()` where the right side is a call, an absence check whose branch returns a call, and a capability probe on `window`, `globalThis`, `navigator`, `document` or `self`. Three shapes are not a second route and never fire: a call that answers a question rather than supplying a value (`x || names.has(n)`, and the same for `includes`, `startsWith`, `endsWith`, `test`, `some` and `every`), a function calling itself again, and a test on `length` or `size`, because an empty collection is a value and not an absence",
  why:
    "a fallback is a second implementation of the same behaviour, and from the moment it exists nobody can say which one ran. The failure that sent the program down the second path is invisible one line later, so the slow route quietly becomes the normal route and nothing reports it, while the first one rots because it is never the one being read when something looks wrong. It is also the shape that hides an outage: the primary was down for a week and every screen looked fine",
  instead: [
    "let the failure travel, and the caller decides: `catch (cause) { throw new CouldNotRead(path, cause) }`",
    "name the absence rather than papering over it: `if (row === undefined) return { kind: 'absent' }`",
    "one route, chosen once where the program is wired up, and passed down, rather than chosen again at every point of use",
    "a capability the program needs is settled at the edge and carried as a typed fact, never asked again halfway down",
    "if the second route is genuinely needed, ask the person whose project this is, say why the first one is not enough, and write the answer down: a `decisions` entry naming the file, what it costs and what would have to be true to take it out again. A pardon here is only honoured while that entry stands",
  ],
  valve: {
    kind: "knob",
    key: "[exempt]",
    note: "a pardon for this rule is honoured only while a decisions entry names the same file; an unbacked pardon is itself a violation",
  },
};

const A_HOST: readonly string[] = ["window", "globalThis", "navigator", "document", "self"];

const A_PROBED_TYPE: readonly string[] = ["function", "undefined"];

const A_TRANSFORM: readonly string[] = [
  "map",
  "filter",
  "slice",
  "concat",
  "join",
  "flat",
  "flatMap",
  "keys",
  "values",
  "entries",
  "split",
  "reverse",
  "sort",
];

const A_QUESTION: readonly string[] = [
  "includes",
  "has",
  "startsWith",
  "endsWith",
  "test",
  "some",
  "every",
];

const A_COUNT: readonly string[] = ["length", "size"];

const A_FUNCTION: readonly string[] = [
  "FunctionDeclaration",
  "FunctionExpression",
  "ArrowFunctionExpression",
  "ObjectMethod",
  "ClassMethod",
];

const A_PLACE: readonly string[] = ["Identifier", "MemberExpression", "OptionalMemberExpression"];

const A_HANDLER: readonly string[] = ["ArrowFunctionExpression", "FunctionExpression"];

const TESTED: readonly string[] = [
  "IfStatement",
  "WhileStatement",
  "DoWhileStatement",
  "ConditionalExpression",
  "ForStatement",
];

function unwrapped(value: unknown): unknown {
  const type = fieldAt(value, "type");
  if (type === "AwaitExpression") return unwrapped(fieldAt(value, "argument"));
  if (type === "TSAsExpression" || type === "TSNonNullExpression") {
    return unwrapped(fieldAt(value, "expression"));
  }
  return value;
}

function transformsInPlace(callee: unknown): boolean {
  const property = fieldAt(fieldAt(callee, "property"), "name");
  return typeof property === "string" && A_TRANSFORM.includes(property);
}

function answersAQuestion(callee: unknown): boolean {
  const property = fieldAt(fieldAt(callee, "property"), "name");
  return typeof property === "string" && A_QUESTION.includes(property);
}

function countsRather(value: unknown): boolean {
  const held = unwrapped(value);
  if (!isNode(held)) return false;
  if (held.type !== "MemberExpression" && held.type !== "OptionalMemberExpression") return false;
  const property = fieldAt(held["property"], "name");
  return typeof property === "string" && A_COUNT.includes(property);
}

function isARoute(value: unknown, itself: ReadonlySet<Node>): boolean {
  const held = unwrapped(value);
  if (!isNode(held)) return false;
  if (held.type !== "CallExpression" && held.type !== "OptionalCallExpression") return false;
  if (itself.has(held)) return false;
  const callee = held["callee"];
  return !convertsOnly(callee) && !transformsInPlace(callee) && !answersAQuestion(callee);
}

function isAPlace(value: unknown): boolean {
  const held = unwrapped(value);
  if (!isNode(held)) return false;
  return A_PLACE.includes(held.type);
}

function isAbsent(value: unknown): boolean {
  const held = unwrapped(value);
  if (!isNode(held)) return false;
  if (held.type === "NullLiteral") return true;
  return held.type === "Identifier" && fieldAt(held, "name") === "undefined";
}

function mentions(value: unknown, name: string): boolean {
  if (!isNode(value)) return false;
  let found = false;
  walk(value, (node) => {
    if (node.type !== "Identifier") return;
    if (fieldAt(node, "name") === name) found = true;
  });
  return found;
}

function walkShallow(root: Node, visit: (node: Node) => void): void {
  visit(root);
  for (const key of Object.keys(root)) {
    if (key === "loc") continue;
    const held = root[key];
    if (Array.isArray(held)) {
      for (const item of held) {
        if (isNode(item) && !A_FUNCTION.includes(item.type)) walkShallow(item, visit);
      }
      continue;
    }
    if (isNode(held) && !A_FUNCTION.includes(held.type)) walkShallow(held, visit);
  }
}

function routeReturnedIn(body: Node, carrying: string, itself: ReadonlySet<Node>): Node | null {
  let found: Node | null = null;
  walkShallow(body, (node) => {
    if (found !== null) return;
    if (node.type !== "ReturnStatement") return;
    const answer = node["argument"];
    if (!isARoute(answer, itself)) return;
    if (carrying.length > 0 && mentions(answer, carrying)) return;
    found = node;
  });
  return found;
}

function caughtName(node: Node): string {
  const param = node["param"];
  if (fieldAt(param, "type") !== "Identifier") return "";
  const name = fieldAt(param, "name");
  return typeof name === "string" ? name : "";
}

function inlineCatchHandler(node: Node): Node | null {
  const callee = node["callee"];
  if (fieldAt(callee, "type") !== "MemberExpression") return null;
  if (fieldAt(fieldAt(callee, "property"), "name") !== "catch") return null;
  const given = node["arguments"];
  if (!Array.isArray(given) || given.length !== 1) return null;
  const handler: unknown = given[0];
  if (!isNode(handler)) return null;
  if (!A_HANDLER.includes(handler.type)) return null;
  return handler;
}

function handlerName(handler: Node): string {
  const params = handler["params"];
  if (!Array.isArray(params) || params.length === 0) return "";
  const first: unknown = params[0];
  if (!isNode(first) || first.type !== "Identifier") return "";
  const name = fieldAt(first, "name");
  return typeof name === "string" ? name : "";
}

function handlerTakesARoute(handler: Node, itself: ReadonlySet<Node>): boolean {
  const carrying = handlerName(handler);
  const body = handler["body"];
  if (!isNode(body)) return false;
  if (body.type !== "BlockStatement") {
    if (!isARoute(body, itself)) return false;
    return carrying.length === 0 || !mentions(body, carrying);
  }
  return routeReturnedIn(body, carrying, itself) !== null;
}

function absenceTested(test: unknown): boolean {
  const held = unwrapped(test);
  if (!isNode(held)) return false;
  if (held.type === "UnaryExpression" && held["operator"] === "!") {
    return isAPlace(held["argument"]) && !countsRather(held["argument"]);
  }
  if (held.type === "LogicalExpression") {
    if (!absenceTested(held["left"])) return false;
    return absenceTested(held["right"]);
  }
  if (held.type !== "BinaryExpression") return false;
  const operator = held["operator"];
  if (operator !== "===" && operator !== "==") return false;
  if (isAbsent(held["right"])) return isAPlace(held["left"]);
  if (isAbsent(held["left"])) return isAPlace(held["right"]);
  return false;
}

function nameOfFunction(node: Node): string {
  const id = node["id"];
  if (!isNode(id) || id.type !== "Identifier") return "";
  const name = fieldAt(id, "name");
  return typeof name === "string" ? name : "";
}

function markSelfCalls(root: Node): ReadonlySet<Node> {
  const found = new Set<Node>();
  walk(root, (node) => {
    if (!A_FUNCTION.includes(node.type)) return;
    const named = nameOfFunction(node);
    if (named.length === 0) return;
    const body = node["body"];
    if (!isNode(body)) return;
    walkShallow(body, (inner) => {
      if (inner.type !== "CallExpression") return;
      if (fieldAt(inner["callee"], "type") !== "Identifier") return;
      if (fieldAt(inner["callee"], "name") !== named) return;
      found.add(inner);
    });
  });
  return found;
}

function reachesAHost(value: unknown): boolean {
  const held = unwrapped(value);
  if (!isNode(held)) return false;
  if (held.type !== "MemberExpression" && held.type !== "OptionalMemberExpression") return false;
  return A_HOST.includes(rootNameOf(held));
}

function rootNameOf(value: unknown): string {
  const held = unwrapped(value);
  if (!isNode(held)) return "";
  if (held.type === "Identifier") {
    const name = fieldAt(held, "name");
    return typeof name === "string" ? name : "";
  }
  if (held.type === "MemberExpression" || held.type === "OptionalMemberExpression") {
    return rootNameOf(held["object"]);
  }
  return "";
}

function probesATypeof(node: Node): boolean {
  const left = unwrapped(node["left"]);
  if (!isNode(left)) return false;
  if (left.type !== "UnaryExpression" || left["operator"] !== "typeof") return false;
  const said = fieldAt(node["right"], "value");
  if (typeof said !== "string" || !A_PROBED_TYPE.includes(said)) return false;
  return reachesAHost(left["argument"]);
}

function probesAHost(node: Node): boolean {
  if (node.type !== "BinaryExpression") return false;
  const operator = node["operator"];
  if (operator === "in") return A_HOST.includes(rootNameOf(node["right"]));
  if (probesATypeof(node)) return true;
  if (!isAbsent(node["right"])) return false;
  return reachesAHost(node["left"]);
}

function markTests(root: Node): ReadonlySet<Node> {
  const asked = new Set<Node>();
  const take = (value: unknown): void => {
    if (!isNode(value)) return;
    asked.add(value);
    if (value.type !== "LogicalExpression" && value.type !== "UnaryExpression") return;
    take(value["left"]);
    take(value["right"]);
    take(value["argument"]);
  };
  walk(root, (node) => {
    if (TESTED.includes(node.type)) take(node["test"]);
  });
  return asked;
}

const DEFAULTING: readonly string[] = ["||", "??"];

function judgeCatch(node: Node, found: Finding[], itself: ReadonlySet<Node>): void {
  const body = node["body"];
  if (!isNode(body)) return;
  if (routeReturnedIn(body, caughtName(node), itself) === null) return;
  found.push({ line: lineOfNode(node), said: "the catch answers by calling another route" });
}

function judgeCall(node: Node, found: Finding[], itself: ReadonlySet<Node>): void {
  const handler = inlineCatchHandler(node);
  if (handler === null) return;
  if (!handlerTakesARoute(handler, itself)) return;
  found.push({ line: lineOfNode(handler), said: "the catch handler answers by calling another route" });
}

function judgeAbsence(node: Node, found: Finding[], itself: ReadonlySet<Node>): void {
  if (!absenceTested(node["test"])) return;
  const consequent = node["consequent"];
  if (!isNode(consequent)) return;
  if (routeReturnedIn(consequent, "", itself) === null) return;
  found.push({ line: lineOfNode(node), said: "an absence sends the program down a second route" });
}

export const fallbackRouteCheck: Check = {
  rule: FALLBACK_ROUTE,

  run(subject: Subject, _concessions: Concessions): readonly Finding[] {
    const parsed = parseSource(subject.file, subject.text);
    if (parsed.kind === "unreadable") return [];

    const tests = markTests(parsed.root);
    const itself = markSelfCalls(parsed.root);
    const found: Finding[] = [];

    walk(parsed.root, (node) => {
      if (node.type === "CatchClause") {
        judgeCatch(node, found, itself);
        return;
      }
      if (node.type === "CallExpression") {
        judgeCall(node, found, itself);
        return;
      }
      if (node.type === "IfStatement") {
        judgeAbsence(node, found, itself);
        return;
      }
      if (probesAHost(node)) {
        found.push({ line: lineOfNode(node), said: "a capability probe picks the route" });
        return;
      }
      if (node.type !== "LogicalExpression") return;
      const operator = node["operator"];
      if (typeof operator !== "string" || !DEFAULTING.includes(operator)) return;
      if (tests.has(node)) return;
      if (!isAPlace(node["left"]) || !isARoute(node["right"], itself)) return;
      found.push({ line: lineOfNode(node), said: "an absence falls through to another route" });
    });

    return found;
  },
};
