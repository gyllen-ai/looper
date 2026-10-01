import { first } from "./helpers.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { allocate } from "../src/allocator.ts";
import { NO_TURN } from "../src/capability.ts";
import type { Capability, HookEvent, Injection, Outcome, ToolDef, ToolResult } from "../src/capability.ts";
import { answerTo } from "../src/commands/hook.ts";
import { NOT_A_WAY_THROUGH } from "../src/config.ts";
import { TomlMalformed } from "../src/errors.ts";
import { Law } from "../src/law/capability.ts";
import { dispatchHook } from "../src/registry.ts";
import type { Dispatch } from "../src/registry.ts";
import { A_FAULT_IN_LOOPER } from "../src/report/say.ts";
import { NEVER_SAID } from "../src/said.ts";

const TOOL_HOOKS: readonly HookEvent[] = ["PreToolUse", "PostToolUse", "Stop"];

const NO_TOOLS: readonly ToolDef[] = [];

class Broken implements Capability {
  readonly name = "broken";

  inject(): readonly Injection[] {
    throw new RangeError("law.toml, line 3: expected a number");
  }

  hooks(): readonly HookEvent[] {
    return TOOL_HOOKS;
  }

  onHook(): Outcome {
    throw new RangeError("law.toml, line 3: expected a number");
  }

  tools(): readonly ToolDef[] {
    return NO_TOOLS;
  }

  call(): ToolResult {
    return { kind: "unknown-tool", asked: "none" };
  }
}

class Speaks implements Capability {
  readonly name: string;

  constructor(name: string) {
    this.name = name;
  }

  inject(): readonly Injection[] {
    return [{ source: this.name, priority: 0, required: true, notice: false, text: `the rules from ${this.name}` }];
  }

  hooks(): readonly HookEvent[] {
    return TOOL_HOOKS;
  }

  onHook(): Outcome {
    return { kind: "mention", note: `looper: ${this.name} has something to say` };
  }

  tools(): readonly ToolDef[] {
    return NO_TOOLS;
  }

  call(): ToolResult {
    return { kind: "unknown-tool", asked: "none" };
  }
}

class TheirFileIsBroken extends Broken {
  override readonly name = "law";

  override inject(): readonly Injection[] {
    throw new TomlMalformed("law.toml", 1, "expected a number, found five hundred");
  }

  override onHook(): Outcome {
    throw new TomlMalformed("law.toml", 1, "expected a number, found five hundred");
  }
}

function dispatched(capabilities: readonly Capability[], event: HookEvent): Dispatch {
  return dispatchHook(capabilities, { root: ".", event, payload: { kind: "none" } });
}

function contextIn(line: string): string {
  const parsed: unknown = JSON.parse(line);
  assert.ok(parsed !== null && typeof parsed === "object" && "hookSpecificOutput" in parsed);
  const output: unknown = Object.getOwnPropertyDescriptor(parsed, "hookSpecificOutput")?.value;
  return String(Object.getOwnPropertyDescriptor(output, "additionalContext")?.value);
}

test("a capability that fails on a tool hook is named to the agent, because a hook's stderr reaches nobody", () => {
  const answer = answerTo("PostToolUse", dispatched([new Broken()], "PostToolUse"));

  assert.equal(answer.code, 0, "a broken looper must not wedge the session it watches");
  assert.equal(
    answer.said.length,
    1,
    "the failure went to stderr on exit 0, which the agent never sees, so the one witness to looper's own faults kept working and believed it was being judged",
  );
  const context = contextIn(first(answer.said));
  assert.ok(context.includes("broken"));
  assert.ok(context.includes("law.toml, line 3"));
  assert.ok(context.includes(A_FAULT_IN_LOOPER));
  assert.equal(answer.warned.length, 1, "the person at the terminal is still told");
});

test("a file of the project's that looper cannot read is the project's to fix, and is not called a fault in looper", () => {
  const answer = answerTo("PostToolUse", dispatched([new TheirFileIsBroken()], "PostToolUse"));
  const context = contextIn(first(answer.said));

  assert.ok(context.includes("law.toml, line 1"), "the agent still has to be told that nothing was checked, and why");
  assert.ok(
    !context.includes(A_FAULT_IN_LOOPER),
    "a mistyped line in the project's own law.toml would be sent to looper's makers as looper's fault, by every project that ever mistyped one",
  );

  const turn = allocate([new TheirFileIsBroken(), new Speaks("router")], { root: ".", budget: 9800, turn: NO_TURN, said: NEVER_SAID });
  assert.ok(turn.allocation.text.includes("law.toml, line 1"));
  assert.ok(!turn.allocation.text.includes(A_FAULT_IN_LOOPER));
});

test("two things said on one hook arrive as one object", () => {
  const answer = answerTo("PostToolUse", dispatched([new Speaks("law"), new Speaks("stall")], "PostToolUse"));

  assert.equal(
    answer.said.length,
    1,
    "one object per mention is two lines of output, which the agent's host refuses to read at all, so both were lost whenever two capabilities spoke at once",
  );
  const context = contextIn(first(answer.said));
  assert.ok(context.includes("law has something to say"));
  assert.ok(context.includes("stall has something to say"));
});

test("a hook with nothing to say prints nothing", () => {
  const answer = answerTo("PostToolUse", { refusals: [], mentions: [], complaints: [] });

  assert.deepEqual({ code: answer.code, said: [...answer.said], warned: [...answer.warned] }, { code: 0, said: [], warned: [] });
});

test("the Stop hook is left as it was: what failed there is not put in front of the agent", () => {
  const answer = answerTo("Stop", dispatched([new Broken()], "Stop"));

  assert.deepEqual(
    [...answer.said],
    [],
    "anything said to the agent at Stop continues the conversation, so a failure that repeats there would never let a session end",
  );
  assert.equal(answer.warned.length, 1);
});

test("a refusal still refuses, and what failed beside it is on the same channel", () => {
  const answer = answerTo("PostToolUse", {
    refusals: [{ capability: "law", reason: "looper found 1 problem." }],
    mentions: [],
    complaints: [{ capability: "broken", detail: "law.toml, line 3", ours: true }],
  });

  assert.equal(answer.code, 2);
  assert.deepEqual([...answer.said], [], "a refusal is read from stderr, and a second voice on stdout is ignored");
  assert.ok(answer.warned.some((line) => line.includes("looper found 1 problem.")));
  assert.ok(answer.warned.some((line) => line.includes("law.toml, line 3")));
});

test("a capability that fails while a turn is built is named in the turn", () => {
  const run = allocate([new Broken(), new Speaks("router")], { root: ".", budget: 9800, turn: NO_TURN, said: NEVER_SAID });

  assert.ok(run.allocation.text.startsWith("the rules from router"));
  assert.ok(
    run.allocation.text.includes("broken") && run.allocation.text.includes("law.toml, line 3"),
    `the turn was built without a capability and said nothing about it: ${run.allocation.text}`,
  );
  assert.ok(run.allocation.text.includes(A_FAULT_IN_LOOPER));
});

test("a turn in which nothing failed says nothing about failing", () => {
  const run = allocate([new Speaks("router")], { root: ".", budget: 9800, turn: NO_TURN, said: NEVER_SAID });

  assert.equal(run.allocation.text, "the rules from router");
});

test("no refusal points at a file an install does not carry", () => {
  assert.ok(
    !NOT_A_WAY_THROUGH.includes("CONTRIBUTING.md"),
    "package.json ships bin, src and vendor, so an agent in an adopting project was sent to a file that is not there",
  );
  assert.ok(NOT_A_WAY_THROUGH.includes("`report` tool"), "the route an agent can take on an ordinary turn is the tool");
  assert.ok(NOT_A_WAY_THROUGH.includes("looper report"), "a person committing by hand reads this in a shell, where the command is the route");
});

const GUILTY = `export function find(id: string) {
  try {
    return db.get(id);
  } catch {
    return null;
  }
}
`;

test("an edit that is refused says how to tell looper the rule is wrong", () => {
  const root = mkdtempSync(join(tmpdir(), "looper-hook-says-"));
  try {
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src/user.ts"), GUILTY);
    const result = dispatchHook([new Law()], {
      root,
      event: "PostToolUse",
      payload: { kind: "text", text: JSON.stringify({ tool_name: "Edit", tool_input: { file_path: join(root, "src/user.ts") } }) },
    });

    assert.ok(
      first(result.refusals).reason.includes("`report` tool"),
      "the canon line that names the route arrives only with TypeScript files, so a Rust, Python, C# or CSS refusal named no way to argue with the rule",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
