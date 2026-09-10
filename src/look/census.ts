import type { Frame } from "../frame/frame.ts";
import { OBSERVED_BEHIND, OBSERVED_MOVING, propertiesIn, wornWith, isUnset } from "../frame/look.ts";

export type Spread = {
  readonly property: string;
  readonly values: number;
  readonly onceOnly: readonly string[];
};

const NOT_A_CHOICE: readonly string[] = [
  OBSERVED_BEHIND,
  OBSERVED_MOVING,
  "position",
  "display",
  "box-sizing",
];

export function censusOf(frames: readonly Frame[]): readonly Spread[] {
  const held = frames.flatMap((frame) =>
    frame.marks.map((mark) => ({ look: mark.look, asShipped: frame.asShipped })),
  );
  const looks = held.map((one) => one.look);
  const found: Spread[] = [];
  for (const property of propertiesIn(looks)) {
    if (NOT_A_CHOICE.includes(property)) continue;
    const counts = new Map<string, number>();
    for (const one of held) {
      const value = wornWith(one.look, one.asShipped, property);
      if (isUnset(value)) continue;
      const held = counts.get(value);
      counts.set(value, held === undefined ? 1 : held + 1);
    }
    if (counts.size < 2) continue;
    const onceOnly: string[] = [];
    for (const [value, seen] of counts) {
      if (seen === 1) onceOnly.push(value);
    }
    found.push({ property, values: counts.size, onceOnly: onceOnly.sort() });
  }
  return found.sort((one, two) => two.values - one.values);
}
