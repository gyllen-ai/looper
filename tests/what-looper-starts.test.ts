import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PYTHON_COMMAND, environmentWith } from "../src/config.ts";
import { NotSomethingLooperStarts } from "../src/errors.ts";
import { isNode, parseSource, type Node } from "../src/law/ts/parse.ts";
import { askGit } from "../src/start.ts";
import { ourFiles } from "./our-files.ts";
import { STARTS_A_PROCESS, sourceOf } from "./reaches.ts";

const ROOT = join(import.meta.dirname, "..");

const THE_ONE_FILE = join("src", "start.ts");

const STARTERS: readonly string[] = ["execFileSync", "spawnSync"];

const STARTED: readonly string[] = [
  'execFileSync "cargo"',
  'execFileSync "dotnet"',
  "execFileSync PYTHON_COMMAND",
  "execFileSync binary",
  'spawnSync "git"',
  'spawnSync "sh"',
];

const TOLD_TO_STAY_HOME: Readonly<Record<string, string>> = {
  '"git"': "environmentWith(GIT_STAYS_HOME)",
  '"cargo"': "environmentWith(rustStaysHome())",
  '"dotnet"': "environmentWith(DOTNET_STAYS_HOME)",
};

function every(root: Node, type: string): readonly Node[] {
  const found: Node[] = [];
  const visit = (node: Node): void => {
    if (node.type === type) found.push(node);
    for (const key of Object.keys(node)) {
      if (key === "loc") continue;
      const held = node[key];
      if (Array.isArray(held)) {
        for (const item of held) {
          if (isNode(item)) visit(item);
        }
        continue;
      }
      if (isNode(held)) visit(held);
    }
  };
  visit(root);
  return found;
}

type Start = { readonly by: string; readonly program: string; readonly env: string };

function nameOf(node: unknown): string {
  if (!isNode(node) || node.type !== "Identifier") return "";
  return String(node["name"]);
}

function envOf(options: unknown, text: string): string {
  if (!isNode(options) || !Array.isArray(options["properties"])) return "";
  for (const property of options["properties"]) {
    if (isNode(property) && nameOf(property["key"]) === "env") return sourceOf(property["value"], text);
  }
  return "";
}

function startsIn(text: string): readonly Start[] {
  const parsed = parseSource("start.ts", text);
  assert.equal(parsed.kind, "parsed");
  if (parsed.kind !== "parsed") return [];
  const starts: Start[] = [];
  for (const call of every(parsed.root, "CallExpression")) {
    const by = nameOf(call["callee"]);
    if (!STARTERS.includes(by)) continue;
    const [program, , options] = Array.isArray(call["arguments"]) ? call["arguments"] : [];
    starts.push({ by, program: sourceOf(program, text), env: envOf(options, text) });
  }
  return starts;
}

test("one file names the module that starts other programs, however the name is spelled", () => {
  const naming = ourFiles()
    .filter((file) => readFileSync(file, "utf8").includes(STARTS_A_PROCESS))
    .map((file) => file.slice(ROOT.length + 1));

  assert.deepEqual(
    naming,
    [THE_ONE_FILE],
    `the check before this one looked for the module's name in double quotes, in files whose path ended a certain way, and asked what followed an opening bracket and came before a comma. A reviewer added a program that reaches the network in eight spellings and seven passed. The name now appears in one file or the suite stops: ${naming.join(", ")}`,
  );
});

test("that file starts six things, and nothing can be started through another name for the same call", () => {
  const text = readFileSync(join(ROOT, THE_ONE_FILE), "utf8");
  const parsed = parseSource("start.ts", text);
  assert.equal(parsed.kind, "parsed");
  if (parsed.kind !== "parsed") return;

  const brought = every(parsed.root, "ImportSpecifier")
    .filter((one) => STARTERS.includes(nameOf(one["imported"])))
    .map((one) => `${nameOf(one["imported"])} as ${nameOf(one["local"])}`)
    .sort();
  assert.deepEqual(brought, STARTERS.map((name) => `${name} as ${name}`), "each is brought in under its own name, once");

  const started = startsIn(text);
  assert.deepEqual(
    started.map((one) => `${one.by} ${one.program}`).sort(),
    [...STARTED].sort(),
    "what looper starts is a list short enough to read: git, cargo, dotnet, python, the two readers it built itself, and the one line a project declared as its own check",
  );

  const spoken = every(parsed.root, "Identifier").filter((one) => STARTERS.includes(nameOf(one))).length;
  assert.equal(
    spoken,
    started.length + STARTERS.length * 2,
    "a starter named anywhere but in its import and in a call that is listed above is a starter handed to something this test cannot follow",
  );
  assert.ok(text.includes("const binary = readerAt(looperRoot, which);"), "the one program not named by a word is a reader looper built, at the place looper builds it");
  assert.equal(PYTHON_COMMAND, "python3");
});

test("git, cargo and dotnet are each started with the words that keep them off the network", () => {
  const started = startsIn(readFileSync(join(ROOT, THE_ONE_FILE), "utf8"));

  for (const [program, told] of Object.entries(TOLD_TO_STAY_HOME)) {
    const starts = started.filter((one) => one.program === program);
    assert.equal(starts.length, 1, `${program} is started in one place`);
    for (const one of starts) {
      assert.equal(one.env, told, `${program} was started without the environment that was measured, and one start without it is all it takes`);
    }
  }
});

test("what looper adds to a program's environment wins over what was already there", () => {
  const said = environmentWith({ PATH: "only-this" });

  assert.equal(
    said["PATH"],
    "only-this",
    "a user who has the opposite setting in their own environment would otherwise switch the telemetry back on for looper's build",
  );
  assert.ok(Object.keys(said).length > 1, "and everything else a program needs is still there");
});

test("git is asked only to read, whatever words it is handed", () => {
  const refused: readonly (readonly string[])[] = [
    ["fetch", "origin"],
    ["pull"],
    ["push"],
    ["clone", "https://example.invalid/x.git"],
    ["remote", "update"],
    ["submodule", "update", "--init"],
    ["-c", "protocol.allow=always", "fetch", "origin"],
    ["config", "protocol.allow", "always"],
    ["tag", "v9"],
    [],
  ];

  for (const args of refused) {
    assert.throws(
      () => askGit(ROOT, args),
      NotSomethingLooperStarts,
      `git ${args.join(" ")} was started. The words come from other files, so a list handed over as a variable went past every check that read the source`,
    );
  }
  const head = askGit(ROOT, ["rev-parse", "HEAD"]);
  assert.equal(head.status, 0, String(head.stderr));
  assert.match(String(head.stdout).trim(), /^[0-9a-f]{40}$/);
});
