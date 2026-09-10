import { relative } from "node:path";

import { AGENT_DIR, MAP_PATH } from "./config.ts";
import { canonBranch } from "./canon.ts";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { listBranches, readProjectBranch } from "./doctrine.ts";
import { lineFor, sizeOfTree } from "./size.ts";
import { trackedFiles } from "./git.ts";
import { branchLinesOutsideASection, matches, readMap, unheardIn } from "./map.ts";
import type { Weighed } from "./allocator.ts";
import type { Step } from "./init.ts";

const DOCTRINE_PREFIX = "doctrine:";

export const USAGE: readonly string[] = [
  "looper",
  "  looper init [--dev]     wire looper into this project",
  "  looper inject           the per-prompt injection hook",
  "  looper hook <event>     dispatch an agent hook",
  "  looper status           what looper injects, and what it costs per turn",
  "  looper serve            the MCP server, on stdin and stdout",
  "  looper law [path...]    judge every file, or only what is under these paths",
  "  looper loop [--terse]   run this project's checks, one verdict each",
  "  looper align            judge every captured page: does every line connect",
  "  looper look             judge every captured page: does one kind wear one look",
  "  looper adopt            propose a rule this project should follow",
  "  looper report           say a looper rule is wrong, without sending anything",
];

export const AFTER_INIT: readonly string[] = [
  "  If an agent session is already open in this project, restart it. The hooks",
  "  above were written just now, and a session that started before that does not",
  "  have them: it will look completely normal and check nothing at all.",
  "  From the next session on, looper's own rules are in force.",
  "  .looper/doctrine/constitution.md is empty and costs nothing until you write a",
  "  line; read the README beside it to see what belongs there.",
  "  Commit .looper/baseline.toml with everything else. It records what this",
  "  project owed before looper arrived, and it only ever gets shorter. Left out,",
  "  every colleague who clones this project is handed those problems as their own.",
];

export function describeStep(step: Step): readonly string[] {
  if (step.kind === "created") {
    return [
      `  created  ${step.path}`,
      ...step.wired.map((command) => `             wired  ${command}`),
    ];
  }
  if (step.kind === "merged") {
    const backup =
      step.backup.kind === "kept"
        ? [`             your previous version is kept at ${step.backup.path}`]
        : [];
    const replaced = step.rewired.map(
      (command) => `             replaced an older looper hook: ${command}`,
    );
    const said =
      step.rewired.length === 0
        ? `  merged   ${step.path} (everything already in it was left alone)`
        : `  merged   ${step.path} (looper's own hooks were rewired; everything else was left alone)`;
    return [
      said,
      ...step.wired.map((command) => `             wired  ${command}`),
      ...replaced,
      ...backup,
    ];
  }
  if (step.kind === "mcp-corrected") {
    const backup =
      step.backup.kind === "kept"
        ? [`             your previous version is kept at ${step.backup.path}`]
        : [];
    return [
      `  corrected  ${step.path} (looper's own entry only, everything else left alone)`,
      step.was.kind === "read"
        ? `             it was launching  ${step.was.line}`
        : `             its entry could not be read as a launch`,
      `             it now launches   ${step.now}`,
      ...backup,
    ];
  }
  if (step.kind === "gate-wired") return [`  created  ${step.path}`];
  if (step.kind === "gate-already") {
    return [`  the ${step.hook} check was already in place`];
  }
  if (step.kind === "gate-yours") {
    return [
      `  you already have your own ${step.path}, which was left alone.`,
      `           That check is NOT running until you add this line to it:`,
      `             ${step.line}`,
    ];
  }
  if (step.kind === "gate-impossible") {
    return [`  no ${step.hook} check: ${step.why}`];
  }
  if (step.kind === "surveyed-clean") {
    return [`  read every file (${step.files}) and found nothing to fix.`];
  }
  if (step.kind === "surveyed") {
    return [
      `  read every file (${step.files}) and found ${step.outstanding} things worth fixing.`,
      `           They are listed in ${step.path} as work outstanding, not as`,
      `           exceptions. Nothing is blocked because of them: looper refuses`,
      `           only new problems, and problems on a line you touch, so the list`,
      `           gets shorter wherever anyone works. Run \`looper law\` to read it.`,
    ];
  }
  if (step.kind === "mcp-unreadable") {
    return [
      `  ${step.path} could not be read (${step.why}), so it was left exactly as it is.`,
      `           looper's tools are NOT available until this block is in it:`,
      ...step.block.split("\n").map((line) => `             ${line}`),
    ];
  }
  if (step.kind === "outer-agent-project") {
    return [
      `  ${step.path} has its own ${AGENT_DIR} folder, so an agent has been`,
      `           started there. An agent reads its hooks from the folder it starts in,`,
      `           so a session started there will not see any of the above and will`,
      `           check nothing, with nothing to show that it is not checking.`,
      `           Start the agent in this folder, or run looper init in that one.`,
    ];
  }
  if (step.kind === "entry-unreachable") {
    return [
      `  the hooks are written and the command they run cannot be found: ${step.what}.`,
      `           Nothing is being checked until that resolves. Install looper in`,
      `           this project (npm install --save-dev github:gyllen-ai/looper)`,
      `           and run looper init again.`,
    ];
  }
  if (step.kind === "scaffolded") return [`  created  ${step.path}`];
  if (step.kind === "yours-already") {
    return [`  yours already, left alone  ${step.path}`];
  }
  return [`  already wired, nothing to change  ${step.path}`];
}


export function halvesOf(root: string, source: string): string {
  if (!source.startsWith(DOCTRINE_PREFIX)) return "";
  const name = source.slice(DOCTRINE_PREFIX.length);
  const canon = canonBranch(name);
  const mine = readProjectBranch(root, name);
  const ours = canon.kind === "found" ? canon.body.length : 0;
  const yours = mine.kind === "present" ? mine.text.length : 0;
  if (yours === 0) return "   all of it looper's";
  if (ours === 0) return "   all of it yours";
  return `   looper ${ours}, yours ${yours}`;
}


export function costLines(root: string, weighed: readonly Weighed[]): readonly string[] {
  return weighed.map(
    (held) =>
      `    ${String(held.chars).padStart(6)}  ${held.source}${halvesOf(root, held.source)}${held.notice ? "   a notice, said once per session" : ""}`,
  );
}


function strayBranchLines(root: string): readonly string[] {
  const path = join(root, MAP_PATH);
  if (!existsSync(path)) return [];
  const stray = branchLinesOutsideASection(readFileSync(path, "utf8"));
  if (stray.length === 0) return [];
  return [
    `  ${MAP_PATH} has ${stray.length} branch line(s) above any section, so none of them is read:`,
    ...stray.map((line) => `    ${line}`),
    `    a branch belongs under [governs], or under [freshness] to say when it goes stale`,
  ];
}

export function oversizedComplaints(root: string): readonly string[] {
  const grown = sizeOfTree(root);
  if (grown.length === 0) return [];
  return [
    `  ${grown.length} place(s) where a rule set grew past what a turn can carry; the commit gate refuses each:`,
    ...grown.map((one) => `  ${lineFor(one)}`),
  ];
}

export function mapComplaints(root: string): readonly string[] {
  const map = readMap(root);
  if (map.kind === "absent") return [];
  const stray = strayBranchLines(root);
  if (stray.length > 0) return stray;
  const tracked = trackedFiles(root);
  const files = tracked.kind === "unavailable" ? [] : tracked.paths;
  const said = unheardIn(map.governs, listBranches(root), (globs) =>
    files.length === 0 || files.some((file) => globs.some((glob) => matches(glob, file))),
  );
  return said.map((held) => `  ${held.branch} governs nothing that arrives: ${held.why}`);
}
