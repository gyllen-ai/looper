import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join, relative, sep } from "node:path";

import { SERVER_VERSION } from "../config.ts";
import { fieldAt, reasonFrom } from "../fields.ts";
import { headOf, remoteOf, type Head } from "../git.ts";

const A_COMMIT = /^[0-9a-f]{40}$/;

const BUILT_FROM = "built-from";

const WHERE_THE_MARK_IS = join("src", BUILT_FROM);

const SHIPPED: readonly string[] = ["bin", "src"];

const NOT_PART_OF_THE_CODE: readonly string[] = [BUILT_FROM, "__pycache__"];

const SHORT = 12;

export function commitOf(looperRoot: string): Head {
  const marked = join(looperRoot, WHERE_THE_MARK_IS);
  if (existsSync(marked)) {
    const written = readFileSync(marked, "utf8").trim();
    if (A_COMMIT.test(written)) return { kind: "known", commit: written, changed: false };
  }
  if (!existsSync(join(looperRoot, ".git"))) {
    return {
      kind: "not-known",
      why: "this copy of looper carries no record of the commit it was built from",
    };
  }
  return headOf(looperRoot);
}

function filesUnder(dir: string): readonly string[] {
  if (!existsSync(dir)) return [];
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (NOT_PART_OF_THE_CODE.includes(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...filesUnder(path));
    else found.push(path);
  }
  return found;
}

type Shipped = { readonly name: string; readonly path: string };

function byName(left: Shipped, right: Shipped): number {
  if (left.name === right.name) return 0;
  return left.name < right.name ? -1 : 1;
}

function shipped(looperRoot: string): readonly Shipped[] {
  return SHIPPED.flatMap((part) => filesUnder(join(looperRoot, part)))
    .map((path) => ({ path, name: relative(looperRoot, path).split(sep).join("/") }))
    .sort(byName);
}

export function treeOf(looperRoot: string): string {
  const hash = createHash("sha256");
  for (const held of shipped(looperRoot)) {
    hash.update(held.name);
    hash.update("\0");
    hash.update(readFileSync(held.path));
    hash.update("\0");
  }
  return hash.digest("hex").slice(0, SHORT);
}

function commitSaid(held: Head): string {
  if (held.kind === "not-known") return "commit not known";
  return held.changed ? `commit ${held.commit} with changes not committed` : `commit ${held.commit}`;
}

export function originOf(looperRoot: string): string {
  return [
    `looper ${SERVER_VERSION}`,
    commitSaid(commitOf(looperRoot)),
    `files ${treeOf(looperRoot)}`,
    `node ${process.version}`,
    process.platform,
  ].join(", ");
}

export type Names =
  | { readonly kind: "unreadable"; readonly why: string }
  | { readonly kind: "named"; readonly names: readonly string[] };

const A_BYTE_ORDER_MARK = /^\uFEFF/;

function packageNamed(root: string): Names {
  const path = join(root, "package.json");
  if (!existsSync(path)) return { kind: "named", names: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8").replace(A_BYTE_ORDER_MARK, ""));
  } catch (cause) {
    return { kind: "unreadable", why: `package.json could not be read (${reasonFrom(cause)})` };
  }
  const name = fieldAt(parsed, "name");
  return { kind: "named", names: typeof name === "string" ? [name] : [] };
}

const HOW_IT_IS_FETCHED = /^[a-z][a-z0-9+.-]*:\/\//i;

const WHO_ASKS = /^[^@/]*@/;

const WHICH_DOOR = /:[0-9]+$/;

const A_MACHINE_THEN_A_PATH = /^([^/:]+):(.*)$/;

function machineNamed(host: string): readonly string[] {
  const labels = host.split(".");
  return labels.length > 1 ? labels.slice(0, -1) : labels;
}

function keptAt(address: string): readonly string[] {
  const rest = address.replace(HOW_IT_IS_FETCHED, "");
  if (rest !== address) {
    const cut = rest.indexOf("/");
    const machine = cut === -1 ? rest : rest.slice(0, cut);
    const path = cut === -1 ? "" : rest.slice(cut);
    return [...machineNamed(machine.replace(WHO_ASKS, "").replace(WHICH_DOOR, "")), path];
  }
  const found = A_MACHINE_THEN_A_PATH.exec(rest.replace(WHO_ASKS, ""));
  const machine = found?.[1];
  const path = found?.[2];
  if (machine === undefined || path === undefined) return [address];
  return [...machineNamed(machine), path];
}

export function namesOf(root: string): Names {
  const packaged = packageNamed(root);
  if (packaged.kind === "unreadable") return packaged;
  const remote = remoteOf(root);
  const remotely = remote.kind === "named" ? keptAt(remote.address) : [];
  return { kind: "named", names: [basename(root), ...packaged.names, ...remotely] };
}

export type Home =
  | { readonly kind: "unknown"; readonly why: string }
  | { readonly kind: "named"; readonly address: string };

const WRITTEN_FOR_GIT = /^git\+/;

const A_REPOSITORY_ENDING = /\.git$/;

export function homeOf(looperRoot: string): Home {
  const path = join(looperRoot, "package.json");
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (cause) {
    return { kind: "unknown", why: `looper's own package.json could not be read (${reasonFrom(cause)})` };
  }
  const held = fieldAt(parsed, "repository");
  const url = typeof held === "string" ? held : fieldAt(held, "url");
  if (typeof url !== "string" || url.length === 0) {
    return { kind: "unknown", why: "looper's own package.json names no repository" };
  }
  return { kind: "named", address: url.replace(WRITTEN_FOR_GIT, "").replace(A_REPOSITORY_ENDING, "") };
}
