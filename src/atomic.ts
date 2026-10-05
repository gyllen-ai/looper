import { randomBytes } from "node:crypto";
import {
  closeSync,
  copyFileSync,
  fstatSync,
  fsyncSync,
  linkSync,
  mkdirSync,
  openSync,
  renameSync,
  statSync,
  unlinkSync,
  writeSync,
  type Stats,
} from "node:fs";
import { dirname } from "node:path";

import { BACKUP_SUFFIX, TEMP_SUFFIX } from "./config.ts";
import { AtomicWriteFailed } from "./errors.ts";
import { fieldAt, reasonFrom } from "./fields.ts";

export type Held =
  | { readonly kind: "held" }
  | { readonly kind: "busy"; readonly why: string };

export type Locked<T> =
  | { readonly kind: "held"; readonly result: T }
  | { readonly kind: "busy"; readonly why: string };

export type Patience = {
  readonly waitMs: number;
  readonly giveUpMs: number;
  readonly staleMs: number;
};

const LOCK_SUFFIX = ".looper-lock";

const A_WRITE: Patience = { waitMs: 20, giveUpMs: 1000, staleMs: 5000 };

const UNIQUE_BYTES = 8;

function sleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function codeOf(cause: unknown): unknown {
  return fieldAt(cause, "code");
}

function ownNameBeside(path: string): string {
  return `${path}.${randomBytes(UNIQUE_BYTES).toString("hex")}${TEMP_SUFFIX}`;
}

type Identity = { readonly device: number; readonly inode: number; readonly writtenMs: number };

function identityOf(held: Stats): Identity {
  return { device: held.dev, inode: held.ino, writtenMs: held.mtimeMs };
}

function same(left: Identity, right: Identity): boolean {
  return left.device === right.device && left.inode === right.inode && left.writtenMs === right.writtenMs;
}

type Taken = { readonly kind: "taken"; readonly mine: Identity } | { readonly kind: "held-by-another" };

function takeLock(path: string): Taken {
  let handle: number;
  try {
    handle = openSync(path, "wx");
  } catch (cause) {
    if (codeOf(cause) !== "EEXIST") throw cause;
    return { kind: "held-by-another" };
  }
  try {
    return { kind: "taken", mine: identityOf(fstatSync(handle)) };
  } finally {
    closeSync(handle);
  }
}

type Look = { readonly kind: "gone" } | { readonly kind: "there"; readonly who: Identity };

function lookAt(path: string): Look {
  let held: Stats;
  try {
    held = statSync(path);
  } catch (cause) {
    if (codeOf(cause) === "ENOENT") return { kind: "gone" };
    throw cause;
  }
  return { kind: "there", who: identityOf(held) };
}

function forget(path: string): void {
  try {
    unlinkSync(path);
  } catch (cause) {
    if (codeOf(cause) !== "ENOENT") throw cause;
  }
}

function putBack(aside: string, path: string): void {
  try {
    linkSync(aside, path);
  } catch (cause) {
    if (codeOf(cause) !== "EEXIST") throw cause;
  }
  forget(aside);
}

function removeIfStill(path: string, who: Identity): void {
  const look = lookAt(path);
  if (look.kind === "gone" || !same(look.who, who)) return;
  const aside = ownNameBeside(path);
  try {
    renameSync(path, aside);
  } catch (cause) {
    if (codeOf(cause) === "ENOENT") return;
    throw cause;
  }
  const moved = lookAt(aside);
  if (moved.kind === "gone") return;
  if (same(moved.who, who)) forget(aside);
  else putBack(aside, path);
}

function abandonedFor(lockWrittenMs: number, arrivedMs: number, staleMs: number): boolean {
  return arrivedMs - lockWrittenMs > staleMs;
}

export function abandonedBefore(lockWrittenMs: number, arrivedMs: number): boolean {
  return abandonedFor(lockWrittenMs, arrivedMs, A_WRITE.staleMs);
}

export function withLockFor<T>(path: string, patience: Patience, body: () => T): Locked<T> {
  mkdirSync(dirname(path), { recursive: true });
  const lock = `${path}${LOCK_SUFFIX}`;
  const arrived = Date.now();

  do {
    const taken = takeLock(lock);
    if (taken.kind === "taken") {
      try {
        return { kind: "held", result: body() };
      } finally {
        removeIfStill(lock, taken.mine);
      }
    }
    const look = lookAt(lock);
    if (look.kind === "there" && abandonedFor(look.who.writtenMs, arrived, patience.staleMs)) {
      removeIfStill(lock, look.who);
    } else if (look.kind === "there") {
      sleep(patience.waitMs);
    }
  } while (Date.now() - arrived < patience.giveUpMs);

  return {
    kind: "busy",
    why: `${lock} was held by another looper for ${patience.giveUpMs / 1000} seconds`,
  };
}

export function withLock(path: string, body: () => void): Held {
  const held = withLockFor(path, A_WRITE, body);
  return held.kind === "held" ? { kind: "held" } : held;
}

export type Backup =
  | { readonly kind: "none" }
  | { readonly kind: "kept"; readonly path: string };

export type Written = {
  readonly path: string;
  readonly backup: Backup;
};

const NO_BACKUP: Backup = { kind: "none" };

function keepPrior(path: string): Backup {
  const kept = `${path}${BACKUP_SUFFIX}`;
  try {
    copyFileSync(path, kept);
  } catch (cause) {
    if (codeOf(cause) === "ENOENT") return NO_BACKUP;
    throw cause;
  }
  return { kind: "kept", path: kept };
}

function flushToDisk(temp: string, text: string): void {
  const handle = openSync(temp, "wx");
  try {
    writeSync(handle, text);
    fsyncSync(handle);
  } finally {
    closeSync(handle);
  }
}

function written(path: string, text: string, keeping: boolean): Written {
  const temp = ownNameBeside(path);
  try {
    mkdirSync(dirname(path), { recursive: true });
    const backup = keeping ? keepPrior(path) : NO_BACKUP;
    flushToDisk(temp, text);
    renameSync(temp, path);
    return { path, backup };
  } catch (cause) {
    forget(temp);
    const detail = reasonFrom(cause);
    throw new AtomicWriteFailed(path, detail);
  }
}

export function writeAtomically(path: string, text: string): Written {
  return written(path, text, false);
}

export function writeKeepingPrior(path: string, text: string): Written {
  return written(path, text, true);
}
