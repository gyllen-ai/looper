import { existsSync } from "node:fs";

import { REPORT_TOOL } from "../config.ts";
import { SILENT } from "../capability.ts";
import type {
  Capability,
  HookEvent,
  Injection,
  Outcome,
  ToolCall,
  ToolDef,
  ToolResult,
} from "../capability.ts";
import { A_FAULT_IN_LOOPER } from "./say.ts";
import { decide, heldIn, type Held, type State } from "./store.ts";
import { buildReport, type Leak, type Where, type Written } from "./write.ts";

const NO_EVENTS: readonly HookEvent[] = [];

const DESCRIPTION = [
  "Say that looper itself got something wrong, so the people who make it can fix it.",
  "",
  'Write one with {"kind":"...","about":"...","wrong":"...","instead":"..."}.',
  "  kind     rule: a rule fired on code that is fine. missed: it stayed silent on code",
  "           that is not. failed: looper stopped or broke. untrue: it said something",
  "           false. idea: something it should do and does not.",
  "  about    looper's own name for the part: a rule id, a rule set, a tool, a hook, a",
  "           command, or looper for the whole of it.",
  "  wrong    what looper did or said, in a plain sentence or two.",
  "  instead  what you tried, or what it should have done.",
  'When it is about a line, add {"file":"src/a.ts","line":"12"} and looper draws the shape',
  "of that line with every name and value taken out.",
  "",
  "Call with no argument to see what was written here. Say what the person decided with",
  '{"sent":"<id>"} or {"kept":"<id>"}, so nobody is asked twice.',
  "",
  "What earns a report: something looper did that was wrong, with what you saw. What does",
  "not: a rule this project wrote for itself, a rule you would simply rather not follow,",
  "or anything about this project's own code.",
  "",
  "The two sentences may not carry a name from this project. Anything written the way a",
  "name is written is refused, so say it in general words: the rule, the construct, what",
  "happened. looper writes a file on this machine and sends nothing.",
].join("\n");

const WRITTEN_WITH: readonly string[] = ["kind", "about", "wrong", "instead"];

const WHAT_BECAME_OF_IT: Readonly<Record<State, string>> = {
  written: "nobody has said whether to send it",
  sent: "sent",
  kept: "kept here",
};

function listed(held: readonly Held[]): string {
  if (held.length === 0) return "nothing has been written here about looper yet.";
  return held
    .map((one) => `${one.on}  ${one.id}  ${one.title} — ${WHAT_BECAME_OF_IT[one.state]}`)
    .join("\n");
}

function named(leaks: readonly Leak[]): string {
  return leaks.map((one) => `  ${one.word} — ${one.why}`).join("\n");
}

function glance(notOurs: readonly string[]): readonly string[] {
  if (notOurs.length === 0) return [];
  return [
    `Words in the two sentences that are not looper's own: ${notOurs.join(", ")}. If one of them is a name from this project, say it another way and write the report again.`,
  ];
}

function answered(written: Written): string {
  if (written.kind === "written") {
    return [
      `Written: ${written.path}`,
      ``,
      written.body,
      `Nothing was sent, and looper cannot send it. Show the person the report above, as it is. What happens to it is theirs to decide: looper's makers want to read it, and it can only reach them through a person.`,
      ...glance(written.notOurs),
      `When they have decided, tell looper: {"sent":"${written.id}"} or {"kept":"${written.id}"}.`,
    ].join("\n");
  }
  if (written.kind === "already") {
    const where = existsSync(written.path) ? written.path : "its file has since been deleted";
    return `This was already written here on ${written.held.on}, and ${WHAT_BECAME_OF_IT[written.held.state]}: ${where}. Nothing new was written.`;
  }
  if (written.kind === "would-leak") {
    return [
      "looper did not write the report. A report may not carry a name from this project, and these are written the way a name is written:",
      named(written.leaks),
      "Say it without them. looper's own names — a rule id, a rule set, a tool, a hook — are always fine. Nothing was written.",
    ].join("\n");
  }
  if (written.kind === "shape-leaks") {
    return [
      "looper did not write the report, because the shape it drew still carried a name:",
      named(written.leaks),
      `Nothing was written. ${A_FAULT_IN_LOOPER} Leave the file and the line out to write this one.`,
    ].join("\n");
  }
  if (written.kind === "no-shape") {
    return `looper did not write the report: ${written.why}. Name the line the rule named, or leave the file and the line out and say it in the two sentences. Nothing was written.`;
  }
  return `looper did not write the report: ${written.why}. Nothing was written.`;
}

export type Reply = { readonly done: boolean; readonly text: string };

type Pointed = Where | { readonly kind: "half-said"; readonly why: string };

function whereFrom(args: ReadonlyMap<string, string>): Pointed {
  const file = args.get("file");
  const line = args.get("line");
  if (file === undefined && line === undefined) return { kind: "nowhere" };
  if (file === undefined || line === undefined) {
    return { kind: "half-said", why: "a shape needs both the file and the line: give both, or neither" };
  }
  return { kind: "line", file, line: Number(line) };
}

export class Report implements Capability {
  readonly name = "report";
  private readonly home: string;

  constructor(home: string) {
    this.home = home;
  }

  inject(): readonly Injection[] {
    return SILENT;
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
        name: REPORT_TOOL,
        description: DESCRIPTION,
        inputSchema: {
          type: "object",
          properties: {
            kind: { type: "string", description: "rule, missed, failed, untrue or idea" },
            about: { type: "string", description: "looper's own name for the part it is about" },
            wrong: { type: "string", description: "what looper did or said" },
            instead: { type: "string", description: "what was tried, or what it should have done" },
            file: { type: "string", description: "a file in this project, to draw a shape from" },
            line: { type: "string", description: "the line in that file" },
            sent: { type: "string", description: "the id of a report the person sent" },
            kept: { type: "string", description: "the id of a report the person chose not to send" },
          },
        },
      },
    ];
  }

  private decided(root: string, id: string, state: State): Reply {
    const outcome = decide(root, this.home, id, state);
    if (outcome.kind === "decided") {
      const what = state === "sent" ? "was sent" : "stays here and was not sent";
      return { done: true, text: `On record: ${id} ${what}. It will not be brought up again.` };
    }
    if (outcome.kind === "none") {
      return {
        done: false,
        text: `There is no report ${id} here. Call with no argument to see what was written.`,
      };
    }
    return { done: false, text: `looper could not record that: ${outcome.why}. Nothing was changed.` };
  }

  answer(root: string, args: ReadonlyMap<string, string>): Reply {
    const sent = args.get("sent");
    if (sent !== undefined) return this.decided(root, sent, "sent");
    const kept = args.get("kept");
    if (kept !== undefined) return this.decided(root, kept, "kept");

    const given = WRITTEN_WITH.filter((field) => args.get(field) !== undefined);
    const where = whereFrom(args);
    if (given.length === 0 && where.kind === "nowhere") {
      const held = heldIn(root, this.home);
      if (held.kind === "unreadable") {
        return { done: false, text: `looper could not read what was written here: ${held.why}.` };
      }
      return { done: true, text: listed(held.held) };
    }

    const kind = args.get("kind");
    const about = args.get("about");
    const wrong = args.get("wrong");
    const instead = args.get("instead");
    if (kind === undefined || about === undefined || wrong === undefined || instead === undefined) {
      const missing = WRITTEN_WITH.filter((field) => !given.includes(field));
      return {
        done: false,
        text: `writing a report needs kind, about, wrong and instead, and this one had no ${missing.join(", ")}. Nothing was written.`,
      };
    }
    if (where.kind === "half-said") {
      return { done: false, text: `looper did not write the report: ${where.why}. Nothing was written.` };
    }

    const written = buildReport({ root, home: this.home, kind, about, wrong, instead, where });
    return { done: written.kind === "written" || written.kind === "already", text: answered(written) };
  }

  call(request: ToolCall): ToolResult {
    if (request.tool !== REPORT_TOOL) return { kind: "unknown-tool", asked: request.tool };
    return { kind: "text", text: this.answer(request.root, request.args).text };
  }
}
