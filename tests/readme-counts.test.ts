import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { CASES } from "../audit/cases.ts";
import { COPY_CASES } from "../audit/copy-cases.ts";
import { CSHARP_CASES } from "../audit/csharp-cases.ts";
import { CSS_CASES } from "../audit/css-cases.ts";
import { PYTHON_CASES } from "../audit/python-cases.ts";
import { RUST_CASES } from "../audit/rust-cases.ts";
import { knownRuleIds } from "../src/law/checks.ts";
import { required } from "../src/present.ts";

const README = readFileSync(join(import.meta.dirname, "..", "README.md"), "utf8");

const FINDINGS = readFileSync(join(import.meta.dirname, "..", "docs", "FINDINGS.md"), "utf8");

const EVERY_LANGUAGE = "every language at once";

const FAMILIES_OF: ReadonlyMap<string, readonly string[]> = new Map([
  ["TypeScript & JavaScript", ["TS", "DATA", "NEXT", "NODE", "REACT", "TAURI", "STACK"]],
  ["Rust", ["RUST"]],
  ["Python", ["PY"]],
  ["C# & Razor", ["CS"]],
  ["CSS, Sass & HTML", ["CSS"]],
  [EVERY_LANGUAGE, ["COPY"]],
]);

const HEADLINE = /^(\d+) rules · (\d+) languages · (\d+) cases$/m;

const ROW = /^\| \*\*(.+?)\*\* \| (\d+) \|/gm;

function familyOf(id: string): string {
  const at = id.search(/[-:]/);
  return at < 0 ? id : id.slice(0, at);
}

function headline(): { readonly rules: number; readonly languages: number; readonly cases: number } {
  const held = HEADLINE.exec(README);
  if (held === null) assert.fail("the README's headline no longer reads '<n> rules · <n> languages · <n> cases'");
  return {
    rules: Number(held[1]),
    languages: Number(held[2]),
    cases: Number(held[3]),
  };
}

function rows(): ReadonlyMap<string, number> {
  const found = new Map<string, number>();
  for (const held of README.matchAll(ROW)) found.set(required(held[1], "a row's language"), Number(held[2]));
  return found;
}

test("the README counts the rules the law knows, row by row", () => {
  const ids = knownRuleIds();
  const table = rows();
  assert.equal(headline().rules, ids.length);
  assert.deepEqual([...table.keys()], [...FAMILIES_OF.keys()]);
  for (const [language, families] of FAMILIES_OF) {
    const counted = ids.filter((id) => families.includes(familyOf(id))).length;
    assert.equal(table.get(language), counted, `the README's ${language} row`);
  }
  assert.equal(headline().languages, [...table.keys()].filter((language) => language !== EVERY_LANGUAGE).length);
});

test("the README counts the cases the case files hold", () => {
  const held = [CASES, RUST_CASES, PYTHON_CASES, CSHARP_CASES, CSS_CASES, COPY_CASES].reduce((sum, list) => sum + list.length, 0);
  assert.equal(headline().cases, held);
  assert.ok(README.includes(`**${held} cases** hold those rules`), "the sentence under the table names another number");
});

test("the README counts the findings the audit holds", () => {
  const numbers = [...FINDINGS.matchAll(/^### (\d+) ·/gm)].map((held) => Number(held[1]));
  assert.ok(README.includes(`**${Math.max(...numbers)} things that were wrong with this tool**`));
});
