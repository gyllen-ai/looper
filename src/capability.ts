import type { Said } from "./said.ts";

export type HookEvent =
  | "PostToolUse"
  | "PreToolUse"
  | "Stop"
  | "PreCommit"
  | "CommitMessage";

export type Payload =
  | { readonly kind: "none" }
  | { readonly kind: "text"; readonly text: string };

export type Injection = {
  readonly source: string;
  readonly priority: number;
  readonly text: string;
  readonly required: boolean;
  readonly notice: boolean;
  readonly waits?: boolean;
  readonly summary?: string;
};

export type InHand =
  | { readonly kind: "from-git" }
  | { readonly kind: "given"; readonly paths: readonly string[] };

export type Session =
  | { readonly kind: "known"; readonly id: string }
  | { readonly kind: "unknown" };

export type Turn = {
  readonly session: Session;
  readonly prompt: string;
  readonly inHand: InHand;
};

export const NO_TURN: Turn = {
  session: { kind: "unknown" },
  prompt: "",
  inHand: { kind: "from-git" },
};

export type Outcome =
  | { readonly kind: "pass" }
  | { readonly kind: "mention"; readonly note: string }
  | { readonly kind: "block"; readonly reason: string };

export type InjectContext = {
  readonly root: string;
  readonly budget: number;
  readonly turn: Turn;
  readonly said: Said;
};

export type HookContext = {
  readonly root: string;
  readonly event: HookEvent;
  readonly payload: Payload;
};

export type ToolDef = {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: unknown;
  readonly asksThePerson?: boolean;
};

export type Client =
  | { readonly kind: "unknown" }
  | { readonly kind: "named"; readonly name: string; readonly version: string };

export const NOBODY_KNOWN: Client = { kind: "unknown" };

export type Shown = { readonly media: string; readonly base64: string };

export type ToolResult =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "shown"; readonly said: string; readonly images: readonly Shown[] }
  | { readonly kind: "unknown-tool"; readonly asked: string };

export type ToolCall = {
  readonly root: string;
  readonly tool: string;
  readonly args: ReadonlyMap<string, string>;
  readonly client: Client;
};

export interface Capability {
  readonly name: string;
  inject(context: InjectContext): readonly Injection[];
  hooks(): readonly HookEvent[];
  onHook(context: HookContext): Outcome;
  tools(): readonly ToolDef[];
  call(request: ToolCall): ToolResult;
}

export const SILENT: readonly Injection[] = [];

export function isHookEvent(name: string): name is HookEvent {
  return (
    name === "PostToolUse" ||
    name === "PreToolUse" ||
    name === "Stop" ||
    name === "PreCommit" ||
    name === "CommitMessage"
  );
}
