import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { searchPath } from "../src/config.ts";
import { delimiter } from "node:path";

const SHIM = fileURLToPath(new URL("../bin/looper.js", import.meta.url));

const GUILTY = `export function find(id: string) {
  try {
    return db.get(id);
  } catch {
    return null;
  }
}
`;

type Scene = { readonly root: string; readonly home: string };

function scene(): Scene {
  const root = mkdtempSync(join(tmpdir(), "looper-report-command-"));
  const home = mkdtempSync(join(tmpdir(), "looper-report-home-"));
  mkdirSync(join(root, ".looper"), { recursive: true });
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src/user.ts"), GUILTY);
  return { root, home };
}

function strike(held: Scene): void {
  rmSync(held.root, { recursive: true, force: true });
  rmSync(held.home, { recursive: true, force: true });
}

type Ran = { readonly code: number | null; readonly out: string; readonly err: string };

function looper(held: Scene, ...args: readonly string[]): Ran {
  const ran = spawnSync(process.execPath, [SHIM, "report", ...args], {
    cwd: held.root,
    encoding: "utf8",
    env: { HOME: held.home, PATH: searchPath().join(delimiter) },
  });
  return { code: ran.status, out: ran.stdout, err: ran.stderr };
}

test("the command line every earlier refusal printed still writes a report", () => {
  const held = scene();
  try {
    const ran = looper(held, "--rule", "TS-ERROR:3", "--file", "src/user.ts", "--line", "5");

    assert.equal(ran.code, 0, `what was tried was never a required part of that line, and now the line was refused: ${ran.err}`);
    assert.ok(ran.out.includes("Written:"), ran.out);
    assert.ok(ran.out.includes("ReturnStatement"), "the shape is the point of naming a file and a line");
  } finally {
    strike(held);
  }
});

test("the command says what it wrote, lists it, and takes the decision", () => {
  const held = scene();
  try {
    const wrote = looper(
      held,
      "--kind", "failed",
      "--about", "PostToolUse",
      "--wrong", "The hook exited without saying anything.",
      "--instead", "It should have said that the edit was not judged.",
    );
    assert.equal(wrote.code, 0, wrote.err);
    const id = /([0-9a-f]{12})\.md/.exec(wrote.out)?.[1];
    assert.ok(id !== undefined, wrote.out);

    const listed = looper(held, "--list");
    assert.equal(listed.code, 0);
    assert.ok(listed.out.includes(String(id)) && listed.out.includes("nobody has said"), listed.out);

    assert.equal(looper(held, "--kept", String(id)).code, 0);
    assert.ok(looper(held, "--list").out.includes("kept here"));
  } finally {
    strike(held);
  }
});

test("a sentence with a name in it is refused on the command line as it is in the tool", () => {
  const held = scene();
  try {
    const ran = looper(
      held,
      "--kind", "failed",
      "--about", "PostToolUse",
      "--wrong", "The hook failed for acmeBillingGateway.",
      "--instead", "It should have passed.",
    );

    assert.equal(ran.code, 2);
    assert.ok(ran.err.includes("acmeBillingGateway"), ran.err);
  } finally {
    strike(held);
  }
});

const CANNOT_BE_SHUT_OUT = process.getuid !== undefined && process.getuid() === 0
  ? "a root user can write to a folder with no write bit"
  : false;

test("a home that cannot be written is a refusal that names the folder, not an alarm about looper", { skip: CANNOT_BE_SHUT_OUT }, () => {
  const held = scene();
  try {
    chmodSync(held.home, 0o555);
    const ran = looper(
      held,
      "--kind", "failed",
      "--about", "PostToolUse",
      "--wrong", "The hook exited without saying anything.",
      "--instead", "It should have said that the edit was not judged.",
    );

    assert.equal(ran.code, 2, `${ran.out}${ran.err}`);
    assert.ok(ran.err.includes(held.home), ran.err);
    assert.ok(
      !ran.err.includes("could not be loaded"),
      "a folder that would not take a file was announced as looper being unable to load its own code, with every verdict to be treated as absent",
    );
  } finally {
    chmodSync(held.home, 0o755);
    strike(held);
  }
});
