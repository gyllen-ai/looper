import { DECISIONS_PRIORITY, DECISIONS_TOOL } from "../config.ts";
import { SILENT } from "../capability.ts";
import type {
  Capability,
  HookEvent,
  InjectContext,
  Injection,
  Outcome,
  ToolCall,
  ToolDef,
  ToolResult,
} from "../capability.ts";
import {
  forget,
  matching,
  readDecisions,
  record,
  reread,
  standingOf,
  standings,
  NOTHING_UNDER_IT,
  type Decision,
  type Standing,
} from "./store.ts";

const NO_EVENTS: readonly HookEvent[] = [];

const DESCRIPTION = [
  "Where this project and its own law disagree, on purpose.",
  "",
  "Call with no argument to read every entry, or with {\"about\":\"...\"} to find matching ones.",
  "Write one with {\"summary\":\"...\",\"decision\":\"...\",\"kind\":\"security\",\"depends\":\"src/a.ts, src/b.ts\"}.",
  "Writing the same summary again replaces it. Remove one with {\"forget\":\"...\"}.",
  "Say you have read one again, and it still says something true, with {\"reread\":\"...\"}.",
  "",
  "What earns a place: a rule or a piece of doctrine set aside deliberately, where",
  "the reason is a judgement nobody here is qualified to make. A credential that",
  "cannot be rotated today. A vendor's terms that were read one way and might be",
  "read another. A boundary crossed because the alternative was worse. Say what was",
  "asked, what it breaks, what was built, and what it costs later.",
  "",
  "`depends` is the files the entry rests on. looper hashes them when you write it,",
  "and every later session is told which entries the code has moved out from under.",
  "An entry that rests on a decision rather than on code says so, and then only a",
  "person can refresh it.",
  "",
  "What does not belong here: a bug, a task, or a complaint. This is not a backlog.",
  "It is the record of where the codebase and its law disagree, so the disagreement",
  "is visible instead of buried in a diff.",
].join("\n");

function today(): string {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function shown(standing: Standing): string {
  const one = standing.decision;
  const head = `## ${one.taken} — ${one.summary}\nkind: ${one.kind}\ndepends: ${one.depends.length === 0 ? NOTHING_UNDER_IT : one.depends.join(", ")}`;
  if (standing.kind === "moved") {
    return `${head}\nREAD IT AGAIN: last read ${one.checked} against ${one.hash}, the files now hash ${standing.now}\n${one.body}`;
  }
  if (standing.kind === "gone") {
    return `${head}\nREAD IT AGAIN: it rests on ${standing.missing.join(", ")}, which is no longer there\n${one.body}`;
  }
  if (standing.kind === "unreadable") {
    return `${head}\nREAD IT AGAIN: looper cannot read what it rests on (${standing.why}), so nothing is watching it\n${one.body}`;
  }
  if (standing.kind === "unwatchable") {
    return `${head}\nchecked: ${one.checked} — nothing watches this one, only a person can\n${one.body}`;
  }
  return `${head}\nchecked: ${one.checked}\n${one.body}`;
}

function listed(found: readonly Standing[]): string {
  return found.map(shown).join("\n\n");
}

function dependsIn(written: string | undefined): readonly string[] {
  if (written === undefined) return [];
  if (written === NOTHING_UNDER_IT) return [];
  return written
    .split(",")
    .map((one) => one.trim())
    .filter((one) => one.length > 0);
}

const NAMED_AT_ONCE = 3;

export class Decisions implements Capability {
  readonly name = "decisions";

  inject(context: InjectContext): readonly Injection[] {
    const found = standings(context.root);
    if (found.length === 0) return SILENT;
    const shown = found.slice(0, NAMED_AT_ONCE);
    const over = found.length - shown.length;
    const more = over <= 0 ? "" : `\n  and ${over} more, by name from the tool.`;
    const stale = found.filter(
      (one) => one.kind === "moved" || one.kind === "gone" || one.kind === "unreadable",
    );
    if (stale.length === 0) {
      return [
        {
          source: this.name,
          priority: DECISIONS_PRIORITY,
          required: false,
          notice: true,
          text: `looper: ${found.length} decision(s) taken here with a known cost:\n${shown.map((one) => `  ${one.decision.summary}`).join("\n")}${more}\nRead one with the \`decisions\` tool before crossing that same line again.`,
        },
      ];
    }
    return [
      {
        source: this.name,
        priority: DECISIONS_PRIORITY,
        required: false,
        notice: true,
        text: `looper: ${stale.length} of this project's ${found.length} recorded decision(s) rest on files that have changed since anyone read them. Call the \`decisions\` tool: an entry whose ground moved may no longer be true, and it was written because nobody could answer it.`,
      },
    ];
  }

  hooks(): readonly HookEvent[] {
    return NO_EVENTS;
  }

  onHook(): Outcome {
    return { kind: "pass" };
  }

  tools(): readonly ToolDef[] {
    return [
      {
        name: DECISIONS_TOOL,
        description: DESCRIPTION,
        inputSchema: {
          type: "object",
          properties: {
            summary: { type: "string", description: "one line naming what was decided" },
            decision: { type: "string", description: "what was asked, what it breaks, what was built, what it costs" },
            kind: { type: "string", description: "security, legal, architecture, or law" },
            depends: { type: "string", description: "the files this rests on, comma separated, or none" },
            about: { type: "string", description: "read only entries mentioning this" },
            reread: { type: "string", description: "the summary of an entry you have read again, to re-record its hash" },
            forget: { type: "string", description: "remove the entry with this summary" },
          },
        },
      },
    ];
  }

  call(request: ToolCall): ToolResult {
    if (request.tool !== DECISIONS_TOOL) {
      return { kind: "unknown-tool", asked: request.tool };
    }

    const dropping = request.args.get("forget");
    if (dropping !== undefined) {
      const gone = forget(request.root, dropping);
      if (gone.kind === "busy") {
        return {
          kind: "text",
          text: `looper could not remove that entry: ${gone.why}. Nothing was changed — try again.`,
        };
      }
      return {
        kind: "text",
        text:
          gone.kind === "gone"
            ? `removed: ${dropping}`
            : `there is no decision called "${dropping}".`,
      };
    }

    const read = request.args.get("reread");
    if (read !== undefined) {
      const done = reread(request.root, read, today());
      if (done.kind === "busy") {
        return {
          kind: "text",
          text: `looper could not re-record that entry: ${done.why}. Nothing was changed — try again.`,
        };
      }
      if (done.kind === "unreadable") {
        return {
          kind: "text",
          text: `looper could not re-record that entry: it rests on something it cannot read (${done.why}). Nothing was changed — point it at what you meant, or fix the permission.`,
        };
      }
      return {
        kind: "text",
        text:
          done.kind === "gone"
            ? `re-recorded: ${read} now reads against the files as they are today. This is a claim that you read it and it still says something true.`
            : `there is no decision called "${read}".`,
      };
    }

    const summary = request.args.get("summary");
    const body = request.args.get("decision");
    if (summary !== undefined && body !== undefined) {
      const kind = request.args.get("kind");
      const decision: Decision = {
        taken: today(),
        summary,
        kind: kind === undefined ? "architecture" : kind,
        depends: dependsIn(request.args.get("depends")),
        checked: today(),
        hash: "",
        body,
      };
      const written = record(request.root, decision);
      if (written.kind === "busy") {
        return {
          kind: "text",
          text: `looper did not record that decision: ${written.why}. Nothing was lost and nothing was written — say it again.`,
        };
      }
      if (written.kind === "unreadable") {
        return {
          kind: "text",
          text: `looper did not record that decision: ${written.why}. Name the files it actually rests on, or say none.`,
        };
      }
      const verb = written.kind === "replaced" ? "corrected" : "recorded";
      const watched = decision.depends.length === 0 ? ", resting on no file, so only a person can refresh it" : "";
      return { kind: "text", text: `${verb}: ${summary} (${written.total} decision(s) now)${watched}` };
    }
    if (summary !== undefined || body !== undefined) {
      return {
        kind: "text",
        text: "recording a decision needs both a summary and the decision itself.",
      };
    }

    const held = readDecisions(request.root);
    const about = request.args.get("about");
    const wanted = about === undefined ? held : matching(held, about);
    if (wanted.length === 0) {
      const nothing = held.length === 0
        ? "this project has recorded no decisions yet."
        : `none of the ${held.length} recorded decision(s) mention that.`;
      return { kind: "text", text: nothing };
    }
    return { kind: "text", text: listed(wanted.map((one) => standingOf(request.root, one))) };
  }
}
