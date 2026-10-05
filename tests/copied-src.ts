import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = join(import.meta.dirname, "..");

const AN_ANSWER_MAY_RUN_TO = 16 * 1024 * 1024;

export type Laid = {
  readonly written: Readonly<Record<string, string>>;
  readonly gone: readonly string[];
};

export const NOTHING_LAID: Laid = { written: {}, gone: [] };

export function answeredByACopy(laid: Laid, module: string, asked: string): unknown {
  const copy = mkdtempSync(join(tmpdir(), "looper-copied-src-"));
  try {
    cpSync(join(ROOT, "src"), join(copy, "src"), { recursive: true });
    writeFileSync(join(copy, "package.json"), JSON.stringify({ type: "module" }));
    for (const [path, text] of Object.entries(laid.written)) writeFileSync(join(copy, "src", path), text);
    for (const path of laid.gone) symlinkSync(join(copy, "nowhere-at-all"), join(copy, "src", path));
    const program = [
      `import * as copied from ${JSON.stringify(pathToFileURL(join(copy, "src", module)).href)};`,
      `process.stdout.write(JSON.stringify(${asked}));`,
    ].join("\n");
    const ran = spawnSync(process.execPath, ["--input-type=module", "-e", program], {
      encoding: "utf8",
      maxBuffer: AN_ANSWER_MAY_RUN_TO,
    });
    if (ran.status !== 0) assert.fail(`the copy of src/ did not answer: ${ran.stderr}`);
    return JSON.parse(ran.stdout);
  } finally {
    rmSync(copy, { recursive: true, force: true });
  }
}
