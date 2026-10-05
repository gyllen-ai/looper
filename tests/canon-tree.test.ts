import { test } from "node:test";
import { INDEX_CEILING } from "../src/config.ts";
import { doctrineFilesUnder, lineFor, oversizedIn } from "../src/size.ts";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { canonBranch, canonBranchNames, canonGoverns, pulledByName } from "../src/canon.ts";
import { fieldAt } from "../src/fields.ts";
import { answeredByACopy } from "./copied-src.ts";
import { branchIndex, isABranchName, listBranches } from "../src/doctrine.ts";

const CANON = join(import.meta.dirname, "..", "src", "canon");
const ROOT = join(import.meta.dirname, "..");

function everyCanonFile(dir: string, prefix: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...everyCanonFile(full, `${prefix}${entry}/`));
      continue;
    }
    if (entry.endsWith(".md")) found.push(`${prefix}${entry.slice(0, -3)}`);
  }
  return found;
}

test("every branch the canon names has a file, so a name cannot dangle", () => {
  for (const name of canonBranchNames()) {
    assert.ok(
      existsSync(join(CANON, `${name}.md`)),
      `${name} is listed as a branch and has no file, so reading it throws at the moment somebody needs it`,
    );
  }
});

test("every canon file is reachable, because one nobody can name is one nobody gets", () => {
  const named = new Set<string>([...canonBranchNames(), "constitution"]);
  for (const file of everyCanonFile(CANON, "")) {
    assert.ok(named.has(file), `src/canon/${file}.md exists and no branch name reaches it`);
  }
});

test("a branch is routed by path or pulled by name, never neither", () => {
  const governed = new Set(canonGoverns().keys());
  const byName = new Set(pulledByName());
  const orphans = canonBranchNames().filter((n) => !governed.has(n) && !byName.has(n));
  assert.deepEqual(
    orphans,
    [],
    "a branch with no path and no name entry can never be selected, which is a rule that never arrives",
  );
});

test("a branch stays small enough to be worth injecting whole", () => {
  const oversized: string[] = [];
  for (const path of doctrineFilesUnder(ROOT)) {
    for (const one of oversizedIn(path, readFileSync(join(ROOT, path), "utf8"))) {
      oversized.push(lineFor(one).trim());
    }
  }
  assert.deepEqual(
    oversized,
    [],
    "the canon is held to the same ceilings the commit gate holds a project to: a bullet is the rule, the number and the date, and a branch past the ceiling is dropped whole by the budget",
  );
});

test("every canon branch can hold a project half, or the tree only ever governs half of it", () => {
  const unreachable = canonBranchNames().filter((name) => !isABranchName(name));
  assert.deepEqual(
    unreachable,
    [],
    "readProjectBranch refuses a name this guard rejects, so these branches would be canon-only forever: an adopter could never write their half of them, which is the whole reason the tree has this many branches",
  );
});

test("a branch name is still a name and never a way out of the doctrine folder", () => {
  for (const escape of ["../secrets", "ui/../../etc/passwd", "/etc/passwd", "ui\\state", "..", "ui//state", ""]) {
    assert.equal(isABranchName(escape), false, `${escape} was accepted as a branch name and it is a path`);
  }
  for (const fine of ["frontend", "ui/state", "data/schema", "work/deploy"]) {
    assert.equal(isABranchName(fine), true, `${fine} is a branch name and was refused`);
  }
});

test("the constitution's index names every branch the project has, canon and its own alike", () => {
  const index = branchIndex(ROOT);
  const missing = listBranches(ROOT).filter((name) => {
    const cut = name.indexOf("/");
    const shown = cut < 0 ? name : name.slice(cut + 1);
    const group = cut < 0 ? "" : `- ${name.slice(0, cut)}/ `;
    const row = index.split("\n").find((line) => line.startsWith(group) && line.includes(shown));
    return row === undefined;
  });
  assert.deepEqual(
    missing,
    [],
    "a branch that exists and is not named in the constitution is one the reader never learns about, which is the same as not shipping it",
  );
});

test("the index is names, never rules, because a rule quoted on every turn is the always-on tier in disguise", () => {
  const index = branchIndex(ROOT);
  for (const line of index.split("\n")) {
    if (!line.startsWith("- ")) continue;
    assert.ok(
      !/[.!?]/.test(line.replace(/\(TypeScript\)/, "")),
      `the index carries a sentence: ${line}`,
    );
  }
});

test("the index is bounded, because it is paid on every single message", () => {
  const size = branchIndex(ROOT).length;
  assert.ok(
    size <= INDEX_CEILING,
    `the branch index is ${size} chars against a ceiling of ${INDEX_CEILING}. It lists names, grouped, and a name costs a word; past the ceiling, stop listing leaves`,
  );
});

test("a canon branch on disk is served even when this build's list has never heard of it", () => {
  const added = "added-after-this-process-started";
  const said = answeredByACopy(
    { written: { [`canon/${added}.md`]: "A branch added after this process started.\n\n- **Served from disk.**\n" }, gone: [] },
    "canon.ts",
    `{ listed: copied.canonBranchNames().includes("${added}"), served: copied.canonBranch("${added}").kind }`,
  );
  assert.equal(
    fieldAt(said, "listed"),
    false,
    "the fixture has to be absent from the compiled list, or it proves nothing",
  );
  assert.equal(
    fieldAt(said, "served"),
    "found",
    "a long-lived server holds its branch names in a compiled constant while bodies are read from disk, so denying a branch whose file is right there tells the reader a rule does not exist when it does. Written into a copy: tests run in parallel and another one walks src/",
  );
});

test("serving from disk did not open a path out of the canon folder", () => {
  for (const escape of ["../../../etc/passwd", "..", "/abs", "a//b", "a\\b"]) {
    assert.equal(canonBranch(escape).kind, "nowhere", `${escape} was served and it is a path, not a branch`);
  }
});
