import { join } from "node:path";
import { ROOT_SECTION, parseToml, tableIn } from "../toml.ts";
import { readOrdinary } from "../ordinary.ts";

export type Reach = "internal" | "external";

export type Check = {
  readonly label: string;
  readonly reach: Reach;
  readonly run: string;
  readonly patience: number;
};

export const PATIENCE_SECONDS = 30;

export type Declared = {
  readonly checks: readonly Check[];
  readonly complaints: readonly string[];
};

export const LOOP_FILE = ".looper/loop.toml";

const NOTHING: readonly Check[] = [];

function reachOf(raw: string | undefined, label: string): Reach | string {
  if (raw === "internal") return "internal";
  if (raw === "external") return "external";
  if (raw === undefined) return `${label}: no reach, say internal or external`;
  return `${label}: reach is "${raw}", say internal or external`;
}

function patienceOf(table: ReadonlyMap<string, unknown>, label: string): number | string {
  const held = table.get("patience");
  if (held === undefined) return PATIENCE_SECONDS;
  if (typeof held !== "number" || !Number.isFinite(held) || held <= 0) {
    return `${label}: patience is ${JSON.stringify(held)}, say a number of seconds above zero`;
  }
  return held;
}

function oneString(table: ReadonlyMap<string, unknown>, key: string): string | undefined {
  const held = table.get(key);
  if (typeof held === "string") return held;
  return undefined;
}

export function declaredIn(root: string): Declared {
  const read = readOrdinary(join(root, LOOP_FILE));
  if (read.kind === "absent") return { checks: NOTHING, complaints: [] };
  if (read.kind === "unreadable") {
    return {
      checks: NOTHING,
      complaints: [`${LOOP_FILE} could not be read (${read.why}), so nothing here was asked`],
    };
  }
  const document = parseToml(read.text, LOOP_FILE);
  const checks: Check[] = [];
  const complaints: string[] = [];
  for (const label of document.keys()) {
    if (label === ROOT_SECTION) continue;
    const table = tableIn(document, label);
    const reach = reachOf(oneString(table, "reach"), label);
    const patience = patienceOf(table, label);
    const run = oneString(table, "run");
    if (run === undefined) {
      complaints.push(`${label}: no run, so there is nothing to ask`);
      continue;
    }
    if (reach !== "internal" && reach !== "external") {
      complaints.push(reach);
      continue;
    }
    if (typeof patience === "string") {
      complaints.push(`${patience}. It ran with ${PATIENCE_SECONDS} instead, because a check that does not run guards nothing.`);
      checks.push({ label, reach, run, patience: PATIENCE_SECONDS });
      continue;
    }
    checks.push({ label, reach, run, patience });
  }
  return { checks, complaints };
}
