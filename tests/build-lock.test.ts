import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { withLockFor, type Patience } from "../src/atomic.ts";

const QUICK: Patience = { waitMs: 10, giveUpMs: 2_000, staleMs: 60_000 };

const HOLDS_FOR_MS = 400;

function lockOf(path: string): string {
  return `${path}.looper-lock`;
}

function pollUntil(condition: () => boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const look = () => {
      if (condition()) return resolve();
      if (Date.now() - started > QUICK.giveUpMs) return reject(new Error("the holder never took the lock"));
      setTimeout(look, 5);
    };
    look();
  });
}

function ended(child: ReturnType<typeof spawn>): Promise<number | null> {
  return new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code) => resolve(code));
  });
}

test("a lock is held for the body and let go after it, with what the body answered", () => {
  const root = mkdtempSync(join(tmpdir(), "looper-lock-"));
  try {
    const path = join(root, "engine");
    const held = withLockFor(path, QUICK, () => "built");
    assert.deepEqual(held, { kind: "held", result: "built" });
    assert.ok(!existsSync(lockOf(path)), "the lock stayed behind after the body had finished");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a lock left behind by a holder that died is taken over once it is older than the patience", () => {
  const root = mkdtempSync(join(tmpdir(), "looper-lock-"));
  try {
    const path = join(root, "engine");
    writeFileSync(lockOf(path), "");
    const longAgo = (Date.now() - 10_000) / 1000;
    utimesSync(lockOf(path), longAgo, longAgo);
    const held = withLockFor(path, { waitMs: 10, giveUpMs: 500, staleMs: 5_000 }, () => "built");
    assert.deepEqual(held, { kind: "held", result: "built" });
    assert.ok(!existsSync(lockOf(path)), "the abandoned lock was taken over and then left behind again");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a lock somebody is holding is waited for, and the body runs only once they let go", async () => {
  const root = mkdtempSync(join(tmpdir(), "looper-lock-"));
  try {
    const path = join(root, "engine");
    const holder = spawn(
      process.execPath,
      [
        "-e",
        'const fs = require("node:fs"); fs.writeFileSync(process.env.LOCK, ""); setTimeout(() => fs.unlinkSync(process.env.LOCK), Number(process.env.HOLD));',
      ],
      { env: { LOCK: lockOf(path), HOLD: String(HOLDS_FOR_MS) }, stdio: "ignore" },
    );
    await pollUntil(() => existsSync(lockOf(path)));
    const arrived = Date.now();
    const held = withLockFor(path, QUICK, () => Date.now() - arrived);
    assert.equal(held.kind, "held");
    if (held.kind !== "held") return;
    assert.ok(
      held.result >= HOLDS_FOR_MS / 2,
      `the body ran ${held.result} ms after arriving, while the holder still had the lock for ${HOLDS_FOR_MS} ms`,
    );
    assert.ok(!existsSync(lockOf(path)));
    assert.equal(await ended(holder), 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a lock nobody lets go of within the patience is refused, naming the lock and the wait", () => {
  const root = mkdtempSync(join(tmpdir(), "looper-lock-"));
  try {
    const path = join(root, "engine");
    writeFileSync(lockOf(path), "");
    let ran = 0;
    const held = withLockFor(path, { waitMs: 10, giveUpMs: 200, staleMs: 60_000 }, () => {
      ran += 1;
    });
    assert.equal(held.kind, "busy");
    if (held.kind !== "busy") return;
    assert.ok(held.why.includes(lockOf(path)), held.why);
    assert.ok(held.why.includes("0.2 seconds"), held.why);
    assert.equal(ran, 0, "the body ran although the lock was never taken");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a body that throws lets go of the lock on the way out, and the throw is not swallowed", () => {
  const root = mkdtempSync(join(tmpdir(), "looper-lock-"));
  try {
    const path = join(root, "engine");
    assert.throws(
      () =>
        withLockFor(path, QUICK, () => {
          throw new Error("the build fell over");
        }),
      /the build fell over/,
    );
    assert.ok(!existsSync(lockOf(path)), "the lock stayed behind after the body threw");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
