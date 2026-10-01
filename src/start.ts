import { execFileSync, spawnSync, type SpawnSyncReturns } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";

import {
  A_READER_MAY_ANSWER_WITH,
  CSHARP_BUILD_TIMEOUT_MS,
  CSHARP_ENGINE_DIR,
  CSHARP_ENGINE_NAME,
  PYTHON_COMMAND,
  PYTHON_READER,
  PYTHON_SKELETON,
  RUST_ENGINE_DIR,
  RUST_ENGINE_NAME,
  environmentWith,
  saidByTheUser,
  whereRustupLives,
} from "./config.ts";
import { NotSomethingLooperStarts } from "./errors.ts";
import { reasonFrom } from "./fields.ts";

export type Answered = SpawnSyncReturns<string>;

const GIT_TIMEOUT_MS = 3000;

const RUST_TIMEOUT_MS = 120_000;

const PYTHON_TIMEOUT_MS = 60_000;

const CSHARP_TIMEOUT_MS = 120_000;

const NEVER_OVER_A_WIRE: readonly string[] = ["-c", "protocol.allow=never"];

const GIT_STAYS_HOME: Readonly<Record<string, string>> = { GIT_ALLOW_PROTOCOL: "" };

const GIT_ONLY_READS: readonly (readonly string[])[] = [
  ["config", "--get"],
  ["ls-files"],
  ["diff"],
  ["diff-tree"],
  ["show"],
  ["rev-parse"],
  ["grep"],
  ["merge-base", "--is-ancestor"],
  ["tag", "--points-at"],
  ["status", "--porcelain"],
];

const THE_DIFFERENCE_ITSELF: readonly string[] = ["diff", "--no-ext-diff"];

function opensWith(args: readonly string[], opening: readonly string[]): boolean {
  return opening.every((word, at) => args[at] === word);
}

export function askGit(root: string, args: readonly string[]): Answered {
  if (!GIT_ONLY_READS.some((opening) => opensWith(args, opening))) {
    throw new NotSomethingLooperStarts(`git ${args.join(" ")}`);
  }
  const asked = args[0] === "diff" ? [...THE_DIFFERENCE_ITSELF, ...args.slice(1)] : args;
  return spawnSync("git", [...NEVER_OVER_A_WIRE, ...asked], {
    cwd: root,
    encoding: "utf8",
    timeout: GIT_TIMEOUT_MS,
    maxBuffer: A_READER_MAY_ANSWER_WITH,
    stdio: ["ignore", "pipe", "pipe"],
    env: environmentWith(GIT_STAYS_HOME),
  });
}

export type Reader = "rust" | "csharp";

export function readerAt(looperRoot: string, which: Reader): string {
  return which === "rust"
    ? join(looperRoot, RUST_ENGINE_DIR, "target", "release", RUST_ENGINE_NAME)
    : join(looperRoot, CSHARP_ENGINE_DIR, "bin", "Release", "net10.0", CSHARP_ENGINE_NAME);
}

const RUSTUP_SETTINGS = "settings.toml";

const THE_USERS_OWN_CHOICE = "RUSTUP_TOOLCHAIN";

const WHERE_SECTIONS_BEGIN = /^\s*\[/m;

const NAMES_THE_COMPILER = /^default_toolchain\s*=\s*"([A-Za-z0-9._-]+)"\s*$/m;

type Compiler =
  | { readonly kind: "not-known"; readonly why: string }
  | { readonly kind: "installed"; readonly name: string };

function installedCompiler(): Compiler {
  const home = whereRustupLives();
  const settings = join(home, RUSTUP_SETTINGS);
  if (!isAbsolute(home)) return { kind: "not-known", why: `${home} is not a whole path, and rustup would read it from another folder` };
  if (!existsSync(settings)) return { kind: "not-known", why: `there is no ${settings}` };
  let written: string;
  try {
    written = readFileSync(settings, "utf8");
  } catch (cause) {
    return { kind: "not-known", why: reasonFrom(cause) };
  }
  const sections = WHERE_SECTIONS_BEGIN.exec(written);
  const named = NAMES_THE_COMPILER.exec(sections === null ? written : written.slice(0, sections.index))?.[1];
  if (named === undefined || !existsSync(join(home, "toolchains", named))) {
    return { kind: "not-known", why: `${settings} names no compiler that is installed` };
  }
  return { kind: "installed", name: named };
}

function rustStaysHome(): Readonly<Record<string, string>> {
  if (saidByTheUser(THE_USERS_OWN_CHOICE).length > 0) return { RUSTUP_AUTO_INSTALL: "0" };
  const compiler = installedCompiler();
  if (compiler.kind === "not-known") return { RUSTUP_AUTO_INSTALL: "0" };
  return { RUSTUP_AUTO_INSTALL: "0", RUSTUP_TOOLCHAIN: compiler.name };
}

export function buildRustReader(looperRoot: string): void {
  execFileSync("cargo", ["build", "--offline", "--release"], {
    cwd: join(looperRoot, RUST_ENGINE_DIR),
    encoding: "utf8",
    timeout: RUST_TIMEOUT_MS,
    stdio: ["ignore", "ignore", "pipe"],
    env: environmentWith(rustStaysHome()),
  });
}

const DOTNET_STAYS_HOME: Readonly<Record<string, string>> = {
  DOTNET_CLI_TELEMETRY_OPTOUT: "1",
  DOTNET_CLI_WORKLOAD_UPDATE_NOTIFY_DISABLE: "true",
  DOTNET_NOLOGO: "true",
  NUGET_CERT_REVOCATION_MODE: "offline",
};

const A_BUILD_NOTHING_AROUND_IT_SHAPES: readonly string[] = [
  "build",
  "-c",
  "Release",
  "--nologo",
  "-v",
  "q",
  "-noAutoResponse",
  "-p:ImportDirectoryBuildProps=false",
  "-p:ImportDirectoryBuildTargets=false",
  "-p:ImportDirectoryPackagesProps=false",
  "-p:NuGetAudit=false",
  "-p:RestoreAdditionalProjectSources=",
  "-p:RestoreConfigFile=NuGet.config",
];

export function buildCsharpReader(looperRoot: string): void {
  execFileSync("dotnet", [...A_BUILD_NOTHING_AROUND_IT_SHAPES], {
    cwd: join(looperRoot, CSHARP_ENGINE_DIR),
    encoding: "utf8",
    timeout: CSHARP_BUILD_TIMEOUT_MS,
    maxBuffer: A_READER_MAY_ANSWER_WITH,
    stdio: ["ignore", "pipe", "pipe"],
    env: environmentWith(DOTNET_STAYS_HOME),
  });
}

export function runReader(looperRoot: string, which: Reader, args: readonly string[]): string {
  const binary = readerAt(looperRoot, which);
  return execFileSync(binary, [...args], {
    encoding: "utf8",
    timeout: which === "rust" ? RUST_TIMEOUT_MS : CSHARP_TIMEOUT_MS,
    maxBuffer: A_READER_MAY_ANSWER_WITH,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

export type PythonReader = "rules" | "shape";

const ALONE: readonly string[] = ["-I", "-S"];

export function pythonReaderAt(looperRoot: string, which: PythonReader): string {
  return join(looperRoot, which === "rules" ? PYTHON_READER : PYTHON_SKELETON);
}

export function runPython(looperRoot: string, which: PythonReader, args: readonly string[]): string {
  return execFileSync(PYTHON_COMMAND, [...ALONE, pythonReaderAt(looperRoot, which), ...args], {
    encoding: "utf8",
    timeout: PYTHON_TIMEOUT_MS,
    maxBuffer: A_READER_MAY_ANSWER_WITH,
    stdio: ["ignore", "pipe", "ignore"],
  });
}

export function runDeclared(line: string, root: string, patienceMs: number): Answered {
  return spawnSync("sh", ["-c", line], {
    cwd: root,
    encoding: "utf8",
    timeout: patienceMs,
    maxBuffer: A_READER_MAY_ANSWER_WITH,
  });
}
