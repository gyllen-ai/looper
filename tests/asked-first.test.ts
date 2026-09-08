import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { readConcessions, standingOf } from "../src/law/concessions.ts";

const A_FALLBACK = `export function read(x: number | undefined): number { return x || slow(); }\n`;

const PARDONED = '[exempt]\n"src/a.ts" = ["TS-TRUTH:4"]\n';

const ENTRY = [
  "# Decisions taken with a known cost",
  "",
  "## 2026-09-08 - the reader falls back to the cached answer",
  "kind: architecture",
  "depends: src/a.ts",
  "checked: 2026-09-08 abc123abc123",
  "",
  "The upstream service answers in eight seconds at the 99th percentile.",
  "",
].join("\n");

function projectWith(law: string, decisions: string): string {
  const root = mkdtempSync(join(tmpdir(), "looper-asked-"));
  mkdirSync(join(root, "src"), { recursive: true });
  mkdirSync(join(root, ".looper"), { recursive: true });
  writeFileSync(join(root, "src", "a.ts"), A_FALLBACK);
  writeFileSync(join(root, "law.toml"), law);
  if (decisions.length > 0) writeFileSync(join(root, ".looper", "decisions.md"), decisions);
  return root;
}

test("a pardon nobody asked for does not set the fallback rule aside", () => {
  const root = projectWith(PARDONED, "");
  try {
    const standing = standingOf(readConcessions(root), "src/a.ts", "TS-TRUTH:4");
    assert.equal(standing.kind, "unbacked");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a pardon a decisions entry stands behind is honoured", () => {
  const root = projectWith(PARDONED, ENTRY);
  try {
    const standing = standingOf(readConcessions(root), "src/a.ts", "TS-TRUTH:4");
    assert.equal(standing.kind, "pardoned");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an entry about another file does not carry this one", () => {
  const root = projectWith(PARDONED, ENTRY.replace("depends: src/a.ts", "depends: src/b.ts"));
  try {
    const standing = standingOf(readConcessions(root), "src/a.ts", "TS-TRUTH:4");
    assert.equal(standing.kind, "unbacked");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("disabling the rule outright does not work either", () => {
  const root = projectWith('[rules]\ndisabled = ["TS-TRUTH:4", "RUST-TRUTH:3"]\n', "");
  try {
    const concessions = readConcessions(root);
    assert.equal(standingOf(concessions, "src/a.ts", "TS-TRUTH:4").kind, "stands");
    assert.equal(standingOf(concessions, "src/a.rs", "RUST-TRUTH:3").kind, "stands");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an ordinary rule is still pardoned without an entry, so this is not a change to every rule", () => {
  const root = projectWith('[exempt]\n"src/a.ts" = ["TS-TRUTH:1"]\n', "");
  try {
    const standing = standingOf(readConcessions(root), "src/a.ts", "TS-TRUTH:1");
    assert.equal(standing.kind, "pardoned");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
