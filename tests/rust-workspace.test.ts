import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { judgeRustIn } from "../src/law/readers.ts";
import { WITHOUT_THE_RUST_ENGINE } from "./rust-engine.ts";

const GUILTY = "pub fn read(k: &str) -> String {\n    std::env::var(k).unwrap()\n}\n";

const WORKSPACE = '[workspace]\nmembers = ["member"]\n\n[package]\nname = "top"\nversion = "0.0.0"\nedition = "2021"\n';

const PACKAGE = '[package]\nname = "member"\nversion = "0.0.0"\nedition = "2021"\n';

function aWorkspaceWithAMember(): { root: string; files: readonly string[] } {
  const root = mkdtempSync(join(tmpdir(), "looper-workspace-"));
  const put = (where: string, what: string): string => {
    const path = join(root, where);
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, what);
    return path;
  };
  put("Cargo.toml", WORKSPACE);
  put("member/Cargo.toml", PACKAGE);
  return { root, files: [put("src/top.rs", GUILTY), put("member/src/thing.rs", GUILTY)] };
}

test("each file is judged once, at a path that exists", WITHOUT_THE_RUST_ENGINE, () => {
  const { root, files } = aWorkspaceWithAMember();
  try {
    const named = judgeRustIn(root, files).violations.map((held) => held.file);

    assert.ok(named.length > 0, "nothing was judged at all");
    assert.deepEqual(
      [...new Set(named)].sort(),
      ["member/src/thing.rs", "src/top.rs"],
      "a workspace root is a crate too, so pointing the reader at a directory judges every member a second time under a name that does not exist",
    );
    assert.deepEqual(
      named.filter((one) => !existsSync(join(root, one))),
      [],
      "a finding named a file nobody can open",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
