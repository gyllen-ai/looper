import type { Out } from "../out.ts";
import { whereTheUserLives } from "../config.ts";
import { Report } from "../report/capability.ts";
import { valueAfter } from "./args.ts";
import { here } from "../session.ts";

const SAID_WITH: readonly string[] = ["kind", "about", "wrong", "instead", "file", "line", "sent", "kept"];

const IT_FIRED = "The rule fired on this line and the code is fine.";

const NOT_STATED = "What was tried was not stated.";

const HOW = [
  "looper report says looper got something wrong, without sending anything.",
  '  looper report --kind rule --about TS-ERROR:4 --wrong "what it did" --instead "what you tried"',
  "                [--file src/a.ts --line 12]",
  "  kinds: rule, missed, failed, untrue, idea",
  "  looper report --list",
  "",
  "It writes a short file under your home folder and says where. Nothing from your",
  "code goes in it, and looper cannot send it anywhere — you decide what to do",
  "with the file.",
].join("\n");

function asked(args: readonly string[]): ReadonlyMap<string, string> {
  const said = new Map<string, string>();
  for (const field of SAID_WITH) {
    const given = valueAfter(args, `--${field}`);
    if (given.kind === "given") said.set(field, given.value);
  }
  const rule = valueAfter(args, "--rule");
  if (rule.kind === "given") {
    said.set("kind", "rule");
    said.set("about", rule.value);
    if (!said.has("wrong")) said.set("wrong", IT_FIRED);
  }
  const tried = valueAfter(args, "--tried");
  if (tried.kind === "given") said.set("instead", tried.value);
  if (rule.kind === "given" && !said.has("instead")) said.set("instead", NOT_STATED);
  return said;
}

export function report(args: readonly string[], out: Out): number {
  const said = asked(args);
  if (said.size === 0 && !args.includes("--list")) {
    out.warn(HOW);
    return 2;
  }
  const reply = new Report(whereTheUserLives()).answer(here(), said, "person");
  if (reply.done) {
    out.say(reply.text);
    return 0;
  }
  out.warn(reply.text);
  return 2;
}
