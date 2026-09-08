import { RuleOnTheWrongPass } from "../errors.ts";
import { setAside, standingOf, type Concessions } from "./concessions.ts";
import type { Pass, Role, Rule, Violation } from "./rule.ts";

export type Subject = {
  readonly file: string;
  readonly text: string;
  readonly role?: Role;
};

export type Finding = { readonly line: number; readonly said?: string };

export type Check = {
  readonly rule: Rule;
  run(subject: Subject, concessions: Concessions): readonly Finding[];
};

export type Judgement = {
  readonly violations: readonly Violation[];
  readonly conceded: readonly string[];
};

function belongsHere(rule: Rule, role: Role | undefined): boolean {
  if (rule.onlyFor === undefined || role === undefined) return true;
  return rule.onlyFor === role;
}

function applies(check: Check, pass: Pass): boolean {
  return check.rule.pass === pass;
}

export function judge(
  checks: readonly Check[],
  pass: Pass,
  subject: Subject,
  concessions: Concessions,
): Judgement {
  const violations: Violation[] = [];
  const conceded: string[] = [];

  for (const check of checks) {
    if (!applies(check, pass)) continue;
    if (!belongsHere(check.rule, subject.role)) continue;
    const standing = standingOf(concessions, subject.file, check.rule.id);
    if (setAside(standing)) {
      conceded.push(`${check.rule.id} (${standing.kind})`);
      continue;
    }
    for (const finding of check.run(subject, concessions)) {
      violations.push({
        rule: check.rule,
        file: subject.file,
        line: finding.line,
        said: finding.said,
      });
    }
  }

  return { violations, conceded };
}

export function onlyForPass(checks: readonly Check[], pass: Pass): readonly Check[] {
  for (const check of checks) {
    if (check.rule.pass !== "fast" && check.rule.pass !== "slow") {
      throw new RuleOnTheWrongPass(check.rule.id, check.rule.pass);
    }
  }
  return checks.filter((check) => applies(check, pass));
}
