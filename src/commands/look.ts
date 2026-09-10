import { looksSettled, standingLook } from "../look/capability.ts";
import type { Out } from "../out.ts";

export function look(out: Out): number {
  for (const line of standingLook(process.cwd())) out.say(line);
  return looksSettled(process.cwd()) ? 0 : 1;
}
