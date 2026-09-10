import { isSettled, standingVerdict } from "../align/capability.ts";
import type { Out } from "../out.ts";

export function align(out: Out): number {
  for (const line of standingVerdict(process.cwd())) out.say(line);
  return isSettled(process.cwd()) ? 0 : 1;
}
