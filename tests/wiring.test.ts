import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { NO_TURN, type Turn } from "../src/capability.ts";
import { DEV, SETTINGS_PATH } from "../src/config.ts";
import { NEVER_SAID } from "../src/said.ts";
import { mergeSettings } from "../src/settings.ts";
import { Wiring } from "../src/wiring/capability.ts";
import { looperHooks } from "../src/wiring/hooks.ts";

const A_TURN: Turn = { session: { kind: "known", id: "s" }, prompt: "carry on", inHand: { kind: "from-git" } };

const SHIMMED = 'node "$CLAUDE_PROJECT_DIR/bin/looper.js"';

function entry(command: string): Record<string, unknown> {
  return { type: "command", command, timeout: 30, statusMessage: "looper" };
}

function writtenBefore(program: string): Record<string, unknown> {
  return {
    hooks: {
      UserPromptSubmit: [{ hooks: [entry(`${program} inject`)] }],
      PostToolUse: [
        {
          matcher: "Edit|MultiEdit|Write",
          hooks: [entry(`${program} hook PostToolUse`), { type: "command", command: "their-formatter --write" }],
        },
      ],
      PreToolUse: [{ matcher: "Bash", hooks: [entry(`${program} hook PreToolUse`)] }],
      Stop: [{ hooks: [entry(`${program} hook Stop`)] }],
    },
    permissions: { allow: ["Bash(npm test)"] },
  };
}

function inProject(settings: unknown, body: (root: string, path: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), "looper-wiring-"));
  try {
    const path = join(root, SETTINGS_PATH);
    if (settings !== undefined) {
      mkdirSync(join(root, ".claude"), { recursive: true });
      writeFileSync(path, `${JSON.stringify(settings, null, 2)}\n`);
    }
    body(root, path);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function said(root: string, turn: Turn): string {
  return new Wiring()
    .inject({ root, budget: 9800, turn, said: NEVER_SAID })
    .map((one) => one.text)
    .join("\n");
}

function commandsUnder(path: string, event: string, matcher: string): readonly string[] {
  const held: unknown = JSON.parse(readFileSync(path, "utf8"));
  const events: unknown = Object.getOwnPropertyDescriptor(held, "hooks")?.value;
  const groups: unknown = Object.getOwnPropertyDescriptor(events, event)?.value;
  assert.ok(Array.isArray(groups));
  return groups
    .filter((group: unknown) => Object.getOwnPropertyDescriptor(group, "matcher")?.value === matcher)
    .flatMap((group: unknown) => {
      const entries: unknown = Object.getOwnPropertyDescriptor(group, "hooks")?.value;
      assert.ok(Array.isArray(entries));
      return entries.map((one: unknown) => String(Object.getOwnPropertyDescriptor(one, "command")?.value));
    });
}

test("an ordinary turn brings looper's own hook entries up to date, and says what it changed", () => {
  inProject(writtenBefore(SHIMMED), (root, path) => {
    const told = said(root, A_TURN);
    assert.deepEqual(commandsUnder(path, "PostToolUse", "Edit|MultiEdit|Write|Bash"), [`${SHIMMED} hook PostToolUse`]);
    assert.deepEqual(commandsUnder(path, "PostToolUse", "Read"), [`${SHIMMED} reached`]);
    assert.match(told, /hook PostToolUse/);
    assert.match(told, /Edit\|MultiEdit\|Write\|Bash/);
    assert.match(told, /reached/);
    assert.match(told, /restart/, "a session reads its hooks when it starts, so it has to be told the change waits for the next one");
  });
});

test("what is not looper's is left as it was", () => {
  inProject(writtenBefore(SHIMMED), (root, path) => {
    said(root, A_TURN);
    assert.deepEqual(commandsUnder(path, "PostToolUse", "Edit|MultiEdit|Write"), ["their-formatter --write"]);
    const held: unknown = JSON.parse(readFileSync(path, "utf8"));
    assert.deepEqual(Object.getOwnPropertyDescriptor(held, "permissions")?.value, { allow: ["Bash(npm test)"] });
  });
});

test("the next turn finds nothing to do and says nothing", () => {
  inProject(writtenBefore(SHIMMED), (root, path) => {
    said(root, A_TURN);
    const after = readFileSync(path, "utf8");
    assert.equal(said(root, A_TURN), "");
    assert.equal(readFileSync(path, "utf8"), after);
  });
});

test("how the project starts looper is kept as the project wrote it", () => {
  const local = '"$CLAUDE_PROJECT_DIR/node_modules/.bin/looper"';
  inProject(writtenBefore(local), (root, path) => {
    said(root, A_TURN);
    assert.deepEqual(commandsUnder(path, "PostToolUse", "Read"), [`${local} reached`]);
  });
});

test("settings that carry none of looper's entries are left alone, and none are created", () => {
  const theirs = { hooks: { PostToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "their-linter --check" }] }] } };
  inProject(theirs, (root, path) => {
    const before = readFileSync(path, "utf8");
    assert.equal(said(root, A_TURN), "");
    assert.equal(readFileSync(path, "utf8"), before);
  });
  inProject(undefined, (root, path) => {
    assert.equal(said(root, A_TURN), "");
    assert.equal(existsSync(path), false);
  });
});

test("a run with no session, such as looper status, changes nothing", () => {
  inProject(writtenBefore(SHIMMED), (root, path) => {
    const before = readFileSync(path, "utf8");
    assert.equal(said(root, NO_TURN), "");
    assert.equal(readFileSync(path, "utf8"), before);
  });
});

test("this repository wears the hooks it installs", () => {
  const held = readFileSync(join(import.meta.dirname, "..", SETTINGS_PATH), "utf8");
  assert.equal(mergeSettings({ kind: "present", text: held }, looperHooks(DEV)).kind, "unchanged");
});
