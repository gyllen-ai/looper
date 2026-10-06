import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { judgeRustIn } from "../src/law/readers.ts";
import { type RustCase } from "./rust-cases.ts";

export type Mismatch = {
  readonly held: RustCase;
  readonly got: "fires" | "silent";
};

export type Judged = {
  readonly mismatches: readonly Mismatch[];
  readonly notFixedYet: readonly Mismatch[];
};

const MANIFEST = `[package]
name = "cases"
version = "0.1.0"
edition = "2021"

[lib]
path = "src/lib.rs"
`;

function fileFor(at: number): string {
  return `case_${at}.rs`;
}

const FOLDERS: readonly string[] = ["src", "tests", "examples"];

function folderOf(held: RustCase): string {
  return held.place === undefined ? "src" : held.place;
}

export function judgeCases(cases: readonly RustCase[]): Judged {
  const crate = mkdtempSync(join(tmpdir(), "looper-rust-cases-"));
  try {
    for (const folder of FOLDERS) mkdirSync(join(crate, folder), { recursive: true });
    writeFileSync(join(crate, "Cargo.toml"), MANIFEST);
    const modules = [...cases.entries()].filter(([, held]) => held.place === undefined);
    writeFileSync(join(crate, "src", "lib.rs"), modules.map(([at]) => `pub mod case_${at};`).join("\n") + "\n");
    for (const [at, held] of cases.entries()) {
      writeFileSync(join(crate, folderOf(held), fileFor(at)), `${held.code}\n`);
    }

    const said = judgeRustIn(crate, cases.map((held, at) => join(crate, folderOf(held), fileFor(at))));
    const mismatches: Mismatch[] = [];
    const notFixedYet: Mismatch[] = [];

    for (const [at, held] of cases.entries()) {
      const fired = said.violations.some(
        (one) => one.file.endsWith(fileFor(at)) && one.rule.id === held.rule,
      );
      const got = fired ? "fires" : "silent";
      if (got === held.expect) continue;
      if (held.notFixedYet === undefined) mismatches.push({ held, got });
      else notFixedYet.push({ held, got });
    }
    return { mismatches, notFixedYet };
  } finally {
    rmSync(crate, { recursive: true, force: true });
  }
}

export function say(judged: Judged): readonly string[] {
  return [
    ...judged.mismatches.map(
      (one) => `${one.held.rule.padEnd(22)} ${one.held.name}  (wanted ${one.held.expect}, got ${one.got})`,
    ),
    ...judged.notFixedYet.map(
      (one) => `not fixed yet:  ${one.held.rule.padEnd(18)} ${one.held.name}`,
    ),
  ];
}

