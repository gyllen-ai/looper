import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { dirname, extname, join, relative, sep } from "node:path";

const ROOT = join(import.meta.dirname, "..");

import { ourFiles } from "./our-files.ts";
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

const AT = "src/somewhere.ts";

const SPELLINGS_ONCE_LET_THROUGH: readonly (readonly [string, string, string])[] = [
  ["a module named in single quotes", AT, "import { connect } from 'node:net';\n"],
  ["a module named without its prefix", AT, 'import https from "https";\n'],
  ["a part of a module", AT, 'import { resolve4 } from "node:dns/promises";\n'],
  ["an import that waits until it runs", AT, 'export const held = await import("node:http2");\n'],
  ["an import whose name is put together", AT, 'export const held = await import("node:" + "https");\n'],
  ["an import through a name held in a variable", AT, 'const which = "node:tls";\nexport const held = await import(which);\n'],
  ["what is passed on from another module", AT, 'export { connect } from "node:net";\n'],
  ["the older way of importing", AT, 'import net = require("node:net");\nexport const held = net;\n'],
  ["the function that connects with no import at all", AT, 'export function send(): void {\n  void fetch("https://example.invalid/");\n}\n'],
  ["the same function under another name", AT, "const send = fetch;\nexport const held = send;\n"],
  ["the same function reached through the whole program", AT, 'export const held = globalThis.fetch("https://example.invalid/");\n'],
  ["the whole program held under another name", AT, 'const all = globalThis;\nexport const held = all.fetch("https://example.invalid/");\n'],
  ["the whole program behind a cast", AT, 'export const held = (globalThis as any).fetch("https://example.invalid/");\n'],
  ["the function taken out of the whole program", AT, "const { fetch: send } = globalThis;\nexport const held = send;\n"],
  ["the function asked for by a name put together", AT, 'export const held = Reflect.get(globalThis, "fe" + "tch");\n'],
  ["a connection opened by a class that needs no import", AT, 'export const held = new WebSocket("wss://example.invalid/");\n'],
  ["Node's own modules handed out without an import", AT, 'export const held = process.getBuiltinModule("node:net");\n'],
  ["the same, with process held under another name", AT, 'const ours = process;\nexport const held = ours.getBuiltinModule("node:net");\n'],
  ["the same, taken out of process", AT, 'const { getBuiltinModule } = process;\nexport const held = getBuiltinModule("node:net");\n'],
  ["the same, by a name put together", AT, 'export const held = process["bind" + "ing"]("tcp_wrap");\n'],
  ["the same, by its older name", AT, 'export const held = process.binding("tcp_wrap");\n'],
  ["a loader made for the purpose", AT, 'import { createRequire } from "node:module";\nexport const held = createRequire(import.meta.url)("node:net");\n'],
  ["the same loader through the module's own name", "bin/looper.js", 'import nodeModule from "node:module";\nexport const held = nodeModule.createRequire(import.meta.url)("node:net");\n'],
  ["the same loader through every name the module has", "bin/looper.js", 'import * as nodeModule from "node:module";\nexport const held = nodeModule;\n'],
  ["a second loader registered while running", "bin/looper.js", 'import nodeModule from "node:module";\nnodeModule.register("data:text/javascript,");\n'],
  ["the module that starts other programs", AT, 'import { spawnSync as start } from "node:child_process";\nexport const held = start;\n'],
  ["a thread that can load anything", AT, 'import { Worker } from "node:worker_threads";\nexport const held = Worker;\n'],
  ["the test runner, which starts a program", AT, 'import { run } from "node:test";\nexport const held = run;\n'],
  ["a module that runs text as code", AT, 'import { runInThisContext } from "node:vm";\nexport const held = runInThisContext;\n'],
  ["text run as code", AT, 'export const held = eval("1");\n'],
  ["a function made from text", AT, 'export const held = new Function("return 1");\n'],
  ["a function made from text, reached through any function", AT, 'export const held = (() => 1).constructor("return 1");\n'],
  ["a module written out as an address", AT, 'export const held = await import("data:text/javascript,export default 1");\n'],
  ["a name the package file resolves to something else", AT, 'import { connect } from "#wire";\nexport const held = connect;\n'],
  ["a file outside looper's own source", AT, 'import { held } from "../vendor/side.js";\nexport const again = held;\n'],
  ["a file of a kind nothing here reads", AT, 'import "./side.mjs";\n'],
  ["what this module is, handed on whole", AT, "export const held = import.meta;\n"],
  ["a way of finding a module by name", AT, 'export const held = import.meta.resolve("node:net");\n'],
];

const ORDINARY_CODE: readonly (readonly [string, string, string])[] = [
  ["a method that happens to be called fetch", AT, "export function read(store: { fetch(): string }): string {\n  return store.fetch();\n}\n"],
  ["the word in a sentence", AT, 'export const said = "fetch the rule set by name";\n'],
  ["a key that happens to be called fetch", AT, "export const held = { fetch: 1, WebSocket: 2 };\n"],
  ["the modules looper is made of", AT, 'import { readFileSync } from "node:fs";\nimport { join } from "node:path";\nexport const held = [readFileSync, join];\n'],
  ["an import that waits, of something harmless", AT, 'export const held = await import("node:fs");\n'],
  ["one of looper's own files", "src/law/ts/somewhere.ts", 'import { fieldAt } from "../../fields.ts";\nexport const held = fieldAt;\n'],
  ["what process is used for", AT, "export const held = [process.argv, process.env, process.cwd(), process.platform];\n"],
  ["where this module is", AT, "export const held = import.meta.dirname;\n"],
  ["a class with a constructor", AT, "export class Held {\n  readonly at: number;\n  constructor(at: number) {\n    this.at = at;\n  }\n}\n"],
  ["a type named after a function", AT, "export function call(held: Function): void {\n  void held;\n}\n"],
  ["the loader used for what it is here for", "bin/looper.js", 'import nodeModule from "node:module";\nnodeModule.registerHooks({});\n'],
];

test("the scan refuses every way round it that has been found, and leaves ordinary code alone", () => {
  for (const [called, at, source] of SPELLINGS_ONCE_LET_THROUGH) {
    assert.ok(
      reachesIn(at, source, "ours", NO_ALIASES).length > 0,
      `${called} passed the scan. It began as a search for seven module names inside double quotes, then as a list of things not to write, and each time a second reader connected through something the list had not named. It is a list of what may be written now:\n${source}`,
    );
  }
  for (const [called, at, source] of ORDINARY_CODE) {
    assert.deepEqual(
      reachesIn(at, source, "ours", NO_ALIASES).map((one) => one.what),
      [],
      `${called} was refused, and a scan that cries at ordinary code is one somebody switches off:\n${source}`,
    );
  }
});

const NEVER_WRITTEN_HERE: readonly string[] = [
  "globalThis",
  "global",
  "eval",
  "Function",
  "Reflect",
  "require",
  "createRequire",
  "fetch",
  "WebSocket",
  "EventSource",
  "XMLHttpRequest",
  "navigator",
  "Worker",
];

const NEVER_LOADED_HERE: readonly string[] = [
  "net",
  "http",
  "https",
  "http2",
  "tls",
  "dgram",
  "dns",
  "dns/promises",
  "inspector",
  "cluster",
  "worker_threads",
  "vm",
  "test",
  "repl",
  "wasi",
  "module",
  "child_process",
  "process",
  "url",
  "util",
];

const NEVER_ASKED_OF_PROCESS: readonly string[] = [
  "binding",
  "dlopen",
  "_linkedBinding",
  "getBuiltinModule",
  "mainModule",
  "moduleLoadList",
  "execPath",
  "emit",
];

const AN_INSTALLED_FILE_NEVER_LOADS: readonly string[] = [
  "child_process",
  "cluster",
  "dgram",
  "dns",
  "http",
  "http2",
  "https",
  "inspector",
  "module",
  "net",
  "quic",
  "repl",
  "test",
  "tls",
  "vm",
  "wasi",
  "worker_threads",
];

test("every name on the lists above is refused one at a time, so none can be dropped from the scan unnoticed", () => {
  const passed: string[] = [];
  const refuses = (at: string, source: string, held: "ours" | "installed"): boolean => reachesIn(at, source, held, NO_ALIASES).length > 0;

  for (const name of NEVER_WRITTEN_HERE) {
    if (!refuses(AT, `export const held = ${name};\n`, "ours")) passed.push(`the name ${name}`);
  }
  for (const name of NEVER_LOADED_HERE) {
    if (!refuses(AT, `import * as held from "node:${name}";\nexport const again = held;\n`, "ours")) passed.push(`node:${name}`);
    if (!refuses(AT, `import * as held from "${name}";\nexport const again = held;\n`, "ours")) passed.push(name);
  }
  for (const name of NEVER_ASKED_OF_PROCESS) {
    if (!refuses(AT, `export const held = process.${name};\n`, "ours")) passed.push(`process.${name}`);
  }
  for (const name of AN_INSTALLED_FILE_NEVER_LOADS) {
    if (!refuses("node_modules/some/index.js", `module.exports = require("${name}");\n`, "installed")) passed.push(`installed: require ${name}`);
    if (!refuses("node_modules/some/index.js", `import held from "node:${name}";\nexport default held;\n`, "installed")) passed.push(`installed: node:${name}`);
  }
  for (const name of ["fetch", "WebSocket", "EventSource", "XMLHttpRequest", "eval"]) {
    if (!refuses("node_modules/some/index.js", `module.exports = ${name};\n`, "installed")) passed.push(`installed: the name ${name}`);
  }
  for (const name of ["binding", "dlopen", "_linkedBinding", "getBuiltinModule", "mainModule"]) {
    if (!refuses("node_modules/some/index.js", `module.exports = process.${name};\n`, "installed")) passed.push(`installed: process.${name}`);
  }

  assert.deepEqual(
    passed,
    [],
    `a reviewer took names out of the scan one at a time and seventeen of them could go with every test still passing, because no test wrote that name down: ${passed.join(", ")}`,
  );
});

const KINDS_OF_FILE_HERE: Readonly<Record<string, readonly string[]>> = {
  src: [".ts", ".md", ".py", ""],
  bin: [".js"],
};

function everyFileUnder(dir: string): readonly string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "__pycache__") continue;
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
});

test("looper's package file gives no name a second meaning", () => {
  const held: unknown = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));

  assert.equal(
    Object.getOwnPropertyDescriptor(held, "imports"),
    undefined,
    'an "imports" table makes a harmless-looking name stand for any module at all, and the scan reads names',
  );
});

const A_PYTHON_READER_LOADS: readonly string[] = ["ast", "io", "json", "sys", "tokenize"];

const LOADS_IN_PYTHON = /^\s*(?:import|from)\s+([A-Za-z_][A-Za-z0-9_.]*)/;

const LOADS_BY_NAME_IN_PYTHON: readonly string[] = ["__import__", "importlib", "sys.modules", "exec(", "eval(", "compile("];

test("the two python readers load five modules of the standard library and nothing else", () => {
  const reaching: string[] = [];
  for (const file of everyFileUnder(join(ROOT, "src")).filter((one) => extname(one) === ".py")) {
    const lines = readFileSync(file, "utf8").split("\n");
    for (const [at, line] of lines.entries()) {
      const loaded = LOADS_IN_PYTHON.exec(line)?.[1];
      if (loaded !== undefined && !A_PYTHON_READER_LOADS.includes(loaded)) reaching.push(`${named(file)}:${at + 1} loads ${loaded}`);
      for (const way of LOADS_BY_NAME_IN_PYTHON) {
        if (line.includes(way)) reaching.push(`${named(file)}:${at + 1} uses ${way}`);
      }
    }
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

test("the scan of what is installed refuses what it is there to refuse", () => {
  const refused: readonly (readonly [string, string])[] = [
    ["the older way of loading", 'const net = require("net");\nmodule.exports = net;\n'],
    ["the older way, with a name put together", 'module.exports = require("ne" + "t");\n'],
    ["an import", 'import https from "node:https";\nexport default https;\n'],
    ["a program started", 'const { spawn } = require("child_process");\nmodule.exports = spawn;\n'],
    ["a name the package resolves to a module of Node", 'export { connect } from "#wire";\n'],
    ["fetch", 'module.exports = () => fetch("https://example.invalid/");\n'],
    ["a hidden door of process", 'module.exports = process.binding("tcp_wrap");\n'],
  ];
  const itsOwn: Aliases = new Map<string, readonly string[]>([["#wire", ["net"]], ["#identifier", ["./lib/identifier.js"]]]);

  for (const [called, source] of refused) {
    assert.ok(reachesIn("node_modules/some/lib/index.js", source, "installed", itsOwn).length > 0, `${called} passed:\n${source}`);
  }
  assert.deepEqual(
    [...reachesIn("node_modules/some/lib/index.js", 'export { held } from "#identifier";\nconst path = require("path");\nmodule.exports = path;\n', "installed", itsOwn)],
    [],
    "a name the package resolves to a file of its own is that file, and a module that cannot connect is not refused",
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
