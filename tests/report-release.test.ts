import { test } from "node:test";
import assert from "node:assert/strict";
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Client } from "../src/capability.ts";
import { ageOfOurCode } from "../src/code-age.ts";
import { RELEASE_TOOL, REPORT_TOOL } from "../src/config.ts";
import { clientIn, handle, handleFor } from "../src/mcp.ts";
import { registry } from "../src/registry.ts";
import { Report, asksAPerson } from "../src/report/capability.ts";
import { homeOf } from "../src/report/origin.ts";
import { heldIn, pathOf } from "../src/report/store.ts";

const ROOT = join(import.meta.dirname, "..");

const ASKS: Client = { kind: "named", name: "claude-code", version: "2.1.286" };

const A_FAILED_HOOK = {
  kind: "failed",
  about: "PostToolUse",
  wrong: "The hook exited without saying anything and the edit was never judged.",
  instead: "It should have said that the edit was not judged.",
};

type Scene = { readonly root: string; readonly home: string };

function scene(): Scene {
  const root = mkdtempSync(join(tmpdir(), "looper-release-"));
  const home = mkdtempSync(join(tmpdir(), "looper-release-home-"));
  mkdirSync(join(root, "src"), { recursive: true });
  return { root, home };
}

function strike(held: Scene): void {
  rmSync(held.root, { recursive: true, force: true });
  rmSync(held.home, { recursive: true, force: true });
}

function textOf(reply: ReturnType<typeof handle>): string {
  assert.equal(reply.kind, "message");
  if (reply.kind !== "message") throw new Error("unreachable");
  const parsed: unknown = JSON.parse(reply.text);
  const result: unknown = Object.getOwnPropertyDescriptor(parsed, "result")?.value;
  const content: unknown = Object.getOwnPropertyDescriptor(result, "content")?.value;
  assert.ok(Array.isArray(content));
  return String(Object.getOwnPropertyDescriptor(content[0], "text")?.value);
}

function said(held: Scene, tool: string, args: unknown, client: Client): string {
  const line = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: tool, arguments: args } });
  return textOf(handleFor([new Report(held.home)], held.root, line, ageOfOurCode(), client));
}

type Drafted = { readonly id: string; readonly title: string; readonly answer: string };

function drafted(held: Scene): Drafted {
  const answer = said(held, REPORT_TOOL, A_FAILED_HOOK, ASKS);
  const read = heldIn(held.root, held.home);
  assert.equal(read.kind, "read");
  if (read.kind !== "read") throw new Error("unreachable");
  const one = read.held[0];
  assert.ok(one !== undefined);
  return { id: one.id, title: one.title, answer };
}

function stateOf(held: Scene, id: string): string {
  const read = heldIn(held.root, held.home);
  if (read.kind !== "read") return read.why;
  const one = read.held.find((held) => held.id === id);
  return one === undefined ? "gone" : one.state;
}

test("the release tool is marked so that only a person can answer it", () => {
  const line = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" });
  const reply = handle(registry(), ROOT, line, ageOfOurCode());
  assert.equal(reply.kind, "message");
  if (reply.kind !== "message") return;
  const listed: unknown = JSON.parse(reply.text);
  const tools: unknown = Object.getOwnPropertyDescriptor(Object.getOwnPropertyDescriptor(listed, "result")?.value, "tools")?.value;
  assert.ok(Array.isArray(tools));
  const metaOf = (name: string): unknown =>
    Object.getOwnPropertyDescriptor(tools.find((tool) => Object.getOwnPropertyDescriptor(tool, "name")?.value === name), "_meta")?.value;

  assert.deepEqual(
    metaOf(RELEASE_TOOL),
    { "anthropic/requiresUserInteraction": true },
    "this mark is what makes the agent's host put the question to a person on every call, in every permission mode. Without it the yes is a sentence the agent was told to wait for",
  );
  assert.equal(metaOf(REPORT_TOOL), undefined, "writing the file needs nobody's yes: nothing leaves");
});

test("the two lines a person is shown when asked carry the whole question, and speak to them", () => {
  const release = new Report("/nowhere").tools().find((tool) => tool.name === RELEASE_TOOL);
  assert.ok(release !== undefined);
  const shown = release.description.split("\n").slice(0, 2).join(" ");

  for (const said of ["leave this machine", "public", "your name", "Nothing of your project"]) {
    assert.ok(
      shown.includes(said),
      `the prompt shows the first two lines of the description and folds the rest away, and they do not say "${said}": ${shown}`,
    );
  }
  assert.ok(!shown.includes("the person"), "the reader of those two lines is the person, so they are not spoken of in the third person");
});

test("a report that was written and never answered says what to do next, when it is asked for again", () => {
  const held = scene();
  try {
    const report = drafted(held);
    const again = said(held, REPORT_TOOL, A_FAILED_HOOK, ASKS);

    assert.ok(again.includes("already written"), again);
    assert.ok(
      again.includes(`\`${RELEASE_TOOL}\``) && again.includes(report.id),
      `the first session may have ended before anybody was asked, and this answer is all the second one has: ${again}`,
    );

    said(held, REPORT_TOOL, { kept: report.id }, ASKS);
    assert.ok(!said(held, REPORT_TOOL, A_FAILED_HOOK, ASKS).includes(`\`${RELEASE_TOOL}\``), "a report the person kept is not offered again");
  } finally {
    strike(held);
  }
});

test("only a release hands out where looper's makers are", () => {
  const held = scene();
  try {
    const home = homeOf(ROOT);
    assert.equal(home.kind, "named");
    if (home.kind !== "named") return;
    const report = drafted(held);

    assert.ok(!report.answer.includes(home.address), "the address before the yes is an invitation to send before the yes");
    assert.ok(report.answer.includes(`\`${RELEASE_TOOL}\``), report.answer);

    const answer = said(held, RELEASE_TOOL, { id: report.id, title: report.title }, ASKS);
    assert.ok(answer.includes(home.address), answer);
    assert.ok(answer.includes(A_FAILED_HOOK.wrong), "what may leave is the text looper wrote, and the answer carries it");
    assert.equal(stateOf(held, report.id), "released");
  } finally {
    strike(held);
  }
});

test("where looper's makers are is read from looper's own package file, so a fork reports to itself", () => {
  const dir = mkdtempSync(join(tmpdir(), "looper-home-of-"));
  try {
    writeFileSync(join(dir, "package.json"), JSON.stringify({ repository: { type: "git", url: "git+https://code.example/someone/fork.git" } }));
    assert.deepEqual(homeOf(dir), { kind: "named", address: "https://code.example/someone/fork" });

    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "no-repository" }));
    assert.equal(homeOf(dir).kind, "unknown");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a client that would not put the question to a person is refused, and told where the file is", () => {
  const held = scene();
  try {
    const report = drafted(held);
    const home = homeOf(ROOT);
    const refused: readonly Client[] = [
      { kind: "unknown" },
      { kind: "named", name: "claude-code", version: "2.1.198" },
      { kind: "named", name: "some-other-agent", version: "9.0.0" },
    ];

    for (const client of refused) {
      const answer = said(held, RELEASE_TOOL, { id: report.id, title: report.title }, client);

      assert.ok(answer.includes(pathOf(held.root, held.home, report.id)), `the person can still send it by hand, if they are told where it is: ${answer}`);
      assert.ok(home.kind === "named" && !answer.includes(home.address));
      assert.equal(stateOf(held, report.id), "written", `${JSON.stringify(client)} released a report with nobody asked`);
    }
  } finally {
    strike(held);
  }
});

test("which clients ask a person is read from their version as numbers", () => {
  const asks = (version: string): boolean => asksAPerson({ kind: "named", name: "claude-code", version });

  for (const version of ["2.1.199", "2.1.286", "2.2.0", "3.0.0", "2.1.1990", "10.0.0"]) {
    assert.equal(asks(version), true, `${version} honours the mark`);
  }
  for (const version of ["2.1.198", "2.1.99", "2.0.999", "1.9.9", "2.1", "", "next"]) {
    assert.equal(asks(version), false, `${version} would be asked nothing and must not be trusted to ask`);
  }
});

test("a report changed after looper wrote it is not released", () => {
  const held = scene();
  try {
    const report = drafted(held);
    appendFileSync(pathOf(held.root, held.home, report.id), "\nAlso, the Contoso importer is where it happened.\n");

    const answer = said(held, RELEASE_TOOL, { id: report.id, title: report.title }, ASKS);

    assert.equal(stateOf(held, report.id), "written");
    assert.ok(answer.includes("changed"), `the text that was checked is not the text that would leave: ${answer}`);
  } finally {
    strike(held);
  }
});

test("the title has to be the report's own, so the question a person sees names what they are agreeing to", () => {
  const held = scene();
  try {
    const report = drafted(held);
    const answer = said(held, RELEASE_TOOL, { id: report.id, title: "a harmless-sounding title" }, ASKS);

    assert.equal(stateOf(held, report.id), "written");
    assert.ok(answer.includes(report.title), answer);
  } finally {
    strike(held);
  }
});

test("a project that said never releases nothing", () => {
  const held = scene();
  try {
    const report = drafted(held);
    writeFileSync(join(held.root, "law.toml"), '[report]\noffer = "never"\n');

    const answer = said(held, RELEASE_TOOL, { id: report.id, title: report.title }, ASKS);

    assert.equal(stateOf(held, report.id), "written");
    assert.ok(answer.includes("never"), answer);
  } finally {
    strike(held);
  }
});

test("an id nobody wrote is said, not released", () => {
  const held = scene();
  try {
    assert.ok(said(held, RELEASE_TOOL, { id: "000000000000", title: "none" }, ASKS).includes("no report"));
  } finally {
    strike(held);
  }
});

test("the client is whoever introduced itself when the server started", () => {
  const hello = JSON.stringify({
    jsonrpc: "2.0",
    id: 0,
    method: "initialize",
    params: { protocolVersion: "2025-11-25", clientInfo: { name: "claude-code", title: "Claude Code", version: "2.1.286" } },
  });

  assert.deepEqual(clientIn(hello), ASKS);
  assert.deepEqual(clientIn(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" })), { kind: "unknown" });
  assert.equal(clientIn("{ not json").kind, "unreadable");
});

test("what a report says is not here is still true once it can be released", () => {
  const held = scene();
  try {
    const report = drafted(held);
    const body = readFileSync(pathOf(held.root, held.home, report.id), "utf8");

    assert.ok(body.includes("looper cannot send it"));
  } finally {
    strike(held);
  }
});
