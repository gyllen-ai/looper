import { test } from "node:test";
import assert from "node:assert/strict";
import { appendFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { NO_TURN } from "../src/capability.ts";
import { NEVER_SAID } from "../src/said.ts";
import { Stall } from "../src/stall/capability.ts";
import { metricOf, type Fingerprint } from "../src/stall/fingerprints.ts";
import { note, reachedFor, shapeOf, streamPath, type Reached } from "../src/stall/stream.ts";
import { first } from "./helpers.ts";
import { MINUTE, SECOND, captured, edited, editedInTurn, opened, ran, reachedBy } from "./stall-scene.ts";

const GUESS = "acting on a guess";

const UNANSWERED = "no single call answers";

const FILE = "/project/src/parts.rs";

const PARTS = Array.from({ length: 12 }, (_, at) => `fn part_${at}() -> u32 {\n    part_${at}_value()\n}\n`).join("\n");

const PREAMBLE = [
  "ssh -o BatchMode=yes -o ConnectTimeout=10 service-host bash -s <<'EOF'",
  "set -euo pipefail",
  "cd /srv/service/current",
  "export PATH=/usr/local/bin:/usr/bin:/bin",
  "export LANG=C.UTF-8 TZ=UTC",
].join("\n");

const ASKS: readonly string[] = ["service status --json", "service logs --since 10m", "service config show", "service queue depth"];

function named(reached: readonly Reached[], now: number, means: string): readonly Fingerprint[] {
  return metricOf(reached, now).stalls.filter((one) => one.means.includes(means));
}

test("a shape is the whole command when it fits, so two different greps are two different shapes", () => {
  assert.equal(shapeOf("Bash", "grep -rn foo src"), "grep -rn foo src");
  assert.notEqual(shapeOf("Bash", "grep -rn foo src"), shapeOf("Bash", "grep -rn bar tests"));
  assert.equal(shapeOf("Bash", "  ls   -la \n"), "ls -la");
  assert.equal(shapeOf("Read", "/a/b.ts"), "/a/b.ts");
  assert.ok(shapeOf("Bash", PREAMBLE).endsWith("…"), "a command longer than a shape is shown cut, and says so");
});

test("what one session reached for is not read into another session's metric", () => {
  const home = mkdtempSync(join(tmpdir(), "looper-stream-"));
  try {
    const root = "/some/project";
    note(root, home, reachedBy(ran("mine", "ls"), 1));
    note(root, home, reachedBy(ran("theirs", "set -a"), 2));
    const mine = reachedFor(root, home, "mine");
    assert.equal(mine.kind, "reached");
    if (mine.kind !== "reached") return;
    assert.deepEqual(mine.reached.map((one) => one.shape), ["ls"]);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("where an edit landed is written to the stream and read back unchanged", () => {
  const home = mkdtempSync(join(tmpdir(), "looper-stream-"));
  try {
    const root = "/some/project";
    const one = reachedBy(edited(FILE, PARTS, "part_3_value()", "part_3_value() + 1"), 5);
    assert.equal(one.placed.kind, "placed");
    note(root, home, one);
    const back = reachedFor(root, home, "s");
    assert.equal(back.kind, "reached");
    if (back.kind !== "reached") return;
    assert.deepEqual(back.reached, [one]);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("a stream line written before the stream said where edits landed is not read", () => {
  const home = mkdtempSync(join(tmpdir(), "looper-stream-"));
  try {
    const root = "/some/project";
    const path = streamPath(root, home);
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, `1\tEdit\t${FILE}\tmine\n`);
    note(root, home, reachedBy(ran("mine", "ls"), 2));
    const mine = reachedFor(root, home, "mine");
    assert.equal(mine.kind, "reached");
    if (mine.kind !== "reached") return;
    assert.deepEqual(mine.reached.map((one) => one.tool), ["Bash"]);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

function reads(now: number, files: readonly string[]): readonly Reached[] {
  return files.map((file, at) => reachedBy(opened("s", file), now - (files.length - at) * MINUTE));
}

test("reading many different files is research; reading the same file eight times is a stall", () => {
  const now = Date.now();
  const research = metricOf(reads(now, ["a", "b", "c", "d", "e", "f", "g", "h", "i"]), now);
  assert.deepEqual([...research.stalls], []);
  const circling = metricOf(reads(now, ["a", "a", "a", "a", "a", "a", "a", "a", "a"]), now);
  assert.ok(circling.stalls.length > 0);
  assert.ok(circling.stalls.some((one) => one.means.includes("re-reading")));
});

test("without a session id the stall metric says nothing, rather than everyone's shapes", () => {
  const said = new Stall().inject({ root: process.cwd(), budget: 9800, turn: NO_TURN, said: NEVER_SAID });
  assert.deepEqual([...said], []);
});

test("twelve edits inside a minute, each at a different place in one file, are one change being built, not a guess", () => {
  const now = Date.now();
  const steps = Array.from({ length: 12 }, (_, at) => ({ gone: `part_${at}_value()`, put: `part_${at}_value() + 1` }));
  const reached = editedInTurn(FILE, PARTS, steps, now - MINUTE, 5 * SECOND);
  assert.ok(reached.every((one) => one.placed.kind === "placed"));
  assert.deepEqual([...named(reached, now, GUESS)], []);
});

test("an edit that rewrites what an edit before it wrote, within minutes, is the guess shape", () => {
  const now = Date.now();
  const reached = editedInTurn(
    FILE,
    PARTS,
    [
      { gone: "part_3_value()", put: "part_3_value() + 1" },
      { gone: "part_7_value()", put: "part_7_value() * 2" },
      { gone: "part_3_value() + 1", put: "part_3_value() + 2" },
    ],
    now - 3 * MINUTE,
    MINUTE,
  );
  const said = named(reached, now, GUESS);
  assert.equal(said.length, 1);
  assert.equal(first(said).shape, FILE);
  assert.equal(first(said).times, 2, "the edit at another place in the file is not part of it");
});

test("an edit undone by the next one is the guess shape", () => {
  const now = Date.now();
  const reached = editedInTurn(
    FILE,
    PARTS,
    [
      { gone: "part_5_value()", put: "other_value()" },
      { gone: "other_value()", put: "part_5_value()" },
    ],
    now - 2 * MINUTE,
    MINUTE,
  );
  assert.equal(first(named(reached, now, GUESS)).times, 2);
});

test("an edit that only leans on an earlier edit's text to find its place did not rewrite it", () => {
  const now = Date.now();
  const reached = editedInTurn(
    FILE,
    PARTS,
    [
      { gone: "part_3_value()", put: "part_3_value() + 1" },
      { gone: "fn part_3() -> u32 {\n    part_3_value() + 1", put: "fn part_3() -> u64 {\n    part_3_value() + 1" },
    ],
    now - 2 * MINUTE,
    MINUTE,
  );
  assert.deepEqual([...named(reached, now, GUESS)], []);
});

test("the same place written again after more than five minutes is not counted as a guess", () => {
  const now = Date.now();
  const reached = editedInTurn(
    FILE,
    PARTS,
    [
      { gone: "part_3_value()", put: "part_3_value() + 1" },
      { gone: "part_3_value() + 1", put: "part_3_value() + 2" },
    ],
    now - 7 * MINUTE,
    6 * MINUTE,
  );
  assert.deepEqual([...named(reached, now, GUESS)], []);
});

test("an edit is not compared with one made before the file changed some other way, since where that text went is not known", () => {
  const now = Date.now();
  const before = reachedBy(edited(FILE, PARTS, "part_3_value()", "part_3_value() + 1"), now - 2 * MINUTE);
  const reshaped = `use std::fmt;\n\n${PARTS.replace("part_3_value()", () => "part_3_value() + 1")}`;
  const after = reachedBy(edited(FILE, reshaped, "part_3_value() + 1", "part_3_value() + 2"), now - MINUTE);
  assert.deepEqual([...named([before, after], now, GUESS)], []);
});

test("an edit that arrives without the file as it was cannot be placed, says why, and nothing is compared across it", () => {
  const now = Date.now();
  const bare = {
    session_id: "s",
    tool_name: "Edit",
    tool_input: { file_path: FILE, old_string: "part_3_value()", new_string: "part_3_value() + 1", replace_all: false },
    tool_response: { filePath: FILE },
  };
  const unplaced = reachedBy(bare, now - 2 * MINUTE);
  assert.equal(unplaced.placed.kind, "unplaced");
  if (unplaced.placed.kind !== "unplaced") return;
  assert.match(unplaced.placed.why, /no copy of the file/);
  const again = reachedBy(
    edited(FILE, PARTS.replace("part_3_value()", () => "part_3_value() + 1"), "part_3_value() + 1", "part_3_value() + 2"),
    now - MINUTE,
  );
  assert.deepEqual([...named([unplaced, again], now, GUESS)], []);
});

test("Claude Code's own payloads: a whole-file rewrite is placed line by line, so an edit between its changes is not a guess, and undoing one is", () => {
  const now = Date.now();
  const rewritten = captured("written-then-edited").slice(1);
  const reached = rewritten.map((one, at) => reachedBy(one, now - MINUTE + at * 10 * SECOND));
  assert.deepEqual(
    reached.map((one) => one.placed.kind),
    ["placed", "placed", "placed", "placed"],
  );
  const said = named(reached, now, GUESS);
  assert.equal(said.length, 1);
  assert.equal(first(said).times, 2, "the rewrite and the edit that undid it; the edit between and the word replaced everywhere are not");
});

const CREATED: readonly { readonly name: string; readonly writes: number }[] = [
  { name: "written-then-edited", writes: 5 },
  { name: "no-newline-at-the-end", writes: 4 },
];

test("Claude Code's own payloads: a new file written over again and again inside a minute is the guess shape", () => {
  const now = Date.now();
  for (const { name, writes } of CREATED) {
    const reached = captured(name).map((one, at) => reachedBy(one, now - MINUTE + at * 10 * SECOND));
    assert.ok(reached.every((one) => one.placed.kind === "placed"), `${name}: every write was placed`);
    const said = named(reached, now, GUESS);
    assert.equal(said.length, 1, name);
    assert.equal(first(said).times, writes, name);
  }
});

test("four commands that share their first lines but ask different things are four questions, not one asked four times", () => {
  const now = Date.now();
  const reached = ASKS.map((ask, at) => reachedBy(ran("s", `${PREAMBLE}\n${ask}\nEOF`), now - (10 - at) * MINUTE));
  assert.equal(new Set(reached.map((one) => one.shape)).size, 1, "they look the same once cut to a shape");
  assert.deepEqual([...named(reached, now, UNANSWERED)], []);
});

test("the same long command four times is one question asked four times, and its shape says it was cut", () => {
  const now = Date.now();
  const command = `${PREAMBLE}\n${first(ASKS)}\nEOF`;
  const reached = [0, 1, 2, 3].map((at) => reachedBy(ran("s", command), now - (10 - at) * MINUTE));
  const said = named(reached, now, UNANSWERED);
  assert.equal(said.length, 1);
  assert.equal(first(said).times, 4);
  assert.ok(first(said).shape.endsWith("…"));
});
