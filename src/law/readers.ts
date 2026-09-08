import { existsSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

import { PYTHON_EXTENSION, RUST_EXTENSION, CSHARP_EXTENSIONS } from "../config.ts";
import { reasonFrom } from "../fields.ts";
import { required } from "../present.ts";
import { readConcessions, setAside, standingOf } from "./concessions.ts";
import { judgeCsharp } from "./csharp/drive.ts";
import { csharpRuleFor } from "./csharp/rules.ts";
import { judgePython } from "./python/drive.ts";
import { PYTHON_RULES } from "./python/rules.ts";
import { judgeRust } from "./rust/drive.ts";
import { rustRuleFor } from "./rust/rules.ts";

import type { Violation } from "./rule.ts";

export type RustSaid = {
  readonly violations: readonly Violation[];
  readonly unreadable: readonly string[];
};

export function looperRoot(): string {
  return join(import.meta.dirname, "..", "..");
}

type Answered =
  | { readonly kind: "none" }
  | { readonly kind: "named"; readonly names: ReadonlySet<string> };

function crateRootFor(file: string, stopAt: string): string {
  let at = dirname(file);
  for (;;) {
    if (existsSync(join(at, "Cargo.toml"))) return at;
    const up = dirname(at);
    if (up === at || at.length <= stopAt.length) return stopAt;
    at = up;
  }
}

function byCrate(root: string, files: readonly string[]): ReadonlyMap<string, string[]> {
  const grouped = new Map<string, string[]>();
  for (const file of files) {
    const crate = crateRootFor(file, root);
    const held = grouped.get(crate);
    if (held === undefined) grouped.set(crate, [file]);
    else held.push(file);
  }
  return grouped;
}

export function judgeRustIn(root: string, files: readonly string[]): RustSaid {
  if (files.length === 0) return { violations: [], unreadable: [] };

  const violations: Violation[] = [];
  const unreadable: string[] = [];
  for (const [crate, inCrate] of byCrate(root, files)) {
    const said = judgedCrate(root, crate, inCrate);
    violations.push(...said.violations);
    unreadable.push(...said.unreadable);
  }
  return { violations, unreadable };
}

function namedAmong(said: string, crate: string, files: readonly string[]): string {
  const guess = join(crate, said);
  if (existsSync(guess)) return guess;
  const ending = `/${said}`;
  const held = files.find((path) => path.endsWith(ending));
  return held === undefined ? guess : held;
}

const ALREADY_SAID = /^could not read /;

function withoutRepeatedOpening(detail: string): string {
  return detail.replace(ALREADY_SAID, "");
}

const COULD_NOT_PARSE = /could not read (\S+) as Rust: [^(]*\(line (\d+)\)/;

function refusedCrate(root: string, detail: string, files: readonly string[]): RustSaid {
  const held = COULD_NOT_PARSE.exec(detail);
  const known = rustRuleFor("ERROR:9");
  if (held === null || known.kind === "unknown") {
    return { violations: [], unreadable: [withoutRepeatedOpening(detail)] };
  }
  const file = required(held[1], "the file the Rust reader named");
  const line = Number(required(held[2], "the line the Rust reader named"));
  const rest = files.filter((one) => relative(root, one) !== relative(root, file));

  return {
    violations: [{ rule: known.rule, file: relative(root, file), line }],
    unreadable:
      rest.length === 0
        ? []
        : [
            `${rest.length} other file(s) in the same crate (the Rust reader stops at the crate, so nothing else in it was judged)`,
          ],
  };
}

function judgedCrate(root: string, crate: string, files: readonly string[]): RustSaid {
  const said = judgeRust(looperRoot(), crate, []);
  if (said.kind !== "found") return refusedCrate(root, said.detail, files);

  const violations: Violation[] = [];
  const unknown: string[] = [];
  for (const hit of said.hits) {
    const named = namedAmong(hit.file, crate, files);
    const known = rustRuleFor(hit.rule);
    if (known.kind === "unknown") {
      unknown.push(`the Rust half reported ${hit.rule}, which looper has no words for`);
      continue;
    }
    violations.push({ rule: known.rule, file: relative(root, named), line: hit.line });
  }
  return { violations, unreadable: unknown };
}

export function under(root: string, paths: readonly string[], file: string): boolean {
  if (paths.length === 0) return true;
  return paths.some((asked) => {
    const wanted = resolve(root, asked);
    return file === wanted || file.startsWith(`${wanted}/`);
  });
}

type PythonSaid = {
  readonly violations: readonly Violation[];
  readonly unreadable: readonly string[];
  readonly unjudged: number;
};

export function judgePythonIn(root: string, files: readonly string[]): PythonSaid {
  if (files.length === 0) return { violations: [], unreadable: [], unjudged: 0 };

  const said = judgePython(looperRoot(), files);
  if (said.kind !== "found") {
    const many =
      files.length === 1
        ? relative(root, required(files[0], "the one Python file"))
        : `${files.length} Python files`;
    return {
      violations: [],
      unreadable: [`${many} (${said.detail})`],
      unjudged: files.length,
    };
  }

  const concessions = readConcessions(root);
  const violations: Violation[] = [];
  const unreadable = said.unreadable.map(
    (one) => `${relative(root, one.file)} (${one.detail})`,
  );
  for (const hit of said.hits) {
    const known = PYTHON_RULES.find((rule) => rule.id === hit.rule);
    if (known === undefined) {
      unreadable.push(`the Python half reported ${hit.rule}, which looper has no words for`);
      continue;
    }
    const named = relative(root, hit.file);
    if (setAside(standingOf(concessions, named, known.id))) continue;
    violations.push({ rule: known, file: named, line: hit.line });
  }
  return { violations, unreadable, unjudged: said.unreadable.length };
}

export function isCsharp(path: string): boolean {
  return CSHARP_EXTENSIONS.some((suffix) => path.endsWith(suffix));
}

export function judgeCsharpIn(root: string, files: readonly string[]): PythonSaid {
  if (files.length === 0) return { violations: [], unreadable: [], unjudged: 0 };

  const said = judgeCsharp(looperRoot(), root, files);
  if (said.kind !== "found") {
    const many =
      files.length === 1
        ? relative(root, required(files[0], "the one C# file"))
        : `${files.length} C# files`;
    return {
      violations: [],
      unreadable: [`${many} (${said.detail})`],
      unjudged: files.length,
    };
  }

  const concessions = readConcessions(root);
  const violations: Violation[] = [];
  const unreadable = said.unreadable.map((one) => `${one.file} (${one.detail})`);
  for (const hit of said.hits) {
    const known = csharpRuleFor(hit.rule);
    if (known.kind === "unknown") {
      unreadable.push(`the C# half reported ${hit.rule}, which looper has no words for`);
      continue;
    }
    if (setAside(standingOf(concessions, hit.file, known.rule.id))) continue;
    violations.push({ rule: known.rule, file: hit.file, line: hit.line });
  }
  return { violations, unreadable, unjudged: said.unreadable.length };
}
