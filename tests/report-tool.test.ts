import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { USAGE } from "../src/announce.ts";
import { canonBranchNames } from "../src/canon.ts";
import { isHookEvent } from "../src/capability.ts";
import type { Capability, HookEvent, Injection, Outcome, ToolDef, ToolResult } from "../src/capability.ts";
import { ageOfOurCode } from "../src/code-age.ts";
import { REPORT_TOOL } from "../src/config.ts";
import { handle } from "../src/mcp.ts";
import { registry } from "../src/registry.ts";
import { Report } from "../src/report/capability.ts";
import { reportsIn } from "../src/report/store.ts";
import { partsOfLooper } from "../src/report/write.ts";
import { knownRuleIds } from "../src/law/checks.ts";

const PRIVATE = `import { acmeBillingGateway } from "@acme/billing-internal";

export async function reconcileTenantLedger(tenantRef: string) {
  try {
    return await acmeBillingGateway.settle(tenantRef, "PROD-TENANT-8842");
  } catch (cause) {
    auditTrail.record(cause);
    return [];
  }
}
`;

const THEIRS: readonly string[] = [
  "acmeBillingGateway",
  "billing-internal",
  "reconcileTenantLedger",
  "tenantRef",
  "PROD-TENANT-8842",
  "auditTrail",
  "settle",
];

const A_FAILED_HOOK = {
  kind: "failed",
  about: "PostToolUse",
  wrong: "The hook exited without saying anything and the edit was never judged.",
  instead: "It should have said that the edit was not judged.",
};

type Scene = { readonly root: string; readonly home: string };

function scene(): Scene {
  const root = mkdtempSync(join(tmpdir(), "looper-report-tool-"));
  const home = mkdtempSync(join(tmpdir(), "looper-report-home-"));
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src/billing.ts"), PRIVATE);
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "t" }));
  return { root, home };
}

function strike(held: Scene): void {
  rmSync(held.root, { recursive: true, force: true });
  rmSync(held.home, { recursive: true, force: true });
}

function resultOf(capabilities: readonly Capability[], root: string, args: unknown): Record<string, unknown> {
  const line = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name: REPORT_TOOL, arguments: args },
  });
  const reply = handle(capabilities, root, line, ageOfOurCode());
  assert.equal(reply.kind, "message");
  if (reply.kind !== "message") throw new Error("unreachable");
  const parsed: unknown = JSON.parse(reply.text);
  assert.ok(parsed !== null && typeof parsed === "object" && "result" in parsed);
  const result: unknown = Object.getOwnPropertyDescriptor(parsed, "result")?.value;
  assert.ok(result !== null && typeof result === "object");
  return { ...result };
}

function said(held: Scene, args: unknown): string {
  const content = resultOf([new Report(held.home)], held.root, args)["content"];
  assert.ok(Array.isArray(content));
  const text: unknown = Object.getOwnPropertyDescriptor(content[0], "text")?.value;
  assert.equal(typeof text, "string");
  return String(text);
}

function written(held: Scene): readonly string[] {
  const dir = reportsIn(held.root, held.home);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((name) => name.endsWith(".md"));
}

function onlyReport(held: Scene): string {
  const files = written(held);
  assert.equal(files.length, 1, `expected one report and found ${files.length}`);
  return readFileSync(join(reportsIn(held.root, held.home), String(files[0])), "utf8");
}

test("the report tool is on the server every project already runs", () => {
  const tools = registry().flatMap((capability) => capability.tools());
  const tool = tools.find((one) => one.name === REPORT_TOOL);

  assert.ok(
    tool !== undefined,
    "the constitution says the only input is a sentence, and the one route for saying looper is wrong was a command with four flags",
  );
});

test("every part of looper has a name a report can be about, so the list cannot fall behind the code", () => {
  const sayable = new Set(partsOfLooper());
  const wanted: string[] = [...knownRuleIds(), ...canonBranchNames()];
  for (const capability of registry()) {
    wanted.push(capability.name);
    for (const tool of capability.tools()) wanted.push(tool.name);
    for (const event of capability.hooks()) wanted.push(event);
  }
  for (const line of USAGE) {
    const command = /^ +(looper [a-z]+)/.exec(line);
    if (command !== null) wanted.push(String(command[1]));
  }
  const missing = wanted.filter((name) => !sayable.has(name));

  assert.ok(isHookEvent("PostToolUse") && sayable.has("UserPromptSubmit"));
  assert.deepEqual(
    [...new Set(missing)],
    [],
    "a part of looper that cannot be named cannot be reported, and the refusal would tell the agent its own tool does not exist",
  );
});

test("a fault that is not a rule on a line gets a report, with no file and no line", () => {
  const held = scene();
  try {
    const answer = said(held, A_FAILED_HOOK);
    const body = onlyReport(held);

    assert.ok(answer.includes(reportsIn(held.root, held.home)), `the answer has to say where the file is: ${answer}`);
    assert.ok(body.startsWith("# looper report"));
    assert.ok(body.includes("kind: failed"));
    assert.ok(body.includes("about: PostToolUse"));
    assert.ok(body.includes(A_FAILED_HOOK.wrong));
    assert.ok(body.includes(A_FAILED_HOOK.instead));
    assert.ok(!body.includes("## The shape"), "nothing was pointed at, so there is no shape to draw");
    assert.ok(body.includes("looper cannot send it"));
  } finally {
    strike(held);
  }
});

test("nothing of a report lands inside the project", () => {
  const held = scene();
  try {
    const before = readdirSync(held.root).sort();
    said(held, A_FAILED_HOOK);

    assert.deepEqual(
      readdirSync(held.root).sort(),
      before,
      "an untracked file in the project raises a rule set on every turn and is one `git add -A` away from being published by accident",
    );
  } finally {
    strike(held);
  }
});

test("what a report is about must be one of looper's own names", () => {
  const held = scene();
  try {
    const answer = said(held, { kind: "failed", about: "acmeBillingGateway", wrong: "It failed.", instead: "It should not." });

    assert.deepEqual([...written(held)], []);
    assert.ok(!answer.includes("Written"), answer);
    assert.ok(
      answer.includes("TS-ERROR:3") && answer.includes("PostToolUse"),
      `the refusal has to show what a name of looper's looks like, or the only repair is guessing: ${answer}`,
    );
  } finally {
    strike(held);
  }
});

test("a rule this project adopted for itself is its own to change", () => {
  const held = scene();
  try {
    const answer = said(held, { kind: "rule", about: "PROJECT-SYMBOL:acmeClient", wrong: "It fired.", instead: "It should not." });

    assert.deepEqual([...written(held)], []);
    assert.ok(answer.includes("this project's own"), answer);
  } finally {
    strike(held);
  }
});

test("a rule on a line carries the shape and nothing from the project", () => {
  const held = scene();
  try {
    said(held, {
      kind: "rule",
      about: "TS-ERROR:3",
      wrong: "The rule fired on a return inside a catch that the caller already observes.",
      instead: "Returning a named case broke the caller.",
      file: "src/billing.ts",
      line: "8",
    });
    const body = onlyReport(held);

    for (const theirs of THEIRS) {
      assert.ok(!body.includes(theirs), `${theirs} reached the report, which people will run on private repositories`);
    }
    assert.ok(body.includes("ReturnStatement"));
    assert.ok(body.includes("about: TS-ERROR:3"));
  } finally {
    strike(held);
  }
});

test("a line that arrives as a number is still a line", () => {
  const held = scene();
  try {
    said(held, {
      kind: "rule",
      about: "TS-ERROR:3",
      wrong: "The rule fired on a return inside a catch.",
      instead: "It should have stayed silent.",
      file: "src/billing.ts",
      line: 8,
    });

    assert.ok(
      onlyReport(held).includes("ReturnStatement"),
      "a model sends a line number as a number, the server kept only text, and the report came out with no shape and no word about why",
    );
  } finally {
    strike(held);
  }
});

test("a rule in a language looper cannot draw still gets a report, which says it has no shape", () => {
  const held = scene();
  try {
    writeFileSync(join(held.root, "src/Ledger.cs"), "class Ledger {\n  void Settle() {\n    try { Run(); } catch { }\n  }\n}\n");
    const answer = said(held, {
      kind: "rule",
      about: "CS-ERROR:1",
      wrong: "The rule fired on a catch that is empty on purpose.",
      instead: "It should have read the line above it.",
      file: "src/Ledger.cs",
      line: "3",
    });

    assert.ok(answer.includes("Written"), `thirteen of ninety rules could not be argued with at all: ${answer}`);
    assert.ok(onlyReport(held).includes("no reader that can draw"));
  } finally {
    strike(held);
  }
});

test("a file outside the project is not read", () => {
  const held = scene();
  try {
    writeFileSync(join(held.home, "outside.ts"), "export const held = 1;\n");
    const answer = said(held, {
      kind: "rule",
      about: "TS-ERROR:3",
      wrong: "It fired.",
      instead: "It should not.",
      file: join(held.home, "outside.ts"),
      line: "1",
    });

    assert.deepEqual([...written(held)], []);
    assert.ok(answer.includes("inside this project"), answer);
  } finally {
    strike(held);
  }
});

test("a file that is not there is said, not thrown", () => {
  const held = scene();
  try {
    const answer = said(held, { kind: "rule", about: "TS-ERROR:3", wrong: "It fired.", instead: "It should not.", file: "src/gone.ts", line: "1" });

    assert.deepEqual([...written(held)], []);
    assert.ok(answer.includes("src/gone.ts"), answer);
  } finally {
    strike(held);
  }
});

test("a name in either sentence refuses the report, and nothing is written", () => {
  const held = scene();
  try {
    const answer = said(held, {
      kind: "rule",
      about: "TS-ERROR:3",
      wrong: "I tried changing acmeBillingGateway to throw.",
      instead: "It should have stayed silent.",
    });

    assert.deepEqual([...written(held)], []);
    assert.ok(answer.includes("acmeBillingGateway"), `the refusal has to name the word, or it cannot be said another way: ${answer}`);
  } finally {
    strike(held);
  }
});

test("a sentence longer than a person will read is refused", () => {
  const held = scene();
  try {
    const answer = said(held, { kind: "failed", about: "PostToolUse", wrong: "It failed. ".repeat(80), instead: "It should not." });

    assert.deepEqual([...written(held)], []);
    assert.ok(answer.includes("600"), answer);
  } finally {
    strike(held);
  }
});

test("a kind looper does not know is refused with the ones it does", () => {
  const held = scene();
  try {
    const answer = said(held, { kind: "annoying", about: "PostToolUse", wrong: "It failed.", instead: "It should not." });

    assert.deepEqual([...written(held)], []);
    for (const kind of ["rule", "missed", "failed", "untrue", "idea"]) assert.ok(answer.includes(kind), answer);
  } finally {
    strike(held);
  }
});

test("the same rule on the same shape is written once, however many times it is found", () => {
  const held = scene();
  try {
    const asked = {
      kind: "rule",
      about: "TS-ERROR:3",
      wrong: "The rule fired on a return inside a catch.",
      instead: "It should have stayed silent.",
      file: "src/billing.ts",
      line: "8",
    };
    said(held, asked);
    const again = said(held, { kind: "rule", about: "TS-ERROR:3", wrong: "Said another way this time.", instead: "Silence.", file: "src/billing.ts", line: "8" });

    assert.equal(written(held).length, 1);
    assert.ok(again.includes("already written"), again);
  } finally {
    strike(held);
  }
});

test("what the person decided is kept, so nobody is asked twice", () => {
  const held = scene();
  try {
    said(held, A_FAILED_HOOK);
    const id = String(written(held)[0]).replace(/\.md$/, "");

    assert.ok(said(held, {}).includes("nobody has said"), "a report nobody answered is still a question");
    assert.ok(said(held, { kept: id }).includes(id));
    const listed = said(held, {});
    assert.ok(listed.includes("kept here"), listed);
    assert.ok(said(held, A_FAILED_HOOK).includes("already written"));
    assert.ok(said(held, { sent: "000000000000" }).includes("no report"), "an id nobody wrote is said, not swallowed");
  } finally {
    strike(held);
  }
});

test("calling it with nothing says so when nothing was written", () => {
  const held = scene();
  try {
    assert.ok(said(held, {}).includes("nothing has been written"));
  } finally {
    strike(held);
  }
});

test("the answer lists the words that are not looper's own, for the person to glance at", () => {
  const held = scene();
  try {
    const answer = said(held, {
      kind: "missed",
      about: "TS-ERROR:3",
      wrong: "The rule stayed silent while an invoice total was replaced by zero.",
      instead: "It should have fired on the replaced total.",
    });

    assert.ok(answer.includes("invoice"), answer);
  } finally {
    strike(held);
  }
});

const NO_EVENTS: readonly HookEvent[] = [];

class Throws implements Capability {
  readonly name = "throws";

  inject(): readonly Injection[] {
    return [];
  }

  hooks(): readonly HookEvent[] {
    return NO_EVENTS;
  }

  onHook(): Outcome {
    return { kind: "pass" };
  }

  tools(): readonly ToolDef[] {
    return [{ name: REPORT_TOOL, description: "throws", inputSchema: { type: "object" } }];
  }

  call(): ToolResult {
    throw new RangeError("the disk is full");
  }
}

test("a tool that throws is an error the caller can read, never the end of the server", () => {
  const result = resultOf([new Throws()], ".", {});
  const content = result["content"];

  assert.equal(result["isError"], true);
  assert.ok(Array.isArray(content));
  const text = String(Object.getOwnPropertyDescriptor(content[0], "text")?.value);
  assert.ok(text.includes("the disk is full"), text);
  assert.ok(text.includes("fault in looper"), `a tool of looper's that fails is the thing most worth reporting: ${text}`);
});
