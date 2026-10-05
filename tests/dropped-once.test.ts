import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { allocate, type Allocation } from "../src/allocator.ts";
import { NO_TURN, type Capability, type HookEvent, type Injection, type Outcome } from "../src/capability.ts";
import { SaidInSession, type Said } from "../src/said.ts";

const ROOT = "/some/project";

const NO_EVENTS: readonly HookEvent[] = [];

const RULES: Injection = { source: "router", priority: 0, text: "c".repeat(400), required: true, notice: false };

const STALL_NOTICE = `looper: 2 shape(s) in this session's last forty minutes look like being stuck, not like working.\n${"s".repeat(500)}`;

function saying(injections: readonly Injection[]): Capability {
  return {
    name: "saying",
    inject: (): readonly Injection[] => injections,
    hooks: () => NO_EVENTS,
    onHook: (): Outcome => ({ kind: "pass" }),
    tools: () => [],
    call: () => ({ kind: "unknown-tool", asked: "" }),
  };
}

function notice(source: string, text: string): Injection {
  return { source, priority: 30, text, required: false, notice: true };
}

function branch(name: string): Injection {
  return {
    source: `doctrine:${name}`,
    priority: 10,
    text: "b".repeat(600),
    required: false,
    notice: false,
    summary: `what ${name} is for`,
  };
}

function turn(said: Said, budget: number, injections: readonly Injection[]): Allocation {
  return allocate([saying(injections)], { root: ROOT, budget, turn: NO_TURN, said }).allocation;
}

function inSession(body: (said: Said) => void): void {
  const home = mkdtempSync(join(tmpdir(), "looper-dropped-"));
  try {
    body({ kind: "session", store: new SaidInSession(ROOT, home, "a-session") });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

test("a notice that does not fit is named once in a session, then waits for room without being named again", () => {
  inSession((said) => {
    const first = turn(said, 600, [RULES, notice("stall", STALL_NOTICE)]);
    assert.deepEqual(first.dropped.map((one) => one.source), ["stall"]);
    assert.match(first.text, /stall \(\d+ chars\)/);

    const second = turn(said, 600, [RULES, notice("stall", STALL_NOTICE)]);
    assert.deepEqual(second.dropped, [], "the same notice was named as dropped on a second turn");
    assert.doesNotMatch(second.text, /stall|dropped for budget/);
  });
});

test("a dropped notice is named with what it holds and how it arrives, never sent to the doctrine tool", () => {
  inSession((said) => {
    const first = turn(said, 600, [RULES, notice("stall", STALL_NOTICE)]);
    const line = first.text.split("\n").find((one) => one.includes("stall ("));
    assert.ok(line !== undefined, "the dropped notice was not named");
    assert.match(line, /look like being stuck/, "the line does not say what the notice holds");
    assert.doesNotMatch(first.text, /doctrine tool/, "a notice was sent to a tool that holds no such thing");
  });
});

test("a rule set that does not fit is named on every turn it does not fit, with the name the doctrine tool knows it by", () => {
  inSession((said) => {
    for (const each of [1, 2]) {
      const answer = turn(said, 700, [RULES, branch("frontend")]);
      assert.deepEqual(answer.dropped.map((one) => one.source), ["doctrine:frontend"], `turn ${each}`);
      const line = answer.text.split("\n").find((one) => one.includes("doctrine:frontend"));
      assert.ok(line !== undefined, `turn ${each}: the rule set was not named`);
      assert.match(line, /what frontend is for/);
      assert.match(line, /doctrine tool.*\bfrontend\b/, `turn ${each}: the line does not say how to fetch it`);
    }
  });
});

test("a notice named once is said in full on the first turn it fits, and then counts as heard", () => {
  inSession((said) => {
    turn(said, 600, [RULES, notice("stall", STALL_NOTICE)]);
    const roomy = turn(said, 9800, [RULES, notice("stall", STALL_NOTICE)]);
    assert.ok(roomy.text.includes(STALL_NOTICE), "a notice that waited never arrived");
    const after = turn(said, 9800, [RULES, notice("stall", STALL_NOTICE)]);
    assert.ok(!after.text.includes(STALL_NOTICE), "a notice heard in full was said again");
  });
});

test("a notice whose words change is named again when it does not fit", () => {
  inSession((said) => {
    turn(said, 600, [RULES, notice("stall", STALL_NOTICE)]);
    const changed = turn(said, 600, [RULES, notice("stall", `looper: a different shape now.\n${"t".repeat(500)}`)]);
    assert.deepEqual(changed.dropped.map((one) => one.source), ["stall"]);
    assert.match(changed.text, /a different shape now/);
  });
});

test("without a session, every drop is named every time, as before", () => {
  const nobody: Said = { kind: "nobody" };
  for (const each of [1, 2]) {
    const said = turn(nobody, 600, [RULES, notice("stall", STALL_NOTICE)]);
    assert.deepEqual(said.dropped.map((one) => one.source), ["stall"], `turn ${each}`);
  }
});
