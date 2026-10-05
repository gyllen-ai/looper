import { createHash } from "node:crypto";

import { fieldAt } from "../fields.ts";

export const WRITING: readonly string[] = ["Edit", "MultiEdit", "Write", "NotebookEdit"];

export type Change = { readonly at: number; readonly removed: number; readonly added: number };

export type Placed =
  | { readonly kind: "not-a-write" }
  | { readonly kind: "unplaced"; readonly why: string }
  | { readonly kind: "placed"; readonly before: string; readonly after: string; readonly changes: readonly Change[] };

const PRINT_LENGTH = 12;

function printOf(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, PRINT_LENGTH);
}

function placed(before: string, after: string, changes: readonly Change[]): Placed {
  return { kind: "placed", before: printOf(before), after: printOf(after), changes };
}

function narrowed(at: number, gone: string, put: string): Change {
  const most = Math.min(gone.length, put.length);
  let front = 0;
  while (front < most && gone[front] === put[front]) front += 1;
  let back = 0;
  while (back < most - front && gone[gone.length - 1 - back] === put[put.length - 1 - back]) back += 1;
  return { at: at + front, removed: gone.length - front - back, added: put.length - front - back };
}

function changes(change: Change): boolean {
  return change.removed > 0 || change.added > 0;
}

type Before = { readonly kind: "text"; readonly text: string } | { readonly kind: "absent" };

function textBefore(response: unknown): Before {
  const held = fieldAt(response, "originalFile");
  if (typeof held === "string") return { kind: "text", text: held };
  if (held === null) return { kind: "text", text: "" };
  return { kind: "absent" };
}

type Asked = { readonly gone: string; readonly put: string; readonly everywhere: boolean };

type Asking =
  | { readonly kind: "asked"; readonly edits: readonly Asked[] }
  | { readonly kind: "unread"; readonly why: string };

function editAsked(edit: unknown): Asking {
  const gone = fieldAt(edit, "old_string");
  const put = fieldAt(edit, "new_string");
  if (typeof gone !== "string" || typeof put !== "string") {
    return { kind: "unread", why: "this edit did not say what it replaced with what" };
  }
  return { kind: "asked", edits: [{ gone, put, everywhere: fieldAt(edit, "replace_all") === true }] };
}

function editsAsked(tool: string, input: unknown): Asking {
  if (tool === "Edit") return editAsked(input);
  const listed = fieldAt(input, "edits");
  if (!Array.isArray(listed)) return { kind: "unread", why: "this edit did not list what it changed" };
  const edits: Asked[] = [];
  for (const one of listed) {
    const asked = editAsked(one);
    if (asked.kind === "unread") return asked;
    edits.push(...asked.edits);
  }
  return { kind: "asked", edits };
}

type Applied =
  | { readonly kind: "applied"; readonly text: string; readonly changes: readonly Change[] }
  | { readonly kind: "unplaced"; readonly why: string };

function replacedIn(text: string, asked: Asked): Applied {
  if (asked.gone.length === 0) {
    if (text.length > 0) {
      return { kind: "unplaced", why: "this edit named no text to replace in a file that already held some" };
    }
    return { kind: "applied", text: asked.put, changes: [narrowed(0, "", asked.put)].filter(changes) };
  }
  let found = text.indexOf(asked.gone);
  if (found < 0) {
    return { kind: "unplaced", why: "the text this edit replaced is not in the copy of the file it came with" };
  }
  const made: Change[] = [];
  let written = "";
  let from = 0;
  while (found >= 0) {
    written += text.slice(from, found);
    made.push(narrowed(written.length, asked.gone, asked.put));
    written += asked.put;
    from = found + asked.gone.length;
    found = asked.everywhere ? text.indexOf(asked.gone, from) : -1;
  }
  return { kind: "applied", text: written + text.slice(from), changes: made.filter(changes) };
}

function placedEdits(tool: string, input: unknown, response: unknown): Placed {
  const asked = editsAsked(tool, input);
  if (asked.kind === "unread") return { kind: "unplaced", why: asked.why };
  const before = textBefore(response);
  if (before.kind === "absent") {
    return { kind: "unplaced", why: "this edit came with no copy of the file as it was before it" };
  }
  let text = before.text;
  const made: Change[] = [];
  for (const one of asked.edits) {
    const applied = replacedIn(text, one);
    if (applied.kind === "unplaced") return applied;
    made.push(...applied.changes);
    text = applied.text;
  }
  return placed(before.text, text, made);
}

type Hunk = { readonly oldStart: number; readonly newStart: number; readonly lines: readonly string[] };

type Hunks = { readonly kind: "hunks"; readonly hunks: readonly Hunk[] } | { readonly kind: "unread" };

function hunksIn(patch: unknown): Hunks {
  if (!Array.isArray(patch)) return { kind: "unread" };
  const hunks: Hunk[] = [];
  for (const one of patch) {
    const oldStart = fieldAt(one, "oldStart");
    const newStart = fieldAt(one, "newStart");
    const listed = fieldAt(one, "lines");
    if (typeof oldStart !== "number" || typeof newStart !== "number" || !Array.isArray(listed)) return { kind: "unread" };
    const lines: string[] = [];
    for (const line of listed) {
      if (typeof line !== "string") return { kind: "unread" };
      lines.push(line);
    }
    hunks.push({ oldStart, newStart, lines });
  }
  return { kind: "hunks", hunks };
}

type Run = { readonly old: number; readonly gone: number; readonly fresh: number; readonly put: number };

function runsIn(hunk: Hunk): readonly Run[] {
  const runs: Run[] = [];
  let old = hunk.oldStart;
  let fresh = hunk.newStart;
  let gone = 0;
  let put = 0;
  for (const line of hunk.lines) {
    const mark = line.charAt(0);
    if (mark === "-") gone += 1;
    else if (mark === "+") put += 1;
    else if (mark !== "\\") {
      if (gone + put > 0) runs.push({ old, gone, fresh, put });
      old += gone + 1;
      fresh += put + 1;
      gone = 0;
      put = 0;
    }
  }
  if (gone + put > 0) runs.push({ old, gone, fresh, put });
  return runs;
}

function lineStarts(text: string): readonly number[] {
  const starts = [0];
  for (let at = text.indexOf("\n"); at >= 0; at = text.indexOf("\n", at + 1)) starts.push(at + 1);
  return starts;
}

function startOfLine(starts: readonly number[], line: number, end: number): number {
  const held = starts[Math.max(line, 1) - 1];
  return held === undefined ? end : held;
}

function changesFrom(hunks: readonly Hunk[], before: string, after: string): readonly Change[] {
  const was = lineStarts(before);
  const now = lineStarts(after);
  const made: Change[] = [];
  for (const run of hunks.flatMap(runsIn)) {
    const from = startOfLine(was, run.old, before.length);
    const to = startOfLine(was, run.old + run.gone, before.length);
    const into = startOfLine(now, run.fresh, after.length);
    const upTo = startOfLine(now, run.fresh + run.put, after.length);
    made.push(narrowed(into, before.slice(from, to), after.slice(into, upTo)));
  }
  return made.filter(changes);
}

function rebuilt(before: string, after: string, made: readonly Change[]): string {
  let text = before;
  for (const change of made) {
    text = text.slice(0, change.at) + after.slice(change.at, change.at + change.added) + text.slice(change.at + change.removed);
  }
  return text;
}

function placedWrite(input: unknown, response: unknown): Placed {
  const after = fieldAt(input, "content");
  if (typeof after !== "string") return { kind: "unplaced", why: "this write did not say what it wrote" };
  const before = textBefore(response);
  if (before.kind === "absent") {
    return { kind: "unplaced", why: "this write came with no copy of the file as it was before it" };
  }
  if (before.text.length === 0) return placed(before.text, after, [narrowed(0, "", after)].filter(changes));
  const hunks = hunksIn(fieldAt(response, "structuredPatch"));
  if (hunks.kind === "unread") return { kind: "unplaced", why: "this write did not say which of its lines changed" };
  const made = changesFrom(hunks.hunks, before.text, after);
  if (rebuilt(before.text, after, made) !== after) {
    return { kind: "unplaced", why: "the lines this write said it changed do not add up to what it wrote" };
  }
  return placed(before.text, after, made);
}

export function placedIn(tool: string, input: unknown, response: unknown): Placed {
  if (!WRITING.includes(tool)) return { kind: "not-a-write" };
  if (tool === "Write") return placedWrite(input, response);
  if (tool === "Edit" || tool === "MultiEdit") return placedEdits(tool, input, response);
  return { kind: "unplaced", why: `a ${tool} cannot be placed character by character in its file` };
}

const NOT_A_WRITE = "-";

const UNPLACED = "?";

const A_PRINT = new RegExp(`^[0-9a-f]{${PRINT_LENGTH}}$`);

const A_CHANGE = /^(\d+),(\d+),(\d+)$/;

const NOT_PLACED_THEN = "where it landed was not known when it was written down";

export function writtenAs(where: Placed): string {
  if (where.kind === "not-a-write") return NOT_A_WRITE;
  if (where.kind === "unplaced") return UNPLACED;
  return [where.before, where.after, ...where.changes.map((one) => `${one.at},${one.removed},${one.added}`)].join(" ");
}

export function readAs(text: string): Placed {
  if (text === NOT_A_WRITE) return { kind: "not-a-write" };
  if (text === UNPLACED) return { kind: "unplaced", why: NOT_PLACED_THEN };
  const [before, after, ...rest] = text.split(" ");
  if (before === undefined || after === undefined || !A_PRINT.test(before) || !A_PRINT.test(after)) {
    return { kind: "unplaced", why: NOT_PLACED_THEN };
  }
  const made: Change[] = [];
  for (const one of rest) {
    const held = A_CHANGE.exec(one);
    if (held === null) return { kind: "unplaced", why: NOT_PLACED_THEN };
    made.push({ at: Number(held[1]), removed: Number(held[2]), added: Number(held[3]) });
  }
  return { kind: "placed", before, after, changes: made };
}
