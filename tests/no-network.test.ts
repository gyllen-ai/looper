import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");

import { ourFiles } from "./our-files.ts";
import { STARTS_A_PROCESS, reachesIn } from "./reaches.ts";

const MAY_START_PROGRAMS = join("src", "start.ts");

test("nothing we wrote can open a socket", () => {
  const reaching: string[] = [];
  for (const file of ourFiles()) {
    const named = file.slice(ROOT.length + 1);
    for (const found of reachesIn(named, readFileSync(file, "utf8"))) {
      if (named === MAY_START_PROGRAMS && found.what.includes(STARTS_A_PROCESS)) continue;
      reaching.push(`${named}:${found.line} — ${found.what}`);
    }
  }

  assert.deepEqual(
    reaching,
    [],
    `looper runs on every edit and every commit and must not be able to reach the network:\n${reaching.join("\n")}`,
  );
});

const SPELLINGS_ONCE_LET_THROUGH: readonly (readonly [string, string])[] = [
  ["a module named in single quotes", "import { connect } from 'node:net';\n"],
  ["a module named without its prefix", 'import https from "https";\n'],
  ["a part of a module", 'import { resolve4 } from "node:dns/promises";\n'],
  ["an import that waits until it runs", 'export const held = await import("node:http2");\n'],
  ["an import whose name is put together", 'export const held = await import("node:" + "https");\n'],
  ["an import through a name held in a variable", 'const which = "node:tls";\nexport const held = await import(which);\n'],
  ["what is passed on from another module", 'export { connect } from "node:net";\n'],
  ["the older way of importing", 'import net = require("node:net");\nexport const held = net;\n'],
  ["the function that connects with no import at all", 'export function send(): void {\n  void fetch("https://example.invalid/");\n}\n'],
  ["the same function under another name", "const send = fetch;\nexport const held = send;\n"],
  ["the same function reached through the whole program", 'export const held = globalThis.fetch("https://example.invalid/");\n'],
  ["a connection opened by a class that needs no import", 'export const held = new WebSocket("wss://example.invalid/");\n'],
  ["Node's own modules handed out without an import", 'export const held = process.getBuiltinModule("node:net");\n'],
  ["the same, by its older name", 'export const held = process.binding("tcp_wrap");\n'],
  ["a loader made for the purpose", 'import { createRequire } from "node:module";\nexport const held = createRequire(import.meta.url)("node:net");\n'],
  ["the module that starts other programs", 'import { spawnSync as start } from "node:child_process";\nexport const held = start;\n'],
  ["a thread that can load anything", 'import { Worker } from "node:worker_threads";\nexport const held = Worker;\n'],
];

const ORDINARY_CODE: readonly (readonly [string, string])[] = [
  ["a method that happens to be called fetch", "export function read(store: { fetch(): string }): string {\n  return store.fetch();\n}\n"],
  ["the word in a sentence", 'export const said = "fetch the rule set by name";\n'],
  ["a key that happens to be called fetch", "export const held = { fetch: 1, WebSocket: 2 };\n"],
  ["the modules looper is made of", 'import { readFileSync } from "node:fs";\nimport { join } from "node:path";\nexport const held = [readFileSync, join];\n'],
  ["an import that waits, of something harmless", 'export const held = await import("node:fs");\n'],
];

test("the scan refuses every spelling that was once let through, and leaves ordinary code alone", () => {
  for (const [called, source] of SPELLINGS_ONCE_LET_THROUGH) {
    assert.ok(
      reachesIn("src/somewhere.ts", source).length > 0,
      `${called} passed the scan. It used to look for seven module names inside double quotes, so anything spelled another way, and anything that needs no import, went straight through:\n${source}`,
    );
  }
  for (const [called, source] of ORDINARY_CODE) {
    assert.deepEqual(
      reachesIn("src/somewhere.ts", source).map((one) => one.what),
      [],
      `${called} was refused, and a scan that cries at ordinary code is one somebody switches off:\n${source}`,
    );
  }
});

test("nothing we installed can open a socket either", () => {
  const modules = join(ROOT, "node_modules");
  if (!existsSync(modules)) return;
  const hits = grepTree(modules);
  assert.deepEqual(
    hits,
    [],
    `these installed files reach for the network: ${hits.join(", ")}. The invariant is about the resolved tree, not our own files: a dependency that can open a socket makes looper able to phone home whether we call it or not.`,
  );
});

function grepTree(dir: string): readonly string[] {
  const hits: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      hits.push(...grepTree(path));
      continue;
    }
    if (!/\.(js|cjs|mjs)$/.test(entry)) continue;
    for (const found of reachesIn(path, readFileSync(path, "utf8"))) {
      hits.push(`${path.slice(ROOT.length + 1)}:${found.line} — ${found.what}`);
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
