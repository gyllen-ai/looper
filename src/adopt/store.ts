import { ADOPTED_HEADER } from "../stubs.ts";
import { join } from "node:path";

import { writeAtomically } from "../atomic.ts";
import {
  ADOPTED_PATH,
  ADOPTING_PATH,
} from "../config.ts";
import { readOrdinaryOrSay } from "../ordinary.ts";
import { parseToml, stringsAt, tableIn } from "../toml.ts";
import { isShape, type Adopted } from "./shapes.ts";

function firstOr(held: readonly string[], fallback: string): string {
  const one = held[0];
  return one === undefined ? fallback : one;
}

export function readAdopted(root: string): readonly Adopted[] {
  const read = readOrdinaryOrSay(join(root, ADOPTED_PATH));
  if (read.kind === "absent") return [];

  const document = parseToml(read.text, ADOPTED_PATH);
  const adopted: Adopted[] = [];

  for (const [section] of document) {
    const dot = section.indexOf(".");
    if (dot === -1) continue;
    const shape = section.slice(0, dot);
    const what = section.slice(dot + 1);
    if (!isShape(shape) || what.length === 0) continue;

    const table = tableIn(document, section);
    adopted.push({
      shape,
      what,
      because: firstOr(stringsAt(table, "because", ADOPTED_PATH), "adopted by this project"),
      instead: stringsAt(table, "instead", ADOPTED_PATH),
      evidence: stringsAt(table, "evidence", ADOPTED_PATH),
    });
  }

  return adopted;
}

function quoted(values: readonly string[]): string {
  return `[${values.map((value) => `"${value.replace(/"/g, '\\"')}"`).join(", ")}]`;
}

export function render(adopted: readonly Adopted[]): string {
  const lines = [ADOPTED_HEADER];
  for (const one of adopted) {
    lines.push(
      ``,
      `["${one.shape}.${one.what}"]`,
      `because = ${quoted([one.because])}`,
      `instead = ${quoted(one.instead)}`,
      `evidence = ${quoted(one.evidence)}`,
    );
  }
  return `${lines.join("\n")}\n`;
}

export function writeAdopted(root: string, adopted: readonly Adopted[]): void {
  writeAtomically(join(root, ADOPTED_PATH), render(adopted));
}

export type Pending =
  | { readonly kind: "none"; readonly why: string }
  | { readonly kind: "proposed"; readonly evidence: readonly string[] };

export function rememberProposal(
  root: string,
  one: Adopted,
  evidence: readonly string[],
): void {
  const lines = [
    `# What looper found when this rule was proposed. Read again when it is taken,`,
    `# so the entry that lands carries the places that justified it.`,
    ``,
    `["${one.shape}.${one.what}"]`,
    `evidence = ${quoted(evidence)}`,
  ];
  writeAtomically(join(root, ADOPTING_PATH), `${lines.join("\n")}\n`);
}

export function proposalFor(root: string, one: Adopted): Pending {
  const read = readOrdinaryOrSay(join(root, ADOPTING_PATH));
  if (read.kind === "absent") {
    return { kind: "none", why: "nothing was proposed, so there is no evidence to carry" };
  }
  const document = parseToml(read.text, ADOPTING_PATH);
  const section = `${one.shape}.${one.what}`;
  if (!document.has(section)) {
    return { kind: "none", why: `the pending proposal is for something else` };
  }
  return {
    kind: "proposed",
    evidence: stringsAt(tableIn(document, section), "evidence", ADOPTING_PATH),
  };
}

export function withRule(held: readonly Adopted[], one: Adopted): readonly Adopted[] {
  const without = held.filter(
    (existing) => !(existing.shape === one.shape && existing.what === one.what),
  );
  return [...without, one];
}
