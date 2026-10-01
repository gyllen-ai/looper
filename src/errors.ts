import { fieldAt } from "./fields.ts";

export class NotOursToFix extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotOursToFix";
  }
}

const THE_MACHINE_SAID_NO: readonly string[] = [
  "EACCES",
  "EPERM",
  "EROFS",
  "ENOSPC",
  "EDQUOT",
  "EMFILE",
  "ENFILE",
  "EIO",
];

export function isOursToFix(cause: unknown): boolean {
  if (cause instanceof NotOursToFix) return false;
  const code = fieldAt(cause, "code");
  return typeof code !== "string" || !THE_MACHINE_SAID_NO.includes(code);
}

export class SettingsUnparseable extends NotOursToFix {
  readonly path: string;

  constructor(path: string, detail: string) {
    super(
      `${path} is not valid JSON (${detail}). looper will not rewrite a file it cannot read: fix the file, or move it aside, and run init again.`,
    );
    this.name = "SettingsUnparseable";
    this.path = path;
  }
}

export class SettingsNotAnObject extends NotOursToFix {
  readonly path: string;

  constructor(path: string, found: string) {
    super(
      `${path} holds a ${found} where an object was expected. looper will not rewrite a file whose shape it does not recognise: fix the file, or move it aside, and run init again.`,
    );
    this.name = "SettingsNotAnObject";
    this.path = path;
  }
}

export class RuleOnTheWrongPass extends Error {
  readonly ruleId: string;

  constructor(ruleId: string, declared: string) {
    super(
      `rule ${ruleId} declares the pass "${declared}", which is neither "fast" nor "slow". A rule that does not say which pass it belongs to would be run by whichever pass happened to load it, and the fast pass cannot answer what the slow pass answers.`,
    );
    this.name = "RuleOnTheWrongPass";
    this.ruleId = ruleId;
  }
}

export class TomlMalformed extends NotOursToFix {
  readonly what: string;
  readonly line: number;

  constructor(what: string, line: number, detail: string) {
    const where = line > 0 ? `, line ${line}` : "";
    super(
      `${what}${where}: ${detail}. Until this is fixed, looper reads none of it, because a file it half-understands governs the wrong things without saying so.`,
    );
    this.name = "TomlMalformed";
    this.what = what;
    this.line = line;
  }
}

export class AtomicWriteFailed extends NotOursToFix {
  readonly path: string;

  constructor(path: string, detail: string) {
    super(
      `could not write ${path} (${detail}). Nothing was changed: looper writes to a temporary file and renames it into place, so a failure here leaves the original exactly as it was.`,
    );
    this.name = "AtomicWriteFailed";
    this.path = path;
  }
}

export class HookGroupsNotAnArray extends NotOursToFix {
  readonly path: string;
  readonly event: string;

  constructor(path: string, event: string) {
    super(
      `${path} has a "hooks.${event}" that is not a list. looper will not rewrite a file whose shape it does not recognise: fix the file, or move it aside, and run init again.`,
    );
    this.name = "HookGroupsNotAnArray";
    this.path = path;
    this.event = event;
  }
}
