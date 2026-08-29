import { first } from "./helpers.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { commitMessageScript } from "../src/config.ts";
import { intentOf } from "../src/law/commit-command.ts";
import { Law, judgeStaged } from "../src/law/capability.ts";
import { aboutToCommit } from "../src/law/payload.ts";
import { surveyProject } from "../src/law/project.ts";
import { stagedText } from "../src/git.ts";
import { readFileSync } from "node:fs";
import { dispatchHook } from "../src/registry.ts";

const GUILTY = `export function find(id: string) {
  try {
    return db.get(id);
  } catch {
    return null;
  }
}
`;

function bashPayload(command: string): string {
  return JSON.stringify({ tool_name: "Bash", tool_input: { command } });
}

function repo(): string {
  const root = mkdtempSync(join(tmpdir(), "looper-commit-"));
  mkdirSync(join(root, "src"), { recursive: true });
  const git = (...args: readonly string[]) =>
    execFileSync("git", [...args], { cwd: root, stdio: "ignore" });
  git("init", "-q");
  git("config", "user.email", "t@example.com");
  git("config", "user.name", "t");
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "t" }));
  return root;
}

function stage(root: string, file: string, text: string): void {
  writeFileSync(join(root, file), text);
  execFileSync("git", ["add", file], { cwd: root, stdio: "ignore" });
}

function tryCommit(root: string, command: string) {
  return dispatchHook([new Law()], {
    root,
    event: "PreToolUse",
    payload: { kind: "text", text: bashPayload(command) },
  });
}

test("a commit is recognised however it is written", () => {
  for (const command of [
    "git commit -m 'x'",
    "git commit --amend --no-edit",
    "git -C /some/path commit -m 'x'",
    "git add -A && git commit -m 'x'",
    "npm test; git commit -m 'x'",
    "GIT_AUTHOR_NAME=x git commit -m 'x'",
    "git commit --no-verify -m 'x'",
  ]) {
    assert.equal(intentOf(command).kind, "commit", command);
  }
});

test("something that merely mentions committing is not a commit", () => {
  for (const command of [
    "echo 'git commit -m x'",
    "git status",
    "git add -A",
    "git log --oneline",
    "grep -r 'git commit' .",
    "git config --get user.name",
  ]) {
    assert.equal(intentOf(command).kind, "other", command);
  }
});

test("a payload with no command in it is not a commit", () => {
  assert.equal(aboutToCommit("{}"), false);
  assert.equal(aboutToCommit("{ not json"), false);
  assert.equal(aboutToCommit(JSON.stringify({ tool_input: {} })), false);
});

test("staged code that breaks a rule refuses the commit", () => {
  const root = repo();
  try {
    stage(root, "src/user.ts", GUILTY);
    const result = tryCommit(root, "git commit -m 'add user lookup'");

    assert.equal(result.refusals.length, 1);
    const reason = first(result.refusals).reason;
    assert.ok(reason.includes("TS-ERROR:3"));
    assert.ok(reason.includes("src/user.ts"));
    assert.ok(reason.includes("Nothing was committed."));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the refusal closes the route of handing the command to a person to type", () => {
  const root = repo();
  try {
    stage(root, "src/user.ts", GUILTY);
    const reason = first(tryCommit(root, "git commit -m 'add user lookup'").refusals).reason;

    assert.ok(
      reason.includes("not a way through"),
      "an agent that cannot commit will ask its human to run the command instead, and the refusal has to say that this is not a route",
    );
    assert.ok(
      reason.includes("looper report"),
      "closing a route without naming the open one leaves switching the rule off as the only idea left",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("--no-verify does not get past this gate, because it is not a git hook", () => {
  const root = repo();
  try {
    stage(root, "src/user.ts", GUILTY);
    assert.equal(tryCommit(root, "git commit --no-verify -m 'x'").refusals.length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("what is judged is what is staged, not what is on disk", () => {
  const root = repo();
  try {
    stage(root, "src/user.ts", GUILTY);
    writeFileSync(join(root, "src/user.ts"), "export const clean = 1;\n");

    assert.equal(
      tryCommit(root, "git commit -m 'x'").refusals.length,
      1,
      "the staged version is what would be committed, so it is what gets judged",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a clean commit is not interrupted", () => {
  const root = repo();
  try {
    stage(root, "src/user.ts", "export const total = 1;\n");
    assert.deepEqual([...tryCommit(root, "git commit -m 'x'").refusals], []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("any other command passes untouched", () => {
  const root = repo();
  try {
    stage(root, "src/user.ts", GUILTY);
    assert.deepEqual([...tryCommit(root, "npm test").refusals], []);
    assert.deepEqual([...tryCommit(root, "git status").refusals], []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("outside a git repository the gate stays quiet rather than guessing", () => {
  const root = mkdtempSync(join(tmpdir(), "looper-nogit-"));
  try {
    assert.deepEqual([...tryCommit(root, "git commit -m 'x'").refusals], []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

const WALKS_PAST_THE_HOOK: readonly string[] = [
  "git commit --no-verify -m x",
  'bash -c "git commit --no-verify -m x"',
  "env git commit --no-verify -m x",
  "(git commit --no-verify -m x)",
  "xargs -I{} git commit --no-verify -m {}",
];

test("the one flag that skips the git hook is a commit however it is wrapped", () => {
  for (const command of WALKS_PAST_THE_HOOK) {
    assert.equal(
      intentOf(command).kind,
      "commit",
      `${command} was not read as a commit. --no-verify tells git to skip the hook, so this gate is the only one left — and a wrapper around it puts a word other than git first.`,
    );
  }
});

test("a flag that merely looks like it is left alone", () => {
  for (const command of ["echo -n hello", "grep -n needle file.txt", "sort -n numbers.txt"]) {
    assert.equal(
      intentOf(command).kind,
      "other",
      `${command} was read as a commit, which stages a judgement on every ordinary command that carries -n`,
    );
  }
});

test("the message gate says when it could not run, like the commit gate already did", () => {
  const script = commitMessageScript("looper");
  assert.ok(
    script.includes("was not checked"),
    "when the entry cannot be found the message scan is skipped, and the message gate is what catches a password pasted into a commit message",
  );
});

const BLANK_LINES_ABOVE = `export function totals(rows: readonly Row[]) {



  const each = rows.map((row) => row.amount ?? 0);

  return each;
}
`;

test("the staged text a commit is judged on is the file, not the file with its blank lines deleted", () => {
  const root = repo();
  try {
    stage(root, "src/totals.ts", BLANK_LINES_ABOVE);

    const held = stagedText(root, "src/totals.ts");
    assert.equal(held.kind, "text");
    if (held.kind !== "text") return;

    assert.equal(
      held.text,
      readFileSync(join(root, "src/totals.ts"), "utf8"),
      "every blank line is dropped before the file is judged, so every line below one is numbered wrong and the gate names a line that holds something else",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the commit gate names the line the problem is actually on", () => {
  const root = repo();
  try {
    stage(root, "src/totals.ts", BLANK_LINES_ABOVE);
    const onDisk = readFileSync(join(root, "src/totals.ts"), "utf8").split("\n");
    const wanted = onDisk.findIndex((line) => line.includes("?? 0")) + 1;

    const outcome = judgeStaged(root);
    assert.equal(outcome.kind, "block");
    if (outcome.kind !== "block") return;
    assert.ok(
      outcome.reason.includes(`src/totals.ts:${wanted}`),
      `the gate named a line other than ${wanted}, which is where the problem is: ${outcome.reason.split("\n").filter((l) => l.includes("totals.ts")).join(" ")}`,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

const PASTES_A_COMMAND = `import { execSync } from "node:child_process";

export function convert(input: string): Buffer {
  return execSync("convert " + input + " out.png");
}
`;

function mixedRepo(): string {
  const root = repo();
  writeFileSync(join(root, "Cargo.toml"), '[package]\nname = "held"\nversion = "0.1.0"\nedition = "2021"\n');
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "t", dependencies: {} }));
  return root;
}

test("the commit gate judges a file by the same law looper law does", () => {
  const root = mixedRepo();
  try {
    stage(root, "src/convert.ts", PASTES_A_COMMAND);

    const surveyed = new Set(
      surveyProject(root, "everything", ["src/convert.ts"]).violations.map((one) => one.rule.id),
    );
    const outcome = judgeStaged(root);
    const gated = new Set(
      outcome.kind === "block"
        ? [...outcome.reason.matchAll(/\[([A-Z]+(?:-[A-Z]+)?:\d+)\]/g)].map((held) => held[1])
        : [],
    );

    assert.deepEqual(
      [...gated].filter((id) => !surveyed.has(id)),
      [],
      "the gate applied a rule the survey skips, because it judges without a role and a role-scoped rule then applies to every file",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
