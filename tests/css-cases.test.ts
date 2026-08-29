import { test } from "node:test";
import assert from "node:assert/strict";

import { CSS_CHECKS } from "../src/law/css/checks.ts";
import { CONCEDING_NOTHING } from "../src/law/concessions.ts";
import { CSS_CASES } from "../audit/css-cases.ts";
import { disagreements } from "../audit/judge.ts";

test("every CSS rule does what its own ban text says, in every spelling", () => {
  const said = disagreements(CSS_CASES, CSS_CHECKS, CONCEDING_NOTHING);
  assert.deepEqual(
    said,
    [],
    `${said.length} of ${CSS_CASES.length} CSS cases disagree with their rule`,
  );
});

test("every CSS rule has at least one case written from its ban text", () => {
  const covered = new Set(CSS_CASES.map((held) => held.rule));
  const untested = CSS_CHECKS.map((held) => held.rule.id).filter((id) => !covered.has(id));
  assert.deepEqual(untested, [], "these rules have no case written from their words");
});

test("a case names a file, because the rule that judges it depends on which", () => {
  const nameless = CSS_CASES.filter((held) => held.file === undefined).map((held) => held.name);
  assert.deepEqual(
    nameless,
    [],
    "a CSS case with no file would be judged as a.ts, where every CSS rule is silent and every case would pass for the wrong reason",
  );
});
