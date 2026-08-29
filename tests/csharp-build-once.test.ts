import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CSHARP_BUILD_LOCK, CSHARP_ENGINE_DIR } from "../src/config.ts";
import { judgeCsharp } from "../src/law/csharp/drive.ts";

const BINARY = "bin/Release/net10.0/looper-csharp";

const HALF_WRITTEN = "#!/bin/sh\necho \"The application to execute does not exist: 'looper-csharp.dll'.\" >&2\nexit 154\n";

const FINISHED = '#!/bin/sh\necho \'{"violations":[],"unreadable":[]}\'\n';

const HOLDS_FOR_MS = 400;

const GIVES_UP_AFTER_MS = 5_000;

function engineBeingBuilt(root: string): void {
  const engine = join(root, CSHARP_ENGINE_DIR);
  mkdirSync(join(engine, "src"), { recursive: true });
  writeFileSync(join(engine, "looper-csharp.csproj"), "");
  writeFileSync(join(engine, "src", "Law.cs"), "");
  const longAgo = (Date.now() - 60_000) / 1000;
  utimesSync(join(engine, "looper-csharp.csproj"), longAgo, longAgo);
  utimesSync(join(engine, "src", "Law.cs"), longAgo, longAgo);
  mkdirSync(join(engine, "bin/Release/net10.0"), { recursive: true });
  writeFileSync(join(engine, BINARY), HALF_WRITTEN);
  chmodSync(join(engine, BINARY), 0o755);
}

function pollUntil(condition: () => boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const look = () => {
      if (condition()) return resolve();
      if (Date.now() - started > GIVES_UP_AFTER_MS) return reject(new Error("the builder never took the lock"));
      setTimeout(look, 5);
    };
    look();
  });
}

function ended(child: ReturnType<typeof spawn>): Promise<number | null> {
  return new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code) => resolve(code));
  });
}

test("a reader arriving while the C# half is being built waits for the build, rather than running what it has written so far", async () => {
  const root = mkdtempSync(join(tmpdir(), "looper-cs-once-"));
  try {
    engineBeingBuilt(root);
    const lock = `${join(root, CSHARP_ENGINE_DIR, CSHARP_BUILD_LOCK)}.looper-lock`;
    const builder = spawn(
      process.execPath,
      [
        "-e",
        'const fs = require("node:fs"); fs.writeFileSync(process.env.LOCK, ""); setTimeout(() => { fs.writeFileSync(process.env.BINARY, process.env.FINISHED); fs.unlinkSync(process.env.LOCK); }, Number(process.env.HOLD));',
      ],
      {
        env: {
          LOCK: lock,
          BINARY: join(root, CSHARP_ENGINE_DIR, BINARY),
          FINISHED,
          HOLD: String(HOLDS_FOR_MS),
        },
        stdio: "ignore",
      },
    );
    await pollUntil(() => existsSync(lock));

    const project = join(root, "project");
    mkdirSync(project);
    const file = join(project, "Held.cs");
    writeFileSync(file, "class C { }\n");
    const said = judgeCsharp(root, project, [file]);

    assert.equal(
      said.kind,
      "found",
      `the reader ran the half-written binary instead of waiting for the build: ${said.kind === "found" ? "" : said.detail}`,
    );
    assert.ok(!existsSync(lock), "the build lock stayed behind");
    assert.equal(await ended(builder), 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
