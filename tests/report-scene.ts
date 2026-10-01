import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Capability } from "../src/capability.ts";
import { ageOfOurCode } from "../src/code-age.ts";
import { REPORT_TOOL } from "../src/config.ts";
import { handle } from "../src/mcp.ts";
import { Report } from "../src/report/capability.ts";
import { reportsIn } from "../src/report/store.ts";

export const PRIVATE = `import { acmeBillingGateway } from "@acme/billing-internal";

export async function reconcileTenantLedger(tenantRef: string) {
  try {
    return await acmeBillingGateway.settle(tenantRef, "PROD-TENANT-8842");
  } catch (cause) {
    auditTrail.record(cause);
    return [];
  }
}
`;

export const THEIRS: readonly string[] = [
  "acmeBillingGateway",
  "billing-internal",
  "reconcileTenantLedger",
  "tenantRef",
  "PROD-TENANT-8842",
  "auditTrail",
  "settle",
];

export const A_FAILED_HOOK = {
  kind: "failed",
  about: "PostToolUse",
  wrong: "The hook exited without saying anything and the edit was never judged.",
  instead: "It should have said that the edit was not judged.",
};

export type Scene = { readonly root: string; readonly home: string };

export function scene(): Scene {
  const root = mkdtempSync(join(tmpdir(), "looper-report-tool-"));
  const home = mkdtempSync(join(tmpdir(), "looper-report-home-"));
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src/billing.ts"), PRIVATE);
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "t" }));
  return { root, home };
}

export function strike(held: Scene): void {
  rmSync(held.root, { recursive: true, force: true });
  rmSync(held.home, { recursive: true, force: true });
}

export function resultOf(capabilities: readonly Capability[], root: string, args: unknown): Record<string, unknown> {
  const line = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name: REPORT_TOOL, arguments: args },
  });
  const reply = handle(capabilities, root, line, ageOfOurCode());
  assert.equal(reply.kind, "message");
  if (reply.kind !== "message") throw new Error("unreachable");
  const parsed: unknown = JSON.parse(reply.text);
  assert.ok(parsed !== null && typeof parsed === "object" && "result" in parsed);
  const result: unknown = Object.getOwnPropertyDescriptor(parsed, "result")?.value;
  assert.ok(result !== null && typeof result === "object");
  return { ...result };
}

export function said(held: Scene, args: unknown): string {
  const content = resultOf([new Report(held.home)], held.root, args)["content"];
  assert.ok(Array.isArray(content));
  const text: unknown = Object.getOwnPropertyDescriptor(content[0], "text")?.value;
  assert.equal(typeof text, "string");
  return String(text);
}

export function written(held: Scene): readonly string[] {
  const dir = reportsIn(held.root, held.home);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((name) => name.endsWith(".md"));
}

export function onlyReport(held: Scene): string {
  const files = written(held);
  assert.equal(files.length, 1, `expected one report and found ${files.length}`);
  return readFileSync(join(reportsIn(held.root, held.home), String(files[0])), "utf8");
}
