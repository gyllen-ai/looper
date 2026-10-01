import type { Out } from "../out.ts";
import { readFileSync } from "node:fs";
import { isHookEvent, type HookEvent, type Payload } from "../capability.ts";
import { dispatchHook, registry, type Dispatch } from "../registry.ts";
import { reasonFrom } from "../fields.ts";
import { couldNotJudge } from "../report/say.ts";
import { here, remember } from "../session.ts";

const THE_AGENT_IS_LISTENING_ON: readonly HookEvent[] = ["PreToolUse", "PostToolUse"];

export type Answer = {
  readonly code: number;
  readonly said: readonly string[];
  readonly warned: readonly string[];
};

export function answerTo(event: HookEvent, result: Dispatch): Answer {
  const warned = result.complaints.map(
    (held) => `looper: ${held.capability} could not reach a verdict (${held.detail}); passing`,
  );
  if (result.refusals.length > 0) {
    return { code: 2, said: [], warned: [...warned, ...result.refusals.map((held) => held.reason)] };
  }
  const failed = THE_AGENT_IS_LISTENING_ON.includes(event)
    ? result.complaints.map((held) => couldNotJudge(held.capability, held.detail, held.ours))
    : [];
  const context = [...result.mentions.map((held) => held.note), ...failed];
  if (context.length === 0) return { code: 0, said: [], warned };
  return {
    code: 0,
    said: [
      JSON.stringify({
        hookSpecificOutput: { hookEventName: event, additionalContext: context.join("\n\n") },
      }),
    ],
    warned,
  };
}

function readPayload(out: Out): Payload {
  try {
    const text = readFileSync(0, "utf8");
    if (text.trim().length === 0) return { kind: "none" };
    return { kind: "text", text };
  } catch (cause) {
    const detail = reasonFrom(cause);
    out.warn(`looper: could not read the hook payload (${detail}); passing`);
    return { kind: "none" };
  }
}

export function hook(args: readonly string[], out: Out): number {
  const name = args[0];
  if (name === undefined) {
    out.warn("looper: hook needs an event name");
    return 2;
  }
  if (!isHookEvent(name)) {
    out.warn(`looper: ${name} is not an event looper answers; passing`);
    return 0;
  }
  remember(name, out);
  const answer = answerTo(
    name,
    dispatchHook(registry(), {
      root: here(),
      event: name,
      payload: name === "CommitMessage" ? readMessage(args[1], out) : readPayload(out),
    }),
  );
  for (const line of answer.warned) out.warn(line);
  for (const line of answer.said) out.say(line);
  return answer.code;
}

function readMessage(path: string | undefined, out: Out): Payload {
  if (path === undefined) {
    out.warn("looper: the commit-message check needs the message file; passing");
    return { kind: "none" };
  }
  try {
    return { kind: "text", text: readFileSync(path, "utf8") };
  } catch (cause) {
    const detail = reasonFrom(cause);
    out.warn(`looper: could not read the commit message (${detail}); passing`);
    return { kind: "none" };
  }
}
