import { fieldAt, reasonFrom } from "../fields.ts";
import { runDeclared, type Answered } from "../start.ts";
import { LOOP_FILE, type Check, type Reach } from "./checks.ts";

export type Verdict = "ok" | "broken" | "blind";

export type Seen = {
  readonly label: string;
  readonly reach: Reach;
  readonly verdict: Verdict;
  readonly detail: string;
  readonly millis: number;
  readonly timedOut: boolean;
};

export type Tally = {
  readonly ok: number;
  readonly broken: number;
  readonly blind: number;
  readonly failing: readonly string[];
  readonly brokenNames: readonly string[];
  readonly blindNames: readonly string[];
};

export const BLIND_EXIT = 3;

const NO_DETAIL = "no detail";

function tooSlow(check: Check): string {
  return `timed out after ${check.patience}s, so this says nothing about the thing it checks — raise patience in ${LOOP_FILE} if it needs longer`;
}

function firstLine(raw: string): string {
  for (const line of raw.split("\n")) {
    const said = line.trim();
    if (said.length > 0) return said;
  }
  return NO_DETAIL;
}

function whatItSaid(answered: Answered): string {
  const out = typeof answered.stdout === "string" ? answered.stdout : "";
  const err = typeof answered.stderr === "string" ? answered.stderr : "";
  const said = `${out}${err}`;
  if (said.trim().length > 0) return said;
  if (answered.error !== undefined) return reasonFrom(answered.error);
  if (answered.signal !== null) return `stopped by ${answered.signal} with nothing said`;
  return NO_DETAIL;
}

export function verdictOf(status: number | null, reach: Reach, answered: boolean): Verdict {
  if (!answered) return reach === "external" ? "blind" : "broken";
  if (status === 0) return "ok";
  if (status === BLIND_EXIT && reach === "external") return "blind";
  if (status === null) return reach === "external" ? "blind" : "broken";
  return "broken";
}

export function ask(check: Check, root: string): Seen {
  const began = Date.now();
  const answered = runDeclared(check.run, root, check.patience * 1000);
  const millis = Date.now() - began;
  const timedOut = fieldAt(answered.error, "code") === "ETIMEDOUT";
  const said = timedOut ? tooSlow(check) : firstLine(whatItSaid(answered));
  const verdict = verdictOf(answered.status, check.reach, answered.error === undefined);
  return { label: check.label, reach: check.reach, verdict, detail: said, millis, timedOut };
}

export function tallyOf(seen: readonly Seen[]): Tally {
  const failing: string[] = [];
  const brokenNames: string[] = [];
  const blindNames: string[] = [];
  let ok = 0;
  for (const one of seen) {
    if (one.verdict === "ok") {
      ok += 1;
      continue;
    }
    failing.push(one.label);
    if (one.verdict === "blind") blindNames.push(one.label);
    else brokenNames.push(one.label);
  }
  return {
    ok,
    broken: brokenNames.length,
    blind: blindNames.length,
    failing,
    brokenNames,
    blindNames,
  };
}
