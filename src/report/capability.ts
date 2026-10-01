import { RELEASE_TOOL, REPORT_PRIORITY, REPORT_TOOL } from "../config.ts";
import { SILENT } from "../capability.ts";
import type {
  Capability,
  Client,
  HookEvent,
  InjectContext,
  Injection,
  Outcome,
  ToolCall,
  ToolDef,
  ToolResult,
} from "../capability.ts";
import { looperRoot } from "../law/readers.ts";
import { homeOf } from "./origin.ts";
import { SAID_NEVER, offerIn, release, unclearSaid } from "./release.ts";
import { A_FAULT_IN_LOOPER } from "./say.ts";
import { decide, heldIn, type Held, type State } from "./store.ts";
import { buildReport, type Leak, type Where, type Written } from "./write.ts";

export { asksAPerson } from "./release.ts";

export const THE_LINE = `looper: looper can be wrong. A rule that fires on code that is fine or misses code that is not, a check that fails, an answer that is untrue, something it should do and does not: say so with the \`${REPORT_TOOL}\` tool. It writes a file on this machine and sends nothing; only the person can let it leave.`;

const A_TITLE_IN_THE_LINE = 80;

function unanswered(waiting: readonly Held[]): string {
  const [first, ...rest] = waiting;
  if (first === undefined) return THE_LINE;
  const title = first.title.length > A_TITLE_IN_THE_LINE ? `${first.title.slice(0, A_TITLE_IN_THE_LINE)}…` : first.title;
  const more = rest.length === 0 ? "" : `, and ${rest.length} more`;
  return `looper: a report about looper was written here on ${first.on} and nobody has said whether it may leave: ${title}${more}. Show it to the person (the \`${REPORT_TOOL}\` tool lists it), then ask the \`${RELEASE_TOOL}\` tool.`;
}

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

const RELEASE_DESCRIPTION = [
  "Let one report about looper leave this machine. It becomes a public page at looper's",
  "makers, under the person's own name, and nothing of their project is in it.",
  "",
  'Call it with {"id":"...","title":"..."} after showing the person the report, with the',
  "title exactly as looper wrote it. The person is asked every time and answers for",
  "themselves: it is not yours to answer. On a yes looper says where its makers are. On a",
  `no, tell the \`${REPORT_TOOL}\` tool {"kept":"<id>"} so nobody is asked again.`,
].join("\n");

const WRITTEN_WITH: readonly string[] = ["kind", "about", "wrong", "instead"];

const WHAT_BECAME_OF_IT: Readonly<Record<State, string>> = {
  written: "nobody has said whether to send it",
  released: "the person said it may leave",
  sent: "sent",
  kept: "kept here",
};

export type Asker = "agent" | "person";

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

function whatNext(root: string, asker: Asker, id: string, title: string): string {
  if (offerIn(root).kind === "never") {
    return `It stays on this machine: ${SAID_NEVER}.`;
  }
  if (asker === "person") {
    const home = homeOf(looperRoot());
    const where = home.kind === "named" ? ` Its makers are at ${home.address}.` : "";
    return `Whether it goes any further is yours to decide.${where}`;
  }
  return [
    `Show the person the report above, as it is. Then ask whether it may leave: the \`${RELEASE_TOOL}\` tool with {"id":"${id}","title":${JSON.stringify(title)}}.`,
    `The person is asked directly, every time, so the yes is theirs and not yours to give. If they say no, tell looper: {"kept":"${id}"}.`,
  ].join(" ");
}

function answered(root: string, asker: Asker, written: Written): string {
  if (written.kind === "written") {
    return [
      `Written: ${written.path}`,
      ``,
      written.body,
      `Nothing was sent, and looper cannot send it.`,
      ...glance(written.notOurs),
      whatNext(root, asker, written.id, written.title),
    ].join("\n");
  }
  if (written.kind === "already") {
    return `This was already written here on ${written.held.on}, and ${WHAT_BECAME_OF_IT[written.held.state]}: ${written.path}. Nothing new was written.`;
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

  private said(root: string): string {
    const held = heldIn(root, this.home);
    if (held.kind === "unreadable") {
      return `looper: what was written here about looper could not be read (${held.why}). ${A_FAULT_IN_LOOPER}`;
    }
    return unanswered(held.held.filter((one) => one.state === "written"));
  }

  inject(context: InjectContext): readonly Injection[] {
    if (context.turn.session.kind === "unknown") return SILENT;
    const offer = offerIn(context.root);
    if (offer.kind === "never") return SILENT;
    return [
      {
        source: this.name,
        priority: REPORT_PRIORITY,
        required: false,
        notice: true,
        waits: true,
        text: offer.kind === "unclear" ? unclearSaid(offer.said) : this.said(context.root),
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
      {
        name: RELEASE_TOOL,
        description: RELEASE_DESCRIPTION,
        asksThePerson: true,
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "string", description: "the id of the report" },
            title: { type: "string", description: "the report's title, exactly as looper wrote it" },
          },
          required: ["id", "title"],
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

  answer(root: string, args: ReadonlyMap<string, string>, asker: Asker): Reply {
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
    return {
      done: written.kind === "written" || written.kind === "already",
      text: answered(root, asker, written),
    };
  }

  private released(root: string, args: ReadonlyMap<string, string>, client: Client): string {
    const id = args.get("id");
    const title = args.get("title");
    if (id === undefined || title === undefined) {
      return "looper released nothing: releasing a report needs its id and its title, exactly as looper wrote them.";
    }
    const outcome = release({ root, home: this.home, id, title, client });
    if (outcome.kind === "refused") return `looper released nothing: ${outcome.why}.`;
    return [
      `The person said yes: ${outcome.id} may leave this machine.`,
      ``,
      `Send the text below as an issue at ${outcome.address}, titled:`,
      `  ${outcome.title}`,
      `Send it as it is, with nothing added and nothing changed, using whatever you already use for that. If the same fault is already written up there, add this to it instead of opening another.`,
      `Then tell looper it went: the \`${REPORT_TOOL}\` tool with {"sent":"${outcome.id}"}.`,
      ``,
      outcome.body,
    ].join("\n");
  }

  call(request: ToolCall): ToolResult {
    if (request.tool === RELEASE_TOOL) {
      return { kind: "text", text: this.released(request.root, request.args, request.client) };
    }
    if (request.tool !== REPORT_TOOL) return { kind: "unknown-tool", asked: request.tool };
    return { kind: "text", text: this.answer(request.root, request.args, "agent").text };
  }
}
