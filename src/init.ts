import { CONSTITUTION_STUB, DOCTRINE_README_STUB, MAP_STUB, SECRETS_ALLOW_STUB,
  LAW_STUB } from "./stubs.ts";
import { chmodSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";

import { writeAtomically, writeKeepingPrior, type Backup } from "./atomic.ts";
import { readOrdinary, readOrdinaryOrSay } from "./ordinary.ts";
import {
  AGENT_DIR,
  whereTheUserLives,
  DEV,
  DEV_ENTRY,
  INSTALLED,
  LOCAL,
  LOOPER_COMMAND,
  SHIM,
  inside,
  launchFor,
  scriptUnder,
  LOCAL_BIN,
  CONSTITUTION_PATH,
  DOCTRINE_README_PATH,
  MAP_PATH,
  MCP_PATH,
  SECRETS_ALLOW_PATH,
  mcpStub,
  SETTINGS_PATH,
  type Invocation,
} from "./config.ts";
import { looperHooks } from "./wiring/hooks.ts";
import { hooksDirectory } from "./git.ts";
import {
  COMMIT_MSG,
  HOOK_MARKER,
  MESSAGE_MARKER,
  PRE_COMMIT,
  commitMessageScript,
  gitHookEntryFor,
  preCommitScript,
} from "./config.ts";
import { countsOf, totalIn, writeBaseline } from "./law/baseline.ts";
import { surveyProject } from "./law/project.ts";
import {
  BASELINE_PATH,
  LAW_PATH,
  STACK_PATH,
} from "./config.ts";
import { stackOf } from "./stack/read.ts";
import { stackDocument } from "./stack/write.ts";
import { mergeMcp, mergeSettings } from "./settings.ts";
import type { WrittenLaunch } from "./settings.ts";
import type { Existing, Moved } from "./types.ts";

const EVERYTHING: readonly string[] = [];

export type Step =
  | {
      readonly kind: "created";
      readonly path: string;
      readonly wired: readonly string[];
    }
  | {
      readonly kind: "merged";
      readonly path: string;
      readonly wired: readonly string[];
      readonly rewired: readonly string[];
      readonly moved: readonly Moved[];
      readonly backup: Backup;
    }
  | { readonly kind: "already-wired"; readonly path: string }
  | {
      readonly kind: "mcp-corrected";
      readonly path: string;
      readonly was: WrittenLaunch;
      readonly now: string;
      readonly backup: Backup;
    }
  | { readonly kind: "scaffolded"; readonly path: string }
  | { readonly kind: "yours-already"; readonly path: string }
  | {
      readonly kind: "surveyed";
      readonly files: number;
      readonly outstanding: number;
      readonly path: string;
    }
  | { readonly kind: "surveyed-clean"; readonly files: number }
  | { readonly kind: "gate-wired"; readonly hook: string; readonly path: string }
  | { readonly kind: "gate-already"; readonly hook: string; readonly path: string }
  | { readonly kind: "gate-yours"; readonly hook: string; readonly path: string; readonly line: string }
  | { readonly kind: "gate-impossible"; readonly hook: string; readonly why: string }
  | {
      readonly kind: "mcp-unreadable";
      readonly path: string;
      readonly why: string;
      readonly block: string;
    }
  | { readonly kind: "entry-unreachable"; readonly what: string }
  | { readonly kind: "outer-agent-project"; readonly path: string };

export type Report = {
  readonly steps: readonly Step[];
  readonly commitGate: "wired" | "not-wired";
};

type Stub = { readonly path: string; readonly body: string };

const STUBS: readonly Stub[] = [
  { path: CONSTITUTION_PATH, body: CONSTITUTION_STUB },
  { path: MAP_PATH, body: MAP_STUB },
  { path: DOCTRINE_README_PATH, body: DOCTRINE_README_STUB },
  { path: SECRETS_ALLOW_PATH, body: SECRETS_ALLOW_STUB },
  { path: LAW_PATH, body: LAW_STUB },
];

export function readExisting(path: string): Existing {
  const read = readOrdinaryOrSay(path);
  if (read.kind === "absent") return { kind: "absent" };
  return { kind: "present", text: read.text };
}

const VENDOR = "vendor";

const MANIFEST = "package.json";

const NAMED_LOOPER = '"name": "looper"';

const ON_WINDOWS = "looper.cmd";

const MCP_TOOLS = "the doctrine and recall tools";

const MODULES = "node_modules";

type Checkout = { readonly kind: "none" } | { readonly kind: "found"; readonly at: string };

function isLooperCheckout(path: string): boolean {
  if (!existsSync(join(path, SHIM))) return false;
  const manifest = readOrdinary(join(path, MANIFEST));
  return manifest.kind === "text" && manifest.text.includes(NAMED_LOOPER);
}

function directoriesIn(path: string): readonly string[] {
  if (!existsSync(path)) return [];
  return readdirSync(path, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

export function checkoutUnder(root: string): Checkout {
  for (const name of directoriesIn(root)) {
    if (name === MODULES) continue;
    if (isLooperCheckout(join(root, name))) return { kind: "found", at: name };
  }
  for (const name of directoriesIn(join(root, VENDOR))) {
    if (isLooperCheckout(join(root, VENDOR, name))) {
      return { kind: "found", at: `${VENDOR}/${name}` };
    }
  }
  return { kind: "none" };
}

type Reach = { readonly kind: "reachable" } | { readonly kind: "missing"; readonly what: string };

function fileReach(root: string, relative: string): Reach {
  if (existsSync(join(root, relative))) return { kind: "reachable" };
  return { kind: "missing", what: relative };
}

function pathReach(searchPath: readonly string[]): Reach {
  for (const directory of searchPath) {
    if (existsSync(join(directory, LOOPER_COMMAND))) return { kind: "reachable" };
    if (existsSync(join(directory, ON_WINDOWS))) return { kind: "reachable" };
  }
  return { kind: "missing", what: `${LOOPER_COMMAND}, which is not in any directory on PATH` };
}

export function entryReach(
  root: string,
  invocation: Invocation,
  searchPath: readonly string[],
): Reach {
  if (invocation.kind === "local") return fileReach(root, LOCAL_BIN);
  if (invocation.kind === "inside") {
    const script = fileReach(root, scriptUnder(invocation.at));
    if (script.kind === "missing") return script;
    if (existsSync(join(root, invocation.at, MODULES))) return { kind: "reachable" };
    return {
      kind: "missing",
      what: `what ${invocation.at} needs to run — it is a looper checkout with no ${MODULES}, so run npm install inside it`,
    };
  }
  if (invocation.kind === "dev") return fileReach(root, DEV_ENTRY);
  return pathReach(searchPath);
}

function wireSettings(root: string, invocation: Invocation): Step {
  const path = join(root, SETTINGS_PATH);
  const outcome = mergeSettings(readExisting(path), looperHooks(invocation));

  if (outcome.kind === "unchanged") return { kind: "already-wired", path };

  const written = writeKeepingPrior(path, outcome.text);
  if (outcome.kind === "created") {
    return { kind: "created", path, wired: outcome.wired };
  }
  return {
    kind: "merged",
    path,
    wired: outcome.wired,
    rewired: outcome.rewired,
    moved: outcome.moved,
    backup: written.backup,
  };
}

function wireMcp(root: string, invocation: Invocation): Step {
  const path = join(root, MCP_PATH);
  const outcome = mergeMcp(readExisting(path), launchFor(invocation));

  if (outcome.kind === "unchanged") return { kind: "already-wired", path };
  if (outcome.kind === "unreadable") {
    return { kind: "mcp-unreadable", path, why: outcome.why, block: mcpStub(invocation) };
  }

  const written = writeKeepingPrior(path, outcome.text);
  if (outcome.kind === "created") {
    return { kind: "created", path, wired: [MCP_TOOLS] };
  }
  if (outcome.kind === "corrected") {
    return { kind: "mcp-corrected", path, was: outcome.was, now: outcome.now, backup: written.backup };
  }
  return { kind: "merged", path, wired: [MCP_TOOLS], backup: written.backup };
}

function scaffold(root: string, stub: Stub): Step {
  const path = join(root, stub.path);
  if (existsSync(path)) return { kind: "yours-already", path };
  writeAtomically(path, stub.body);
  return { kind: "scaffolded", path };
}

function gitHook(
  root: string,
  invocation: Invocation,
  name: string,
  marker: string,
  body: (entry: string) => string,
): Step {
  const dir = hooksDirectory(root);
  if (dir.kind === "none") return { kind: "gate-impossible", hook: name, why: dir.why };

  const path = join(root, dir.path, name);
  const line = `${gitHookEntryFor(invocation)} ${marker.slice("looper ".length)}`;

  const held = readOrdinary(path);
  if (held.kind === "unreadable") return { kind: "gate-impossible", hook: name, why: held.why };
  if (held.kind === "text") {
    if (held.text.includes(marker)) return { kind: "gate-already", hook: name, path };
    return { kind: "gate-yours", hook: name, path, line };
  }

  writeAtomically(path, body(gitHookEntryFor(invocation)));
  chmodSync(path, 0o755);
  return { kind: "gate-wired", hook: name, path };
}

function commitGate(root: string, invocation: Invocation): Step {
  return gitHook(root, invocation, PRE_COMMIT, HOOK_MARKER, preCommitScript);
}

function messageGate(root: string, invocation: Invocation): Step {
  return gitHook(root, invocation, COMMIT_MSG, MESSAGE_MARKER, commitMessageScript);
}

function survey(root: string): Step {
  const found = surveyProject(root, "already-tracked", EVERYTHING);
  if (found.violations.length === 0) {
    return { kind: "surveyed-clean", files: found.files };
  }
  const counted = countsOf(found.violations);
  writeBaseline(root, counted);
  return {
    kind: "surveyed",
    files: found.files,
    outstanding: totalIn(counted),
    path: join(root, BASELINE_PATH),
  };
}

export function reachedFrom(root: string): Invocation {
  if (isLooperCheckout(root)) return DEV;
  if (existsSync(join(root, LOCAL_BIN))) return LOCAL;
  const found = checkoutUnder(root);
  if (found.kind === "found") return inside(found.at);
  return INSTALLED;
}

export type AgentAbove =
  | { readonly kind: "none" }
  | { readonly kind: "started-in"; readonly path: string };

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function writeStack(root: string): Step {
  const path = join(root, STACK_PATH);
  if (existsSync(path)) return { kind: "yours-already", path };
  writeAtomically(path, stackDocument(stackOf(root), today(), root));
  return { kind: "scaffolded", path };
}

export function agentProjectAbove(root: string): AgentAbove {
  const home = whereTheUserLives();
  let at = dirname(root);

  while (at !== home && at !== dirname(at)) {
    if (existsSync(join(at, AGENT_DIR))) return { kind: "started-in", path: at };
    at = dirname(at);
  }
  return { kind: "none" };
}

export function runInit(
  root: string,
  invocation: Invocation,
  searchPath: readonly string[],
): Report {
  const steps: Step[] = [wireSettings(root, invocation)];
  for (const stub of STUBS) steps.push(scaffold(root, stub));
  steps.push(wireMcp(root, invocation));
  steps.push(commitGate(root, invocation));
  steps.push(messageGate(root, invocation));
  const reach = entryReach(root, invocation, searchPath);
  if (reach.kind === "missing") steps.push({ kind: "entry-unreachable", what: reach.what });
  steps.push(writeStack(root));
  const outer = agentProjectAbove(root);
  if (outer.kind === "started-in") steps.push({ kind: "outer-agent-project", path: outer.path });
  if (!existsSync(join(root, BASELINE_PATH))) steps.push(survey(root));
  const gate = steps.some(
    (step) =>
      (step.kind === "gate-wired" || step.kind === "gate-already") &&
      step.hook === PRE_COMMIT,
  );
  return { steps, commitGate: gate ? "wired" : "not-wired" };
}
