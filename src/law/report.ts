import {
  CATEGORY_ORDER,
  spiritOf,
  type Category,
  type Rule,
  type Violation,
} from "./rule.ts";

const WHOLE_FILE = 0;

function where(violation: Violation): string {
  const named = typeof violation.said === "string" ? ` (${violation.said})` : "";
  if (violation.line === WHOLE_FILE) return `${violation.file} (the whole file)`;
  return `${violation.file}:${violation.line}${named}`;
}

function groupByRule(
  violations: readonly Violation[],
  category: Category,
): ReadonlyMap<Rule, readonly string[]> {
  const grouped = new Map<Rule, string[]>();
  for (const violation of violations) {
    if (violation.rule.category !== category) continue;
    const held = grouped.get(violation.rule);
    if (held === undefined) {
      grouped.set(violation.rule, [where(violation)]);
      continue;
    }
    held.push(where(violation));
  }
  return grouped;
}

function entry(rule: Rule, places: readonly string[]): readonly string[] {
  const lines = [
    ``,
    `  [${rule.id}]  ${places.join("  |  ")}`,
    `    not allowed: ${rule.bans}`,
    `    why: ${rule.why}`,
    `    the shape that works instead — the names in it are examples, not code to copy:`,
  ];
  for (const spelling of rule.instead) lines.push(`      ${spelling}`);
  if (rule.valve.kind === "knob") {
    lines.push(`    if this rule is wrong here: law.toml ${rule.valve.key} — ${rule.valve.note}`);
  }
  return lines;
}

export type Standing = "some-new" | "all-older";

export function formatReport(violations: readonly Violation[], standing: Standing): string {
  const count = violations.length;
  const noun = count === 1 ? "problem" : "problems";
  const lines = [
    ``,
    standing === "all-older"
      ? `looper found ${count} ${noun}, all of them older than looper.`
      : `looper found ${count} ${noun}.`,
    `Each one below says what is not allowed, why the rule exists, and how to write`,
    `it instead. You do not need to read anything else to fix these.`,
  ];

  let shown = 0;
  for (const category of CATEGORY_ORDER) {
    const grouped = groupByRule(violations, category);
    if (grouped.size === 0) continue;
    lines.push(``, `--- ${category} --- ${spiritOf(category)}`);
    for (const [rule, places] of grouped) {
      shown += places.length;
      lines.push(...entry(rule, places));
    }
  }

  const swallowed = violations.length - shown;
  if (swallowed > 0) {
    const strangers = [...new Set(violations.map((held) => held.rule.category))].filter(
      (category) => !CATEGORY_ORDER.includes(category),
    );
    lines.push(
      ``,
      `--- looper is broken ---`,
      `  ${swallowed} problem(s) were found and could not be printed, because their`,
      `  category is not one this report knows: ${strangers.join(", ")}.`,
      `  A rule that fires and is never shown is worse than a rule that does not exist.`,
      `  Add the category to CATEGORY_ORDER in src/law/rule.ts, and please open an`,
      `  issue at github.com/gyllen-ai/looper — this is our bug, not yours.`,
    );
  }

  lines.push(
    ``,
    standing === "all-older"
      ? `${count} ${noun} above, and none of them are blocking you.`
      : `${count} ${noun} still standing. Fix every one above, then run again.`,
  );
  return lines.join("\n");
}
