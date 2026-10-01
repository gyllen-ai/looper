import { test } from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, readFileSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { RELEASE_TOOL, REPORT_TOOL } from "../src/config.ts";
import { homeOf } from "../src/report/origin.ts";
import { pathOf, printOf, reportsIn } from "../src/report/store.ts";
import { A_FAILED_HOOK, ASKS, drafted, saidAs, scene, stateOf, strike, type Scene } from "./report-scene.ts";

function recordIn(held: Scene): string {
  return join(reportsIn(held.root, held.home), "decided.json");
}

function recordedAs(held: Scene, id: string, change: Readonly<Record<string, string>>): void {
  const record: unknown = JSON.parse(readFileSync(recordIn(held), "utf8"));
  const entry = new Map<string, unknown>(Object.entries(Object(Object.getOwnPropertyDescriptor(record, id)?.value)));
  for (const [key, value] of Object.entries(change)) entry.set(key, value);
  const all = new Map<string, unknown>(Object.entries(Object(record)));
  all.set(id, Object.fromEntries(entry));
  writeFileSync(recordIn(held), JSON.stringify(Object.fromEntries(all)));
}

function rewritten(held: Scene, id: string, change: (body: string) => string): string {
  const path = pathOf(held.root, held.home, id);
  const forged = change(readFileSync(path, "utf8"));
  writeFileSync(path, forged);
  return forged;
}

const A_NAMED_ONE = "The hook failed for acmeBillingGateway and nothing was said.";

test("a report and its record rewritten together are still not released, when a word in it would have been refused", () => {
  const held = scene();
  try {
    const report = drafted(held, A_FAILED_HOOK);
    const forged = rewritten(held, report.id, (body) => body.replace(A_FAILED_HOOK.wrong, A_NAMED_ONE));
    const title = `PostToolUse: ${A_NAMED_ONE}`;
    recordedAs(held, report.id, { print: printOf(forged), title });

    const answer = saidAs(held, RELEASE_TOOL, { id: report.id, title }, ASKS);

    assert.equal(
      stateOf(held, report.id),
      "written",
      "the id, the title and the print were all checked against the record beside the report, so one edit of that record satisfied all three and any text at all could leave",
    );
    assert.ok(answer.includes("acmeBillingGateway"), `the refusal names the word, as it would have when the report was written: ${answer}`);
  } finally {
    strike(held);
  }
});

test("nor when something was added to it that is no part of a report", () => {
  const held = scene();
  try {
    const report = drafted(held, A_FAILED_HOOK);
    const forged = rewritten(held, report.id, (body) => `${body}\nthe pass phrase is correct horse battery staple\n`);
    recordedAs(held, report.id, { print: printOf(forged) });

    const answer = saidAs(held, RELEASE_TOOL, { id: report.id, title: report.title }, ASKS);

    assert.equal(stateOf(held, report.id), "written");
    assert.ok(answer.includes("not a report as looper writes one"), answer);
  } finally {
    strike(held);
  }
});

test("the title a person is asked about is the report's own first sentence, whatever the record says", () => {
  const held = scene();
  try {
    const report = drafted(held, A_FAILED_HOOK);
    recordedAs(held, report.id, { title: "PostToolUse: Nothing of note." });

    const answer = saidAs(held, RELEASE_TOOL, { id: report.id, title: "PostToolUse: Nothing of note." }, ASKS);

    assert.equal(stateOf(held, report.id), "written", "the question a person sees has to name the text that would leave");
    assert.ok(answer.includes(report.title), answer);
  } finally {
    strike(held);
  }
});

test("an id that is not an id is refused before any file is looked for", () => {
  const held = scene();
  try {
    drafted(held, A_FAILED_HOOK);

    for (const id of ["../../../../etc/hostname", "__proto__", "0aa20b51770", "0AA20B517706", ""]) {
      const answer = saidAs(held, RELEASE_TOOL, { id, title: "none" }, ASKS);

      assert.ok(answer.includes("released nothing"), answer);
      assert.ok(answer.includes("not the id of a report") || answer.includes("needs its id"), `${JSON.stringify(id)}: ${answer}`);
    }
  } finally {
    strike(held);
  }
});

test("a report the person kept, or one that was sent, is not asked about again", () => {
  const held = scene();
  try {
    const report = drafted(held, A_FAILED_HOOK);

    for (const decided of ["kept", "sent"]) {
      saidAs(held, REPORT_TOOL, { [decided]: report.id }, ASKS);
      const answer = saidAs(held, RELEASE_TOOL, { id: report.id, title: report.title }, ASKS);

      assert.equal(stateOf(held, report.id), decided, `a report that was ${decided} went back to being released, and the agent was told a second time to send it`);
      assert.ok(answer.includes("released nothing"), answer);
    }
  } finally {
    strike(held);
  }
});

test("a report that has become a link to another file is not followed", () => {
  const held = scene();
  try {
    const report = drafted(held, A_FAILED_HOOK);
    const path = pathOf(held.root, held.home, report.id);
    const elsewhere = join(held.home, "elsewhere.md");
    copyFileSync(path, elsewhere);
    unlinkSync(path);
    symlinkSync(elsewhere, path);

    const answer = saidAs(held, RELEASE_TOOL, { id: report.id, title: report.title }, ASKS);

    assert.equal(stateOf(held, report.id), "written", "a link can lead to a file that never ends, and the server answers one thing at a time");
    assert.ok(answer.includes("ordinary file"), answer);
  } finally {
    strike(held);
  }
});

const SPREAD_OVER_LINES = `export const total = add(
  first,
  second,
);
`;

test("every report looper writes can be read back as one, so every one of them can be released", () => {
  const held = scene();
  try {
    writeFileSync(join(held.root, "src/total.ts"), SPREAD_OVER_LINES);
    writeFileSync(join(held.root, "src/Ledger.cs"), "class Ledger {\n  void Settle() {\n    try { Run(); } catch { }\n  }\n}\n");
    const rule = { kind: "rule", about: "TS-ERROR:3", wrong: "The rule fired on a return inside a catch.", instead: "It should have stayed silent." };
    const written: readonly (readonly [string, unknown, string])[] = [
      ["no line", A_FAILED_HOOK, "## What is not here"],
      ["a shape", { ...rule, file: "src/billing.ts", line: "8" }, "## The shape it is about"],
      ["a line that starts no statement", { ...rule, about: "TS-TRUTH:1", file: "src/total.ts", line: "2" }, "starts no statement"],
      ["no reader", { ...rule, about: "CS-ERROR:1", file: "src/Ledger.cs", line: "3" }, "## No shape"],
    ];

    for (const [called, args, mark] of written) {
      const report = drafted(held, args);
      assert.ok(report.answer.includes(mark), `${called}: ${report.answer}`);

      const answer = saidAs(held, RELEASE_TOOL, { id: report.id, title: report.title }, ASKS);

      assert.equal(stateOf(held, report.id), "released", `a report with ${called} could not be read back as looper's own, so it could never leave: ${answer}`);
    }
  } finally {
    strike(held);
  }
});

const NEARLY_NEVER: readonly (readonly [string, string])[] = [
  ["a capital in the word", '[report]\noffer = "Never"\n'],
  ["a list", '[report]\noffer = ["never"]\n'],
  ["no section", 'offer = "never"\n'],
  ["a dotted key", 'report.offer = "never"\n'],
  ["a plural", '[reports]\noffer = "never"\n'],
  ["a capital on the key", '[report]\nOffer = "never"\n'],
  ["a line that cannot be read", "[rules]\ndisabled = oops\n"],
];

test("a switch that is nearly right, or a law.toml that cannot be read, releases nothing and still lets a report be written", () => {
  const home = homeOf(join(import.meta.dirname, ".."));
  assert.equal(home.kind, "named");
  if (home.kind !== "named") return;

  for (const [called, law] of NEARLY_NEVER) {
    const held = scene();
    try {
      writeFileSync(join(held.root, "law.toml"), law);
      const report = drafted(held, A_FAILED_HOOK);

      assert.ok(report.answer.startsWith("Written:"), `with ${called} the report was written and the answer said the tool had done nothing: ${report.answer}`);
      assert.ok(report.answer.includes("stays on this machine"), report.answer);

      const answer = saidAs(held, RELEASE_TOOL, { id: report.id, title: report.title }, ASKS);

      assert.equal(stateOf(held, report.id), "written", `with ${called} the project had plainly said never, and the report was released`);
      assert.ok(answer.includes("law.toml") && !answer.includes(home.address), answer);
    } finally {
      strike(held);
    }
  }
});
