import { createHash } from "node:crypto";
import { basename, join } from "node:path";

import { JSON_INDENT } from "./config.ts";
import { fieldAt, reasonFrom } from "./fields.ts";
import { writeAtomically } from "./atomic.ts";
import { readOrdinary } from "./ordinary.ts";

export type Run = {
  readonly event: string;
  readonly startedIn: string;
  readonly at: string;
};

export type Seen = {
  readonly last: Run | null;
  readonly session: Run | null;
  readonly trouble: string;
};

const NOTHING: Seen = { last: null, session: null, trouble: "" };

function unreadable(detail: string): Seen {
  return { last: null, session: null, trouble: detail };
}

const SEEN_DIR = join(".looper", "seen");

const NAME_LENGTH = 12;

export function seenPath(root: string, home: string): string {
  const print = createHash("sha256").update(root).digest("hex").slice(0, NAME_LENGTH);
  return join(home, SEEN_DIR, `${basename(root)}-${print}.json`);
}

function cameFromASession(run: Run): boolean {
  return run.startedIn.length > 0;
}

export function noteRun(root: string, home: string, run: Run): void {
  const before = lastRun(root, home);
  const seen: Seen = {
    last: run,
    session: cameFromASession(run) ? run : before.session,
    trouble: "",
  };
  writeAtomically(seenPath(root, home), `${JSON.stringify(seen, null, JSON_INDENT)}\n`);
}

function textOf(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function runFrom(value: unknown): Run | null {
  if (value === null || typeof value !== "object") return null;
  const at = textOf(fieldAt(value, "at"));
  if (at.length === 0) return null;
  return {
    event: textOf(fieldAt(value, "event")),
    startedIn: textOf(fieldAt(value, "startedIn")),
    at,
  };
}

export function lastRun(root: string, home: string): Seen {
  const path = seenPath(root, home);
  const read = readOrdinary(path);
  if (read.kind === "absent") return NOTHING;
  if (read.kind === "unreadable") return unreadable(read.why);
  try {
    const held: unknown = JSON.parse(read.text);
    if (held === null || typeof held !== "object") return unreadable(`${path} holds no record`);
    return {
      last: runFrom(fieldAt(held, "last")),
      session: runFrom(fieldAt(held, "session")),
      trouble: "",
    };
  } catch (cause) {
    return unreadable(reasonFrom(cause));
  }
}

export function sessionEverRan(seen: Seen): boolean {
  return seen.session !== null;
}

const NEVER_RAN: readonly string[] = [
  "have never run here, on this machine",
  "everything below is wired and nothing has ever asked it anything",
  "an agent reads its hooks from the folder it was started in, so this is",
  "what a session started above this one looks like, and what an install",
  "made during a session looks like until that session is restarted",
];

const FROM_GIT: readonly string[] = ["PreCommit", "CommitMessage"];

export function worthSayingAtCommit(event: string, startedIn: string, seen: Seen): boolean {
  if (startedIn.length > 0) return false;
  if (!FROM_GIT.includes(event)) return false;
  return !sessionEverRan(seen);
}

export const NO_SESSION_EVER =
  "looper's session hooks have never run in this project — the commit gate works, nothing a session does is being checked. `looper status` says more.";

function when(run: Run): string {
  const event = run.event.length === 0 ? "a hook" : run.event;
  return `last ran ${run.at} (${event})`;
}

export function sayWhenHooksRan(seen: Seen): readonly string[] {
  if (seen.trouble.length > 0) {
    return [
      "cannot be told about — the record of what has run here could not be read",
      seen.trouble,
    ];
  }
  const last = seen.last;
  if (last === null) return NEVER_RAN;
  const session = seen.session;
  if (session === null) {
    return [
      `${when(last)}, outside an agent session`,
      "nothing has ever reached looper from an agent session in this project:",
      "a git hook or a hand run gets here without one, so the commit gate can be",
      "working while nothing a session does is read at all",
    ];
  }
  if (session.at === last.at) {
    return [when(last), `in an agent session started in ${session.startedIn}`];
  }
  return [
    `${when(last)}, outside an agent session`,
    `last session run ${session.at} (${session.event}), started in ${session.startedIn}`,
  ];
}
