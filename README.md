# looper

[![tests](https://github.com/gyllen-ai/looper/actions/workflows/test.yml/badge.svg)](https://github.com/gyllen-ai/looper/actions/workflows/test.yml)

```
██╗      ██████╗  ██████╗ ██████╗ ███████╗██████╗
██║     ██╔═══██╗██╔═══██╗██╔══██╗██╔════╝██╔══██╗
██║     ██║   ██║██║   ██║██████╔╝█████╗  ██████╔╝
██║     ██║   ██║██║   ██║██╔═══╝ ██╔══╝  ██╔══██╗
███████╗╚██████╔╝╚██████╔╝██║     ███████╗██║  ██║
╚══════╝ ╚═════╝  ╚═════╝ ╚═╝     ╚══════╝╚═╝  ╚═╝

rules before the work · gates after it · no socket, ever
90 rules · 5 languages · 619 cases · 646 tests
```

An agent writing code for you is fast, agreeable, and unsupervised. looper is
the reviewer who is not in the room: rules that arrive before the work, and
gates that read what was written before it lands.

It is built for the person who has an idea and cannot read the code that comes
back — no engineer to ask, no way to check the answer. Everything it says is
written to be acted on by that person.

```sh
npm install --save-dev github:gyllen-ai/looper
npx looper init
```

That is the whole setup. `init` adds its hooks beside any you already have,
never over them, and running it twice leaves the project byte-identical.

## What it actually does

Your agent writes this. It compiles, the tests pass, and it is wrong:

```diff
  export async function total(id: string) {
    try {
      const rows = await db.rows(id);
      return rows.reduce((n, r) => n + r.amount, 0);
-   } catch {
-     return 0;
-   }
  }
```

`0` is a number. One line later nothing can tell it from a real total — the
database was down and the invoice says zero.

looper does not wait for the commit. The moment that file is written, the agent
is holding this:

```
  [TS-ERROR:3]  src/orders.ts:6
    not allowed: answering a failure with a made-up value: `catch { return null }`,
    `return []`, `return {}`, `return 0`, or `.catch(() => [])`
    why: one line later nothing can tell the made-up value from a real one, so a
    database that was down becomes an empty list of users, and a parse that failed
    becomes a zero in a report. The person who sees it has no way to know anything
    went wrong
    the shape that works instead — the names in it are examples, not code to copy:
      throw new NotFound(id)
      catch (cause) { throw new CouldNotRead(path, cause) }
      catch (cause) { logger.warn({ cause }, 'cache unreadable'); return count(source) }
```

What is not allowed, what it costs, and a spelling that works. The agent repairs
it in the same turn, while the reasoning that produced it is still in the room.

## Five gates

```
①  before each turn      the rules for what you are touching are put in
                         front of the agent — held, not merely available

②  after each edit       the file is judged. a violation comes back as a
                         repair: what is not allowed, why, and a spelling
                         that works

③  before each commit    everything staged is judged again, plus a scan for
                         anything shaped like a password or a key

④  before each commit    a check this project declared and knows is broken
                         refuses it. a check that could not be asked does
                         not — that is the world's fault, not the commit's

⑤  before it leaves     every word that appears nowhere else in the
                         repository is named — on a push from your machine,
                         and on every pull request, because a merge through
                         GitHub never pushes
```

Nothing in that list can reach the network. `npm test` holds it: no file in the
resolved tree may open a socket, the eighteen Rust crates and three C# packages
are vendored into this repository, and a build with an empty package cache was
run to prove it needs nothing fetched.

## What it reads

| language | rules | how |
|---|---:|---|
| **TypeScript & JavaScript** | 32 | Babel, including React, Next and JSX |
| **Rust** | 30 | `syn`, built from vendored source with the `cargo` you have |
| **Python** | 14 | Python's own parser — `python3`, nothing to install |
| **C# & Razor** | 8 | Roslyn, `@code` blocks judged; the markup goes to the CSS rules |
| **CSS, Sass & HTML** | 5 | read as declarations; `<style>` blocks in a page or a Razor component judged on its own lines, and `style=` attributes refused |
| **every language at once** | 1 | `COPY:1` reads the directory, not the file: a name that says it is a second go at the file beside it |

**619 cases** hold those rules to their own ban text — what must fire, what must
stay silent — and every rule was run over code nobody here wrote before it
shipped.

A project with two halves is not confused by them. looper works out from what is
on disk which half is the backend and which is the interface, and a rule about
database queries never fires on a screen that has no database. A TypeScript-only
project never sees any of the rest.

## Before you write anything

An agent reads this file, then starts work. These are the three that change what
gets written, and the order is the point.

1. **Read [STACK.md](STACK.md) — what looper recommends building with.** The web
   framework, the database layer, the front end, one tool per job, for
   TypeScript, Rust, Python and C# alike. It judges nothing and refuses nothing.
   It is there so the first file in a language this project does not already use
   is a choice between named options rather than whatever came to hand.
2. **Read `CURRENTSTACK.md`, which `init` writes into your project.** That one is
   what your project already *is*, measured from disk rather than chosen. It is
   also the gate: `STACK:1` refuses a source file in a language it does not list.
3. **Pull the doctrine for whatever you are about to touch**, with the `doctrine`
   tool. The sets tied to files you have already edited arrive on their own. The
   rest arrive only if you ask — and the first file in a new area is precisely
   the one nothing has arrived for yet.

Skipping the first two is how a project ends up with a second runtime nobody
chose. Skipping the third is how a screen gets built that nobody ever looked at.

## Measured against code nobody here wrote

`looper law` over four codebases widely held up as well written, and over this
one. All five judged 2026-08-19.

| | zod | excalidraw | tanstack-query | vscode | looper |
|---|---:|---:|---:|---:|---:|
| lines of TypeScript | 79,636 | 190,487 | 157,039 | 2,613,789 | 10,765 |
| problems per 1,000 lines | 128.7 | 67.2 | 45.2 | 75.9 | **20.1** |
| without the comment rule | 43.4 | 24.4 | 17.8 | 23.6 | **19.9** |

Read the third row against the second. **One rule — no comments — is 61 to 69% of
everything looper finds in all four.** That is a position this project takes on
purpose, and the number is what it costs: every other rule can be adopted
incrementally, and that one cannot be adopted at all without a mass strip first.
Worth knowing before you start rather than after.

The file-length cap lands between 0.28 and 0.54 per 1,000 lines in all five,
including a 2.6-million-line editor — a cap that means the same thing at every
size. And on `as` and `!`, on `any`, on suppressions and on `export *`, a project
that has followed these rules for a week scores better than all four.

Where looper is worst in that sample is written down too. `docs/PLAN.md` has the
whole table.

## When a rule is wrong

It will be, and being wrong is the only real failure a tool like this has. Three
ways out, and the rule tells you which one it has:

- **a pardon** — one file, one rule, one line in `law.toml` saying why
- **a knob** — a cap or a list, moved deliberately
- **off** — a whole rule, project-wide, which is the loudest thing you can write

If none of those is the right answer, the rule is wrong everywhere and that is a
bug worth having: `looper report` writes down the shape it fired on and nothing
else of yours, for you to read before it goes anywhere.

The rules are meant to be argued with. See [CONTRIBUTING.md](CONTRIBUTING.md).

## What it is not

Not a linter. A linter is configured per project and switched off when it is
inconvenient, which makes it a preference. This is a law: the concessions are
graded, visible in a diff, and each one is an argument somebody can read a year
later.

## If you want to know why

`docs/PLAN.md` is the design record: every rule argued before it was built, every
decision that was reversed keeping both halves, and every number measured with
the date beside it. Four tests read it and refuse the suite if it drifts from
what the code does.

`docs/FINDINGS.md` is the audit. **A hundred and five things that were wrong with
this tool**, how each was found, and what closing it cost. All of them are
closed, and the ones still open are named at the top of that file when there are
any. A tool that publishes its own audit — including what it still gets wrong —
is making a claim that is expensive to fake.

## Licence

[Zero-Clause BSD](LICENSE). Use it, change it, ship it, sell it. No attribution
required, no conditions at all.
