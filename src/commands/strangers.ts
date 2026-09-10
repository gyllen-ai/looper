import type { Out } from "../out.ts";
import { valueAfter } from "./args.ts";
import { here } from "../session.ts";
import { strangersAgainst, strangersInHand } from "../secrets/strangers.ts";

export function strangers(args: readonly string[], out: Out): number {
  const asked = valueAfter(args, "--against");
  const root = here();
  const sweep = asked.kind === "given" ? strangersAgainst(root, asked.value) : strangersInHand(root);

  if (sweep.kind === "cannot-tell") {
    out.warn(
      `looper: the words in this change were not checked, because ${sweep.why}. Nothing is blocked, and nothing here is a verdict on them.`,
    );
    return 0;
  }

  if (sweep.strangers.length === 0) {
    out.say(
      `looper: every word in this change already appears somewhere in this repository as ${sweep.against} has it.`,
    );
    return 0;
  }

  out.say(
    [
      `looper: ${sweep.strangers.length} word(s) in this change appear nowhere else in`,
      `this repository as ${sweep.against} has it. Read the list before it goes.`,
      ``,
      ...sweep.strangers.map((one) => `  ${one.word}  ${one.file}:${one.line}`),
      ``,
      `A new name is usually just new. This is not a gate and nothing is blocked —`,
      `it is here because a check that greps for words somebody thought of can only`,
      `find those, and the one that got out was the one nobody pictured.`,
    ].join("\n"),
  );
  return 0;
}
