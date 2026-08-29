import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { A_READER_MAY_ANSWER_WITH, CSHARP_ENGINE_DIR } from "../src/config.ts";
import { judgeCsharp } from "../src/law/csharp/drive.ts";
import { fieldAt } from "../src/fields.ts";

const LOOPER = join(import.meta.dirname, "..");

const BINARY = "bin/Release/net10.0/looper-csharp";

const ASKS = `
import { judgeCsharp } from ${JSON.stringify(join(LOOPER, "src/law/csharp/drive.ts"))};
const [root, project, file] = process.argv.slice(2);
process.stdout.write(JSON.stringify(judgeCsharp(root, project, [file])));
`;

function engineThatWasBuilt(root: string, binary: string | undefined): void {
  const engine = join(root, CSHARP_ENGINE_DIR);
  mkdirSync(join(engine, "src"), { recursive: true });
  writeFileSync(join(engine, "looper-csharp.csproj"), "");
  writeFileSync(join(engine, "src", "Law.cs"), "");
  const longAgo = (Date.now() - 60_000) / 1000;
  utimesSync(join(engine, "looper-csharp.csproj"), longAgo, longAgo);
  utimesSync(join(engine, "src", "Law.cs"), longAgo, longAgo);
  if (binary === undefined) return;
  mkdirSync(join(engine, "bin/Release/net10.0"), { recursive: true });
  writeFileSync(join(engine, BINARY), binary);
  chmodSync(join(engine, BINARY), 0o755);
}

function aProjectIn(root: string): { readonly project: string; readonly file: string } {
  const project = join(root, "project");
  mkdirSync(project, { recursive: true });
  const file = join(project, "Held.cs");
  writeFileSync(file, "class C { }\n");
  return { project, file };
}

function askedWith(root: string): { readonly kind: string; readonly detail: string } {
  const { project, file } = aProjectIn(root);
  const said = judgeCsharp(root, project, [file]);
  return said.kind === "found" ? { kind: said.kind, detail: "" } : said;
}

test("a reader that exits with an error says the exit status and its last words, not 'Command failed'", () => {
  const root = mkdtempSync(join(tmpdir(), "looper-cs-why-"));
  try {
    engineThatWasBuilt(
      root,
      "#!/bin/sh\necho \"The application to execute does not exist: '/nowhere/looper-csharp.dll'.\" >&2\nexit 154\n",
    );
    const said = askedWith(root);
    assert.equal(said.kind, "unavailable");
    assert.ok(said.detail.includes("exited with status 154"), said.detail);
    assert.ok(said.detail.includes("The application to execute does not exist"), said.detail);
    assert.ok(!said.detail.includes("Command failed"), said.detail);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a reader that is stopped by a signal says which one", () => {
  const root = mkdtempSync(join(tmpdir(), "looper-cs-why-"));
  try {
    engineThatWasBuilt(root, "#!/bin/sh\nkill -TERM $$\n");
    const said = askedWith(root);
    assert.equal(said.kind, "unavailable");
    assert.ok(said.detail.includes("stopped by SIGTERM"), said.detail);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a build that fails says what dotnet printed, which goes to stdout rather than stderr", () => {
  const root = mkdtempSync(join(tmpdir(), "looper-cs-why-"));
  try {
    engineThatWasBuilt(root, undefined);
    const tools = join(root, "tools");
    mkdirSync(tools);
    writeFileSync(join(tools, "dotnet"), '#!/bin/sh\necho "Law.cs(3,9): error CS9999: the build fell over"\nexit 1\n');
    chmodSync(join(tools, "dotnet"), 0o755);
    const script = join(root, "asks.mjs");
    writeFileSync(script, ASKS);
    const { project, file } = aProjectIn(root);

    const asked = spawnSync(process.execPath, [script, root, project, file], {
      env: { PATH: tools },
      encoding: "utf8",
      maxBuffer: A_READER_MAY_ANSWER_WITH,
    });

    assert.equal(asked.status, 0, asked.stderr);
    const said: unknown = JSON.parse(asked.stdout);
    assert.equal(fieldAt(said, "kind"), "unavailable");
    const detail = fieldAt(said, "detail");
    assert.equal(typeof detail, "string");
    if (typeof detail !== "string") return;
    assert.ok(detail.includes("would not build"), detail);
    assert.ok(detail.includes("exited with status 1"), detail);
    assert.ok(detail.includes("CS9999"), detail);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
