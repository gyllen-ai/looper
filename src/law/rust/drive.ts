import { join } from "node:path";

import { A_FAILURE_IS_QUOTED_UP_TO, RUST_ENGINE_DIR } from "../../config.ts";
import { failureOf, fieldAt, reasonFrom } from "../../fields.ts";
import { buildRustReader, readerAt, runReader } from "../../start.ts";
import { freshnessOf } from "../engine-age.ts";

export type RustHit = {
  readonly rule: string;
  readonly file: string;
  readonly line: number;
};

const ENGINE_MANIFESTS: readonly string[] = ["Cargo.toml", "Cargo.lock"];

export type Judged =
  | { readonly kind: "unavailable"; readonly detail: string }
  | { readonly kind: "refused"; readonly detail: string }
  | { readonly kind: "found"; readonly hits: readonly RustHit[]; readonly names: readonly string[] };

export function engineIsBuilt(looperRoot: string): boolean {
  return freshnessOf(builtAt(looperRoot), sourcesOf(looperRoot), manifestsOf(looperRoot)).kind === "current";
}

function sourcesOf(looperRoot: string): readonly string[] {
  return [join(looperRoot, RUST_ENGINE_DIR, "src")];
}

function manifestsOf(looperRoot: string): readonly string[] {
  return ENGINE_MANIFESTS.map((name) => join(looperRoot, RUST_ENGINE_DIR, name));
}

function builtAt(looperRoot: string): string {
  return readerAt(looperRoot, "rust");
}


export function buildEngine(looperRoot: string): Judged {
  try {
    buildRustReader(looperRoot);
  } catch (cause) {
    return {
      kind: "unavailable",
      detail: `looper's Rust half would not build: cargo ${failureOf(cause, A_FAILURE_IS_QUOTED_UP_TO)}`,
    };
  }
  return { kind: "found", hits: [], names: [] };
}

function namesFrom(payload: unknown): readonly string[] {
  const held = fieldAt(payload, "commands");
  if (!Array.isArray(held)) return [];
  return held.filter((one): one is string => typeof one === "string");
}

function hitsFrom(payload: unknown): readonly RustHit[] {
  const held = fieldAt(payload, "violations");
  if (!Array.isArray(held)) return [];
  const found: RustHit[] = [];
  for (const one of held) {
    const rule = fieldAt(one, "rule");
    const file = fieldAt(one, "file");
    const line = fieldAt(one, "line");
    if (typeof rule !== "string" || typeof file !== "string" || typeof line !== "number") continue;
    found.push({ rule, file, line });
  }
  return found;
}

function ranWith(looperRoot: string, args: readonly string[]): Judged {
  let output = "";
  try {
    output = runReader(looperRoot, "rust", args);
  } catch (cause) {
    const said = fieldAt(cause, "stdout");
    if (typeof said !== "string" || said.length === 0) {
      return { kind: "unavailable", detail: `the Rust reader ${failureOf(cause, A_FAILURE_IS_QUOTED_UP_TO)}` };
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
  return { kind: "found", hits: hitsFrom(payload), names: namesFrom(payload) };
}

export type Commands =
  | { readonly kind: "unavailable"; readonly detail: string }
  | { readonly kind: "named"; readonly names: ReadonlySet<string> };

export function commandsUnder(looperRoot: string, crateRoot: string): Commands {
  if (!engineIsBuilt(looperRoot)) {
    const built = buildEngine(looperRoot);
    if (built.kind !== "found") return { kind: "unavailable", detail: built.detail };
  }
  const said = ranWith(looperRoot, ["--commands", crateRoot]);
  if (said.kind !== "found") {
    return { kind: "unavailable", detail: said.kind === "refused" ? said.detail : said.detail };
  }
  return { kind: "named", names: new Set(said.names) };
}

export function judgeRust(
  looperRoot: string,
  projectRoot: string,
  files: readonly string[],
): Judged {
  if (!engineIsBuilt(looperRoot)) {
    const built = buildEngine(looperRoot);
    if (built.kind !== "found") return built;
  }
  return ranWith(looperRoot, [projectRoot, ...files]);
}

export type Shaped =
  | { readonly kind: "unavailable"; readonly detail: string }
  | { readonly kind: "found"; readonly payload: unknown };

export function shapeFromRust(
  looperRoot: string,
  path: string,
  line: number,
  depth: number,
): Shaped {
  if (!engineIsBuilt(looperRoot)) {
    const built = buildEngine(looperRoot);
    if (built.kind !== "found") {
      return { kind: "unavailable", detail: `looper's Rust half is not built (${built.detail})` };
    }
  }
  let output = "";
  try {
    output = runReader(looperRoot, "rust", ["--shape", path, String(line), String(depth)]);
  } catch (cause) {
    return { kind: "unavailable", detail: `the Rust reader ${failureOf(cause, A_FAILURE_IS_QUOTED_UP_TO)}` };
  }
  try {
    return { kind: "found", payload: JSON.parse(output) };
  } catch (cause) {
    return { kind: "unavailable", detail: `it did not answer in JSON (${reasonFrom(cause)})` };
  }
}
