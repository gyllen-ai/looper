Changing a rule, here or in a fork that will send it back.

- The cases come first, written from the rule's own ban text into
  `audit/cases.ts` — or the `-cases.ts` file for the language it judges: what
  must fire, what must stay silent. A test written after the code can only agree
  with the code, which is how ten rules once shipped saying less than they did.
- **Judge a rule on precision, never severity.** The agent pays severity in the
  same turn from the repair prompt; only imprecision burns turns. A rule ships
  when it is decidable with no false positives and hands back a legal spelling.
- **A blunt rule is not a strict rule.** A stricter reading with no compliant
  path is broken: sharpen it rather than soften it.
- **Run every new rule over this repo before calling it done, then over code
  nobody here wrote.** Any `node_modules` or `~/.cargo/registry` is fifty
  thousand lines of somebody else's work; judge every hit by hand and say how
  many you looked at.
- Send the evidence with the change, not the conclusion: the corpus, the count,
  the false positives you found and what you did about them.
