import { ALIGN_PRIORITY, ALIGN_TOOL } from "../config.ts";
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
import { pathsInHand } from "../git.ts";
import { driftAcross } from "./across.ts";
import { readFrame } from "../frame/frame.ts";
import { judgeFrame, unmoved } from "./judge.ts";
import { PROBE, PROBE_NAME } from "../frame/probe.ts";
import { forget, heldIn, keep, newestLook, staleAgainst } from "../frame/store.ts";
import {
  NOTHING_CAPTURED,
  detailOf,
  driftLines,
  staleLines,
  summaryOf,
  unmovedLines,
  unreadableLines,
} from "./say.ts";

const NO_EVENTS: readonly HookEvent[] = [];

const DRAWN = [".css", ".scss", ".sass", ".html", ".htm", ".razor", ".tsx", ".jsx", ".vue", ".svelte"];

const DESCRIPTION = [
  "Whether every line a person can see on a page runs into another one.",
  "",
  "Call with no argument for the standing verdict on every page captured so far.",
  'Ask for the capture script with {"probe":"yes"}: run it in the page, then call',
  `${PROBE_NAME}("<page>", "<state>") and hand back what it printed as {"frame":"..."}.`,
  'Drop a page with {"forget":"<page>"}.',
  "",
  "It reads geometry, never pixels: for every element, the box edges that are",
  "actually painted, and the rectangle of what it actually draws. A div with no",
  "background has no lines. A chevron with no background is judged by the middle",
  "of the mark, which is the line a person's eye follows, not by the box around it.",
  "",
  "A line is connected when another element on the page sits on the same line. A",
  "line a few pixels off one is reported harder than a line standing alone, because",
  "that is the one that makes a screen look broken rather than deliberate.",
  "",
  "One state is half a page. Capture the accordion open and closed, the menu up and",
  "down, the tab selected and not, each as its own state name.",
  "",
  "Frames of the same width are also compared with each other: a column that many",
  "marks stand on in one page and stands a few pixels away in another is reported,",
  "which is the tab whose cards start in a different place from the tab beside it.",
].join("\n");

function touchesWhatIsDrawn(context: InjectContext): boolean {
  const inHand = context.turn.inHand;
  const paths = inHand.kind === "given" ? inHand.paths : [];
  if (paths.length > 0) return paths.some((path) => DRAWN.some((end) => path.endsWith(end)));
  const held = pathsInHand(context.root);
  if (held.kind !== "paths") return false;
  return held.paths.some((path) => DRAWN.some((end) => path.endsWith(end)));
}

export function standingVerdict(root: string): readonly string[] {
  const held = heldIn(root);
  if (held.frames.length === 0 && held.unreadable.length === 0) return NOTHING_CAPTURED;
  const verdicts = held.frames.map(judgeFrame);
  const broken = verdicts.filter((one) => one.alone.length > 0);
  const stale = staleAgainst(held.frames, newestLook(root));
  const never = unmoved(held.frames);
  const drift = driftAcross(held.frames);
  const said: string[] = [
    `looper align: ${held.frames.length} frame(s), ${broken.length} with a line that connects to nothing, ${drift.length} column(s) that move between pages.`,
    "",
    ...verdicts.map(summaryOf),
  ];
  for (const verdict of verdicts) said.push(...detailOf(verdict));
  said.push(...driftLines(drift));
  said.push(...staleLines(stale));
  said.push(...unmovedLines(never));
  said.push(...unreadableLines(held.unreadable));
  return said;
}

export function isSettled(root: string): boolean {
  const held = heldIn(root);
  if (held.frames.length === 0 || held.unreadable.length > 0) return false;
  if (staleAgainst(held.frames, newestLook(root)).length > 0) return false;
  if (driftAcross(held.frames).length > 0) return false;
  return held.frames.every((frame) => judgeFrame(frame).alone.length === 0);
}

export class Align implements Capability {
  readonly name = "align";

  inject(context: InjectContext): readonly Injection[] {
    if (!touchesWhatIsDrawn(context)) return SILENT;
    const held = heldIn(context.root);
    const text =
      held.frames.length === 0
        ? `looper: no page of this project has ever been captured, so nothing is known about whether its lines connect. Every visible edge is meant to run into another one, in every state a control has. Ask the \`align\` tool for the probe.`
        : `looper: ${held.frames.length} captured frame(s) of this project. A line that connects to nothing is a defect here, in every state a control has. Ask the \`align\` tool before and after changing what a page draws.`;
    return [
      {
        source: this.name,
        priority: ALIGN_PRIORITY,
        required: false,
        notice: true,
        text,
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
        name: ALIGN_TOOL,
        description: DESCRIPTION,
        inputSchema: {
          type: "object",
          properties: {
            probe: { type: "string", description: "any value: hand back the capture script" },
            frame: { type: "string", description: "what the capture script printed" },
            forget: { type: "string", description: "drop every frame of this page" },
          },
        },
      },
    ];
  }

  call(request: ToolCall): ToolResult {
    if (request.tool !== ALIGN_TOOL) return { kind: "unknown-tool", asked: request.tool };

    if (request.args.get("probe") !== undefined) {
      return {
        kind: "text",
        text: [
          "Run this in the page, then call it with a page name and a state name:",
          "",
          PROBE,
          "",
          `Then: ${PROBE_NAME}("console", "default")`,
          "",
          "Hand the string it returns straight back to this tool as {\"frame\": \"...\"}.",
          "Capture one frame per state: a menu open and closed are two frames of one page.",
        ].join("\n"),
      };
    }

    const dropping = request.args.get("forget");
    if (dropping !== undefined) {
      const gone = forget(request.root, dropping);
      return {
        kind: "text",
        text:
          gone.length === 0
            ? `no frames of "${dropping}" were held.`
            : `dropped ${gone.length}: ${gone.join(", ")}`,
      };
    }

    const source = request.args.get("frame");
    if (source === undefined) return { kind: "text", text: standingVerdict(request.root).join("\n") };

    const reading = readFrame(source);
    if (reading.kind === "unreadable") {
      return {
        kind: "text",
        text: `looper could not read that frame: ${reading.why}. Nothing was stored. Ask for the probe again and hand back exactly what it printed.`,
      };
    }
    const path = keep(request.root, reading.frame, source);
    const verdict = judgeFrame(reading.frame);
    return {
      kind: "text",
      text: [
        `kept ${path}`,
        "",
        summaryOf(verdict).trim(),
        ...detailOf(verdict),
      ].join("\n"),
    };
  }
}
