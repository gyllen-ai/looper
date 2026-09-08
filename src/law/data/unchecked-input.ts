import type { Check, Finding, Subject } from "../engine.ts";
import type { Rule } from "../rule.ts";
import { lineOfNode, parseSource, walk, isNode, type Node } from "../ts/parse.ts";
import { fieldAt } from "../../fields.ts";

export const UNCHECKED_INPUT: Rule = {
  id: "DATA:2",
  category: "SECURITY",
  pass: "fast",
  bans: "reading a request body into an object and trusting its fields",
  why:
    "whatever is sent to your program is written by whoever is sending it, and they are not obliged to send what you expected. Unchecked, a missing field becomes undefined halfway through, a number arrives as text and every sum after it is wrong, and an extra field you never asked for gets written to the database. The type you wrote down is a wish until something checks it. This fires on .json() and .formData(), which hand back an object with fields in it, and the only thing that satisfies it is a schema parse: a hand-written check can prove one field and says nothing about the rest, which is the half that hurts you. Reading text is not this rule, because a string has no fields to be wrong about",
  instead: [
    "const order = OrderSchema.parse(await request.json())",
    "const result = OrderSchema.safeParse(body); if (!result.success) return badRequest(result.error)",
  ],
  valve: { kind: "none" },
};

const ARRIVING: readonly string[] = ["json", "formData"];

const CHECKING: readonly string[] = ["parse", "safeParse", "parseAsync", "safeParseAsync"];

function memberName(value: unknown): string | null {
  if (fieldAt(value, "type") !== "MemberExpression") {
    return null;
  }
  const property = fieldAt(value, "property");
  const name = fieldAt(property, "name");
  return typeof name === "string" ? name : null;
}

function isArrivalCall(node: Node): boolean {
  if (node.type !== "CallExpression") return false;
  const name = memberName(node["callee"]);
  return name !== null && ARRIVING.includes(name);
}

function isCheckingCall(node: Node): boolean {
  if (node.type !== "CallExpression") return false;
  const name = memberName(node["callee"]);
  return name !== null && CHECKING.includes(name);
}

function arrivalsWithin(node: unknown): readonly Node[] {
  const found: Node[] = [];
  if (node === null || typeof node !== "object") return found;
  walk(node, (held) => {
    if (isArrivalCall(held)) found.push(held);
  });
  return found;
}

function checkedNames(root: Node): ReadonlySet<string> {
  const found = new Set<string>();
  walk(root, (node) => {
    if (!isCheckingCall(node)) return;
    const args = node["arguments"];
    if (!Array.isArray(args)) return;
    for (const argument of args) {
      if (fieldAt(argument, "type") !== "Identifier") continue;
      const held = fieldAt(argument, "name");
      if (typeof held === "string") found.add(held);
    }
  });
  return found;
}

function boundNameOf(node: Node): string | null {
  if (node.type === "VariableDeclarator") {
    const name = fieldAt(node["id"], "name");
    return typeof name === "string" ? name : null;
  }
  if (node.type !== "AssignmentExpression") return null;
  const left = node["left"];
  if (fieldAt(left, "type") !== "Identifier") return null;
  const name = fieldAt(left, "name");
  return typeof name === "string" ? name : null;
}

function heldValueOf(node: Node): unknown {
  if (node.type === "VariableDeclarator") return node["init"];
  if (node.type === "AssignmentExpression") return node["right"];
  return null;
}

function withoutAwait(value: unknown): unknown {
  if (fieldAt(value, "type") !== "AwaitExpression") return value;
  return fieldAt(value, "argument");
}

function thrownAway(node: Node): Node | null {
  if (node.type !== "ExpressionStatement") return null;
  const held = withoutAwait(node["expression"]);
  if (!isNode(held)) return null;
  return isArrivalCall(held) ? held : null;
}

function accountedFor(root: Node, checked: ReadonlySet<string>): ReadonlySet<Node> {
  const forgiven = new Set<Node>();
  walk(root, (node) => {
    const discarded = thrownAway(node);
    if (discarded !== null) {
      forgiven.add(discarded);
      return;
    }
    if (isCheckingCall(node)) {
      for (const arrival of arrivalsWithin(node)) forgiven.add(arrival);
      return;
    }
    const name = boundNameOf(node);
    if (name === null || !checked.has(name)) return;
    for (const arrival of arrivalsWithin(heldValueOf(node))) forgiven.add(arrival);
  });
  return forgiven;
}

export const uncheckedInputCheck: Check = {
  rule: UNCHECKED_INPUT,

  run(subject: Subject): readonly Finding[] {
    const parsed = parseSource(subject.file, subject.text);
    if (parsed.kind === "unreadable") return [];

    const forgiven = accountedFor(parsed.root, checkedNames(parsed.root));
    const found: Finding[] = [];

    walk(parsed.root, (node) => {
      if (!isArrivalCall(node)) return;
      if (forgiven.has(node)) return;
      found.push({ line: lineOfNode(node) });
    });

    return found;
  },
};
