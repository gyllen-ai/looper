import { reached } from "./commands/reached.ts";
import type { Out } from "./out.ts";

const out: Out = {
  say: (line) => console.log(line),
  warn: (line) => console.error(line),
};

process.exitCode = reached(out);
