import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { execFileSync } from "node:child_process";

import { RUST_ENGINE_DIR } from "../src/config.ts";
import { failureOf } from "../src/fields.ts";
import { judgeRust } from "../src/law/rust/drive.ts";

const BINARY = "target/release/looper-rust";

function engineThatWasBuilt(root: string, binary: string): void {
  const engine = join(root, RUST_ENGINE_DIR);
  mkdirSync(join(engine, "src"), { recursive: true });
  mkdirSync(join(engine, "target/release"), { recursive: true });
  const longAgo = (Date.now() - 60_000) / 1000;
  for (const written of ["Cargo.toml", "Cargo.lock", "src/main.rs"]) {
    writeFileSync(join(engine, written), "");
    utimesSync(join(engine, written), longAgo, longAgo);
  }
  writeFileSync(join(engine, BINARY), binary);
  chmodSync(join(engine, BINARY), 0o755);
}

const A_LOT_TO_SAY = 400;

test("a Rust reader that fails after saying a great deal is quoted briefly, with how it ended", () => {
  const root = mkdtempSync(join(tmpdir(), "looper-rs-why-"));
  try {
    engineThatWasBuilt(
      root,
      `#!/bin/sh\ni=0\nwhile [ $i -lt ${A_LOT_TO_SAY} ]; do echo "thread 'main' panicked at line $i: a long account of what went wrong in the reader" >&2; i=$((i+1)); done\nexit 101\n`,
    );

    const said = judgeRust(root, root, [join(root, "a.rs")]);

    assert.equal(said.kind, "unavailable");
    if (said.kind !== "unavailable") return;
    assert.ok(
      said.detail.length < 1500,
      `what the reader said on the way out used to be thrown away, and when it began to be kept nothing limited it: ${said.detail.length} characters of it went into what the agent is told, where a hook may say 10,000 in all`,
    );
    assert.ok(said.detail.includes("exited with status 101"), said.detail.slice(0, 300));
    assert.ok(said.detail.includes(`line ${A_LOT_TO_SAY - 1}`), "what is kept is the end of it, which is where a program says why it stopped");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a program stopped for taking too long is said to have taken too long", () => {
  let said = "";
  try {
    execFileSync(process.execPath, ["-e", "setTimeout(() => {}, 5000)"], { encoding: "utf8", timeout: 100, stdio: ["ignore", "pipe", "pipe"] });
  } catch (cause) {
    said = failureOf(cause, 600);
  }

  assert.ok(
    said.includes("took too long"),
    `a reader that ran past its time was said to have been "stopped by SIGTERM and said nothing", which is what happened to it and not why: ${said}`,
  );
});
