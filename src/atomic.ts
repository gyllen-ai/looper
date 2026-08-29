import {
  closeSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  renameSync,
  statSync,
  unlinkSync,
  writeSync,
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

function sleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function takeLock(path: string): boolean {
  try {
    closeSync(openSync(path, "wx"));
    return true;
  } catch (cause) {
    if (fieldAt(cause, "code") !== "EEXIST") throw cause;
    return false;
  }
}

function abandonedFor(lockWrittenMs: number, arrivedMs: number, staleMs: number): boolean {
  return arrivedMs - lockWrittenMs > staleMs;
}

export function abandonedBefore(lockWrittenMs: number, arrivedMs: number): boolean {
  return abandonedFor(lockWrittenMs, arrivedMs, A_WRITE.staleMs);
}

function leftBehind(path: string, arrivedMs: number, staleMs: number): boolean {
  if (!existsSync(path)) return false;
  return abandonedFor(statSync(path).mtimeMs, arrivedMs, staleMs);
}

export function withLockFor<T>(path: string, patience: Patience, body: () => T): Locked<T> {
  mkdirSync(dirname(path), { recursive: true });
  const lock = `${path}${LOCK_SUFFIX}`;
  const arrived = Date.now();

  do {
    if (takeLock(lock)) {
      try {
        return { kind: "held", result: body() };
      } finally {
        if (existsSync(lock)) unlinkSync(lock);
      }
    }
    if (leftBehind(lock, arrived, patience.staleMs)) unlinkSync(lock);
    else sleep(patience.waitMs);
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

function keepPrior(path: string): Backup {
  if (!existsSync(path)) return { kind: "none" };
  const kept = `${path}${BACKUP_SUFFIX}`;
  copyFileSync(path, kept);
  return { kind: "kept", path: kept };
}

function flushToDisk(temp: string, text: string): void {
  const handle = openSync(temp, "w");
  try {
    writeSync(handle, text);
    fsyncSync(handle);
  } finally {
    closeSync(handle);
  }
}

function discard(temp: string): void {
  if (existsSync(temp)) unlinkSync(temp);
}

function written(path: string, text: string, keeping: boolean): Written {
  const temp = `${path}${TEMP_SUFFIX}`;
  try {
    mkdirSync(dirname(path), { recursive: true });
    const backup = keepPrior(path);
    flushToDisk(temp, text);
    renameSync(temp, path);
    if (keeping) return { path, backup };
    if (backup.kind === "kept") unlinkSync(backup.path);
    return { path, backup: { kind: "none" } };
  } catch (cause) {
    discard(temp);
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
