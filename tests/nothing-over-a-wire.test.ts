import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";

import { searchPath, withoutCallingHome } from "../src/config.ts";
import { everyWordAt } from "../src/git.ts";

const ROOT = join(import.meta.dirname, "..");

function git(root: string, ...args: readonly string[]): string {
  return execFileSync("git", [...args], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

function heldIn(root: string): string {
  return git(root, "count-objects", "-v")
    .split("\n")
    .filter((line) => line.startsWith("count:") || line.startsWith("in-pack:"))
    .join(" ");
}

function cloneThatHoldsNoContents(dir: string): string {
  const origin = join(dir, "origin");
  mkdirSync(origin, { recursive: true });
  git(origin, "init", "-q");
  git(origin, "config", "user.email", "t@example.com");
  git(origin, "config", "user.name", "t");
  git(origin, "config", "uploadpack.allowfilter", "true");
  for (const name of ["one", "two", "three"]) writeFileSync(join(origin, `${name}.txt`), `the ${name} lives upstream\n`);
  git(origin, "add", ".");
  git(origin, "commit", "-q", "-m", "three files");
  git(dir, "clone", "-q", "--filter=blob:none", "--no-checkout", `file://${origin}`, "partial");
  return join(dir, "partial");
}

test("git is never left to fetch on its own: a clone that holds no file contents is read as far as it goes", () => {
  const dir = mkdtempSync(join(tmpdir(), "looper-no-wire-"));
  try {
    const partial = cloneThatHoldsNoContents(dir);
    const before = heldIn(partial);

    const said = everyWordAt(partial, "HEAD", []);

    assert.equal(
      heldIn(partial),
      before,
      "looper asked git a question and git went to the remote for the answer. In a clone made without file contents every read of an old file is a fetch, so the push gate would pull a whole repository over the network to count its words",
    );
    assert.equal(
      said.kind,
      "cannot-tell",
      `what is not on this machine cannot be read, and saying so is the honest answer: ${JSON.stringify(said).slice(0, 200)}`,
    );

    assert.ok(git(partial, "show", "HEAD:one.txt").includes("lives upstream"), "the control: asked plainly, git does fetch it");
    assert.notEqual(heldIn(partial), before, "and the fetch is visible as an object that was not there before");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("every question looper asks git forbids every way out", () => {
  const text = readFileSync(join(ROOT, "src", "git.ts"), "utf8");
  const asked = [...text.matchAll(/(?:execFileSync|spawnSync)\(\s*"git",\s*\[([^\]]*)\]/g)];

  assert.ok(asked.length >= 3, `expected to find the places git is started, and found ${asked.length}`);
  for (const held of asked) {
    assert.ok(
      String(held[1]).trimStart().startsWith("...NEVER_OVER_A_WIRE"),
      `git is started without the switch that forbids every transport: ${held[0]}`,
    );
  }
  assert.ok(text.includes('"protocol.allow=never"'), "the switch is the one every version of git understands");
});

test("the C# build is started with the SDK told not to report home or look for updates", () => {
  const said = withoutCallingHome();

  assert.equal(said["DOTNET_CLI_TELEMETRY_OPTOUT"], "1", "the SDK sends usage data to its maker on every build unless it is told not to");
  assert.equal(said["DOTNET_CLI_WORKLOAD_UPDATE_NOTIFY_DISABLE"], "true", "and downloads workload manifests in the background, once a day");
  assert.equal(said["DOTNET_SDK_VULNERABILITY_CHECK_DISABLE"], "true");
  assert.equal(said["PATH"], searchPath().join(delimiter), "everything else a child needs is still there");

  const drive = readFileSync(join(ROOT, "src", "law", "csharp", "drive.ts"), "utf8");
  const build = /execFileSync\(\s*"dotnet",[\s\S]{0,400}?\}\)/.exec(drive);
  assert.ok(build !== null && build[0].includes("env: withoutCallingHome()"), "the build is the one command of that SDK looper runs, and it runs it with those words");
});

const SPEAKS_A_PROTOCOL = /^NativeModule (?:https?|http2|tls|dns|_http_\w+|_tls_\w+)$/;

const TELL_WHAT_LOADED =
  "data:text/javascript,process.on('exit',()=>process.stderr.write('LOADED '+JSON.stringify(process.moduleLoadList)+'\\n'))";

function loadedBy(args: readonly string[], input: string, cwd: string, home: string): readonly string[] {
  const ran = spawnSync(process.execPath, ["--import", TELL_WHAT_LOADED, join(ROOT, "bin", "looper.js"), ...args], {
    cwd,
    input,
    encoding: "utf8",
    env: { PATH: searchPath().join(delimiter), HOME: home },
    maxBuffer: 64 * 1024 * 1024,
  });
  const line = String(ran.stderr).split("\n").find((one) => one.startsWith("LOADED "));
  assert.ok(line !== undefined, `the run did not say what it loaded: ${String(ran.stderr).slice(0, 300)}`);
  const loaded: unknown = JSON.parse(line.slice("LOADED ".length));
  assert.ok(Array.isArray(loaded));
  return loaded.map(String);
}

test("no looper run loads a module that speaks a network protocol", () => {
  const dir = mkdtempSync(join(tmpdir(), "looper-loaded-"));
  try {
    const project = join(dir, "project");
    const home = join(dir, "home");
    mkdirSync(join(project, "src"), { recursive: true });
    mkdirSync(home, { recursive: true });
    writeFileSync(join(project, "src", "a.ts"), "export const held = 1;\n");
    const edit = JSON.stringify({ session_id: "s", tool_name: "Edit", tool_input: { file_path: join(project, "src", "a.ts") } });
    const runs: readonly (readonly [readonly string[], string])[] = [
      [["inject"], JSON.stringify({ session_id: "s", prompt: "hello" })],
      [["hook", "PostToolUse"], edit],
      [["hook", "PreToolUse"], JSON.stringify({ session_id: "s", tool_name: "Bash", tool_input: { command: "ls" } })],
      [["hook", "Stop"], JSON.stringify({ session_id: "s" })],
      [["serve"], `${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" })}\n`],
      [["report", "--list"], ""],
    ];

    for (const [args, input] of runs) {
      const spoke = loadedBy(args, input, project, home).filter((name) => SPEAKS_A_PROTOCOL.test(name));
      assert.deepEqual(
        spoke,
        [],
        `looper ${args.join(" ")} loaded ${spoke.join(", ")}. Reading the source for the names of these modules finds an import that is written down; this finds one that was assembled at run time, in looper or in anything it depends on. net and dgram are not on the list because Node loads both itself, for every program that can start another`,
      );
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
