import { relative } from "node:path";

import { CONCEDING_NOTHING, readConcessions } from "../law/concessions.ts";
import { judge } from "../law/engine.ts";
import { judgedFiles } from "../law/project.ts";
import { checkFor, type Adopted } from "./shapes.ts";
import { readOrdinary } from "../ordinary.ts";

export type Where = { readonly file: string; readonly line: number };

export type Sweep = {
  readonly where: readonly Where[];
  readonly unreadable: readonly string[];
};

export function sweepFor(root: string, adopted: Adopted): Sweep {
  const check = checkFor(adopted);
  const concessions = readConcessions(root);
  const found: Where[] = [];
  const unreadable: string[] = [];

  for (const path of judgedFiles(root)) {
    const named = relative(root, path);
    const read = readOrdinary(path);
    if (read.kind !== "text") {
      unreadable.push(`${named} (${read.kind === "absent" ? "it was not there" : read.why})`);
      continue;
    }
    const text = read.text;
    for (const violation of judge([check], "fast", { file: named, text }, concessions)
      .violations) {
      found.push({ file: named, line: violation.line });
    }
  }

  return { where: found, unreadable };
}

export function instancesOf(root: string, adopted: Adopted): readonly Where[] {
  return sweepFor(root, adopted).where;
}

export type Proposal =
  | { readonly kind: "no-evidence"; readonly what: string }
  | { readonly kind: "found"; readonly where: readonly Where[] };

export function proposeRule(root: string, adopted: Adopted): Proposal {
  const where = instancesOf(root, adopted);
  if (where.length === 0) return { kind: "no-evidence", what: adopted.what };
  return { kind: "found", where };
}

export type Ratified =
  | { readonly kind: "refused"; readonly remaining: readonly Where[] }
  | { readonly kind: "adopted"; readonly rule: Adopted };

export function ratify(
  root: string,
  adopted: Adopted,
  evidence: readonly string[],
): Ratified {
  const remaining = instancesOf(root, adopted);
  if (remaining.length > 0) return { kind: "refused", remaining };
  return { kind: "adopted", rule: { ...adopted, evidence } };
}
