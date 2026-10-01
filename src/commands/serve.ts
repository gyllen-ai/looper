import type { Out } from "../out.ts";
import { createInterface } from "node:readline";
import { ageOfOurCode } from "../code-age.ts";
import { conversation } from "../mcp.ts";
import { registry } from "../registry.ts";
import { here } from "../session.ts";

export function serve(out: Out): number {
  const answer = conversation(registry(), here(), ageOfOurCode());
  const reader = createInterface({ input: process.stdin });
  reader.on("line", (line: string) => {
    if (line.trim().length === 0) return;
    const reply = answer(line);
    if (reply.kind === "message") {
      process.stdout.write(`${reply.text}\n`);
      return;
    }
    if (reply.kind === "unreadable") {
      out.warn(`looper: discarded a message it could not read (${reply.detail})`);
    }
  });
  return 0;
}
