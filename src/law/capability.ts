import { NOT_A_WAY_THROUGH, PYTHON_EXTENSION, RUST_EXTENSION, STACK_PATH, whereTheUserLives } from "../config.ts";
import { writeAtomically } from "../atomic.ts";
import { stackOf } from "../stack/read.ts";
import { stackDocument } from "../stack/write.ts";
import { isCsharp, judgeCsharpIn, judgePythonIn, judgeRustIn } from "./readers.ts";
import { CSS_CHECKS } from "./css/checks.ts";
import { variantsIn } from "./copy.ts";
import { isStyling } from "./css/read.ts";
import { rustRuleFor } from "./rust/rules.ts";
import { roleOf, shapeOf } from "./shape.ts";
import { alreadyThereWhenLooperArrived, linesFrom, linesOnDisk } from "./arrival.ts";
import { foundIn, inPlace, lawFor } from "./one-file.ts";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

import { JUDGED_EXTENSIONS, OUTSIDE_THE_LAW } from "../config.ts";
import { SILENT } from "../capability.ts";
import type {
  Capability,
  HookContext,
  HookEvent,
  Injection,
  Outcome,
  ToolCall,
  ToolDef,
  ToolResult,
} from "../capability.ts";
import { changedLines, stagedFiles, stagedText } from "../git.ts";
import { withLock } from "../atomic.ts";
import {
  againstBaseline,
  type Carried,
  linesChangedSince,
  readBaseline,
  countsOf,
  shrinkToward,
  totalIn,
  writeBaseline,
} from "./baseline.ts";
import { surveyProject, underAnotherLaw } from "./project.ts";
import { BASELINE_PATH, BASELINE_PRIORITY } from "../config.ts";
import { aboutToCommit, isBash, targetOf } from "./payload.ts";
import { readConcessions } from "./concessions.ts";
import { judge } from "./engine.ts";
import { formatReport } from "./report.ts";
import { CHECKS, knownRuleIds } from "./checks.ts";
import { misspelledIn } from "./misspelled.ts";
import { checksAdoptedIn } from "./adopted.ts";
import type { Violation } from "./rule.ts";
import { fieldAt, reasonFrom } from "../fields.ts";
import { aCommandIsAboutToRun, whenTheCommandStarted, writtenSince } from "../watching.ts";
import { IF_THE_RULE_IS_WRONG } from "../report/say.ts";

const EVERYTHING: readonly string[] = [];

const LAW_EVENTS: readonly HookEvent[] = [
  "PostToolUse",
  "PreToolUse",
  "PreCommit",
  "Stop",
];

const NO_TOOLS: readonly ToolDef[] = [];

type Judged = { readonly carried: Carried; readonly unjudged: readonly string[] };

function judgeOneFile(root: string, relative: string): Judged {
  const found = foundIn(inPlace(root), relative);
  if (found.violations.length === 0) return { carried: { yours: [], older: [] }, unjudged: found.unjudged };
  const touched = changedLines(root, relative, "commit");
  return {
    carried: againstBaseline(
      readBaseline(root),
      found.violations,
      () => touched,
      alreadyThereWhenLooperArrived(root, linesOnDisk(root)),
    ),
    unjudged: found.unjudged,
  };
}

function notJudged(unjudged: readonly string[]): string {
  if (unjudged.length === 0) return "";
  return `looper: could not judge ${unjudged.join("; ")}, so what is there now was not judged, which is not the same as being clean.`;
}

function andNotJudged(unjudged: readonly string[]): string {
  return unjudged.length === 0 ? "" : `\n\n${notJudged(unjudged)}`;
}

function judgeWhatTheCommandWrote(root: string): Outcome {
  const since = whenTheCommandStarted(root, whereTheUserLives());
  if (since.kind === "no-mark") return { kind: "pass" };
  if (since.kind === "unreadable") {
    return {
      kind: "mention",
      note: `looper: files this command wrote were not judged, because ${since.why}. They are still judged at the commit. Nothing here is a verdict on them.`,
    };
  }

  const written = writtenSince(root, since.at);
  if (written.kind === "cannot-tell") {
    return {
      kind: "mention",
      note: `looper: git could not say which files this command changed (${written.why}), so none of them were judged. They are still judged at the commit.`,
    };
  }

  const yours: Violation[] = [];
  const older: Violation[] = [];
  const unjudged: string[] = [];
  for (const path of written.paths) {
    if (!existsSync(resolve(root, path))) continue;
    if (underAnotherLaw(root, path)) continue;
    const split = judgeOneFile(root, path);
    yours.push(...split.carried.yours);
    older.push(...split.carried.older);
    unjudged.push(...split.unjudged);
  }

  const couldNotStat =
    written.vanished.length === 0
      ? ""
      : `\n\nlooper could not read ${written.vanished.join(", ")}, so those were not judged.`;
  const unread = `${couldNotStat}${andNotJudged(unjudged)}`;

  if (yours.length > 0) {
    return {
      kind: "block",
      reason: `${formatReport(yours, "some-new")}${alsoHere(older)}${unread}\n\n${IF_THE_RULE_IS_WRONG}`,
    };
  }
  if (older.length > 0) {
    const named = [...new Set(older.map((one) => one.file))].join(", ");
    return {
      kind: "mention",
      note: `looper: this command changed ${named}, which still ${older.length === 1 ? "has" : "have"} ${older.length} thing(s) from before looper arrived. Nothing is blocked.${unread}`,
    };
  }
  if (unread.length > 0) return { kind: "mention", note: unread.trim() };
  return { kind: "pass" };
}

function isUnreadableRust(violation: Violation): boolean {
  const known = rustRuleFor("ERROR:9");
  return known.kind === "known" && violation.rule.id === known.rule.id;
}

function wentUnjudged(blinding: readonly string[]): string {
  return [
    `looper: could not judge ${blinding.join("; ")}.`,
    "What was staged there was not judged at all, which is not the same as being clean.",
    "Nothing is blocked. Fix what is named and it can be judged again.",
  ].join(" ");
}

function alsoHere(older: readonly Violation[]): string {
  if (older.length === 0) return "";
  return `\n\nThis file also has ${older.length} thing(s) that were here before looper arrived. They are not blocking you. Fixing one while you are already in the file is the cheapest it will ever be.`;
}

function invitation(file: string, older: readonly Violation[]): string {
  const named = older.map((violation) => `${violation.rule.id} on line ${violation.line}`);
  return `looper: ${file} still has ${older.length} thing(s) from before looper arrived — ${named.join(", ")}. Nothing is blocked. You are already in this file, which is the cheapest moment there will be to fix one.`;
}

export function judgeStaged(root: string): Outcome {
  const staged = stagedFiles(root);
  if (staged.kind === "unavailable") return { kind: "pass" };

  const concessions = readConcessions(root);
  const found: Violation[] = [];

  const judged = staged.paths.filter(
    (path) =>
      JUDGED_EXTENSIONS.some((suffix) => path.endsWith(suffix)) &&
      !OUTSIDE_THE_LAW.some((part) => path.split("/").includes(part)) &&
      !underAnotherLaw(root, path),
  );

  const inPython = judged.filter((path) => path.endsWith(PYTHON_EXTENSION));
  const stagedPython = new Set(inPython);
  const pythonSaid = judgePythonIn(root, inPython.map((path) => resolve(root, path)));
  found.push(...pythonSaid.violations.filter((violation) => stagedPython.has(violation.file)));

  const inCsharp = judged.filter(isCsharp);
  const stagedCsharp = new Set(inCsharp);
  const csharpSaid = judgeCsharpIn(root, inCsharp.map((path) => resolve(root, path)));
  found.push(...csharpSaid.violations.filter((violation) => stagedCsharp.has(violation.file)));

  found.push(...variantsIn(root, judged, concessions));

  const inRust = judged.filter((path) => path.endsWith(RUST_EXTENSION));
  const stagedRust = new Set(inRust);
  const rustSaid = judgeRustIn(root, inRust.map((path) => resolve(root, path)));
  const blinding: string[] = [...rustSaid.unreadable, ...pythonSaid.unreadable, ...csharpSaid.unreadable];
  for (const violation of rustSaid.violations) {
    if (stagedRust.has(violation.file)) {
      found.push(violation);
      continue;
    }
    if (isUnreadableRust(violation)) {
      blinding.push(`${violation.file} (it cannot be read as Rust)`);
    }
  }

  const shape = shapeOf(root);
  const stagedTexts = new Map<string, string>();

  for (const path of judged) {
    const law = lawFor(path);
    const styling = isStyling(path);
    if (law !== "typescript" && !styling) continue;
    const held = stagedText(root, path);
    if (held.kind === "unreadable") continue;
    stagedTexts.set(path, held.text);

    const said = styling
      ? judge(CSS_CHECKS, "fast", { file: path, text: held.text }, concessions).violations
      : judge(
          [...CHECKS, ...checksAdoptedIn(root)],
          "fast",
          { file: path, text: held.text, role: roleOf(shape, path) },
          concessions,
        ).violations;
    found.push(...said);
  }

  const split = againstBaseline(
    readBaseline(root),
    found,
    linesChangedSince(root, "index"),
    alreadyThereWhenLooperArrived(root, linesFrom(stagedTexts, root)),
  );
  if (split.yours.length === 0) {
    if (blinding.length > 0) return { kind: "mention", note: wentUnjudged(blinding) };
    return { kind: "pass" };
  }
  return {
    kind: "block",
    reason: `${formatReport(split.yours, "some-new")}${andNotJudged(blinding)}\nNothing was committed.\n\n${NOT_A_WAY_THROUGH}`,
  };
}

export function writeStackIfAbsent(root: string): string {
  const path = join(root, STACK_PATH);
  if (existsSync(path)) return "";
  writeAtomically(path, stackDocument(stackOf(root), new Date().toISOString().slice(0, 10), root));
  return `looper: wrote ${STACK_PATH}, the record of what this project is built from, measured from what is on disk. Read it — adding a language later is a decision, and that file is where it becomes visible.`;
}

export function shrinkBaseline(root: string): Outcome {
  let said: Outcome = { kind: "pass" };
  const wrote = writeStackIfAbsent(root);

  const lock = withLock(join(root, BASELINE_PATH), () => {
    const recorded = readBaseline(root);
    if (totalIn(recorded) === 0) return;

    const survey = surveyProject(root, "everything", EVERYTHING);
    const shrink = shrinkToward(recorded, countsOf(survey.violations), survey.unreadable);
    if (shrink.kind === "unchanged") return;
    if (shrink.kind === "not-all-read") {
      said = {
        kind: "mention",
        note: `looper: the outstanding-work count was left alone. ${String(shrink.unread.length)} thing(s) could not be read this run, and a file nobody read is not a file with nothing wrong in it: ${shrink.unread.slice(0, UNREAD_NAMED).join("; ")}`,
      };
      return;
    }

    writeBaseline(root, shrink.baseline);
  });

  if (lock.kind === "busy") {
    said = {
      kind: "mention",
      note: `looper: the outstanding-work count was not updated (${lock.why}). Nothing was lost; it updates on the next turn.`,
    };
  }
  if (wrote.length > 0 && said.kind === "pass") return { kind: "mention", note: wrote };
  return said;
}

const UNREAD_NAMED = 3;

const FILES_NAMED_AT_ONCE = 4;

function filesIn(baseline: Baseline): string {
  const named = [...baseline.keys()];
  const shown = named.slice(0, FILES_NAMED_AT_ONCE);
  const rest = named.length - shown.length;
  if (rest <= 0) return shown.join(", ");
  return `${shown.join(", ")} and ${rest} more`;
}

export class Law implements Capability {
  readonly name = "law";

  inject(context: InjectContext): readonly Injection[] {
    const baseline = readBaseline(context.root);
    const outstanding = totalIn(baseline);
    if (outstanding === 0) return SILENT;
    const where = filesIn(baseline);
    return [
      {
        source: "law",
        priority: BASELINE_PRIORITY,
        required: false,
        notice: true,
        text: `looper: ${outstanding} problem(s) were already here before looper arrived, in ${where}. They block nothing, and fixing one while you are already in that file is the cheapest it will ever be.`,
      },
    ];
  }

  hooks(): readonly HookEvent[] {
    return LAW_EVENTS;
  }

  onHook(context: HookContext): Outcome {
    if (context.event === "PreCommit") return judgeStaged(context.root);
    if (context.event === "Stop") return shrinkBaseline(context.root);
    if (context.payload.kind === "none") return { kind: "pass" };
    if (context.event === "PreToolUse") {
      if (isBash(context.payload.text)) {
        aCommandIsAboutToRun(context.root, whereTheUserLives());
      }
      if (!aboutToCommit(context.payload.text)) return { kind: "pass" };
      return judgeStaged(context.root);
    }

    const mistyped = misspelledIn(readConcessions(context.root), knownRuleIds());
    if (mistyped.length > 0) return { kind: "mention", note: mistyped.join("\n") };

    if (isBash(context.payload.text)) {
      return judgeWhatTheCommandWrote(context.root);
    }

    const target = targetOf(context.root, context.payload.text);
    if (target.kind === "none") {
      return {
        kind: "mention",
        note: `looper: this edit was not judged, because ${target.why}. Nothing here is a verdict on it.`,
      };
    }
    if (target.kind !== "judge") return { kind: "pass" };
    if (!existsSync(target.path)) return { kind: "pass" };

    const judged = judgeOneFile(context.root, target.relative);
    const split = judged.carried;
    if (split.yours.length > 0) {
      return {
        kind: "block",
        reason: `${formatReport(split.yours, "some-new")}${alsoHere(split.older)}${andNotJudged(judged.unjudged)}\n\n${IF_THE_RULE_IS_WRONG}`,
      };
    }
    if (split.older.length > 0) {
      return { kind: "mention", note: `${invitation(target.relative, split.older)}${andNotJudged(judged.unjudged)}` };
    }
    if (judged.unjudged.length > 0) return { kind: "mention", note: notJudged(judged.unjudged) };
    return { kind: "pass" };
  }

  tools(): readonly ToolDef[] {
    return NO_TOOLS;
  }

  call(request: ToolCall): ToolResult {
    return { kind: "unknown-tool", asked: request.tool };
  }
}
