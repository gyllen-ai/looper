import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const LOOPER = join(import.meta.dirname, "..");

const STAND_INS: readonly string[] = ["git", "cargo", "dotnet", "python3"];

const WRITES_DOWN_WHAT_IT_WAS_HANDED = (name: string): string =>
  [
    "#!/bin/sh",
    `{ for word in "$@"; do printf '%s\\n' "$word"; done; } > "$RECORD/${name}.args"`,
    `/usr/bin/env > "$RECORD/${name}.env"`,
    `pwd > "$RECORD/${name}.cwd"`,
    "",
  ].join("\n");

const ASKS_EACH_ONCE = `
import { askGit, buildCsharpReader, buildRustReader, runPython } from ${JSON.stringify(join(LOOPER, "src/start.ts"))};
const [root] = process.argv.slice(1);
askGit(root, ["diff", "--cached", "-U0"]);
buildRustReader(root);
buildCsharpReader(root);
runPython(root, "rules", ["a.py"]);
`;

type Scene = { readonly dir: string; readonly root: string; readonly record: string; readonly rustup: string };

function scene(): Scene {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "looper-told-")));
  const root = join(dir, "looper");
  const record = join(dir, "record");
  const rustup = join(dir, "rustup");
  for (const part of [join(root, "vendor/rust-law"), join(root, "vendor/csharp-law"), record, join(dir, "tools"), join(dir, "home"), rustup]) {
    mkdirSync(part, { recursive: true });
  }
  for (const name of STAND_INS) {
    writeFileSync(join(dir, "tools", name), WRITES_DOWN_WHAT_IT_WAS_HANDED(name));
    chmodSync(join(dir, "tools", name), 0o755);
  }
  return { dir, root, record, rustup };
}

function asked(held: Scene, theirs: Readonly<Record<string, string>>): void {
  const env: Record<string, string> = { PATH: join(held.dir, "tools"), HOME: join(held.dir, "home"), RECORD: held.record, RUSTUP_HOME: held.rustup };
  for (const [name, value] of Object.entries(theirs)) env[name] = value;
  const ran = spawnSync(process.execPath, ["--input-type=module", "-e", ASKS_EACH_ONCE, held.root], { encoding: "utf8", env });
  assert.equal(ran.status, 0, `${String(ran.stdout)}${String(ran.stderr)}`);
}

function wordsTo(held: Scene, name: string): readonly string[] {
  return readFileSync(join(held.record, `${name}.args`), "utf8").split("\n").slice(0, -1);
}

function environmentOf(held: Scene, name: string): ReadonlyMap<string, string> {
  const said = new Map<string, string>();
  for (const line of readFileSync(join(held.record, `${name}.env`), "utf8").split("\n")) {
    const at = line.indexOf("=");
    if (at > 0) said.set(line.slice(0, at), line.slice(at + 1));
  }
  return said;
}

function startedIn(held: Scene, name: string): string {
  return readFileSync(join(held.record, `${name}.cwd`), "utf8").trim();
}

function installs(held: Scene, toolchain: string, settings: string): void {
  if (toolchain.length > 0) mkdirSync(join(held.rustup, "toolchains", toolchain), { recursive: true });
  writeFileSync(join(held.rustup, "settings.toml"), settings);
}

test("git is handed the switch, the words that were asked, and an environment that allows no transport", () => {
  const held = scene();
  try {
    asked(held, { GIT_ALLOW_PROTOCOL: "file:https:ssh" });

    assert.deepEqual(
      [...wordsTo(held, "git")],
      ["-c", "protocol.allow=never", "diff", "--no-ext-diff", "--cached", "-U0"],
      "the earlier test read the source for the switch's name, so a git started without it passed as long as the name was still written somewhere in the file",
    );
    assert.equal(
      environmentOf(held, "git").get("GIT_ALLOW_PROTOCOL"),
      "",
      "set and empty allows no transport and outranks the user's configuration; the user's own value for it must not survive",
    );
    assert.equal(startedIn(held, "git"), held.root);
  } finally {
    rmSync(held.dir, { recursive: true, force: true });
  }
});

test("dotnet is handed every word that was measured, in the folder of the reader, with looper's settings over the user's", () => {
  const held = scene();
  try {
    asked(held, { DOTNET_CLI_TELEMETRY_OPTOUT: "0", NUGET_CERT_REVOCATION_MODE: "online" });

    assert.deepEqual(
      [...wordsTo(held, "dotnet")],
      [
        "build",
        "-c",
        "Release",
        "--nologo",
        "-v",
        "q",
        "-noAutoResponse",
        "-p:ImportDirectoryBuildProps=false",
        "-p:ImportDirectoryBuildTargets=false",
        "-p:ImportDirectoryPackagesProps=false",
        "-p:NuGetAudit=false",
        "-p:RestoreAdditionalProjectSources=",
        "-p:RestoreConfigFile=NuGet.config",
      ],
      "each of these was measured with the network taken away; a word that is in the file and not on the command line was not measured",
    );
    const said = environmentOf(held, "dotnet");
    assert.equal(said.get("DOTNET_CLI_TELEMETRY_OPTOUT"), "1", "the SDK sends usage data to its maker on every build unless told not to");
    assert.equal(said.get("DOTNET_CLI_WORKLOAD_UPDATE_NOTIFY_DISABLE"), "true");
    assert.equal(said.get("NUGET_CERT_REVOCATION_MODE"), "offline", "24 lookups of the signer's revocation hosts on a first build, seen");
    assert.equal(said.has("DOTNET_SDK_VULNERABILITY_CHECK_DISABLE"), false, "that name is in no file of the SDK; it was written from memory and did nothing");
    assert.equal(startedIn(held, "dotnet"), join(held.root, "vendor/csharp-law"));
  } finally {
    rmSync(held.dir, { recursive: true, force: true });
  }
});

test("python is handed the two flags that start it alone, then the reader, then the files", () => {
  const held = scene();
  try {
    asked(held, {});

    assert.deepEqual(
      [...wordsTo(held, "python3")],
      ["-I", "-S", join(held.root, "src/law/python/read.py"), "a.py"],
      "one flag keeps out what the user's environment names; the other keeps out what is installed beside python itself. A reviewer took either one away and no test noticed",
    );
  } finally {
    rmSync(held.dir, { recursive: true, force: true });
  }
});

const AS_RUSTUP_WRITES_IT = [
  'version = "12"',
  'default_toolchain = "stable-here"',
  'profile = "default"',
  "",
  "[overrides]",
  '"/home/someone/a=b" = "nightly"',
  "",
].join("\n");

test("cargo is told not to install a compiler, and is pointed at the one that is installed", () => {
  const held = scene();
  try {
    installs(held, "stable-here", AS_RUSTUP_WRITES_IT);
    asked(held, {});

    assert.deepEqual([...wordsTo(held, "cargo")], ["build", "--offline", "--release"]);
    const said = environmentOf(held, "cargo");
    assert.equal(said.get("RUSTUP_AUTO_INSTALL"), "0", "a project that pins a compiler nobody installed made this build go and fetch it: one lookup, seen");
    assert.equal(
      said.get("RUSTUP_TOOLCHAIN"),
      "stable-here",
      "the settings file was read with looper's own small reader, which stops at a folder name with an equals sign in it, and then no compiler was named at all",
    );
    assert.equal(startedIn(held, "cargo"), join(held.root, "vendor/rust-law"));
  } finally {
    rmSync(held.dir, { recursive: true, force: true });
  }
});

test("a compiler the user named for themselves is left as they named it", () => {
  const held = scene();
  try {
    installs(held, "stable-here", AS_RUSTUP_WRITES_IT);
    asked(held, { RUSTUP_TOOLCHAIN: "theirs" });

    const said = environmentOf(held, "cargo");
    assert.equal(said.get("RUSTUP_TOOLCHAIN"), "theirs", "what the user set outranks a project's pin already, so there is nothing to protect them from");
    assert.equal(said.get("RUSTUP_AUTO_INSTALL"), "0", "and if theirs is not installed, nothing goes to fetch it");
  } finally {
    rmSync(held.dir, { recursive: true, force: true });
  }
});

test("a compiler that is named and not installed is not pointed at", () => {
  const held = scene();
  try {
    installs(held, "", AS_RUSTUP_WRITES_IT);
    asked(held, {});

    const said = environmentOf(held, "cargo");
    assert.equal(said.has("RUSTUP_TOOLCHAIN"), false, "pointing at a compiler that is not there is asking for it to be fetched");
    assert.equal(said.get("RUSTUP_AUTO_INSTALL"), "0");
    assert.ok(existsSync(join(held.record, "cargo.args")), "the build was still started");
  } finally {
    rmSync(held.dir, { recursive: true, force: true });
  }
});

const NOBODY_CAN_BE_SHUT_OUT = process.getuid !== undefined && process.getuid() === 0
  ? "a root user can read a file with no read bit"
  : false;

test("a settings file that cannot be read does not stop the build, it only leaves no compiler pointed at", { skip: NOBODY_CAN_BE_SHUT_OUT }, () => {
  const held = scene();
  try {
    installs(held, "stable-here", AS_RUSTUP_WRITES_IT);
    chmodSync(join(held.rustup, "settings.toml"), 0o000);
    asked(held, {});

    const said = environmentOf(held, "cargo");
    assert.deepEqual([...wordsTo(held, "cargo")], ["build", "--offline", "--release"], "the build threw before cargo was started, and the user was told cargo could not be started");
    assert.equal(said.has("RUSTUP_TOOLCHAIN"), false);
    assert.equal(said.get("RUSTUP_AUTO_INSTALL"), "0");
  } finally {
    chmodSync(join(held.rustup, "settings.toml"), 0o644);
    rmSync(held.dir, { recursive: true, force: true });
  }
});

test("a place for rustup that is not a whole path is not read, because rustup would read it from another folder", () => {
  const held = scene();
  try {
    const spelled = "rustup-beside";
    mkdirSync(join(held.dir, spelled, "toolchains", "stable-here"), { recursive: true });
    writeFileSync(join(held.dir, spelled, "settings.toml"), AS_RUSTUP_WRITES_IT);
    const env: Record<string, string> = { PATH: join(held.dir, "tools"), HOME: join(held.dir, "home"), RECORD: held.record, RUSTUP_HOME: spelled };
    const ran = spawnSync(process.execPath, ["--input-type=module", "-e", ASKS_EACH_ONCE, held.root], { cwd: held.dir, encoding: "utf8", env });
    assert.equal(ran.status, 0, `${String(ran.stdout)}${String(ran.stderr)}`);

    assert.equal(
      environmentOf(held, "cargo").has("RUSTUP_TOOLCHAIN"),
      false,
      "looper read the settings relative to where it stood and cargo is started in another folder, so the compiler looper named could be one rustup has never heard of",
    );
  } finally {
    rmSync(held.dir, { recursive: true, force: true });
  }
});
