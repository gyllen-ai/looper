#!/usr/bin/env node
import { readFileSync } from "node:fs";
import nodeModule from "node:module";

const NEEDS = "22.18";

const OURS = ["stripTypeScriptTypes", "registerHooks", "Type Stripping"];

process.removeAllListeners("warning");
process.on("warning", (warning) => {
  if (OURS.some((named) => warning.message.includes(named))) return;
  console.error(`${warning.name}: ${warning.message}`);
});

if (
  typeof nodeModule.registerHooks !== "function" ||
  typeof nodeModule.stripTypeScriptTypes !== "function"
) {
  console.error(
    [
      `looper cannot run on Node ${process.version}. It needs Node ${NEEDS} or newer,`,
      "which is the version that can read looper's own source.",
      "Nothing was checked and nothing was changed.",
    ].join("\n"),
  );
  process.exit(1);
}

nodeModule.registerHooks({
  load(url, context, next) {
    if (!url.endsWith(".ts")) return next(url, context);
    return {
      format: "module",
      shortCircuit: true,
      source: nodeModule.stripTypeScriptTypes(readFileSync(new URL(url), "utf8"), {
        mode: "strip",
        sourceUrl: url,
      }),
    };
  },
});

const HOOKS_THAT_SPEAK = new Map([
  ["UserPromptSubmit", "UserPromptSubmit"],
  ["PreToolUse", "PreToolUse"],
  ["PostToolUse", "PostToolUse"],
  ["Stop", "Stop"],
]);

function saidWhenLooperCannotLoad(detail) {
  return [
    "looper is not judging anything in this session: its own code could not be loaded.",
    "Nothing is being checked — not the rules, not the edits, not the commit — until that is fixed.",
    "Treat every verdict as absent rather than clean, and say so out loud to whoever you are working with.",
    `What stopped it loading: ${detail}`,
  ].join(" ");
}

const ONLY_WHAT_A_READ_NEEDS = "reached";

try {
  if (process.argv[2] === ONLY_WHAT_A_READ_NEEDS) await import("../src/reached.ts");
  else await import("../src/main.ts");
} catch (cause) {
  const detail = cause instanceof Error ? cause.message : String(cause);
  const asked = process.argv[2];
  const named = process.argv[3];
  const event = asked === "hook" ? HOOKS_THAT_SPEAK.get(named) : asked === ONLY_WHAT_A_READ_NEEDS ? "PostToolUse" : undefined;
  if (asked === "inject") {
    console.log(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "UserPromptSubmit",
          additionalContext: saidWhenLooperCannotLoad(detail),
        },
      }),
    );
    process.exit(0);
  }
  if (event !== undefined) {
    console.log(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: event,
          additionalContext: saidWhenLooperCannotLoad(detail),
        },
      }),
    );
    process.exit(0);
  }
  console.error(saidWhenLooperCannotLoad(detail));
  process.exit(1);
}
