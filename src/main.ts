#!/usr/bin/env node
import { USAGE } from "./announce.ts";
import { adopt } from "./commands/adopt.ts";
import { align } from "./commands/align.ts";
import { hook } from "./commands/hook.ts";
import { init } from "./commands/init.ts";
import { inject } from "./commands/inject.ts";
import { law } from "./commands/law.ts";
import { look } from "./commands/look.ts";
import { loop } from "./commands/loop.ts";
import { report } from "./commands/report.ts";
import { strangers } from "./commands/strangers.ts";
import { serve } from "./commands/serve.ts";
import { status } from "./commands/status.ts";
import type { Out } from "./out.ts";

const out: Out = {
  say: (line) => console.log(line),
  warn: (line) => console.error(line),
};

function usage(): void {
  for (const line of USAGE) out.say(line);
}

function run(argv: readonly string[]): number {
  const command = argv[0];
  const rest = argv.slice(1);
  if (command === "init") return init(rest, out);
  if (command === "inject") return inject(out);
  if (command === "hook") return hook(rest, out);
  if (command === "status") return status(out, rest);
  if (command === "serve") return serve(out);
  if (command === "law") return law(rest, out);
  if (command === "loop") return loop(rest, out);
  if (command === "adopt") return adopt(rest, out);
  if (command === "align") return align(out);
  if (command === "look") return look(out);
  if (command === "report") return report(rest, out);
  if (command === "strangers") return strangers(rest, out);
  usage();
  return 2;
}

process.exitCode = run(process.argv.slice(2));
