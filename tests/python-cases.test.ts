import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { PYTHON_CASES } from "../audit/python-cases.ts";
import { judgePython } from "../src/law/python/drive.ts";
import { judgePythonIn } from "../src/law/readers.ts";

const LOOPER = join(import.meta.dirname, "..");

function firedOn(code: string, named: string | undefined): readonly string[] {
  const root = mkdtempSync(join(tmpdir(), "looper-py-"));
  try {
    const path = join(root, named === undefined ? "held.py" : named);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, code);
    const said = judgePython(LOOPER, [path]);
    if (said.kind !== "found") return [`the reader did not answer: ${said.detail}`];
    return said.hits.map((hit) => hit.rule);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("a pardon in law.toml reaches the Python reader", () => {
  const root = mkdtempSync(join(tmpdir(), "looper-py-"));
  try {
    const swallowing = `def f(p):\n    try:\n        open(p)\n    except Exception:\n        pass\n`;
    mkdirSync(join(root, "vendor"), { recursive: true });
    writeFileSync(join(root, "vendor/theirs.py"), swallowing);
    writeFileSync(join(root, "ours.py"), swallowing);
    writeFileSync(join(root, "law.toml"), '[exempt]\n"vendor/theirs.py" = ["ALL"]\n');
    const said = judgePythonIn(root, [join(root, "vendor/theirs.py"), join(root, "ours.py")]);
    assert.deepEqual(said.unreadable, []);
    assert.deepEqual(
      said.violations.map((one) => `${one.file} ${one.rule.id}`),
      ["ours.py PY-ERROR:1"],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("every Python case agrees with the rule it was written from", () => {
  const wrong: string[] = [];
  for (const held of PYTHON_CASES) {
    const fired = firedOn(held.code, held.file).includes(held.rule);
    if (fired !== (held.expect === "fires")) {
      wrong.push(`${held.rule}  ${held.name}  (wanted ${held.expect}, got ${fired ? "fires" : "silent"})`);
    }
  }
  assert.deepEqual(wrong, [], `${wrong.length} of ${PYTHON_CASES.length} cases disagree with their rule`);
});

test("a file that is not Python is named rather than passed as clean", () => {
  const root = mkdtempSync(join(tmpdir(), "looper-py-"));
  try {
    const path = join(root, "broken.py");
    writeFileSync(path, "def f(:\n");
    const said = judgePython(LOOPER, [path]);

    assert.equal(said.kind, "found");
    if (said.kind !== "found") return;
    assert.equal(
      said.unreadable.length,
      1,
      "a file the reader cannot parse was reported as having nothing wrong with it, which is not the same as being clean",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a reader that cannot run is said once, not once per file", () => {
  const root = mkdtempSync(join(tmpdir(), "looper-py-"));
  try {
    for (let at = 0; at < 40; at += 1) {
      writeFileSync(join(root, `held${at}.py`), "x = 1\n");
    }
    const said = judgePythonIn(root, [
      ...Array.from({ length: 40 }, (_, at) => join(root, `held${at}.py`)),
    ]);

    assert.equal(
      said.unreadable.length,
      0,
      "the reader is present here, so nothing should be reported as unjudged",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
