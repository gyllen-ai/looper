import { existsSync, readdirSync, type Dirent } from "node:fs";
import { join, relative } from "node:path";

import { fieldAt, reasonFrom } from "../fields.ts";
import { textOfOrdinary } from "../ordinary.ts";

export type Role = "backend" | "interface";

export type Shape = {
  readonly kind: "tauri" | "typescript" | "rust" | "mixed" | "unknown";
  readonly rustUnder: readonly string[];
  readonly said: string;
};

const TAURI_DIR = "src-tauri";

const TAURI_CONFIG = "tauri.conf.json";

const NOT_WORTH_WALKING: readonly string[] = [
  "target",
  "node_modules",
  ".git",
  "dist",
  "vendor",
  ".venv",
  "venv",
  "site-packages",
  "__pycache__",
];

const HOW_DEEP = 4;

export type Walked = {
  readonly found: readonly string[];
  readonly unreadable: readonly string[];
};

function tauriDirsUnder(root: string): Walked {
  const found: string[] = [];
  const unreadable: string[] = [];

  const walk = (at: string, depth: number): void => {
    if (depth > HOW_DEEP) return;
    let entries: readonly Dirent[] = [];
    try {
      entries = readdirSync(at, { withFileTypes: true });
    } catch (cause) {
      unreadable.push(`${relative(root, at)} (${reasonFrom(cause)})`);
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (NOT_WORTH_WALKING.includes(entry.name) || entry.name.startsWith(".")) continue;
      const here = join(at, entry.name);
      if (entry.name === TAURI_DIR && existsSync(join(here, TAURI_CONFIG))) {
        found.push(relative(root, here));
        continue;
      }
      walk(here, depth + 1);
    }
  };

  walk(root, 0);
  return { found, unreadable };
}

const SERVER_FRAMEWORKS: readonly string[] = [
  "hono",
  "express",
  "fastify",
  "koa",
  "@nestjs/core",
  "next",
];

type Declared = { readonly kind: "read"; readonly names: readonly string[] } | { readonly kind: "unreadable"; readonly why: string };

function declaredDependencies(root: string): Declared {
  const path = join(root, "package.json");
  if (!existsSync(path)) return { kind: "read", names: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(textOfOrdinary(path));
  } catch (cause) {
    return { kind: "unreadable", why: reasonFrom(cause) };
  }
  const found: string[] = [];
  for (const field of ["dependencies", "devDependencies"]) {
    const held = fieldAt(parsed, field);
    if (held === null || typeof held !== "object") continue;
    found.push(...Object.keys(held));
  }
  return { kind: "read", names: found };
}

export function shapeOf(root: string): Shape {
  const hasCargo = existsSync(join(root, "Cargo.toml"));
  const hasPackage = existsSync(join(root, "package.json"));
  const walked = tauriDirsUnder(root);
  const skipped =
    walked.unreadable.length === 0
      ? ""
      : `. ${walked.unreadable.length} director(y|ies) could not be listed and were not looked in: ${walked.unreadable.join(", ")}`;

  if (walked.found.length > 0) {
    return {
      kind: "tauri",
      rustUnder: walked.found,
      said: `a Tauri project: the Rust under ${walked.found.join(", ")} is the backend, and the TypeScript around it is the interface${skipped}`,
    };
  }

  const declared = declaredDependencies(root);
  const serves = declared.kind === "read" && declared.names.some((name) => SERVER_FRAMEWORKS.includes(name));
  const unread =
    declared.kind === "unreadable"
      ? `. Its package.json could not be read (${declared.why}), so it was taken to declare no server`
      : "";

  if (hasCargo && hasPackage) {
    return {
      kind: "mixed",
      rustUnder: ["."],
      said: serves
        ? "Rust and TypeScript, and the TypeScript declares a server framework, so both halves are backends"
        : `Rust and TypeScript, and the TypeScript declares no server framework, so it is read as the interface${unread}`,
    };
  }
  if (hasCargo) return { kind: "rust", rustUnder: ["."], said: "a Rust project" };
  if (hasPackage) {
    return {
      kind: "typescript",
      rustUnder: [],
      said: serves ? "a TypeScript project with a server in it" : `a TypeScript project${unread}`,
    };
  }
  return { kind: "unknown", rustUnder: [], said: "no Cargo.toml and no package.json" };
}

function under(file: string, directories: readonly string[]): boolean {
  return directories.some((held) => held === "." || file.startsWith(`${held}/`));
}

export function roleOf(shape: Shape, file: string): Role {
  if (file.endsWith(".rs")) return "backend";
  if (shape.kind === "tauri") {
    return under(file, shape.rustUnder) ? "backend" : "interface";
  }
  if (shape.kind === "mixed") {
    return shape.said.includes("both halves") ? "backend" : "interface";
  }
  return "backend";
}
