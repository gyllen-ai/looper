import { dispatchHook } from "../src/registry.ts";
import { Law } from "../src/law/capability.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, mkdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { surveyProject } from "../src/law/project.ts";
import { roleOf, shapeOf } from "../src/law/shape.ts";
import { RUST_RULES, rustRuleFor } from "../src/law/rust/rules.ts";
import { bansTheEngineDeclares } from "../src/law/rust/engine-words.ts";
import { crossingsIn } from "../src/law/rust/boundary.ts";
import { answeringFor } from "../src/law/project.ts";
import { engineIsBuilt } from "../src/law/rust/drive.ts";
import { NO_RUST_ENGINE, WITHOUT_THE_RUST_ENGINE } from "./rust-engine.ts";

const LOOPER_ROOT = join(import.meta.dirname, "..");

test("the Rust half is built, because nothing below judges a line of Rust without it", WITHOUT_THE_RUST_ENGINE, () => {
  assert.ok(
    engineIsBuilt(LOOPER_ROOT),
    "vendor/rust-law/target/release/looper-rust is missing or older than vendor/rust-law/src, so every Rust verdict below is the absence of an engine, or a law that has been replaced, rather than the absence of a violation.",
  );
});

test("a stale engine is built or said out loud, never reported as a wrong rule", () => {
  assert.ok(
    engineIsBuilt(LOOPER_ROOT) || NO_RUST_ENGINE !== undefined,
    "the Rust engine is neither current nor explained, so the tests below are about to fail as though thirty rules were wrong when nothing was asked of them",
  );
});

const EVERYTHING: readonly string[] = [];

const GUILTY_RUST = `fn read_setting(name: &str) -> String {
    std::env::var(name).unwrap()
}

fn main() {
    println!("{}", read_setting("PORT"));
}
`;

const SQL_IN_TSX = `export function App({ id }: { id: string }) {
  const query = \`SELECT * FROM users WHERE id = \${id}\`;
  return db.query(query);
}
`;

function tauriProject(): string {
  const root = mkdtempSync(join(tmpdir(), "looper-tauri-"));
  mkdirSync(join(root, "src"), { recursive: true });
  mkdirSync(join(root, "src-tauri", "src"), { recursive: true });
  writeFileSync(join(root, "package.json"), '{"name":"a","dependencies":{"react":"18"}}');
  writeFileSync(join(root, "src-tauri", "tauri.conf.json"), '{"productName":"a"}');
  writeFileSync(join(root, "src-tauri", "Cargo.toml"), '[package]\nname = "a"\nversion = "0.1.0"\nedition = "2021"\n');
  writeFileSync(join(root, "src-tauri", "src", "main.rs"), GUILTY_RUST);
  writeFileSync(join(root, "src", "App.tsx"), SQL_IN_TSX);
  return root;
}

test("every rule the Rust half can report has words looper wrote for it", () => {
  for (const rule of RUST_RULES) {
    assert.ok(rule.id.startsWith("RUST-"), `${rule.id} is not namespaced`);
    assert.ok(rule.instead.length > 0, `${rule.id} offers no legal spelling`);
    assert.ok(rule.why.length > 60, `${rule.id} gives no reason worth reading`);
  }
  assert.equal(
    RUST_RULES.length,
    31,
    "30 come from the engine; RUST-ERROR:9 is looper's own, for a file the engine could not read",
  );
});

test("a bare id from the Rust half maps to a rule, and an invented one does not", () => {
  assert.equal(rustRuleFor("ERROR:1").kind, "known");
  assert.equal(rustRuleFor("NOSUCH:9").kind, "unknown");
});

test("a Tauri repo is read as a Rust backend with a TypeScript interface", () => {
  const root = tauriProject();
  try {
    const shape = shapeOf(root);
    assert.equal(shape.kind, "tauri");
    assert.equal(roleOf(shape, "src-tauri/src/main.rs"), "backend");
    assert.equal(roleOf(shape, "src/App.tsx"), "interface");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the two halves are judged by their own law and never by each other's", WITHOUT_THE_RUST_ENGINE, () => {
  const root = tauriProject();
  try {
    const survey = surveyProject(root, "everything", EVERYTHING);
    const said = survey.violations.map((held) => `${held.rule.id} ${held.file}`);

    assert.ok(
      said.some((one) => one.startsWith("RUST-ERROR:1 src-tauri/src/main.rs")),
      `the Rust backend was not judged: ${said.join(", ")}`,
    );
    assert.equal(
      said.filter((one) => one.startsWith("DATA:1")).length,
      0,
      "a database rule fired on a Tauri interface, which never talks to a database",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the same TypeScript in a project that serves is judged as a backend", () => {
  const root = mkdtempSync(join(tmpdir(), "looper-api-"));
  try {
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "package.json"), '{"name":"a","dependencies":{"hono":"4"}}');
    writeFileSync(join(root, "src", "App.tsx"), SQL_IN_TSX);

    const survey = surveyProject(root, "everything", EVERYTHING);
    assert.ok(
      survey.violations.some((held) => held.rule.id === "DATA:1"),
      "the query rule did not fire on a project that declares a server",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

const INTERNAL_NAMES: Readonly<Record<string, string>> = {
  "RUST-DECOMPOSITION:1": "Loc",
  "RUST-DECOMPOSITION:2": "Switchboard",
  "RUST-DECOMPOSITION:3": "FnLoc",
  "RUST-LAYER:1": "LayerBreach",
  "RUST-LAYER:2": "InlinePath",
  "RUST-LAYER:3": "RuntimeDispatch",
  "RUST-ERROR:1": "SilentOp",
  "RUST-ERROR:2": "DiscardedPayload",
  "RUST-ERROR:3": "StubValue",
  "RUST-ERROR:4": "VanishedError",
  "RUST-ERROR:5": "MissingDeputy",
  "RUST-ERROR:6": "FallibleIterated",
  "RUST-ERROR:7": "CaughtCrash",
  "RUST-ERROR:8": "DropFallible",
  "RUST-TYPE:1": "ErasedErrorType",
  "RUST-TYPE:2": "ResultShorthand",
  "RUST-TYPE:3": "NamedOption",
  "RUST-TYPE:4": "CastErasure",
  "RUST-TYPE:5": "SilentMangle",
  "RUST-DEAD:1": "DeadSuppression",
  "RUST-DEAD:2": "Comment",
  "RUST-DEAD:3": "Unfinished",
  "RUST-DEAD:4": "GlobImport",
  "RUST-TRUTH:1": "ScatteredDefault",
  "RUST-TRUTH:2": "EnvOutsideSanctum",
  "RUST-TRUTH:3": "FallbackRoute",
  "RUST-LOG:1": "StrayPrint",
  "RUST-LOG:2": "StrayHandle",
  "RUST-LOG:3": "ValueInMessage",
  "RUST-TESTS:1": "InlineTest",
};

test("every rule the engine can report has words of ours mapped to it", () => {
  const engine = bansTheEngineDeclares(join(import.meta.dirname, ".."));
  assert.equal(engine.size, 30);
  const unmapped = [...engine.keys()].filter(
    (internal) => !Object.values(INTERNAL_NAMES).includes(internal),
  );
  assert.deepEqual(unmapped, [], "the engine can report these and looper has not named them");
});

test("what looper says a Rust rule bans is what the engine actually bans", () => {
  const engine = bansTheEngineDeclares(join(import.meta.dirname, ".."));
  const silent: string[] = [];

  for (const rule of RUST_RULES) {
    const internal = INTERNAL_NAMES[rule.id];
    if (internal === undefined) continue;
    const declared = engine.get(internal);
    if (declared === undefined) continue;

    const said = `${rule.bans} ${rule.instead.join(" ")}`.toLowerCase();
    const missing = [...declared.banned].filter((word) => !said.includes(word.toLowerCase()));
    const enough = declared.banned.size === 0 || missing.length <= declared.banned.size / 2;
    if (!enough) {
      silent.push(`${rule.id} never mentions ${missing.slice(0, 6).join(", ")}`);
    }
  }

  assert.deepEqual(
    silent,
    [],
    "a rule that fires on more than its own words describe is the failure this audit was about, and it is worse in a second language where nobody can check by reading",
  );
});

const BOTH_HALVES = `import { invoke } from "@tauri-apps/api/core";

export async function greetUser(name: string): Promise<string> {
  return invoke("greet", { name });
}

export async function saveNote(body: string): Promise<void> {
  return invoke("save_not", { body });
}
`;

const COMMANDS = `#[tauri::command]
fn greet(name: String) -> String {
    format!("hello {name}")
}

mod inner {
    #[tauri::command]
    pub fn deep_one() -> u8 {
        1
    }
}

fn main() {}
`;

test("a name no command answers to is refused, and a name that matches is not", () => {
  const answered = new Set(["greet", "deep_one"]);
  const found = crossingsIn("src/App.tsx", BOTH_HALVES, answered);

  assert.equal(found.length, 1, "exactly the misspelled one");
  assert.equal(found[0]?.rule.id, "TAURI:1");
  assert.equal(found[0]?.line, 8);
});

test("invoke that did not come from tauri is somebody else's function", () => {
  const mine = `function invoke(name: string) { return name; }\nexport const a = invoke("anything");`;
  assert.deepEqual([...crossingsIn("src/a.ts", mine, new Set())], []);
});

test("the boundary is judged across both halves of a real project", WITHOUT_THE_RUST_ENGINE, () => {
  const root = tauriProject();
  try {
    writeFileSync(join(root, "src-tauri", "src", "main.rs"), COMMANDS);
    writeFileSync(join(root, "src", "App.tsx"), BOTH_HALVES);

    const survey = surveyProject(root, "everything", EVERYTHING);
    const crossed = survey.violations.filter((held) => held.rule.id === "TAURI:1");
    assert.equal(crossed.length, 1, "the renamed command was not caught across the two halves");
    assert.equal(crossed[0]?.file, "src/App.tsx");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

const GUILTY_ONE_LINER = "pub fn f(x: Option<u8>) -> u8 { x.unwrap() }\n";

function rustCrate(body: string): string {
  const root = mkdtempSync(join(tmpdir(), "looper-rsgate-"));
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "Cargo.toml"), '[package]\nname="c"\nversion="0.1.0"\nedition="2021"\n');
  writeFileSync(join(root, "src", "lib.rs"), "mod a;\n");
  writeFileSync(join(root, "src", "a.rs"), body);
  return root;
}

function judgeEditOf(root: string, file: string) {
  return dispatchHook([new Law()], {
    root,
    event: "PostToolUse",
    payload: { kind: "text", text: JSON.stringify({ tool_name: "Edit", tool_input: { file_path: join(root, file) } }) },
  });
}

test("editing a Rust file is judged by the Rust law, not told it is not TypeScript", WITHOUT_THE_RUST_ENGINE, () => {
  const root = rustCrate(GUILTY_ONE_LINER);
  try {
    const result = judgeEditOf(root, "src/a.rs");
    const said = [...result.refusals.map((h) => h.reason), ...result.mentions.map((h) => h.note)].join("\n");

    assert.ok(!said.includes("TS-ERROR:8"), `the TypeScript law judged a Rust file:\n${said.slice(0, 300)}`);
    assert.ok(said.includes("RUST-ERROR:1"), `the Rust law did not run at the edit gate:\n${said.slice(0, 300)}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a Rust file with nothing wrong in it is not refused", () => {
  const root = rustCrate("pub fn f() -> u8 {\n    1\n}\n");
  try {
    const result = judgeEditOf(root, "src/a.rs");
    assert.deepEqual(
      result.refusals.map((h) => h.reason.slice(0, 60)),
      [],
      "a clean Rust edit was blocked",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function workspaceTauri(): string {
  const root = mkdtempSync(join(tmpdir(), "looper-ws-"));
  const crate = join(root, "crates", "launcher");
  mkdirSync(join(crate, "src-tauri", "src"), { recursive: true });
  mkdirSync(join(crate, "ui", "src"), { recursive: true });
  writeFileSync(join(root, "Cargo.toml"), '[workspace]\nmembers = ["crates/launcher/src-tauri"]\nresolver = "2"\n');
  writeFileSync(join(crate, "src-tauri", "Cargo.toml"), '[package]\nname="launcher"\nversion="0.1.0"\nedition="2021"\n');
  writeFileSync(join(crate, "src-tauri", "tauri.conf.json"), '{"productName":"launcher"}');
  writeFileSync(join(crate, "ui", "package.json"), '{"name":"ui","dependencies":{"react":"18"}}');
  writeFileSync(join(crate, "src-tauri", "src", "main.rs"), COMMANDS);
  writeFileSync(join(crate, "ui", "src", "App.tsx"), BOTH_HALVES);
  return root;
}

test("a Tauri app inside a cargo workspace is still a Tauri app", () => {
  const root = workspaceTauri();
  try {
    const shape = shapeOf(root);
    assert.equal(shape.kind, "tauri", `a nested src-tauri was read as ${shape.kind}`);
    assert.equal(roleOf(shape, "crates/launcher/src-tauri/src/main.rs"), "backend");
    assert.equal(roleOf(shape, "crates/launcher/ui/src/App.tsx"), "interface");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the boundary and the split both work on a nested layout", WITHOUT_THE_RUST_ENGINE, () => {
  const root = workspaceTauri();
  try {
    const survey = surveyProject(root, "everything", EVERYTHING);
    const said = survey.violations.map((held) => `${held.rule.id} ${held.file}`);

    assert.ok(
      said.some((one) => one.startsWith("TAURI:1")),
      `the renamed command was not caught in a workspace: ${said.join(", ")}`,
    );
    assert.equal(
      said.filter((one) => one.startsWith("DATA:1")).length,
      0,
      "a database rule fired on a Tauri interface nested in a workspace",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("one file that will not parse does not make its whole crate report clean", WITHOUT_THE_RUST_ENGINE, () => {
  const root = rustCrate(GUILTY_ONE_LINER);
  try {
    const before = surveyProject(root, "everything", EVERYTHING).violations.map((held) => held.rule.id);
    assert.ok(before.includes("RUST-ERROR:1"), "the fixture does not violate anything");

    writeFileSync(join(root, "src", "lib.rs"), "mod a;\nmod broken;\n");
    writeFileSync(join(root, "src", "broken.rs"), "pub fn g( {\n");

    const after = surveyProject(root, "everything", EVERYTHING).violations;
    assert.notEqual(after.length, 0, "a crate with an unreadable file reported nothing to fix");

    const said = after.map((held) => `${held.rule.id} ${held.file}`);
    assert.ok(
      said.some((one) => one.startsWith("RUST-ERROR:9") && one.includes("broken.rs")),
      `nothing named the file that could not be read: ${said.join(", ")}`,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the one file in the vendored tree that is ours obeys our law", () => {
  const ours = join(import.meta.dirname, "..", "vendor", "rust-law", "src", "bin", "looper-rust.rs");
  const text = readFileSync(ours, "utf8");
  const commented = text
    .split("\n")
    .map((line, at) => ({ line: line.trim(), at: at + 1 }))
    .filter((held) => held.line.startsWith("//") || held.line.startsWith("/*"));

  assert.deepEqual(
    commented.map((held) => `line ${held.at}: ${held.line.slice(0, 40)}`),
    [],
    "vendor/ is outside the law because it holds somebody else's code. This file is ours, and RUST-DEAD:2 applies to it.",
  );
});

test("two Tauri apps in one repository do not answer each other's invokes", () => {
  const apps = new Map<string, ReadonlySet<string>>([
    ["crates/client", new Set(["save_note"])],
    ["crates/launcher", new Set(["start_game"])],
  ]);

  const inClient = answeringFor(apps, "crates/client/src/App.tsx");
  assert.equal(inClient.kind, "named");
  if (inClient.kind !== "named") return;
  assert.ok(
    !inClient.names.has("start_game"),
    "a command only the launcher answers was accepted in the client. Nothing connects them at runtime, so that call fails exactly the way TAURI:1 exists to prevent.",
  );
  assert.ok(inClient.names.has("save_note"));

  assert.equal(
    answeringFor(apps, "packages/shared/src/util.ts").kind,
    "none",
    "a file under no app has no owning command set, and guessing one is how the union bug started",
  );
});

function fakeEngine(): { root: string; binary: string; source: string } {
  const root = mkdtempSync(join(tmpdir(), "looper-engine-freshness-"));
  const built = join(root, "vendor", "rust-law", "target", "release");
  const src = join(root, "vendor", "rust-law", "src");
  mkdirSync(built, { recursive: true });
  mkdirSync(src, { recursive: true });
  const binary = join(built, "looper-rust");
  const source = join(src, "patterns.rs");
  writeFileSync(source, "pub fn f() {}\n");
  writeFileSync(binary, "");
  for (const name of ["Cargo.toml", "Cargo.lock"]) {
    writeFileSync(join(root, "vendor", "rust-law", name), "");
    utimesSync(join(root, "vendor", "rust-law", name), new Date(1000), new Date(1000));
  }
  return { root, binary, source };
}

test("an engine built after its own source is ready to judge", () => {
  const { root, binary, source } = fakeEngine();
  try {
    utimesSync(source, new Date(1000), new Date(1000));
    utimesSync(binary, new Date(2000), new Date(2000));

    assert.ok(engineIsBuilt(root), "the binary is newer than every source, so it is the current law");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an engine older than its own source is not built, it is stale", () => {
  const { root, binary, source } = fakeEngine();
  try {
    utimesSync(binary, new Date(1000), new Date(1000));
    utimesSync(source, new Date(2000), new Date(2000));

    assert.equal(
      engineIsBuilt(root),
      false,
      "a pin bump rewrites vendor/rust-law/src and leaves the old binary in place. Deciding on existence alone judges Rust by rules that were replaced, and says nothing at all about it.",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a manifest newer than the binary is stale too, because the crates are the law's dependencies", () => {
  const { root, binary } = fakeEngine();
  try {
    const manifest = join(root, "vendor", "rust-law", "Cargo.toml");
    utimesSync(binary, new Date(1000), new Date(1000));
    utimesSync(manifest, new Date(2000), new Date(2000));

    assert.equal(engineIsBuilt(root), false, "a changed manifest is a changed engine");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an engine whose manifest has been deleted is rebuilt, not read as age zero", () => {
  const { root, binary } = fakeEngine();
  try {
    rmSync(join(root, "vendor", "rust-law", "Cargo.lock"));
    utimesSync(binary, new Date(9000), new Date(9000));

    assert.equal(
      engineIsBuilt(root),
      false,
      "the old reader swallowed a missing manifest and called the engine current, so a half-deleted engine judged every Rust file with whatever binary was lying there",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
