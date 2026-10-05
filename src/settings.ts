import {
  COMMAND_KEY,
  SERVER_NAME,
  HOOKS_KEY,
  HOOK_ENTRY_TYPE,
  HOOK_TIMEOUT_SECONDS,
  JSON_INDENT,
  MATCHER_KEY,
  SETTINGS_PATH,
} from "./config.ts";
import { reasonFrom } from "./fields.ts";
import {
  HookGroupsNotAnArray,
  SettingsNotAnObject,
  SettingsUnparseable,
} from "./errors.ts";
import type { Launch } from "./config.ts";
import type {
  Existing,
  HookSpec,
  JsonObject,
  JsonValue,
  Matcher,
  Merge,
  Moved,
} from "./types.ts";

const NO_GROUPS: readonly JsonValue[] = [];

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonArray(value: JsonValue | undefined): value is readonly JsonValue[] {
  return Array.isArray(value);
}

function describe(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "list";
  return typeof value;
}

function parseSettings(text: string): JsonObject {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (cause) {
    const detail = reasonFrom(cause);
    throw new SettingsUnparseable(SETTINGS_PATH, detail);
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new SettingsNotAnObject(SETTINGS_PATH, describe(value));
  }
  const object: JsonObject = { ...value };
  return object;
}

function matcherOf(group: JsonObject): Matcher {
  const written = group[MATCHER_KEY];
  if (typeof written === "string") {
    return { kind: "match", pattern: written };
  }
  return { kind: "all" };
}

function sameMatcher(left: Matcher, right: Matcher): boolean {
  if (left.kind === "all" && right.kind === "all") return true;
  if (left.kind === "match" && right.kind === "match") {
    return left.pattern === right.pattern;
  }
  return false;
}

function eventGroups(root: JsonObject, event: string): readonly JsonValue[] {
  const hooks = root[HOOKS_KEY];
  if (!isJsonObject(hooks)) return NO_GROUPS;
  const groups = hooks[event];
  if (groups === undefined) return NO_GROUPS;
  if (!isJsonArray(groups)) throw new HookGroupsNotAnArray(SETTINGS_PATH, event);
  return groups;
}

function carriesCommand(groups: readonly JsonValue[], command: string): boolean {
  return groups.some((group) => {
    if (!isJsonObject(group)) return false;
    const entries = group[HOOKS_KEY];
    if (!isJsonArray(entries)) return false;
    return entries.some(
      (entry) => isJsonObject(entry) && entry[COMMAND_KEY] === command,
    );
  });
}

function entryFor(spec: HookSpec): JsonObject {
  return {
    type: HOOK_ENTRY_TYPE,
    command: spec.command,
    timeout: spec.timeoutSeconds === undefined ? HOOK_TIMEOUT_SECONDS : spec.timeoutSeconds,
    statusMessage: spec.statusMessage,
  };
}

function groupFor(spec: HookSpec): JsonObject {
  if (spec.matcher.kind === "all") {
    return { hooks: [entryFor(spec)] };
  }
  return { matcher: spec.matcher.pattern, hooks: [entryFor(spec)] };
}

function withEntryAppended(group: JsonObject, spec: HookSpec): JsonObject {
  const entries = group[HOOKS_KEY];
  if (!isJsonArray(entries)) return { ...group, hooks: [entryFor(spec)] };
  return { ...group, hooks: [...entries, entryFor(spec)] };
}

function placedInGroups(
  groups: readonly JsonValue[],
  spec: HookSpec,
): readonly JsonValue[] {
  let landed = false;
  const next = groups.map((group) => {
    if (landed || !isJsonObject(group)) return group;
    if (!sameMatcher(matcherOf(group), spec.matcher)) return group;
    landed = true;
    return withEntryAppended(group, spec);
  });
  if (landed) return next;
  return [...next, groupFor(spec)];
}

const OUR_ENTRY_ENDS: readonly string[] = [
  "bin/looper.js",
  "src/main.ts",
  ".bin/looper",
  "looper",
];

function tailOf(command: string): string {
  const at = command.lastIndexOf('"');
  return at === -1 ? command.slice(command.indexOf(" ") + 1) : command.slice(at + 1).trim();
}

function programOf(command: string): string {
  const at = command.lastIndexOf('"');
  if (at === -1) return command.split(" ")[0] === undefined ? "" : command.split(" ")[0];
  const opened = command.indexOf('"');
  return command.slice(opened + 1, at);
}

function isOneWeWrote(command: string, wanted: string): boolean {
  if (tailOf(command) !== tailOf(wanted)) return false;
  const program = programOf(command);
  return OUR_ENTRY_ENDS.some((ending) => program.endsWith(ending));
}

function ourOlderHooksIn(groups: readonly JsonValue[], wanted: string): readonly string[] {
  const found: string[] = [];
  for (const group of groups) {
    if (!isJsonObject(group)) continue;
    const entries = group[HOOKS_KEY];
    if (!isJsonArray(entries)) continue;
    for (const entry of entries) {
      if (!isJsonObject(entry)) continue;
      const command = entry[COMMAND_KEY];
      if (typeof command === "string" && command !== wanted && isOneWeWrote(command, wanted)) {
        found.push(command);
      }
    }
  }
  return found;
}

function withoutOurOlderHooks(groups: readonly JsonValue[], wanted: string): readonly JsonValue[] {
  const kept: JsonValue[] = [];
  for (const group of groups) {
    if (!isJsonObject(group)) {
      kept.push(group);
      continue;
    }
    const entries = group[HOOKS_KEY];
    if (!isJsonArray(entries)) {
      kept.push(group);
      continue;
    }
    const held = entries.filter((entry) => {
      if (!isJsonObject(entry)) return true;
      const command = entry[COMMAND_KEY];
      return !(typeof command === "string" && isOneWeWrote(command, wanted));
    });
    if (held.length === 0) continue;
    kept.push({ ...group, [HOOKS_KEY]: held });
  }
  return kept;
}

function withHookWired(root: JsonObject, spec: HookSpec): JsonObject {
  const standing = withoutOurOlderHooks(eventGroups(root, spec.event), spec.command);
  const groups = placedInGroups(standing, spec);
  const existingHooks = root[HOOKS_KEY];
  const hooks: JsonObject = isJsonObject(existingHooks) ? existingHooks : {};
  return { ...root, hooks: { ...hooks, [spec.event]: groups } };
}

function serialise(root: JsonObject): string {
  return `${JSON.stringify(root, null, JSON_INDENT)}\n`;
}

const SERVERS_KEY = "mcpServers";

export type McpMerge =
  | { readonly kind: "unchanged" }
  | { readonly kind: "created"; readonly text: string }
  | { readonly kind: "merged"; readonly text: string }
  | {
      readonly kind: "corrected";
      readonly text: string;
      readonly was: WrittenLaunch;
      readonly now: string;
    }
  | { readonly kind: "unreadable"; readonly why: string };

export type WrittenLaunch =
  | { readonly kind: "unreadable" }
  | { readonly kind: "read"; readonly line: string; readonly shape: string };

function launchIn(value: unknown): WrittenLaunch {
  if (!isJsonObject(value)) return { kind: "unreadable" };
  const command = value["command"];
  const args = value["args"];
  if (typeof command !== "string" || !Array.isArray(args)) return { kind: "unreadable" };
  const words = args.map((word) => String(word));
  return {
    kind: "read",
    line: [command, ...words].join(" "),
    shape: JSON.stringify([command, words]),
  };
}

function looperOwns(kept: JsonObject, wanted: JsonObject): JsonObject {
  const entry: JsonObject = { ...kept };
  entry["type"] = wanted["type"];
  entry["command"] = wanted["command"];
  entry["args"] = wanted["args"];
  return entry;
}

function serverEntry(launch: Launch): JsonObject {
  return {
    type: "stdio",
    command: launch.command,
    args: [...launch.args, "serve"],
  };
}

export function mergeMcp(existing: Existing, launch: Launch): McpMerge {
  const only = { [SERVERS_KEY]: { [SERVER_NAME]: serverEntry(launch) } };
  if (existing.kind === "absent") return { kind: "created", text: serialise(only) };

  let value: unknown;
  try {
    value = JSON.parse(existing.text);
  } catch (cause) {
    return { kind: "unreadable", why: reasonFrom(cause) };
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return { kind: "unreadable", why: `it holds a ${describe(value)} rather than an object` };
  }

  const root: JsonObject = { ...value };
  const written = root[SERVERS_KEY];
  const servers: JsonObject = isJsonObject(written) ? written : {};
  const wanted = serverEntry(launch);
  const asked = launchIn(wanted);
  const mine = servers[SERVER_NAME];
  if (mine !== undefined && asked.kind === "read") {
    const held = launchIn(mine);
    if (held.kind === "read" && held.shape === asked.shape) return { kind: "unchanged" };
    const kept: JsonObject = isJsonObject(mine) ? { ...mine } : {};
    return {
      kind: "corrected",
      was: held,
      now: asked.line,
      text: serialise({
        ...root,
        [SERVERS_KEY]: { ...servers, [SERVER_NAME]: looperOwns(kept, wanted) },
      }),
    };
  }

  return {
    kind: "merged",
    text: serialise({ ...root, [SERVERS_KEY]: { ...servers, [SERVER_NAME]: wanted } }),
  };
}

const EVERY_TOOL = "every tool";

export function matcherText(matcher: Matcher): string {
  return matcher.kind === "all" ? EVERY_TOOL : matcher.pattern;
}

function matchersCarrying(groups: readonly JsonValue[], command: string): readonly Matcher[] {
  const found: Matcher[] = [];
  for (const group of groups) {
    if (!isJsonObject(group)) continue;
    const entries = group[HOOKS_KEY];
    if (!isJsonArray(entries)) continue;
    for (const entry of entries) {
      if (isJsonObject(entry) && entry[COMMAND_KEY] === command) found.push(matcherOf(group));
    }
  }
  return found;
}

export function mergeSettings(
  existing: Existing,
  wanted: readonly HookSpec[],
): Merge {
  const startedEmpty = existing.kind === "absent";
  let root: JsonObject = startedEmpty ? {} : parseSettings(existing.text);

  const wired: string[] = [];
  const rewired: string[] = [];
  const moved: Moved[] = [];
  const added: string[] = [];
  const folded: string[] = [];
  for (const spec of wanted) {
    const groups = eventGroups(root, spec.event);
    const carrying = matchersCarrying(groups, spec.command);
    const older = ourOlderHooksIn(groups, spec.command);
    const inPlace = carrying.length === 1 && carrying.every((one) => sameMatcher(one, spec.matcher));
    if (inPlace && older.length === 0) continue;
    rewired.push(...older);
    for (const was of carrying) {
      if (sameMatcher(was, spec.matcher)) continue;
      moved.push({ event: spec.event, command: spec.command, was: matcherText(was), now: matcherText(spec.matcher) });
    }
    if (carrying.length === 0 && older.length === 0) added.push(spec.command);
    if (carrying.length > 1) folded.push(spec.command);
    root = withHookWired(root, spec);
    wired.push(spec.command);
  }

  if (wired.length === 0) return { kind: "unchanged" };
  const changes = { text: serialise(root), wired, rewired, moved, added, folded };
  if (startedEmpty) return { kind: "created", ...changes };
  return { kind: "merged", ...changes };
}

export type Started =
  | { readonly kind: "not-here" }
  | { readonly kind: "started-by"; readonly entry: string };

function entryOf(command: string): string {
  return command.slice(0, command.length - tailOf(command).length).trimEnd();
}

export function startedIn(existing: Existing, wanted: readonly HookSpec[]): Started {
  if (existing.kind === "absent") return { kind: "not-here" };
  const root = parseSettings(existing.text);
  for (const spec of wanted) {
    for (const group of eventGroups(root, spec.event)) {
      if (!isJsonObject(group)) continue;
      const entries = group[HOOKS_KEY];
      if (!isJsonArray(entries)) continue;
      for (const entry of entries) {
        if (!isJsonObject(entry)) continue;
        const command = entry[COMMAND_KEY];
        if (typeof command === "string" && isOneWeWrote(command, spec.command)) {
          return { kind: "started-by", entry: entryOf(command) };
        }
      }
    }
  }
  return { kind: "not-here" };
}
