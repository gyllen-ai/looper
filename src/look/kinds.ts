import type { Frame, Mark } from "../frame/frame.ts";
import {
  OBSERVED_BEHIND,
  OBSERVED_MOVING,
  isUnset,
  propertiesIn,
  wornOn,
  wornWith,
  type Look,
} from "../frame/look.ts";

export type Wearer = {
  readonly frame: string;
  readonly at: string;
  readonly top: number;
};

export type Worn = {
  readonly value: string;
  readonly wearers: readonly Wearer[];
};

export type Split = {
  readonly property: string;
  readonly most: Worn;
  readonly others: readonly Worn[];
};

export type Disagreement = {
  readonly kind: string;
  readonly width: number;
  readonly wearers: number;
  readonly splits: readonly Split[];
};

type Held = {
  readonly mark: Mark;
  readonly frame: string;
  readonly width: number;
  readonly asShipped: Look;
};

const NOT_A_LOOK: readonly string[] = [OBSERVED_BEHIND, OBSERVED_MOVING];

function isMoving(mark: Mark): boolean {
  return wornOn(mark.look, OBSERVED_MOVING) === "yes";
}

export function heldByKind(frames: readonly Frame[]): ReadonlyMap<string, readonly Held[]> {
  const found = new Map<string, Held[]>();
  for (const frame of frames) {
    const name = `${frame.page} · ${frame.state}`;
    for (const mark of frame.marks) {
      if (isMoving(mark)) continue;
      const one: Held = { mark, frame: name, width: frame.width, asShipped: frame.asShipped };
      const at = `${frame.width} ${mark.kind}`;
      const held = found.get(at);
      if (held === undefined) found.set(at, [one]);
      else held.push(one);
    }
  }
  return found;
}

const AN_OBSERVED_FACT = "-looper-";

function wornFor(held: readonly Held[], property: string): readonly Worn[] {
  const observed = property.startsWith(AN_OBSERVED_FACT);
  const byValue = new Map<string, Wearer[]>();
  for (const one of held) {
    const value = wornWith(one.mark.look, one.asShipped, property);
    if (observed && isUnset(value)) continue;
    const wearers = byValue.get(value);
    const wearer: Wearer = { frame: one.frame, at: one.mark.at, top: one.mark.box.top };
    if (wearers === undefined) byValue.set(value, [wearer]);
    else wearers.push(wearer);
  }
  const found: Worn[] = [];
  for (const [value, wearers] of byValue) found.push({ value, wearers });
  return found.sort((one, two) => two.wearers.length - one.wearers.length);
}

function alternates(held: readonly Held[], property: string): boolean {
  const byFrame = new Map<string, Held[]>();
  for (const one of held) {
    const kept = byFrame.get(one.frame);
    if (kept === undefined) byFrame.set(one.frame, [one]);
    else kept.push(one);
  }
  for (const inFrame of byFrame.values()) {
    if (inFrame.length < 4) continue;
    const down = [...inFrame].sort((one, two) => one.mark.box.top - two.mark.box.top);
    let striped = true;
    for (let index = 2; index < down.length; index += 1) {
      const here = down[index];
      const before = down[index - 1];
      const twoBack = down[index - 2];
      if (here === undefined || before === undefined || twoBack === undefined) continue;
      const mine = wornWith(here.mark.look, here.asShipped, property);
      const same = mine === wornWith(twoBack.mark.look, twoBack.asShipped, property);
      const differs = mine !== wornWith(before.mark.look, before.asShipped, property);
      if (!same || !differs) striped = false;
    }
    if (striped) return true;
  }
  return false;
}

export function disagreements(frames: readonly Frame[]): readonly Disagreement[] {
  const found: Disagreement[] = [];
  for (const held of heldByKind(frames).values()) {
    const first = held[0];
    if (held.length < 2 || first === undefined) continue;
    const looks: Look[] = held.map((one) => one.mark.look);
    const splits: Split[] = [];
    for (const property of propertiesIn(looks)) {
      if (NOT_A_LOOK.includes(property)) continue;
      const worn = wornFor(held, property);
      if (worn.length < 2) continue;
      if (worn.length === 2 && alternates(held, property)) continue;
      const most = worn[0];
      if (most === undefined) continue;
      splits.push({ property, most, others: worn.slice(1) });
    }
    if (splits.length === 0) continue;
    found.push({
      kind: first.mark.kind,
      width: first.width,
      wearers: held.length,
      splits,
    });
  }
  return found.sort((one, two) => two.splits.length - one.splits.length);
}
