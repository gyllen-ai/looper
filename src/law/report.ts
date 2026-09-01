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
): ReadonlyMap<Rule, readonly Violation[]> {
  const grouped = new Map<Rule, Violation[]>();
  for (const violation of violations) {
    if (violation.rule.category !== category) continue;
    const held = grouped.get(violation.rule);
    if (held === undefined) {
      grouped.set(violation.rule, [violation]);
      continue;
    }
    held.push(violation);
  }
  return grouped;
}

const MOST_PLACES_SHOWN = 8;

export function placesIn(found: readonly Violation[]): string {
  const shown = found.slice(0, MOST_PLACES_SHOWN).map(where).join("  |  ");
  const rest = found.slice(MOST_PLACES_SHOWN);
  if (rest.length === 0) return shown;
  const files = new Set(rest.map((held) => held.file)).size;
  const spread = files === 1 ? "1 file" : `${files} files`;
  return `${shown}  |  and ${rest.length} more, in ${spread} — fix these first and run again`;
}

function entry(rule: Rule, found: readonly Violation[]): readonly string[] {
  const lines = [
    ``,
    `  [${rule.id}]  ${placesIn(found)}`,
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
