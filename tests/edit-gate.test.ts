import { first } from "./helpers.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Law, targetOf } from "../src/law/capability.ts";
import { dispatchHook } from "../src/registry.ts";

const GUILTY = `export function find(id: string) {
  try {
    return db.get(id);
  } catch {
    return null;
  }
}
`;

const LAWFUL = `export function find(id: string) {
  try {
    return db.get(id);
  } catch (cause) {
    throw new NotFound(id, cause);
  }
}
`;

function project(): string {
  const root = mkdtempSync(join(tmpdir(), "looper-gate-"));
  mkdirSync(join(root, "src"), { recursive: true });
  return root;
}

function editOf(root: string, file: string): string {
  return JSON.stringify({
    tool_name: "Edit",
    tool_input: { file_path: join(root, file) },
  });
}

function judgeEdit(root: string, file: string) {
  return dispatchHook([new Law()], {
    root,
    event: "PostToolUse",
    payload: { kind: "text", text: editOf(root, file) },
  });
}

test("an edit that breaks a rule is refused, with the report as the reason", () => {
  const root = project();
  try {
    writeFileSync(join(root, "src/user.ts"), GUILTY);
    const result = judgeEdit(root, "src/user.ts");

    assert.equal(result.refusals.length, 1);
    const reason = first(result.refusals).reason;
    assert.ok(reason.includes("TS-ERROR:3"));
    assert.ok(reason.includes("src/user.ts:5"));
    assert.ok(reason.includes("--- ERROR ---"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a lawful edit passes in silence", () => {
  const root = project();
  try {
    writeFileSync(join(root, "src/user.ts"), LAWFUL);
    assert.deepEqual([...judgeEdit(root, "src/user.ts").refusals], []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a pardon in law.toml is honoured at edit time", () => {
  const root = project();
  try {
    writeFileSync(join(root, "src/user.ts"), GUILTY);
    writeFileSync(join(root, "law.toml"), '[exempt]\n"src/user.ts" = ["ALL"]\n');
    assert.deepEqual([...judgeEdit(root, "src/user.ts").refusals], []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a path from outside the project is refused a verdict, never followed", () => {
  const root = project();
  try {
    assert.equal(targetOf(root, editOf(root, "../../etc/passwd")).kind, "outside");
    assert.equal(targetOf(root, JSON.stringify({
      tool_input: { file_path: "/etc/shadow" },
    })).kind, "outside");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("installed packages and build output are not ours to judge", () => {
  const root = project();
  try {
    for (const path of ["node_modules/x/index.ts", "dist/main.ts", ".git/hooks/x.ts"]) {
      assert.equal(targetOf(root, editOf(root, path)).kind, "not-ours", path);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a file in a language no rule here reads is passed over without complaint", () => {
  const root = project();
  try {
    for (const path of ["README.md", "package.json", "src/logo.svg"]) {
      assert.equal(targetOf(root, editOf(root, path)).kind, "not-ours", path);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

const A_FOUGHT_STYLESHEET = `.card {
  color: #ff0088;
  margin-top: -8px;
}
`;

const A_TOKEN_STYLESHEET = `.card {
  color: var(--color-pink);
  padding: var(--space-2);
}
`;

test("a stylesheet is judged at the edit gate, which it never used to be", () => {
  const root = project();
  try {
    assert.equal(targetOf(root, editOf(root, "src/app.css")).kind, "judge");

    writeFileSync(join(root, "src/app.css"), A_FOUGHT_STYLESHEET);
    const result = judgeEdit(root, "src/app.css");

    assert.equal(result.refusals.length, 1);
    const reason = first(result.refusals).reason;
    assert.ok(reason.includes("CSS-TRUTH:1"), reason.slice(0, 300));
    assert.ok(reason.includes("CSS-TRUTH:3"), reason.slice(0, 300));
    assert.ok(reason.includes("src/app.css:2"), reason.slice(0, 300));

    writeFileSync(join(root, "src/app.css"), A_TOKEN_STYLESHEET);
    assert.deepEqual([...judgeEdit(root, "src/app.css").refusals], []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

const A_PAGE_WITH_A_WORKAROUND = `<html>
  <body><div style="color: red">hi</div></body>
</html>
`;

test("a page is judged too, so the styles cannot be moved somewhere unread", () => {
  const root = project();
  try {
    writeFileSync(join(root, "src/index.html"), A_PAGE_WITH_A_WORKAROUND);
    const result = judgeEdit(root, "src/index.html");

    assert.equal(result.refusals.length, 1);
    const reason = first(result.refusals).reason;
    assert.ok(reason.includes("CSS-LAYER:1"), reason.slice(0, 300));
    assert.ok(reason.includes("src/index.html:2"), reason.slice(0, 300));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("no TypeScript rule fires on a stylesheet, which cannot be parsed as one", () => {
  const root = project();
  try {
    writeFileSync(join(root, "src/app.css"), A_TOKEN_STYLESHEET);
    const result = judgeEdit(root, "src/app.css");
    for (const refusal of result.refusals) {
      assert.ok(
        !refusal.reason.includes("TS-"),
        `a TypeScript rule judged a stylesheet: ${refusal.reason.slice(0, 200)}`,
      );
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a payload with no file in it, or one we cannot read, passes rather than guesses", () => {
  const root = project();
  try {
    assert.equal(targetOf(root, "{}").kind, "none");
    assert.equal(targetOf(root, "{ not json").kind, "none");
    assert.deepEqual([...judgeEdit(root, "src/never-written.ts").refusals], []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
