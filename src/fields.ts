export function fieldAt(value: unknown, key: string): unknown {
  if (value === null || typeof value !== "object") return undefined;
  return Object.getOwnPropertyDescriptor(value, key)?.value;
}

export function textAt(value: unknown, key: string): unknown {
  const held = fieldAt(value, key);
  return typeof held === "string" ? held : undefined;
}

export function isTyped(value: unknown, type: string): boolean {
  return fieldAt(value, "type") === type;
}

export function reasonFrom(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function endedWith(cause: unknown): string | undefined {
  const signal = fieldAt(cause, "signal");
  if (typeof signal === "string") return `was stopped by ${signal}`;
  const status = fieldAt(cause, "status");
  if (typeof status === "number") return `exited with status ${status}`;
  return undefined;
}

function tailOf(text: string, upTo: number): string {
  return text.length > upTo ? `…${text.slice(-upTo)}` : text;
}

export function saidBy(cause: unknown, upTo: number): string {
  const parts: string[] = [];
  for (const stream of ["stderr", "stdout"]) {
    const held = fieldAt(cause, stream);
    if (typeof held === "string" && held.trim().length > 0) parts.push(held.trim());
  }
  return tailOf(parts.join("\n"), upTo);
}

export function failureOf(cause: unknown, upTo: number): string {
  const ended = endedWith(cause);
  if (ended === undefined) return `could not be started (${reasonFrom(cause)})`;
  const said = saidBy(cause, upTo);
  return said.length === 0 ? `${ended} and said nothing` : `${ended} saying: ${said}`;
}
