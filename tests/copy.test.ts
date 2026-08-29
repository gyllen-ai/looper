import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { COPY_CASES } from "../audit/copy-cases.ts";
import { CONCEDING_NOTHING } from "../src/law/concessions.ts";
import { variantsIn } from "../src/law/copy.ts";
import { surveyProject } from "../src/law/project.ts";
import { Law } from "../src/law/capability.ts";
import { dispatchHook } from "../src/registry.ts";
import { first } from "./helpers.ts";

const EVERYTHING: readonly string[] = [];

function laidOut(files: readonly string[]): string {
  const root = mkdtempSync(join(tmpdir(), "looper-copy-"));
  for (const path of files) {
    const full = join(root, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, "export const held = 1;\n");
  }
  return root;
}

test("every case about a copied file agrees with the rule it was written from", () => {
  const wrong: string[] = [];
  for (const held of COPY_CASES) {
    const root = laidOut([...held.beside, held.judged]);
    try {
      const found = variantsIn(root, [held.judged], CONCEDING_NOTHING);
      const got = found.length > 0 ? "fires" : "silent";
      if (got !== held.expect) wrong.push(`${held.name}  (wanted ${held.expect}, got ${got})`);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
  assert.deepEqual(wrong, [], `${wrong.length} of ${COPY_CASES.length} cases disagree with the rule`);
});

test("the finding names the file it is a variant of, because the name is the whole evidence", () => {
  const root = laidOut(["src/utils.ts", "src/utils-old.ts"]);
  try {
    const found = variantsIn(root, ["src/utils-old.ts"], CONCEDING_NOTHING);
    assert.equal(found.length, 1);
    assert.equal(first(found).said, "utils.ts is beside it");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the survey sees a copy in any language, because the name is not the code", () => {
  const root = laidOut([
    "src/handler.py",
    "src/handler-old.py",
    "src/theme.css",
    "src/theme-final.css",
  ]);
  try {
    const said = surveyProject(root, "everything", EVERYTHING)
      .violations.filter((one) => one.rule.id === "COPY:1")
      .map((one) => one.file)
      .sort();
    assert.deepEqual(said, ["src/handler-old.py", "src/theme-final.css"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the edit gate refuses the copy at the moment it is written", () => {
  const root = laidOut(["src/utils.ts", "src/utils-new.ts"]);
  try {
    const payload = JSON.stringify({
      tool_name: "Write",
      tool_input: { file_path: join(root, "src/utils-new.ts") },
    });
    const said = dispatchHook([new Law()], {
      root,
      event: "PostToolUse",
      payload: { kind: "text", text: payload },
    });
    assert.equal(said.refusals.length, 1);
    assert.ok(first(said.refusals).reason.includes("COPY:1"), first(said.refusals).reason.slice(0, 200));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a pardon in law.toml reaches the copy rule like any other", () => {
  const root = laidOut(["src/utils.ts", "src/utils-old.ts"]);
  try {
    writeFileSync(join(root, "law.toml"), '[exempt]\n"src/utils-old.ts" = ["COPY:1"]\n');
    const said = surveyProject(root, "everything", EVERYTHING).violations.filter(
      (one) => one.rule.id === "COPY:1",
    );
    assert.deepEqual(said, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
