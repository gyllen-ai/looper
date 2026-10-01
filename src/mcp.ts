import {
  JSONRPC_VERSION,
  MCP_PROTOCOL_VERSION,
  SERVER_NAME,
  SERVER_VERSION,
} from "./config.ts";
import type { Capability, ToolResult } from "./capability.ts";
import { ageOfOurCode, agingSaid, type Age } from "./code-age.ts";
import { reasonFrom } from "./fields.ts";
import { A_FAULT_IN_LOOPER } from "./report/say.ts";

export type Request = {
  readonly id: string | number | null;
  readonly method: string;
  readonly args: ReadonlyMap<string, string>;
  readonly toolName: string | null;
};

export type Reply =
  | { readonly kind: "none" }
  | { readonly kind: "message"; readonly text: string }
  | { readonly kind: "unreadable"; readonly detail: string };

export type Incoming =
  | { readonly kind: "request"; readonly request: Request }
  | { readonly kind: "unreadable"; readonly detail: string };

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  return { ...value };
}

function stringArgs(value: unknown): ReadonlyMap<string, string> {
  const found = new Map<string, string>();
  const record = asRecord(value);
  if (record === null) return found;
  for (const [key, held] of Object.entries(record)) {
    if (typeof held === "string") found.set(key, held);
    if (typeof held === "number") found.set(key, String(held));
  }
  return found;
}

export function parseRequest(line: string): Incoming {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch (cause) {
    const detail = reasonFrom(cause);
    return { kind: "unreadable", detail };
  }
  const record = asRecord(parsed);
  if (record === null) {
    return { kind: "unreadable", detail: "a message must be a JSON object" };
  }
  const method = record["method"];
  if (typeof method !== "string") {
    return { kind: "unreadable", detail: "a message must name a method" };
  }

  const rawId = record["id"];
  const id =
    typeof rawId === "string" || typeof rawId === "number" ? rawId : null;

  const params = asRecord(record["params"]);
  const rawName = params === null ? undefined : params["name"];
  const toolName = typeof rawName === "string" ? rawName : null;
  const args = params === null ? stringArgs(null) : stringArgs(params["arguments"]);

  return { kind: "request", request: { id, method, args, toolName } };
}

function envelope(id: string | number, result: unknown): string {
  return JSON.stringify({ jsonrpc: JSONRPC_VERSION, id, result });
}

function failure(id: string | number, code: number, message: string): string {
  return JSON.stringify({
    jsonrpc: JSONRPC_VERSION,
    id,
    error: { code, message },
  });
}

function toolList(capabilities: readonly Capability[]): unknown {
  const tools = [];
  for (const capability of capabilities) {
    for (const tool of capability.tools()) {
      tools.push({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      });
    }
  }
  return { tools };
}

function content(result: ToolResult, aging: string): unknown {
  if (result.kind === "unknown-tool") {
    return {
      content: [
        { type: "text", text: `${aging}${aging === "" ? "" : "\n\n"}looper has no tool called "${result.asked}".` },
      ],
      isError: true,
    };
  }
  if (result.kind === "shown") {
    return {
      content: [
        { type: "text", text: `${aging}${aging === "" ? "" : "\n\n"}${result.said}` },
        ...result.images.map((held) => ({
          type: "image",
          data: held.base64,
          mimeType: held.media,
        })),
      ],
    };
  }
  return { content: [{ type: "text", text: `${aging}${aging === "" ? "" : "\n\n"}${result.text}` }] };
}

function invoke(
  capabilities: readonly Capability[],
  root: string,
  request: Request,
  loaded: Age,
): unknown {
  const asked = request.toolName;
  if (asked === null) {
    return {
      content: [{ type: "text", text: "a tool call needs a name." }],
      isError: true,
    };
  }
  for (const capability of capabilities) {
    if (!capability.tools().some((tool) => tool.name === asked)) continue;
    try {
      return content(capability.call({ root, tool: asked, args: request.args }), agingSaid(loaded));
    } catch (cause) {
      return {
        content: [
          {
            type: "text",
            text: `looper's ${asked} tool failed (${reasonFrom(cause)}), so it did nothing. ${A_FAULT_IN_LOOPER}`,
          },
        ],
        isError: true,
      };
    }
  }
  return content({ kind: "unknown-tool", asked }, agingSaid(loaded));
}

export function respond(
  capabilities: readonly Capability[],
  root: string,
  request: Request,
  loaded: Age,
): Reply {
  const id = request.id;
  if (id === null) return { kind: "none" };

  if (request.method === "initialize") {
    return {
      kind: "message",
      text: envelope(id, {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      }),
    };
  }
  if (request.method === "ping") return { kind: "message", text: envelope(id, {}) };
  if (request.method === "tools/list") {
    return { kind: "message", text: envelope(id, toolList(capabilities)) };
  }
  if (request.method === "tools/call") {
    return { kind: "message", text: envelope(id, invoke(capabilities, root, request, loaded)) };
  }
  return {
    kind: "message",
    text: failure(id, -32601, `looper does not answer ${request.method}`),
  };
}

export function handle(
  capabilities: readonly Capability[],
  root: string,
  line: string,
  loaded: Age,
): Reply {
  const incoming = parseRequest(line);
  if (incoming.kind === "unreadable") {
    return { kind: "unreadable", detail: incoming.detail };
  }
  return respond(capabilities, root, incoming.request, loaded);
}
