import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, posix } from "node:path";

import { BASELINE_PATH, CONSTITUTION_PATH } from "../config.ts";
import { asItWasAt, headCommit, lastAdded, namesAt, type Landed } from "../git.ts";
import { countIn } from "../present.ts";
import { foundIn } from "./one-file.ts";
import type { Violation } from "./rule.ts";
import { textOfOrdinary } from "../ordinary.ts";

const MARKS_OF_ARRIVING: readonly string[] = [BASELINE_PATH, CONSTITUTION_PATH];

const WHAT_A_READER_LOOKS_AROUND_FOR = /(^|\/)(Cargo\.toml|[^/]+\.csproj|Directory\.Build\.props|pyproject\.toml)$/;

export function arrivalIn(root: string): Landed {
  for (const mark of MARKS_OF_ARRIVING) {
    if (!existsSync(join(root, mark))) continue;
    const added = lastAdded(root, mark);
    return added.kind === "never-committed" ? headCommit(root) : added;
  }
  return { kind: "unknown", why: "looper has left no mark of arriving in this project" };
}

export type LineNow = (file: string, line: number) => string;

export type AlreadyThere = (asked: readonly Violation[]) => ReadonlySet<Violation>;

function lineIn(text: string, line: number): string {
  const held = text.split("\n")[line - 1];
  return held === undefined ? "" : held.trim();
}

function kept(file: string, rule: string, text: string): string {
  return JSON.stringify([file, rule, text]);
}

function directoriesAbove(file: string): readonly string[] {
  const found: string[] = [];
  let at = posix.dirname(file);
  for (;;) {
    found.push(at);
    if (at === ".") return found;
    at = posix.dirname(at);
  }
}

function laidDown(shelf: string, file: string, text: string): void {
  mkdirSync(dirname(join(shelf, file)), { recursive: true });
  writeFileSync(join(shelf, file), text);
}

function laidAround(root: string, commit: string, shelf: string, file: string): void {
  const beside = posix.dirname(file);
  for (const directory of directoriesAbove(file)) {
    const listed = namesAt(root, commit, directory);
    if (listed.kind !== "names") continue;
    for (const name of listed.names) {
      if (existsSync(join(shelf, name))) continue;
      if (WHAT_A_READER_LOOKS_AROUND_FOR.test(name)) {
        const was = asItWasAt(root, commit, name);
        if (was.kind === "text") laidDown(shelf, name, was.text);
        continue;
      }
      if (directory === beside) laidDown(shelf, name, "");
    }
  }
}

function foundThen(root: string, commit: string, files: readonly string[]): ReadonlyMap<string, number> {
  const shelf = mkdtempSync(join(tmpdir(), "looper-as-it-was-"));
  const counted = new Map<string, number>();
  try {
    const texts = new Map<string, string>();
    for (const file of files) {
      const was = asItWasAt(root, commit, file);
      if (was.kind !== "text") continue;
      laidDown(shelf, file, was.text);
      texts.set(file, was.text);
    }
    for (const file of texts.keys()) laidAround(root, commit, shelf, file);
    for (const [file, text] of texts) {
      for (const violation of foundIn({ settings: root, content: shelf }, file).violations) {
        const key = kept(file, violation.rule.id, lineIn(text, violation.line));
        counted.set(key, countIn(counted, key) + 1);
      }
    }
    return counted;
  } finally {
    rmSync(shelf, { recursive: true, force: true });
  }
}

export function alreadyThereWhenLooperArrived(root: string, lineNow: LineNow): AlreadyThere {
  return (asked) => {
    const there = new Set<Violation>();
    if (asked.length === 0) return there;
    const arrival = arrivalIn(root);
    if (arrival.kind !== "at") return there;
    const left = new Map(foundThen(root, arrival.commit, [...new Set(asked.map((one) => one.file))]));
    for (const violation of asked) {
      const key = kept(violation.file, violation.rule.id, lineNow(violation.file, violation.line));
      const held = countIn(left, key);
      if (held === 0) continue;
      left.set(key, held - 1);
      there.add(violation);
    }
    return there;
  };
}

export function linesFrom(texts: ReadonlyMap<string, string>, root: string): LineNow {
  const onDisk = linesOnDisk(root);
  return (file, line) => {
    const held = texts.get(file);
    return held === undefined ? onDisk(file, line) : lineIn(held, line);
  };
}

export function linesOnDisk(root: string): LineNow {
  const read = new Map<string, string>();
  return (file, line) => {
    const held = read.get(file);
    if (held !== undefined) return lineIn(held, line);
    const text = textOfOrdinary(join(root, file));
    read.set(file, text);
    return lineIn(text, line);
  };
}
