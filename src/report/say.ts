import { REPORT_TOOL } from "../config.ts";

export const A_FAULT_IN_LOOPER = `That is a fault in looper, not in your work: say so with the \`${REPORT_TOOL}\` tool.`;

export const IF_THE_RULE_IS_WRONG = `If a rule is wrong rather than the code, say so with the \`${REPORT_TOOL}\` tool, or \`looper report\` in a shell.`;

const FIX_WHAT_IT_NAMES = "That is this project's to fix: mend what it names and looper can check again.";

function whose(ours: boolean): string {
  return ours ? A_FAULT_IN_LOOPER : FIX_WHAT_IT_NAMES;
}

export function couldNotJudge(capability: string, detail: string, ours: boolean): string {
  return `looper: ${capability} could not reach a verdict (${detail}), so what it checks was not checked just now. ${whose(ours)}`;
}

export function couldNotSpeak(capability: string, detail: string, ours: boolean): string {
  return `looper: ${capability} could not contribute to this turn (${detail}), so whatever it would have said is missing above. ${whose(ours)}`;
}

export function couldNotAnswer(tool: string, detail: string, ours: boolean): string {
  return `looper's ${tool} tool failed (${detail}), so it did nothing. ${whose(ours)}`;
}
