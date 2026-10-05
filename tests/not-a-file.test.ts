import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { ADOPTED_PATH, CONSTITUTION_PATH, DECISIONS_PATH, LAW_PATH, MAP_PATH, RECALL_PATH, STACK_PATH } from "../src/config.ts";
import { fieldAt, reasonFrom } from "../src/fields.ts";
import { keptPath } from "../src/loop/cache.ts";
import { LOOP_FILE } from "../src/loop/checks.ts";
import { reportsIn } from "../src/report/store.ts";
import { saidPath } from "../src/said.ts";
import { seenPath } from "../src/seen.ts";

const DRIVER = join(import.meta.dirname, "where-a-pipe-stands.ts");

const PATIENCE_MS = 5000;

type Place = { readonly reader: string; readonly at: (root: string, home: string) => string };

const PLACES: readonly Place[] = [
  { reader: "said", at: (root, home) => saidPath(root, home, "a-session") },
  { reader: "seen", at: (root, home) => seenPath(root, home) },
  { reader: "loop answer", at: (root, home) => keptPath(root, home) },
  { reader: "loop.toml", at: (root) => join(root, LOOP_FILE) },
  { reader: "map.toml", at: (root) => join(root, MAP_PATH) },
  { reader: "constitution", at: (root) => join(root, CONSTITUTION_PATH) },
  { reader: "decided.json", at: (root, home) => join(reportsIn(root, home), "decided.json") },
  { reader: "law.toml", at: (root) => join(root, LAW_PATH) },
  { reader: "recall", at: (root) => join(root, RECALL_PATH) },
  { reader: "decisions", at: (root) => join(root, DECISIONS_PATH) },
  { reader: "adopted", at: (root) => join(root, ADOPTED_PATH) },
  { reader: "stack", at: (root) => join(root, STACK_PATH) },
];

type Scene = { readonly scratch: string; readonly root: string; readonly home: string };

function scene(): Scene {
  const scratch = mkdtempSync(join(tmpdir(), "looper-not-a-file-"));
  const root = join(scratch, "project");
  const home = join(scratch, "home");
  mkdirSync(root);
  mkdirSync(home);
  return { scratch, root, home };
}

function answerOf(reader: string, held: Scene): string {
  const answer = join(held.scratch, "answer.txt");
  try {
    execFileSync(process.execPath, [DRIVER, reader, held.root, held.home, answer], {
      stdio: "ignore",
      timeout: PATIENCE_MS,
    });
  } catch (cause) {
    const why = fieldAt(cause, "code") === "ETIMEDOUT" ? `waited and never answered in ${PATIENCE_MS / 1000} seconds` : reasonFrom(cause);
    assert.fail(`${reader}: ${why}`);
  }
  return readFileSync(answer, "utf8");
}

for (const place of PLACES) {
  test(`a named pipe where ${place.reader} is kept is refused and named, never waited on`, () => {
    const held = scene();
    try {
      const path = place.at(held.root, held.home);
      mkdirSync(dirname(path), { recursive: true });
      execFileSync("mkfifo", [path], { stdio: "ignore" });
      const said = answerOf(place.reader, held);
      assert.match(said, /named pipe/, `${place.reader} answered without saying what stood there: ${said}`);
    } finally {
      rmSync(held.scratch, { recursive: true, force: true });
    }
  });
}

test("a device where law.toml is read is refused, rather than read for ever", () => {
  const held = scene();
  try {
    symlinkSync("/dev/zero", join(held.root, LAW_PATH));
    assert.match(answerOf("law.toml", held), /a device/);
  } finally {
    rmSync(held.scratch, { recursive: true, force: true });
  }
});

test("a directory where decided.json is kept is named as one", () => {
  const held = scene();
  try {
    mkdirSync(join(reportsIn(held.root, held.home), "decided.json"), { recursive: true });
    assert.match(answerOf("decided.json", held), /a directory/);
  } finally {
    rmSync(held.scratch, { recursive: true, force: true });
  }
});

test("an ordinary file is still read, and a missing one is still simply absent", () => {
  const held = scene();
  try {
    assert.equal(answerOf("decisions", held), "[]");
    mkdirSync(dirname(join(held.root, DECISIONS_PATH)), { recursive: true });
    copyFileSync(join(import.meta.dirname, "..", DECISIONS_PATH), join(held.root, DECISIONS_PATH));
    assert.match(answerOf("decisions", held), /Doctrine branches are droppable/);
  } finally {
    rmSync(held.scratch, { recursive: true, force: true });
  }
});
