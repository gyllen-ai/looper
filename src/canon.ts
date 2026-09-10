import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { CANON_DIR, DOCTRINE_DIR, isABranchName } from "./config.ts";

export type CanonBranch = {
  readonly name: string;
  readonly body: string;
};

const BRANCH_NAMES: readonly string[] = ["law", "process",
  "architecture", "rust", "python", "csharp", "css", "doctrine", "security", "evidence",
  "frontend", "sources",
  "structure", "discipline", "authority", "voice", "deps", "debugging",
  "data/schema", "data/indexing", "data/migrations", "data/queries",
  "runtime/time", "runtime/failure", "runtime/concurrency", "runtime/performance",
  "contract/versioning", "contract/serialization",
  "observe/logging", "observe/health",
  "secure/secrets", "secure/identity", "secure/input",
  "ui/state", "ui/assets", "ui/motion", "ui/reach", "ui/line",
  "work/testing", "work/deploy", "work/config",
];

const TYPESCRIPT: readonly string[] = [
  "**/*.ts",
  "**/*.tsx",
  "**/*.mts",
  "**/*.cts",
  "**/*.js",
  "**/*.jsx",
  "**/*.mjs",
  "**/*.cjs",
];

const RUST: readonly string[] = ["**/*.rs"];

const PYTHON: readonly string[] = ["**/*.py"];

const CSHARP: readonly string[] = ["**/*.cs", "**/*.razor"];

const STYLED: readonly string[] = [
  "**/*.css",
  "**/*.scss",
  "**/*.sass",
  "**/*.html",
  "**/*.htm",
  "**/*.razor",
];

const WHERE_SECRETS_LIVE: readonly string[] = [
  "**/.env*",
  "**/*secret*",
  "**/*credential*",
  "**/*auth*",
  "**/*token*",
  "**/config.*",
];

const WRITTEN_DOWN: readonly string[] = ["**/*.md"];

const SCHEMA_LIVES: readonly string[] = ["**/migrations/**", "**/*.sql", "**/schema/**", "**/schema.*"];
const WIRE_LIVES: readonly string[] = ["**/protocol/**", "**/*.proto", "**/schema/**", "**/wire/**"];
const WHO_YOU_ARE: readonly string[] = ["**/*auth*", "**/*session*", "**/*permission*", "**/*role*"];
const DRAWN: readonly string[] = ["**/*.tsx", "**/*.jsx", "**/pages/**", "**/components/**"];
const PICTURES: readonly string[] = ["**/assets/**", "**/design/**", "**/*.svg", "**/*.png", "**/*.woff2"];
const MOVING: readonly string[] = ["**/*.css", "**/*.scss", "**/*.sass", "**/*anim*", "**/*motion*", "**/*transition*"];
const PROVEN: readonly string[] = ["**/tests/**", "**/*.test.*", "**/*_test.*", "**/*spec*"];
const SHIPPED: readonly string[] = ["**/deploy*", "**/*.service", "**/.github/workflows/**", "**/Dockerfile*"];
const SETTINGS: readonly string[] = ["**/config.*", "**/*.env*", "**/settings.*"];

const LOOKED_AT: readonly string[] = [
  "**/*.tsx",
  "**/*.jsx",
  "**/*.css",
  "**/*.scss",
  "**/*.sass",
  "**/*.html",
  "**/*.htm",
  "**/*.razor",
  "**/components/**",
  "**/pages/**",
];

export function canonGoverns(): ReadonlyMap<string, readonly string[]> {
  return new Map([
    ["law", TYPESCRIPT],
    ["rust", RUST],
    ["python", PYTHON],
    ["csharp", CSHARP],
    ["css", STYLED],
    ["evidence", WRITTEN_DOWN],
    ["frontend", LOOKED_AT],
    ["doctrine", [`${DOCTRINE_DIR}/**`]],
    ["data/schema", SCHEMA_LIVES],
    ["data/indexing", SCHEMA_LIVES],
    ["data/migrations", ["**/migrations/**"]],
    ["data/queries", ["**/*.sql"]],
    ["contract/versioning", WIRE_LIVES],
    ["contract/serialization", WIRE_LIVES],
    ["secure/secrets", WHERE_SECRETS_LIVE],
    ["secure/identity", WHO_YOU_ARE],
    ["ui/state", DRAWN],
    ["ui/assets", PICTURES],
    ["ui/motion", MOVING],
    ["ui/reach", DRAWN],
    ["ui/line", LOOKED_AT],
    ["work/testing", PROVEN],
    ["work/deploy", SHIPPED],
    ["work/config", SETTINGS],
  ]);
}

function read(name: string): string {
  return readFileSync(fileFor(name), "utf8").trim();
}


export function canonConstitution(): string {
  return read("constitution");
}

export function canonBranches(): readonly CanonBranch[] {
  return BRANCH_NAMES.map((name) => ({ name, body: read(name) }));
}

export function canonBranchNames(): readonly string[] {
  return BRANCH_NAMES;
}

const PULLED_BY_NAME: readonly string[] = ["sources", "process", "architecture", "security",
  "structure", "discipline", "authority", "voice", "deps", "debugging",
  "runtime/time", "runtime/failure", "runtime/concurrency", "runtime/performance",
  "observe/logging", "observe/health", "secure/input",
];

export function pulledByName(): readonly string[] {
  return PULLED_BY_NAME;
}

export type CanonLookup =
  | { readonly kind: "nowhere" }
  | { readonly kind: "found"; readonly body: string };

function fileFor(name: string): string {
  return join(import.meta.dirname, CANON_DIR, `${name}.md`);
}

export function canonBranch(name: string): CanonLookup {
  if (BRANCH_NAMES.includes(name)) return { kind: "found", body: read(name) };
  if (!isABranchName(name) || !existsSync(fileFor(name))) return { kind: "nowhere" };
  return { kind: "found", body: read(name) };
}
