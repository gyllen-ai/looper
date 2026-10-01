import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { commitOf, originOf, treeOf } from "../src/report/origin.ts";

const ROOT = join(import.meta.dirname, "..");

const A_COMMIT = "a".repeat(40);

const THE_MARK = "$Format:%H$";

function gitAt(root: string, ...args: readonly string[]): string {
  return execFileSync("git", [...args], { cwd: root, encoding: "utf8" }).trim();
}

function copyOfLooperIn(dir: string, builtFrom: string): string {
  mkdirSync(join(dir, "src"), { recursive: true });
  mkdirSync(join(dir, "bin"), { recursive: true });
  writeFileSync(join(dir, "src", "built-from"), `${builtFrom}\n`);
  writeFileSync(join(dir, "src", "main.ts"), "export const held = 1;\n");
  writeFileSync(join(dir, "bin", "looper.js"), "import '../src/main.ts';\n");
  return dir;
}

test("a checkout names the commit git has for looper itself", () => {
  const said = commitOf(ROOT);

  assert.equal(said.kind, "known", `this repository is a checkout and could not name its own commit: ${JSON.stringify(said)}`);
  if (said.kind !== "known") return;
  assert.equal(said.commit, gitAt(ROOT, "rev-parse", "HEAD"));
});

test("a copy that was packed for an install names the commit written into it", () => {
  const dir = mkdtempSync(join(tmpdir(), "looper-origin-packed-"));
  try {
    const said = commitOf(copyOfLooperIn(dir, A_COMMIT));

    assert.deepEqual(
      said,
      { kind: "known", commit: A_COMMIT, changed: false },
      "an install has no .git, so the commit has to travel inside looper's own files or every report says 0.1.0, which has not moved in two hundred commits",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a copy inside somebody's repository never answers with their commit", () => {
  const theirs = mkdtempSync(join(tmpdir(), "looper-origin-theirs-"));
  try {
    gitAt(theirs, "init", "-q");
    gitAt(theirs, "config", "user.email", "t@example.com");
    gitAt(theirs, "config", "user.name", "t");
    writeFileSync(join(theirs, "package.json"), JSON.stringify({ name: "t" }));
    gitAt(theirs, "add", "package.json");
    gitAt(theirs, "commit", "-q", "-m", "theirs");
    const installed = copyOfLooperIn(join(theirs, "node_modules", "looper"), THE_MARK);

    assert.match(
      gitAt(installed, "rev-parse", "HEAD"),
      /^[0-9a-f]{40}$/,
      "git asked from inside node_modules answers with the commit of the project around it, which is the trap this test exists for",
    );
    const said = commitOf(installed);
    assert.equal(
      said.kind,
      "not-known",
      `a report would have carried ${JSON.stringify(said)}: a commit that identifies somebody else's repository, printed as looper's own`,
    );
  } finally {
    rmSync(theirs, { recursive: true, force: true });
  }
});

test("the mark an install fills in is still a mark in the repository, and git is told to fill it", () => {
  assert.equal(readFileSync(join(ROOT, "src", "built-from"), "utf8").trim(), THE_MARK);
  assert.ok(
    readFileSync(join(ROOT, ".gitattributes"), "utf8").includes("src/built-from export-subst"),
    "without this line nothing ever replaces the mark, and every install says its commit is not known",
  );
});

test("the hash of looper's own files is the same for the same files, and moves when one changes", () => {
  const dir = mkdtempSync(join(tmpdir(), "looper-origin-tree-"));
  try {
    copyOfLooperIn(dir, THE_MARK);
    const before = treeOf(dir);
    assert.match(before, /^[0-9a-f]{12}$/);
    assert.equal(treeOf(dir), before);

    writeFileSync(join(dir, "src", "built-from"), `${A_COMMIT}\n`);
    assert.equal(
      treeOf(dir),
      before,
      "the mark differs between a checkout and an install of the same commit, so it is left out: the hash is there to say whether two copies run the same code",
    );

    writeFileSync(join(dir, "src", "main.ts"), "export const held = 2;\n");
    assert.notEqual(treeOf(dir), before, "a patched copy has to read as a different copy");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("where a report came from is said in one line a person can read", () => {
  const said = originOf(ROOT);

  assert.match(said, /^looper \d+\.\d+\.\d+, commit [0-9a-f]{40}/);
  assert.ok(said.includes(`files ${treeOf(ROOT)}`));
  assert.ok(said.includes(process.version));
});
