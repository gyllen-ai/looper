import { parseToml, stringsAt, tableIn } from "../src/toml.ts";
import { judgedFiles, surveyProject } from "../src/law/project.ts";

const EVERYTHING: readonly string[] = [];
import { test } from "node:test";
import assert from "node:assert/strict";

import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CHECKS as EVERY_RULE } from "../src/law/checks.ts";
import { parsesSoFar } from "../src/law/ts/parse.ts";
import { CONCEDING_NOTHING, standingOf } from "../src/law/concessions.ts";
import { codeColourCheck } from "../src/law/ts/code-colour.ts";
import { judge, onlyForPass, type Check } from "../src/law/engine.ts";
import { formatReport } from "../src/law/report.ts";
import { RuleOnTheWrongPass } from "../src/errors.ts";
import type { Rule } from "../src/law/rule.ts";

const SWALLOWED: Rule = {
  id: "TS-ERROR:3",
  category: "ERROR",
  pass: "fast",
  bans: "answering a failure with a made-up value, like `catch { return null }`",
  why: "the made-up value cannot be told from a real one a line later, so a broken call becomes a wrong answer far from its cause",
  instead: [
    "throw new NotFound(id)",
    "if (row === undefined) throw new NotFound(id)",
  ],
  valve: { kind: "none" },
};

const TOO_LONG: Rule = {
  id: "TS-DECOMPOSITION:1",
  category: "DECOMPOSITION",
  pass: "fast",
  bans: "a file longer than the line cap",
  why: "a file that outgrew one job is hiding the second one",
  instead: ["move a group of related things into their own file and import it back"],
  valve: { kind: "knob", key: "max_loc", note: "the cap, counted in lines" },
};

const swallowCheck: Check = {
  rule: SWALLOWED,
  run(subject) {
    const found = [];
    let line = 0;
    for (const text of subject.text.split("\n")) {
      line += 1;
      if (text.includes("return null")) found.push({ line });
    }
    return found;
  },
};

const lengthCheck: Check = {
  rule: TOO_LONG,
  run(subject, concessions) {
    if (subject.text.split("\n").length <= concessions.maxLoc) return [];
    return [{ line: 0 }];
  },
};

const CHECKS: readonly Check[] = [swallowCheck, lengthCheck];

const GUILTY = {
  file: "src/user.ts",
  text: "function find(id) {\n  try { return db.get(id) } catch { return null }\n}\n",
};

test("a rule fires on a fixture file and names the line", () => {
  const verdict = judge(CHECKS, "fast", GUILTY, CONCEDING_NOTHING);

  assert.equal(verdict.violations.length, 1);
  assert.equal(verdict.violations[0]?.rule.id, "TS-ERROR:3");
  assert.equal(verdict.violations[0]?.line, 2);
});

test("the report carries everything needed to fix it without another document", () => {
  const report = formatReport(judge(CHECKS, "fast", GUILTY, CONCEDING_NOTHING).violations, "some-new");

  assert.ok(report.includes("TS-ERROR:3"), "the rule id");
  assert.ok(report.includes("src/user.ts:2"), "where it is");
  assert.ok(report.includes("not allowed:"), "what is banned");
  assert.ok(report.includes("why:"), "why the rule exists");
  assert.ok(report.includes("throw new NotFound(id)"), "a legal spelling, as code");
  assert.ok(report.includes("--- ERROR ---"), "the category and its spirit");
});

test("a rule with a valve prints where to argue with it", () => {
  const long = { file: "src/big.ts", text: "x\n".repeat(600) };
  const report = formatReport(judge(CHECKS, "fast", long, CONCEDING_NOTHING).violations, "some-new");

  assert.ok(report.includes("law.toml max_loc"));
  assert.ok(report.includes("(the whole file)"));
});

test("deleting law.toml changes no verdict", () => {
  const withFile = judge(CHECKS, "fast", GUILTY, {
    maxLoc: 500,
    disabled: [],
    pardons: new Map(),
  });
  const without = judge(CHECKS, "fast", GUILTY, CONCEDING_NOTHING);

  assert.deepEqual(
    withFile.violations.map((violation) => violation.rule.id),
    without.violations.map((violation) => violation.rule.id),
  );
});

test("a pardon covers one named file and says so, never silently", () => {
  const pardoned = judge(CHECKS, "fast", GUILTY, {
    ...CONCEDING_NOTHING,
    pardons: new Map([["src/user.ts", ["TS-ERROR:3"]]]),
  });

  assert.deepEqual([...pardoned.violations], []);
  assert.deepEqual([...pardoned.conceded], ["TS-ERROR:3 (pardoned)"]);
});

test("a pardon on one file does not reach another", () => {
  const elsewhere = judge(
    CHECKS,
    "fast",
    { file: "src/other.ts", text: GUILTY.text },
    { ...CONCEDING_NOTHING, pardons: new Map([["src/user.ts", ["TS-ERROR:3"]]]) },
  );

  assert.equal(elsewhere.violations.length, 1);
});

test("disabling is the widest concession and is reported as itself", () => {
  const off = judge(CHECKS, "fast", GUILTY, {
    ...CONCEDING_NOTHING,
    disabled: ["TS-ERROR:3"],
  });

  assert.deepEqual([...off.violations], []);
  assert.deepEqual([...off.conceded], ["TS-ERROR:3 (disabled)"]);
});

test("ALL pardons every rule in the named file", () => {
  const generated = judge(CHECKS, "fast", GUILTY, {
    ...CONCEDING_NOTHING,
    pardons: new Map([["src/user.ts", ["ALL"]]]),
  });

  assert.deepEqual([...generated.violations], []);
});

test("standing is a value, so the three grades never blur", () => {
  assert.equal(standingOf(CONCEDING_NOTHING, "a.ts", "X:1").kind, "stands");
  assert.equal(
    standingOf({ ...CONCEDING_NOTHING, disabled: ["X:1"] }, "a.ts", "X:1").kind,
    "disabled",
  );
});

test("a rule never runs on the pass it does not belong to", () => {
  const slowOnly: Check = {
    rule: { ...SWALLOWED, id: "TS-ERROR:1", pass: "slow" },
    run: () => [{ line: 1 }],
  };

  assert.deepEqual([...judge([slowOnly], "fast", GUILTY, CONCEDING_NOTHING).violations], []);
  assert.equal(judge([slowOnly], "slow", GUILTY, CONCEDING_NOTHING).violations.length, 1);
  assert.equal(onlyForPass([slowOnly, swallowCheck], "fast").length, 1);
});



test("a rule that declares no real pass is refused, not guessed at", () => {
  const nonsense: Check = {
    rule: { ...SWALLOWED, pass: "whenever" as "fast" },
    run: () => [],
  };

  assert.throws(() => onlyForPass([nonsense], "fast"), RuleOnTheWrongPass);
});

test("the whole rule set parses each file once, not once per rule", () => {
  const text = readFileSync(join(import.meta.dirname, "..", "src/main.ts"), "utf8");

  const before = parsesSoFar();
  judge(EVERY_RULE, "fast", { file: "counted.ts", text }, CONCEDING_NOTHING);
  const parses = parsesSoFar() - before;

  assert.equal(
    parses,
    1,
    `${EVERY_RULE.length} rules caused ${parses} parses of one file. Parsing is the whole cost of judging, so one parse per rule makes the cost grow with every rule added instead of staying flat.`,
  );
});

test("a list written across several lines is a list, and a trailing comma is not an item", () => {
  const document = parseToml(
    ['[deputies]', 'attrs = [', '  "unused_must_use",  # a fallible dropped', '  "dead_code",', ']', ''].join("\n"),
    "law.toml",
  );
  assert.deepEqual([...stringsAt(tableIn(document, "deputies"), "attrs", "law.toml")], [
    "unused_must_use",
    "dead_code",
  ]);
});

test("a project with nothing the law can read is told that, not told it is clean", () => {
  const root = mkdtempSync(join(tmpdir(), "looper-nolang-"));
  try {
    writeFileSync(join(root, "README.md"), "# infra\n");
    const survey = surveyProject(root, "everything", EVERYTHING);
    assert.equal(survey.files, 0);
    assert.deepEqual([...survey.violations], []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

const SWALLOWS = "export function f() {\n  try { g() } catch { return null }\n}\n";

function projectHolding(where: string, marker: string): string {
  const root = mkdtempSync(join(tmpdir(), "looper-elsewhere-"));
  mkdirSync(join(root, where, "src"), { recursive: true });
  writeFileSync(join(root, where, "src/theirs.ts"), SWALLOWS);
  writeFileSync(join(root, where, marker), marker.endsWith(".toml") ? "max_loc = 400\n" : "");
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src/ours.ts"), "export const a = 1;\n");
  return root;
}

test("a directory with its own law.toml is judged by that law, not by this project's", () => {
  const root = projectHolding("tools/looper", "law.toml");
  try {
    const survey = surveyProject(root, "everything", EVERYTHING);

    assert.deepEqual(
      survey.violations.map((held) => held.file),
      [],
      "a checkout inside the project was judged under its host's law. `looper law` then exits 2 forever over somebody else's code, and a gate that can never pass is one people learn to skip.",
    );
    assert.ok(
      !judgedFiles(root).some((path) => path.includes("tools")),
      "the walk went into a tree that governs itself",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an empty law.toml is not a licence to stop being judged", () => {
  const root = mkdtempSync(join(tmpdir(), "looper-empty-law-"));
  try {
    mkdirSync(join(root, "src", "legacy"), { recursive: true });
    writeFileSync(join(root, "src/legacy/b.ts"), SWALLOWS);
    writeFileSync(join(root, "src/legacy/law.toml"), "");

    const survey = surveyProject(root, "everything", EVERYTHING);

    assert.ok(
      survey.violations.length > 0,
      "one `touch law.toml` removed a whole directory from the law — every rule, every file, forever — which is broader than the three graded concessions and the quietest thing anybody can write",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a directory that really governs itself is named, not silently skipped", () => {
  const root = mkdtempSync(join(tmpdir(), "looper-named-law-"));
  try {
    mkdirSync(join(root, "src", "legacy"), { recursive: true });
    writeFileSync(join(root, "src/legacy/b.ts"), SWALLOWS);
    writeFileSync(join(root, "src/legacy/law.toml"), "max_loc = 400\n");

    const survey = surveyProject(root, "everything", EVERYTHING);

    assert.deepEqual(survey.violations.map((held) => held.file), []);
    assert.deepEqual(
      survey.selfGoverned.map((held) => `${held.where} (${held.files})`),
      ["src/legacy (1)"],
      "self-governed and unjudged are indistinguishable from outside unless the tool says which is which",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a submodule is left to its own law even when it has no law.toml", () => {
  const root = projectHolding("libs/theirs", "README.md");
  try {
    writeFileSync(
      join(root, ".gitmodules"),
      '[submodule "libs/theirs"]\n\tpath = libs/theirs\n\turl = https://example.invalid/theirs.git\n',
    );

    assert.deepEqual(
      surveyProject(root, "everything", EVERYTHING).violations.map((held) => held.file),
      [],
      "somebody else's repository, checked out inside this one, is not this project's code to judge",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a directory that is another name for one already read does not loop forever", () => {
  const root = mkdtempSync(join(tmpdir(), "looper-loop-"));
  try {
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src/a.ts"), "export const a = 1;\n");
    symlinkSync(".", join(root, "src", "loop"), "dir");

    const survey = surveyProject(root, "everything", EVERYTHING);

    assert.equal(survey.files, 1);
    assert.ok(
      survey.unreadable.some((said) => said.includes("already read")),
      "a symlink loop must be named and stepped over. One `ln -s . src/loop` used to end looper law and looper init in a raw Node stack trace, on the day somebody first meets the tool.",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a Python virtualenv is not walked, and says nothing about the aliases inside it", () => {
  const root = mkdtempSync(join(tmpdir(), "looper-venv-"));
  try {
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src/a.ts"), "export const a = 1;\n");
    const asEveryVenvOnLinuxIsBuilt = { lib: "lib", anotherNameForIt: "lib64" };
    mkdirSync(join(root, ".venv", asEveryVenvOnLinuxIsBuilt.lib), { recursive: true });
    symlinkSync(
      asEveryVenvOnLinuxIsBuilt.lib,
      join(root, ".venv", asEveryVenvOnLinuxIsBuilt.anotherNameForIt),
      "dir",
    );
    writeFileSync(join(root, ".venv", "lib", "vendored.ts"), "export const v = 1;\n");

    const survey = surveyProject(root, "everything", EVERYTHING);

    assert.equal(survey.files, 1, "a dependency directory nobody wrote was judged as this project's code");
    assert.deepEqual(
      survey.unreadable,
      [],
      "a venv's lib64 was announced as unread on every run. It cannot be acted on — the person did not write that directory and cannot change it — and the words were untrue as well: lib was read, and the files in it judged, under its real name.",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a file that points out of the project is not judged, and says so", () => {
  const root = mkdtempSync(join(tmpdir(), "looper-outside-"));
  const elsewhere = mkdtempSync(join(tmpdir(), "looper-elsewhere-"));
  try {
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(elsewhere, "theirs.ts"), SWALLOWS);
    symlinkSync(join(elsewhere, "theirs.ts"), join(root, "src", "linked.ts"));

    const survey = surveyProject(root, "everything", EVERYTHING);

    assert.deepEqual(
      survey.violations.map((held) => held.file),
      [],
      "a link out of the tree was followed and somebody else's file was judged as this project's",
    );
    assert.ok(survey.unreadable.some((said) => said.includes("outside this project")));
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(elsewhere, { recursive: true, force: true });
  }
});

test("a colour in the file the palette names is the palette, in TypeScript too", () => {
  const theme = { file: "src/theme.ts", text: `export const INK = "#f1ece4";` };
  const copy = { file: "src/paint.ts", text: `export const INK = "#f1ece4";` };
  const naming = { ...CONCEDING_NOTHING, palette: ["src/theme.ts"] };
  assert.deepEqual([...judge([codeColourCheck], "fast", theme, naming).violations], []);
  assert.equal(judge([codeColourCheck], "fast", copy, naming).violations.length, 1);
});
