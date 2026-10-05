import { join } from "node:path";

import { FRESHNESS_SECTION, GOVERNS_SECTION, MAP_PATH } from "./config.ts";
import { parseToml, stringsAt, tableIn } from "./toml.ts";
import { readOrdinaryOrSay } from "./ordinary.ts";

export type Governs = ReadonlyMap<string, readonly string[]>;

export type DoctrineMap =
  | { readonly kind: "absent" }
  | { readonly kind: "present"; readonly governs: Governs };

function governsIn(source: string, section: string): Governs {
  const document = parseToml(source, MAP_PATH);
  const table = tableIn(document, section);
  const governs = new Map<string, readonly string[]>();
  for (const [branch] of table) {
    governs.set(branch, stringsAt(table, branch, MAP_PATH));
  }
  return governs;
}

export type MapComplaint = { readonly branch: string; readonly why: string };

export function unheardIn(
  governs: Governs,
  known: readonly string[],
  matchedBy: (globs: readonly string[]) => boolean,
): readonly MapComplaint[] {
  const said: MapComplaint[] = [];
  for (const [branch, globs] of governs) {
    if (globs.length === 0) continue;
    if (!known.includes(branch)) {
      said.push({
        branch,
        why: "there is no rule set by that name, so the area it names has no rules at all",
      });
      continue;
    }
    if (globs.length > 0 && !matchedBy(globs)) {
      said.push({ branch, why: "nothing in this project matches what it governs" });
    }
  }
  return said;
}

export function withCanonDefaults(project: Governs, canon: Governs): Governs {
  const merged = new Map<string, readonly string[]>(project);
  for (const [branch, paths] of canon) {
    if (merged.has(branch)) continue;
    merged.set(branch, paths);
  }
  return merged;
}

export function parseMap(source: string): Governs {
  return governsIn(source, GOVERNS_SECTION);
}

const A_BRANCH_LINE = /^\s*"?[A-Za-z0-9_.-]+"?\s*=\s*\[/;

export function branchLinesOutsideASection(source: string): readonly string[] {
  const stray: string[] = [];
  let inSection = false;
  for (const line of source.split("\n")) {
    const said = line.trim();
    if (said.startsWith("#") || said.length === 0) continue;
    if (said.startsWith("[")) {
      inSection = true;
      continue;
    }
    if (!inSection && A_BRANCH_LINE.test(said)) stray.push(said);
  }
  return stray;
}

export function parseFreshnessMap(source: string): Governs {
  const own = governsIn(source, FRESHNESS_SECTION);
  return own.size > 0 ? own : governsIn(source, GOVERNS_SECTION);
}

export function readFreshnessMap(root: string): DoctrineMap {
  const read = readOrdinaryOrSay(join(root, MAP_PATH));
  if (read.kind === "absent") return { kind: "absent" };
  return { kind: "present", governs: parseFreshnessMap(read.text) };
}

export function readMap(root: string): DoctrineMap {
  const read = readOrdinaryOrSay(join(root, MAP_PATH));
  if (read.kind === "absent") return { kind: "absent" };
  return { kind: "present", governs: parseMap(read.text) };
}

function segmentMatches(pattern: string, segment: string): boolean {
  const parts = pattern.split("*");
  if (parts.length === 1) return pattern === segment;

  const first = parts[0];
  const last = parts[parts.length - 1];
  if (first === undefined || last === undefined) return false;
  if (!segment.startsWith(first) || !segment.endsWith(last)) return false;
  if (segment.length < first.length + last.length) return false;

  let cursor = first.length;
  for (const middle of parts.slice(1, -1)) {
    const found = segment.indexOf(middle, cursor);
    if (found === -1) return false;
    cursor = found + middle.length;
  }
  return true;
}

function walk(pattern: readonly string[], path: readonly string[]): boolean {
  const head = pattern[0];
  if (head === undefined) return path.length === 0;
  if (head === "**") {
    const rest = pattern.slice(1);
    for (let skip = 0; skip <= path.length; skip += 1) {
      if (walk(rest, path.slice(skip))) return true;
    }
    return false;
  }
  const segment = path[0];
  if (segment === undefined) return false;
  if (!segmentMatches(head, segment)) return false;
  return walk(pattern.slice(1), path.slice(1));
}

export function matches(pattern: string, path: string): boolean {
  return walk(pattern.split("/"), path.split("/"));
}

type Touched = { readonly branch: string; readonly hits: number; readonly own: boolean };

function ownFirst(left: Touched, right: Touched): number {
  return Number(right.own) - Number(left.own);
}

export function branchesFor(
  governs: Governs,
  paths: readonly string[],
  own: ReadonlySet<string>,
): readonly string[] {
  const found: Touched[] = [];
  for (const [branch, globs] of governs) {
    const hits = paths.filter((path) => globs.some((glob) => matches(glob, path))).length;
    if (hits > 0) found.push({ branch, hits, own: own.has(branch) });
  }
  return found
    .sort(
      (left, right) =>
        right.hits - left.hits || ownFirst(left, right) || left.branch.localeCompare(right.branch),
    )
    .map((held) => held.branch);
}
