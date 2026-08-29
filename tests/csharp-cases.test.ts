import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { CSHARP_CASES } from "../audit/csharp-cases.ts";
import { judgeCsharp } from "../src/law/csharp/drive.ts";
import { judgeCsharpIn } from "../src/law/readers.ts";
import { reasonFrom } from "../src/fields.ts";

const LOOPER = join(import.meta.dirname, "..");

const SDK_TIMEOUT_MS = 60_000;

function whyTheSdkIsMissing(): string | undefined {
  try {
    execFileSync("dotnet", ["--version"], {
      stdio: ["ignore", "ignore", "ignore"],
      timeout: SDK_TIMEOUT_MS,
    });
    return undefined;
  } catch (cause) {
    return `no .NET SDK on this machine, so these say nothing either way (${reasonFrom(cause)})`;
  }
}

const MISSING = whyTheSdkIsMissing();

const WITHOUT_DOTNET = MISSING === undefined ? {} : { skip: MISSING };

function firedOn(code: string, named: string | undefined): readonly string[] {
  const root = mkdtempSync(join(tmpdir(), "looper-cs-"));
  try {
    const path = join(root, named === undefined ? "Held.cs" : named);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, code);
    const said = judgeCsharp(LOOPER, root, [path]);
    if (said.kind !== "found") return [`the reader did not answer: ${said.detail}`];
    return said.hits.map((hit) => hit.rule);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("the C# reader answers at all, and says why when it does not", WITHOUT_DOTNET, () => {
  const root = mkdtempSync(join(tmpdir(), "looper-cs-"));
  try {
    const path = join(root, "Held.cs");
    writeFileSync(path, `class C { void F() { } }\n`);
    const said = judgeCsharp(LOOPER, root, [path]);
    assert.equal(
      said.kind,
      "found",
      `the C# reader did not answer, so every case below would fail as though the rules were wrong. It said: ${said.kind === "found" ? "" : said.detail}`,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a pardon in law.toml reaches the C# reader, by whole file or by rule", WITHOUT_DOTNET, () => {
  const root = mkdtempSync(join(tmpdir(), "looper-cs-"));
  try {
    const commented = "class C {\n    // a comment\n    void F() { }\n}\n";
    mkdirSync(join(root, "vendor"), { recursive: true });
    writeFileSync(join(root, "vendor/Theirs.cs"), commented);
    writeFileSync(join(root, "Ours.cs"), commented);
    writeFileSync(
      join(root, "Partly.cs"),
      "class P {\n    // a comment\n    void F() { try { G(); } catch { } }\n    void G() { }\n}\n",
    );
    writeFileSync(join(root, "law.toml"), '[exempt]\n"vendor/Theirs.cs" = ["ALL"]\n"Partly.cs" = ["DEAD:2"]\n');
    const said = judgeCsharpIn(root, [
      join(root, "vendor/Theirs.cs"),
      join(root, "Ours.cs"),
      join(root, "Partly.cs"),
    ]);
    assert.deepEqual(said.unreadable, []);
    assert.deepEqual(
      said.violations.map((one) => `${one.file} ${one.rule.id}`).sort(),
      ["Ours.cs CS-DEAD:2", "Partly.cs CS-ERROR:1"],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("every C# case agrees with the rule it was written from", WITHOUT_DOTNET, () => {
  const wrong: string[] = [];
  for (const held of CSHARP_CASES) {
    const fired = firedOn(held.code, held.file).includes(held.rule);
    if (fired !== (held.expect === "fires")) {
      wrong.push(`${held.rule}  ${held.name}  (wanted ${held.expect}, got ${fired ? "fires" : "silent"})`);
    }
  }
  assert.deepEqual(wrong, [], `${wrong.length} of ${CSHARP_CASES.length} cases disagree with their rule`);
});

test("a line number points at the line somebody has to open", WITHOUT_DOTNET, () => {
  const root = mkdtempSync(join(tmpdir(), "looper-cs-"));
  try {
    const path = join(root, "Held.cs");
    writeFileSync(path, `class C {\n    void F() {\n        try { G(); } catch { }\n    }\n    void G() { }\n}\n`);
    const said = judgeCsharp(LOOPER, root, [path]);
    assert.equal(said.kind, "found");
    if (said.kind !== "found") return;
    assert.deepEqual(
      said.hits.map((hit) => [hit.rule, hit.line]),
      [["CS-ERROR:1", 3]],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a Razor line number counts from the top of the Razor file, not the code block", WITHOUT_DOTNET, () => {
  const root = mkdtempSync(join(tmpdir(), "looper-cs-"));
  try {
    const path = join(root, "Held.razor");
    writeFileSync(
      path,
      `<div>one</div>\n<div>two</div>\n<div>three</div>\n\n@code {\n    void F() {\n        try { G(); } catch { }\n    }\n\n    void G() { }\n}\n`,
    );
    const said = judgeCsharp(LOOPER, root, [path]);
    assert.equal(said.kind, "found");
    if (said.kind !== "found") return;
    assert.deepEqual(
      said.hits.map((hit) => [hit.rule, hit.line]),
      [["CS-ERROR:1", 7]],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a line number for async void points at the method, not at its attribute", WITHOUT_DOTNET, () => {
  const root = mkdtempSync(join(tmpdir(), "looper-cs-"));
  try {
    const path = join(root, "Held.cs");
    writeFileSync(
      path,
      `using System.Threading.Tasks;\nclass Fact : System.Attribute { }\nclass C {\n    [Fact]\n    public async void F() { await Task.Delay(1); }\n}\n`,
    );
    const said = judgeCsharp(LOOPER, root, [path]);
    assert.equal(said.kind, "found");
    if (said.kind !== "found") return;
    assert.deepEqual(
      said.hits.filter((hit) => hit.rule === "CS-TRUTH:1").map((hit) => hit.line),
      [5],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a file that will not parse is named rather than passed as clean", WITHOUT_DOTNET, () => {
  const root = mkdtempSync(join(tmpdir(), "looper-cs-"));
  try {
    const path = join(root, "Held.cs");
    writeFileSync(path, `class C { void F() { try { G(); } catch { }\n`);
    const said = judgeCsharp(LOOPER, root, [path]);
    assert.equal(said.kind, "found");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
