import { test } from "node:test";
import assert from "node:assert/strict";

import { REPORT_CASES } from "../audit/report-cases.ts";
import { looperWords, notLoopers, refusedIn } from "../src/report/words.ts";

const NOBODY: readonly string[] = [];

test("every case about the words of a report agrees with the rule it was written from", () => {
  const ours = looperWords();
  const wrong: string[] = [];

  for (const held of REPORT_CASES) {
    const stopped = refusedIn(held.said, ours, held.theirs).map((one) => one.word);
    const verdict = stopped.length === 0 ? "passes" : "refused";
    if (verdict !== held.expect) {
      wrong.push(`${held.name}: expected ${held.expect}, and it ${verdict} (${stopped.join(", ")})`);
      continue;
    }
    for (const word of held.stops) {
      if (!stopped.includes(word)) wrong.push(`${held.name}: ${word} was not the word it stopped on (${stopped.join(", ")})`);
    }
  }

  assert.deepEqual(wrong, [], `${wrong.length} of ${REPORT_CASES.length} cases disagree:\n${wrong.join("\n")}`);
});

test("a name shaped like code is refused wherever it came from, including one this project never wrote down", () => {
  const stopped = refusedIn("The customer is northwindTraders and the rule fired on their file.", looperWords(), NOBODY);

  assert.deepEqual(
    stopped.map((one) => one.word),
    ["northwindTraders"],
    "the old check asked whether the word was in the project's code, so a customer's name that lived only in a README, a string or somebody's head went straight through. Nothing here reads the project, so there is nothing a name can be missing from",
  );
});

test("a word looper itself uses is never a leak, in any letter case", () => {
  const ours = looperWords();

  assert.deepEqual([...refusedIn("The rule is TS-TRUTH:1 and the TRUTH in it is looper's word.", ours, NOBODY)], []);
  assert.deepEqual(
    [...refusedIn("It names Babel and the Stop hook and README files.", ours, NOBODY)].map((one) => one.word),
    [],
    "looper's own source says babel, Stop and README, so a sentence about looper may say them too: everything that passes this way is already public in looper's own files",
  );
});

test("the refusal says why each word was stopped, so the sentence can be said another way", () => {
  const stopped = refusedIn("It fired in crates/ledger/build.rs for the Contoso importer.", looperWords(), NOBODY);

  assert.equal(stopped.length, 2);
  for (const one of stopped) {
    assert.ok(one.why.length > 0, `${one.word} was stopped and nothing says why, so the only repair left is guessing`);
  }
  assert.notEqual(stopped[0]?.why, stopped[1]?.why, "a path and a name are stopped for different reasons, and the reason is what tells the writer how to reword");
});

test("something written like a credential refuses the report", () => {
  const typed = ["the pass", "word: ", "hunter".repeat(3), " was rejected by the hook"].join("");
  const stopped = refusedIn(typed, looperWords(), NOBODY);

  assert.equal(
    stopped.length,
    1,
    "every word of that sentence is plain lower case, so only the check for what a credential looks like can stop it — and a report is the one file looper writes that is meant to leave the machine",
  );
});

test("the words that are not looper's own are listed for the person to glance at", () => {
  const listed = notLoopers("The rule fired on the invoice ledger while reconciling a tenant.", looperWords());

  assert.ok(
    listed.includes("invoice") && listed.includes("reconciling"),
    `a plain word can still be somebody's name for something, and no check can tell. The person can, in five seconds, if they are shown the words: ${listed.join(", ")}`,
  );
  assert.ok(!listed.includes("rule") && !listed.includes("the"), "looper's own words are not worth anybody's glance");
});

test("looper's own words come from the files it ships, so the list cannot fall behind the code", () => {
  const ours = looperWords();

  for (const word of ["looper", "ts-error:3", "posttooluse", "recall", "observe/logging"]) {
    assert.ok(ours.has(word), `${word} is in looper's own source and is not in the list of its words`);
  }
  assert.ok(!ours.has("acmebillinggateway"), "a word looper never wrote is not one of its words");
});

const SLOWEST_A_SENTENCE_MAY_BE_MS = 1000;

test("no word, however it is written, makes the check take longer than a person would wait", () => {
  const ours = looperWords();
  const awkward = [
    "0007-use-postgres-for-tenant-ledger.md",
    `7${"a".repeat(33)}!x`,
    `9,580${"-word".repeat(9)}.x`,
    `${"a-".repeat(60)}A.b`,
    `${"1.".repeat(80)}x`,
    `${"(".repeat(40)}word${")".repeat(39)}`,
    `${"'".repeat(120)}x${"'".repeat(120)}`,
  ];

  for (const word of awkward) {
    const began = performance.now();
    refusedIn(`The rule fired on ${word} and the code is fine.`, ours, NOBODY);
    const took = performance.now() - began;

    assert.ok(
      took < SLOWEST_A_SENTENCE_MAY_BE_MS,
      `${word} took ${Math.round(took)} ms to judge. One pattern here tried every way of dividing a run of letters, which doubles with each letter: a file name beginning with a number, 39 letters long, held the server past a minute, and the server answers one thing at a time`,
    );
  }
});

test("a word that opens the second of the two sentences opens a sentence", () => {
  const ours = looperWords();

  assert.deepEqual(
    [...refusedIn("Reconciling stopped half way.", ours, NOBODY)],
    [],
    "the two sentences are judged one at a time, so the first word of each may carry the capital every sentence opens with",
  );
  assert.deepEqual(
    refusedIn("It stopped while\nReconciling the totals.", ours, NOBODY).map((one) => one.word),
    ["Reconciling"],
    "a new line is not a new sentence: a name could be carried through on its own line",
  );
});
