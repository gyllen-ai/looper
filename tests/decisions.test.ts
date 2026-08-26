import { DECISIONS_TOOL } from "../src/config.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Decisions } from "../src/decisions/capability.ts";
import {
  HASH_LENGTH,
  hashOf,
  readDecisions,
  standings,
  type Standing,
} from "../src/decisions/store.ts";

function scratch(): string {
  const root = mkdtempSync(join(tmpdir(), "looper-decisions-"));
  mkdirSync(join(root, ".looper"), { recursive: true });
  return root;
}

function ask(root: string, args: ReadonlyMap<string, string>): string {
  const result = new Decisions().call({ root, tool: DECISIONS_TOOL, args });
  assert.equal(result.kind, "text");
  if (result.kind !== "text") throw new Error("unreachable");
  return result.text;
}

function write(root: string, summary: string, depends: string): string {
  return ask(
    root,
    new Map([
      ["summary", summary],
      ["decision", "asked for it, it breaks the rule, here is what it costs"],
      ["kind", "security"],
      ["depends", depends],
    ]),
  );
}

function only(found: readonly Standing[]): Standing {
  assert.equal(found.length, 1);
  const one = found[0];
  if (one === undefined) throw new Error("unreachable");
  return one;
}

test("an entry records the hash of what it rests on, and reads back as watched", () => {
  const root = scratch();
  try {
    writeFileSync(join(root, "thing.ts"), "export const one = 1;\n");
    const said = write(root, "we held a credential we should not hold", "thing.ts");

    assert.match(said, /^recorded:/);
    assert.equal(readDecisions(root).length, 1);
    assert.equal(only(standings(root)).kind, "watched");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("changing a file an entry rests on says READ IT AGAIN, with both hashes", () => {
  const root = scratch();
  try {
    writeFileSync(join(root, "thing.ts"), "export const one = 1;\n");
    write(root, "we held a credential we should not hold", "thing.ts");
    writeFileSync(join(root, "thing.ts"), "export const one = 2;\n");

    const standing = only(standings(root));
    assert.equal(standing.kind, "moved");

    const shown = ask(root, new Map());
    assert.match(shown, /READ IT AGAIN/);
    assert.match(shown, /the files now hash/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("deleting a file an entry rests on is said out loud rather than counted as fresh", () => {
  const root = scratch();
  try {
    writeFileSync(join(root, "thing.ts"), "export const one = 1;\n");
    write(root, "we held a credential we should not hold", "thing.ts");
    rmSync(join(root, "thing.ts"));

    assert.equal(only(standings(root)).kind, "gone");
    assert.match(ask(root, new Map()), /no longer there/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an entry resting on no file says so, because only a person can refresh it", () => {
  const root = scratch();
  try {
    write(root, "a leaked password is not rotated today", "none");

    assert.equal(only(standings(root)).kind, "unwatchable");
    assert.match(ask(root, new Map()), /only a person can/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rereading re-records the hash, and nothing else does", () => {
  const root = scratch();
  try {
    writeFileSync(join(root, "thing.ts"), "export const one = 1;\n");
    write(root, "we held a credential we should not hold", "thing.ts");
    writeFileSync(join(root, "thing.ts"), "export const one = 2;\n");
    assert.equal(only(standings(root)).kind, "moved");

    const said = ask(root, new Map([["reread", "we held a credential we should not hold"]]));
    assert.match(said, /re-recorded/);
    assert.equal(only(standings(root)).kind, "watched");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an entry that names a file which is not there is refused rather than written", () => {
  const root = scratch();
  try {
    const said = write(root, "we held a credential we should not hold", "nowhere.ts");

    assert.match(said, /did not record/);
    assert.equal(readDecisions(root).length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the same summary twice corrects the entry rather than duplicating it", () => {
  const root = scratch();
  try {
    writeFileSync(join(root, "thing.ts"), "export const one = 1;\n");
    write(root, "we held a credential we should not hold", "thing.ts");
    const again = write(root, "we held a credential we should not hold", "thing.ts");

    assert.match(again, /^corrected:/);
    assert.equal(readDecisions(root).length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the injection says nothing with no entries, and names the stale ones when there are", () => {
  const root = scratch();
  try {
    assert.deepEqual([...new Decisions().inject({ root, touched: [] })], []);

    writeFileSync(join(root, "thing.ts"), "export const one = 1;\n");
    write(root, "we held a credential we should not hold", "thing.ts");
    const calm = new Decisions().inject({ root, touched: [] });
    assert.equal(calm.length, 1);
    const first = calm[0];
    if (first === undefined) throw new Error("unreachable");
    assert.match(first.text, /1 decision\(s\) taken here with a known cost/);

    writeFileSync(join(root, "thing.ts"), "export const one = 2;\n");
    const loud = new Decisions().inject({ root, touched: [] });
    const said = loud[0];
    if (said === undefined) throw new Error("unreachable");
    assert.match(said.text, /rest on files that have changed/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a decision may rest on a whole directory, and moves when a file under it changes", () => {
  const root = scratch();
  try {
    mkdirSync(join(root, "crate", "src"), { recursive: true });
    writeFileSync(join(root, "crate", "Cargo.toml"), "[package]\n");
    writeFileSync(join(root, "crate", "src", "lib.rs"), "pub fn one() {}\n");

    const said = write(root, "the ranges are vendored rather than fetched", "crate");
    assert.match(said, /^recorded:/);
    assert.equal(only(standings(root)).kind, "watched");

    writeFileSync(join(root, "crate", "src", "lib.rs"), "pub fn two() {}\n");
    assert.equal(only(standings(root)).kind, "moved");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a file added under a directory it rests on moves the decision too", () => {
  const root = scratch();
  try {
    mkdirSync(join(root, "crate"), { recursive: true });
    writeFileSync(join(root, "crate", "one.rs"), "pub fn one() {}\n");
    write(root, "the ranges are vendored rather than fetched", "crate");
    assert.equal(only(standings(root)).kind, "watched");

    writeFileSync(join(root, "crate", "two.rs"), "pub fn two() {}\n");
    assert.equal(only(standings(root)).kind, "moved");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a directory hashes the same however the filesystem happens to order it", () => {
  const root = scratch();
  try {
    mkdirSync(join(root, "crate"), { recursive: true });
    writeFileSync(join(root, "crate", "b.rs"), "b\n");
    writeFileSync(join(root, "crate", "a.rs"), "a\n");
    const first = hashOf(root, ["crate"]);

    rmSync(join(root, "crate"), { recursive: true, force: true });
    mkdirSync(join(root, "crate"), { recursive: true });
    writeFileSync(join(root, "crate", "a.rs"), "a\n");
    writeFileSync(join(root, "crate", "b.rs"), "b\n");

    assert.equal(hashOf(root, ["crate"]), first);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a decision resting only on files hashes exactly as it always did", () => {
  const root = scratch();
  try {
    writeFileSync(join(root, "thing.ts"), "export const one = 1;\n");
    const asBefore = createHash("sha256")
      .update(readFileSync(join(root, "thing.ts")))
      .digest("hex")
      .slice(0, HASH_LENGTH);
    assert.equal(hashOf(root, ["thing.ts"]), asBefore);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a dependency that cannot be read leaves every other decision standing", {
  skip: process.getuid !== undefined && process.getuid() === 0
    ? "a root user can read a file with no read bit"
    : false,
}, () => {
  const root = scratch();
  try {
    writeFileSync(join(root, "readable.ts"), "export const one = 1;\n");
    write(root, "the first one rests on something readable", "readable.ts");

    writeFileSync(join(root, "shut.ts"), "export const two = 2;\n");
    write(root, "the second one rests on something shut", "shut.ts");
    chmodSync(join(root, "shut.ts"), 0o000);

    const found = standings(root);
    assert.equal(found.length, 2);
    const shut = found.filter((one) => one.decision.depends.includes("shut.ts"));
    const open = found.filter((one) => one.decision.depends.includes("readable.ts"));
    assert.equal(only(shut).kind, "unreadable");
    assert.equal(only(open).kind, "watched");
  } finally {
    chmodSync(join(root, "shut.ts"), 0o644);
    rmSync(root, { recursive: true, force: true });
  }
});
