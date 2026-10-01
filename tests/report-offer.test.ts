import { first } from "./helpers.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { allocate } from "../src/allocator.ts";
import type { Capability, HookEvent, Injection, Outcome, ToolDef, ToolResult, Turn } from "../src/capability.ts";
import { BULLET_CEILING, RELEASE_TOOL, REPORT_TOOL } from "../src/config.ts";
import { Report } from "../src/report/capability.ts";
import { SaidInSession, type Said } from "../src/said.ts";

type Scene = { readonly root: string; readonly home: string };

function scene(): Scene {
  const root = mkdtempSync(join(tmpdir(), "looper-offer-"));
  const home = mkdtempSync(join(tmpdir(), "looper-offer-home-"));
  mkdirSync(join(root, "src"), { recursive: true });
  return { root, home };
}

function strike(held: Scene): void {
  rmSync(held.root, { recursive: true, force: true });
  rmSync(held.home, { recursive: true, force: true });
}

function turnOf(session: string): Turn {
  return { session: { kind: "known", id: session }, prompt: "", inHand: { kind: "given", paths: [] } };
}

const NOBODY_ASKING: Turn = { session: { kind: "unknown" }, prompt: "", inHand: { kind: "given", paths: [] } };

function saidIn(held: Scene, session: string): Said {
  return { kind: "session", store: new SaidInSession(held.root, held.home, session) };
}

function offered(held: Scene, turn: Turn): readonly Injection[] {
  return new Report(held.home).inject({ root: held.root, budget: 9800, turn, said: { kind: "nobody" } });
}

test("a session is told that looper can be wrong, and by which tool to say so", () => {
  const held = scene();
  try {
    const told = first(offered(held, turnOf("a")));

    assert.ok(told.text.includes(`\`${REPORT_TOOL}\``), "a line that names no tool is a line nobody can act on");
    assert.ok(
      told.text.length < BULLET_CEILING,
      `the line is ${told.text.length} characters, and the house ceiling for one rule is ${BULLET_CEILING}`,
    );
    assert.equal(told.required, false);
    assert.equal(told.notice, true);
    assert.equal(told.waits, true);
  } finally {
    strike(held);
  }
});

test("it is said once in a session, and again in the next one", () => {
  const held = scene();
  try {
    const report = new Report(held.home);
    const told = (session: string): string =>
      allocate([report], { root: held.root, budget: 9800, turn: turnOf(session), said: saidIn(held, session) })
        .allocation.text;

    assert.ok(told("a").includes(REPORT_TOOL));
    assert.equal(
      told("a"),
      "",
      "a notice repeated on every turn was measured as wallpaper by the fifth, and the every-turn tier is at its cap",
    );
    assert.ok(told("b").includes(REPORT_TOOL), "another session has heard nothing");
  } finally {
    strike(held);
  }
});

test("a turn that does not say which session it belongs to is told nothing", () => {
  const held = scene();
  try {
    assert.deepEqual(
      [...offered(held, NOBODY_ASKING)],
      [],
      "with no session nothing can be remembered as heard, so the line would repeat on every turn",
    );
  } finally {
    strike(held);
  }
});

test("a project that said never is told nothing", () => {
  const held = scene();
  try {
    writeFileSync(join(held.root, "law.toml"), '[report]\noffer = "never"\n');

    assert.deepEqual([...offered(held, turnOf("a"))], []);
  } finally {
    strike(held);
  }
});

test("a report nobody has answered is named instead of the line", () => {
  const held = scene();
  try {
    const report = new Report(held.home);
    report.call({
      root: held.root,
      tool: REPORT_TOOL,
      client: { kind: "unknown" },
      args: new Map([
        ["kind", "failed"],
        ["about", "PostToolUse"],
        ["wrong", "The hook exited without saying anything and the edit was never judged."],
        ["instead", "It should have said that the edit was not judged."],
      ]),
    });
    const told = first(offered(held, turnOf("b")));

    assert.ok(
      told.text.includes("PostToolUse") && told.text.includes(`\`${RELEASE_TOOL}\``),
      `a session that ended before anyone was asked leaves a report nobody will ever see, unless the next session is told it is there: ${told.text}`,
    );
    assert.ok(told.text.length < BULLET_CEILING);
  } finally {
    strike(held);
  }
});

const NO_EVENTS: readonly HookEvent[] = [];

const NO_TOOLS: readonly ToolDef[] = [];

class Says implements Capability {
  readonly name: string;
  private readonly said: Injection;

  constructor(said: Injection) {
    this.name = said.source;
    this.said = said;
  }

  inject(): readonly Injection[] {
    return [this.said];
  }

  hooks(): readonly HookEvent[] {
    return NO_EVENTS;
  }

  onHook(): Outcome {
    return { kind: "pass" };
  }

  tools(): readonly ToolDef[] {
    return NO_TOOLS;
  }

  call(): ToolResult {
    return { kind: "unknown-tool", asked: "none" };
  }
}

const ROUTER: Injection = { source: "router", priority: 0, required: true, notice: false, text: "R".repeat(600) };

const RULES: Injection = { source: "doctrine:testing", priority: 10, required: false, notice: false, text: "T".repeat(300) };

const WIDE_RULES: Injection = { source: "doctrine:wide", priority: 10, required: false, notice: false, text: "W".repeat(700) };

function offer(waits: boolean): Injection {
  return { source: "report", priority: 40, required: false, notice: true, waits, text: "O".repeat(200) };
}

function fitted(said: readonly Injection[], heard: Said) {
  return allocate(
    said.map((one) => new Says(one)),
    { root: ".", budget: 1000, turn: turnOf("a"), said: heard },
  ).allocation;
}

test("an offer that waits never costs a rule set its place", () => {
  const impatient = fitted([ROUTER, RULES, offer(false)], { kind: "nobody" });
  assert.deepEqual(
    impatient.dropped.map((one) => one.source),
    ["report", "doctrine:testing"],
    "this is the hazard: a notice that does not fit has to be named, the line that names it does not fit either, and the rule set the session is working under is thrown out to make room for it",
  );

  const patient = fitted([ROUTER, RULES, offer(true)], { kind: "nobody" });
  assert.deepEqual([...patient.contributors], ["router", "doctrine:testing"]);
  assert.deepEqual([...patient.dropped], [], "an offer that does not fit says nothing this turn and is not listed as dropped");
  assert.ok(!patient.text.includes("dropped for budget"));
});

test("an offer that fitted gives its room back when a rule set has to be named as dropped, and is not named itself", () => {
  const held = scene();
  try {
    const heard = saidIn(held, "a");
    const turn = fitted([ROUTER, WIDE_RULES, offer(true)], heard);

    assert.deepEqual(turn.dropped.map((one) => one.source), ["doctrine:wide"]);
    assert.ok(!turn.contributors.includes("report"));
    assert.ok(turn.text.includes("doctrine:wide") && !turn.text.includes("report ("));
    assert.equal(
      heard.kind === "session" && heard.store.heard("report", "O".repeat(200)),
      false,
      "an offer that was taken back was never heard, so it speaks on the next turn with room",
    );
  } finally {
    strike(held);
  }
});
