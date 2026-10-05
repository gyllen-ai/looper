import type { Out } from "../out.ts";
import {
  adoptedButUnrecorded,
  againstBaseline,
  isRecorded,
  linesChangedSinceHead,
  readBaseline,
} from "../law/baseline.ts";
import { alreadyThereWhenLooperArrived, linesOnDisk } from "../law/arrival.ts";
import { formatReport } from "../law/report.ts";
import { surveyProject } from "../law/project.ts";
import { misspelledIn } from "../law/misspelled.ts";
import { readConcessions } from "../law/concessions.ts";
import { knownRuleIds } from "../law/checks.ts";
import { here } from "../session.ts";

export function law(asked: readonly string[], out: Out): number {
  for (const said of misspelledIn(readConcessions(here()), knownRuleIds())) {
    out.warn(said);
  }
  if (adoptedButUnrecorded(here())) {
    out.warn(
      [
        "looper: this project has looper's doctrine but no .looper/baseline.toml.",
        "Everything below is read as new, including anything that was here before",
        "looper arrived. If you cloned this project, that file was never committed —",
        "it belongs in the repository, or every person who checks the project out is",
        "handed somebody else's older problems as their own.",
      ].join("\n"),
    );
  }
  const survey = surveyProject(here(), "everything", asked);
  if (survey.couldNotSkipIgnored.length > 0) {
    out.warn(
      `looper: git could not say which files are ignored (${survey.couldNotSkipIgnored}), so generated files your .gitignore names were judged too. The count below is over more files than the baseline was built from.`,
    );
  }
  for (const named of survey.unreadable) {
    out.warn(`looper: could not judge ${named}.`);
  }
  for (const held of survey.selfGoverned) {
    out.warn(
      `looper: ${held.where} governs itself (${held.why}), so its ${held.files} file(s) were not judged here`,
    );
  }
  if (survey.files === 0) {
    out.say(
      [
        "looper: there is nothing here the law can read.",
        "The law covers TypeScript and Rust. This is not a clean bill of health for",
        "the rest — the secrets gate, the rule sets and the staleness check all still",
        "apply to every file, and they are where looper earns its place in a project",
        "like this one.",
      ].join("\n"),
    );
    return 0;
  }
  if (survey.violations.length === 0) {
    if (survey.unreadable.length > 0) {
      out.say(
        `looper: ${survey.files} files, and nothing to fix in the ones it could read. ${survey.unjudged} could not be read, named above — those were not judged at all, which is not the same as being clean.`,
      );
      return 0;
    }
    out.say(`looper: ${survey.files} files, nothing to fix.`);
    return 0;
  }
  const baseline = readBaseline(here());
  const carried = againstBaseline(
    baseline,
    survey.violations,
    linesChangedSinceHead(here()),
    alreadyThereWhenLooperArrived(here(), linesOnDisk(here())),
  );
  const older = carried.older.length;
  const yours = carried.yours.length;
  const recorded = carried.older.filter((one) => isRecorded(baseline, one.file, one.rule.id)).length;
  out.say(formatReport(survey.violations, yours === 0 ? "all-older" : "some-new"));
  if (older > 0) {
    out.say(alreadyHere(older, recorded, yours));
  }
  if (survey.unjudged > 0) {
    out.say(couldNotBeRead(survey.unjudged, survey.judged));
  }
  return yours === 0 ? 0 : 2;
}

function couldNotBeRead(unjudged: number, judged: number): string {
  const one = unjudged === 1;
  return [
    `A further ${unjudged} file(s) could not be read at all and ${one ? "was" : "were"} not judged,`,
    `named above. The count above is over the ${judged} that could be. A file nobody could`,
    `read produces exactly what a clean file produces, so read this number before you`,
    `trust that one.`,
  ].join(" ");
}

function whereItIsKnown(older: number, recorded: number): string {
  if (recorded === older) return `, and ${older === 1 ? "is" : "are"} recorded in .looper/baseline.toml.`;
  const found = older - recorded;
  return `: ${recorded} recorded in .looper/baseline.toml, and ${found} it does not list that ${found === 1 ? "was" : "were"} already in the code when looper arrived.`;
}

function alreadyHere(older: number, recorded: number, yours: number): string {
  const was = older === 1 ? "was" : "were";
  const all = yours === 0 ? "All " : "";
  return [
    `${all}${older} of these ${was} already here before looper arrived${whereItIsKnown(older, recorded)}`,
    `${older === 1 ? "It does" : "They do"} not block a commit until you touch the line ${older === 1 ? "it is" : "they are"} on.`,
    yours === 0
      ? "Fix them when you are next in that file."
      : `The other ${yours} ${yours === 1 ? "is new and is" : "are new and are"} blocking.`,
  ].join(" ");
}
