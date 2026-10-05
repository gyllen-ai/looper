import type { Check, Finding, Subject } from "../engine.ts";
import type { Rule } from "../rule.ts";
import { lineOfNode, parseSource, walk } from "./parse.ts";
import { reachIn, reaches } from "./globals.ts";
import { fieldAt } from "../../fields.ts";

export const CONJURED_CODE: Rule = {
  id: "TS-SECURITY:1",
  category: "SECURITY",
  pass: "fast",
  bans:
    "`eval`, the `Function` constructor and `vm.runInContext` and its family — code made out of a string while the program runs",
  why:
    "a string that becomes code is code no compiler, no rule here and no reviewer ever read. Every check this project has runs before that string exists. If any part of it came from outside — a request, a config file, a name in a database — then whoever supplied it is writing your program, with everything the program can reach",
  instead: [
    "a table from a name to a function, so the set of things that can run is written down: `const doing = { save, send }`",
    "JSON.parse for data that arrived as text, which reads data and cannot run",
    "if it is genuinely a small language your users write, it needs a parser you can read, not the whole runtime",
  ],
  valve: { kind: "none" },
};

const EVAL: readonly string[] = ["eval"];

const A_FUNCTION_MAKER: readonly string[] = ["Function"];

const THE_SANDBOX = "vm";

const RUNS_A_STRING: readonly string[] = [
  "runInContext",
  "runInNewContext",
  "runInThisContext",
  "compileFunction",
];

function isSandboxRun(callee: unknown): boolean {
  const name = fieldAt(fieldAt(callee, "property"), "name");
  if (typeof name !== "string" || !RUNS_A_STRING.includes(name)) return false;
  return fieldAt(fieldAt(callee, "object"), "name") === THE_SANDBOX;
}

export const conjuredCodeCheck: Check = {
  rule: CONJURED_CODE,

  run(subject: Subject): readonly Finding[] {
    const parsed = parseSource(subject.file, subject.text);
    if (parsed.kind === "unreadable") return [];

    const reach = reachIn(parsed.root);
    const found: Finding[] = [];
    walk(parsed.root, (node) => {
      if (node.type === "CallExpression") {
        if (reaches(node["callee"], reach, EVAL) || isSandboxRun(node["callee"])) {
          found.push({ line: lineOfNode(node) });
        }
        return;
      }
      if (node.type !== "NewExpression") return;
      if (reaches(node["callee"], reach, A_FUNCTION_MAKER)) {
        const given = node["arguments"];
        if (Array.isArray(given) && given.length > 0) found.push({ line: lineOfNode(node) });
      }
    });
    return found;
  },
};

