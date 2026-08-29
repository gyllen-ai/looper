import type { Check, Finding, Subject } from "../engine.ts";
import type { Rule } from "../rule.ts";
import { isNode, lineOfNode, parseSource, walk, type Node } from "./parse.ts";
import { rootOfMember } from "./scope.ts";
import { fieldAt } from "../../fields.ts";

export const ROUND_TRIP_COPY: Rule = {
  id: "TS-TYPE:6",
  category: "TYPE",
  pass: "fast",
  bans: "`JSON.parse(JSON.stringify(x))` used to copy a value, however the two halves are spelled",
  why:
    "the trip through text silently drops everything text cannot hold. A Date comes back a string, a Map and a Set come back `{}`, a function and an `undefined` key are gone, `NaN` and `Infinity` become `null`, and a cycle throws. Nothing warns: the copy looks right in a log and is wrong at the one call that needed the field that vanished",
  instead: [
    "structuredClone(held), which is in every runtime this project targets and keeps Dates, Maps and Sets",
    "if the copy only needs to be shallow, `{ ...held }` says so",
    "if it is really serialisation rather than copying, keep the text and name it: `const wire = JSON.stringify(held)`",
  ],
  valve: { kind: "none" },
};

const PARSE = "JSON.parse";

const STRINGIFY = "JSON.stringify";

function calledName(node: Node): string {
  const held = rootOfMember(node);
  return held.kind === "named" ? held.symbol : "";
}

function argumentsOf(node: Node): readonly unknown[] {
  const held = node["arguments"];
  return Array.isArray(held) ? held : [];
}

function isStringify(value: unknown): boolean {
  if (!isNode(value) || value.type !== "CallExpression") return false;
  return calledName(value) === STRINGIFY;
}

function nameOf(value: unknown): string {
  const name = fieldAt(value, "name");
  return typeof name === "string" ? name : "";
}

function namesHoldingStringify(root: Node): ReadonlySet<string> {
  const found = new Set<string>();
  walk(root, (node) => {
    if (node.type !== "VariableDeclarator") return;
    if (!isStringify(node["init"])) return;
    const name = nameOf(node["id"]);
    if (name.length > 0) found.add(name);
  });
  return found;
}

export const roundTripCopyCheck: Check = {
  rule: ROUND_TRIP_COPY,

  run(subject: Subject): readonly Finding[] {
    const parsed = parseSource(subject.file, subject.text);
    if (parsed.kind === "unreadable") return [];

    const written = namesHoldingStringify(parsed.root);
    const found: Finding[] = [];
    walk(parsed.root, (node) => {
      if (node.type !== "CallExpression") return;
      if (calledName(node) !== PARSE) return;
      const given = argumentsOf(node)[0];
      if (isStringify(given) || written.has(nameOf(given))) {
        found.push({ line: lineOfNode(node) });
      }
    });
    return found;
  },
};
