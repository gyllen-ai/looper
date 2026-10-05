import { lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { Client } from "../capability.ts";
import { LAW_PATH } from "../config.ts";
import { reasonFrom } from "../fields.ts";
import { looperRoot } from "../law/readers.ts";
import { readOrdinary } from "../ordinary.ts";
import { parseToml, type TomlDocument, type TomlValue } from "../toml.ts";
import { titleOf, toldIn } from "./body.ts";
import { homeOf } from "./origin.ts";
import { decide, heldIn, isAnId, pathOf, printOf } from "./store.ts";
import { whyNotNow } from "./write.ts";

const THE_CLIENT_THAT_ASKS = "claude-code";

const FIRST_VERSION_THAT_ASKS: readonly number[] = [2, 1, 199];

const A_VERSION = /^(0|[1-9][0-9]{0,5})\.(0|[1-9][0-9]{0,5})\.(0|[1-9][0-9]{0,5})$/;

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

const AS_LOOPER_READS_IT = `[${REPORT_SECTION}] ${OFFER} = "${NEVER}"`;

export const SAID_NEVER = `this project's ${LAW_PATH} says ${AS_LOOPER_READS_IT}`;

const NOT_A_LETTER = /[^a-z]/g;

const NEARLY_THE_SECTION: readonly string[] = ["report", "reports"];

const NEARLY_THE_KEY_WITH_NO_SECTION: readonly string[] = ["offer", "reportoffer", "reportsoffer"];

export type Offer =
  | { readonly kind: "on" }
  | { readonly kind: "never" }
  | { readonly kind: "unclear"; readonly why: string };

function lettersOf(name: string): string {
  return name.toLowerCase().replace(NOT_A_LETTER, "");
}

function looksLikeTheSwitch(section: string, key: string): boolean {
  const where = lettersOf(section);
  const what = lettersOf(key);
  if (NEARLY_THE_SECTION.includes(where)) return what === OFFER;
  return where.length === 0 && NEARLY_THE_KEY_WITH_NO_SECTION.includes(what);
}

function asWritten(section: string, key: string, value: TomlValue): string {
  const where = section.length === 0 ? "" : `[${section}] `;
  return `${where}${key} = ${JSON.stringify(value)}`;
}

function offerSaid(document: TomlDocument): Offer {
  const nearly: string[] = [];
  for (const [section, table] of document) {
    for (const [key, value] of table) {
      if (section === REPORT_SECTION && key === OFFER && value === NEVER) return { kind: "never" };
      if (looksLikeTheSwitch(section, key)) nearly.push(asWritten(section, key, value));
    }
  }
  const [first] = nearly;
  if (first === undefined) return { kind: "on" };
  return {
    kind: "unclear",
    why: `${LAW_PATH} has ${first}, which looks like the switch for reports about looper and is not written the way looper reads it, which is ${AS_LOOPER_READS_IT}`,
  };
}

export function offerIn(root: string): Offer {
  const read = readOrdinary(join(root, LAW_PATH));
  if (read.kind === "absent") return { kind: "on" };
  if (read.kind === "unreadable") {
    return {
      kind: "unclear",
      why: `${LAW_PATH} could not be read, so looper cannot tell whether this project lets reports about it leave (${read.why})`,
    };
  }
  try {
    return offerSaid(parseToml(read.text, LAW_PATH));
  } catch (cause) {
    return {
      kind: "unclear",
      why: `${LAW_PATH} could not be read, so looper cannot tell whether this project lets reports about it leave (${reasonFrom(cause)})`,
    };
  }
}

export function closedSaid(offer: Offer): string {
  if (offer.kind === "never") return SAID_NEVER;
  return offer.kind === "unclear" ? offer.why : "";
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

const WHAT_BECAME_OF_IT: Readonly<Record<string, string>> = {
  kept: "the person kept this one, so it is not asked about again",
  sent: "this one was already sent",
};

type Checked =
  | { readonly kind: "refused"; readonly why: string }
  | { readonly kind: "checked"; readonly body: string; readonly title: string };

function ordinary(path: string): string {
  try {
    const held = lstatSync(path);
    return held.isFile() ? "" : `${path} is not an ordinary file, and only the file looper wrote is ever read`;
  } catch (cause) {
    return `${path} could not be read (${reasonFrom(cause)})`;
  }
}

function checked(asked: Asked, path: string, print: string): Checked {
  const odd = ordinary(path);
  if (odd.length > 0) return { kind: "refused", why: odd };
  let body: string;
  try {
    body = readFileSync(path, "utf8");
  } catch (cause) {
    return { kind: "refused", why: `${path} could not be read (${reasonFrom(cause)})` };
  }
  if (printOf(body) !== print) {
    return {
      kind: "refused",
      why: `${path} was changed after looper wrote it, so it is no longer the text that was checked. Write the report again`,
    };
  }
  const read = toldIn(body);
  if (read.kind === "not-ours") {
    return { kind: "refused", why: `${path} cannot leave: ${read.why}, so nothing in it has been checked. Write the report again` };
  }
  if (read.told.id !== asked.id) {
    return { kind: "refused", why: `${path} says it is another report than the one that was asked for` };
  }
  const why = whyNotNow(read.told, asked.root);
  if (why.length > 0) {
    return { kind: "refused", why: `${path} would not be written today: ${why}. Write the report again` };
  }
  return { kind: "checked", body, title: titleOf(read.told.about, read.told.wrong) };
}

export function release(asked: Asked): Released {
  const closed = closedSaid(offerIn(asked.root));
  if (closed.length > 0) return { kind: "refused", why: `${closed}, so nothing is released from here` };
  if (!isAnId(asked.id)) {
    return { kind: "refused", why: "that is not the id of a report: an id is twelve characters, each 0 to 9 or a to f" };
  }
  const before = heldIn(asked.root, asked.home);
  if (before.kind === "unreadable") return { kind: "refused", why: before.why };
  const held = before.held.find((one) => one.id === asked.id);
  if (held === undefined) {
    return { kind: "refused", why: `there is no report ${asked.id} here` };
  }
  const path = pathOf(asked.root, asked.home, asked.id);
  const decidedAlready = WHAT_BECAME_OF_IT[held.state];
  if (decidedAlready !== undefined) {
    return { kind: "refused", why: `${decidedAlready}. The file is ${path}` };
  }

  const read = checked(asked, path, held.print);
  if (read.kind === "refused") return read;
  if (read.title !== asked.title) {
    return {
      kind: "refused",
      why: `the title has to be the report's own, word for word, so that the question the person sees names what they are agreeing to. It is: ${read.title}`,
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
  return { kind: "released", id: asked.id, title: read.title, address: home.address, body: read.body };
}
