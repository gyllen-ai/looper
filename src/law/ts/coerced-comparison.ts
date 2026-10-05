import type { Check, Finding, Subject } from "../engine.ts";
import type { Rule } from "../rule.ts";
import { lineOfNode, parseSource, walk } from "./parse.ts";
import { fieldAt } from "../../fields.ts";

export const COERCED_COMPARISON: Rule = {
  id: "TS-TYPE:7",
  category: "TYPE",
  pass: "fast",
  bans: "`==` and `!=`, everywhere but against `null` or `undefined`",
  why:
    "`==` does not compare the two values, it converts one of them first and compares what comes back. So `0 == ''`, `'1' == 1`, `[] == false` and `'\\n' == 0` are all true, and none of them is what the line says. The conversion happens at runtime, after every type the compiler checked has been erased, so this is the one comparison TypeScript cannot save you from — and it reads identically to the one that works",
  instead: [
    "`===` and `!==`, which compare the value and the type and never convert",
    "`held == null` stays legal, and is the one place the conversion is the point: it asks null or undefined in one comparison",
    "if the two sides really are different types, convert the one you meant and say so: `Number(said) === count`",
  ],
  valve: { kind: "none" },
};

const COERCING: readonly string[] = ["==", "!="];

const NOTHING = "undefined";

function isNothing(value: unknown): boolean {
  const type = fieldAt(value, "type");
  if (type === "NullLiteral") return true;
  return type === "Identifier" && fieldAt(value, "name") === NOTHING;
}

export const coercedComparisonCheck: Check = {
  rule: COERCED_COMPARISON,

  run(subject: Subject): readonly Finding[] {
    const parsed = parseSource(subject.file, subject.text);
    if (parsed.kind === "unreadable") return [];

    const found: Finding[] = [];
    walk(parsed.root, (node) => {
      if (node.type !== "BinaryExpression") return;
      const operator = node["operator"];
      if (typeof operator !== "string" || !COERCING.includes(operator)) return;
      if (isNothing(node["left"]) || isNothing(node["right"])) return;
      found.push({ line: lineOfNode(node), said: operator });
    });
    return found;
  },
};
