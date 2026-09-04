import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { canonBranch, canonBranchNames, canonConstitution } from "./canon.ts";
import {
  CONSTITUTION_PATH,
  DOCTRINE_DIR,
  DOCTRINE_SEPARATOR,
  branchHeading,
  isABranchName,
} from "./config.ts";

export { isABranchName };

export type ProjectHalf =
  | { readonly kind: "absent" }
  | { readonly kind: "empty" }
  | { readonly kind: "present"; readonly text: string };

export type Assembly = {
  readonly text: string;
  readonly halves: readonly string[];
};

export function readProjectConstitution(root: string): ProjectHalf {
  const path = join(root, CONSTITUTION_PATH);
  if (!existsSync(path)) return { kind: "absent" };
  const text = readFileSync(path, "utf8").trim();
  if (text.length === 0) return { kind: "empty" };
  return { kind: "present", text };
}

const NOT_A_BRANCH: readonly string[] = ["constitution", "README"];

function stemsUnder(dir: string, prefix: string): readonly string[] {
  if (!existsSync(dir)) return [];
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      found.push(...stemsUnder(join(dir, entry.name), `${prefix}${entry.name}/`));
      continue;
    }
    if (!entry.name.endsWith(".md")) continue;
    found.push(`${prefix}${entry.name.slice(0, -".md".length)}`);
  }
  return found;
}

export function listBranches(root: string): readonly string[] {
  const names = new Set<string>(canonBranchNames());
  for (const stem of stemsUnder(join(root, DOCTRINE_DIR), "")) {
    if (NOT_A_BRANCH.includes(stem)) continue;
    names.add(stem);
  }
  return [...names].sort();
}

export type BranchLookup =
  | { readonly kind: "nowhere" }
  | { readonly kind: "found"; readonly text: string; readonly halves: readonly string[] };

export function readProjectBranch(root: string, name: string): ProjectHalf {
  if (!isABranchName(name)) return { kind: "absent" };
  const path = join(root, DOCTRINE_DIR, `${name}.md`);
  if (!existsSync(path)) return { kind: "absent" };
  const text = readFileSync(path, "utf8").trim();
  if (text.length === 0) return { kind: "empty" };
  return { kind: "present", text };
}

export function assembleBranch(root: string, name: string): BranchLookup {
  const canon = canonBranch(name);
  const project = readProjectBranch(root, name);
  const halves: string[] = [];
  const bodies: string[] = [];

  if (canon.kind === "found") {
    halves.push("canon");
    bodies.push(canon.body);
  }
  if (project.kind === "present") {
    halves.push("project");
    bodies.push(project.text);
  }
  if (bodies.length === 0) return { kind: "nowhere" };

  return {
    kind: "found",
    text: `${branchHeading(name)}\n${bodies.join(DOCTRINE_SEPARATOR)}`,
    halves,
  };
}

const INDEX_HEADER = [
  "Rule sets. Those tied to what you are editing arrive on their own; before editing",
  "elsewhere, pull that set by name. A question needs none: go to the running system",
  "first.",
].join("\n");

const SAID_AS: ReadonlyMap<string, string> = new Map([
  ["law", "law (TypeScript)"],
  ["sources", "sources (prior work)"],
  ["structure", "structure (shape first)"],
  ["discipline", "discipline (writing code)"],
  ["evidence", "evidence (documents)"],
]);

function nameOf(branch: string): string {
  const said = SAID_AS.get(branch);
  return said === undefined ? branch : said;
}

function rowsFor(root: string): readonly string[] {
  const canon = new Set(canonBranchNames());
  const shared: string[] = [];
  const own: string[] = [];
  const groups = new Map<string, string[]>();
  for (const name of listBranches(root)) {
    const cut = name.indexOf("/");
    if (cut < 0) {
      (canon.has(name) ? shared : own).push(nameOf(name));
      continue;
    }
    const head = name.slice(0, cut);
    const kids = groups.get(head);
    if (kids === undefined) groups.set(head, [name.slice(cut + 1)]);
    else kids.push(name.slice(cut + 1));
  }
  const rows = [`- ${shared.join(", ")}`];
  for (const [head, kids] of groups) rows.push(`- ${head}/ ${kids.join(", ")}`);
  if (own.length > 0) rows.push(`- this project's own: ${own.join(", ")}`);
  return rows;
}

export function branchIndex(root: string): string {
  return `${INDEX_HEADER}\n\n${rowsFor(root).join("\n")}`;
}

export function assembleConstitution(project: ProjectHalf): Assembly {
  const canon = canonConstitution();
  if (project.kind !== "present") {
    return { text: canon, halves: ["canon"] };
  }
  return {
    text: `${canon}${DOCTRINE_SEPARATOR}${project.text}`,
    halves: ["canon", "project"],
  };
}
