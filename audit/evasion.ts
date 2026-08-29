import { CHECKS } from "../src/law/checks.ts";
import { CSS_CHECKS } from "../src/law/css/checks.ts";
import { CONCEDING_NOTHING } from "../src/law/concessions.ts";
import { CASES } from "./cases.ts";
import { COPY_CASES } from "./copy-cases.ts";
import { CSS_CASES } from "./css-cases.ts";
import { disagreements } from "./judge.ts";

const said = [
  ...disagreements(CASES, CHECKS, CONCEDING_NOTHING),
  ...disagreements(CSS_CASES, CSS_CHECKS, CONCEDING_NOTHING),
];
const tried = CASES.length + CSS_CASES.length + COPY_CASES.length;
console.log(said.join("\n"));
console.log(`\n${tried} cases, ${said.length} mismatches (the ${COPY_CASES.length} about copied files need a real directory, so tests/copy.test.ts runs them)`);
