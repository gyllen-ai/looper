import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

import {
  CSS_SECTION,
  ENTRY_SECTION,
  LAW_PATH,
  MAX_LOC_DEFAULT,
  PALETTE_DEFAULT,
  SANCTUM_DEFAULT,
  TRACE_SYMBOLS,
  SHARED_TRUTH_SECTION,
  TS_SECTION,
  Z_INDEX_CAP_DEFAULT,
} from "../config.ts";
import {
  ROOT_SECTION,
  numberAt,
  parseToml,
  oneOrManyAt,
  stringsAt,
  tableIn,
  type TomlDocument,
} from "../toml.ts";
import { fieldAt, reasonFrom } from "../fields.ts";

const DISABLED_SECTION = "rules";

const EXEMPT_SECTION = "exempt";

const ALL_RULES = "ALL";

const NAMESPACED = /^[A-Z]+-/;

export function withoutLanguage(ruleId: string): string {
  return ruleId.replace(NAMESPACED, "");
}

export type Concessions = {
  readonly projectRoot: string;
  readonly maxLoc: number;
  readonly disabled: readonly string[];
  readonly pardons: ReadonlyMap<string, readonly string[]>;
  readonly sanctum: string;
  readonly envFiles: readonly string[];
  readonly entryFiles: readonly string[];
  readonly traceSymbols: readonly string[];
  readonly loggers: readonly string[];
  readonly generated: readonly string[];
  readonly palette: readonly string[];
  readonly zIndexCap: number;
};

export const CONCEDING_NOTHING: Concessions = {
  projectRoot: ".",
  maxLoc: MAX_LOC_DEFAULT,
  disabled: [],
  pardons: new Map(),
  sanctum: SANCTUM_DEFAULT,
  envFiles: [SANCTUM_DEFAULT],
  entryFiles: [],
  generated: [],
  traceSymbols: TRACE_SYMBOLS,
  loggers: [],
  palette: [PALETTE_DEFAULT],
  zIndexCap: Z_INDEX_CAP_DEFAULT,
};

export function isNamed(file: string, names: readonly string[]): boolean {
  const plain = file.replace(/^\.\//, "");
  return names.some((name) => {
    const wanted = name.replace(/^\.\//, "");
    if (plain === wanted) return true;
    if (plain.endsWith(`/${wanted}`)) return true;
    return basename(plain) === wanted && !wanted.includes("/");
  });
}

function declaredEntries(root: string): readonly string[] {
  const path = join(root, "package.json");
  if (!existsSync(path)) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (cause) {
    const detail = reasonFrom(cause);
    return [`unreadable package.json (${detail})`];
  }
  if (parsed === null || typeof parsed !== "object") return [];

  const found: string[] = [];
  const main = fieldAt(parsed, "main");
  if (typeof main === "string") found.push(main);
  const bin = fieldAt(parsed, "bin");
  if (typeof bin === "string") found.push(bin);
  if (bin !== null && typeof bin === "object") {
    for (const held of Object.values(bin)) {
      if (typeof held === "string") found.push(held);
    }
  }
  return found;
}

function pardonsIn(document: TomlDocument): ReadonlyMap<string, readonly string[]> {
  const table = tableIn(document, EXEMPT_SECTION);
  const pardons = new Map<string, readonly string[]>();
  for (const [file] of table) pardons.set(file, stringsAt(table, file, LAW_PATH));
  return pardons;
}

function firstOr(chosen: readonly string[], fallback: string): string {
  const held = chosen[0];
  if (held === undefined) return fallback;
  return held;
}

function orElse(chosen: readonly string[], fallback: readonly string[]): readonly string[] {
  if (chosen.length === 0) return fallback;
  return chosen;
}

export function readConcessions(root: string): Concessions {
  const entries = declaredEntries(root);
  const path = join(root, LAW_PATH);
  if (!existsSync(path)) {
    return { ...CONCEDING_NOTHING, projectRoot: root, entryFiles: entries };
  }

  const document = parseToml(readFileSync(path, "utf8"), LAW_PATH);
  const css = tableIn(document, CSS_SECTION);
  const ts = tableIn(document, TS_SECTION);
  const shared = tableIn(document, SHARED_TRUTH_SECTION);
  const eitherWay = (key: string): readonly string[] => {
    const own = oneOrManyAt(ts, key, LAW_PATH);
    return own.length > 0 ? own : oneOrManyAt(shared, key, LAW_PATH);
  };
  const sanctum = firstOr(eitherWay("sanctum"), SANCTUM_DEFAULT);

  return {
    projectRoot: root,
    maxLoc: numberAt(tableIn(document, ROOT_SECTION), "max_loc", MAX_LOC_DEFAULT),
    disabled: stringsAt(tableIn(document, DISABLED_SECTION), "disabled", LAW_PATH),
    pardons: pardonsIn(document),
    sanctum,
    envFiles: orElse(eitherWay("env_files"), [sanctum, ...entries]),
    entryFiles: orElse(stringsAt(tableIn(document, ENTRY_SECTION), "files", LAW_PATH), entries),
    traceSymbols: orElse(eitherWay("trace_symbols"), TRACE_SYMBOLS),
    loggers: eitherWay("loggers"),
    generated: stringsAt(tableIn(document, ROOT_SECTION), "generated", LAW_PATH),
    palette: orElse(oneOrManyAt(css, "palette", LAW_PATH), [PALETTE_DEFAULT]),
    zIndexCap: numberAt(css, "z_max", Z_INDEX_CAP_DEFAULT),
  };
}

function pardonedIn(concessions: Concessions, file: string, ruleId: string): boolean {
  for (const [named, rules] of concessions.pardons) {
    if (!isNamed(file, [named])) continue;
    if (rules.includes(ALL_RULES) || rules.includes(ruleId)) return true;
    if (rules.includes(withoutLanguage(ruleId))) return true;
  }
  return false;
}

export type Standing =
  | { readonly kind: "stands" }
  | { readonly kind: "disabled" }
  | { readonly kind: "pardoned" };

export function standingOf(
  concessions: Concessions,
  file: string,
  ruleId: string,
): Standing {
  if (concessions.disabled.includes(ruleId)) return { kind: "disabled" };
  if (pardonedIn(concessions, file, ruleId)) return { kind: "pardoned" };
  return { kind: "stands" };
}
