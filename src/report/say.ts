import { REPORT_TOOL } from "../config.ts";

export const A_FAULT_IN_LOOPER = `That is a fault in looper, not in your work: say so with the \`${REPORT_TOOL}\` tool.`;

export const IF_THE_RULE_IS_WRONG = `If a rule is wrong rather than the code, say so with the \`${REPORT_TOOL}\` tool, or \`looper report\` in a shell.`;

export function couldNotJudge(capability: string, detail: string): string {
  return `looper: ${capability} could not reach a verdict (${detail}), so what it checks was not checked just now. ${A_FAULT_IN_LOOPER}`;
}

export function couldNotSpeak(capability: string, detail: string): string {
  return `looper: ${capability} could not contribute to this turn (${detail}), so whatever it would have said is missing above. ${A_FAULT_IN_LOOPER}`;
}
