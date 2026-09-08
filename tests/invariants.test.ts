import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

import { ALLOW_MARKER, SERVER_VERSION } from "../src/config.ts";
import { commentCheck } from "../src/law/ts/comment.ts";
import { scanText } from "../src/secrets/capability.ts";

const ROOT = join(import.meta.dirname, "..");

import { ourFiles } from "./our-files.ts";

const SPAWN_CAPABLE = "node:child_process";

const SPAWN_SANCTUM = "git.ts";

const ARGUED_FOR: readonly string[] = ["@babel/parser"];

const INSTALL_HOOKS: readonly string[] = ["preinstall", "install", "postinstall"];


function manifestAt(path: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  assert.ok(parsed !== null && typeof parsed === "object" && !Array.isArray(parsed));
  return { ...parsed };
}

function names(field: string): readonly string[] {
  const table = manifestAt(join(ROOT, "package.json"))[field];
  if (table === undefined) return [];
  assert.ok(table !== null && typeof table === "object");
  return Object.keys(table);
}

function installedPackages(): readonly string[] {
  const modules = join(ROOT, "node_modules");
  if (!existsSync(modules)) return [];
  const found: string[] = [];
  for (const entry of readdirSync(modules)) {
    if (entry.startsWith(".")) continue;
    if (entry.startsWith("@")) {
      for (const scoped of readdirSync(join(modules, entry))) {
        found.push(join(modules, entry, scoped));
      }
      continue;
    }
    found.push(join(modules, entry));
  }
  return found;
}

const MAY_SPAWN: readonly string[] = [
  SPAWN_SANCTUM,
  "law/rust/drive.ts",
  "law/python/drive.ts",
  "law/csharp/drive.ts",
  "loop/run.ts",
];

test("only the named files may start another process, and each says what it starts", () => {
  for (const file of ourFiles()) {
    const text = readFileSync(file, "utf8");
    if (!text.includes(`"${SPAWN_CAPABLE}"`)) continue;
    assert.ok(
      MAY_SPAWN.some((allowed) => file.endsWith(allowed)),
      `${file} can start another process and is not on the list. Starting a process is only as safe as the thing being started, so every one lives in a named file and the list is short enough to read: ${MAY_SPAWN.join(", ")}.`,
    );
  }
});

test("the loop runner starts only what this project declared, and never on a hook", () => {
  const text = readFileSync(join(ROOT, "src", "loop", "run.ts"), "utf8");
  assert.ok(
    text.includes("check.run"),
    "the loop runner must start the project's own declared line and nothing it composed itself",
  );
  const wiring = readFileSync(join(ROOT, "src", "registry.ts"), "utf8");
  assert.ok(
    !wiring.includes("loop/run.ts") && !wiring.includes("commands/loop.ts"),
    "the loop runner is not reachable from a hook: a project's file may not be run because a session started",
  );
});

test("the files that may start a process start only what they were allowed to", () => {
  const starts: Record<string, string> = {
    [SPAWN_SANCTUM]: '"git"',
    "law/rust/drive.ts": '"cargo"',
    "law/csharp/drive.ts": '"dotnet"',
  };
  for (const [file, expected] of Object.entries(starts)) {
    const text = readFileSync(join(ROOT, "src", file), "utf8");
    assert.ok(
      text.includes(`execFileSync(${expected}`) || text.includes("execFileSync(builtAt("),
      `${file} is allowed to start ${expected} and looper's own Rust program, and nothing else.`,
    );
  }
});

test("every dependency is one that was argued for by name", () => {
  for (const field of ["dependencies", "devDependencies"]) {
    for (const name of names(field)) {
      assert.ok(
        ARGUED_FOR.includes(name),
        `${name} is installed and is not in the argued-for list. Every dependency is a decision written down in PLAN.md before it lands, and this list is the record that it was.`,
      );
    }
  }
});

test("no dependency runs code at install time", () => {
  for (const path of installedPackages()) {
    const manifest = join(path, "package.json");
    if (!existsSync(manifest)) continue;
    const scripts = manifestAt(manifest)["scripts"];
    if (scripts === undefined || scripts === null || typeof scripts !== "object") {
      continue;
    }
    for (const hook of INSTALL_HOOKS) {
      assert.ok(
        !(hook in scripts),
        `${path} runs a ${hook} script. An install script executes on every machine that installs looper, before anyone has read a line of it.`,
      );
    }
  }
});

test("no install can arrive able to look at a screen", () => {
  const tracked = execFileSync("git", ["ls-files", "*seer*"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(
    tracked.trim(),
    "",
    "a capture program is committed. looper carried one until 2026-09-08 and it was removed whole; nothing that can photograph somebody's screen travels with looper, and this is what keeps it from coming back by accident.",
  );

  const shipped = manifestAt(join(ROOT, "package.json"))["files"];
  assert.ok(Array.isArray(shipped));
  for (const part of shipped) {
    assert.ok(
      !String(part).includes("seer"),
      `the package ships ${String(part)}, which would carry a capture program to every machine that installs looper`,
    );
  }
});

const OUR_ENGINE_CHANGES: readonly string[] = [
  "scan_tokens_for_casts",
  "scan_tokens_for_paths",
  "scan_tokens_for_env_calls",
  "scan_tokens_for_env_macros",
  "tokens_name_a_cargo_key",
  "path_is_option_none",
  "path_is_fallible_family",
  "expr_is_empty_string",
  "owned_by_another_type",
];

test("the engine still carries the shape reader the report needs", () => {
  const held = readFileSync(join(ROOT, "vendor", "rust-law", "src", "skeleton.rs"), "utf8");
  for (const named of ["pub fn shape_at", "fn on_line", "fn item_holding"]) {
    assert.ok(
      held.includes(named),
      `vendor/rust-law/src/skeleton.rs no longer has ${named}, so \`looper report\` cannot describe a Rust file and twenty-nine Rust rules become unarguable. A newer copy of lawkeeper does not have this file: it is ours, and PROVENANCE.md says to re-apply it.`,
    );
  }
});

test("the engine still carries what we added to it", () => {
  const patterns = readFileSync(join(ROOT, "vendor", "rust-law", "src", "patterns.rs"), "utf8");
  for (const named of OUR_ENGINE_CHANGES) {
    assert.ok(
      patterns.includes(named),
      `${named} is gone. Four rules were blind inside a macro argument until it existed, and a newer copy of lawkeeper will not have it — PROVENANCE.md lists what to re-apply.`,
    );
  }
});

test("the version a report carries is the version this is", () => {
  const manifest = manifestAt(join(ROOT, "package.json"));
  assert.equal(
    SERVER_VERSION,
    manifest["version"],
    "a report names the version it came from, and triage starts from that line. Two versions means the line is decoration.",
  );
});

test("the lockfile is committed, because the invariant is about resolved versions", () => {
  assert.ok(
    existsSync(join(ROOT, "package-lock.json")),
    "a tree that resolves freshly each time proves nothing about what anyone actually builds, so the resolved versions are pinned and committed",
  );
});

const PUBLISHABLE: readonly string[] = ["LICENSE", "CONTRIBUTING.md", "README.md"];

test("everything a public repository owes a reader is present", () => {
  for (const file of PUBLISHABLE) {
    assert.ok(existsSync(join(ROOT, file)), `${file} is missing, and a public fork needs it`);
  }
  const licence = readFileSync(join(ROOT, "LICENSE"), "utf8");
  assert.ok(licence.includes("Zero-Clause BSD"), "the licence is not the one package.json declares");
});

test("a fresh copy of the engine does not silently undo what we changed in it", () => {
  const config = readFileSync(join(ROOT, "vendor", "rust-law", "src", "config.rs"), "utf8");
  const outer = config.indexOf("pub struct LawConfig");
  assert.ok(outer > 0, "LawConfig is gone, so this guard is reading the wrong file");

  assert.ok(
    !config.slice(0, outer).endsWith("#[serde(default, deny_unknown_fields)]\n"),
    "LawConfig refuses every table it does not own, so one [ts] section takes the whole Rust half down with it and the message names the file rather than the cause. If this arrived with a newer lawkeeper, re-apply the change PROVENANCE.md records.",
  );
  assert.ok(
    config.includes("deny_unknown_fields"),
    "the inner tables lost it too. A typo inside a table the engine owns is a concession nobody notices, which is what that attribute is for.",
  );
});

test("the vendored engine keeps its own licence and its provenance", () => {
  const vendored = join(ROOT, "vendor", "rust-law");
  assert.ok(existsSync(join(vendored, "LICENSE")), "somebody else's code without its licence");
  assert.ok(
    existsSync(join(vendored, "PROVENANCE.md")),
    "3,900 lines nobody here wrote and nothing saying where they came from",
  );
});

test("looper is still private, which is the one flag left to flip", () => {
  const held: unknown = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  const asObject = held === null || typeof held !== "object" ? {} : held;
  assert.equal(
    Object.getOwnPropertyDescriptor(asObject, "license")?.value,
    "0BSD",
    "the licence field and the LICENSE file have to agree",
  );
  assert.equal(
    Object.getOwnPropertyDescriptor(asObject, "private")?.value,
    true,
    "when this is deliberately made public, delete this test with the flag",
  );
});

test("the command an install exposes is plain JavaScript, and ships with everything it reads", () => {
  const manifest = manifestAt(join(ROOT, "package.json"));
  const entry = Object.getOwnPropertyDescriptor(manifest["bin"], "looper")?.value;
  assert.equal(typeof entry, "string");
  assert.ok(
    String(entry).endsWith(".js"),
    "Node refuses to strip types under node_modules, so a TypeScript entry point is dead on every machine but this one",
  );
  assert.ok(existsSync(join(ROOT, String(entry))), `${String(entry)} is what an install runs and it is not here`);

  const shipped = manifest["files"];
  assert.ok(Array.isArray(shipped));
  for (const part of ["bin", "src", "vendor"]) {
    assert.ok(shipped.includes(part), `an install without ${part} cannot run: it is read at runtime`);
  }
});

test("the install line points at the repository this actually is", () => {
  const held: unknown = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  const where = Object.getOwnPropertyDescriptor(held, "repository")?.value;
  const url = Object.getOwnPropertyDescriptor(where, "url")?.value;
  assert.equal(typeof url, "string");

  const slug = String(url).replace(/^git\+https:\/\/github\.com\//, "").replace(/\.git$/, "");
  for (const file of ["README.md", "CONTRIBUTING.md"]) {
    const text = readFileSync(join(ROOT, file), "utf8");
    if (!text.includes("npm install")) continue;
    assert.ok(
      text.includes(`github:${slug}`),
      `${file} tells a stranger to install from somewhere that is not ${slug}. The first command in a README is the one that has to work.`,
    );
  }
});

test("the file of deliberately key-shaped fixtures has a spelling both gates accept", () => {
  const at = "audit/secrets-probe.ts";
  const text = readFileSync(join(ROOT, at), "utf8");

  assert.deepEqual(
    [...scanText(ROOT, text, at)],
    [],
    "the commit gate refuses the one file whose whole purpose is to hold key-shaped values, and neither route it offers works here: the allow-list wants the exact value, which is what assembling them from halves avoids, and the marker is a comment",
  );
  assert.deepEqual(
    [...commentCheck.run({ file: at, text, root: ROOT })],
    [],
    "TS-DEAD:2 refuses the markers that make the commit gate quiet, so the two rules cancel each other and the file cannot be written at all",
  );
  assert.ok(
    text.includes(ALLOW_MARKER),
    "the markers are gone, so this test now passes for the wrong reason and would keep passing if the gate stopped working",
  );
});














test("a reader that is listened to may answer with more than a megabyte", () => {
  const IGNORES_STDOUT = /stdio:\s*\[\s*"[^"]*",\s*"ignore"/;
  const unguarded: string[] = [];

  for (const file of ourFiles()) {
    const text = readFileSync(file, "utf8");
    for (const starter of ["execFileSync(", "spawnSync(", "execSync("]) {
      let at = text.indexOf(starter);
      while (at !== -1) {
        const call = text.slice(at, at + 400);
        if (!IGNORES_STDOUT.test(call) && !call.includes("maxBuffer")) {
          const line = text.slice(0, at).split("\n").length;
          unguarded.push(`${file.slice(ROOT.length + 1)}:${line}`);
        }
        at = text.indexOf(starter, at + 1);
      }
    }
  }

  assert.deepEqual(
    unguarded,
    [],
    `${unguarded.join(", ")} reads a subprocess's answer with node's one-megabyte default. Adopter PR #112 found 906 C# files reported unreadable because a reader's answer was cut mid-string at that cap. It was in four places then; a fifth arrived in #122 through spawnSync, which this check only looked for after it had already missed one.`,
  );
});

test("every injection says whether the work raised it, because a missing word reads as no", () => {
  const silent: string[] = [];

  for (const file of ourFiles()) {
    const text = readFileSync(file, "utf8");
    let at = text.indexOf("priority:");
    while (at !== -1) {
      const nearby = text.slice(Math.max(0, at - 200), at + 200);
      if (!nearby.includes("required:") && !nearby.includes("priority: number")) {
        silent.push(`${file.slice(ROOT.length + 1)}:${text.slice(0, at).split("\n").length}`);
      }
      at = text.indexOf("priority:", at + 1);
    }
  }

  assert.deepEqual(
    silent,
    [],
    `${silent.join(", ")} builds an injection without saying whether it is required. Nothing type-checks this repository, so the missing word reads as "no" and the contribution becomes droppable — which is how adopter PR #124 counted a project's own doctrine going over the side 32 times in one session.`,
  );
});
