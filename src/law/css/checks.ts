import type { Check } from "../engine.ts";
import { inlineStyleCheck } from "./inline-style.ts";
import { literalColourCheck } from "./literal-colour.ts";
import { negativeMarginCheck } from "./negative-margin.ts";
import { cascadeOverruledCheck } from "./override.ts";
import { stackingWarCheck } from "./stacking-war.ts";

export const CSS_CHECKS: readonly Check[] = [
  inlineStyleCheck,
  literalColourCheck,
  stackingWarCheck,
  negativeMarginCheck,
  cascadeOverruledCheck,
];
