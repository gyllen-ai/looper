import { test } from "node:test";
import assert from "node:assert/strict";

import { reachesInPython } from "./reads-python.ts";
import { NO_ALIASES, reachesIn, type Aliases } from "./reaches.ts";

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
  ["everything another module has, passed on", AT, 'export * from "node:net";\n'],
  ["a constructor taken out by its name as a key", AT, "const { constructor: Made } = () => 1;\nexport const held = Made;\n"],
  ["a constructor asked for only if it is there", AT, 'const made = () => 1;\nexport const held = made?.constructor("return 1");\n'],
  ["the socket under the output, by its constructor", AT, "const { constructor: Wire } = process.stdout;\nexport const held = Wire;\n"],
  ["the output asked to connect", AT, 'export const held = process.stdout.connect(9, "127.0.0.1");\n'],
  ["the input held in a variable", AT, "const wire = process.stdin;\nexport const held = wire;\n"],
  ["process behind an assertion that it is there", AT, 'export const held = process!.getBuiltinModule("node:net");\n'],
  ["process behind the older cast", AT, 'export const held = (<any>process).binding("tcp_wrap");\n'],
  ["process behind two casts", AT, 'export const held = (process satisfies object as any).binding("tcp_wrap");\n'],
  ["fetch with a type handed to it", AT, "export const held = fetch<string>;\n"],
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
  ["the output written to", AT, 'process.stdout.write("said\\n");\n'],
  ["the input handed to the reader of lines", AT, 'import { createInterface } from "node:readline";\nexport const held = createInterface({ input: process.stdin });\n'],
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

const WAYS_ROUND_A_PYTHON_SCAN: readonly (readonly [string, string])[] = [
  ["a second module on the same line", "import ast, socket\n"],
  ["an import after another statement", "x = 1; import socket\n"],
  ["an import inside a function", "def held():\n    import socket\n    return socket\n"],
  ["a name taken from a module", "from os import system\n"],
  ["a module loaded by name", 'held = __import__("socket")\n'],
  ["the loader of modules", 'import importlib\nheld = importlib.import_module("socket")\n'],
  ["text run as code", 'eval("1")\n'],
  ["the table of loaded modules", 'import sys\nheld = sys.modules["socket"]\n'],
];

test("the scan of a python reader is done by python, so it cannot be written round", () => {
  for (const [called, source] of WAYS_ROUND_A_PYTHON_SCAN) {
    assert.ok(
      reachesInPython(source).length > 0,
      `${called} passed. The first scan read each line for the word import at its start and took the first name after it, and a second reviewer connected with "import ast, socket":\n${source}`,
    );
  }
  assert.deepEqual([...reachesInPython("import ast\nimport json, sys\nheld = getattr(ast, 'parse')\nwith open('a') as f:\n    pass\n")], []);
});
