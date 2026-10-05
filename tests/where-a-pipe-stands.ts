import { writeFileSync } from "node:fs";

import { readProjectConstitution } from "../src/doctrine.ts";
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
]);

const [reader, root, home, answer] = process.argv.slice(2);
const asked = reader === undefined ? undefined : READERS.get(reader);
if (asked === undefined || root === undefined || home === undefined || answer === undefined) {
  throw new RangeError(`asked for ${String(reader)}, which is not one of ${[...READERS.keys()].join(", ")}`);
}
writeFileSync(answer, asked(root, home));
