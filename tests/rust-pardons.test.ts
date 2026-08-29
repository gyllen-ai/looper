import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { judgeRust } from "../src/law/rust/drive.ts";
import { WITHOUT_THE_RUST_ENGINE } from "./rust-engine.ts";

const LOOPER_ROOT = join(import.meta.dirname, "..");

const UNWRAPPING_RUST = "pub fn read_setting(name: &str) -> String {\n    std::env::var(name).unwrap()\n}\n";

function judgedWithPardons(root: string, pardons: string): ReturnType<typeof judgeRust> {
  writeFileSync(join(root, "law.toml"), `[exempt]\n"lib.rs" = [${pardons}]\n`);
  return judgeRust(LOOPER_ROOT, root, []);
}

test("a pardon naming another language's rule leaves the Rust half reading law.toml", WITHOUT_THE_RUST_ENGINE, () => {
  const root = mkdtempSync(join(tmpdir(), "looper-pardon-"));
  try {
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "Cargo.toml"), '[package]\nname = "a"\nversion = "0.1.0"\nedition = "2021"\n');
    writeFileSync(join(root, "src", "lib.rs"), UNWRAPPING_RUST);

    const judged = judgedWithPardons(root, '"TS-ERROR:3", "CSS-TRUTH:1", "REACT:1"');
    assert.equal(judged.kind, "found", judged.kind === "found" ? "" : judged.detail);
    assert.ok(
      judged.kind === "found" && judged.hits.some((hit) => hit.rule === "ERROR:1"),
      "the unwrap was not reported once the pardons of other languages were read",
    );

    const pardoned = judgedWithPardons(root, '"RUST-ERROR:1"');
    assert.ok(
      pardoned.kind === "found" && !pardoned.hits.some((hit) => hit.rule === "ERROR:1"),
      "looper's own spelling of the engine's rule did not pardon it",
    );

    const refused = judgedWithPardons(root, '"RUST-TRUHT:1"');
    assert.equal(refused.kind, "refused", "a typo in our own spelling is still refused by name");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
