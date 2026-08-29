import { test } from "node:test";
import { first } from "./helpers.ts";
import { DEV, INSTALLED, LOCAL, PROJECT_DIR, gitHookEntryFor, inside, launchFor, looperHooks, projectRoot } from "../src/config.ts";
import { reachedFrom } from "../src/init.ts";
import { AFTER_INIT } from "../src/announce.ts";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { readConcessions } from "../src/law/concessions.ts";
import { LAW_PATH } from "../src/config.ts";
import { runInit } from "../src/init.ts";

const NO_PATH: readonly string[] = [];
import { assembleConstitution, readProjectConstitution } from "../src/doctrine.ts";
import { readMap } from "../src/map.ts";
import type { Step } from "../src/init.ts";

function scratch(): string {
  return mkdtempSync(join(tmpdir(), "looper-init-"));
}

function pathsOf(steps: readonly Step[], kind: Step["kind"]): readonly string[] {
  return steps.filter((step) => step.kind === kind).map((step) => step.path);
}

test("a fresh project gets a doctrine tree it can actually use", () => {
  const root = scratch();
  try {
    const report = runInit(root, INSTALLED, NO_PATH);
    const made = pathsOf(report.steps, "scaffolded");

    assert.equal(made.length, 6);
    for (const tail of ["constitution.md", "map.toml", "README.md", "secrets.allow", "CURRENTSTACK.md"]) {
      assert.ok(made.some((path) => path.endsWith(tail)), `${tail} was not created`);
    }
    assert.ok(
      pathsOf(report.steps, "created").some((path) => path.endsWith(".mcp.json")),
      "the MCP file is wired rather than scaffolded, because a project that already has one still needs looper's server added to it",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the file the secrets gate names is one init actually creates", () => {
  const root = scratch();
  try {
    runInit(root, INSTALLED, NO_PATH);
    const written = readFileSync(join(root, ".looper/secrets.allow"), "utf8");

    assert.ok(
      written.includes("This file is the review"),
      "the gate tells somebody to add a value to a file that does not exist, with no header saying that every line in it is a decision a reviewer will read",
    );
    assert.deepEqual(
      written.split("\n").filter((line) => line.trim().length > 0 && !line.startsWith("#")),
      [],
      "it must arrive empty. A scaffolded allowance with anything in it is an invitation, and an empty one is a review waiting to happen.",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the constitution starts empty, so it costs nothing until someone writes a line", () => {
  const root = scratch();
  try {
    runInit(root, INSTALLED, NO_PATH);
    const project = readProjectConstitution(root);

    assert.equal(project.kind, "empty");
    const assembly = assembleConstitution(project);
    assert.deepEqual([...assembly.halves], ["canon"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the stub map parses, so the first branch someone adds works", () => {
  const root = scratch();
  try {
    runInit(root, INSTALLED, NO_PATH);
    const map = readMap(root);

    assert.equal(map.kind, "present");
    if (map.kind !== "present") return;
    assert.equal(map.governs.size, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("nothing a project already wrote is touched", () => {
  const root = scratch();
  try {
    mkdirSync(join(root, ".looper/doctrine"), { recursive: true });
    writeFileSync(join(root, ".looper/doctrine/constitution.md"), "OUR OWN RULE\n");

    const report = runInit(root, INSTALLED, NO_PATH);

    assert.equal(
      readFileSync(join(root, ".looper/doctrine/constitution.md"), "utf8"),
      "OUR OWN RULE\n",
    );
    assert.ok(
      pathsOf(report.steps, "yours-already").some((path) =>
        path.endsWith("constitution.md"),
      ),
      "a file we did not write must be reported as left alone, never as created",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("twice is indistinguishable from once", () => {
  const root = scratch();
  try {
    runInit(root, INSTALLED, NO_PATH);
    const second = runInit(root, INSTALLED, NO_PATH);

    assert.deepEqual([...pathsOf(second.steps, "scaffolded")], []);
    assert.equal(pathsOf(second.steps, "yours-already").length, 6);
    assert.equal(pathsOf(second.steps, "already-wired").length, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a project with its own .mcp.json gets looper's server added to it", () => {
  const root = scratch();
  try {
    writeFileSync(
      join(root, ".mcp.json"),
      JSON.stringify({ mcpServers: { theirs: { command: "their-server" } } }, null, 2),
    );

    runInit(root, INSTALLED, NO_PATH);
    const held: unknown = JSON.parse(readFileSync(join(root, ".mcp.json"), "utf8"));
    const servers = Object.getOwnPropertyDescriptor(held, "mcpServers")?.value;

    assert.ok(
      Object.getOwnPropertyDescriptor(servers, "theirs") !== undefined,
      "the server they already had was dropped, which is the failure merging exists to prevent",
    );
    assert.ok(
      Object.getOwnPropertyDescriptor(servers, "looper") !== undefined,
      "looper's server was not added, so the doctrine and recall tools silently never appear",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an entry looper wrote with a path that no longer works is corrected, not called wired", () => {
  const root = scratch();
  try {
    writeFileSync(
      join(root, ".mcp.json"),
      JSON.stringify(
        {
          mcpServers: {
            theirs: { command: "their-server" },
            looper: {
              type: "stdio",
              command: "node",
              args: ["$CLAUDE_PROJECT_DIR/vendor/looper/bin/looper.js", "serve"],
              env: { THEIRS: "kept" },
            },
          },
        },
        null,
        2,
      ),
    );

    const report = runInit(root, LOCAL, NO_PATH);
    const held: unknown = JSON.parse(readFileSync(join(root, ".mcp.json"), "utf8"));
    const servers = Object.getOwnPropertyDescriptor(held, "mcpServers")?.value;
    const mine = Object.getOwnPropertyDescriptor(servers, "looper")?.value;

    assert.deepEqual(
      Object.getOwnPropertyDescriptor(mine, "args")?.value,
      [...launchFor(LOCAL).args, "serve"],
      "looper left its own stale entry in place, so the tools stay missing and init reports success",
    );
    assert.equal(
      Object.getOwnPropertyDescriptor(mine, "command")?.value,
      launchFor(LOCAL).command,
    );
    assert.deepEqual(
      Object.getOwnPropertyDescriptor(mine, "env")?.value,
      { THEIRS: "kept" },
      "looper owns how it is launched and nothing else in its entry",
    );
    assert.ok(
      Object.getOwnPropertyDescriptor(servers, "theirs") !== undefined,
      "another project's server was dropped by a repair that should not have touched it",
    );
    assert.equal(
      report.steps.filter((step) => step.kind === "mcp-corrected").length,
      1,
      "the repair happened without being reported, which is the same silence the stale entry had",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an entry that already launches what looper would write is left exactly alone", () => {
  const root = scratch();
  try {
    const launch = launchFor(LOCAL);
    writeFileSync(
      join(root, ".mcp.json"),
      JSON.stringify(
        { mcpServers: { looper: { type: "stdio", command: launch.command, args: [...launch.args, "serve"] } } },
        null,
        2,
      ),
    );
    const before = readFileSync(join(root, ".mcp.json"), "utf8");

    const report = runInit(root, LOCAL, NO_PATH);

    assert.equal(readFileSync(join(root, ".mcp.json"), "utf8"), before);
    assert.equal(report.steps.filter((step) => step.kind === "mcp-corrected").length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a command the hooks cannot reach is said out loud, not left looking wired", () => {
  const root = scratch();
  try {
    const report = runInit(root, INSTALLED, NO_PATH);

    assert.ok(
      report.steps.some((step) => step.kind === "entry-unreachable"),
      "the hooks name a command that is nowhere on PATH. They look right in the settings file and do nothing at all, which is the one outcome init exists to prevent.",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the project that is looper is reached as its own source, not as a command that is not there", () => {
  const root = scratch();
  try {
    mkdirSync(join(root, "bin"), { recursive: true });
    writeFileSync(join(root, "bin", "looper.js"), "");
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "looper" }, null, 2));
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src", "main.ts"), "");

    const reached = reachedFrom(root);
    assert.deepEqual(
      reached,
      DEV,
      "looper's own project was reached as an installed command, which is not on PATH there, so its own tools never start",
    );

    const report = runInit(root, reached, NO_PATH);
    const held: unknown = JSON.parse(readFileSync(join(root, ".mcp.json"), "utf8"));
    const servers = Object.getOwnPropertyDescriptor(held, "mcpServers")?.value;
    const mine = Object.getOwnPropertyDescriptor(servers, "looper")?.value;

    assert.equal(Object.getOwnPropertyDescriptor(mine, "command")?.value, "node");
    assert.deepEqual(
      Object.getOwnPropertyDescriptor(mine, "args")?.value,
      ["./src/main.ts", "serve"],
      "the entry launches something other than the source sitting right there",
    );
    assert.ok(
      !report.steps.some((step) => step.kind === "entry-unreachable"),
      "init said the command it wrote cannot be found, in the one project where the source is certainly there",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("looper checked out inside a project is wired as the checkout it is", () => {
  const root = scratch();
  try {
    const at = join(root, "vendor", "looper");
    mkdirSync(join(at, "bin"), { recursive: true });
    writeFileSync(join(at, "bin", "looper.js"), "");
    writeFileSync(join(at, "package.json"), JSON.stringify({ name: "looper" }, null, 2));

    const reached = reachedFrom(root);
    assert.deepEqual(reached, inside("vendor/looper"));

    for (const spec of looperHooks(reached)) {
      assert.ok(
        spec.command.includes("vendor/looper/bin/looper.js"),
        `${spec.event} was wired to ${spec.command}, which is not where looper actually is`,
      );
    }

    const bare = runInit(root, reached, NO_PATH);
    assert.ok(
      bare.steps.some((step) => step.kind === "entry-unreachable"),
      "a checkout with no node_modules cannot run a line of looper, and init reported it as wired",
    );

    mkdirSync(join(at, "node_modules"), { recursive: true });
    const ready = runInit(root, reached, NO_PATH);
    assert.ok(
      !ready.steps.some((step) => step.kind === "entry-unreachable"),
      "the checkout is right there, installed, and init still said it could not be reached",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("looper wires itself the way it was actually reached", () => {
  const root = mkdtempSync(join(tmpdir(), "looper-reach-"));
  try {
    assert.deepEqual(reachedFrom(root), INSTALLED);

    mkdirSync(join(root, "node_modules", ".bin"), { recursive: true });
    writeFileSync(join(root, "node_modules", ".bin", "looper"), "");
    assert.deepEqual(reachedFrom(root), LOCAL);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a project that installed looper gets commands that resolve there", () => {
  const claude = looperHooks(LOCAL);
  for (const spec of claude) {
    assert.ok(
      spec.command.includes("node_modules/.bin/looper"),
      `${spec.event} was wired to ${spec.command}, which a project cannot run`,
    );
  }
  assert.equal(gitHookEntryFor(LOCAL), "./node_modules/.bin/looper");
  assert.equal(launchFor(LOCAL).command, "./node_modules/.bin/looper");
});

test("a global install is still a bare name, and dev still runs from source", () => {
  assert.equal(gitHookEntryFor(INSTALLED), "looper");
  assert.ok(gitHookEntryFor(DEV).startsWith("node "));
});

test("the project is the one the agent named, not the folder the shell wandered into", () => {
  const root = scratch();
  const inside = join(root, "vendor", "looper");
  try {
    mkdirSync(join(inside, ".looper", "doctrine"), { recursive: true });

    const chosen = projectRoot(inside, { kind: "named", root });

    assert.equal(
      chosen.root,
      root,
      "a shell left inside a vendored copy of looper made an entire turn run on looper's own constitution instead of the project's, and nothing said so",
    );
    assert.ok(chosen.how.includes(PROJECT_DIR));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("with nothing named, the nearest project above is chosen and said out loud", () => {
  const root = scratch();
  const below = join(root, "packages", "web", "src");
  try {
    mkdirSync(join(root, ".looper", "doctrine"), { recursive: true });
    mkdirSync(below, { recursive: true });

    const rooted = projectRoot(below, { kind: "none" });

    assert.equal(rooted.root, root, "running from a subdirectory judged a different project than the one it is in");
    assert.ok(rooted.how.length > 0, "status has to be able to say which root was chosen, or the wrong one is invisible");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a backup is left only where somebody was told about it", () => {
  const root = scratch();
  try {
    writeFileSync(join(root, ".mcp.json"), JSON.stringify({ mcpServers: {} }));
    mkdirSync(join(root, ".claude"), { recursive: true });
    writeFileSync(join(root, ".claude", "settings.json"), JSON.stringify({ hooks: {} }));

    const report = runInit(root, INSTALLED, NO_PATH);
    const kept = report.steps
      .filter((step) => step.kind === "merged")
      .map((step) => step.path);

    for (const path of kept) {
      assert.ok(existsSync(`${path}.looper-backup`), `${path} was merged and its previous version was not kept`);
    }
    assert.ok(kept.length > 0, "nothing was merged, so this test is not exercising what it was written for");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("init says that a session already open will not have the hooks", () => {
  const said = AFTER_INIT.join("\n");

  assert.ok(
    said.includes("restart"),
    "the hooks are written into a file an open session read when it started, so nothing is checked in that session and everything looks normal — which is the one failure init exists to prevent, and it said the rules were already in force",
  );
  assert.ok(
    said.includes("check nothing"),
    "telling somebody to restart without saying what happens if they do not leaves it sounding optional",
  );
});

test("hooks wired below a folder the agent starts in are said to be useless", () => {
  const outer = scratch();
  const inner = join(outer, "app");
  try {
    mkdirSync(join(outer, ".claude"), { recursive: true });
    mkdirSync(inner, { recursive: true });

    const report = runInit(inner, INSTALLED, NO_PATH);
    const named = report.steps.filter((step) => step.kind === "outer-agent-project");

    assert.equal(
      named.length,
      1,
      "an agent started one folder up reads its hooks from up there, so everything init just wired is dead and the project looks perfectly set up. Eight sessions of one adopting project received no doctrine at all this way, and nothing anywhere said so.",
    );
    assert.equal(first(named).path, outer);
  } finally {
    rmSync(outer, { recursive: true, force: true });
  }
});

test("a project with no agent folder above it is not warned about one", () => {
  const root = scratch();
  try {
    const report = runInit(root, INSTALLED, NO_PATH);
    assert.deepEqual(
      report.steps.filter((step) => step.kind === "outer-agent-project"),
      [],
      "every ordinary project would carry a warning about a folder that does not exist",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("init leaves the knobs where somebody can find them, and changes nothing by doing it", () => {
  const root = scratch();
  try {
    runInit(root, DEV, []);
    const written = readFileSync(join(root, LAW_PATH), "utf8");

    for (const key of ["generated", "max_loc", "sanctum", "env_files", "trace_symbols", "loggers", "palette", "z_max", "[entry]", "[css]", "[exempt]"]) {
      assert.ok(
        written.includes(key),
        `${key} can be set in law.toml and appears nowhere a reader would look, so it is found only by reading looper's own diff`,
      );
    }
    const withScaffold = readConcessions(root);
    const without = readConcessions(scratch());
    assert.deepEqual(
      { ...withScaffold, projectRoot: "" },
      { ...without, projectRoot: "" },
      "the scaffold has to be inert: a line that is live on arrival changes every project that runs init",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
