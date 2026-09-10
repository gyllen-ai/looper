import { fieldAt } from "../fields.ts";

export type Look = ReadonlyMap<string, string>;

export const OBSERVED_CASE = "-looper-text-case";

export const OBSERVED_BEHIND = "-looper-behind";

export const OBSERVED_MOVING = "-looper-moving";

export function looseLookAt(raw: unknown, key: string): Look | string {
  const held = fieldAt(raw, key);
  if (held === null || typeof held !== "object") return `the frame has no "${key}" values`;
  const found = new Map<string, string>();
  for (const property of Object.keys(held)) {
    const value = fieldAt(held, property);
    if (typeof value !== "string") return `the frame has a "${property}" that is not a value`;
    found.set(property, value);
  }
  return found;
}

export function lookAt(raw: unknown, where: string): Look | string {
  const held = fieldAt(raw, "look");
  if (held === null || typeof held !== "object") return `${where} has no "look"`;
  const found = new Map<string, string>();
  for (const property of Object.keys(held)) {
    const value = fieldAt(held, property);
    if (typeof value !== "string") return `${where} has a "${property}" that is not a value`;
    found.set(property, value);
  }
  return found;
}

export function propertiesIn(looks: readonly Look[]): readonly string[] {
  const found = new Set<string>();
  for (const look of looks) {
    for (const property of look.keys()) found.add(property);
  }
  return [...found].sort();
}

const UNSET = "unset";

export function wornOn(look: Look, property: string): string {
  const held = look.get(property);
  return held === undefined ? UNSET : held;
}

export function wornWith(look: Look, asShipped: Look, property: string): string {
  const held = look.get(property);
  if (held !== undefined) return held;
  const shipped = asShipped.get(property);
  return shipped === undefined ? UNSET : shipped;
}

export function isUnset(value: string): boolean {
  return value === UNSET;
}
