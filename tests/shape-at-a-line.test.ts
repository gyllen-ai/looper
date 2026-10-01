import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildReport } from "../src/report/write.ts";
import { render, shapeAt, shapeFor } from "../src/report/skeleton.ts";
import { WITHOUT_THE_RUST_ENGINE } from "./rust-engine.ts";

const LOOPER = join(import.meta.dirname, "..");

const HOME = mkdtempSync(join(tmpdir(), "looper-shape-home-"));

process.on("exit", () => rmSync(HOME, { recursive: true, force: true }));

const SPREAD_OVER_LINES = `export function totals(rows: readonly Row[]): number {
  return rows
    .filter((row) => row.live)
    .map((row) => row.amount ?? 0)
    .reduce((a, b) => a + b, 0);
}
`;

test("a line that starts no statement is reported against the statement around it, not refused", () => {
  const located = shapeAt("src/totals.ts", SPREAD_OVER_LINES, 4, 6);

  assert.notEqual(
    located.kind,
    "not-found",
    "the one route open when a rule is wrong everywhere refuses a continuation line, which is an ordinary line and the exact place a wrong verdict lands",
  );
  assert.equal(located.kind, "around");
  if (located.kind !== "around") return;
  assert.equal(
    located.startsAt,
    2,
    "the report has to say where the statement actually begins, or the reader cannot tell what was judged",
  );
  assert.ok(render(located.shape, 0).includes("ReturnStatement"));
});

test("a line outside every statement is still said out loud rather than refused", () => {
  const located = shapeAt("src/totals.ts", SPREAD_OVER_LINES, 7, 6);

  assert.equal(
    located.kind,
    "not-found",
    "line 7 is the closing brace and belongs to no statement, which is the one honest refusal",
  );
});

const PYTHON_OVER_LINES = `def totals(rows):
    return sum(
        row["amount"]
        for row in rows
        if row["live"]
    )
`;

test("a Python line that starts no statement is reported against the statement around it", () => {
  const root = mkdtempSync(join(tmpdir(), "looper-report-python-around-"));
  try {
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src/totals.py"), PYTHON_OVER_LINES);

    const written = buildReport({
      root,
      home: HOME,
      kind: "rule",
      about: "PY-TRUTH:1",
      wrong: "The rule named a line that begins nothing.",
      instead: "It should have named the statement around it.",
      where: { kind: "line", file: "src/totals.py", line: 4 },
    });

    assert.equal(
      written.kind,
      "written",
      `the Python half refuses a continuation line, so two thirds of the escape hatch closes again: ${JSON.stringify(written)}`,
    );
    if (written.kind !== "written") return;
    assert.ok(
      written.body.includes("starts no statement"),
      "the report has to say the line began nothing, or the reader cannot tell what was judged",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

const RUST_OVER_LINES = `pub fn totals(rows: &[Row]) -> u64 {
    let live = rows.iter().filter(|row| row.live);

    live.map(|row| row.amount).sum()
}
`;

test("a Rust line that starts nothing is reported against the item around it", WITHOUT_THE_RUST_ENGINE, () => {
  const root = mkdtempSync(join(tmpdir(), "looper-report-rust-around-"));
  try {
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "Cargo.toml"), '[package]\nname = "held"\nversion = "0.1.0"\nedition = "2021"\n');
    writeFileSync(join(root, "src/totals.rs"), RUST_OVER_LINES);

    const written = buildReport({
      root,
      home: HOME,
      kind: "rule",
      about: "RUST-TYPE:4",
      wrong: "The rule named a line that begins nothing.",
      instead: "It should have named the statement around it.",
      where: { kind: "line", file: "src/totals.rs", line: 3 },
    });

    assert.equal(
      written.kind,
      "written",
      `the Rust half refuses a continuation line, so one of three languages still cannot argue with a rule: ${JSON.stringify(written)}`,
    );
    if (written.kind !== "written") return;
    assert.ok(
      written.body.includes("starts no statement"),
      "the report has to say the line began nothing, or the reader cannot tell what was judged",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});


test("when several statements start on one line, the outermost one is the shape", () => {
  const found = shapeAt("a.ts", 'export function f(k) {\n  if (k !== "e") return;\n  g(k);\n}\n', 2, 6);
  assert.equal(found.kind, "found");
  if (found.kind !== "found") return;

  const drawn = render(found.shape, 0);
  assert.ok(drawn.startsWith("IfStatement"), drawn);
  assert.ok(drawn.includes("ReturnStatement"), drawn);
});

test("a one-line statement is still reported as itself", () => {
  const found = shapeAt("a.ts", "export function f() {\n  return g(1);\n}\n", 2, 6);
  assert.equal(found.kind, "found");
  if (found.kind !== "found") return;
  assert.ok(render(found.shape, 0).startsWith("ReturnStatement"));
});

test("Python reports the outermost statement on a line too", () => {
  const root = mkdtempSync(join(tmpdir(), "looper-shape-"));
  try {
    const path = join(root, "held.py");
    writeFileSync(path, 'def f(k):\n    if k != "e": return\n    g(k)\n');
    const found = shapeFor(LOOPER, path, "", 2, 6);
    assert.equal(found.kind, "found");
    if (found.kind !== "found") return;
    assert.ok(render(found.shape, 0).startsWith("If"), render(found.shape, 0));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
