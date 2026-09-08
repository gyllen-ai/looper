import type { Concessions } from "../concessions.ts";
import { isNamed } from "../concessions.ts";
import type { Check, Finding, Subject } from "../engine.ts";
import type { Rule } from "../rule.ts";
import { lineOfNode, parseSource, walk, type Node } from "./parse.ts";
import { fieldAt } from "../../fields.ts";
import { reachIn, reaches, type Reach } from "./globals.ts";

export const HIDDEN_DEPENDENCY: Rule = {
  id: "TS-LAYER:2",
  category: "LAYER",
  pass: "fast",
  bans: "`require(...)` and `import(...)` used partway down a file",
  why:
    "the imports at the top of a file are meant to be the complete list of what it needs. One fetched from the middle of a function is a dependency no reader sees and no boundary check can catch, and it fails when the thing is missing rather than when the file is loaded",
  instead: [
    "import { pdf } from './pdf.ts' at the top of the file",
    "if something genuinely must load late, the entry point decides that, not a function buried three levels down",
  ],
  valve: {
    kind: "knob",
    key: "[entry] files",
    note: "the files that start the program, where loading late is the entry point's decision to make — which is what this rule's own advice says. Everywhere else it stays banned",
  },
};

const REQUIRE: readonly string[] = ["require"];

const MAKES_REQUIRE = "createRequire";

function isRequire(node: Node, reach: Reach): boolean {
  const callee = node["callee"];
  if (reaches(callee, reach, REQUIRE)) return true;
  if (fieldAt(callee, "type") !== "CallExpression") return false;
  const inner = fieldAt(callee, "callee");
  if (fieldAt(inner, "name") === MAKES_REQUIRE) return true;
  return fieldAt(fieldAt(inner, "property"), "name") === MAKES_REQUIRE;
}

export const hiddenDependencyCheck: Check = {
  rule: HIDDEN_DEPENDENCY,

  run(subject: Subject, concessions: Concessions): readonly Finding[] {
    if (isNamed(subject.file, concessions.entryFiles)) return [];

    const parsed = parseSource(subject.file, subject.text);
    if (parsed.kind === "unreadable") return [];

    const reach = reachIn(parsed.root);
    const found: Finding[] = [];
    walk(parsed.root, (node) => {
      if (node.type === "ImportExpression") {
        found.push({ line: lineOfNode(node) });
        return;
      }
      if (node.type !== "CallExpression") return;
      if (isRequire(node, reach)) found.push({ line: lineOfNode(node) });
    });
    return found;
  },
};
