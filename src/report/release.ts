import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { Client } from "../capability.ts";
import { LAW_PATH } from "../config.ts";
import { reasonFrom } from "../fields.ts";
import { looperRoot } from "../law/readers.ts";
import { parseToml, tableIn } from "../toml.ts";
import { homeOf } from "./origin.ts";
import { decide, heldIn, pathOf, printOf } from "./store.ts";

const THE_CLIENT_THAT_ASKS = "claude-code";

const FIRST_VERSION_THAT_ASKS: readonly number[] = [2, 1, 199];

const A_VERSION = /^(\d+)\.(\d+)\.(\d+)/;

export function asksAPerson(client: Client): boolean {
  if (client.kind !== "named" || client.name !== THE_CLIENT_THAT_ASKS) return false;
  const held = A_VERSION.exec(client.version);
  if (held === null) return false;
  const has = [Number(held[1]), Number(held[2]), Number(held[3])];
  for (const [at, needed] of FIRST_VERSION_THAT_ASKS.entries()) {
    const part = has[at];
    if (part === undefined || part < needed) return false;
    if (part > needed) return true;
  }
  return true;
}

const REPORT_SECTION = "report";

const OFFER = "offer";

const NEVER = "never";

export const SAID_NEVER = `this project's ${LAW_PATH} says [${REPORT_SECTION}] ${OFFER} = "${NEVER}"`;

export type Offer =
  | { readonly kind: "on" }
  | { readonly kind: "never" }
  | { readonly kind: "unclear"; readonly said: string };

export function offerIn(root: string): Offer {
  const path = join(root, LAW_PATH);
  if (!existsSync(path)) return { kind: "on" };
  const said = tableIn(parseToml(readFileSync(path, "utf8"), LAW_PATH), REPORT_SECTION).get(OFFER);
  if (said === undefined) return { kind: "on" };
  if (said === NEVER) return { kind: "never" };
  return { kind: "unclear", said: String(said) };
}

export function unclearSaid(said: string): string {
  return `looper: ${LAW_PATH} says [${REPORT_SECTION}] ${OFFER} = "${said}", and the only thing looper understands there is "${NEVER}". Until it says that, reports about looper are still offered.`;
}

export type Released =
  | { readonly kind: "refused"; readonly why: string }
  | {
      readonly kind: "released";
      readonly id: string;
      readonly title: string;
      readonly address: string;
      readonly body: string;
    };

export type Asked = {
  readonly root: string;
  readonly home: string;
  readonly id: string;
  readonly title: string;
  readonly client: Client;
};

export function release(asked: Asked): Released {
  if (offerIn(asked.root).kind === "never") {
    return { kind: "refused", why: `${SAID_NEVER}, so nothing is released from here` };
  }
  const before = heldIn(asked.root, asked.home);
  if (before.kind === "unreadable") return { kind: "refused", why: before.why };
  const held = before.held.find((one) => one.id === asked.id);
  if (held === undefined) {
    return { kind: "refused", why: `there is no report ${asked.id} here` };
  }
  if (held.title !== asked.title) {
    return {
      kind: "refused",
      why: `the title has to be the report's own, word for word, so that the question the person sees names what they are agreeing to. It is: ${held.title}`,
    };
  }

  const path = pathOf(asked.root, asked.home, asked.id);
  let body: string;
  try {
    body = readFileSync(path, "utf8");
  } catch (cause) {
    return { kind: "refused", why: `${path} could not be read (${reasonFrom(cause)})` };
  }
  if (printOf(body) !== held.print) {
    return {
      kind: "refused",
      why: `${path} was changed after looper wrote it, so it is no longer the text that was checked. Write the report again`,
    };
  }
  if (!asksAPerson(asked.client)) {
    return {
      kind: "refused",
      why: `looper cannot tell that the person was asked before this ran, because the agent that called it is not one that is known to ask. The file is ${path}: the person can read it and pass it on themselves`,
    };
  }
  const home = homeOf(looperRoot());
  if (home.kind === "unknown") {
    return { kind: "refused", why: `${home.why}, so looper cannot say where its makers are. The file is ${path}` };
  }
  const decided = decide(asked.root, asked.home, asked.id, "released");
  if (decided.kind !== "decided") {
    return {
      kind: "refused",
      why: decided.kind === "none" ? `there is no report ${asked.id} here` : decided.why,
    };
  }
  return { kind: "released", id: asked.id, title: held.title, address: home.address, body };
}
