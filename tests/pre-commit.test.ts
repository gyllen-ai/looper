import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Law } from "../src/law/capability.ts";
import { preCommitScript } from "../src/config.ts";
import { gitIn as git } from "./helpers.ts";
import { runInit } from "../src/init.ts";
import { INSTALLED } from "../src/config.ts";
import { WITHOUT_THE_RUST_ENGINE } from "./rust-engine.ts";

const NO_PATH: readonly string[] = [];

const BROKEN = "export function f() {\n  try { g() } catch { return null }\n}\n";

function started(): string {
  const root = mkdtempSync(join(tmpdir(), "looper-pc-"));
  mkdirSync(join(root, "src"), { recursive: true });
  git(root, "init", "-q");
  git(root, "config", "user.email", "t@example.com");
  git(root, "config", "user.name", "t");
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "t" }));
  writeFileSync(join(root, "src/a.ts"), "export const rate = 0.2;\n");
  git(root, "add", "-A");
  git(root, "commit", "-qm", "before");
  return root;
}

function verdictOn(root: string) {
  return new Law().onHook({ root, event: "PreCommit", payload: { kind: "none" } });
}

test("init installs the hook where git already looks", () => {
  const root = started();
  try {
    const report = runInit(root, INSTALLED, NO_PATH);

    assert.ok(report.steps.some((step) => step.kind === "gate-wired"));
    assert.equal(report.commitGate, "wired");
    assert.ok(existsSync(join(root, ".git/hooks/pre-commit")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the commit check reads staged files, not a payload it was never given", () => {
  const root = started();
  try {
    runInit(root, INSTALLED, NO_PATH);
    writeFileSync(join(root, "src/bad.ts"), BROKEN);
    git(root, "add", "-A");

    const outcome = verdictOn(root);
    assert.equal(
      outcome.kind,
      "block",
      "a git hook is run with empty stdin on purpose, so an empty payload must not mean pass",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a clean staged change passes the commit check", () => {
  const root = started();
  try {
    runInit(root, INSTALLED, NO_PATH);
    writeFileSync(join(root, "src/b.ts"), "export const vat = 0.25;\n");
    git(root, "add", "-A");

    assert.equal(verdictOn(root).kind, "pass");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a hook the project already wrote is never overwritten", () => {
  const root = started();
  try {
    const path = join(root, ".git/hooks/pre-commit");
    writeFileSync(path, "#!/bin/sh\ntheir-own-check\n");
    chmodSync(path, 0o755);

    const report = runInit(root, INSTALLED, NO_PATH);

    assert.equal(readFileSync(path, "utf8"), "#!/bin/sh\ntheir-own-check\n");
    assert.equal(report.commitGate, "not-wired");
    const step = report.steps.find((held) => held.kind === "gate-yours");
    assert.ok(step !== undefined, "and it says so, rather than reporting success");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("running init twice does not wire it twice", () => {
  const root = started();
  try {
    runInit(root, INSTALLED, NO_PATH);
    const second = runInit(root, INSTALLED, NO_PATH);

    assert.ok(second.steps.some((step) => step.kind === "gate-already"));
    assert.equal(second.commitGate, "wired");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("only a real verdict blocks; anything else lets the commit through", () => {
  const script = preCommitScript("looper");

  assert.ok(script.includes("-eq 2"), "a verdict of 2 is the only thing that refuses");
  assert.ok(script.includes("-ne 0"), "and every other failure passes");
  assert.ok(script.includes("could not check this commit"));
  assert.ok(
    !script.includes("$CLAUDE_PROJECT_DIR"),
    "a git hook runs from the shell, where that is not set",
  );
});

test("outside a git repository there is nothing to wire, and it says so", () => {
  const root = mkdtempSync(join(tmpdir(), "looper-nogit-"));
  try {
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "t" }));
    const report = runInit(root, INSTALLED, NO_PATH);

    assert.equal(report.commitGate, "not-wired");
    assert.ok(report.steps.some((step) => step.kind === "gate-impossible"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

const CLEAN_RUST = "pub fn tally(n: u8) -> u8 {\n    n\n}\n";

const SINFUL_RUST = "pub fn tally(v: Result<u8, u8>) -> u8 {\n    v.unwrap()\n}\n";

function startedRust(): string {
  const root = mkdtempSync(join(tmpdir(), "looper-pcrs-"));
  mkdirSync(join(root, "src"), { recursive: true });
  git(root, "init", "-q");
  git(root, "config", "user.email", "t@example.com");
  git(root, "config", "user.name", "t");
  writeFileSync(join(root, "Cargo.toml"), '[package]\nname = "t"\nversion = "0.1.0"\nedition = "2021"\n');
  writeFileSync(join(root, "src/main.rs"), "#![deny(unused_must_use)]\n#![deny(for_loops_over_fallibles)]\n#![deny(dead_code)]\n#![deny(unused_variables)]\n#![deny(unused_assignments)]\nfn main() {}\n");
  git(root, "add", "-A");
  git(root, "commit", "-qm", "before");
  return root;
}

test("a Rust file at the commit gate is judged as Rust, not as unreadable TypeScript", WITHOUT_THE_RUST_ENGINE, () => {
  const root = startedRust();
  try {
    writeFileSync(join(root, "src/b.rs"), CLEAN_RUST);
    git(root, "add", "-A");

    const clean = verdictOn(root);
    assert.equal(clean.kind, "pass");

    writeFileSync(join(root, "src/b.rs"), SINFUL_RUST);
    git(root, "add", "-A");

    const sinful = verdictOn(root);
    assert.equal(sinful.kind, "block");
    if (sinful.kind !== "block") return;
    assert.ok(sinful.reason.includes("RUST-ERROR:1"));
    assert.ok(!sinful.reason.includes("TS-ERROR:8"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

const UNPARSEABLE_RUST = "pub fn wrong( -> u8 {\n    let x = ;\n}\n";

test("a crate the Rust half cannot read is said out loud, not passed in silence", WITHOUT_THE_RUST_ENGINE, () => {
  const root = startedRust();
  try {
    writeFileSync(join(root, "src/broken.rs"), UNPARSEABLE_RUST);
    git(root, "add", "-A");
    git(root, "commit", "-qm", "a file nothing can parse");

    writeFileSync(join(root, "src/mine.rs"), SINFUL_RUST);
    git(root, "add", "src/mine.rs");

    const said = verdictOn(root);
    assert.equal(said.kind, "mention");
    if (said.kind !== "mention") return;
    assert.ok(said.note.includes("src/broken.rs"));
    assert.ok(said.note.includes("not judged at all"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
