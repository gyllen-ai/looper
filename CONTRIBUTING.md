# Contributing

looper is meant to be forked. If a rule is wrong in your codebase, the right
answer is usually to change the rule, not to switch it off — and the way to
change it is here.

Nothing in this file is enforced. An agent working in a project that uses looper
will **suggest** these routes when a rule gets in the way; it will not make you
take them, and it will not open anything on your behalf.

## Using it in your own project

```sh
npm install --save-dev github:gyllen-ai/looper
npx looper init
```

`init` writes hooks that point at wherever looper actually is — a dev
dependency, a global install, or a checkout you are working on. It never
overwrites a hook you already had; it adds looper's beside it, and running it
twice leaves the project byte-identical.

If your project has a `Cargo.toml`, looper builds its Rust half once, with the
`cargo` you already have, and judges `.rs` files from then on. If it does not,
none of that happens and nothing about Rust is installed.

## When a rule is wrong

Three routes, in order of how much they cost everyone else.

**It is wrong here, once.** Pardon the one file in `law.toml` under `[exempt]`,
with the rule id and a comment saying why. One visible line in a diff, arguable
forever.

**It is wrong here, always.** A knob under the rule's valve — every rule that
has one prints it in the report. Widening a knob is a decision about your
codebase; make it small and make it deliberate.

**It is wrong everywhere.** That is a looper bug and we want it. Run:

```sh
looper report
```

It writes a file describing the shape the rule fired on and nothing else of
yours — no identifiers, no paths, no logic, and it refuses to write at all if it
cannot prove that. Read the file. If you are content with it, open an issue and
paste it. If you are not, delete it and nothing has left your machine.

## Changing a rule, or adding one

Fork it. Then, in this order, because the order is the whole discipline:

1. **Write the cases first, from the rule's own ban text**, in
   `audit/cases.ts` — or `audit/rust-cases.ts` for a Rust rule, which is judged
   by the real engine in a temporary crate, `audit/css-cases.ts` for a rule about
   a stylesheet or a page, or `audit/copy-cases.ts` for one about a file's name,
   which needs a real directory — what must fire and what must stay silent. Before you touch
   any code. A test written by reading the implementation can only ever agree
   with the implementation, which is how ten rules here shipped saying less than
   they did.
2. **Then change the code**, until `node --test 'tests/**/*.test.ts'` is green
   and `node audit/evasion.ts` reports zero mismatches.
3. **Then run it over code nobody here wrote.** A rule tested only on its
   author's fixtures agrees with its author. Not this repo's own
   `node_modules` — it holds seven files, because looper takes on almost no
   dependencies on purpose. A machine's *global* `node_modules` and any
   `~/.cargo/registry` hold real corpora: point it at thousands of lines of
   somebody else's work and judge every hit by hand. Say how many files you
   scanned and how many hits you read, and do this for a rule you *changed* as
   well as one you added — `NODE:1` had been reading every `regex.exec(...)` as
   a shell command, and only a foreign corpus said so.
4. **Write the words in the reader's terms.** The ban says what is not allowed,
   the reason says what it costs a person, and the instead gives a spelling that
   works. Someone who cannot read code has to be able to act on it.

Then open a pull request that says what you found in step 3. A rule with
evidence behind it will be taken; a rule that only sounds right will not.

Two of those steps are wired rather than asked for. Working in a fork, looper
hands your agent the same rules it hands ours — the `contribution` set arrives
whenever anything under `src/law/`, `src/canon/` or `audit/` is touched, because
the doctrine tree is committed and travels with the clone. And a pull request
that changes `src/law/` without touching `audit/cases.ts` is refused by
`.github/workflows/evidence.yml`, which says why. Step 3, the run over foreign
code, is the one no machine here can check: it goes in the pull request in your
own words, and it is the part that decides whether the rule is taken.

## Everything here is fixable, including the half written in Rust

There is no part of looper that belongs to somebody else. The Rust engine under
`vendor/rust-law` was copied in — `PROVENANCE.md` says exactly where from and
under what licence — and it is fixed here like any other file. Changing it means
the same three steps as changing anything else, and the same two controls apply:
the `contribution` rules arrive while you edit it, and a change to what it
catches is refused by CI unless `audit/rust-cases.ts` moves with it.

The one thing that change owes is a line in `PROVENANCE.md` saying what was
changed and why, so whoever brings a newer copy in knows what to re-apply.

## Why it is built under its own rules

looper is written for a person with an idea and no way to read the code that
comes back. They cannot check the work and have no engineer to ask, so the rules
are the reviewer who is not in the room. Every choice in here answers to that.

Building it under its own law is the only evidence the rules are livable rather
than merely defensible. Every scar in `docs/FINDINGS.md` was earned here first:
forty findings, and the ones that hurt most were the tool catching its own
author. If a rule is painful to obey while changing looper, that is the finding,
not the obstacle.

## Changing looper itself

Same three steps, and one more: looper is governed by its own law. Your change
has to pass the gates it installs in everybody else's project. If that is
painful, that is the product telling you something, and the finding is worth
more than the workaround.
