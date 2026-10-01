import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";

import { searchPath } from "../src/config.ts";
import { everyWordAt, gitCouldNotAnswer, stagedAdditions, whyGitCouldNot } from "../src/git.ts";

const ROOT = join(import.meta.dirname, "..");

function git(root: string, ...args: readonly string[]): string {
  return execFileSync("git", [...args], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

function heldIn(root: string): string {
  return git(root, "count-objects", "-v")
    .split("\n")
    .filter((line) => line.startsWith("count:") || line.startsWith("in-pack:"))
    .join(" ");
}

function repository(dir: string): string {
  mkdirSync(dir, { recursive: true });
  git(dir, "init", "-q");
  git(dir, "config", "user.email", "t@example.com");
  git(dir, "config", "user.name", "t");
  return dir;
}

function cloneThatHoldsNoContents(dir: string): string {
  const origin = repository(join(dir, "origin"));
  git(origin, "config", "uploadpack.allowfilter", "true");
  for (const name of ["one", "two", "three"]) writeFileSync(join(origin, `${name}.txt`), `the ${name} lives upstream\n`);
  git(origin, "add", ".");
  git(origin, "commit", "-q", "-m", "three files");
  git(dir, "clone", "-q", "--filter=blob:none", "--no-checkout", `file://${origin}`, "partial");
  return join(dir, "partial");
}

test("git is never left to fetch on its own: a clone that holds no file contents is read as far as it goes", () => {
  const dir = mkdtempSync(join(tmpdir(), "looper-no-wire-"));
  try {
    const partial = cloneThatHoldsNoContents(dir);
    const before = heldIn(partial);

    const said = everyWordAt(partial, "HEAD", []);

    assert.equal(
      heldIn(partial),
      before,
      "looper asked git a question and git went to the remote for the answer. In a clone made without file contents every read of an old file is a fetch, so the push gate would pull a whole repository over the network to count its words",
    );
    assert.equal(
      said.kind,
      "cannot-tell",
      `what is not on this machine cannot be read, and saying so is the honest answer: ${JSON.stringify(said).slice(0, 200)}`,
    );
    if (said.kind !== "cannot-tell") return;
    assert.ok(
      said.why.includes("made without the contents"),
      `the reason given was the command line that failed, and the hint that followed it was about a scan running out of time. What happened is that the files are not here: ${said.why}`,
    );

    assert.ok(git(partial, "show", "HEAD:one.txt").includes("lives upstream"), "the control: asked plainly, git does fetch it");
    assert.notEqual(heldIn(partial), before, "and the fetch is visible as an object that was not there before");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a setting of the user's own that allows a transport does not let git fetch for looper", () => {
  const dir = mkdtempSync(join(tmpdir(), "looper-no-wire-"));
  try {
    const partial = cloneThatHoldsNoContents(dir);
    git(partial, "config", "protocol.file.allow", "always");
    const before = heldIn(partial);

    const said = everyWordAt(partial, "HEAD", []);

    assert.equal(
      heldIn(partial),
      before,
      "the switch on the command line is the general rule, and one line of the user's own config for one transport outranks it. That line is the usual cure for submodules kept on the same machine, so it is on a great many of them, and with it git fetched",
    );
    assert.equal(said.kind, "cannot-tell");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a program the user has put in charge of showing differences is not run in place of the difference", () => {
  const dir = mkdtempSync(join(tmpdir(), "looper-no-wire-"));
  try {
    const root = repository(join(dir, "project"));
    const shows = join(dir, "shows-nothing.sh");
    writeFileSync(shows, "#!/bin/sh\nexit 0\n");
    chmodSync(shows, 0o755);
    writeFileSync(join(root, "a.txt"), "first\n");
    git(root, "add", "a.txt");
    git(root, "commit", "-q", "-m", "first");
    git(root, "config", "diff.external", shows);
    writeFileSync(join(root, "a.txt"), "first\nthe added line\n");
    git(root, "add", "a.txt");

    const staged = stagedAdditions(root);

    assert.equal(staged.kind, "lines");
    if (staged.kind !== "lines") return;
    assert.deepEqual(
      staged.added.map((one) => one.text),
      ["the added line"],
      "git handed the question to the user's own program, which printed something else or nothing, so the gate that reads what is about to be committed for credentials read nothing at all and passed",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an answer git gave while saying it could not read every file is not taken for the whole answer", () => {
  const dir = mkdtempSync(join(tmpdir(), "looper-no-wire-"));
  try {
    const origin = repository(join(dir, "origin"));
    git(origin, "config", "uploadpack.allowfilter", "true");
    for (const name of ["one", "two", "three"]) writeFileSync(join(origin, `${name}.txt`), `the ${name} lives upstream\n`);
    git(origin, "add", ".");
    git(origin, "commit", "-q", "-m", "three files");
    git(dir, "clone", "-q", "--filter=blob:none", `file://${origin}`, "partial");
    const partial = join(dir, "partial");
    writeFileSync(join(origin, "four.txt"), "the fourth arrived later\n");
    git(origin, "add", ".");
    git(origin, "commit", "-q", "-m", "a fourth");
    git(partial, "fetch", "-q", "origin");

    const answered = spawnSync("git", ["grep", "-h", "-o", "-E", "[a-z]+", "FETCH_HEAD"], {
      cwd: partial,
      encoding: "utf8",
      env: { PATH: searchPath().join(delimiter), HOME: dir, GIT_NO_LAZY_FETCH: "1" },
    });

    assert.ok(!String(answered.stdout).includes("fourth"), "the control: the fourth file is not on this machine, and this git was told not to go and get it");
    assert.equal(
      gitCouldNotAnswer(answered),
      true,
      `some versions of git do not stop when they cannot read a file they need: they skip it and exit as if they had read everything (2.53 does, told not to fetch; 2.55 stops). Words that are upstream would then be counted as new, with nothing to say the count was short. This git exited ${String(answered.status)} saying: ${String(answered.stderr).slice(0, 200)}`,
    );
    if (answered.status !== 0) return;
    assert.ok(String(answered.stdout).includes("upstream"), "this git is one that answers anyway, with the words of the three files it has");
    assert.ok(whyGitCouldNot(answered).includes("made without the contents"), whyGitCouldNot(answered));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

const SOURCE_OF_STARTS = readFileSync(join(ROOT, "src", "start.ts"), "utf8");

test("git is told in two ways that no transport is allowed, because the first way can be outranked", () => {
  assert.ok(SOURCE_OF_STARTS.includes('["-c", "protocol.allow=never"]'), "the switch every version of git understands");
  assert.ok(
    SOURCE_OF_STARTS.includes('GIT_ALLOW_PROTOCOL: ""'),
    "set and empty, this allows no transport and outranks the user's configuration; left unset, one line of that configuration switches a transport back on",
  );
});

const WHAT_THE_BUILD_IS_TOLD: readonly (readonly [string, string])[] = [
  ['DOTNET_CLI_TELEMETRY_OPTOUT: "1"', "the SDK sends usage data to its maker on every build unless it is told not to"],
  ['DOTNET_CLI_WORKLOAD_UPDATE_NOTIFY_DISABLE: "true"', "and looks for newer workload manifests in the background"],
  ['NUGET_CERT_REVOCATION_MODE: "offline"', "restoring a signed package looks up the signer's revocation hosts: 24 lookups on a first build, seen"],
  ['"-p:NuGetAudit=false"', "the audit asks every source for known vulnerabilities, and a source can arrive from the environment"],
  ['"-p:RestoreAdditionalProjectSources="', "an environment variable of that name is a source: 6 lookups, seen"],
  ['"-p:RestoreConfigFile=NuGet.config"', "only the reader's own configuration is read, so the user's sources are never asked"],
  ['"-p:ImportDirectoryBuildProps=false"', "a file in the user's project, above node_modules, is otherwise part of this build"],
  ['"-p:ImportDirectoryBuildTargets=false"', "and so is its twin"],
  ['"-p:ImportDirectoryPackagesProps=false"', "a project that manages its package versions in one place otherwise stops this build"],
  ['"-noAutoResponse"', "switches in a file above are otherwise added to this command line"],
];

test("the C# build is started with every word that was measured to keep it at home", () => {
  for (const [word, why] of WHAT_THE_BUILD_IS_TOLD) {
    assert.ok(SOURCE_OF_STARTS.includes(word), `${word} is gone from the build: ${why}`);
  }
  assert.ok(
    !SOURCE_OF_STARTS.includes("DOTNET_SDK_VULNERABILITY_CHECK_DISABLE"),
    "that name was set by the first version of this change and is in no file of the SDK: it did nothing, and a guard that does nothing is worse than none because somebody believes it",
  );
});

test("the C# reader's folder shields its build from the project it is installed in", () => {
  const engine = join(ROOT, "vendor", "csharp-law");

  assert.deepEqual(
    JSON.parse(readFileSync(join(engine, "global.json"), "utf8")),
    {},
    "the tool looks upward for this file and takes the first it finds; without one here it finds the user's, and a project pinned to another version of the tool stops looper's build with exit 155",
  );
  const config = readFileSync(join(engine, "NuGet.config"), "utf8");
  assert.match(config, /<auditSources>\s*<clear \/>\s*<\/auditSources>/, "the user's audit sources are otherwise asked about looper's packages");
});

test("cargo is started so that the tool in front of it cannot go and download a compiler", () => {
  assert.ok(
    SOURCE_OF_STARTS.includes('RUSTUP_AUTO_INSTALL: "0"'),
    "a project that pins a compiler version nobody has installed made looper's build fetch it: one lookup of the compiler's download host, seen",
  );
  assert.ok(SOURCE_OF_STARTS.includes("RUSTUP_TOOLCHAIN"), "and the build is pointed at the compiler that is installed, so it still builds");
});

function looper(args: readonly string[], cwd: string, more: Readonly<Record<string, string>>): string {
  const env: Record<string, string> = { PATH: searchPath().join(delimiter) };
  for (const [name, value] of Object.entries(more)) env[name] = value;
  const ran = spawnSync(process.execPath, [join(ROOT, "bin", "looper.js"), ...args], { cwd, encoding: "utf8", env });
  return `${String(ran.stdout)}${String(ran.stderr)}`;
}

test("python is started alone, so nothing the user's environment loads at startup runs inside looper's reader", () => {
  const dir = mkdtempSync(join(tmpdir(), "looper-no-wire-"));
  try {
    const project = join(dir, "project");
    const startup = join(dir, "startup");
    const mark = join(dir, "it-ran");
    mkdirSync(join(project, ".looper"), { recursive: true });
    mkdirSync(startup, { recursive: true });
    writeFileSync(join(startup, "sitecustomize.py"), `open(${JSON.stringify(mark)}, "a").write("ran")\n`);
    writeFileSync(join(project, "a.py"), "def held():\n    try:\n        pass\n    except:\n        pass\n");

    const said = looper(["law", "a.py"], project, { HOME: join(dir, "home"), PYTHONPATH: startup });

    assert.ok(said.includes("PY-ERROR:1"), `the reader has to have run for this to mean anything: ${said.slice(0, 300)}`);
    assert.ok(
      !existsSync(mark),
      "a file named in the user's environment was run by looper's reader before the reader. That is how monitoring tools attach themselves to every python that starts, and the first thing they do is call home",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

const COULD_SPEAK = /^NativeModule (?:internal\/)?(?:deps\/undici|https?|_http_|http2|tls|_tls_|dns|net|dgram|quic|inspector|cluster|worker)/;

const TELL_WHAT_LOADED =
  "data:text/javascript,process.on('exit',()=>process.stderr.write('LOADED '+JSON.stringify(process.moduleLoadList)+'\\n'))";

function loadedBy(script: readonly string[], input: string, cwd: string, home: string): readonly string[] {
  const ran = spawnSync(process.execPath, ["--import", TELL_WHAT_LOADED, ...script], {
    cwd,
    input,
    encoding: "utf8",
    env: { PATH: searchPath().join(delimiter), HOME: home },
    maxBuffer: 64 * 1024 * 1024,
  });
  const line = String(ran.stderr).split("\n").find((one) => one.startsWith("LOADED "));
  assert.ok(line !== undefined, `the run did not say what it loaded: ${String(ran.stderr).slice(0, 300)}`);
  assert.ok(
    !`${String(ran.stdout)}${String(ran.stderr)}`.includes("could not be loaded"),
    `a looper that cannot load loads nothing, and would pass this test by doing nothing at all: ${String(ran.stderr).slice(0, 300)}`,
  );
  const loaded: unknown = JSON.parse(line.slice("LOADED ".length));
  assert.ok(Array.isArray(loaded));
  return loaded.map(String).filter((name) => COULD_SPEAK.test(name));
}

const A_PROGRAM_THAT_ONLY_STARTS_OTHERS = ["--input-type=module", "-e", 'await import("node:child_process"); await import("node:readline");'];

test("no looper run loads a module that could speak, beyond what Node loads for any program that starts another", () => {
  const dir = mkdtempSync(join(tmpdir(), "looper-loaded-"));
  try {
    const project = join(dir, "project");
    const home = join(dir, "home");
    mkdirSync(join(project, "src"), { recursive: true });
    mkdirSync(join(project, ".looper"), { recursive: true });
    mkdirSync(home, { recursive: true });
    writeFileSync(join(project, "src", "a.ts"), "export const held = 1;\n");
    const edit = JSON.stringify({ session_id: "s", tool_name: "Edit", tool_input: { file_path: join(project, "src", "a.ts") } });
    const call = (name: string): string => `${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: {} } })}\n`;
    const runs: readonly (readonly [readonly string[], string])[] = [
      [["inject"], JSON.stringify({ session_id: "s", prompt: "hello" })],
      [["hook", "PostToolUse"], edit],
      [["hook", "PreToolUse"], JSON.stringify({ session_id: "s", tool_name: "Bash", tool_input: { command: "git push" } })],
      [["hook", "Stop"], JSON.stringify({ session_id: "s" })],
      [["hook", "PreCommit"], ""],
      [["serve"], `${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" })}\n${call("report")}${call("recall")}${call("decisions")}`],
      [["report", "--list"], ""],
      [["status"], ""],
      [["law"], ""],
      [["loop"], ""],
      [["strangers"], ""],
      [["init"], ""],
    ];
    const anyway = new Set(loadedBy(A_PROGRAM_THAT_ONLY_STARTS_OTHERS, "", project, home));

    for (const [args, input] of runs) {
      const spoke = loadedBy([join(ROOT, "bin", "looper.js"), ...args], input, project, home).filter((name) => !anyway.has(name));
      assert.deepEqual(
        spoke,
        [],
        `looper ${args.join(" ")} loaded ${spoke.join(", ")}. Reading the source finds an import that is written down; this finds one that was put together at run time, in looper or in anything it depends on, on the roads this test walks. What Node loads for every program that can start another is taken from a program that does only that, so the list is Node's own and not somebody's memory of it`,
      );
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
