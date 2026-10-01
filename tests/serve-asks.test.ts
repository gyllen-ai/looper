import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";

import { RELEASE_TOOL, REPORT_TOOL, searchPath } from "../src/config.ts";
import { heldIn } from "../src/report/store.ts";

const SHIM = fileURLToPath(new URL("../bin/looper.js", import.meta.url));

type Scene = { readonly root: string; readonly home: string };

function scene(): Scene {
  const root = mkdtempSync(join(tmpdir(), "looper-serve-"));
  const home = mkdtempSync(join(tmpdir(), "looper-serve-home-"));
  mkdirSync(join(root, ".looper"), { recursive: true });
  return { root, home };
}

function strike(held: Scene): void {
  rmSync(held.root, { recursive: true, force: true });
  rmSync(held.home, { recursive: true, force: true });
}

function served(held: Scene, messages: readonly unknown[]): ReadonlyMap<number, string> {
  const ran = spawnSync(process.execPath, [SHIM, "serve"], {
    cwd: held.root,
    encoding: "utf8",
    input: `${messages.map((one) => JSON.stringify(one)).join("\n")}\n`,
    env: { HOME: held.home, PATH: searchPath().join(delimiter) },
  });
  assert.equal(ran.status, 0, ran.stderr);
  const answers = new Map<number, string>();
  for (const line of ran.stdout.split("\n").filter((one) => one.trim().length > 0)) {
    const parsed: unknown = JSON.parse(line);
    const id: unknown = Object.getOwnPropertyDescriptor(parsed, "id")?.value;
    const content: unknown = Object.getOwnPropertyDescriptor(Object.getOwnPropertyDescriptor(parsed, "result")?.value, "content")?.value;
    if (typeof id === "number" && Array.isArray(content)) {
      answers.set(id, String(Object.getOwnPropertyDescriptor(content[0], "text")?.value));
    }
  }
  return answers;
}

function calling(id: number, name: string, args: unknown): unknown {
  return { jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } };
}

function hello(name: string, version: string): unknown {
  return { jsonrpc: "2.0", id: 0, method: "initialize", params: { protocolVersion: "2025-11-25", clientInfo: { name, version } } };
}

const A_FAILED_HOOK = {
  kind: "failed",
  about: "PostToolUse",
  wrong: "The hook exited without saying anything and the edit was never judged.",
  instead: "It should have said that the edit was not judged.",
};

function onlyHeld(held: Scene): { readonly id: string; readonly title: string; readonly state: string } {
  const read = heldIn(held.root, held.home);
  assert.equal(read.kind, "read");
  if (read.kind !== "read") throw new Error("unreachable");
  const one = read.held[0];
  assert.ok(one !== undefined && read.held.length === 1);
  return one;
}

test("the server as it really runs releases for the client that introduced itself, and for nobody else", () => {
  const held = scene();
  try {
    const wrote = served(held, [calling(1, REPORT_TOOL, A_FAILED_HOOK)]);
    assert.ok(String(wrote.get(1)).startsWith("Written:"), String(wrote.get(1)));
    const report = onlyHeld(held);
    const release = calling(2, RELEASE_TOOL, { id: report.id, title: report.title });

    const unintroduced = served(held, [release]);
    assert.ok(String(unintroduced.get(2)).includes("released nothing"), String(unintroduced.get(2)));
    assert.equal(onlyHeld(held).state, "written", "a server told that every caller asks a person would have released this to anybody");

    const another = served(held, [hello("some-other-agent", "9.0.0"), release]);
    assert.ok(String(another.get(2)).includes("released nothing"), String(another.get(2)));
    assert.equal(onlyHeld(held).state, "written");

    const introduced = served(held, [hello("claude-code", "2.1.286"), release]);
    assert.ok(
      String(introduced.get(2)).includes("may leave"),
      `a server that never remembers who introduced itself refuses every release, and nothing else here would have noticed: ${String(introduced.get(2))}`,
    );
    assert.equal(onlyHeld(held).state, "released");
  } finally {
    strike(held);
  }
});
