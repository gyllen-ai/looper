import { test } from "node:test";
import assert from "node:assert/strict";
import fs, { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { withLockFor, writeAtomically, writeKeepingPrior } from "../src/atomic.ts";

const LOCK_SUFFIX = ".looper-lock";

const TEMP_SUFFIX = ".looper-tmp";

const QUICKLY = { waitMs: 5, giveUpMs: 200, staleMs: 1000 };

type Hook = (args: readonly unknown[]) => void;

function during<T>(names: readonly string[], hook: Hook, body: () => T): T {
  const originals = new Map<string, unknown>();
  for (const name of names) {
    const original: unknown = Reflect.get(fs, name);
    if (typeof original !== "function") assert.fail(`node:fs has no ${name} to watch`);
    originals.set(name, original);
    Reflect.set(fs, name, (...args: unknown[]) => {
      hook(args);
      return Reflect.apply(original, fs, args);
    });
  }
  syncBuiltinESMExports();
  try {
    return body();
  } finally {
    for (const [name, original] of originals) Reflect.set(fs, name, original);
    syncBuiltinESMExports();
  }
}

function scratch(): string {
  return mkdtempSync(join(tmpdir(), "looper-races-"));
}

function heldBySomebody(lock: string, words: string, ageMs: number): void {
  writeFileSync(lock, words, { flag: "wx" });
  const when = new Date(Date.now() - ageMs);
  utimesSync(lock, when, when);
}

test("a lock let go between being seen and being aged is free, not an error", () => {
  const dir = scratch();
  try {
    const path = join(dir, "notes.md");
    const lock = `${path}${LOCK_SUFFIX}`;
    heldBySomebody(lock, "another looper\n", 0);
    let letGo = false;
    const held = during(
      ["statSync", "lstatSync"],
      (args) => {
        if (letGo || args[0] !== lock) return;
        letGo = true;
        rmSync(lock);
      },
      () => withLockFor(path, QUICKLY, () => "ran"),
    );
    assert.ok(letGo, "the holder never let go mid-step, so this proved nothing");
    assert.deepEqual(held, { kind: "held", result: "ran" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a stale lock somebody else broke first is free, not an error", () => {
  const dir = scratch();
  try {
    const path = join(dir, "notes.md");
    const lock = `${path}${LOCK_SUFFIX}`;
    heldBySomebody(lock, "a looper that died\n", 60_000);
    let brokenFirst = false;
    const held = during(
      ["unlinkSync", "renameSync"],
      (args) => {
        if (brokenFirst || args[0] !== lock) return;
        brokenFirst = true;
        rmSync(lock);
      },
      () => withLockFor(path, QUICKLY, () => "ran"),
    );
    assert.ok(brokenFirst, "nobody broke the lock first, so this proved nothing");
    assert.deepEqual(held, { kind: "held", result: "ran" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a stale lock is broken once: the second waiter to break it leaves alone the lock the first one took", () => {
  const dir = scratch();
  try {
    const path = join(dir, "notes.md");
    const lock = `${path}${LOCK_SUFFIX}`;
    heldBySomebody(lock, "a looper that died\n", 60_000);
    let overtaken = false;
    let ran = false;
    const held = during(
      ["unlinkSync", "renameSync"],
      (args) => {
        if (overtaken || args[0] !== lock) return;
        overtaken = true;
        rmSync(lock);
        writeFileSync(lock, "the waiter that broke it first\n", { flag: "wx" });
      },
      () =>
        withLockFor(path, QUICKLY, () => {
          ran = true;
        }),
    );
    assert.ok(overtaken, "nobody overtook this waiter, so this proved nothing");
    assert.equal(held.kind, "busy", "two loopers held one lock at once");
    assert.equal(ran, false);
    assert.equal(readFileSync(lock, "utf8"), "the waiter that broke it first\n", "the live lock was broken");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a holder whose lock was broken under it does not let go of the lock that replaced it", () => {
  const dir = scratch();
  try {
    const path = join(dir, "notes.md");
    const lock = `${path}${LOCK_SUFFIX}`;
    const held = withLockFor(path, QUICKLY, () => {
      rmSync(lock);
      writeFileSync(lock, "the looper that broke it\n", { flag: "wx" });
      return "ran";
    });
    assert.deepEqual(held, { kind: "held", result: "ran" });
    assert.equal(readFileSync(lock, "utf8"), "the looper that broke it\n", "the holder let go of a lock that was not its own");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a holder lets go of its own lock", () => {
  const dir = scratch();
  try {
    const path = join(dir, "notes.md");
    assert.deepEqual(withLockFor(path, QUICKLY, () => "ran"), { kind: "held", result: "ran" });
    assert.deepEqual(readdirSync(dir), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

function secondWriterAt(path: string, words: string): Hook {
  let arrived = false;
  return (args) => {
    const from = args[0];
    if (arrived || typeof from !== "string" || !from.endsWith(TEMP_SUFFIX)) return;
    arrived = true;
    writeAtomically(path, words);
  };
}

test("two writers of one file at once both finish, and the one that finished last is what is there", () => {
  const dir = scratch();
  try {
    const path = join(dir, "seen.bash");
    during(["renameSync"], secondWriterAt(path, "the second writer\n"), () => writeAtomically(path, "the first writer\n"));
    assert.equal(readFileSync(path, "utf8"), "the first writer\n");
    assert.deepEqual(readdirSync(dir), ["seen.bash"], "a writer left something of its own behind");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("two writers of a file that already holds something both finish, and nothing of either is left beside it", () => {
  const dir = scratch();
  try {
    const path = join(dir, "seen.bash");
    writeFileSync(path, "what was there\n");
    during(["renameSync"], secondWriterAt(path, "the second writer\n"), () => writeAtomically(path, "the first writer\n"));
    assert.equal(readFileSync(path, "utf8"), "the first writer\n");
    assert.deepEqual(readdirSync(dir), ["seen.bash"], "a writer left something of its own behind");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("every writer writes through a temporary file of its own, named so it is recognisably looper's", () => {
  const dir = scratch();
  try {
    const path = join(dir, "seen.bash");
    const temporaries: string[] = [];
    during(
      ["renameSync"],
      (args) => {
        const from = args[0];
        if (typeof from === "string") temporaries.push(from);
      },
      () => {
        writeAtomically(path, "one\n");
        writeAtomically(path, "two\n");
      },
    );
    assert.equal(temporaries.length, 2);
    assert.equal(new Set(temporaries).size, 2, "two writes shared one temporary name");
    for (const one of temporaries) {
      assert.ok(one.startsWith(`${path}.`) && one.endsWith(TEMP_SUFFIX), `${one} is not recognisably looper's`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a write that fails leaves no temporary file behind, and says which file it could not write", () => {
  const dir = scratch();
  try {
    const path = join(dir, "seen.bash");
    assert.throws(
      () =>
        during(
          ["renameSync"],
          () => {
            throw new RangeError("the disk said no");
          },
          () => writeAtomically(path, "never arrives\n"),
        ),
      (cause: unknown) => cause instanceof Error && cause.message.includes(path) && cause.message.includes("the disk said no"),
    );
    assert.deepEqual(readdirSync(dir), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("keeping the prior version still keeps it beside the file, under the name a person looks for", () => {
  const dir = scratch();
  try {
    const path = join(dir, "settings.json");
    writeFileSync(path, "before\n");
    const written = writeKeepingPrior(path, "after\n");
    assert.deepEqual(written.backup, { kind: "kept", path: `${path}.looper-backup` });
    assert.equal(readFileSync(`${path}.looper-backup`, "utf8"), "before\n");
    assert.equal(readFileSync(path, "utf8"), "after\n");
    assert.ok(statSync(path).isFile());
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
