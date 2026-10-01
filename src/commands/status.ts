import type { Out } from "../out.ts";
import { DEV, INJECTION_BUDGET, namedProject, projectRoot, searchPath, whereTheUserLives, type Invocation } from "../config.ts";
import { NO_SESSION_EVER, lastRun, noteRun, sayWhenHooksRan, worthSayingAtCommit } from "../seen.ts";
import { AFTER_INIT, USAGE, costLines, describeStep, mapComplaints, oversizedComplaints } from "../announce.ts";
import { totalIn, readBaseline } from "../law/baseline.ts";
import { surveyProject } from "../law/project.ts";
import { here, allocationFor } from "../session.ts";
import { NO_TURN, type Turn } from "../capability.ts";
import { looperRoot } from "../law/readers.ts";
import { originOf } from "../report/origin.ts";

const NOTHING_NAMED: readonly string[] = [];

function hookLines(): readonly string[] {
  const said = sayWhenHooksRan(lastRun(here(), whereTheUserLives()));
  return said.map((line, at) =>
    at === 0 ? `  hooks              ${line}` : `                     ${line}`,
  );
}

export function status(out: Out, paths: readonly string[]): number {
  const asked: Turn =
    paths.length === 0
      ? NO_TURN
      : { session: { kind: "unknown" }, prompt: "", inHand: { kind: "given", paths } };
  const allocation = allocationFor(out, asked);
  const outstanding = totalIn(readBaseline(here()));
  const rooted = projectRoot(process.cwd(), namedProject());
  const lines = [
    `looper status`,
    `  running            ${originOf(looperRoot())}`,
    `  project            ${rooted.root}`,
    `                     chosen by ${rooted.how}`,
    ...hookLines(),
    `  injection budget   ${INJECTION_BUDGET} chars`,
    ...(paths.length === 0
      ? [`  used this turn     ${allocation.chars} chars`]
      : [`  if in hand         ${paths.join(", ")}`, `  a turn would cost  ${allocation.chars} chars`]),
    `  contributors`,
    ...costLines(here(), allocation.weighed),
    `  dropped            ${describeList(allocation.dropped.map((one) => `${one.source} (${one.chars})`))}`,
    `  left to fix        ${outstanding === 0 ? "nothing" : `${outstanding} from before looper arrived`}`,
  ];
  const governed = surveyProject(here(), "everything", NOTHING_NAMED).selfGoverned;
  if (governed.length > 0) {
    lines.push(`  governs itself`);
    for (const held of governed) {
      lines.push(`    ${held.where} — ${held.why}, ${held.files} file(s) not judged here`);
    }
  }
  const unheard = [...mapComplaints(here()), ...oversizedComplaints(here())];
  if (unheard.length > 0) {
    lines.push(`  rule sets that will never arrive`, ...unheard);
  }
  if (allocation.overflowed) {
    lines.push(
      `  the first contributor alone is over budget, so it was kept and the ceiling exceeded`,
    );
  }
  out.say(lines.join("\n"));
  return 0;
}

function describeList(items: readonly string[]): string {
  if (items.length === 0) return "(none)";
  return items.join(", ");
}
