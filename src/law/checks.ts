import { anonymousProvenanceCheck } from "./ts/anonymous-provenance.ts";
import { builtQueryCheck } from "./data/injection.ts";
import { uncheckedInputCheck } from "./data/unchecked-input.ts";
import { clientSecretCheck } from "./next/client-secret.ts";
import { builtCommandCheck } from "./node/command.ts";
import { conditionalHookCheck } from "./react/hooks.ts";
import { lyingDependenciesCheck } from "./react/effect-deps.ts";
import { commentCheck } from "./ts/comment.ts";
import { disposeWorkCheck } from "./ts/dispose.ts";
import { droppedPromisesCheck } from "./ts/dropped-promises.ts";
import { hiddenDependencyCheck } from "./ts/hidden-dependency.ts";
import { nothingReturnedCheck } from "./ts/nothing-returned.ts";
import { silentMangleCheck } from "./ts/silent-mangle.ts";
import { unfinishedCheck } from "./ts/unfinished.ts";
import { writtenAnyCheck } from "./ts/written-any.ts";
import { defeatedCheckingCheck } from "./ts/defeated-checking.ts";
import { fileLengthCheck } from "./ts/file-length.ts";
import { floatingPromiseCheck } from "./ts/floating-promise.ts";
import { outsideWorldCheck } from "./ts/outside-world.ts";
import { strayPrintCheck } from "./ts/stray-print.ts";
import { valueInMessageCheck } from "./ts/value-in-message.ts";
import { bornDefaultCheck } from "./ts/born-default.ts";
import { stubValueCheck } from "./ts/stub-value.ts";
import { unreadableFileCheck } from "./ts/unreadable.ts";
import { conjuredCodeCheck } from "./ts/conjured-code.ts";
import { codeColourCheck } from "./ts/code-colour.ts";
import { inlineStyleCheck } from "./ts/inline-style.ts";
import { guessedWaitCheck } from "./ts/guessed-wait.ts";
import { rewrappedFailureCheck } from "./ts/rewrapped-failure.ts";
import { roundTripCopyCheck } from "./ts/round-trip-copy.ts";
import { CSS_CHECKS } from "./css/checks.ts";
import { RUST_RULES } from "./rust/rules.ts";
import { PYTHON_RULES } from "./python/rules.ts";
import { CSHARP_RULES } from "./csharp/rules.ts";
import { UNDECLARED_LANGUAGE } from "./stack.ts";
import { VARIANT_FILE } from "./copy.ts";
import { CROSSED_BOUNDARY } from "./rust/boundary.ts";
import { suppressionCheck } from "./ts/suppression.ts";
import { vanishedErrorCheck } from "./ts/vanished-error.ts";
import type { Check } from "./engine.ts";

export const CHECKS: readonly Check[] = [
  bornDefaultCheck,
  unreadableFileCheck,
  stubValueCheck,
  vanishedErrorCheck,
  defeatedCheckingCheck,
  suppressionCheck,
  outsideWorldCheck,
  strayPrintCheck,
  valueInMessageCheck,
  commentCheck,
  fileLengthCheck,
  anonymousProvenanceCheck,
  writtenAnyCheck,
  droppedPromisesCheck,
  hiddenDependencyCheck,
  silentMangleCheck,
  nothingReturnedCheck,
  unfinishedCheck,
  floatingPromiseCheck,
  disposeWorkCheck,
  conditionalHookCheck,
  lyingDependenciesCheck,
  builtQueryCheck,
  builtCommandCheck,
  clientSecretCheck,
  uncheckedInputCheck,
  conjuredCodeCheck,
  codeColourCheck,
  inlineStyleCheck,
  guessedWaitCheck,
  rewrappedFailureCheck,
  roundTripCopyCheck,
];

export function knownRuleIds(): readonly string[] {
  return [
    ...CHECKS.map((held) => held.rule.id),
    ...CSS_CHECKS.map((held) => held.rule.id),
    ...RUST_RULES.map((held) => held.id),
    ...PYTHON_RULES.map((held) => held.id),
    ...CSHARP_RULES.map((held) => held.id),
    UNDECLARED_LANGUAGE.id,
    VARIANT_FILE.id,
    CROSSED_BOUNDARY.id,
  ];
}
