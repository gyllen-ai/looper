import { existsSync, readFileSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";
import type { HookSpec } from "./types.ts";

import { homedir } from "node:os";

export const SETTINGS_PATH = ".claude/settings.json";

export const AGENT_DIR = ".claude";

export function whereTheUserLives(): string {
  return homedir();
}

export const JSON_INDENT = 2;

export const HOOK_ENTRY_TYPE = "command";

export const MATCHER_KEY = "matcher";

export const HOOKS_KEY = "hooks";

export const COMMAND_KEY = "command";

export const CONSTITUTION_PATH = ".looper/doctrine/constitution.md";

export const INJECTION_BUDGET = 9800;

export const HOOK_OUTPUT_CEILING = 10000;

export const HOOK_PREVIEW_CHARS = 2000;

export const INJECTION_SEPARATOR = "\n\n";

export const DOCTRINE_SEPARATOR = "\n\n";

const A_SEGMENT = "[A-Za-z0-9][A-Za-z0-9._-]*";
const A_FILE_STEM = new RegExp(`^${A_SEGMENT}(/${A_SEGMENT})*$`);

export function isABranchName(name: string): boolean {
  if (!A_FILE_STEM.test(name)) return false;
  if (name.includes("\\")) return false;
  return !name.includes("..");
}

export const CANON_DIR = "canon";

export const ROUTER_PRIORITY = 0;

export const LOOP_PRIORITY = 5;

export const BRANCH_PRIORITY = 10;

export const BASELINE_PRIORITY = 20;

export const STALL_PRIORITY = 30;

export const LOOP_IS_OLD_AFTER_MINUTES = 60;

export const MAP_PATH = ".looper/doctrine/map.toml";

export const DOCTRINE_DIR = ".looper/doctrine";

export const FRESHNESS_BYPASS = "Doctrine-freshness:";

export const LOOP_BYPASS = "Loop-broken:";

export const FRESHNESS_SECTION = "freshness";

export const GOVERNS_SECTION = "governs";

export const DOCTRINE_README_PATH = ".looper/doctrine/README.md";

export const CANON_SOURCE_DIR = "src/canon";

export const BULLET_CEILING = 300;

export const DOCTRINE_FILE_CEILING = 1300;

export const CONSTITUTION_CEILING = 1000;

export const INDEX_CEILING = 900;

export const LAW_PATH = "law.toml";

export const STYLESHEET_EXTENSIONS: readonly string[] = [".css", ".scss", ".sass"];

export const PAGE_EXTENSIONS: readonly string[] = [".html", ".htm", ".razor"];

export const JUDGED_EXTENSIONS: readonly string[] = [
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".rs",
  ".py",
  ".cs",
  ".razor",
  ".css",
  ".scss",
  ".sass",
  ".html",
  ".htm",
];

export const RUST_EXTENSION = ".rs";

export const OUTSIDE_THE_LAW: readonly string[] = [
  "node_modules",
  "dist",
  ".git",
  "target",
  "vendor",
  ".venv",
  "venv",
  "site-packages",
  "__pycache__",
];

export const RUST_ENGINE_DIR = "vendor/rust-law";

export const RUST_ENGINE_NAME = "looper-rust";

export const RUST_TIMEOUT_MS = 120_000;

export const A_READER_MAY_ANSWER_WITH = 256 * 1024 * 1024;

export const PYTHON_EXTENSION = ".py";

export const PYTHON_COMMAND = "python3";

export const PYTHON_READER = "src/law/python/read.py";

export const PYTHON_SKELETON = "src/law/python/skeleton.py";

export const PYTHON_TIMEOUT_MS = 60_000;

export const CSHARP_EXTENSIONS: readonly string[] = [".cs", ".razor"];

export const CSS_SECTION = "css";

export const PALETTE_DEFAULT = "tokens.css";

export const Z_INDEX_CAP_DEFAULT = 100;

export const CSHARP_ENGINE_DIR = "vendor/csharp-law";

export const CSHARP_ENGINE_NAME = "looper-csharp";

export const CSHARP_ENGINE_PROJECT = "looper-csharp.csproj";

export const CSHARP_TIMEOUT_MS = 120_000;

export const CSHARP_BUILD_TIMEOUT_MS = 300_000;

export const STACK_PATH = "CURRENTSTACK.md";

export const HOOK_TIMEOUT_SECONDS = 30;

export const COMMIT_GATE_TIMEOUT_SECONDS = 300;

export const SEER_DIR = "vendor/seer";

export const SEER_CAPTURE = "windows/capture.ps1";

export const SEER_CONSENT = "windows/consent.ps1";

export const SEER_EXCHANGE_DIR = ".looper-seer";

export const SEER_ASK = "ask.txt";

export const SEER_SAID = "said.json";

export const SEER_LIVE_WAIT_MS = 400;

export const SEER_STARTING_WAIT_MS = 12000;

export const WINDOWS_SHELL = "powershell.exe";

const KERNEL_NAMED = "/proc/version";

const WSL_DISTRO = "WSL_DISTRO_NAME";

export function underWsl(): boolean {
  if (process.platform !== "linux") return false;
  const named = process.env[WSL_DISTRO];
  if (named !== undefined && named.length > 0) return true;
  if (!existsSync(KERNEL_NAMED)) return false;
  return readFileSync(KERNEL_NAMED, "utf8").toLowerCase().includes("microsoft");
}

export const SEER_TOOL = "see";

export const SEER_TIMEOUT_MS = 20_000;

export const SEER_MAX_OUTPUT = 64_000_000;

export const SEER_NAME_LIMIT = 200;

export const REPORT_PATH = ".looper/report.md";

export const REPORT_DEPTH = 6;

export const ADOPTED_PATH = ".looper/adopted.toml";

export const ADOPTING_PATH = ".looper/adopting.toml";

export const DECISIONS_PATH = ".looper/decisions.md";

export const DECISIONS_TOOL = "decisions";

export const DECISIONS_PRIORITY = 30;

export const RECALL_PATH = ".looper/recall.md";

export const RECALL_TOOL = "recall";

export const RECALL_PRIORITY = 30;

export const SECRETS_ALLOW_PATH = ".looper/secrets.allow";

export const ALLOW_MARKER = "looper:allow-secret";

export const SKIP_SUFFIXES: readonly string[] = [
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf", ".woff", ".woff2",
  "package-lock.json", "pnpm-lock.yaml", "yarn.lock",
];

export const BASELINE_PATH = ".looper/baseline.toml";

export const PRE_COMMIT = "pre-commit";

export const COMMIT_MSG = "commit-msg";

export const MESSAGE_MARKER = "looper hook CommitMessage";

export function commitMessageScript(entry: string): string {
  return [
    "#!/bin/sh",
    `${entry} hook CommitMessage "$1" </dev/null`,
    "verdict=$?",
    "if [ $verdict -eq 2 ]; then",
    "  exit 1",
    "fi",
    "if [ $verdict -ne 0 ]; then",
    '  echo "looper could not read this commit message, so it was not checked." >&2',
    '  echo "  A password pasted into the message would not have been caught." >&2',
    "  exit 0",
    "fi",
    "exit 0",
    "",
  ].join("\n");
}

export const HOOK_MARKER = "looper hook PreCommit";

export function gitHookEntryFor(invocation: Invocation): string {
  if (invocation.kind === "dev") return `node ${fromRoot(DEV_ENTRY)}`;
  if (invocation.kind === "local") return LOCAL_FROM_ROOT;
  if (invocation.kind === "inside") return `node ${fromRoot(scriptUnder(invocation.at))}`;
  return INSTALLED_ENTRY;
}

export function preCommitScript(entry: string): string {
  return [
    "#!/bin/sh",
    `${entry} hook PreCommit </dev/null`,
    "verdict=$?",
    "if [ $verdict -eq 2 ]; then",
    "  exit 1",
    "fi",
    "if [ $verdict -ne 0 ]; then",
    '  echo "looper could not check this commit, so it was not checked." >&2',
    '  echo "  Nothing is wrong with your code as far as looper knows." >&2',
    "  exit 0",
    "fi",
    "exit 0",
    "",
  ].join("\n");
}

export const NOT_A_WAY_THROUGH = `Asking a person to run this command instead is not a way through: the same rules apply to their commit. If the rule is wrong here, run \`looper report\` — it writes the case for changing it, and CONTRIBUTING.md has the three routes out.`;

export const TS_SECTION = "ts";

export const SHARED_TRUTH_SECTION = "truth";

export const ENTRY_SECTION = "entry";

export const SANCTUM_DEFAULT = "config.ts";

export const TRACE_SYMBOLS: readonly string[] = [
  "logger.warn",
  "logger.error",
  "logger.fatal",
];

export const SUPPRESSIONS: readonly string[] = [
  "@ts-ignore",
  "@ts-expect-error",
  "@ts-nocheck",
  "eslint-disable",
];

export const MAX_LOC_DEFAULT = 500;

export const GIT_TIMEOUT_MS = 3000;

export const SERVER_NAME = "looper";

export const SERVER_VERSION = "0.1.0";

export const JSONRPC_VERSION = "2.0";

export const MCP_PROTOCOL_VERSION = "2025-06-18";

export const DOCTRINE_TOOL = "doctrine";

export const MCP_PATH = ".mcp.json";

export type Launch = { readonly command: string; readonly args: readonly string[] };

export function launchFor(invocation: Invocation): Launch {
  if (invocation.kind === "dev") {
    return { command: "node", args: [fromRoot(DEV_ENTRY)] };
  }
  if (invocation.kind === "local") {
    return { command: LOCAL_FROM_ROOT, args: [] };
  }
  if (invocation.kind === "inside") {
    return { command: "node", args: [fromRoot(scriptUnder(invocation.at))] };
  }
  return { command: INSTALLED_ENTRY, args: [] };
}

export function mcpStub(invocation: Invocation): string {
  const launch = launchFor(invocation);
  return `${JSON.stringify(
    {
      mcpServers: {
        looper: {
          type: "stdio",
          command: launch.command,
          args: [...launch.args, "serve"],
        },
      },
    },
    null,
    2,
  )}\n`;
}

export function branchHeading(name: string): string {
  return `— doctrine · ${name} —`;
}

export const TEMP_SUFFIX = ".looper-tmp";

export const BACKUP_SUFFIX = ".looper-backup";

export const EDIT_TOOLS = "Edit|MultiEdit|Write|Bash";

export type Invocation =
  | { readonly kind: "installed" }
  | { readonly kind: "local" }
  | { readonly kind: "dev" }
  | { readonly kind: "inside"; readonly at: string };

export const INSTALLED: Invocation = { kind: "installed" };

export const LOCAL: Invocation = { kind: "local" };

export const DEV: Invocation = { kind: "dev" };

export function inside(at: string): Invocation {
  return { kind: "inside", at };
}

const INSTALLED_ENTRY = "looper";

export const LOOPER_COMMAND = INSTALLED_ENTRY;

export const DEV_ENTRY = "src/main.ts";

export const PROJECT_DIR = "CLAUDE_PROJECT_DIR";

export type Rooted = {
  readonly root: string;
  readonly how: string;
};

function nearestProject(from: string): Rooted {
  let at = from;
  for (;;) {
    if (existsSync(join(at, DOCTRINE_DIR))) {
      return { root: at, how: `the nearest folder above with a ${DOCTRINE_DIR}` };
    }
    if (existsSync(join(at, ".git"))) {
      return { root: at, how: "the root of this git repository" };
    }
    const up = dirname(at);
    if (up === at) return { root: from, how: "where the command was run, having found nothing above it" };
    at = up;
  }
}

export type Named = { readonly kind: "none" } | { readonly kind: "named"; readonly root: string };

export function namedProject(): Named {
  const held = process.env[PROJECT_DIR];
  if (held === undefined || held.length === 0) return { kind: "none" };
  return { kind: "named", root: held };
}

export function projectRoot(from: string, named: Named): Rooted {
  if (named.kind === "named") {
    return { root: named.root, how: `${PROJECT_DIR}, set by the agent that started this` };
  }
  return nearestProject(from);
}

export function searchPath(): readonly string[] {
  const written = process.env["PATH"];
  if (written === undefined) return [];
  return written.split(delimiter);
}

const LOCAL_ENTRY = "$CLAUDE_PROJECT_DIR/node_modules/.bin/looper";

const LOCAL_FROM_ROOT = "./node_modules/.bin/looper";

export const LOCAL_BIN = "node_modules/.bin/looper";

export const SHIM = "bin/looper.js";

const DEV_SCRIPT = `$CLAUDE_PROJECT_DIR/${SHIM}`;

export function scriptUnder(at: string): string {
  return `${at}/${SHIM}`;
}

function fromRoot(relative: string): string {
  return `./${relative}`;
}

export function entryFor(invocation: Invocation): string {
  if (invocation.kind === "dev") return `node "${DEV_SCRIPT}"`;
  if (invocation.kind === "local") return `"${LOCAL_ENTRY}"`;
  if (invocation.kind === "inside") {
    return `node "$CLAUDE_PROJECT_DIR/${scriptUnder(invocation.at)}"`;
  }
  return INSTALLED_ENTRY;
}

export function looperHooks(invocation: Invocation): readonly HookSpec[] {
  const entry = entryFor(invocation);
  return [
    {
      event: "UserPromptSubmit",
      matcher: { kind: "all" },
      command: `${entry} inject`,
      statusMessage: "looper: reading this project's rules",
    },
    {
      event: "PostToolUse",
      matcher: { kind: "match", pattern: EDIT_TOOLS },
      command: `${entry} hook PostToolUse`,
      statusMessage: "looper: checking that edit",
    },
    {
      event: "PreToolUse",
      matcher: { kind: "match", pattern: "Bash" },
      command: `${entry} hook PreToolUse`,
      statusMessage: "looper: checking what is about to be committed",
      timeoutSeconds: COMMIT_GATE_TIMEOUT_SECONDS,
    },
    {
      event: "Stop",
      matcher: { kind: "all" },
      command: `${entry} hook Stop`,
      statusMessage: "looper: updating what is left to fix",
    },
  ];
}
