import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PYTHON_EXTENSION, RUST_EXTENSION } from "../config.ts";
import { checksAdoptedIn } from "./adopted.ts";
import { CHECKS } from "./checks.ts";
import { readConcessions } from "./concessions.ts";
import { variantsIn } from "./copy.ts";
import { CSS_CHECKS } from "./css/checks.ts";
import { isStyling } from "./css/read.ts";
import { judge } from "./engine.ts";
import { isCsharp, judgeCsharpIn, judgePythonIn, judgeRustIn } from "./readers.ts";
import type { Violation } from "./rule.ts";
import { roleOf, shapeOf } from "./shape.ts";

export type Law = "rust" | "python" | "csharp" | "css" | "typescript";

export function lawFor(relative: string): Law {
  if (relative.endsWith(RUST_EXTENSION)) return "rust";
  if (relative.endsWith(PYTHON_EXTENSION)) return "python";
  if (isCsharp(relative)) return "csharp";
  if (isStyling(relative)) return "css";
  return "typescript";
}

export type Where = {
  readonly settings: string;
  readonly content: string;
};

export function inPlace(root: string): Where {
  return { settings: root, content: root };
}

export type Found = {
  readonly violations: readonly Violation[];
  readonly unjudged: readonly string[];
};

function readByAnother(law: Law, where: Where, relative: string): Found {
  const path = join(where.content, relative);
  const said =
    law === "rust"
      ? judgeRustIn(where.content, [path])
      : law === "python"
      ? judgePythonIn(where.content, [path])
      : judgeCsharpIn(where.content, [path]);
  return {
    violations: said.violations.filter((held) => held.file === relative),
    unjudged: said.unreadable,
  };
}

export function foundIn(where: Where, relative: string): Found {
  const law = lawFor(relative);
  const concessions = readConcessions(where.settings);
  const copied = variantsIn(where.content, [relative], concessions);
  const text = (): string => readFileSync(join(where.content, relative), "utf8");
  const styled = isStyling(relative)
    ? judge(CSS_CHECKS, "fast", { file: relative, text: text() }, concessions).violations
    : [];
  if (law === "rust" || law === "python" || law === "csharp") {
    const read = readByAnother(law, where, relative);
    return { violations: [...copied, ...styled, ...read.violations], unjudged: read.unjudged };
  }
  if (law === "css") return { violations: [...copied, ...styled], unjudged: [] };
  const subject = { file: relative, text: text(), role: roleOf(shapeOf(where.settings), relative) };
  const checks = [...CHECKS, ...checksAdoptedIn(where.settings)];
  return { violations: [...copied, ...judge(checks, "fast", subject, concessions).violations], unjudged: [] };
}
