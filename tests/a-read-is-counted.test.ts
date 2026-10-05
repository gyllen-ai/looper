import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";

import { DEV, environmentWith } from "../src/config.ts";
import { fieldAt } from "../src/fields.ts";
import { isNode, parseSource, walk } from "../src/law/ts/parse.ts";
import { reachedFor } from "../src/stall/stream.ts";
import { looperHooks } from "../src/wiring/hooks.ts";

const ROOT = join(import.meta.dirname, "..");

const SHIM = join(ROOT, "bin", "looper.js");

function inProject(body: (project: string, home: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "looper-read-"));
  try {
    const project = join(dir, "project");
    const home = join(dir, "home");
    mkdirSync(join(project, "src"), { recursive: true });
    mkdirSync(home, { recursive: true });
    writeFileSync(join(project, "src", "a.ts"), "export const held = 1;\n");
    body(project, home);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function handed(project: string, home: string, payload: unknown): { readonly status: number | null; readonly said: string } {
  const ran = spawnSync(process.execPath, [SHIM, "reached"], {
    cwd: project,
    input: JSON.stringify(payload),
    encoding: "utf8",
    env: environmentWith({ HOME: home, CLAUDE_PROJECT_DIR: project }),
  });
  return { status: ran.status, said: `${ran.stdout}${ran.stderr}` };
}

test("a read reaches the stall stream through looper's own entry, which says nothing when all is well", () => {
  inProject((project, home) => {
    const file = join(project, "src", "a.ts");
    const ran = handed(project, home, { session_id: "s", tool_name: "Read", tool_input: { file_path: file, offset: 1, limit: 20 } });
    assert.equal(ran.status, 0);
    assert.equal(ran.said, "");
    const stream = reachedFor(project, home, "s");
    assert.equal(stream.kind, "reached");
    if (stream.kind !== "reached") return;
    assert.deepEqual(stream.reached.map((one) => [one.tool, one.shape]), [["Read", file]]);
  });
});

test("anything but a read handed to the read entry is not counted there, and the entry says so", () => {
  inProject((project, home) => {
    const file = join(project, "src", "a.ts");
    const ran = handed(project, home, {
      session_id: "s",
      tool_name: "Edit",
      tool_input: { file_path: file, old_string: "1", new_string: "2", replace_all: false },
      tool_response: { filePath: file, originalFile: "export const held = 1;\n" },
    });
    assert.equal(ran.status, 0);
    assert.match(ran.said, /additionalContext/);
    assert.match(ran.said, /Edit/);
    assert.equal(reachedFor(project, home, "s").kind, "none");
  });
});

test("looper wires its read entry for Read alone, and the entry that judges edits is never handed a read", () => {
  const specs = looperHooks(DEV);
  const reads = specs.filter((one) => one.command.endsWith(" reached"));
  assert.equal(reads.length, 1);
  const only = reads[0];
  assert.ok(only !== undefined && only.event === "PostToolUse" && only.matcher.kind === "match");
  if (only.matcher.kind !== "match") return;
  assert.equal(only.matcher.pattern, "Read");
  for (const spec of specs) {
    if (spec.command.endsWith(" reached") || spec.matcher.kind !== "match") continue;
    assert.ok(!spec.matcher.pattern.split("|").includes("Read"), `${spec.command} would be handed reads, and the law judges whatever file a payload names`);
  }
});

function runtimeImportsOf(file: string): readonly string[] {
  const parsed = parseSource(file, readFileSync(file, "utf8"));
  if (parsed.kind !== "parsed") assert.fail(`${file} could not be read: ${parsed.detail}`);
  const found: string[] = [];
  walk(parsed.root, (node) => {
    if (!["ImportDeclaration", "ExportNamedDeclaration", "ExportAllDeclaration"].includes(node.type)) return;
    if (fieldAt(node, "importKind") === "type" || fieldAt(node, "exportKind") === "type") return;
    const source = node["source"];
    if (!isNode(source)) return;
    const from = fieldAt(source, "value");
    if (typeof from === "string" && from.startsWith(".")) found.push(join(dirname(file), from));
  });
  return found;
}

test("the code a read runs reaches none of the law and none of the other capabilities, so a read costs a start and a line", () => {
  const seen = new Set<string>();
  const waiting = [join(ROOT, "src", "reached.ts")];
  for (let next = waiting.pop(); next !== undefined; next = waiting.pop()) {
    if (seen.has(next)) continue;
    seen.add(next);
    waiting.push(...runtimeImportsOf(next));
  }
  const loaded = [...seen].map((one) => relative(ROOT, one)).sort();
  assert.ok(loaded.includes("src/stall/capability.ts"), `the read entry does not record anything: ${loaded.join(", ")}`);
  const heavy = loaded.filter((one) => one.startsWith("src/law/") || ["src/registry.ts", "src/session.ts", "src/main.ts"].includes(one));
  assert.deepEqual(heavy, []);
});
