import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { law } from "../src/commands/law.ts";
import { INSTALLED, environmentWith, searchPath } from "../src/config.ts";
import { runInit } from "../src/init.ts";
import { readBaseline, writeBaseline } from "../src/law/baseline.ts";
import { Law } from "../src/law/capability.ts";
import { dispatchHook, type Dispatch } from "../src/registry.ts";
import { gitIn as git } from "./helpers.ts";

const NO_PATH: readonly string[] = [];

const SUMS = `export function total(items: number[]) {
  console.log("summing", items.length);
  return items.reduce((sum, item) => sum + item, 0);
}
`;

const CLEAN = `export function double(n: number) {
  return n * 2;
}
`;

function project(files: Readonly<Record<string, string>>): string {
  const root = mkdtempSync(join(tmpdir(), "looper-old-"));
  git(root, "init", "-q");
  git(root, "config", "user.email", "t@example.com");
  git(root, "config", "user.name", "t");
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "t" }));
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), text);
  }
  git(root, "add", "-A");
  git(root, "commit", "-qm", "before looper");
  return root;
}

function adoptedBlindTo(root: string, unseen: readonly string[]): void {
  runInit(root, INSTALLED, NO_PATH);
  const recorded = readBaseline(root);
  writeBaseline(root, new Map([...recorded].filter(([file]) => !unseen.includes(file))));
  git(root, "add", "-A");
  git(root, "commit", "-qm", "looper arrives, with a reader that could not see everything");
}

function committedLater(root: string, file: string, text: string): void {
  writeFileSync(join(root, file), text);
  git(root, "add", "-A");
  git(root, "commit", "-qm", "written after looper arrived");
}

type Said = { readonly exit: number; readonly text: string };

function lawIn(root: string): Said {
  const wasIn = process.cwd();
  const out: string[] = [];
  try {
    process.chdir(root);
    const exit = law(NO_PATH, { say: (line) => out.push(line), warn: (line) => out.push(line) });
    return { exit, text: out.join("\n") };
  } finally {
    process.chdir(wasIn);
  }
}

function editedIn(root: string, file: string, text: string): Dispatch {
  writeFileSync(join(root, file), text);
  return dispatchHook([new Law()], {
    root,
    event: "PostToolUse",
    payload: {
      kind: "text",
      text: JSON.stringify({ tool_name: "Edit", tool_input: { file_path: join(root, file) } }),
    },
  });
}

function committing(root: string): Dispatch {
  git(root, "add", "-A");
  return dispatchHook([new Law()], {
    root,
    event: "PreToolUse",
    payload: {
      kind: "text",
      text: JSON.stringify({ tool_name: "Bash", tool_input: { command: "git commit -m x" } }),
    },
  });
}

function said(dispatch: Dispatch): string {
  return [...dispatch.refusals.map((one) => one.reason), ...dispatch.mentions.map((one) => one.note)].join("\n");
}

test("a problem already in a file the baseline never read is older than looper, and blocks nothing", () => {
  const root = project({ "src/sum.ts": SUMS, "src/double.ts": CLEAN });
  try {
    adoptedBlindTo(root, ["src/sum.ts"]);

    const asked = lawIn(root);
    assert.equal(asked.exit, 0, `the console.log was there before looper arrived; only a reader that could not see it then left it out of the baseline\n${asked.text}`);
    assert.match(asked.text, /already here before looper arrived/);

    const edit = editedIn(root, "src/sum.ts", SUMS.replace("sum + item, 0", "sum + item, 0 + 0"));
    assert.deepEqual(edit.refusals, [], `an edit two lines away was refused over a line it did not touch:\n${said(edit)}`);
    assert.match(said(edit), /from before looper arrived/);

    const commit = committing(root);
    assert.deepEqual(commit.refusals, [], `the commit was refused over a line it did not touch:\n${said(commit)}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a problem written after looper arrived is yours, even in a file the baseline never read", () => {
  const root = project({ "src/sum.ts": SUMS, "src/double.ts": CLEAN });
  try {
    adoptedBlindTo(root, ["src/sum.ts"]);
    committedLater(root, "src/sum.ts", SUMS.replace("  return items", '  console.log("done");\n  return items'));

    const asked = lawIn(root);
    assert.equal(asked.exit, 2, `a line written after the baseline was let through as old:\n${asked.text}`);
    assert.match(asked.text, /1 of these was already here before looper arrived/);
    assert.match(asked.text, /The other 1 is new and is blocking/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a problem a later change caused on a line nobody touched is yours, because it was not there when looper arrived", () => {
  const root = project({ "law.toml": "max_loc = 4\n", "src/four.ts": "export const a = 1;\nexport const b = 2;\nexport const c = 3;\n", "src/sum.ts": SUMS });
  try {
    adoptedBlindTo(root, []);
    committedLater(root, "src/four.ts", "export const z = 0;\nexport const a = 1;\nexport const b = 2;\nexport const c = 3;\n");

    const asked = lawIn(root);
    assert.match(asked.text, /TS-DECOMPOSITION:1/);
    assert.equal(
      asked.exit,
      2,
      `the file crossed its cap after looper arrived, and the line the cap is reported on is an old line that only moved down; asking whether that line changed would have called it old\n${asked.text}`,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("looper arriving without a baseline still marks when it arrived", () => {
  const root = project({ "src/double.ts": CLEAN, "src/sum.ts": SUMS });
  try {
    runInit(root, INSTALLED, NO_PATH);
    rmSync(join(root, ".looper/baseline.toml"), { force: true });
    git(root, "add", "-A");
    git(root, "commit", "-qm", "looper arrives into what it took for a clean project");

    const asked = lawIn(root);
    assert.equal(asked.exit, 0, `nothing was recorded because looper saw nothing then; the line is still older than looper\n${asked.text}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

const DEMO = `fn main() {
    let n: u32 = "4".parse().unwrap();
    let m: u32 = "5".parse().unwrap();
    std::process::exit(i32::try_from(n + m).unwrap());
}
`;

test("a Rust file outside src/ that the baseline never read keeps its old problems old, and only the line touched is yours", () => {
  const root = project({
    "Cargo.toml": '[package]\nname = "scratch"\nversion = "0.1.0"\nedition = "2021"\n\n[dependencies]\n',
    "src/lib.rs": "pub fn parse(text: &str) -> u32 {\n    text.parse().unwrap()\n}\n",
    "examples/demo.rs": DEMO,
  });
  try {
    adoptedBlindTo(root, ["examples/demo.rs"]);

    const asked = lawIn(root);
    assert.equal(asked.exit, 0, `every problem in examples/demo.rs was there before looper arrived\n${asked.text}`);

    const edit = editedIn(root, "examples/demo.rs", DEMO.replace("n + m", "n * m"));
    assert.equal(edit.refusals.length, 1, said(edit));
    const refused = edit.refusals.map((one) => one.reason).join("\n");
    assert.match(refused, /examples\/demo\.rs:4/);
    assert.doesNotMatch(refused, /examples\/demo\.rs:2|examples\/demo\.rs:3/, "lines 2 and 3 were not touched and were there before looper arrived");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

const LOOPER = join(import.meta.dirname, "..", "bin", "looper.js");

const A_HOOK_MAY_SAY = 1024 * 1024;

type Heard = { readonly status: number | null; readonly said: string };

function hookWithoutPython(root: string, event: string, payload: unknown): Heard {
  const shelf = mkdtempSync(join(tmpdir(), "looper-path-"));
  const home = mkdtempSync(join(tmpdir(), "looper-home-"));
  try {
    const found = searchPath().map((dir) => join(dir, "git")).find((one) => existsSync(one));
    if (found === undefined) assert.fail("git is not on this machine's PATH, and every hook asks it something");
    symlinkSync(found, join(shelf, "git"));
    const ran = spawnSync(process.execPath, [LOOPER, "hook", event], {
      cwd: root,
      input: JSON.stringify(payload),
      encoding: "utf8",
      maxBuffer: A_HOOK_MAY_SAY,
      env: environmentWith({ PATH: shelf, HOME: home, CLAUDE_PROJECT_DIR: root }),
    });
    return { status: ran.status, said: `${ran.stdout}${ran.stderr}` };
  } finally {
    rmSync(shelf, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
}

function adoptedWithPython(): string {
  const root = project({ "src/double.ts": CLEAN, "tools/count.py": "def count(rows):\n    return len(rows)\n" });
  runInit(root, INSTALLED, NO_PATH);
  git(root, "add", "-A");
  git(root, "commit", "-qm", "looper arrives");
  return root;
}

test("an edited file whose reader cannot start is said to be unjudged, never passed in silence", () => {
  const root = adoptedWithPython();
  try {
    writeFileSync(join(root, "tools/count.py"), "def count(rows):\n    return len(list(rows))\n");
    const edit = hookWithoutPython(root, "PostToolUse", {
      session_id: "s",
      tool_name: "Edit",
      tool_input: { file_path: join(root, "tools/count.py") },
    });
    assert.equal(edit.status, 0, `a reader that cannot start must not wedge the session it watches:\n${edit.said}`);
    assert.match(edit.said, /tools\/count\.py/, `the edit was passed without a word, which reads exactly like a clean file:\n${edit.said}`);
    assert.match(edit.said, /not judged/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a commit refused for one file still names the file it could not judge", () => {
  const root = adoptedWithPython();
  try {
    writeFileSync(join(root, "src/double.ts"), CLEAN.replace("return n * 2;", 'console.log("doubling");\n  return n * 2;'));
    writeFileSync(join(root, "tools/count.py"), "def count(rows):\n    return len(list(rows))\n");
    git(root, "add", "-A");
    const commit = hookWithoutPython(root, "PreToolUse", { tool_name: "Bash", tool_input: { command: "git commit -m x" } });
    assert.equal(commit.status, 2, `the new console.log should refuse the commit:\n${commit.said}`);
    assert.match(commit.said, /TS-LOG:1/);
    assert.match(commit.said, /tools\/count\.py/, `the refusal named the new problem and left out the file nobody judged:\n${commit.said}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
