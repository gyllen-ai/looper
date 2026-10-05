import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { parseSource, walk, type Node } from "./parse.ts";
import { fieldAt, reasonFrom } from "../../fields.ts";
import { readOrdinary, textOfOrdinary } from "../../ordinary.ts";

const CANDIDATE_SUFFIXES: readonly string[] = [
  "",
  ".ts",
  ".tsx",
  ".mts",
  "/index.ts",
];

const REWRITES: readonly (readonly [string, string])[] = [
  [".js", ".ts"],
  [".mjs", ".mts"],
  [".jsx", ".tsx"],
];

const DECLARED: readonly string[] = ["types", "typings"];

export type Declarations =
  | { readonly kind: "none"; readonly why: string }
  | { readonly kind: "file"; readonly path: string };

type Manifest =
  | { readonly kind: "none"; readonly why: string }
  | { readonly kind: "read"; readonly fields: Record<string, unknown> };

function manifestOf(dir: string): Manifest {
  const path = join(dir, "package.json");
  if (!existsSync(path)) return { kind: "none", why: "there is no package.json" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(textOfOrdinary(path));
  } catch (cause) {
    const detail = reasonFrom(cause);
    return { kind: "none", why: `its package.json is not readable (${detail})` };
  }
  if (parsed === null || typeof parsed !== "object") {
    return { kind: "none", why: "its package.json is not an object" };
  }
  return { kind: "read", fields: { ...parsed } };
}

export function declarationsFor(root: string, packageName: string): Declarations {
  const dir = join(root, "node_modules", packageName);
  const manifest = manifestOf(dir);
  if (manifest.kind === "none") {
    return { kind: "none", why: `${packageName}: ${manifest.why}` };
  }

  for (const key of DECLARED) {
    const named = manifest.fields[key];
    if (typeof named !== "string") continue;
    const path = join(dir, named);
    if (existsSync(path)) return { kind: "file", path };
  }
  const beside = join(dir, "index.d.ts");
  if (existsSync(beside)) return { kind: "file", path: beside };
  return { kind: "none", why: `${packageName} declares no types` };
}

export type Resolved =
  | { readonly kind: "not-ours"; readonly specifier: string }
  | { readonly kind: "missing"; readonly specifier: string }
  | { readonly kind: "file"; readonly path: string };

export function resolveLocal(fromFile: string, specifier: string): Resolved {
  if (!specifier.startsWith(".")) return { kind: "not-ours", specifier };

  const base = resolve(dirname(fromFile), specifier);
  const rewritten = REWRITES.reduce(
    (held, [from, to]) => (held.endsWith(from) ? held.slice(0, -from.length) + to : held),
    base,
  );
  for (const candidate of [rewritten, base]) {
    for (const suffix of CANDIDATE_SUFFIXES) {
      const path = `${candidate}${suffix}`;
      if (existsSync(path) && path.endsWith(".ts")) return { kind: "file", path };
      if (existsSync(path) && path.endsWith(".tsx")) return { kind: "file", path };
    }
  }
  return { kind: "missing", specifier };
}

function isAsyncFunctionNode(value: unknown): boolean {
  const type = fieldAt(value, "type");
  const shapes = ["FunctionDeclaration", "ArrowFunctionExpression", "FunctionExpression"];
  if (typeof type !== "string" || !shapes.includes(type)) return false;
  return fieldAt(value, "async") === true;
}

function namedFrom(value: unknown): string | null {
  const name = fieldAt(value, "name");
  return typeof name === "string" ? name : null;
}

export function asyncNamesIn(root: Node): ReadonlySet<string> {
  const found = new Set<string>();

  walk(root, (node) => {
    if (node.type === "FunctionDeclaration" && node["async"] === true) {
      const name = namedFrom(node["id"]);
      if (name !== null) found.add(name);
      return;
    }
    if (node.type !== "VariableDeclarator") return;
    if (!isAsyncFunctionNode(node["init"])) return;
    const name = namedFrom(node["id"]);
    if (name !== null) found.add(name);
  });

  return found;
}

function returnsPromise(node: unknown): boolean {
  if (node === null || typeof node !== "object") return false;
  let found = false;
  walk(node, (held) => {
    if (held.type !== "TSTypeReference") return;
    const name = held["typeName"];
    if (name === null || typeof name !== "object") return;
    if (fieldAt(name, "name") === "Promise") found = true;
  });
  return found;
}

export function promisingNamesIn(root: Node): ReadonlySet<string> {
  const found = new Set<string>();
  walk(root, (node) => {
    if (node.type !== "TSDeclareFunction" && node.type !== "FunctionDeclaration") return;
    if (!returnsPromise(node["returnType"])) return;
    const name = namedFrom(node["id"]);
    if (name !== null) found.add(name);
  });
  return found;
}

function namesIn(path: string, extract: (root: Node) => ReadonlySet<string>): ReadonlySet<string> {
  const read = readOrdinary(path);
  if (read.kind !== "text") return new Set();
  const parsed = parseSource(path, read.text);
  if (parsed.kind === "unreadable") return new Set();
  return extract(parsed.root);
}

export function promisingExportsOf(path: string): ReadonlySet<string> {
  return namesIn(path, promisingNamesIn);
}

export function asyncExportsOf(path: string): ReadonlySet<string> {
  return namesIn(path, asyncNamesIn);
}
