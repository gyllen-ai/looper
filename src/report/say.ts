import { REPORT_TOOL } from "../config.ts";

export const A_FAULT_IN_LOOPER = `That is a fault in looper, not in your work: say so with the \`${REPORT_TOOL}\` tool.`;

export const IF_THE_RULE_IS_WRONG = `If a rule is wrong rather than the code, say so with the \`${REPORT_TOOL}\` tool, or \`looper report\` in a shell.`;

const FIX_WHAT_IT_NAMES =
  "That is this project's or this machine's to fix, not looper's: mend what it names and looper can check again.";

const THE_WAY_OUT_IS_WHAT_FAILED =
  "That is a fault in looper, and the tool that failed is the one for saying so: tell the person what you saw.";

const A_REASON_HOLDS = 400;

function whose(ours: boolean): string {
  return ours ? A_FAULT_IN_LOOPER : FIX_WHAT_IT_NAMES;
}

function briefly(detail: string): string {
  const letters = Array.from(detail);
  return letters.length > A_REASON_HOLDS ? `${letters.slice(0, A_REASON_HOLDS).join("")}…` : detail;
}

export function couldNotJudge(capability: string, detail: string, ours: boolean): string {
  return `looper: ${capability} could not reach a verdict (${briefly(detail)}), so what it checks was not checked just now. ${whose(ours)}`;
}

export function couldNotSpeak(capability: string, detail: string, ours: boolean): string {
  return `looper: ${capability} could not contribute to this turn (${briefly(detail)}), so whatever it would have said is missing above. ${whose(ours)}`;
}

export function couldNotAnswer(tool: string, detail: string, ours: boolean): string {
  const whoseItIs = ours && tool === REPORT_TOOL ? THE_WAY_OUT_IS_WHAT_FAILED : whose(ours);
  return `looper's ${tool} tool failed (${briefly(detail)}), so it did nothing. ${whoseItIs}`;
}
