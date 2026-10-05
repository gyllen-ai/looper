import { test } from "node:test";
import assert from "node:assert/strict";

import { countIn, countWhere } from "./helpers.ts";
import { CONCEDING_NOTHING } from "../src/law/concessions.ts";
import { writtenPageCheck } from "../src/law/ts/written-page.ts";
import { coercedComparisonCheck } from "../src/law/ts/coerced-comparison.ts";
import { conjuredCodeCheck } from "../src/law/ts/conjured-code.ts";
import { parseSource } from "../src/law/ts/parse.ts";
import { unfinishedCheck } from "../src/law/ts/unfinished.ts";
import { hiddenDependencyCheck } from "../src/law/ts/hidden-dependency.ts";
import { uncheckedInputCheck } from "../src/law/data/unchecked-input.ts";
import { rewrappedFailureCheck } from "../src/law/ts/rewrapped-failure.ts";
import { placesIn } from "../src/law/report.ts";

const MARKUP: readonly (readonly [string, number])[] = [
  ["el.innerHTML = said;", 1],
  ["el.outerHTML = said;", 1],
  ["el.innerHTML = '';", 0],
  ["el.innerHTML = `<b>done</b>`;", 0],
  ["el.innerHTML = `<b>${said}</b>`;", 1],
  ["el.textContent = said;", 0],
  ["el.insertAdjacentHTML('beforeend', said);", 1],
  ["el.insertAdjacentHTML('beforeend', '<hr>');", 0],
  ["document.write(said);", 1],
  ["out.write(said);", 0],
  ["sanitizer.bypassSecurityTrustHtml(said);", 1],
  ["sanitizer.sanitize(said);", 0],
];

test("TS-SECURITY:2 fires on the doors out of the browser's escaping, not on text", () => {
  for (const [line, expected] of MARKUP) {
    const code = `declare const el: HTMLElement;\ndeclare const said: string;\ndeclare const out: { write(v: string): void };\ndeclare const sanitizer: { bypassSecurityTrustHtml(v: string): unknown; sanitize(v: string): string };\nexport function show(): void { ${line} }\n`;
    assert.equal(countIn(writtenPageCheck, code), expected, `wanted ${expected} for: ${line}`);
  }
});

test("TS-SECURITY:2 reads the React door in JSX", () => {
  const code = `export function Card(said: string): JSX.Element { return <div dangerouslySetInnerHTML={{ __html: said }} />; }\n`;
  assert.equal(countWhere(writtenPageCheck, code, "src/Card.tsx", CONCEDING_NOTHING), 1);
});

test("TS-SECURITY:2 names the door it found, so the report says which one", () => {
  const code = `declare const el: HTMLElement;\ndeclare const said: string;\nexport function show(): void { el.innerHTML = said; }\n`;
  const found = writtenPageCheck.run({ file: "src/a.ts", text: code }, CONCEDING_NOTHING);
  assert.match(String(found[0]?.said), /innerHTML/);
});

const COMPARED: readonly (readonly [string, number])[] = [
  ["a == b", 1],
  ["a != 1", 1],
  ["typeof a == 'string'", 1],
  ["a == null", 0],
  ["null == a", 0],
  ["a != undefined", 0],
  ["undefined != a", 0],
  ["a === b", 0],
  ["a !== b", 0],
];

test("TS-TYPE:7 bans the comparison that converts, and keeps the null question", () => {
  for (const [expression, expected] of COMPARED) {
    const code = `declare const a: unknown;\ndeclare const b: unknown;\nexport const held = ${expression};\n`;
    assert.equal(countIn(coercedComparisonCheck, code), expected, `wanted ${expected} for: ${expression}`);
  }
});

test("TS-SECURITY:1 counts the sandbox as one more way to run a string", () => {
  const sandbox = `import vm from "node:vm";\nexport function run(said: string, box: object): unknown { return vm.runInContext(said, box); }\n`;
  assert.equal(countIn(conjuredCodeCheck, sandbox), 1);

  const yours = `export function run(r: { runInContext(s: string): unknown }, said: string): unknown { return r.runInContext(said); }\n`;
  assert.equal(
    countIn(conjuredCodeCheck, yours),
    0,
    "a method of your own that shares the name is not node's vm",
  );
});

test("a declaration file is read rather than counted as unreadable", () => {
  const held = parseSource("types/port.d.ts", "export const DEMO_PORT: number\n");
  assert.equal(
    held.kind,
    "parsed",
    "a .d.ts declares without initialising, which is the whole point of the file; refusing it leaves every type-heavy file in a project unjudged",
  );
});

test("JSX in a .js file is read, because that is where most React is written", () => {
  const code = "import React from 'react'\nexport const App = () => <div>hi</div>\n";
  assert.equal(
    parseSource("src/App.js", code).kind,
    "parsed",
    "a create-react-app or Vite project puts JSX in .js; refusing it means the law judges none of it",
  );
  assert.equal(
    parseSource("src/broken.js", "const a = (\n").kind,
    "unreadable",
    "a file that is genuinely broken is still reported as unreadable",
  );
});

test("TS-DEAD:3 refuses the no-op an agent reaches for, wherever it is written", () => {
  const fallback = `export function wire(on: (() => void) | undefined, set: (h: () => void) => void): void { set(on ?? (() => {})); }\n`;
  assert.equal(countIn(unfinishedCheck, fallback), 1, "a no-op standing in for a handler nobody gave is the shortcut, not a decision");

  const inline = `export function wire(el: HTMLElement): void { el.addEventListener("click", () => {}); }\n`;
  assert.equal(countIn(unfinishedCheck, inline), 0, "the one exception the rule names: an empty callback written inline as an argument");
});

test("TS-LAYER:2 means partway down, so the top of a CommonJS file is silent", () => {
  const top = `const plugin = require("html-webpack-plugin");\nmodule.exports = { plugins: [plugin] };\n`;
  assert.equal(
    countWhere(hiddenDependencyCheck, top, "webpack.config.cjs", CONCEDING_NOTHING),
    0,
    "a .cjs file cannot write an import statement, so firing here leaves no legal spelling",
  );

  const buried = `function load(){ return require("./m"); }\n`;
  assert.equal(countIn(hiddenDependencyCheck, buried), 1);
});

test("DATA:2 tells the call that hands you a body from the one that sends one", () => {
  const sending = `export function f(res: { status(n: number): { json(v: unknown): unknown } }): unknown { return res.status(401).json({ error: "no" }); }\n`;
  assert.equal(countIn(uncheckedInputCheck, sending), 0);

  const receiving = `export async function f(req: Request): Promise<unknown> { const body = await req.json(); return body; }\n`;
  assert.equal(countIn(uncheckedInputCheck, receiving), 1);
});

test("TS-ERROR:10 says which half of its reason survives a kept cause", () => {
  const kept = `export function read(p: string): string { try { return open(p); } catch (cause) { throw new Error("no", { cause }); } }\n`;
  const found = rewrappedFailureCheck.run({ file: "src/a.ts", text: kept }, CONCEDING_NOTHING);
  assert.equal(found.length, 1);
  assert.match(
    String(found[0]?.said),
    /catching this by kind/,
    "the trace argument does not apply when the cause is kept, and the message must not claim it does",
  );
});

test("a rule with more places than anyone can read says how many it did not print", () => {
  const rule = writtenPageCheck.rule;
  const many = Array.from({ length: 300 }, (_, at) => ({
    rule,
    file: `src/page-${at % 24}.ts`,
    line: at + 1,
  }));
  const said = placesIn(many);

  assert.equal(
    said.split("|").length - 1,
    8,
    "eight places and the tail, not three hundred entries on one line nobody reads",
  );
  assert.match(said, /and 292 more, in 24 files/);
  assert.equal(
    placesIn(many.slice(0, 3)),
    "src/page-0.ts:1  |  src/page-1.ts:2  |  src/page-2.ts:3",
    "a short list is printed whole, with no tail",
  );
});
