import { test } from "node:test";
import { NO_TURN } from "../src/capability.ts";
import { NEVER_SAID, type Said } from "../src/said.ts";
import assert from "node:assert/strict";

import { allocate } from "../src/allocator.ts";
import { HOOK_OUTPUT_CEILING } from "../src/config.ts";
import { couldNotSpeak } from "../src/report/say.ts";
import type {
  Capability,
  HookEvent,
  Injection,
  Outcome,
} from "../src/capability.ts";

const NO_EVENTS: readonly HookEvent[] = [];

class Speaker implements Capability {
  readonly name: string;
  readonly priority: number;
  readonly body: string;
  readonly must: boolean;

  constructor(name: string, priority: number, body: string, must: boolean) {
    this.name = name;
    this.priority = priority;
    this.body = body;
    this.must = must;
  }

  inject(): readonly Injection[] {
    return [{ source: this.name, priority: this.priority, text: this.body, required: this.must }];
  }

  hooks(): readonly HookEvent[] {
    return NO_EVENTS;
  }

  onHook(): Outcome {
    return { kind: "pass" };
  }
}

class Silent implements Capability {
  readonly name = "silent";

  inject(): readonly Injection[] {
    return [];
  }

  hooks(): readonly HookEvent[] {
    return NO_EVENTS;
  }

  onHook(): Outcome {
    return { kind: "pass" };
  }
}

class Broken implements Capability {
  readonly name = "broken";

  inject(): readonly Injection[] {
    throw new Error("no doctrine directory");
  }

  hooks(): readonly HookEvent[] {
    return NO_EVENTS;
  }

  onHook(): Outcome {
    return { kind: "pass" };
  }
}

const CONTEXT = { root: "/nowhere", budget: 100, turn: NO_TURN, said: NEVER_SAID };

test("priority decides the order, not registration", () => {
  const run = allocate(
    [new Speaker("second", 5, "BBB", true), new Speaker("first", 0, "AAA", true)],
    CONTEXT,
  );

  assert.deepEqual([...run.allocation.contributors], ["first", "second"]);
  assert.equal(run.allocation.text, "AAA\n\nBBB");
});

test("a capability with nothing to say costs nothing", () => {
  const run = allocate([new Silent(), new Speaker("router", 0, "AAA", true)], CONTEXT);

  assert.deepEqual([...run.allocation.contributors], ["router"]);
  assert.equal(run.allocation.text, "AAA");
});

test("overflow is dropped and the drop is visible, for what may be dropped", () => {
  const run = allocate(
    [new Speaker("first", 0, "A".repeat(90), true), new Speaker("second", 1, "B".repeat(90), false)],
    CONTEXT,
  );

  assert.deepEqual([...run.allocation.contributors], ["first"]);
  assert.deepEqual(run.allocation.dropped.map((one) => one.source), ["second"]);
  assert.ok(run.allocation.text.includes("dropped for budget"));
  assert.ok(run.allocation.text.includes("second"));
});

test("the first contributor is never dropped, and says so when it overflows", () => {
  const run = allocate([new Speaker("router", 0, "A".repeat(500), true)], CONTEXT);

  assert.deepEqual([...run.allocation.contributors], ["router"]);
  assert.equal(run.allocation.overflowed, true);
});

test("a capability that throws is skipped and complained about, never fatal", () => {
  const run = allocate([new Broken(), new Speaker("router", 1, "AAA", true)], CONTEXT);

  assert.deepEqual([...run.allocation.contributors], ["router"]);
  assert.equal(run.complaints.length, 1);
  assert.equal(run.complaints[0]?.capability, "broken");
});

test("the cost is reported in characters", () => {
  const run = allocate([new Speaker("router", 0, "AAAAA", true)], CONTEXT);
  assert.equal(run.allocation.chars, 5);
});

test("what each rule set cost is reported, because the author cannot cut what they cannot see", () => {
  const run = allocate(
    [new Speaker("first", 0, "a".repeat(100), true), new Speaker("second", 10, "b".repeat(250), true)],
    { root: ".", budget: 9800, turn: NO_TURN, said: NEVER_SAID },
  );

  assert.deepEqual(
    run.allocation.weighed.map((held) => `${held.source}:${held.chars}`),
    ["first:100", "second:250"],
    "the widths are what the doctrine author needs to decide what to cut, and estimating them by hand with wc is the job looper is supposed to be doing",
  );
});

test("required text past the hook ceiling is cut by us, and the cut is stated", () => {
  const huge = "A".repeat(HOOK_OUTPUT_CEILING * 2);
  const run = allocate([new Speaker("router", 0, huge, true)], CONTEXT);

  assert.ok(
    run.allocation.text.length <= HOOK_OUTPUT_CEILING,
    `emitted ${run.allocation.text.length} characters against a ceiling of ${HOOK_OUTPUT_CEILING}: past it the agent keeps a 2000-character preview and a file path, so the constitution itself would not arrive`,
  );
  assert.match(run.allocation.text, /characters were cut here/);
  assert.equal(run.allocation.overflowed, true);
  assert.ok(run.allocation.text.startsWith("A".repeat(1000)));
});

test("text within the hook ceiling is never cut, only marked", () => {
  const run = allocate([new Speaker("router", 0, "A".repeat(500), true)], CONTEXT);

  assert.ok(run.allocation.text.startsWith("A".repeat(500)));
  assert.doesNotMatch(run.allocation.text, /characters were cut here/);
});

const A_REAL_TURN = { root: "/nowhere", budget: 9800, turn: NO_TURN, said: NEVER_SAID };

const WHAT_BROKE = couldNotSpeak("broken", "no doctrine directory", true);

test("a failure notice is paid for by what may be dropped, before any rule is cut", () => {
  const run = allocate(
    [new Speaker("rules", 0, "A".repeat(5000), true), new Speaker("extra", 5, "B".repeat(4700), false), new Broken()],
    A_REAL_TURN,
  );

  assert.ok(run.allocation.text.startsWith("A".repeat(5000)));
  assert.ok(run.allocation.text.endsWith(WHAT_BROKE), "the notice arrives whole");
  assert.deepEqual(run.allocation.dropped.map((one) => one.source), ["extra"]);
  assert.doesNotMatch(
    run.allocation.text,
    /characters were cut here/,
    "the notice was added after the budget had been spent, so it pushed the turn past the hook's ceiling and the cut took rules that would otherwise have arrived",
  );
});

test("a failure notice arrives whole even when the rules alone fill the turn", () => {
  const run = allocate([new Speaker("rules", 0, "A".repeat(9790), true), new Broken()], A_REAL_TURN);

  assert.ok(run.allocation.text.length <= HOOK_OUTPUT_CEILING);
  assert.ok(
    run.allocation.text.endsWith(WHAT_BROKE),
    `the one thing in the turn that says a part of looper was not working was the first thing cut: …${run.allocation.text.slice(-200)}`,
  );
  assert.match(run.allocation.text, /characters were cut here/, "what had to give way is said");
});

class Notice implements Capability {
  readonly name: string;
  readonly priority: number;
  readonly body: string;
  readonly must: boolean;

  constructor(name: string, priority: number, body: string, must: boolean) {
    this.name = name;
    this.priority = priority;
    this.body = body;
    this.must = must;
  }

  inject(): readonly Injection[] {
    return [{ source: this.name, priority: this.priority, text: this.body, required: this.must, notice: true }];
  }

  hooks(): readonly HookEvent[] {
    return NO_EVENTS;
  }

  onHook(): Outcome {
    return { kind: "pass" };
  }
}

function listening(noted: string[]): Said {
  return {
    kind: "session",
    store: {
      trouble: "",
      heard: () => false,
      note: (source) => {
        noted.push(source);
      },
    },
  };
}

test("a notice that was cut on its way out is not counted as heard", () => {
  const noted: string[] = [];
  const run = allocate(
    [new Notice("early", 0, "early notice", true), new Speaker("rules", 1, "A".repeat(9990), true), new Notice("late", 5, "N".repeat(300), true)],
    { ...A_REAL_TURN, said: listening(noted) },
  );

  assert.ok(!run.allocation.text.includes("N".repeat(300)), "the turn is past the ceiling, so its tail was cut");
  assert.deepEqual(
    noted,
    ["early"],
    "what a session was told was written down before the cut, so a notice the agent never read was never said again",
  );
});

test("a turn still arrives when what it said cannot be written down", () => {
  const said: Said = {
    kind: "session",
    store: {
      trouble: "",
      heard: () => false,
      note: () => {
        throw new RangeError("could not write the record of what was said");
      },
    },
  };
  const run = allocate([new Speaker("rules", 0, "AAA", true), new Notice("line", 5, "said once", false)], { ...A_REAL_TURN, said });

  assert.ok(
    run.allocation.text.includes("AAA") && run.allocation.text.includes("said once"),
    "a home folder that cannot be written cost the whole turn: the constitution and every rule set, replaced by an alarm that looper could not load",
  );
  assert.deepEqual([...run.unrecorded], ["could not write the record of what was said"]);
});
