import type { Out } from "../out.ts";
import { createInterface } from "node:readline";
import { ageOfOurCode } from "../code-age.ts";
import { NOBODY_KNOWN, type Client } from "../capability.ts";
import { clientIn, handleFor } from "../mcp.ts";
import { dispatchHook, registry } from "../registry.ts";
import { here } from "../session.ts";

export function serve(out: Out): number {
  const capabilities = registry();
  const loaded = ageOfOurCode();
  const root = here();
  const reader = createInterface({ input: process.stdin });
  let asking: Client = NOBODY_KNOWN;
  reader.on("line", (line: string) => {
    if (line.trim().length === 0) return;
    const met = clientIn(line);
    if (met.kind === "named") asking = met;
    const reply = handleFor(capabilities, root, line, loaded, asking);
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
