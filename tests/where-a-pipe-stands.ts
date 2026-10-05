import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { SETTINGS_PATH } from "../src/config.ts";
import { hashing } from "../src/decisions/store.ts";
import { readProjectConstitution } from "../src/doctrine.ts";
import { readExisting } from "../src/init.ts";
import { readConcessions } from "../src/law/concessions.ts";
import { surveyProject, walkProject } from "../src/law/project.ts";
import { shapeOf } from "../src/law/shape.ts";
import { allowedIn } from "../src/secrets/capability.ts";
import { sizeOfTree } from "../src/size.ts";
import { heardFrom } from "../src/stall/capability.ts";
import { note, reachedFor } from "../src/stall/stream.ts";
import { readAdopted } from "../src/adopt/store.ts";
import { readDecisions } from "../src/decisions/store.ts";
import { lastSeen } from "../src/loop/cache.ts";
import { declaredIn } from "../src/loop/checks.ts";
import { readMap } from "../src/map.ts";
import { readNotes } from "../src/recall/store.ts";
import { offerIn } from "../src/report/release.ts";
import { heldIn } from "../src/report/store.ts";
import { SaidInSession } from "../src/said.ts";
import { lastRun } from "../src/seen.ts";
import { languagesListedIn } from "../src/stack/read.ts";

function aReachOf(): Parameters<typeof note>[2] {
  const heard = heardFrom(JSON.stringify({ session_id: "a-session", tool_name: "Bash", tool_input: { command: "ls" } }), 1);
  if (heard.kind !== "reached") throw new RangeError(`the stall hook did not count a plain command (${heard.kind})`);
  return heard.reached;
}

function tried(asked: () => unknown): string {
  try {
    return JSON.stringify(asked());
  } catch (cause) {
    return cause instanceof Error ? cause.message : String(cause);
  }
}

const READERS: ReadonlyMap<string, (root: string, home: string) => string> = new Map([
  ["said", (root: string, home: string) => new SaidInSession(root, home, "a-session").trouble],
  ["seen", (root: string, home: string) => lastRun(root, home).trouble],
  ["loop answer", (root: string, home: string) => tried(() => lastSeen(root, home))],
  ["loop.toml", (root: string) => declaredIn(root).complaints.join(" ")],
  ["map.toml", (root: string) => tried(() => readMap(root))],
  ["constitution", (root: string) => tried(() => readProjectConstitution(root))],
  ["decided.json", (root: string, home: string) => tried(() => heldIn(root, home))],
  ["law.toml", (root: string) => tried(() => offerIn(root))],
  ["recall", (root: string) => tried(() => readNotes(root))],
  ["decisions", (root: string) => tried(() => readDecisions(root))],
  ["adopted", (root: string) => tried(() => readAdopted(root))],
  ["stack", (root: string) => tried(() => languagesListedIn(root))],
  ["settings", (root: string) => tried(() => readExisting(join(root, SETTINGS_PATH)))],
  ["stall stream", (root: string, home: string) => tried(() => reachedFor(root, home, "a-session"))],
  ["stall stream, written to", (root: string, home: string) => tried(() => note(root, home, aReachOf()))],
  ["secrets allow-list", (root: string) => tried(() => allowedIn(root).trouble)],
  ["doctrine sizes", (root: string) => tried(() => sizeOfTree(root))],
  ["decision hashing", (root: string) => tried(() => hashing(root, ["pipe.txt"]))],
  ["law.toml, as the law reads it", (root: string) => tried(() => readConcessions(root))],
  ["package.json, as the law reads it", (root: string) => tried(() => readConcessions(root))],
  ["package.json, as the shape reads it", (root: string) => tried(() => shapeOf(root))],
  ["decisions, as the law reads them", (root: string) => tried(() => readConcessions(root))],
  [".gitmodules, as the walk reads it", (root: string) => tried(() => walkProject(root))],
  ["a file the law judges", (root: string) => tried(() => surveyProject(root, "everything", []))],
]);

const [reader, root, home, answer] = process.argv.slice(2);
const asked = reader === undefined ? undefined : READERS.get(reader);
if (asked === undefined || root === undefined || home === undefined || answer === undefined) {
  throw new RangeError(`asked for ${String(reader)}, which is not one of ${[...READERS.keys()].join(", ")}`);
}
writeFileSync(answer, asked(root, home));
