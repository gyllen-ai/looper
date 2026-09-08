import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { judgeRust } from "../src/law/rust/drive.ts";
import { WITHOUT_THE_RUST_ENGINE } from "./rust-engine.ts";

const LOOPER_ROOT = join(import.meta.dirname, "..");

const MANIFEST = '[package]\nname = "a"\nversion = "0.1.0"\nedition = "2021"\n';

const BUILD_SCRIPT = `#![deny(unused_must_use, for_loops_over_fallibles, dead_code, unused_variables, unused_assignments)]

fn main() {
    println!("cargo:rerun-if-changed=proto/wire.proto");
    println!("cargo:rerun-if-changed=proto/store.proto");
}
`;

const A_MODULE_NAMED_BUILD = `pub fn tell_cargo() {
    println!("cargo:rerun-if-changed=proto/wire.proto");
}
`;

const CARGOS_OWN_KEYS = `use std::path::PathBuf;
use std::process::Command;

const PROBE: &str = env!("CARGO_BIN_EXE_probe");

fn render() -> Command {
    Command::new(env!("CARGO_BIN_EXE_render"))
}

fn icons() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../fixtures")
}

fn named() -> String {
    format!("{} {}", PROBE, env!("CARGO_PKG_NAME"))
}
`;

const A_SETTING = `fn home() -> &'static str {
    env!("HOME")
}

fn spelled_out() -> Option<&'static str> {
    option_env!("DATABASE_URL")
}

fn read_at_runtime() -> Result<String, std::env::VarError> {
    std::env::var("HOME")
}
`;

function aCrate(): string {
  const root = mkdtempSync(join(tmpdir(), "looper-outside-src-"));
  mkdirSync(join(root, "src"), { recursive: true });
  mkdirSync(join(root, "tests"), { recursive: true });
  writeFileSync(join(root, "Cargo.toml"), MANIFEST);
  return root;
}

function firedOn(root: string, file: string, text: string): readonly string[] {
  writeFileSync(join(root, file), text);
  const judged = judgeRust(LOOPER_ROOT, root, [join(root, file)]);
  assert.equal(judged.kind, "found", judged.kind === "found" ? "" : judged.detail);
  return judged.kind === "found" ? judged.hits.map((hit) => `${hit.rule}:${hit.line}`) : [];
}

function only(fired: readonly string[], rule: string): readonly string[] {
  return fired.filter((held) => held.startsWith(`${rule}:`));
}

test("a crate's build script prints, because that is how it talks to cargo", WITHOUT_THE_RUST_ENGINE, () => {
  const root = aCrate();
  try {
    assert.deepEqual(
      only(firedOn(root, "build.rs", BUILD_SCRIPT), "LOG"),
      [],
      "`cargo:rerun-if-changed` on stdout is cargo's protocol, not output, and no logger can carry it. build.rs is the file that starts the program: cargo compiles and runs it as its own binary",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a build script is a crate root, so it appoints its deputies too", WITHOUT_THE_RUST_ENGINE, () => {
  const root = aCrate();
  try {
    const undeputised = BUILD_SCRIPT.split("\n").slice(2).join("\n");
    assert.deepEqual(
      only(firedOn(root, "build.rs", undeputised), "ERROR"),
      ["ERROR:5:1"],
      "cargo compiles a build script as its own crate, so the lints it denies are the ones that hold there",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a module named build.rs under src/ is not a build script", WITHOUT_THE_RUST_ENGINE, () => {
  const root = aCrate();
  try {
    assert.deepEqual(
      only(firedOn(root, join("src", "build.rs"), A_MODULE_NAMED_BUILD), "LOG"),
      ["LOG:1:2"],
      "a build script sits beside Cargo.toml. A module that shares its name starts no program and prints for the same reason any library does",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("in a crate's tests, the keys cargo sets itself are the compiler talking", WITHOUT_THE_RUST_ENGINE, () => {
  const root = aCrate();
  try {
    assert.deepEqual(
      only(firedOn(root, join("tests", "a_check.rs"), CARGOS_OWN_KEYS), "TRUTH"),
      [],
      "`CARGO_BIN_EXE_<name>` is how an integration test finds the binary cargo just built for it and `CARGO_MANIFEST_DIR` is how it finds its own crate. Neither is a setting and neither has an alternative",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a real setting in the same test file is still refused", WITHOUT_THE_RUST_ENGINE, () => {
  const root = aCrate();
  try {
    assert.deepEqual(
      only(firedOn(root, join("tests", "a_check.rs"), A_SETTING), "TRUTH"),
      ["TRUTH:2:2", "TRUTH:2:6", "TRUTH:2:9", "TRUTH:2:10"],
      "the allowance is cargo's own keys through `env!`, and nothing else: `env!(\"HOME\")`, `option_env!` of a setting, and `std::env` both as a path and as the call all still read the outside world",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the same cargo keys under src/ are refused, because there they are a setting", WITHOUT_THE_RUST_ENGINE, () => {
  const root = aCrate();
  try {
    assert.deepEqual(
      only(firedOn(root, join("src", "thing.rs"), CARGOS_OWN_KEYS), "TRUTH"),
      ["TRUTH:2:4", "TRUTH:2:7", "TRUTH:2:11", "TRUTH:2:15"],
      "the allowance is for a cargo test target, where the key is the only way to find what cargo built. Library code baking one in is the read the rule is about",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
