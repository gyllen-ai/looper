import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { law } from "../src/commands/law.ts";
import { INSTALLED } from "../src/config.ts";
import { runInit } from "../src/init.ts";
import { surveyProject } from "../src/law/project.ts";
import { gitIn as git } from "./helpers.ts";
import { WITHOUT_THE_RUST_ENGINE } from "./rust-engine.ts";

const NO_PATH: readonly string[] = [];

const MANIFEST = '[package]\nname = "scratch"\nversion = "0.1.0"\nedition = "2021"\n';

const HELD_ELSEWHERE: Readonly<Record<string, string>> = {
  "src/main.rs": 'mod a;\nmod parts;\n\nfn main() {\n    a::one();\n    parts::b::read("X");\n}\n',
  "src/a.rs": "pub fn one() -> u8 {\n    1\n}\n",
  "src/parts/mod.rs": "pub mod b;\n",
  "src/parts/b.rs": "pub fn read(k: &str) -> String {\n    std::env::var(k).unwrap()\n}\n",
};

const SHORT_NAMES_SHARED: Readonly<Record<string, string>> = {
  "build.rs": 'fn main() {\n    // one\n    println!("cargo:rerun-if-changed=build.rs");\n}\n',
  "src/main.rs": "mod build;\nmod parts;\nmod x;\n\nfn main() {}\n",
  "src/build.rs": "// two\npub fn tell() {}\n",
  "src/x.rs": "pub fn x() {}\n\n// three\n",
  "src/parts/mod.rs": "pub mod b;\n",
  "src/parts/b.rs": "pub fn b() {}\n\n\n// four\n",
  "tests/x.rs": "#[test]\nfn reads() {}\n\n\n\n// five\n",
};

function crateOf(manifest: string, files: Readonly<Record<string, string>>): string {
  const root = mkdtempSync(join(tmpdir(), "looper-named-"));
  writeFileSync(join(root, "Cargo.toml"), manifest);
  for (const [where, what] of Object.entries(files)) {
    mkdirSync(dirname(join(root, where)), { recursive: true });
    writeFileSync(join(root, where), what);
  }
  return root;
}

function adopted(files: Readonly<Record<string, string>>): string {
  const root = crateOf(MANIFEST, files);
  git(root, "init", "-q");
  git(root, "config", "user.email", "t@example.com");
  git(root, "config", "user.name", "t");
  git(root, "add", "-A");
  git(root, "commit", "-qm", "first");
  runInit(root, INSTALLED, NO_PATH);
  return root;
}

type Spoken = { readonly code: number; readonly text: string };

function spokenIn(root: string, asked: readonly string[]): Spoken {
  const wasIn = process.cwd();
  const out: string[] = [];
  try {
    process.chdir(root);
    const code = law(asked, { say: (line) => out.push(line), warn: (line) => out.push(line) });
    return { code, text: out.join("\n") };
  } finally {
    process.chdir(wasIn);
  }
}

test("a file judged by its path is judged alone, so a clean file in a crate with older problems elsewhere is answered clean", WITHOUT_THE_RUST_ENGINE, () => {
  const root = adopted(HELD_ELSEWHERE);
  try {
    const whole = spokenIn(root, NO_PATH);
    assert.equal(whole.code, 0, whole.text);
    assert.match(whole.text, /all of them older than looper/, whole.text);

    const alone = spokenIn(root, ["src/a.rs"]);
    assert.equal(alone.code, 0, alone.text);
    assert.match(alone.text, /looper: 1 files, nothing to fix\./, alone.text);
    assert.doesNotMatch(alone.text, /RUST-/, "a problem in another file of the same crate is not this file's");

    const theOther = spokenIn(root, ["src/parts/b.rs"]);
    assert.equal(theOther.code, 0, theOther.text);
    assert.match(theOther.text, /src\/parts\/b\.rs:2/, "a finding is named at the path it is in, with every directory");
    assert.match(theOther.text, /all of them older than looper/, "the baseline is read the same way whichever files were asked about");
    assert.doesNotMatch(theOther.text, /main\.rs/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("every finding is named at the file it was found in, where two files share a short name and outside the module tree", WITHOUT_THE_RUST_ENGINE, () => {
  const root = crateOf(MANIFEST, SHORT_NAMES_SHARED);
  try {
    const found = surveyProject(root, "everything", NO_PATH).violations;
    const comments = found
      .filter((held) => held.rule.id === "RUST-DEAD:2")
      .map((held) => `${held.file}:${held.line}`)
      .sort();
    assert.deepEqual(
      comments,
      ["build.rs:2", "src/build.rs:1", "src/parts/b.rs:4", "src/x.rs:3", "tests/x.rs:6"],
      "the reader names a file by what follows its last src/, so build.rs and src/build.rs, or src/x.rs and tests/x.rs, read alike to it; each is judged, and each finding stays with its own file",
    );
    assert.deepEqual(
      found.filter((held) => !existsSync(join(root, held.file))).map((held) => held.file),
      [],
      "a finding named a file nobody can open",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a crate the Rust half refuses is named in one sentence that says what was not judged and why", WITHOUT_THE_RUST_ENGINE, () => {
  const refused = '[workspace]\nmembers = ["crates/*"]\n\n[package]\nname = "scratch"\nversion = "0.1.0"\nedition = "2021"\n';
  const root = crateOf(refused, { "src/main.rs": "fn main() {}\n", "src/a.rs": "pub fn a() {}\n" });
  try {
    const said = spokenIn(root, NO_PATH);
    const named = said.text.split("\n").filter((line) => line.includes("glob workspace member"));
    assert.equal(named.length, 1, said.text);
    const line = named[0] === undefined ? "" : named[0];
    assert.match(line, /^looper: could not judge 2 Rust files in the crate at this project's root \(.*\)\.$/, line);
    assert.equal(line.split("could not").length, 2, `one sentence, not two run together: ${line}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
