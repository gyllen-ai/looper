import type { Check, Finding, Subject } from "../engine.ts";
import type { Rule } from "../rule.ts";
import { isNode, lineOfNode, parseSource, type Node } from "./parse.ts";
import { fieldAt } from "../../fields.ts";

export const GUESSED_WAIT: Rule = {
  id: "TS-ERROR:9",
  category: "ERROR",
  pass: "fast",
  bans:
    "waiting a fixed number of milliseconds for something to probably be finished — an awaited `setTimeout` promise, or an awaited `sleep(500)` — anywhere but inside a loop",
  why:
    "the number is a guess about how fast another machine is today, and it is wrong in both directions at once. Too short and it races, on the slowest machine, under the heaviest load, which is where nobody is watching. Too long and every call pays it forever, including the thousand calls where the thing was ready immediately. It is also untestable: the failure it hides only appears on somebody else's hardware",
  instead: [
    "await the thing itself — the promise, the event, the ready signal",
    "poll for the condition and sleep between tries: `while (!(await ready())) { await sleep(100) }` — a sleep inside a loop is pacing, and this rule is silent on it",
    "if a service really needs settling time, that is its own readiness call to expose, not the caller's number to guess",
  ],
  valve: { kind: "none" },
};

const A_LOOP: readonly string[] = [
  "ForStatement",
  "ForInStatement",
  "ForOfStatement",
  "WhileStatement",
  "DoWhileStatement",
];

const NAMES_A_DURATION: readonly string[] = ["sleep", "delay", "pause"];

const A_TIMER = "setTimeout";

const WITH_A_DURATION = 2;

function nameOf(value: unknown): string {
  const name = fieldAt(value, "name");
  return typeof name === "string" ? name : "";
}

function isATimerCall(value: unknown, timers: ReadonlySet<string>): boolean {
  if (!isNode(value) || value.type !== "CallExpression") return false;
  const called = nameOf(value["callee"]);
  if (called !== A_TIMER && !timers.has(called)) return false;
  return argumentsOf(value).length >= WITH_A_DURATION;
}

function bodyOf(value: unknown): unknown {
  if (!isNode(value)) return null;
  if (value.type !== "ArrowFunctionExpression" && value.type !== "FunctionExpression") return null;
  const body = value["body"];
  if (!isNode(body) || body.type !== "BlockStatement") return body;
  const statements = body["body"];
  if (!Array.isArray(statements) || statements.length !== 1) return null;
  const only = statements[0];
  if (!isNode(only) || only.type !== "ExpressionStatement") return null;
  return only["expression"];
}

function isANumber(value: unknown): boolean {
  if (fieldAt(value, "type") !== "NumericLiteral") return false;
  return typeof fieldAt(value, "value") === "number";
}

function argumentsOf(node: Node): readonly unknown[] {
  const held = node["arguments"];
  return Array.isArray(held) ? held : [];
}

function isAFixedWait(value: unknown, timers: ReadonlySet<string>): boolean {
  if (!isNode(value)) return false;
  if (value.type === "NewExpression" && nameOf(value["callee"]) === "Promise") {
    const given = argumentsOf(value);
    if (given.length !== 1) return false;
    return isATimerCall(bodyOf(given[0]), timers);
  }
  if (value.type !== "CallExpression") return false;

  const called = nameOf(value["callee"]);
  if (called.length === 0) return false;
  if (timers.has(called)) return argumentsOf(value).length >= 1;

  const given = argumentsOf(value);
  if (given.length !== 1 || !isANumber(given[0])) return false;
  return NAMES_A_DURATION.includes(called);
}

const TIMER_MODULES: readonly string[] = ["node:timers/promises", "timers/promises"];

function waitersImportedIn(root: Node): ReadonlySet<string> {
  const found = new Set<string>();
  const specifiers = (node: Node): void => {
    const held = node["specifiers"];
    if (!Array.isArray(held)) return;
    for (const one of held) {
      if (nameOf(fieldAt(one, "imported")) !== A_TIMER) continue;
      const local = nameOf(fieldAt(one, "local"));
      if (local.length > 0) found.add(local);
    }
  };
  const body = root["body"];
  if (!Array.isArray(body)) return found;
  for (const node of body) {
    if (!isNode(node) || node.type !== "ImportDeclaration") continue;
    const from = fieldAt(node["source"], "value");
    if (typeof from !== "string" || !TIMER_MODULES.includes(from)) continue;
    specifiers(node);
  }
  return found;
}

function findingsIn(node: Node, inALoop: boolean, timers: ReadonlySet<string>): readonly Finding[] {
  const found: Finding[] = [];
  if (node.type === "AwaitExpression" && !inALoop && isAFixedWait(node["argument"], timers)) {
    found.push({ line: lineOfNode(node) });
  }
  const deeper = inALoop || A_LOOP.includes(node.type);
  for (const key of Object.keys(node)) {
    if (key === "loc") continue;
    const held = node[key];
    if (Array.isArray(held)) {
      for (const item of held) {
        if (isNode(item)) found.push(...findingsIn(item, deeper, timers));
      }
      continue;
    }
    if (isNode(held)) found.push(...findingsIn(held, deeper, timers));
  }
  return found;
}

export const guessedWaitCheck: Check = {
  rule: GUESSED_WAIT,

  run(subject: Subject): readonly Finding[] {
    const parsed = parseSource(subject.file, subject.text);
    if (parsed.kind === "unreadable") return [];
    return findingsIn(parsed.root, false, waitersImportedIn(parsed.root));
  },
};
