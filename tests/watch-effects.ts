import childProcess from "node:child_process";
import dgram from "node:dgram";
import dns from "node:dns";
import { syncBuiltinESMExports } from "node:module";
import net from "node:net";

const seen: string[] = [];

const STARTERS: readonly string[] = ["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork"];

const ASKS_FOR_AN_ADDRESS: readonly string[] = ["lookup", "resolve", "resolve4", "resolve6", "resolveAny"];

function said(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

function watching(owner: object, name: string, what: string): void {
  const real: unknown = Reflect.get(owner, name);
  if (typeof real !== "function") return;
  Reflect.set(owner, name, function watched(this: unknown, ...args: readonly unknown[]): unknown {
    seen.push(`${what} ${said(args[0])}`);
    return Reflect.apply(real, this, args);
  });
}

watching(net.Socket.prototype, "connect", "connect");
watching(net.Server.prototype, "listen", "listen");
for (const name of ["send", "connect", "bind"]) watching(dgram.Socket.prototype, name, "datagram");
for (const name of ASKS_FOR_AN_ADDRESS) {
  watching(dns, name, "lookup");
  watching(dns.promises, name, "lookup");
}
for (const name of STARTERS) watching(childProcess, name, "start");
watching(globalThis, "fetch", "fetch");
syncBuiltinESMExports();

process.on("exit", () => {
  process.stderr.write(`EFFECTS ${JSON.stringify(seen)}\n`);
});
