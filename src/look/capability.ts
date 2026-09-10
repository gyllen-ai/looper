import { LOOK_PRIORITY, LOOK_TOOL } from "../config.ts";
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
import { PROBE, PROBE_NAME } from "../frame/probe.ts";
import { heldIn, newestLook, staleAgainst } from "../frame/store.ts";
import { censusOf } from "./census.ts";
import { tooFaintIn } from "./contrast.ts";
import { disagreements } from "./kinds.ts";
import { NOTHING_CAPTURED, censusLines, contrastLines, disagreementLines } from "./say.ts";

const NO_EVENTS: readonly HookEvent[] = [];

const DRAWN = [".css", ".scss", ".sass", ".html", ".htm", ".razor", ".tsx", ".jsx", ".vue", ".svelte"];

const DESCRIPTION = [
  "Whether everything of one kind wears the same look, everywhere.",
  "",
  "Call with no argument for the standing verdict on every page captured so far.",
  'Ask for the capture script with {"probe":"yes"}: run it in the page, then call',
  `${PROBE_NAME}("<page>", "<state>") and hand back what it printed to the align tool.`,
  "One capture answers both tools.",
  "",
  "A kind is what a thing is and what state it is in: its tag, every class it",
  "carries, and its aria or data state. A heading and a value in the same table",
  "are two kinds and are never compared, so a row of CAPS labels above sentence",
  "case readings is left alone. An active tab and an inactive one are two kinds",
  "as well. But one kind must wear one look: the same lettering, size, weight,",
  "case, colour, padding, gap, border and corners, on every page it appears on.",
  "",
  "It reads every property the page actually set, not a list somebody chose, so",
  "there is nothing it forgets to look at. It also measures contrast on every",
  "piece of text and every painted border against what is really behind it, and",
  "counts how many different values the whole project draws with.",
].join("\n");

function touchesWhatIsDrawn(context: InjectContext): boolean {
  const inHand = context.turn.inHand;
  const paths = inHand.kind === "given" ? inHand.paths : [];
  if (paths.length > 0) return paths.some((path) => DRAWN.some((end) => path.endsWith(end)));
  const held = pathsInHand(context.root);
  if (held.kind !== "paths") return false;
  return held.paths.some((path) => DRAWN.some((end) => path.endsWith(end)));
}

export function standingLook(root: string): readonly string[] {
  const held = heldIn(root);
  if (held.frames.length === 0) return NOTHING_CAPTURED;
  const apart = disagreements(held.frames);
  const told = tooFaintIn(held.frames);
  const spread = censusOf(held.frames);
  const stale = staleAgainst(held.frames, newestLook(root));
  const said: string[] = [
    `looper look: ${held.frames.length} frame(s), ${apart.length} kind(s) that do not agree with themselves, ${told.faint} thing(s) too faint to read.`,
  ];
  said.push(...disagreementLines(apart));
  said.push(...contrastLines(told));
  said.push(...censusLines(spread));
  if (stale.length > 0) {
    said.push("");
    said.push(
      `${stale.length} frame(s) were captured before the last change to what this project draws, so this verdict answers for code that is gone.`,
    );
  }
  return said;
}

export function looksSettled(root: string): boolean {
  const held = heldIn(root);
  if (held.frames.length === 0 || held.unreadable.length > 0) return false;
  if (staleAgainst(held.frames, newestLook(root)).length > 0) return false;
  if (disagreements(held.frames).length > 0) return false;
  return tooFaintIn(held.frames).faint === 0;
}

export class Look implements Capability {
  readonly name = "look";

  inject(context: InjectContext): readonly Injection[] {
    if (!touchesWhatIsDrawn(context)) return SILENT;
    const held = heldIn(context.root);
    if (held.frames.length === 0) return SILENT;
    return [
      {
        source: this.name,
        priority: LOOK_PRIORITY,
        required: false,
        notice: true,
        text: `looper: ${held.frames.length} captured frame(s). One kind wears one look here — same lettering, colour, case, padding and border wherever it appears, and every state is its own kind. Ask the \`look\` tool before and after changing how a page is drawn.`,
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
        name: LOOK_TOOL,
        description: DESCRIPTION,
        inputSchema: {
          type: "object",
          properties: {
            probe: { type: "string", description: "any value: hand back the capture script" },
          },
        },
      },
    ];
  }

  call(request: ToolCall): ToolResult {
    if (request.tool !== LOOK_TOOL) return { kind: "unknown-tool", asked: request.tool };
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
          "Hand the string it returns to the align tool as {\"frame\": \"...\"}; both tools read it.",
        ].join("\n"),
      };
    }
    return { kind: "text", text: standingLook(request.root).join("\n") };
  }
}
