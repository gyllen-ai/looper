import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { dirname, extname, join, relative, sep } from "node:path";

const ROOT = join(import.meta.dirname, "..");

import { ourFiles } from "./our-files.ts";
import { reachesInPython } from "./reads-python.ts";
import { NO_ALIASES, reachesIn, type Aliases } from "./reaches.ts";

function named(file: string): string {
  return relative(ROOT, file).split(sep).join("/");
}

test("nothing we wrote loads, names or reaches for anything outside a short list", () => {
  const reaching: string[] = [];
  for (const file of ourFiles()) {
    for (const found of reachesIn(named(file), readFileSync(file, "utf8"), "ours", NO_ALIASES)) {
      reaching.push(`${named(file)}:${found.line} — ${found.what}`);
    }
  }

  assert.deepEqual(
    reaching,
    [],
    `looper runs on every edit and every commit and must not be able to reach the network:\n${reaching.join("\n")}`,
  );
});

const KINDS_OF_FILE_HERE: Readonly<Record<string, readonly string[]>> = {
  src: [".ts", ".md", ".py", ""],
  bin: [".js"],
};

const LEFT_BY_AN_EDITOR_OR_A_SYSTEM = /^\.|~$|\.sw[a-p]$/;

function everyFileUnder(dir: string): readonly string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "__pycache__" || LEFT_BY_AN_EDITOR_OR_A_SYSTEM.test(entry)) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) found.push(...everyFileUnder(path));
    else found.push(path);
  }
  return found;
}

test("looper's own folders hold only the kinds of file something here reads", () => {
  const strange: string[] = [];
  for (const [part, kinds] of Object.entries(KINDS_OF_FILE_HERE)) {
    for (const file of everyFileUnder(join(ROOT, part))) {
      if (!kinds.includes(extname(file))) strange.push(named(file));
    }
  }

  assert.deepEqual(
    strange,
    [],
    `the scan reads .ts and .js. A reviewer put a file ending .mjs beside the others, imported it, and connected: ${strange.join(", ")}`,
  );
  assert.deepEqual(
    everyFileUnder(join(ROOT, "src")).filter((file) => extname(file) === "").map(named),
    ["src/built-from"],
    "the one file with no ending is the mark an install fills in",
  );
  for (const left of [".DS_Store", ".main.ts.swp", "looper.js~"]) {
    assert.ok(LEFT_BY_AN_EDITOR_OR_A_SYSTEM.test(left), `${left} is what an editor or a file manager leaves behind, and the suite failed on it`);
  }
  for (const real of ["side.mjs", "hole.cjs", "main.ts"]) {
    assert.ok(!LEFT_BY_AN_EDITOR_OR_A_SYSTEM.test(real), `${real} is a file of code and is never skipped`);
  }
});

test("looper's package file gives no name a second meaning", () => {
  const held: unknown = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));

  assert.equal(
    Object.getOwnPropertyDescriptor(held, "imports"),
    undefined,
    'an "imports" table makes a harmless-looking name stand for any module at all, and the scan reads names',
  );
});

test("the two python readers load five modules of the standard library and nothing else", () => {
  const reaching: string[] = [];
  const readers = everyFileUnder(join(ROOT, "src")).filter((one) => extname(one) === ".py");
  assert.equal(readers.length, 2);
  for (const file of readers) {
    for (const found of reachesInPython(readFileSync(file, "utf8"))) reaching.push(`${named(file)} ${found}`);
  }

  assert.deepEqual(
    reaching,
    [],
    `the Rust and C# halves were scanned and these were not: a reviewer made the first line of one "import socket", connected, and every test passed. ${reaching.join("; ")}`,
  );
});

function leavesOf(value: unknown): readonly string[] {
  if (typeof value === "string") return [value];
  if (value === null || typeof value !== "object") return [];
  return Object.values(value).flatMap(leavesOf);
}

function aliasesOf(packageDir: string): Aliases {
  const manifest = join(packageDir, "package.json");
  const aliases = new Map<string, readonly string[]>();
  if (!existsSync(manifest)) return aliases;
  const held: unknown = JSON.parse(readFileSync(manifest, "utf8"));
  const table: unknown = Object.getOwnPropertyDescriptor(held, "imports")?.value;
  if (table === null || typeof table !== "object") return aliases;
  for (const [alias, leads] of Object.entries(table)) aliases.set(alias, leavesOf(leads));
  return aliases;
}

function packageHolding(file: string, modules: string): string {
  let at = dirname(file);
  while (at !== modules && !existsSync(join(at, "package.json"))) at = dirname(at);
  return at;
}

test("nothing we installed can open a socket either", () => {
  const modules = join(ROOT, "node_modules");
  if (!existsSync(modules)) return;
  const hits = grepTree(modules, modules);
  assert.deepEqual(
    hits,
    [],
    `these installed files reach for the network: ${hits.join(", ")}. The invariant is about the resolved tree, not our own files: a dependency that can open a socket makes looper able to phone home whether we call it or not.`,
  );
});

function grepTree(dir: string, modules: string): readonly string[] {
  const hits: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      hits.push(...grepTree(path, modules));
      continue;
    }
    if (!/\.(js|cjs|mjs)$/.test(entry)) continue;
    for (const found of reachesIn(named(path), readFileSync(path, "utf8"), "installed", aliasesOf(packageHolding(path, modules)))) {
      hits.push(`${named(path)}:${found.line} — ${found.what}`);
    }
  }
  return hits;
}

const CONNECTING: readonly string[] = [
  "TcpStream",
  "TcpListener",
  "UdpSocket",
  "socket2",
  "libc::socket",
];

const RUST_TREE = join(ROOT, "vendor", "rust-law");

const CRATES_ALLOWED: readonly string[] = [
  "equivalent",
  "hashbrown",
  "indexmap",
  "looper-rust-law",
  "memchr",
  "proc-macro2",
  "quote",
  "serde",
  "serde_core",
  "serde_derive",
  "serde_spanned",
  "syn",
  "toml",
  "toml_datetime",
  "toml_edit",
  "toml_write",
  "unicode-ident",
  "winnow",
];

function rustFiles(dir: string): readonly string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "target") continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      found.push(...rustFiles(path));
      continue;
    }
    if (entry.endsWith(".rs")) found.push(path);
  }
  return found;
}

test("nothing in the Rust half can open a socket either", () => {
  const hits: string[] = [];
  for (const file of rustFiles(RUST_TREE)) {
    const text = readFileSync(file, "utf8");
    for (const banned of CONNECTING) {
      if (text.includes(banned)) hits.push(`${file.slice(ROOT.length + 1)} names ${banned}`);
    }
  }
  assert.deepEqual(
    hits,
    [],
    `${hits.length} file(s) in the Rust half reach for the network: ${hits.join(", ")}. The TypeScript invariant covers node_modules and says nothing about this half, so a crate that can connect would arrive unremarked. Address types are not banned here on purpose: serde parses SocketAddr out of text and cannot open anything with it, while TcpStream can.`,
  );
});

test("the Rust half depends on exactly the crates that were argued for", () => {
  const lock = readFileSync(join(RUST_TREE, "Cargo.lock"), "utf8");
  const lines = lock.match(/^name = "(.+)"$/gm);
  if (lines === null) {
    throw new Error(
      "Cargo.lock names no package at all, so this test would pass on an empty or truncated lock file and prove nothing",
    );
  }
  const named = [...new Set(lines.map((one) => one.slice(8, -1)))];
  const strangers = named.filter((one) => !CRATES_ALLOWED.includes(one)).sort();
  assert.deepEqual(
    strangers,
    [],
    `${strangers.join(", ")} arrived in the Rust half without being argued for in docs/PLAN.md. A dependency that can open a socket makes looper able to phone home whether we call it or not, and Cargo.lock is where one would appear first.`,
  );
});

test("every crate the Rust half needs is in the repository, so no build reaches out", () => {
  const vendored = join(RUST_TREE, "vendor");
  assert.ok(
    existsSync(vendored),
    "vendor/rust-law/vendor is gone, so cargo has to find the crates in whatever ~/.cargo/registry the machine happens to have. --offline then means the build fails on a cold machine rather than reaching out, but the invariant is that the tree carries what it needs.",
  );
  const missing = CRATES_ALLOWED.filter(
    (one) => one !== "looper-rust-law" && !existsSync(join(vendored, one)),
  );
  assert.deepEqual(missing, [], `these crates are locked but not vendored: ${missing.join(", ")}`);
  const config = readFileSync(join(RUST_TREE, ".cargo", "config.toml"), "utf8");
  assert.ok(
    config.includes('replace-with = "vendored-sources"'),
    "the vendored sources are here but cargo is not told to use them, so it would look in the registry instead",
  );
});

const CSHARP_CONNECTING: readonly string[] = [
  "Socket",
  "TcpClient",
  "TcpListener",
  "UdpClient",
  "HttpClient",
  "WebRequest",
  "WebClient",
  "NetworkStream",
  "System.Net.Dns",
];

const CSHARP_TREE = join(ROOT, "vendor", "csharp-law");

const PACKAGES_ALLOWED: readonly string[] = [
  "microsoft.codeanalysis.analyzers.3.11.0.nupkg",
  "microsoft.codeanalysis.common.4.14.0.nupkg",
  "microsoft.codeanalysis.csharp.4.14.0.nupkg",
];

test("nothing in the C# half can open a socket either", () => {
  const hits: string[] = [];
  for (const entry of readdirSync(join(CSHARP_TREE, "src"))) {
    const text = readFileSync(join(CSHARP_TREE, "src", entry), "utf8");
    for (const banned of CSHARP_CONNECTING) {
      if (text.includes(banned)) hits.push(`src/${entry} names ${banned}`);
    }
  }
  assert.deepEqual(
    hits,
    [],
    `${hits.join(", ")}. Address and encoding types are not banned here on purpose, the way serde's SocketAddr is allowed on the Rust side: the three vendored packages reference System.Net.WebUtility, which encodes HTML and URLs and cannot connect to anything.`,
  );
});

test("the C# half depends on exactly the packages that were argued for", () => {
  const vendored = readdirSync(join(CSHARP_TREE, "vendor")).sort();
  assert.deepEqual(
    vendored,
    [...PACKAGES_ALLOWED].sort(),
    "a package arrived in or left the C# half without being argued for in docs/PLAN.md. NuGet resolves a whole graph from one PackageReference, so this directory is where a new dependency appears first.",
  );
});

test("the C# half takes its packages from here and from nowhere on the network", () => {
  const config = readFileSync(join(CSHARP_TREE, "NuGet.config"), "utf8");
  assert.ok(
    config.includes("<clear />"),
    "NuGet.config no longer clears the package sources, so a restore falls back to nuget.org",
  );
  assert.ok(
    config.includes('value="vendor"'),
    "the vendored packages are here but NuGet is not told to use them",
  );
});
