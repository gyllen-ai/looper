import { test } from "node:test";
import { NO_TURN } from "../src/capability.ts";
import { NEVER_SAID } from "../src/said.ts";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Loop } from "../src/loop/capability.ts";
import { Stall } from "../src/stall/capability.ts";
import { keep, lastSeen } from "../src/loop/cache.ts";
import { metricOf } from "../src/stall/fingerprints.ts";
import { saidAbout as saidAboutLoop } from "../src/loop/capability.ts";
import { saidAbout as saidAboutStall } from "../src/stall/capability.ts";
import type { Reached } from "../src/stall/stream.ts";
import { MINUTE, edited, opened, ran, reachedBy } from "./stall-scene.ts";

const HOUR = 3600 * 1000;

function home(): string {
  return mkdtempSync(join(tmpdir(), "looper-home-"));
}

test("a loop nobody has asked invents no counts, and is never read as healthy", () => {
  const said = [...new Loop("/nowhere/at/all").inject({ root: "/nowhere/at/all", budget: 9800, turn: NO_TURN, said: NEVER_SAID })];
  assert.equal(said.length, 1);
  const first = said[0];
  const text = first === undefined ? "" : first.text;
  assert.match(text, /declares no checks/);
  assert.doesNotMatch(text, /ok=|broken=|blind=/);
});

test("a whole loop says nothing, and a broken one arrives without anything being run", () => {
  const where = home();
  const root = "/probe/one";
  try {
    keep(root, where, { at: new Date().toISOString(), ok: 4, broken: 0, blind: 0, failing: [] });
    assert.equal(lastSeen(root, where).kind, "kept");

    keep(root, where, { at: new Date().toISOString(), ok: 2, broken: 0, blind: 1, failing: ["loop.db"] });
    const read = lastSeen(root, where);
    assert.equal(read.kind, "kept");
    if (read.kind !== "kept") return;
    assert.equal(read.kept.blind, 1);
  } finally {
    rmSync(where, { recursive: true, force: true });
  }
});

test("an old answer still arrives, carrying its age", () => {
  const said = saidAboutLoop(
    { at: new Date(Date.now() - 5 * HOUR).toISOString(), ok: 1, broken: 1, blind: 0, failing: ["loop.api"] },
    Date.now(),
  );
  assert.match(said, /5 hour\(s\) ago/);
  assert.match(said, /old enough to re-ask/);
  assert.match(said, /loop\.api/);
});

test("one command shape repeated in a window is named as a stall, not as a scolding", () => {
  const now = Date.now();
  const reached: Reached[] = [];
  for (let i = 0; i < 6; i += 1) reached.push(reachedBy(ran("s", "ps aux"), now - (20 - i) * MINUTE));
  const metric = metricOf(reached, now);
  assert.equal(metric.stalls.length, 1);
  const first = metric.stalls[0];
  assert.notEqual(first, undefined);
  assert.equal(first === undefined ? 0 : first.times, 6);
  assert.match(first === undefined ? "" : first.means, /no single call answers/);
});

test("an edit rewritten within minutes is the guess-instead-of-looking shape", () => {
  const now = Date.now();
  const reached = [
    reachedBy(edited("src/a.ts", "const limit = 1;\n", "1", "2"), now - 5 * MINUTE),
    reachedBy(edited("src/a.ts", "const limit = 2;\n", "2", "3"), now - 4 * MINUTE),
  ];
  const stalls = metricOf(reached, now).stalls;
  assert.equal(stalls.length, 1);
  const only = stalls[0];
  assert.match(only === undefined ? "" : only.means, /acting on a guess/);
});

test("ordinary work is not a stall", () => {
  const now = Date.now();
  const reached = [
    reachedBy(opened("s", "src/a.ts"), now - 5 * MINUTE),
    reachedBy(edited("src/a.ts", "const limit = 1;\n", "1", "2"), now - 4 * MINUTE),
    reachedBy(opened("s", "src/b.ts"), now - 3 * MINUTE),
    reachedBy(edited("src/b.ts", "const limit = 1;\n", "1", "2"), now - 2 * MINUTE),
  ];
  assert.deepEqual([...metricOf(reached, now).stalls], []);
});

test("the stall metric says what to do with a shape, and it is never to guess", () => {
  const now = Date.now();
  const reached: Reached[] = [];
  for (let i = 0; i < 6; i += 1) reached.push(reachedBy(ran("s", "ps aux"), now - (20 - i) * MINUTE));

  const said = saidAboutStall(metricOf(reached, now).stalls);
  assert.match(said, /least\s+input per unit of certainty/);
  assert.match(said, /never least input/);
  assert.match(
    said,
    /one more check, not a shorter one/,
    "a guess costs almost nothing and is the worst outcome available, so the metric must not read as an instruction to do less",
  );
});
