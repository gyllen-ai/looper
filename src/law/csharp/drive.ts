import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { withLockFor, type Locked, type Patience } from "../../atomic.ts";
import {
  A_FAILURE_IS_QUOTED_UP_TO,
  CSHARP_BUILD_LOCK,
  CSHARP_BUILD_LOCK_WAIT_MS,
  CSHARP_BUILD_TIMEOUT_MS,
  CSHARP_ENGINE_DIR,
  CSHARP_ENGINE_NAME,
  CSHARP_ENGINE_PROJECT,
  CSHARP_TIMEOUT_MS,
  A_READER_MAY_ANSWER_WITH,
} from "../../config.ts";
import { failureOf, fieldAt, reasonFrom } from "../../fields.ts";
import { freshnessOf } from "../engine-age.ts";

export type CsharpHit = {
  readonly rule: string;
  readonly file: string;
  readonly line: number;
};

export type Unreadable = {
  readonly file: string;
  readonly detail: string;
};

export type Judged =
  | { readonly kind: "unavailable"; readonly detail: string }
  | { readonly kind: "refused"; readonly detail: string }
  | {
      readonly kind: "found";
      readonly hits: readonly CsharpHit[];
      readonly unreadable: readonly Unreadable[];
    };

const NOTHING_TO_BUILD: Judged = { kind: "found", hits: [], unreadable: [] };

const A_BUILD: Patience = {
  waitMs: CSHARP_BUILD_LOCK_WAIT_MS,
  giveUpMs: CSHARP_BUILD_TIMEOUT_MS,
  staleMs: CSHARP_BUILD_TIMEOUT_MS,
};

export function engineIsHere(looperRoot: string): boolean {
  return existsSync(join(looperRoot, CSHARP_ENGINE_DIR, CSHARP_ENGINE_PROJECT));
}

export function engineIsBuilt(looperRoot: string): boolean {
  const engine = join(looperRoot, CSHARP_ENGINE_DIR);
  return (
    freshnessOf(builtAt(looperRoot), [join(engine, "src")], [join(engine, CSHARP_ENGINE_PROJECT)])
      .kind === "current"
  );
}

function builtAt(looperRoot: string): string {
  return join(looperRoot, CSHARP_ENGINE_DIR, "bin", "Release", "net10.0", CSHARP_ENGINE_NAME);
}

export function buildEngine(looperRoot: string): Judged {
  try {
    execFileSync("dotnet", ["build", "-c", "Release", "--nologo", "-v", "q"], {
      cwd: join(looperRoot, CSHARP_ENGINE_DIR),
      encoding: "utf8",
      timeout: CSHARP_BUILD_TIMEOUT_MS,
      maxBuffer: A_READER_MAY_ANSWER_WITH,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (cause) {
    return {
      kind: "unavailable",
      detail: `looper's C# half would not build: dotnet ${failureOf(cause, A_FAILURE_IS_QUOTED_UP_TO)}`,
    };
  }
  return NOTHING_TO_BUILD;
}

function readied(looperRoot: string): Judged {
  let locked: Locked<Judged>;
  try {
    locked = withLockFor(join(looperRoot, CSHARP_ENGINE_DIR, CSHARP_BUILD_LOCK), A_BUILD, () =>
      engineIsBuilt(looperRoot) ? NOTHING_TO_BUILD : buildEngine(looperRoot),
    );
  } catch (cause) {
    return {
      kind: "unavailable",
      detail: `looper's C# half could not be readied, because its build lock could not be taken (${reasonFrom(cause)})`,
    };
  }
  if (locked.kind === "busy") {
    return {
      kind: "unavailable",
      detail: `looper's C# half was being built by another looper, which did not finish in time (${locked.why})`,
    };
  }
  return locked.result;
}

function hitsFrom(payload: unknown): readonly CsharpHit[] {
  const held = fieldAt(payload, "violations");
  if (!Array.isArray(held)) return [];
  const found: CsharpHit[] = [];
  for (const one of held) {
    const rule = fieldAt(one, "rule");
    const file = fieldAt(one, "file");
    const line = fieldAt(one, "line");
    if (typeof rule !== "string" || typeof file !== "string" || typeof line !== "number") continue;
    found.push({ rule, file, line });
  }
  return found;
}

function unreadableFrom(payload: unknown): readonly Unreadable[] {
  const held = fieldAt(payload, "unreadable");
  if (!Array.isArray(held)) return [];
  const found: Unreadable[] = [];
  for (const one of held) {
    const file = fieldAt(one, "file");
    const detail = fieldAt(one, "detail");
    if (typeof file !== "string" || typeof detail !== "string") continue;
    found.push({ file, detail });
  }
  return found;
}

function ranWith(binary: string, args: readonly string[]): Judged {
  let output = "";
  try {
    output = execFileSync(binary, [...args], {
      encoding: "utf8",
      timeout: CSHARP_TIMEOUT_MS,
      maxBuffer: A_READER_MAY_ANSWER_WITH,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (cause) {
    const said = fieldAt(cause, "stdout");
    if (typeof said !== "string" || said.length === 0) {
      return { kind: "unavailable", detail: `the C# reader ${failureOf(cause, A_FAILURE_IS_QUOTED_UP_TO)}` };
    }
    output = said;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(output);
  } catch (cause) {
    return { kind: "unavailable", detail: `it did not answer in JSON (${reasonFrom(cause)})` };
  }

  const refused = fieldAt(payload, "error");
  if (typeof refused === "string") return { kind: "refused", detail: refused };
  return { kind: "found", hits: hitsFrom(payload), unreadable: unreadableFrom(payload) };
}

export function judgeCsharp(
  looperRoot: string,
  projectRoot: string,
  files: readonly string[],
): Judged {
  if (files.length === 0) return NOTHING_TO_BUILD;
  if (!engineIsHere(looperRoot)) {
    return { kind: "unavailable", detail: "looper's C# reader is not in this copy" };
  }
  const ready = readied(looperRoot);
  if (ready.kind !== "found") return ready;
  return ranWith(builtAt(looperRoot), [projectRoot, ...files]);
}
