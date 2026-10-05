import { existsSync } from "node:fs";
import { extname, join } from "node:path";

import { STACK_PATH } from "../config.ts";
import { readOrdinaryOrSay } from "../ordinary.ts";
import {
  A_LANGUAGE_BY_EXTENSION,
  A_MANIFEST_BY_NAME,
  THE_INTERFACE_SPEAKS,
} from "./languages.ts";
import { walkProject } from "../law/project.ts";

export type Found = {
  readonly language: string;
  readonly because: string;
  readonly files: number;
};

export type Half = {
  readonly languages: readonly Found[];
};

export type Stack = {
  readonly frontend: Half;
  readonly backend: Half;
};

const EXTENSIONS = new Map(A_LANGUAGE_BY_EXTENSION);

const MANIFESTS = new Map(A_MANIFEST_BY_NAME);

export function languageOf(file: string): string {
  const held = EXTENSIONS.get(extname(file));
  return held === undefined ? "" : held;
}

export function isTheInterface(file: string): boolean {
  return THE_INTERFACE_SPEAKS.includes(extname(file));
}

function manifestsIn(root: string): ReadonlyMap<string, string> {
  const found = new Map<string, string>();
  for (const [name, said] of MANIFESTS) {
    if (!existsSync(join(root, name))) continue;
    for (const language of said.split(" or ")) found.set(language, name);
  }
  return found;
}

function countBy(files: readonly string[], keep: (file: string) => boolean): Map<string, number> {
  const counts = new Map<string, number>();
  for (const file of files) {
    if (!keep(file)) continue;
    const language = languageOf(file);
    if (language.length === 0) continue;
    const soFar = counts.get(language);
    counts.set(language, soFar === undefined ? 1 : soFar + 1);
  }
  return counts;
}

function halfFrom(counts: ReadonlyMap<string, number>, manifests: ReadonlyMap<string, string>): Half {
  const languages: Found[] = [];
  for (const [language, files] of [...counts].sort((a, b) => b[1] - a[1])) {
    const manifest = manifests.get(language);
    const because =
      manifest === undefined ? `${files} file(s) on disk` : `${manifest}, and ${files} file(s)`;
    languages.push({ language, because, files });
  }
  return { languages };
}

export function stackOf(root: string): Stack {
  const walked = walkProject(root);
  const manifests = manifestsIn(root);
  return {
    frontend: halfFrom(countBy(walked.files, isTheInterface), manifests),
    backend: halfFrom(countBy(walked.files, (file) => !isTheInterface(file)), manifests),
  };
}

export type Written =
  | { readonly kind: "absent" }
  | {
      readonly kind: "listed";
      readonly languages: ReadonlySet<string>;
      readonly frontend: ReadonlySet<string>;
      readonly backend: ReadonlySet<string>;
    };

const A_ROW = /^\|\s*([A-Za-z#+.][A-Za-z0-9#+. ]*?)\s*\|/;

const A_HALF = /^##\s+(Frontend|Backend)\s*$/i;

const NOT_A_LANGUAGE: readonly string[] = ["language", "---"];

const NEITHER_HALF_NAMED = "";

export function languagesListedIn(root: string): Written {
  const read = readOrdinaryOrSay(join(root, STACK_PATH));
  if (read.kind === "absent") return { kind: "absent" };

  const listed = new Set<string>();
  const frontend = new Set<string>();
  const backend = new Set<string>();
  let half = NEITHER_HALF_NAMED;

  for (const line of read.text.split("\n")) {
    const heading = A_HALF.exec(line);
    if (heading !== null) {
      const named = heading[1];
      half = named === undefined ? NEITHER_HALF_NAMED : named.toLowerCase();
      continue;
    }
    const held = A_ROW.exec(line);
    if (held === null) continue;
    const name = held[1];
    if (name === undefined) continue;
    if (NOT_A_LANGUAGE.includes(name.toLowerCase())) continue;

    listed.add(name);
    if (half === "frontend") frontend.add(name);
    else if (half === "backend") backend.add(name);
    else {
      frontend.add(name);
      backend.add(name);
    }
  }
  return { kind: "listed", languages: listed, frontend, backend };
}
