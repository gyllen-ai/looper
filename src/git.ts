import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { A_READER_MAY_ANSWER_WITH, A_WRITTEN_TOKEN, GIT_TIMEOUT_MS } from "./config.ts";
import { reasonFrom } from "./fields.ts";

const IN_HAND: readonly (readonly string[])[] = [
  ["diff", "HEAD", "--name-only", "--no-renames"],
  ["ls-files", "--others", "--exclude-standard"],
];

const JUST_PUT_DOWN: readonly (readonly string[])[] = [
  ["diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"],
];

export type Changed =
  | { readonly kind: "unavailable"; readonly detail: string }
  | { readonly kind: "paths"; readonly paths: readonly string[] };

function askWhole(root: string, args: readonly string[]): string {
  return execFileSync("git", [...args], {
    cwd: root,
    encoding: "utf8",
    timeout: GIT_TIMEOUT_MS,
    maxBuffer: A_READER_MAY_ANSWER_WITH,
    stdio: ["ignore", "pipe", "ignore"],
  });
}

function ask(root: string, args: readonly string[]): readonly string[] {
  return askWhole(root, args).split("\n").filter((line) => line.length > 0);
}

export type Staged =
  | { readonly kind: "unavailable"; readonly detail: string }
  | { readonly kind: "files"; readonly paths: readonly string[] };

export type StagedText =
  | { readonly kind: "unreadable"; readonly detail: string }
  | { readonly kind: "text"; readonly text: string };

export type HooksDir =
  | { readonly kind: "none"; readonly why: string }
  | { readonly kind: "default"; readonly path: string }
  | { readonly kind: "declared"; readonly path: string };

export function hooksDirectory(root: string): HooksDir {
  try {
    const declared = ask(root, ["config", "--get", "core.hooksPath"]);
    const named = declared[0];
    if (named !== undefined && named.length > 0) {
      return { kind: "declared", path: named };
    }
  } catch (cause) {
    const detail = reasonFrom(cause);
    if (!existsSync(join(root, ".git"))) return { kind: "none", why: detail };
  }
  if (!existsSync(join(root, ".git"))) {
    return { kind: "none", why: "this is not a git repository" };
  }
  return { kind: "default", path: ".git/hooks" };
}

export function trackedFiles(root: string): Staged {
  try {
    return { kind: "files", paths: ask(root, ["ls-files"]) };
  } catch (cause) {
    const detail = reasonFrom(cause);
    return { kind: "unavailable", detail };
  }
}

export type Ignoring =
  | { readonly kind: "no-git" }
  | { readonly kind: "unavailable"; readonly detail: string }
  | { readonly kind: "ignoring"; readonly paths: ReadonlySet<string>; readonly folders: readonly string[] };

const IGNORED: readonly string[] = [
  "ls-files",
  "--others",
  "--ignored",
  "--exclude-standard",
  "--directory",
];

export function ignoredHere(root: string): Ignoring {
  if (!existsSync(join(root, ".git"))) return { kind: "no-git" };
  try {
    const said = ask(root, IGNORED);
    const paths = new Set<string>();
    const folders: string[] = [];
    for (const line of said) {
      if (line.endsWith("/")) folders.push(line);
      else paths.add(line);
    }
    return { kind: "ignoring", paths, folders };
  } catch (cause) {
    return { kind: "unavailable", detail: reasonFrom(cause) };
  }
}

export type AddedLine = {
  readonly file: string;
  readonly line: number;
  readonly text: string;
};

export type Added =
  | { readonly kind: "unavailable"; readonly why: string }
  | { readonly kind: "lines"; readonly added: readonly AddedLine[] };

const FILE_HEADER = /^\+\+\+ b\/(.*)$/;

const HUNK_START = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

export function stagedAdditions(root: string): Added {
  return additionsIn(root, ["diff", "--cached", "-U0", "--no-color"]);
}

export function additionsAgainst(root: string, revision: string): Added {
  return additionsIn(root, ["diff", "-U0", "--no-color", `${revision}...HEAD`]);
}

function additionsIn(root: string, args: readonly string[]): Added {
  try {
    const diff = ask(root, args);
    const added: AddedLine[] = [];
    let file = "(staged change)";
    let at = 0;

    for (const line of diff) {
      const header = FILE_HEADER.exec(line);
      if (header !== null) {
        const named = header[1];
        if (named !== undefined) file = named;
        continue;
      }
      const hunk = HUNK_START.exec(line);
      if (hunk !== null) {
        at = Number(hunk[1]);
        continue;
      }
      if (!line.startsWith("+") || line.startsWith("+++")) continue;
      added.push({ file, line: at, text: line.slice(1) });
      at += 1;
    }
    return { kind: "lines", added };
  } catch (cause) {
    const detail = reasonFrom(cause);
    return { kind: "unavailable", why: detail };
  }
}

export function stagedFiles(root: string): Staged {
  try {
    return {
      kind: "files",
      paths: ask(root, ["diff", "--cached", "--name-only", "--diff-filter=ACM"]),
    };
  } catch (cause) {
    const detail = reasonFrom(cause);
    return { kind: "unavailable", detail };
  }
}

export function stagedText(root: string, path: string): StagedText {
  try {
    return { kind: "text", text: askWhole(root, ["show", `:${path}`]) };
  } catch (cause) {
    const detail = reasonFrom(cause);
    return { kind: "unreadable", detail };
  }
}

const HUNK = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;

export type Touched =
  | { readonly kind: "unknown"; readonly why: string }
  | { readonly kind: "lines"; readonly lines: ReadonlySet<number> };

export type Against = "index" | "commit" | "head";

export function stagedLines(root: string, path: string): Touched {
  return changedLines(root, path, "index");
}

export function changedLines(root: string, path: string, against: Against): Touched {
  const scope = against === "index" ? ["--cached"] : against === "head" ? ["HEAD"] : [];
  try {
    const diff = ask(root, ["diff", ...scope, "-U0", "--", path]);
    const lines = new Set<number>();
    for (const line of diff) {
      const hunk = HUNK.exec(line);
      if (hunk === null) continue;
      const from = Number(hunk[1]);
      const span = hunk[2] === undefined ? 1 : Number(hunk[2]);
      for (let at = from; at < from + span; at += 1) lines.add(at);
    }
    return { kind: "lines", lines };
  } catch (cause) {
    const detail = reasonFrom(cause);
    return { kind: "unknown", why: detail };
  }
}

export type Ahead =
  | { readonly kind: "cannot-tell"; readonly why: string }
  | { readonly kind: "against"; readonly revision: string };

const WHAT_THE_REMOTE_HAS: readonly (readonly string[])[] = [
  ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"],
  ["rev-parse", "--abbrev-ref", "origin/HEAD"],
  ["rev-parse", "--abbrev-ref", "origin/main"],
  ["rev-parse", "--abbrev-ref", "origin/master"],
];

export function whatTheRemoteAlreadyHas(root: string): Ahead {
  let last = "no remote-tracking branch to compare against";
  for (const args of WHAT_THE_REMOTE_HAS) {
    try {
      const said = ask(root, args);
      const first = said[0];
      if (typeof first === "string" && first.length > 0) {
        return { kind: "against", revision: first };
      }
    } catch (cause) {
      last = reasonFrom(cause);
    }
  }
  return { kind: "cannot-tell", why: last };
}

export type Vocabulary =
  | { readonly kind: "cannot-tell"; readonly why: string }
  | { readonly kind: "words"; readonly words: ReadonlySet<string> };

export function everyWordAt(
  root: string,
  revision: string,
  ignoring: readonly string[],
): Vocabulary {
  try {
    const said = askWhole(root, [
      "grep",
      "-h",
      "-o",
      "-E",
      A_WRITTEN_TOKEN,
      revision,
      "--",
      ...ignoring.map((one) => `:!${one}`),
    ]);
    return { kind: "words", words: new Set(said.split("\n").filter((one) => one.length > 0)) };
  } catch (cause) {
    return { kind: "cannot-tell", why: reasonFrom(cause) };
  }
}

function pathsFrom(root: string, asking: readonly (readonly string[])[]): Changed {
  const seen = new Set<string>();
  for (const args of asking) {
    try {
      for (const path of ask(root, args)) seen.add(path);
    } catch (cause) {
      return { kind: "unavailable", detail: reasonFrom(cause) };
    }
  }
  return { kind: "paths", paths: [...seen] };
}

export function changedPaths(root: string): Changed {
  const inHand = pathsFrom(root, IN_HAND);
  if (inHand.kind === "unavailable" || inHand.paths.length > 0) return inHand;
  return pathsFrom(root, JUST_PUT_DOWN);
}

export function pathsInHand(root: string): Changed {
  return pathsFrom(root, IN_HAND);
}

export type Moved = {
  readonly path: string;
  readonly to: string;
};

export type Pins =
  | { readonly kind: "unavailable"; readonly detail: string }
  | { readonly kind: "moved"; readonly moved: readonly Moved[] };

const GITLINK = "160000";

const RAW_LINE = /^:(\d{6}) (\d{6}) ([0-9a-f]+) ([0-9a-f]+) ([A-Z])\t(.+)$/;

const A_PIN_ARRIVING: readonly string[] = ["A", "M"];

export function stagedPins(root: string): Pins {
  try {
    const moved: Moved[] = [];
    for (const line of ask(root, ["diff", "--cached", "--raw", "--no-renames"])) {
      const held = RAW_LINE.exec(line);
      if (held === null) continue;
      const [, , mode, , to, status, path] = held;
      if (mode !== GITLINK) continue;
      if (status === undefined || !A_PIN_ARRIVING.includes(status)) continue;
      if (to === undefined || path === undefined) continue;
      moved.push({ path, to });
    }
    return { kind: "moved", moved };
  } catch (cause) {
    return { kind: "unavailable", detail: reasonFrom(cause) };
  }
}

export type Ancestry =
  | { readonly kind: "cannot-tell"; readonly why: string }
  | { readonly kind: "yes" }
  | { readonly kind: "no" };

export function isAncestorIn(root: string, earlier: string, later: string): Ancestry {
  const answered = spawnSync("git", ["merge-base", "--is-ancestor", earlier, later], {
    cwd: root,
    encoding: "utf8",
    timeout: GIT_TIMEOUT_MS,
    stdio: ["ignore", "ignore", "pipe"],
  });
  if (answered.error !== undefined) {
    return { kind: "cannot-tell", why: reasonFrom(answered.error) };
  }
  if (answered.status === 0) return { kind: "yes" };
  if (answered.status === 1) return { kind: "no" };
  const said = typeof answered.stderr === "string" ? answered.stderr.trim() : "";
  const why = said.length > 0 ? said : `git answered with ${String(answered.status)}`;
  return { kind: "cannot-tell", why };
}

export type Naming =
  | { readonly kind: "cannot-tell"; readonly why: string }
  | { readonly kind: "names"; readonly names: readonly string[] };

export function tagsPointingAt(root: string, commit: string): Naming {
  try {
    return { kind: "names", names: ask(root, ["tag", "--points-at", commit]) };
  } catch (cause) {
    return { kind: "cannot-tell", why: reasonFrom(cause) };
  }
}
