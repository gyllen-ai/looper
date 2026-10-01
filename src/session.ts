import type { Out } from "./out.ts";
import { allocate, type Allocation, type Weighed } from "./allocator.ts";
import { DEV, INJECTION_BUDGET, namedProject, projectRoot, searchPath, whereTheUserLives, type Invocation } from "./config.ts";
import { NO_TURN, type Turn } from "./capability.ts";
import { NEVER_SAID, SaidInSession, troubleWith, type Said } from "./said.ts";
import { NO_SESSION_EVER, lastRun, noteRun, sayWhenHooksRan, worthSayingAtCommit } from "./seen.ts";
import { dispatchHook, registry } from "./registry.ts";
import { reasonFrom } from "./fields.ts";

export function here(): string {
  return projectRoot(process.cwd(), namedProject()).root;
}

export function remember(event: string, out: Out): void {
  const home = whereTheUserLives();
  const root = here();
  const startedIn = whereTheAgentStarted();
  if (worthSayingAtCommit(event, startedIn, lastRun(root, home))) out.warn(NO_SESSION_EVER);
  try {
    noteRun(root, home, { event, startedIn, at: new Date().toISOString() });
  } catch (cause) {
    const detail = reasonFrom(cause);
    out.warn(`looper: could not record that this hook ran (${detail}); continuing`);
  }
}

function saidFor(root: string, turn: Turn): Said {
  if (turn.session.kind === "unknown") return NEVER_SAID;
  return { kind: "session", store: new SaidInSession(root, whereTheUserLives(), turn.session.id) };
}

export function currentAllocation(out: Out): Allocation {
  return allocationFor(out, NO_TURN);
}

export function allocationFor(out: Out, turn: Turn): Allocation {
  const root = here();
  const said = saidFor(root, turn);
  const trouble = troubleWith(said);
  if (trouble.length > 0) {
    out.warn(`looper: what this session was already told could not be read (${trouble}); notices will repeat`);
  }
  const run = allocate(registry(), {
    root,
    budget: INJECTION_BUDGET,
    turn,
    said,
  });
  for (const complaint of run.complaints) {
    out.warn(
      `looper: ${complaint.capability} could not contribute (${complaint.detail}); continuing without it`,
    );
  }
  for (const why of run.unrecorded) {
    out.warn(`looper: what this session was told could not be recorded (${why}); notices will repeat`);
  }
  return run.allocation;
}

export function whereTheAgentStarted(): string {
  const named = namedProject();
  if (named.kind === "none") return "";
  return named.root;
}
