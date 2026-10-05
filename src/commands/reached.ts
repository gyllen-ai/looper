import { readFileSync } from "node:fs";

import type { Out } from "../out.ts";
import { namedProject, projectRoot } from "../config.ts";
import { reasonFrom } from "../fields.ts";
import { heardFrom, recorded } from "../stall/capability.ts";
import { READ_TOOLS } from "../wiring/hooks.ts";

function told(out: Out, note: string): void {
  out.say(JSON.stringify({ hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: note } }));
}

type Taken = { readonly kind: "taken"; readonly text: string } | { readonly kind: "not-taken"; readonly why: string };

function payloadTaken(): Taken {
  try {
    return { kind: "taken", text: readFileSync(0, "utf8") };
  } catch (cause) {
    return { kind: "not-taken", why: reasonFrom(cause) };
  }
}

export function reached(out: Out): number {
  const taken = payloadTaken();
  if (taken.kind === "not-taken") {
    told(out, `looper: what this tool call read could not be taken in (${taken.why}), so the stall metric is measuring less than happened.`);
    return 0;
  }
  const heard = heardFrom(taken.text, Date.now());
  if (heard.kind === "nothing") return 0;
  if (heard.kind === "not-counted") {
    told(out, heard.note);
    return 0;
  }
  if (!READ_TOOLS.split("|").includes(heard.reached.tool)) {
    told(
      out,
      `looper: its hook for reads was handed a ${heard.reached.tool} call and did not count it, because the hook for edits counts those. A matcher wider than ${READ_TOOLS} on \`reached\` would count each one twice.`,
    );
    return 0;
  }
  const outcome = recorded(projectRoot(process.cwd(), namedProject()).root, heard.reached);
  if (outcome.kind === "mention") told(out, outcome.note);
  return 0;
}
