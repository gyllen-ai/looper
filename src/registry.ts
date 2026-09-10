import { Align } from "./align/capability.ts";
import { Decisions } from "./decisions/capability.ts";
import { Law } from "./law/capability.ts";
import { Recall } from "./recall/capability.ts";
import { Router } from "./router.ts";
import { Secrets } from "./secrets/capability.ts";
import type { Capability, HookContext, Outcome } from "./capability.ts";
import { reasonFrom } from "./fields.ts";
import { whereTheUserLives } from "./config.ts";
import { Loop } from "./loop/capability.ts";
import { Pins } from "./pins/capability.ts";
import { Stall } from "./stall/capability.ts";

export type Refusal = {
  readonly capability: string;
  readonly reason: string;
};

export type Complaint = {
  readonly capability: string;
  readonly detail: string;
};

export type Mention = {
  readonly capability: string;
  readonly note: string;
};

export type Dispatch = {
  readonly refusals: readonly Refusal[];
  readonly mentions: readonly Mention[];
  readonly complaints: readonly Complaint[];
};

export function registry(): readonly Capability[] {
  return [
    new Router(),
    new Law(),
    new Secrets(),
    new Recall(),
    new Decisions(),
    new Align(),
    new Loop(whereTheUserLives()),
    new Pins(),
    new Stall(),
  ];
}

function verdict(capability: Capability, context: HookContext): Outcome {
  return capability.onHook(context);
}

export function dispatchHook(
  capabilities: readonly Capability[],
  context: HookContext,
): Dispatch {
  const refusals: Refusal[] = [];
  const mentions: Mention[] = [];
  const complaints: Complaint[] = [];

  for (const capability of capabilities) {
    if (!capability.hooks().includes(context.event)) continue;
    try {
      const outcome = verdict(capability, context);
      if (outcome.kind === "block") {
        refusals.push({ capability: capability.name, reason: outcome.reason });
      }
      if (outcome.kind === "mention") {
        mentions.push({ capability: capability.name, note: outcome.note });
      }
    } catch (cause) {
      const detail = reasonFrom(cause);
      complaints.push({ capability: capability.name, detail });
    }
  }

  return { refusals, mentions, complaints };
}
