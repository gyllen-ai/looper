import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import {
  CSHARP_EXTENSIONS,
  JUDGED_EXTENSIONS,
  LAW_PATH,
  OUTSIDE_THE_LAW,
  PYTHON_EXTENSION,
  RUST_EXTENSION,
} from "../config.ts";
import { ignoredHere, trackedFiles, type Ignoring } from "../git.ts";
import { readConcessions } from "./concessions.ts";
import { required } from "../present.ts";
import { judge } from "./engine.ts";
import { CHECKS } from "./checks.ts";
import { CSS_CHECKS } from "./css/checks.ts";
import { variantsIn } from "./copy.ts";
import { isStyling } from "./css/read.ts";
import { checksAdoptedIn } from "./adopted.ts";
import type { Violation } from "./rule.ts";
import { UNREADABLE_FILE } from "./ts/unreadable.ts";
import { reasonFrom } from "../fields.ts";
import { commandsUnder } from "./rust/drive.ts";
import { crossingsIn } from "./rust/boundary.ts";
import { roleOf, shapeOf, type Shape } from "./shape.ts";
import { undeclaredLanguagesIn } from "./stack.ts";
import {
  isCsharp,
  judgeCsharpIn,
  judgePythonIn,
  judgeRustIn,
  looperRoot,
  under,
  type RustSaid,
} from "./readers.ts";

export type Survey = {
  readonly violations: readonly Violation[];
  readonly files: number;
  readonly unreadable: readonly string[];
  readonly unjudged: number;
  readonly judged: number;
  readonly selfGoverned: readonly SelfGoverned[];
  readonly couldNotSkipIgnored: string;
};

const SUBMODULES = ".gitmodules";

const SUBMODULE_PATH = /^\s*path\s*=\s*(.+?)\s*$/;

export function submodulesOf(root: string): readonly string[] {
  const path = join(root, SUBMODULES);
  if (!existsSync(path)) return [];
  const found: string[] = [];
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const held = SUBMODULE_PATH.exec(line);
    if (held === null) continue;
    found.push(required(held[1], "the path of a submodule"));
  }
  return found;
}

export type Governed =
  | { readonly kind: "no" }
  | { readonly kind: "yes"; readonly why: string };

function saysSomething(path: string): boolean {
  return readFileSync(path, "utf8")
    .split("\n")
    .some((line) => line.trim().length > 0 && !line.trim().startsWith("#"));
}

function governsItself(root: string, at: string, submodules: readonly string[]): Governed {
  if (at === "" || at === ".") return { kind: "no" };
  if (submodules.includes(at)) return { kind: "yes", why: "a submodule, so it is somebody else's" };

  const own = join(root, at, LAW_PATH);
  if (!existsSync(own)) return { kind: "no" };
  if (!saysSomething(own)) return { kind: "no" };
  return { kind: "yes", why: `it has its own ${LAW_PATH}` };
}

function anyAncestorGoverns(
  root: string,
  parts: readonly string[],
  submodules: readonly string[],
): Governed {
  let at = "";
  for (const part of parts) {
    if (part === "" || part === ".") continue;
    at = at === "" ? part : `${at}/${part}`;
    const held = governsItself(root, at, submodules);
    if (held.kind === "yes") return held;
  }
  return { kind: "no" };
}

export function underAnotherLaw(root: string, path: string): boolean {
  const parts = relative(root, join(root, path)).split(/[\\/]/);
  parts.pop();
  return anyAncestorGoverns(root, parts, submodulesOf(root)).kind === "yes";
}

export type SelfGoverned = {
  readonly where: string;
  readonly why: string;
  readonly files: number;
};

export type Walked = {
  readonly files: readonly string[];
  readonly unreadable: readonly string[];
  readonly selfGoverned: readonly SelfGoverned[];
  readonly couldNotSkipIgnored: string;
};

type Real =
  | { readonly kind: "real"; readonly path: string }
  | { readonly kind: "unknown"; readonly why: string };

function realOf(path: string): Real {
  try {
    return { kind: "real", path: realpathSync(path) };
  } catch (cause) {
    return { kind: "unknown", why: reasonFrom(cause) };
  }
}

function toGitPath(where: string): string {
  return where.split(sep).join("/");
}

function isInside(rootReal: string, fileReal: string): boolean {
  const inside = relative(rootReal, fileReal);
  return !inside.startsWith("..") && !isAbsolute(inside);
}

function askedToBeIgnored(ignoring: Ignoring, where: string, isFolder: boolean): boolean {
  if (ignoring.kind !== "ignoring") return false;
  const named = isFolder ? `${where}/` : where;
  if (ignoring.paths.has(named)) return true;
  return ignoring.folders.some((folder) => named === folder || named.startsWith(folder));
}

export function walkProject(root: string): Walked {
  const found: string[] = [];
  const unreadable: string[] = [];
  const selfGoverned: SelfGoverned[] = [];
  const submodules = submodulesOf(root);
  const seen = new Set<string>();
  const ignoring = ignoredHere(root);

  function walkDirectory(dir: string, rootReal: string): void {
    const held = realOf(dir);
    if (held.kind === "unknown") {
      unreadable.push(`${relative(root, dir)} (${held.why})`);
      return;
    }
    const real = held.path;
    if (seen.has(real)) {
      unreadable.push(`${relative(root, dir)} (another name for a directory already read)`);
      return;
    }
    seen.add(real);

    let entries: readonly string[] = [];
    try {
      entries = readdirSync(dir);
    } catch (cause) {
      unreadable.push(`${relative(root, dir)} (${reasonFrom(cause)})`);
      return;
    }

    for (const entry of entries) {
      if (OUTSIDE_THE_LAW.includes(entry)) continue;
      const path = join(dir, entry);

      let stat;
      try {
        stat = statSync(path);
      } catch (cause) {
        unreadable.push(`${relative(root, path)} (${reasonFrom(cause)})`);
        continue;
      }

      if (stat.isDirectory()) {
        if (askedToBeIgnored(ignoring, toGitPath(relative(root, path)), true)) continue;
        const inside = relative(root, path).split(/[\\/]/);
        const governed = anyAncestorGoverns(root, inside, submodules);
        if (governed.kind === "yes") {
          selfGoverned.push({
            where: relative(root, path),
            why: governed.why,
            files: walkProject(path).files.length,
          });
          continue;
        }
        walkDirectory(path, rootReal);
        continue;
      }
      if (!JUDGED_EXTENSIONS.some((suffix) => entry.endsWith(suffix))) continue;
      if (askedToBeIgnored(ignoring, toGitPath(relative(root, path)), false)) continue;
      const where = realOf(path);
      if (where.kind === "unknown") {
        unreadable.push(`${relative(root, path)} (${where.why})`);
        continue;
      }
      if (!isInside(rootReal, where.path)) {
        unreadable.push(`${relative(root, path)} (it points outside this project)`);
        continue;
      }
      found.push(path);
    }
  }

  const rootReal = realOf(root);
  if (rootReal.kind === "unknown") {
    return { files: [], unreadable: [`${root} (${rootReal.why})`], selfGoverned: [], couldNotSkipIgnored: "" };
  }
  walkDirectory(root, rootReal.path);
  return {
    files: found,
    unreadable,
    selfGoverned,
    couldNotSkipIgnored: ignoring.kind === "unavailable" ? ignoring.detail : "",
  };
}

export function judgedFiles(root: string): readonly string[] {
  return walkProject(root).files;
}

export type Reach = "everything" | "already-tracked";

function reached(root: string, reach: Reach): Walked {
  const walked = walkProject(root);
  if (reach === "everything") return walked;

  const tracked = trackedFiles(root);
  if (tracked.kind === "unavailable") return walked;
  const known = new Set(tracked.paths.map((path) => join(root, path)));
  return {
    files: walked.files.filter((path) => known.has(path)),
    unreadable: walked.unreadable,
    selfGoverned: walked.selfGoverned,
    couldNotSkipIgnored: walked.couldNotSkipIgnored,
  };
}

type Answering =
  | { readonly kind: "none" }
  | { readonly kind: "named"; readonly apps: ReadonlyMap<string, ReadonlySet<string>> };

function appAbove(where: string): string {
  const above = dirname(where);
  return above === "." ? "" : above;
}

function commandsAnswering(root: string, shape: Shape): Answering {
  if (shape.kind !== "tauri") return { kind: "none" };

  const apps = new Map<string, Set<string>>();
  for (const where of shape.rustUnder) {
    const said = commandsUnder(looperRoot(), join(root, where));
    if (said.kind !== "named") continue;
    const app = appAbove(where);
    const held = apps.get(app);
    const names = held === undefined ? new Set<string>() : held;
    for (const name of said.names) names.add(name);
    apps.set(app, names);
  }
  return apps.size === 0 ? { kind: "none" } : { kind: "named", apps };
}

export function answeringFor(
  apps: ReadonlyMap<string, ReadonlySet<string>>,
  file: string,
): Answered {
  let owner = "";
  let found = false;
  for (const app of apps.keys()) {
    if (app !== "" && file !== app && !file.startsWith(`${app}/`)) continue;
    if (found && app.length <= owner.length) continue;
    owner = app;
    found = true;
  }
  if (!found) return { kind: "none" };
  const names = apps.get(owner);
  if (names === undefined) return { kind: "none" };
  return { kind: "named", names };
}

export function surveyProject(root: string, reach: Reach, only: readonly string[]): Survey {
  const concessions = readConcessions(root);
  const checks = [...CHECKS, ...checksAdoptedIn(root)];
  const violations: Violation[] = [];
  const unreadable: string[] = [];
  const walked = reached(root, reach);
  const files = walked.files.filter((path) => under(root, only, path));
  unreadable.push(...walked.unreadable);

  const shape = shapeOf(root);
  const answered = commandsAnswering(root, shape);
  const rustFiles = files.filter((path) => path.endsWith(RUST_EXTENSION));
  const rustSaid = judgeRustIn(root, rustFiles);
  violations.push(...rustSaid.violations);
  unreadable.push(...rustSaid.unreadable);

  const named = files.map((path) => relative(root, path));
  violations.push(...undeclaredLanguagesIn(root, named));
  violations.push(...variantsIn(root, named, concessions));

  const pythonFiles = files.filter((path) => path.endsWith(PYTHON_EXTENSION));
  const pythonSaid = judgePythonIn(root, pythonFiles);
  violations.push(...pythonSaid.violations);
  unreadable.push(...pythonSaid.unreadable);

  const csharpFiles = files.filter(isCsharp);
  const csharpSaid = judgeCsharpIn(root, csharpFiles);
  violations.push(...csharpSaid.violations);
  unreadable.push(...csharpSaid.unreadable);

  for (const path of files) {
    if (path.endsWith(RUST_EXTENSION) || path.endsWith(PYTHON_EXTENSION)) continue;
    if (isCsharp(path)) continue;
    const named = relative(root, path);
    if (isStyling(named)) {
      let styling = "";
      try {
        styling = readFileSync(path, "utf8");
      } catch (cause) {
        unreadable.push(`${named} (${reasonFrom(cause)})`);
        continue;
      }
      violations.push(
        ...judge(CSS_CHECKS, "fast", { file: named, text: styling }, concessions).violations,
      );
      continue;
    }
    let text = "";
    try {
      text = readFileSync(path, "utf8");
    } catch (cause) {
      const detail = reasonFrom(cause);
      unreadable.push(`${named} (${detail})`);
      continue;
    }
    if (answered.kind === "named") {
      const owner = answeringFor(answered.apps, named);
      if (owner.kind === "named") {
        violations.push(
          ...crossingsIn(named, text, owner.names).map((held) => ({ ...held, file: named })),
        );
      }
    }
    const subject = { file: path, text };
    violations.push(
      ...judge(checks, "fast", { file: named, text, role: roleOf(shape, named) }, concessions)
        .violations,
      ...judge(checks, "slow", subject, concessions).violations.map((held) => ({
        ...held,
        file: named,
      })),
    );
  }

  const couldNotParse = violations.filter((held) => held.rule === UNREADABLE_FILE).length;
  const openedButUnjudged = couldNotParse + pythonSaid.unjudged + csharpSaid.unjudged;

  return {
    violations,
    files: files.length,
    unreadable,
    unjudged: unreadable.length - pythonSaid.unreadable.length + pythonSaid.unjudged
      + couldNotParse,
    judged: files.length - openedButUnjudged,
    selfGoverned: walked.selfGoverned,
    couldNotSkipIgnored: walked.couldNotSkipIgnored,
  };
}
