# Findings

Everything an audit pass turned up, and nothing else. This is a pile to clear,
not a plan — the plan for how the passes run is in `docs/PLAN.md`.

**During a pass, record. Do not fix.** A pass that fixes as it goes is auditing a
moving target, and the count at the end means nothing. Clear the pile afterwards,
in one deliberate go, in severity order.

Each entry carries what it is, where, and the evidence. An entry with no evidence
is a suspicion and belongs in the notes at the bottom, not in the list.

| kind | means |
|---|---|
| `wrong` | it reaches a verdict that is not true |
| `blunt` | it fires on code that is fine — the failure that gets a tool switched off |
| `missing` | something claimed, in the plan or a message, with nothing behind it |
| `slow` | a measured cost that will bite at a size we have not reached |
| `noise` | duplication, dead weight, or a message nobody can act on |

---

## Open

_Empty._

**All 105 are accounted for, checked 2026-08-19.** 101 entries carry a number;
the four that do not are explained rather than missing. **26 and 27** were folded
into finding 30 and cleared with it. **18 and 19** were never written — no commit
ever added them, so the numbering skips two and nothing is lost. Every other
finding is marked cleared, except two pairs that are decisions rather than open
work: **21 and 22**, the startup cost, measured with neither fix paying for
itself; and **33 and 36**, the vendored-engine gaps, which were reopened as ours
and then closed by finding 70.

### 105 · `wrong` — init could add a hook but never repair its own — cleared

2026-08-19, found by trying to apply finding 104's fix to this repo and watching
it fail to arrive.

Finding 104 moved every hook to `bin/looper.js`, the one entry that survives a
broken import and can still tell the agent. That changed what `init` **writes**.
It did nothing for a project already wired, and this repo is one: its
`.claude/settings.json` still said

```
node "$CLAUDE_PROJECT_DIR/src/main.ts" hook PreToolUse
```

so the protection reached every future adopter and not the project that wrote it.
The same session then broke its own imports again, and again only the human saw
the hook errors.

**Running `init` made it worse.** `mergeSettings` adds a hook beside whatever is
already there and never over it, which is right for a hook the project wrote and
wrong for a stale one of looper's own. Every event ended up with two:

```
PreToolUse: node ".../src/main.ts" hook PreToolUse
            node ".../bin/looper.js" hook PreToolUse
```

looper ran twice on every tool call.

This is finding 94 in a second place. That one taught `mergeMcp` that looper owns
its own entry and nothing else; `mergeSettings` never learned it.

**The fix.** looper recognises a hook it could have written — the same tail it
writes, `inject` or `hook <Event>`, and a program ending in one of the four
spellings it can produce, `bin/looper.js`, `src/main.ts`, `.bin/looper` or the
bare `looper` — and replaces it. Anything else in that event is untouched, which
the test checks by name.

**And it says so**, because finding 94's other half was that a repair nobody is
told about is the same silence as the stale entry:

```
merged .claude/settings.json (looper's own hooks were rewired; everything else was left alone)
       wired  node ".../bin/looper.js" hook PreToolUse
       replaced an older looper hook: node ".../src/main.ts" hook PreToolUse
```

One hook per event afterwards, verified by reading the file back.

**A note on how it was found.** Writing the test pushed `tests/init.test.ts` to
501 lines and the cap refused the commit — during a conversation about whether
the cap earns its place. The tests for how looper wires itself moved to
`tests/wiring.test.ts`, which is a subject of its own.

### 104 · `missing` — a broken looper announced itself to the human and not to the agent — cleared

2026-08-19, issue #74, and the agent that caused it was this one. A bad conflict
resolution left `src/law/python/rules.ts` malformed. looper's hook imports it, so
every `PreToolUse` invocation died before a line of looper ran:

```
PreToolUse:Bash hook error
Failed with non-blocking status code: node:internal/modules/run_main:123
```

`non-blocking` is looper failing open, which is what the canon asks for: a broken
looper must not wedge the session it watches. That half worked.

**The other half did not. The agent never saw it.** The hook's failure goes to the
human's terminal; the tool result the agent receives is unchanged. So it kept
editing and kept committing, believing it was governed, for about a dozen commands
until Richard asked why the errors were there. For a tool whose whole claim is
*the reviewer who is not in the room*, the one reader who must know the reviewer
has stopped reading is the agent, because it is the one still writing.

**Why nothing downstream could report it.** A crashed program cannot announce
itself. Every module in the import graph is gone before any code runs, so the
announcement has to live somewhere that imports almost nothing — and there is
exactly one such place, `bin/looper.js`, which imports `node:fs` and `node:module`
and then loads the rest.

**Two changes.** That load is now inside a `try`, and on failure the shim writes a
real hook answer whose `additionalContext` says looper is not judging, what
stopped it, and to treat every verdict as absent rather than clean —
`additionalContext` being the channel the agent actually reads, the same one the
constitution arrives through. It exits 0, because failing open is still right.

And **every hook now goes through that one entry.** Three of the four invocation
kinds already did; `dev` pointed straight at `src/main.ts`, which is this repo,
which is why the blindness was found here rather than by an adopter.

**Measured, by breaking it the same way again:**

```
$ echo '{"tool_name":"Bash",...}' | node bin/looper.js hook PreToolUse
{"hookSpecificOutput":{"hookEventName":"PreToolUse","additionalContext":
 "looper is not judging anything in this session: its own code could not be
  loaded. Nothing is being checked — not the rules, not the edits, not the
  commit — until that is fixed. ..."}}
exit=0
```

Two tests: a checkout whose `src/main.ts` cannot parse still answers and exits 0,
and `entryFor(DEV)` names the shim. Both fail before the change.

### 103 · `noise` — a size cap had started deciding where facts live — cleared

2026-08-18, issue #67, from reviewing the decisions capability in #65.
`src/config.ts` was 497 lines against its own 500 cap, so that capability could
not put its path beside every other project-visible path and kept it in its own
module. It said so in the open and did not widen the cap, which was the right call
— a cap widened to fit stops meaning anything. But the reason a fact lived
somewhere had become "the other file was full", and that reason was invisible from
either file.

**The split, named in one sentence:** the prose looper writes into a project is
not a setting. Eight stubs and headers moved to `src/stubs.ts`, and `config.ts`
went from 497 lines to 402 with the cap untouched.

**The sanctum stayed one file**, which is the constraint that made this worth care
rather than a quick move: nothing that turns a missing value into a default went
anywhere, so the canon's sentence about `src/config.ts` is still true.

`DECISIONS_PATH`, `DECISIONS_TOOL` and `DECISIONS_PRIORITY` came back beside their
siblings, and the re-export that briefly kept the old import path working went out
with them — one home means one place to import from, or it is two homes wearing
one name. That re-export was in the first version of this change and was taken out
before it shipped.

`npm test`: 472 pass, 0 fail. `looper law` on this repo: exit 0.
### 102 · `wrong` — the commit gate judged by a different law than `looper law` — cleared

2026-08-18, issue #56. Found while investigating finding 100 and deliberately not
fixed with it, because it is a different defect and a fix without a failing test
would only have agreed with itself.

`judgeStaged` was the one judging path that never passed a role:

```ts
{ file: path, text: held.text }
```

The edit gate forty lines below passes `roleOf(shapeOf(root), relative)`, and so
does the survey behind `looper law`. In `belongsHere`, `role === undefined` means
**every** rule applies, including the ones scoped to one half of a project. Two
rules declare `onlyFor: "backend"` — `NODE:1` and the injection rule — so on an
interface file the commit gate applied them and `looper law` did not.

The design says plainly that a rule about database queries never fires on a user
interface that has no database. At commit time it did.

**The fixture that was missing.** This went unfixed for a day because a faithful
test needs a project where `roleOf` answers `interface`, and it was not obvious
what makes one. `shapeOf` gives it: a `Cargo.toml` and a `package.json` whose
dependencies declare no server framework reads as `mixed`, and a mixed project
whose TypeScript declares no server is the interface.

With that, the test states the invariant rather than the symptom — the gate and
the survey reach the same rule ids for the same file — and it names what went
wrong before the change:

```
+   'NODE:1'
```

**The fix** passes the role, computing the shape once outside the loop rather than
per file.

### 101 · `blunt` — arguing with a rule was refused over a word in a comment — cleared

2026-08-18, adopter issue #60, filed thirteen minutes after finding 100 shipped,
by somebody who went straight back to using the route it had opened.

`--tried` is the sentence the person types about what they tried. It is checked
word by word against the project and refused if a word looks like a name from
their code. Two things made it too tight.

The rule's own id collides. Arguing with `TS-TRUTH:1` means writing about it, and
`TRUTH` is in the id:

```
looper refused to write the report, because it would have carried something
from your code: TRUTH.
```

And the match came from comment prose. In their project `TRUTH` is not an
identifier anywhere — it appears in comments, in capitals, as an ordinary English
word. So any word anybody ever wrote in a comment became unusable.

**Told, not seen.** Everything in the paragraph above about their project — where
`TRUTH` appears, that it is not an identifier, and that they are deleting every
comment because `TS-DEAD:2` says to while those words keep blocking reports — comes
from the issue they wrote. Their tree cannot be read from here and nothing of it
may enter this repo. What was seen is below: the same situation rebuilt on a
scratch project, and the measurements taken on it.

**Reproduced here** on a scratch project holding one `?? 0` and one Python file
whose only occurrence of `TRUTH` is a `#` comment. Same rule, same file, same
line, only the sentence differing: the one naming `TRUTH` was refused and the one
avoiding it was written.

**The fix.** The reported rule's id is never a leak, because the report prints it
in its own `rule:` field. And the vocabulary is built from each file with comments
removed — `#` for Python, `//` and `/* */` elsewhere — with quotes tracked so a
marker inside a string is not a comment.

**Measured after, both directions:**

| sentence | before | after |
|---|---|---|
| names `TRUTH`, which is only in a comment | refused | written |
| names `tenantLedgerRef`, a real identifier | refused | refused |

**The limit, deliberately.** String literals stay in the vocabulary: a secret in a
string is exactly what this guard is for. A Python docstring is a string rather
than a comment, so an ordinary word living only in a docstring is still refused —
measured, with a rule id that does not cover it. That is the same line the
adopter's own suggestion of "identifiers and string literals" would have drawn,
and it is written down here rather than discovered.

### 100 · `wrong` — the commit gate judged every staged file with its blank lines deleted — cleared

2026-08-18, adopter issue #44, reported from a 3,749-line TSX file during a
cleanup of a project with 2,391 baseline problems. The gate refused a commit and
named lines that did not hold what the rule described; `looper law` on the
byte-identical staged content named different lines, and those were right every
time.

**It was cracked by the artifact, not by reading.** The adopter ran `looper report`
on one of the cited lines and sent back the anonymised shape:

```
VariableDeclaration (kind=const)
  VariableDeclarator
    ArrayPattern
      Identifier (name1)
      Identifier (name2)
    CallExpression
      Identifier (name3)
      BooleanLiteral (value-removed)
```

That is `const [a, b] = f(<boolean>)`. `REPORT_DEPTH` is 6 and the tree is 4 deep,
so it is the whole statement, not a truncated one. `TS-TRUTH:1` bans `??`, `||`,
`??=` and `||=`, and there is no logical operator anywhere in it — so that verdict
is impossible for that line. Checked here: `looper law` on that shape answers
`nothing to fix`, and the rule reports the exact line of the operator rather than
the line the statement starts on.

**Told, not seen.** The 3,749-line file, the 2,391 baseline problems, the table of
staged sizes against cited lines, and the shape above are all theirs, from the
issue and a `looper report` they ran. Their tree cannot be read from here. What was
seen is everything below: what that shape means, checked against the rules here,
and the fixture the cause was measured on.

**The cause.** `ask` in `src/git.ts` ended with

```ts
return output.split("\n").filter((line) => line.length > 0);
```

which is correct for everything it was written for — a config value, a list of
paths, the lines of a diff. `stagedText` used it to read a file:

```ts
text: ask(root, ["show", `:${path}`]).join("\n")
```

So every blank line was deleted before judging, and every line below one was
numbered wrong by the count of blanks above it. Measured on a nine-line fixture:

```
lines on disk:       9
lines the gate sees: 4
the ?? 0 is on line 5 on disk, and line 2 in what the gate judges
```

**Every symptom in the report follows.** The token stream was identical in all
their measurements because blank lines produce no tokens. The offset was not
constant because it is the number of blanks above each violation. The wrong lines
shrank with the diff because a smaller diff promotes fewer baselined violations
out of the baseline. And `looper law` was right every time because it reads the
file from disk.

One detail in the report is *not* explained by this and is probably a coincidence:
they matched a cited 1020 to a `?? 0` at 1018. This mechanism cites a line lower
than the real one, never higher, so that pair is a near-match by eye rather than
the corresponding violation.

**The fix.** Reading content and reading a list are two jobs and now have two
helpers. Two tests, both failing before: the staged text equals the file on disk,
and the gate names the line the problem is actually on.

### 99 · `missing` — `looper report` refused the line it was most needed for — cleared

2026-08-18. Found while trying to reproduce adopter issue #44, which could not be
reproduced without the adopter's staged blob and baseline — neither of which may
enter this repo. `looper report` is the mechanism that makes adopter evidence
shareable at all, and the adopter had already reported that it refused them:

```
$ npx looper report --rule TS-TRUTH:1 --file .../operate.tsx --line 885 --tried "..."
looper: no report written — nothing looked like a statement on line 885.
```

`shapeAt` required an enclosing node to **begin** on exactly the line given. Two
ordinary lines fail that test: a continuation line of a multi-line expression,
which begins nothing and is not a bug at all, and a line the tool named wrongly,
which is the entire complaint in #44. The route the `law` rule set names as the
only way to argue with a rule was open while looper was right about the line and
shut when it was wrong about it.

**Told, not seen.** The refusal above is the one they reported. What was seen is
the reproduction below and the report it now writes.

**The fix.** A shape lookup has three answers. Found, when something begins there.
`around`, when nothing begins there but a statement contains it — the report is
written against that statement and says which line it really begins on, because
the distance between the named line and the real one is the evidence somebody
needs. Not-found only when nothing contains the line, which is the one honest
refusal, and there is a test for that too.

**Measured, on the shape the adopter's command had:**

```
## Line 4 starts no statement

Nothing begins on the line the rule named. The shape below is the statement
that contains it, which begins at line 2.
```

**All three languages, the third finished later the same day.** TypeScript and
Python went first, each with a test that failed before the change; Python's reader
carries `startsAt` back through the payload.

Rust took a different fix, which is why it was filed as issue #58 rather than
rushed into the same change. `skeleton.rs` collects tokens that *start* on the
line and refuses when there are none, so its cause was never "no node begins
here". `shape_at` now asks `syn` which item contains the line, re-reads that
item's own first line, and answers with `startsAt` set to it. The Rust binary
carries the field out through its JSON, where `shapeFrom` already knew how to read
it.

Rust also has a different shape of line that begins nothing: a method chain
continues with `.filter(...)`, which *does* start tokens, so it is a `found` and
always was. The line that begins nothing in Rust is a blank one inside an item —
which is what the test uses, and what the first version of that test got wrong.

**Measured, on the command an adopter runs:**

```
$ looper report --rule RUST-TYPE:4 --file src/totals.rs --line 3 --tried "..."

## Line 3 starts no statement
Nothing begins on the line the rule named. The shape below is the statement
that contains it, which begins at line 1.
```

The test fails without the change and passes with it, checked in both directions
with the engine rebuilt each time: 18 pass 1 fail, then 19 pass 0 fail. A line
beyond the end of the file is still refused, and that test is unchanged.

### 98 · `missing` — JavaScript entered a governed project and nothing saw it — cleared

2026-08-18, adopter issue #46. `looper law deploy/check.py deploy/check.mjs`
answered `1 files, nothing to fix`. The `.mjs` was not judged clean; it was not
judged. In the same project a `next.config.mjs` holding three `//` comments and a
`/** */` block drew no verdict, while `TS-DEAD:2` accounts for 1,554 of that
project's 2,391 baseline problems everywhere else.

`STACK:1` was silent for the same reason and not a second one. It is handed the
file list the survey walked, and the survey walks `JUDGED_EXTENSIONS`, which
listed `.ts`, `.tsx`, `.mts`, `.cts`, `.rs`, `.py`. So the stack record silently
stopped describing the project.

**Told, not seen.** Their command and its answer, the `next.config.mjs`, and the
1,554 of 2,391 are from the issue they wrote. What was seen is the two tests below
and what the change found in this repo on its first run.

**The fix is that list.** `.js`, `.jsx`, `.mjs` and `.cjs` are judged. Nothing
else moved: `lawFor` already routes anything that is not Rust or Python to the
TypeScript reader, and `languageOf` already knew those four extensions mean
JavaScript. Two tests, one per half, both failing before.

**What it found here, immediately.** looper's own `bin/looper.js` had never been
read by looper. Four problems, and every one of them correct:

| | |
|---|---|
| `TS-LOG:1` at 12, 19 | `console.error` in a library |
| `TS-LAYER:2` at 43 | `await import("../src/main.ts")` partway down the file |
| `STACK:1` at 1 | JavaScript is not in `CURRENTSTACK.md` |

Both code rules name the same valve, `law.toml [entry] files`, and `bin/looper.js`
is exactly what that valve is for — it is what `package.json` declares as `bin`,
and the late import is the entry point deciding to load late, which is what
`TS-LAYER:2`'s own advice says is allowed there. This repo's `law.toml` declares
its entry files by hand, which overrides the `package.json` default, and the shim
was missing from that list because nothing had ever judged it. It is declared now.

`STACK:1` was right in the plainest way: looper ships a JavaScript file and its
own stack document did not say so. `CURRENTSTACK.md` says so now.

After both, `looper law` on this repo is back to 13 baseline problems and exit 0.

### 97 · `missing` — the doctrine named `.catch(() => {})` twice and no rule caught it — cleared

2026-08-18, adopter issue #45. The `law` rule set, injected on every turn in a
TypeScript project, says an empty `catch` and a `.catch(() => {})` both delete the
evidence, and names `.catch(() => 0)` beside it. `TS-ERROR:4` walked for
`CatchClause` and nothing else, so the statement form fired and the method form
did not. The adopter counted 19 in one console, 12 of them in a single file, in a
file that reports 630 problems from other rules — so this was not a codebase
looper was quiet about, it was this shape.

**Told, not seen.** The 19 instances, the 12 in a single file, and the 630 problems
that file reports are theirs, from the issue. What was seen is the boundary probe,
the corpus below, and every hit in it.

**The fix.** An inline `.catch(handler)` body is the same thing as a catch clause
and faces the same two questions: does it observe the failure through a blessed
logger, and does the failure escape it.

**Two boundaries, both measured rather than assumed.**

`.catch(handleIt)`, where the handler is a name, is not judged. The body is not
there to read, and firing on it would be a verdict on code the rule cannot see.

A handler whose only act is making up a value belongs to `TS-ERROR:3`. The issue
reported `.catch(() => 0)` and `.catch(() => null)` as also unreported; that part
is wrong, and the probe that shows it:

```
2  return work().catch(() => []);        TS-ERROR:3
3  return work().catch(() => 0);         TS-ERROR:3
4  return work().catch(() => null);      TS-ERROR:3
5  return work().catch(() => ({}));      TS-ERROR:3
6  work().catch(() => {});               TS-ERROR:4
7  work().catch(() => { done(); });      TS-ERROR:4
8  work().catch(() => other());          TS-ERROR:4
9  work().catch((c) => { throw new W(c); })   silent in both
```

Without that boundary the first four carried two verdicts for one problem. No line
carries two now.

**Run over code nobody here wrote,** which is what this repo's own `node_modules`
cannot supply: it holds 0 TypeScript sources outside declarations. The corpus is
npm's own global install under Node 24.19.0 — 1,122 `.js` files across ten
packages, all read, none unreadable. They were handed to the TypeScript reader
because this shape is plain JavaScript and the parser accepts it; `.js` is not yet
judged by an ordinary run, which is issue #46.

| | before | after |
|---|---|---|
| violations, all rules | 28,496 | 28,543 |

**47 newly reported, 0 lost.** Judged one at a time: every one is a `.catch`
handler that takes no parameter, so not one of them could have looked at what
failed. **No false positives.** 26 of the 47 are `lru-cache`, which ships eight
build variants of the same source, and 13 of those land on minified one-line
bundles where the line number names the file rather than a place in it — a real
hit with a location that cannot be sharper on a bundle.

Before the `TS-ERROR:3` boundary the same corpus gave 86, so 39 of those were the
double-count.

**On this repo:** 7 hits, all the pre-existing `catch {}` clause form already in
the baseline, and no `.catch` handler anywhere in looper's own source.

### 96 · `noise` — `looper law` exited 2 for problems it had just said do not block — cleared

2026-08-18, adopter issue #47, from a project with 2,391 baseline problems across
65 files. The command printed

```
All 2391 of these were already here before looper arrived ... They do not block a
commit until you touch the line they are on.
2
```

and the 2 is the same answer it gives when something is blocking, so nothing that
reads an exit code can tell the two apart. The adopter wanted `looper law` in the
single command their project runs before every commit and in CI beside the type
check, and could not: it would be red from the first day of the cleanup until the
last of 2,391 problems was gone, and a check that is always red is not a check.

**Told, not seen.** The 2,391 problems across 65 files, the transcript above and
the timings they credited are theirs, from the issue. What was seen is the
measurement on this repo below.

**The fix.** The exit code answers one question, *is anything blocking*. 0 when
every problem found is in the baseline, 2 when one is not.

The counts in the message were wrong in the same place and are corrected by the
same change. They were `older = min(baseline total, found)` and `yours = found -
older` — a subtraction over totals, which calls a new problem old whenever an old
one in the same file was fixed in the same pass. Both now come from
`againstBaseline`, which asks of each violation whether that file and that rule
are recorded.

**Measured on this repo**, which carries 13 baseline problems and nothing new:

```
$ node src/main.ts law > /dev/null ; echo $?
0
$ cp probe.ts src/probe-new.ts ; node src/main.ts law > /dev/null ; echo $?
2
```

Two tests run the built command in a scratch adopted project and read its status.
The first fails before the change.

**Left alone deliberately.** The commit gate has its own `separate` in
`src/law/capability.ts`, which is the same split plus the touched-lines rule. It
keys on the path it was given rather than on each violation's own `file`, and the
Rust and Python readers build their violations elsewhere, so whether the two keys
always agree is unverified. Folding them together on that assumption is how a gate
breaks quietly; the duplication stays until somebody measures it.

### 95 · `missing` — looper's own project was reached as an installed command, so its tools never started — cleared

2026-08-18. Found by running `looper init` in this repo the moment finding 94 was
merged, to watch the repair work. It did repair the stale entry, and what it wrote
in its place was

```
it was launching  node $CLAUDE_PROJECT_DIR/src/main.ts serve
it now launches   looper serve
```

`looper` is not on PATH here and there is no `node_modules/.bin/looper`, so one
launch that cannot run was replaced by another. The same run said the hooks'
command could not be found; the `.mcp.json` line said `corrected` and nothing
else.

`reachedFrom` knew three shapes and not the fourth. `local` is a
`node_modules/.bin` beside the project, `inside` is a checkout under it, and
everything else is `INSTALLED`, the bare command. The project that **is** looper
matched none of the first two and fell to the third. `DEV`, whose launch is the
root-relative `./src/main.ts` that finding 93 measured as the spelling which
connects, could only be reached by typing `--dev` — a step nobody knows exists,
which is the input rule in one line.

**The fix.** `reachedFrom` asks first whether the root is itself a looper
checkout, using the same `isLooperCheckout` that `checkoutUnder` already applies
to subfolders, and answers `DEV` when it is. One line, and no adopter can reach
it: an adopting project's root is never a looper checkout.

**Measured, not claimed.** With the entry it now writes, the server answers:

```
$ printf '…initialize…tools/list…' | node ./src/main.ts serve
{"result":{"protocolVersion":"2025-06-18","serverInfo":{"name":"looper","version":"0.1.0"}}}
{"result":{"tools":[{"name":"doctrine"…},{"name":"recall"…},{"name":"see"…}]}}
```

The test asserts the reach and the two fields of the entry, and fails on the
previous `reachedFrom`.

### 94 · `wrong` — init could add its server but never repair it, so finding 93's fix reached nobody — cleared

2026-08-18. Found the moment finding 93 was pinned by the adopter who reported
it: they bumped to the fixed commit, ran `looper init`, and it said

```
  already wired, nothing to change  /their/project/.mcp.json
```

with the broken `$CLAUDE_PROJECT_DIR` entry still in the file. `mergeMcp` tested
`servers[SERVER_NAME] !== undefined` and nothing else, so the presence of the key
was the whole check. Every project that ran init before the fix keeps the entry
that does not work, for good, and is told it is wired.

`mergeSettings`, ten lines below, had the right answer already: it compares the
command it wants against the commands in the file (`carriesCommand`) and rewires
when it is not there. The hooks could be repaired and the server could not.

This is the failure this part of the plan names in its own words: reporting a gate
as installed when it is not.

**The fix, and the boundary it draws.** looper owns two fields of its own entry,
`command` and `args`. Everything else in that entry, and every other server in the
file, belongs to the project and is never touched. init compares those two fields
with what it would write now: absent, it adds; equal, it says nothing; different,
it replaces them, keeps the previous file beside it, and reports what the entry
was launching and what it launches now. Three tests, one per branch, and the
repair test fails on the previous `mergeMcp`.

### 93 · `missing` — the `.mcp.json` entry was written with a shell variable, so the tools never appeared — cleared

2026-08-18. From an adopter running looper as a submodule under `vendor/`. Their
sessions had no `doctrine`, no `recall` and no `see`, and nothing anywhere said
so: the injection hook ran, `looper status` reported its contributors and what it
had dropped, and the tools were simply absent. Every session that project has ever
run acted on whatever the router guessed, with no way to pull a rule set by name.

Two things were wrong and only the second is looper's.

`claude mcp get looper` answered `Status: ⏸ Pending approval`. A project-scoped
server needs a trust answer before it is ever started, and that one is the
adopter's to give.

Once given, it still could not start. init had written

```json
{ "command": "node", "args": ["$CLAUDE_PROJECT_DIR/vendor/looper/bin/looper.js", "serve"] }
```

An argv entry is handed to the process exactly as written. There is no shell to
expand `$CLAUDE_PROJECT_DIR`; the agent's own expansion is `${VAR}` read from the
environment; and `CLAUDE_PROJECT_DIR` is not in the environment it reads, because
the agent sets that variable for hooks and not for the config it expands.
Measured, three projects holding the same server, one spelling each:

| args | result |
|---|---|
| `$CLAUDE_PROJECT_DIR/vendor/looper/bin/looper.js` | `✘ Failed to connect — CONNECTION_CLOSED` |
| `${CLAUDE_PROJECT_DIR}/vendor/looper/bin/looper.js` | `✘ Missing environment variables: CLAUDE_PROJECT_DIR` |
| `vendor/looper/bin/looper.js` | `✔ Connected` |

The server was never at fault. Run by hand it answers `initialize` and lists
`doctrine`, `recall` and `see`.

**This document already held the lesson, one context over.** *Only a real verdict
refuses* records the git hook shipping with the agent hook's entry path, "which
resolves through an environment variable Claude Code sets and a shell does not",
so every commit was refused because node could not find a file. That was fixed for
git in `gitHookEntryFor` and left standing in `launchFor`. `launchFor` even had the
right answer for one of its four kinds: `local` is written `./node_modules/.bin/looper`,
root-relative, while `dev` and `inside` carried the variable.

**`entryReach` proved a path that nothing used.** Init checks that
`vendor/looper/bin/looper.js` exists and then writes
`$CLAUDE_PROJECT_DIR/vendor/looper/bin/looper.js` into the argv, which is a
different filename. The check this document offers as the answer to adopter issue
#8, that init checks the command it just wrote can actually be found, was true of
the hooks and false of the MCP entry.

**Why no test caught it.** `tests/launch.test.ts` already knew the category: it
asserts that no argv entry carries a quote character, because "quoting belongs in
a shell command line, never in an argument list". A variable is the same mistake
one step further, and nothing asserted its absence.

**The fix.** `launchFor` writes the root-relative path `gitHookEntryFor` already
writes, for every kind. The path `entryReach` checks and the path written into
`.mcp.json` are now the same string, and a test asserts that they are, so the two
cannot drift apart again.

**What it costs, said plainly.** A relative path resolves against the working
directory the agent spawns the server in, which is where the agent was started.
Started in a subdirectory, the server does not launch: same project, same file,
run two levels down, `CONNECTION_CLOSED`. `local` has always had this and the git
hook has it too, since git runs hooks from the repository root. An absolute path
would close it and cannot be had, because `.mcp.json` is committed and shared and
a machine-specific path in it breaks every other clone.

### 92 · `missing` — the escape hatch read one of the three languages — cleared

2026-08-18. The third thing the same adopter found on the same pin bump, and the
one that made the other two hard to report. Told to argue with the rule that had
just fired wrongly on their Rust, they ran the documented route:

```
looper report --rule RUST-TYPE:4 --file crates/admin/src/store/operator.rs --line 39
looper: no report written — the file could not be read as TypeScript.
```

`shapeAt` sent every file through the Babel parser. Twenty-nine Rust rules and
seven Python ones were judged at full strength, and **not one of them could be
disputed** — the only route left is the one CONTRIBUTING.md calls the worst,
switching the rule off.

This document already said the report was shared: "one baseline and one report
across both languages", written when Rust was designed in. It was true of the
baseline and false of the report, and it had been false for as long as looper has
read Rust. `tests/plan-is-true.test.ts` holds the rule table to the code and this
claim is prose, so nothing caught it.

The shape now comes from whichever reader already reads the language, because
there was never a second parser to be had. `.rs` goes through a new
`--shape <file> <line> <depth>` mode on the engine (`vendor/rust-law/src/skeleton.rs`),
`.py` through `read.py`, `.ts` through Babel as before. All three answer with the
same three fields, and the guard that refuses a leak is the one guard. Spawning
stays in the two drives that were already allowed to spawn — the first attempt put
it in `src/report/skeleton.ts` and `tests/invariants.test.ts` refused it, correctly.

**Two gates refused the first version of this change and both were right.** The
second was `.github/workflows/evidence.yml`: the shape reader started life inside
`read.py`, which added `frozenset` and `isinstance` to a file the gate watches for
rule-shaped edits, so it demanded cases for a change that is not a rule. The
answer is not a wider grep — it is that `read.py` had one job and had been given
two. The shape reader is its own file, `src/law/python/skeleton.py`, the way the
Rust one is, and the gate's heuristic stays worth having.

**What the probe found, which the tests did not.** `audit/shape-probe.ts` asks for
a shape on five lines of every file in a corpus and checks every word of the
answer against the words looper can write. Over 4,168 lines of `syn`, `tokio`,
`axum`, `hyper`, `clap`, `serde` and Python's own standard library: **0 leaks** —
after it caught two things first. Rust's short keywords (`fn`, `if`, `as`, `u8`)
were not in the declared vocabulary, and Python's `ast` names twenty of its node
types in lower case (`arg`, `alias`, `comprehension`, `withitem`) which the leak
guard reads as a name from the adopter's code, refusing the whole report. Both are
now declared. The product guard never saw either, because its word pattern needs
three characters — so a two-character keyword was never checked at all.

A test caught the third: `except OSError as cause:` had no shape, because the
enclosing set was a list of statement types somebody typed out. `PY-ERROR:1` fires
on exactly that line, so the most disputable Python rule was the one that could
not be reported. The set is now `ast.stmt` and the two clause types, which is the
language's own answer instead of a list.

**What it still cannot shape** is a line that is only a comment, which is where
the silenced-type-checker rule fires when `# type: ignore` sits on its own line.
A comment is not a statement and looper refuses rather than guesses, the same
answer the TypeScript side has always given for a blank line. Named here rather
than papered over.


### 91 · `wrong` — the engine was built once and then never again, in silence — cleared

2026-08-18. Found by the same adopter, on the same pin bump, and it is the worse
half of finding 90. `engineIsBuilt` decided with `existsSync` on
`vendor/rust-law/target/release/looper-rust` and nothing else. The bump rewrote
`patterns.rs` and `visitor.rs`; the binary from the previous build stayed; every
`.rs` file in that project went on being judged by the rules the bump replaced,
and nothing anywhere said so.

It surfaced only because their suite caught it: `tests/rust-cases.test.ts` failed
nine cases, eight of them "wanted fires, got silent" — the four macro rules from
finding 69, which the adopter had just pinned and could not use. Anyone who did
not run looper's own suite would have seen no signal at all. **A stale law reports
as a clean file, which is the failure mode this project exists to prevent.**

`engineIsBuilt` now compares the binary's mtime against the newest file under
`vendor/rust-law/src` and the two manifests, and a stale binary is not built. The
build path was already there: `judgeRust` and `commandsUnder` call `buildEngine`
whenever the engine is not ready, so the rebuild needs no new command and no
person who knows it exists. Measured on the adopter's project: 8.09 seconds on the
first run after the source changed, 0.216 seconds on the next, and one rebuild
rather than one per edit.

Three claims said "built once" and all three were true and misleading. README.md
and the Python section of this document now say it is rebuilt when its own source
is newer, and the test that asserts the engine is ready stops telling people to
run `cargo build` by hand, which is a command the project constitution says
nothing load-bearing may hide behind.


### 90 · `blunt` — a type-position `as` is not a cast, and finding 69 shipped without noticing — cleared

2026-08-18. Found by an adopter bumping their pin to the commit that closed
finding 88: two `TYPE:4` violations appeared in code nobody had touched, both
`sqlx::query!("...", role as &str)`, which is sqlx spelling a column type
override. Neither is a cast and neither can truncate anything.

Finding 69 taught four rules to read macro tokens. `scan_tokens_for_casts` fired
on the bare word `as` and never looked at the next token. Inside a macro's tokens
`as` has at least three other jobs: a qualified path `<T as Trait>::method`,
syn's `parse_macro_input!(x as Args)`, and the sqlx override. The rule's ban text
was never about any of them — "it truncates, wraps, rounds and re-signs in
silence" is a sentence about numbers.

The scan now fires only when the next token names a numeric primitive, `_`, or
opens a pointer type. Typed syntax is untouched: a real `ExprCast` still fires
whatever the target, because there syn has already said it is a cast. That split
is deliberate and is pinned by a case, so nobody unifies the two paths and brings
this back.

**Finding 69 said "No false positive found" and that was a corpus too small to
find them.** It read 2,538 files and hand-checked ten hits, all numeric. Run
properly — both engines over the same 599,944 lines from `~/.cargo/registry` —
the answer is **33 hits removed, 0 added, no other rule moved**, and all 33 read
by hand are false positives: 17 `<#ty as Trait>::…` inside `quote!`, 12
`<Self as Trait>::…` inside `mac!`, 4 `parse_macro_input!`. Every one of them is
in a proc-macro crate, which is the class of code the old ten-hit sample missed
entirely. **1,077 `TYPE:4` hits still stand.**

The lesson is not about `as`. It is that "no false positive found" is a claim
about the corpus, not about the rule, and finding 69 wrote it as though it were
the second. A diff of the two engines over one corpus is the check that cannot be
satisfied by a lucky sample, and it is cheap: two builds and one script.


### 89 · the rule that would have caught finding 88, written after it did not — cleared

2026-08-18. The project constitution said "nothing load-bearing sits behind a
command they must know to type", and on the same day I shipped `STACK:1`, a rule
that could only ever fire in a project where somebody re-ran `looper init`. The
line was satisfied in letter — I was not asking a person to type anything, an
agent would — and the thing was still unreachable, because an agent only runs a
command it knows exists.

The replacement says what the old one meant: **the only input is a sentence.** No
command, no file name, no order of steps, and no knowing that a step exists.
looper does it on an ordinary turn and says what it did.

It replaces rather than joins, because this half of the doctrine is paid on every
message and a line that restates a line already there costs the same as a real
one. Measured after the change: 9,513 characters of a 9,800 ceiling on a turn
that pulls several branches, against 9,657 for the first draft of the same rule,
which is why it was cut before it shipped.

**What it cannot do is gate anything.** There is no mechanical check for "a person
had to know something", and this project does not describe barriers that are not
wired — so this is a design rule that lives in the doctrine and is enforced by
being read, which is the honest description of it.

### 88 · a rule that could only reach people who type commands — cleared

2026-08-18, immediately after finding 86, and it is the same failure this project
already has a rule against. `STACK:1` cannot fire without `CURRENTSTACK.md`, and
`CURRENTSTACK.md` was written only by `looper init`. Every project that adopted
looper before today would never have one, so the rule would be shipped, tested,
documented and unreachable.

The person whose project it is does not run commands. That is the premise the
whole product rests on — they talk to an agent — and "nothing load-bearing sits
behind a command they must know to type" has been in the project doctrine the
entire time. I wrote the feature that broke it and did not notice until it was
pointed out.

The `Stop` hook writes the document when it is absent, at the end of an ordinary
turn, and says out loud that it did. Written once, never rewritten: after that the
file belongs to the project and looper only reads it. Demonstrated on a project
that had adopted looper and never re-ran `init` — one turn ended, the file
appeared, and the message explaining it came back with it.

### 87 · a rule fired and the report threw it away without a word — cleared

2026-08-18, found while building `STACK:1`. `Category` in `src/law/rule.ts` is a
fixed union and `STACK` was not in it. Nothing type-checks this repository —
finding 75, open on purpose — so the invalid category was accepted at runtime,
and `formatReport`, which walks a fixed list of categories, dropped every
violation the rule produced without printing anything.

The rule worked. `surveyProject` returned the finding. `looper law` said "2
problems" and listed two others. A rule that fires and is never shown is worse
than a rule that does not exist, because the count is now a lie in the quiet
direction.

The category is added, and the cause is fixed rather than the instance: the
report counts what it printed against what it was handed, and when the two differ
it says so under a heading that reads **looper is broken**, names the category it
did not recognise, and tells the reader to open an issue because it is our bug
and not theirs.

### 86 · the stack a project actually has, written from measurement — cleared

2026-08-18. Asked for after noticing that nothing stops an agent adding a Python
service to a Rust codebase. `looper init` built a baseline of rule violations and
never looked at what the code was written in, so there was no record of the stack
and nothing to judge against.

`CURRENTSTACK.md` is written at `init` from what is on disk — a manifest where
there is one, the files themselves where there is not — grouped by backend and
frontend because `shapeOf` already computes that split. Nothing is invented: a
project with no frontend gets an empty section saying so, which is the honest
answer and the one this project's constitution insists on.

`STACK:1` refuses a source file in a language the document does not list, and the
way through is one row added in the same commit, where a reviewer sees it. It
forbids nothing — it insists the decision is visible, which is the bargain
`.looper/secrets.allow` already makes.

**Demonstrated end to end.** A Rust project adopted: looper measured `Rust —
Cargo.toml, and 2 file(s)`, and an empty frontend. An agent then added
`jobs/queue.py`; `STACK:1` refused it, naming the row to add. The row was added,
and the same commit went through.

**Two things building it corrected in the design**, both written back into
`docs/PLAN.md`. A rule about which language a file is cannot live inside one
language's checks — it went into `CHECKS`, which only runs over TypeScript, so it
never saw a `.py` file, which is the entire case it exists for. And frameworks
are recorded but not gated: a new dependency is ordinary work, a new language is
a new runtime, and firing on the first would be the blunt rule this project
refuses to ship.

### 85 · the Python half on a real project, and two defects only size could show — cleared

2026-08-18. Every Python rule so far had been measured by running the reader
directly over a list of files. That is not the same as adopting a project, and
the difference showed two things immediately.

**The corpus.** Python's own standard library, copied into a fresh repository and
adopted properly: 2,767 `.py` files, 574 of them distinct and the rest duplicated
to push the file count up.

| what | number |
|---|---|
| `looper law` over 2,767 files | 4.7 seconds |
| `looper init`, reading every file and building the baseline | 4.9 seconds |
| problems recorded as outstanding | 2,050 |
| length of the argument list to the reader | 56 KB against a 2 MB limit |

**Defect one, and it was mine from this morning.** When the reader is missing,
`judgePythonIn` named every unjudged file — which was right for one file and
printed **2,770 identical lines** for a project. A missing reader is one failure
about the whole run; a file that will not parse is a failure about that file. It
says the count once now, and still names the file when there is only one.

**Defect two came out of fixing the first.** The closing line counts what could
not be read, and it was counting *notes* rather than files, so a grouped note
turned 2,769 unjudged files into the number 3. `Survey` carries `unjudged`
separately from the notes now, and both lines are true at any size.

**The three promises the baseline makes to an adopter, checked through the real
gate rather than a unit test:**

- a new problem in a new file is refused — `PY-ERROR:1` and `PY-ERROR:2` both
  fired on it, and nothing was committed
- the 2,050 that were already there are forgiven — a commit touching an untouched
  part of a file with existing problems went through
- touching a line that already had a problem stops forgiving it —
  `zoneinfo/_tzpath.py:132` was refused the moment it was edited

The first attempt at that third check proved nothing, because the line picked was
not in the baseline. Worth recording: a test that passes for the wrong reason
looks exactly like one that passes.

### 84 · the failure raised without a name, and the seventh rule closing the set — cleared

2026-08-18. `raise Exception("something went wrong")` names no failure at all.
The only way to catch it on purpose is `except Exception`, which catches every
other failure in the program at the same time, so the caller cannot retry the one
worth retrying or report the one a person could fix. The message in the brackets
is readable by a human and by nothing else.

**This is where the stricter-reading tie-break did not apply, and saying so
matters.** Two readings were available: `Exception` and `BaseException` alone, or
`RuntimeError` with them. Measured before choosing: `raise Exception` appears
twice in 167 files of the standard library and not once in 176 files of the
adopting project, while `RuntimeError` appears 54 and 29 times. The tie-break
reads "where two readings are defensible" — and these are not equally so. The
harm named is that nothing downstream can act on the failure differently. That is
exactly true of `Exception` and not true of `RuntimeError`, which a caller can
catch on its own. The narrow reading is the accurate one, not the weaker one.

Nine cases first, and three of them guard the boundary: `Exception` as a **base
class** is how a named exception is made and stays silent; `except Exception` is
catching rather than raising and stays silent; a bare `raise` keeps whatever it
already was.

Both of the standard library's hits are the shape — `raise Exception('verify:
unknown type %r')` in `enum.py`, and one in `inspect.py` — each a "this should
never happen" that a named class would say better. Zero in the adopting project.
It is the quietest of the seven on mature code, and that is the point: its value
is on code being written now, where `raise Exception(...)` is what gets typed
first.

**All seven Python rules are built.** Across 167 files of Python's own standard
library and 176 hand-written files of an adopting project, nothing was unreadable
at any point, and every rule was judged against code nobody here wrote before it
counted as done.

| rule | standard library | adopting project |
|---|---|---|
| `PY-ERROR:1` swallowed error | 348 | 51 |
| `PY-ERROR:2` made-up answer | 147 | 63 |
| `PY-ERROR:3` failure with no name | 2 | 0 |
| `PY-TRUTH:1` mutable default | 23 | 0 |
| `PY-TRUTH:2` `assert` outside tests | 206 | 4 |
| `PY-TYPE:1` silenced checker | 1 | 8 |
| `PY-LAYER:1` star import | 23 | 0 |

### 83 · the star import, and the standard library demonstrating why — cleared

2026-08-18, the sixth Python rule and the quietest of all: 23 findings in 167
files of Python's own standard library, **none** in 176 hand-written files of the
adopting project.

`from x import *` takes every name a module has without saying which. Afterwards
nobody can tell where a name came from — not a reader, not an editor, not a
checker — and adding a name to the module you imported from can break this file
without anyone touching it.

Six cases first: a star import from a module and from a package beside it, both
firing; naming what you take, importing the module and reading through it,
renaming a single name, and a multiplication that is not an import at all, all
silent.

**All 23 read, none a misread.** Every one is the same idiom: CPython pulling a C
accelerator or a platform module's names in wholesale — `from _heapq import *`,
`from _socket import *`, `from posix import *`.

**One of them is the rule's own reasoning, in the wild.** `datetime.py` carries
two star imports four lines apart, `_datetime` and then `_pydatetime`. The second
silently replaces names from the first, which is exactly what the rule says
happens. CPython does it deliberately and can defend it. The point is that the
shape is indefensible anywhere it is not deliberate, and nothing in the file tells
those two cases apart — which is the argument for the rule rather than against
it.

### 82 · silencing the type checker, which is the annotation quietly ceasing to be true — cleared

2026-08-18, the fifth Python rule and the quietest. Python's annotations only
mean anything because a checker reads them, so `# type: ignore` is not a small
local exception: it is that line's annotation ceasing to be true while still
reading as though it were, to everyone who comes after.

**It needed something the other four did not.** A comment is thrown away by the
syntax tree, so the reader now runs Python's `tokenize` beside `ast`. Both are in
the standard library, so the cost is still nothing at all.

Seven cases first. Fires on `# type: ignore`, on `# type: ignore[arg-type]`, and
on `# mypy: ignore-errors`, which does it to a whole file at once. Silent on the
old-style `# type: int`, which says what a thing is rather than refusing to
check; silent on an honest annotation; silent on a string containing the words;
and silent on prose that merely mentions the marker, because the check reads the
start of the comment rather than searching it.

**Both corpora, and every hit read.** 1 in 167 files of the standard library, 8 in
176 hand-written files of the adopting project. Nine of nine, none a misread. Each
of the eight is an annotation that has stopped being true: a `Callable` assigned
`None`, a union never narrowed, an attribute the declared type does not have, a
variable reassigned to a different shape. One is the optional-import idiom —
`ZoneInfo = None` under an `except ImportError` — and even that has an honest
spelling in `ZoneInfo: type | None`, which is why the rule keeps its verdict and
hands the spelling back instead.

### 81 · the made-up answer that hides a failure, in Python — cleared

2026-08-18, the fourth Python rule, and the first written as a deliberate mirror
rather than a fresh design. `TS-ERROR:3` already bans answering a failure with a
made-up value, and copying its shape exactly is how the two languages keep
agreeing about what a fabricated answer is, instead of drifting apart one rule at
a time.

Both of its exemptions are reproduced. A handler that **uses the caught error** is
doing something with it, so it steps aside. A handler that **returns the same
shape the `try` block already returns** is being consistent rather than inventing
— that is what stops a function whose honest answer is `None` from being refused
for saying so in the one place it must.

Ten cases first: `None`, `[]`, `""`, `0`, `{}` and a bare `return`, all inside an
`except`, all firing; re-raising, using the error, matching the try block's own
answer, and returning a real value from a real place, all silent.

**Both corpora.** 147 in 167 files of the standard library, 63 in 176
hand-written files of the adopting project. Fourteen of the latter were read and
all fourteen are the shape: a missing key becoming an empty list, malformed XML
becoming no rows, an unreadable settings file becoming an empty dictionary.
Several already carried `# noqa: BLE001`, so Ruff had reached the same verdict and
been silenced line by line.

**Two are worth naming rather than counting.** A command-line program that prints
the problem and returns exit code 2 — the caller genuinely can tell, so that is a
report and not a fabrication. The rule still fires, because the exemption that
would cover it is not decidable, and instead it owes the case a spelling:
`raise SystemExit(2)` says the same thing from anywhere in the program, survives,
and does not pretend to be data. That line is now in the rule's own suggestions,
which is the difference between a strict rule and a blunt one.

### 80 · `assert` is a check that disappears when it matters — cleared

2026-08-18, the third Python rule, and the one the plan predicted would be
argued with. `python -O` deletes every `assert` statement. A validation written
with one passes every test on the machine it was written on and is simply absent
where it runs, so the first sign of it is the wrong data already saved.

**The argument was about scope, not substance.** Two readings were available:
every `assert` outside a test file, or only those checking data that arrived from
outside. The second cannot be decided from syntax. The first can, and it hands
back a legal spelling — `if amount <= 0: raise ValueError(...)` — so it is the
strict reading rather than the blunt one, and it shipped. Test files are silent by
path on pytest's own discovery rules: `test_*.py`, `*_test.py`, `conftest.py`, and
anything under a `tests` folder, because that is where `assert` is the idiom and
pytest rewrites it.

**Nine cases first.** Fires on a validation carrying a message, on an assert
narrowing a type, and on an internal invariant — because `-O` deletes all three
alike. Silent in each of the four test-file spellings, on `raise`, and on a
function merely *named* `assert_positive`, which is a name and not a statement.

**Both corpora.** 206 outside test files in 167 files of the standard library, 4
in 176 hand-written files of the adopting project. All 4 were read: two are
validations carrying a message, which is the harmful case exactly, and two narrow
a type for the checker, which `if x is None: raise` does honestly. The standard
library's are mostly internal invariants — the language's own documented use —
and they vanish under `-O` no differently, which is why the rule does not try to
tell the two apart.

All three Python rules together, on the two corpora: 348, 23 and 206 in the
standard library; 51, 0 and 4 in the adopting project. Nothing unreadable in
either.

### 79 · the mutable default argument, Python's oldest trap — cleared

2026-08-18, the second Python rule. `def add(item, items=[])` builds that list
once, when the function is defined, so every caller who leaves the argument out
shares it and one call's append is still there on the next. It reads as a fresh
empty list to everyone who has not been bitten by it.

Thirteen cases first, from the ban text. Fires on a list, dict or set written
out, on `list()`, `dict()` and `set()`, on a method argument and on a
keyword-only one. Silent on `None`, which is the legal spelling; on a tuple, a
number, a string and a `frozenset`, none of which can be changed; on a list built
inside the body; and on a name used as a default, which the rule cannot see into
and does not guess about.

**Both corpora, again.** 23 findings in 167 files of Python's own standard
library. **None at all** in 176 hand-written files of the adopting project — this
rule is silent on real application code. All 23 were read rather than sampled and
none is a misread. Seven are the idiom used knowingly: `copy.deepcopy`'s
`_nil=[]` is a sentinel compared by identity, `pkgutil`'s `m={}` is deliberately
the cache, `cgitb`'s `lnum=[lnum]` captures a value for a closure, `difflib`
keeps a counter across calls. Each has a clearer spelling than the one it uses,
which is the line this project draws: a rule is judged on whether it is decidable
and hands back a legal spelling, not on whether every hit is a live bug.

**What it deliberately does not do.** `def f(t=datetime.now())` has the same
cause — the default is built once at definition — but firing on every call in a
default position would be blunt where this is decidable. Named here as a separate
rule if it is ever wanted, so the boundary is not rediscovered later.

### 78 · Python is read, one rule deep — cleared

2026-08-18. The third language, and the first whose own toolchain checks nothing:
TypeScript has a compiler and Rust refuses to build, while Python runs a file
with a typo in it until the line is reached.

**The reader costs no dependency.** Python ships its parser in its standard
library as `ast`, so `src/law/python/read.py` is a script driven over the same
one-JSON-object protocol as the Rust engine. The resolved npm tree is unchanged
and still cannot open a socket. The one new requirement is `python3`, and when it
or the reader is missing every `.py` file is named as unjudged rather than
counted clean — checked by moving the reader aside and reading the message.

**A third file may now start a process,** so `.looper/doctrine/law.md` and the
invariant test that holds it both changed in the same commit. That sentence named
two files and would otherwise have quietly become false.

**Twelve cases first,** from the ban text: a bare `except:` fires even when its
body works, because it also swallows the interrupt that stops the program; an
`except` whose body is `pass` or `...` fires; logging, re-raising, and
`raise Missing(path) from error` stay silent; and `with suppress(...)` stays
silent because it names what is being ignored. A class or function body of `pass`
is not an except, and a `try` with only a `finally` has no handler at all.

**Two corpora nobody here wrote.** Python's own standard library, 167 files: 348
findings. An adopting project's hand-written Python, 176 files: 51. Fourteen of
the standard library's were read line by line and every one is the shape the ban
text names, with no misreads. Several are considered decisions rather than
accidents — `except KeyError: pass` where the key is genuinely optional — which
is what makes the legal spelling load-bearing: `with suppress(KeyError):` says
the same thing and names it. The volume is high there because that code predates
`suppress`; an adopter's baseline carries it.

Corroboration worth recording: several findings in the adopting project already
carried `# noqa: BLE001`, Ruff's own blind-except rule switched off line by line.
A second tool had reached the same verdict and been silenced, which is the
failure a gate exists to prevent.

looper's own reader is judged by its own rule — proven by adding a bare `except`
to `read.py` and watching `PY-ERROR:1` fire on it.

**The doctrine's own warning came true on the way in.** "Ask what a file is
before asking what is wrong with it" was written after the gate reported every
Rust file as unreadable TypeScript. `surveyProject` learned the third language
first, and the two gates did not: looper refused this very commit with
`TS-ERROR:8` on `read.py`, a file it had just written a Python parser for. Both
`judgeStaged` and the edit gate now choose the law by extension, and a scratch
project proves it — one `.py` file, one `PY-ERROR:1`, nothing committed.

### 77 · `wrong` — the doctrine banned four things and the rule caught three — cleared

Found on 2026-08-18 while reviewing PR #41, which arrived with two plain casts.
The law doctrine says `as`, `as unknown as`, `!` and `any` each turn a check into
an assumption. `TS-TYPE:3` banned `as any`, `as unknown as T`, `<T>value` and
`!` — everything except the plain `as SomeType`, which is the commonest of them.
A rule that says less than its own doctrine is the failure that let ten rules
ship saying less than they did.

Seven cases first, from the ban text. Fires: a plain cast to a named type, and to
a builtin. Silent: `as const`, which asks for narrowing rather than claiming a
type; an import renamed with `as`; an export renamed with `as`; `satisfies`; and
a type guard, which is the legal spelling. One more case came out of the change
itself — `x as unknown as User` is two cast nodes on one line, and reporting one
decision twice is noise, so the outer cast is skipped and it counts once.

**Twelve in this repo, all with a legal spelling already sitting next to them.**
Eleven were `value as Node` after a `typeof value === "object"` check, and
`parse.ts` has exported `isNode`, a real type guard, all along. One was
`JSON.parse(readFileSync(...)) as readonly Probe[]` in `audit/probe.ts`, which is
the exact harm the rule names — unvalidated text claimed as a type — and now goes
through `probesIn`, which checks every field and says which probe is malformed.

**One is pardoned, in the open.** `tests/law.test.ts` builds a rule whose `pass`
is a word no rule declares, to prove the engine refuses it rather than guessing.
The type system says that value cannot exist, which is the point of the test, so
there is no honest spelling. It is named under `[exempt]` in `law.toml` with the
reason, which is one visible line in a diff and arguable forever.

**Run over code nobody here wrote:** 437 files of an adopting project, its own
source and its libraries. The old rule found 209, the new one 456 — 247 more,
across 85 files. Fourteen were read line by line and every one is the shape the
rule bans: `JSON.parse(saved) as WinState` from localStorage, three
`localStorage.getItem(...) as AdPlatform | null`, an `r.cpa as number` behind a
filter that does not narrow, a literal array claimed as `MetaAttribution[]` where
`satisfies` is the honest spelling, and eight loose config values claimed as
`string[]`. No false positive was found.

The cost is volume, not wrongness, and the baseline is what carries it: on
adoption the existing count is recorded rather than refused, so only new `as` is
blocked.

### 76 · `wrong` — a password with a full stop in it, and a credential word with more name after it — cleared

Contributed as PR #40 from a project that had adopted looper, found by pointing
the scanner at its own `.env` line by line. Two holes, both real, both verified
here against that file.

A named credential's unquoted value was matched as `[^\s"';,()\[\]{}.]{12,}` —
no full stop allowed — so `SUPABASE_DB_PASSWORD=` followed by fifteen characters
with a dot in them matched only up to the dot, fell under the twelve-character
floor, and read as nothing at all. The dot was excluded to keep
the `config.apiToken` read quiet, which is a credential being read out of an
object rather than being one. Dots are allowed in a value now and that exemption
is explicit instead: an unquoted value that is nothing but a dotted path of
identifiers is code. Quoted values are exempt from the exemption, because
`"s3cret.value.here"` in quotes is a literal.

Separately, `SECRET_KEY=` never matched, because the word boundary after the
credential word cannot land on an underscore. A credential word may be followed
by more name, and the suffix must start with a separator, which keeps
`tokenizer` and `authorName` out.

**What the review added.** The contribution arrived without the third thing this
project asks for: a run over code nobody here wrote. Run here, on 232
hand-written files of the project it came from, it added three findings. One was
the real password it was written to catch. Two were `_token =
data.session?.access_token ?? null` — a token read out of an object through
optional chaining, which the new exemption did not recognise because it only knew
a plain dot. `A_DOTTED_PATH` accepts `?.` now, and two cases hold it.

After that fix: 232 hand-written files, one new finding, and it is the true one.
238 files of this repo, no change. On a wider sweep of 4,000 files that includes
`node_modules` and Next.js build output, it adds 28 findings, all false —
a constant whose name ends in a credential word followed by another word,
holding a quoted string of ordinary words joined by dots. Not fixed, and left
here rather than hidden: the gate reads staged diffs, that code is never staged,
and the shape appeared zero times in the 232 files of real source. The
forty-character ceiling on the path exemption is kept for the same reason it
cost one of those 28 — fewer exemptions is the stricter reading.

The three comments the contribution carried were removed. Its own checkout was
the one whose hooks were not loading, so looper's comment rule never judged it.

### 75 · `missing` — a strict tsconfig that nothing runs — cleared

Raised 2026-08-18 while fixing finding 74, and answered the same day by
measuring rather than arguing.

`src/law/ts/comment.ts` used the bare name `Comment` with no import. The only
`Comment` in scope is the browser's, and `tsconfig.json` sets `lib: ["es2023"]`
with no DOM, so that name resolved to nothing and was wrong for as long as it had
been there. Fixed in finding 74's commit; the question this finding asked was why
nothing said so.

**Half the premise was wrong.** The tsconfig is not read by nothing — every
editor's TypeScript service reads it, which is a real check on anyone writing
here. What was actually missing is that `audit/**` was never in `include`, so
those files got no checking at all. That is fixed here, and it costs nothing.

**The other half is refused, on this project's own invariant.** An automated
`tsc` in `npm test` needs TypeScript installed, and
`tests/invariants.test.ts` scans the whole resolved tree — devDependencies
included — for anything that can open a socket. Installed into a scratch folder
on 2026-08-18 and searched, TypeScript ships one:

```
typescript/vendor/vscode-jsonrpc/lib/node/main.js   requires "net"
```

So adding it fails that test, and the only way to pass would be to narrow the
scan to exclude devDependencies. That is widening a check to let one thing
through, which the security doctrine names as the failure that turns every future
leak into something nobody hears about. The dependency is refused and the
strictness settings stay, because an editor honours them.

The guard is already in place: anyone who adds TypeScript later will be stopped
by the same socket test, with the file named.

### 74 · `blunt` — a file of deliberately key-shaped fixtures has no legal spelling — cleared

Raised while fixing finding 73, on 2026-08-18, and left open on purpose.

`audit/secrets-probe.ts` exists to hold eighteen shapes the commit gate must or
must not catch, so it is a file of realistic keys by design. The values are
assembled at run time from two halves, because a file of whole ones is
indistinguishable from a file of real ones to any scanner and GitHub's push
protection refuses it. Touching any of those lines re-adds them to the diff and
the gate refuses the commit on six.

Both routes the refusal names are closed here. `.looper/secrets.allow` wants the
exact value, which is the one thing the splitting avoids. The inline
`looper:allow-secret` marker is a comment, and `TS-DEAD:2` bans comments in this
repo. A stricter reading with no compliant path is broken rather than strict,
which is this project's own standard, so the gate owes that file a spelling.

Fixed by giving the marker a spelling this repo can write. `TS-DEAD:2` already
let one comment through — a `/// <reference` line — on the principle that a
comment a program reads cannot go stale, which is the rule's whole reason. The
`looper:allow-secret` marker is read by looper on every commit, so it joins it,
under the narrowest reading that works: a `//` comment whose text is exactly the
marker and nothing else, with code before it on the same line. The marker alone
on a line does nothing for the commit gate, prose that merely mentions it is
prose, and `/* looper:allow-secret */` is not it. Four cases hold those.

Nine lines in `audit/secrets-probe.ts` are marked — the nine the gate actually
refuses, not all twelve that are key-shaped, because the fewest exemptions is the
stricter reading. `tests/invariants.test.ts` now fails if either gate starts
refusing that file again, and fails if the markers are deleted, which was checked
by deleting them.

Run over code nobody here wrote: 336 TypeScript files, 6 belonging to a project
and 330 third-party libraries under its `node_modules`, holding 2,345 comments.
The old rule and the new one found the same 2,345. No comment anywhere became
invisible.

## The second audit — what it covered and what it found

Run before the repository was made public, over both languages and the seam
between them.

**Foreign code.** 3.2 million lines of Rust nobody here wrote — 80 distinct
crates from the cargo registry, generated bindings and duplicate versions
excluded after a first attempt at 7.1 million lines turned out to be half
`windows-sys` in five versions. 631,188 violations, 27 of 28 rules firing.
`LAYER:1` never fired because it needs a declared layer map and none of them has
one; `LAYER:3` fired once in 3.2 million lines and fires correctly on a written
case, so a `static` holding a callable is simply rare. The TypeScript corpus was
re-judged after everything that changed and is stable at 5,759 violations over
56,366 lines. **No false positive was found in either.** The rules are behaving
on strangers' code.

**Evasion.** 24 adversarial cases against the Rust rules' own ban text. Four
real gaps, in finding 36. Two of the six disagreements were the harness naming
the wrong rule, which is worth saying: the stdout handle it flagged is caught by
`LOG:2`, exactly as designed.

**Failure modes.** A malformed `Cargo.toml`, an empty one, a `.rs` file with no
crate above it, a malformed `tauri.conf.json`, Rust that does not parse, a
forty-crate workspace. Nothing wedged and nothing hung. Findings 37 and 38 came
out of it, and finding 39 came out of following one of them.

**Scale.** Forty crates and 2,400 lines of Rust: `looper law` 231ms, edit gate
101ms, commit gate 272ms. Nothing here is slow.

**Claims and consolidation.** Findings 35 and 40.

**Eight findings, and one of them stops the tool working.** Finding 39 blocks
every Rust edit with a message saying the file is not TypeScript. Findings 34
and 37 are both the same shape as finding 16 from the first audit — a verdict
that is honest about what it looked at and silent about what it did not.

The pattern across all three of 34, 37 and 39 is worth naming, because it is not
a coding mistake. Each is two correct pieces meeting: `.rs` added to the judged
extensions meeting the edit gate; a root-only shape check meeting a workspace
layout; a per-crate engine meeting a per-file promise. Every one of them was
tested, and every one was tested the way it was built rather than the way it
will be used.

## Cleared

### 73 · `wrong` — the wait for a lock could outlast the lock's own life, and steal it — cleared

Caught by CI on the macOS runner of 2026-08-18, run 32119159687, and it is not a
macOS fault. `withLock` waited fifty tries of twenty milliseconds — one second —
but decided a lock was abandoned when the file was more than five seconds old,
measured against the clock at the moment it looked. On a loaded runner the sleeps
overshot and that one-second wait took 5,300 milliseconds, so the waiting process
pushed the clock past the threshold itself, read a lock a live process was still
holding as dead, deleted it and took it. Two writers on one file, which is the
loss adopter issue #29 was filed about, arriving through the fix for it.

The lock is now judged against the moment we arrived, which nothing that happens
while we wait can move. A lock already stale when we got there is still swept —
that is the crashed-holder path and it stays open — but one taken while we wait
is never ours to break, and the wait is a wall clock of one second rather than a
count of sleeps that can each run long.

Reproduced without needing a loaded machine: a holder that took the lock 4,900
milliseconds ago is alive, and the old code crosses five seconds inside its own
one-second wait.

```
holder took the lock 4.9 seconds ago and is still alive
  old code: held  lockStillThere=false fileWritten=true
  new code: busy  lockStillThere=true  fileWritten=false
```

Two tests hold it: the sweep decision as arithmetic against arrival, and a live
lock surviving the whole wait. 401 tests pass.

### 72 · `wrong` — a promise given a name and then abandoned was not a floating promise — cleared

Adopter issue #37, raised as an argument rather than a patch because the fix
needs following a binding rather than matching a shape. `const p = save(order)`
with nothing waiting for it was silent: the check only read expression
statements. Their point about why it had been left: the identical shape is how
you start two things and wait for both, so firing on the declaration would punish
the pattern the rule exists to produce.

So the rule follows the name now. A promise bound to a name that nothing else in
the file mentions is a floating promise wearing a name; one that is awaited,
returned, passed to `Promise.all` or given a `catch` is not. Three cases hold the
three shapes.

Their closing line is the reason this was worth doing: it is the most common
spelling of the bug in code that has been through review once, because a reviewer
asking "what is this promise for" is answered by giving it a name.

### 71 · `blunt` — an empty callback written inline was called a half-built function — cleared

Adopter issue #38, filed as an argument about what a rule should mean, with the
counter-argument written out fairly. `TS-DEAD:3` bans "a function that exists but
does nothing", and fired equally on `export function save(o) {}` and on
`addEventListener("click", () => {})`.

The first three shapes they list deserve it: a name that is importable, callable,
and looks implemented is the harm the rule describes. An arrow written inline as
an argument is not that — it has no name to go stale, nobody else can reach it,
and `addEventListener("click", () => {})` says nothing happens on click, which is
a decision. There is also no legal spelling for it, and a rule with no compliant
path is broken by this project's own standard.

So the ban text says what it means now — a function that exists *under a name* —
the `instead` list names the inline case as not this rule, and the check skips a
function written directly as a call argument or a JSX attribute value.

Measured on `node_modules`, 13 files: 6 hits before, 5 after. The one that went
is `Object.assign(() => {}, {…})`; the five that stay are all named methods with
empty bodies. On looper's own 79 files: 0 before and 0 after.

### 70 · the last five engine gaps, and thirty-seven false positives nobody had counted — cleared

The five that came out of the audit of 2026-08-17, fixed 2026-08-18 now that this
copy is ours. Cases first, nine of them including the traps:

- `x == Delimiter::None` fired as though it were `Option::None`. A `None` is
  Option's only when it stands alone or is written `Option::None`; any other
  owner is a different type's variant. Fixed in the typed reader and again in the
  token scan, because `matches!(d, Delimiter::None)` reaches the second one.
- `Err(_) => "".to_string()` now reads as the empty string it is, along with
  `String::from("")` and `.to_owned()`.
- `panic!("not implemented yet")` joins `todo!`. A panic that names a real
  failure is still the crash door and stays silent.
- `let g = Option::unwrap; g(v)` — the family reached as a path rather than a
  method, which also catches `Option::is_some` handed to `.any()`.
- `Command::new("printenv")` is an environment read; `Command::new("git")` is not.

**Measured on 40 crates from `~/.cargo/registry`, 2,538 files, before this week
and after: 197 hits started, 37 stopped.** The 37 are the finding nobody had
counted — every one read by hand is another type's `None`: `syn::PathArguments::None`,
`State::None`, `attr::Default::None`, `MappedLocalTime::None`. That rule had been
wrong on real code all along, and the only reason it was listed as "fires toward
strictness" is that nobody had looked at what it fired on.

### 69 · `wrong` — four rules went blind one character inside a macro — cleared

Adopter issue #19, the half that was theirs to report. `TYPE:4` (`as`),
`TRUTH:2` (`std::env`), `DEAD:3` (`todo!`) and `LAYER:2` (a `crate::` path) all
went silent inside `format!`, `assert_eq!`, `tracing::info!` or any
`macro_rules!` passing its argument through, while the same expression on its own
line fired. Four other rules see through macros perfectly well, because they read
tokens rather than typed syntax — so these four now do too.

Cases first, as the contribution rules require: the fourth blind spot had no case
and now does, along with two traps — a `use ... as ...` rename inside a macro
body, and a `use crate::x` statement, both of which must stay silent. 29 cases,
0 mismatches, 0 not fixed yet.

Then the part the rules demand before a rule change ships — run it over code
nobody here wrote. 40 crates from `~/.cargo/registry`, 2,538 files: **195 new
hits over 18 crates**, ten read line by line, every one the shape the rule bans
(`index.length as usize` inside `vec!`, `crate::Protocol` in a macro argument,
`MAX_OL as i32` inside `debug_assert!`). No false positive found.

This is the first rule change made inside the copied engine since it became ours.
`tests/invariants.test.ts` fails if a newer copy arrives without the three
scanners, and `PROVENANCE.md` says what to re-apply.

### 68 · `missing` — nothing in `audit/` spoke Rust, and a crate died in silence — cleared

Adopter issue #19, whose closing line is the finding: *the reason this went
unnoticed is that nothing in `audit/` speaks Rust.* 156 cases, every one
TypeScript, while 28 rules judge a Rust project.

There is a Rust corpus now — `audit/rust-cases.ts`, written from the rules' own
ban texts, run against the real engine by `audit/rust-judge.ts` and by the suite.
26 of 26 agree. Their four macro blind spots are held as cases marked as known
misses, so the day one starts firing the suite says so; they are recorded in
`vendor/rust-law/PROVENANCE.md` beside the five from finding 36, because rule
logic went upstream at the time; that policy was dropped on 2026-08-18 and these
are open work here.

Writing the corpus turned up something their report did not have: a crate with
one unparseable file had **every other file in it silently unjudged**. Only the
bad file was named. That is finding 37's shape one level up — the per-file
verdict was fixed, the per-crate silence was not — and `looper law` now says how
many other files went unjudged with it.

### 67 · `wrong` — a note deleted for being wrong survived beside the corrected one — cleared

Adopter issue #27. `writeAtomically` copied the prior file to
`<path>.looper-backup` before every write, nothing deleted it, and `init` wrote
no ignore rule — so the residue was committed by the next `git add -A`. Their
measurement on the file that matters:

```
recall.md holds: ['## 2026-08-18 — the wrong fact', '## 2026-08-18 — a second fact']
backup holds:    ['## 2026-08-18 — the wrong fact']
```

`recall.md`'s own header says to delete an entry the moment it stops being true.
The backup made that impossible: a wrong note, in a committed file, that a future
reader has no reason to distrust — which is precisely what that header exists to
prevent.

The backup exists to survive a crash between write and rename and has no job
afterwards, so it is deleted once the rename succeeds. The two merges `init`
reports — `.claude/settings.json` and `.mcp.json` — keep theirs, because there the
kept copy is the point and the path is printed to the person. Verified end to
end: two notes written, one deleted, nothing anywhere in the project still holds
it.

Their audit of `adopt` and the baseline in the same batch found nothing, which is
worth recording too.

### 66 · `wrong` — one empty file removed a directory from the law, in silence — cleared

Adopter issue #28. `underAnotherLaw` treated any `law.toml` as a nested project
governing itself, including an empty one, and said nothing. Their measurement: two
sinful files judged, then `: > src/legacy/law.toml`, then one judged — the
directory gone from the sweep, gone from the commit gate, and `looper status`
reporting nothing left to fix.

Their framing is what makes this a defect rather than a feature: the README grades
the three ways out — a pardon, a knob, off — and this was broader than all of them
and quieter than any of them, with no line in a diff to argue with. Undocumented
anywhere, too.

Two changes, and neither removes the behaviour, which is right and is what makes
a submodule work. An empty file is no longer a declaration: the nested `law.toml`
must say something. And `looper law` and `looper status` name every directory that
governs itself, why, and how many files it covers — because self-governed and
unjudged are indistinguishable from outside unless the tool says which is which.

### 65 · `wrong` — two notes written at once, one note kept — cleared

Adopter issue #29. An agent is encouraged to call tools in parallel, and `recall`
is a read-modify-write: read the file, add the note, write the whole thing back.
`writeAtomically` keeps the file from tearing and does nothing about two readers
starting from the same state. Their measurement, ten concurrent writes, three
rounds: 28 of 30 survived, with no error and nothing in the file to show a note
had gone.

Reproduced here against the committed code — 5, 6 and 6 of 10 — and with the fix,
10, 10 and 10. The fix is the lock they suggested: an exclusive `wx` lock file
around the whole read-modify-write, with a bounded wait, a stale-lock sweep after
five seconds, and the write that cannot take it saying so rather than reporting
success. `recall`, `forget` and the baseline shrink all take it.

Adoption writes are left as they are, deliberately: they happen inside one
tool call somebody made on purpose, not on a hook that can overlap with itself.

The sentence in their report that made this worth doing before the rest: a lost
note is not written, not corrected, and believed to exist by the agent that wrote
it — and it only shows up as work redone weeks later, which is what recall exists
to prevent.

### 64 · `wrong` — a wrapper walked past the only gate that catches `--no-verify` — cleared

Adopter issue #30. `--no-verify` tells git to skip its own hook, so for that
commit the agent-side gate is the only check standing; and `bash -c "git commit
--no-verify -m x"`, `env git commit …` and `(git commit …)` all passed, because
`intentOf` requires the first word of a segment to be `git`.

Their suggested shape was taken exactly, including the part about what not to do:
not a better shell parser — that is unwinnable, and the here-document false
positive from earlier the same week is what over-reaching looks like. Instead the
one flag that disables the other gate is commit intent wherever it appears, and a
bare `-n` is too when the segment mentions git. All five spellings from their
report are refused through the real gate; `echo -n`, `grep -n` and `sort -n` are
untouched.

Alongside it: `commitMessageScript` printed the shell's error and passed in
silence when the entry could not be found, while `preCommitScript` explained
itself. The message gate is what catches a password pasted into a commit message,
so it says the same two lines now.

### 63 · `wrong` — a wandering shell silently swapped the doctrine and stopped the gates — cleared

Adopter issue #26, and it happened to them rather than being constructed: mid-audit
they noticed the rules at the top of their turn were looper's own constitution
instead of their project's. Nothing was misconfigured. Their shell was simply
still inside `vendor/looper` from the previous command.

Measured on their project, same hook, same configuration, two directories:

```
inject from the repo root          4957 chars, their constitution, not looper's
inject from inside vendor/looper   9439 chars, looper's constitution, not theirs
edit gate from the repo root       RUST-ERROR:1, RUST-TYPE:1
edit gate from the submodule       nothing at all
```

An entire turn governed by another product's rules, and a violation caught a
second earlier passing in silence, because `targetOf` resolved the file against
the wrong root and `{ kind: "outside" }` says nothing.

The answer was already in the hook line: `init` writes
`$CLAUDE_PROJECT_DIR/...` and nothing in `src/` ever read that variable. The
project is now that variable when it is set, the nearest folder above holding a
`.looper/doctrine` when it is not, and `looper status` names which of the two it
used — because their closing argument is the real one: they only noticed because
the two constitutions differ enough to spot by eye. An adopting project whose
doctrine merely resembled looper's would have run on the wrong rules forever.

### 62 · `missing` — the suite was green here and red everywhere else — cleared

Found by looking at CI, 2026-08-18: every run of the `tests` workflow had failed
since it was added, on all four legs, while `npm test` passed on this machine.
Eight failures, of two kinds.

Seven were the Rust tests. They need `vendor/rust-law/target/release/looper-rust`,
which exists here and on no fresh checkout, and the engine builds `--offline` so
a runner with no cargo cache cannot make one. The failure said *the fixture does
not violate anything*, which is the absence of an engine wearing the costume of a
clean verdict. CI builds the engine before the suite now, and a test at the top
of the Rust file says plainly when it is missing rather than letting seven
verdicts be silently meaningless.

The eighth was mine: a budget test that allocated the real registry and expected
something to be dropped. On this machine the working tree is always dirty so
branches fire; on a fresh checkout nothing has changed, no branch fires, and
there is nothing to drop. A test that depends on the tree being dirty is a test
that passes for a reason it never states.

### 61 · `blunt` — the escape hatch refused every real file, including looper's own — cleared

Adopter issue #25, and it is the worst kind of defect this project can have: the
canon tells an agent that when a rule is wrong the answer is `looper report`, and
`looper report` refused 13 out of 13 real files. Their measurement, on looper's
own source.

The check compared **every word of the finished report** against every word in
the project, with a hand-written list of 43 words exempted as "ours". So the
report's own prose — `checking`, `against`, `writing`, `refused`, `network` — and
its own structural vocabulary — `ImportDeclaration`, `Identifier`, `name1`,
`kind=const` — collided with the project and were called a leak. Nothing from the
project ever leaked; the tool was refusing to send its own sentences back to
itself. An allowlist of our own words can never be complete, because our prose
grows.

The check is now the other way round, in two parts that are checked differently
because they are written by different people. **The shape** may contain only what
the skeleton itself can emit — syntax kinds, structural keys, grammar words, and
a numbered stand-in per name — and the skeleton now replaces any structural value
it does not recognise with `removed`, so the vocabulary is closed by
construction. **The sentence the agent typed** is checked against the project,
but only for words shaped like names from code, because the first version refused
`the suggested spellings do not apply here` on `the` and `apply`.

Measured after, on the same 13 files: 10 written, 3 with no shape at that line,
0 refused. The report also carried `version: 0.0.0` while the package said 0.1.0,
which is fixed with a test holding them equal — triage starts from that line.

### 60 · `wrong` — a symlink loop killed the walk, and a link out of the tree was judged as ours — cleared

Adopter issue #24. One `ln -s . src/loop` ended `looper law` and `looper init`
in a raw Node stack trace, at the moment somebody first meets the tool — and it
does not take a hostile project, only a `current -> .` deploy link. They offered
two fixes and left the choice; both were taken, because neither alone is right.
The walk now remembers directories by their real path, so a loop is stepped over
and named once rather than either crashing or listing itself forever, and every
`readdir` and `stat` failure is recorded the way `shape.ts` always did.

Their related question is answered in the stricter direction: a file whose real
path is outside the project is no longer judged, and is named as skipped. A
governance tool that reads a file outside the tree it was pointed at, and reports
the verdict under a name inside it, is doing something nobody asked for.

### 59 · `missing` — the doctrine map could be wrong three ways in silence — cleared

Adopter issue #20, and their framing is the finding: the map was the one part of
looper that could be wrong without anybody hearing about it, while the law says so
for a misspelled rule id, the secrets gate says so for a file it cannot read, and
the freshness hook says so when git is missing.

`looper status` now names a branch the project mapped with no document behind it
— the typo case, where an area silently has no rules — and a glob of theirs that
matches nothing in the project, which is how a map rots after a rename. Only what
the project itself wrote is checked: telling a TypeScript project that the Rust
set matches nothing is noise, and noise is how the useful line gets skipped. The
injection path now carries the same sentence the freshness gate already had when
git cannot be read, because a fraction of the rules arriving with no word about
it is worse than none arriving at all.

### 58 · `missing` — the law could not be pointed at a path — cleared

Adopter issue #17. `looper law` judged everything or nothing, and on their
repository that is nine seconds for a question usually about one crate. It takes
paths now. Measured here: the whole project 753 ms, one directory 144 ms.

### 57 · `blunt` — the secrets gate could not see the name a real project uses — cleared

Adopter issue #21, measured on their repository: 119 lines flagged out of 688,138
scanned, zero real secrets. Underscore is a word character, so `\b` never matched
between `rcon_` and `password` — every credential name that had been thought
about worked and every one that had not was invisible. A `TODO` in a comment
excused the whole line, so the likeliest line in any codebase to carry a
credential was the one line skipped. A single-case value was never random enough
to look at, which is exactly what thirty-two hex characters are. Unquoted
assignments, where `.env` files live, were not read at all.

The widenings were run over foreign code before shipping, twice failing first:
24 lines of `@babel/parser` on `tokens = file.tokens.map(…)`, then looper's own
`FRESHNESS_BYPASS`, because bypass ends in pass. Shipped: `node_modules`, `src`
and `vendor` zero, `tests/` only the nineteen deliberate fixtures. It then
refused the commit that added the new fixtures, and refused the command that
tried to pardon and commit in one breath, because that command carried them too.

### 56 · `missing` — init named a file it never created — cleared

Adopter issue #18. The secrets gate tells somebody to write a value into
`.looper/secrets.allow`, and `init` scaffolded the constitution, the map and the
doctrine README but not that. So the first person to hit a false positive created
it from an error message, without the header every other file looper writes
carries. It is scaffolded now, empty, with the header saying that each line in it
is a review somebody will read later. Their own counter-argument — that an empty
allowance is better than an inviting one — is answered by the file arriving with
nothing in it and a test that fails if it ever arrives with anything.

### 55 · `missing` — status could not say what a rule set costs — cleared

Adopter issue #16. `looper status` reported the total and what was dropped, so
the person writing doctrine could see that something was crowded out and not
what to cut. When two branches were being dropped on their project every turn,
finding the cause meant running `wc -c` and doing arithmetic against the canon.
It now prints a line per set with its width, and for a branch, how much of it is
looper's and how much is theirs — because only one of those halves is the
author's to cut.

### 54 · `wrong` — the line reporting a drop was not paid for — cleared

Filed by an adopting agent as issue #14, measured on their own project against
the commit that introduced it. The marker naming what was dropped was appended
after the budget was enforced, so their turn came to 9,831 characters against a
9,800 budget with `overflowed` reporting false. The marker names every dropped
set, so it grows with exactly the case it fires on.

Room is taken for it before the answer is assembled now, dropping one more set if
that is the cost, and `overflowed` means the text handed over is larger than the
budget — which happens only when the constitution alone is. Measured here across
five budgets afterwards: at 9,800 the answer is 8,861 characters; at 3,000 it is
3,298 and says so, because the constitution alone is 3,179.

This one was filed within an hour of the change that caused it, by an agent
reading `looper status` on its own project. That is the return path doing the
thing it was built for.

### 53 · `missing` — four subjects the canon judged and never taught — cleared

Proposed by an adopting agent as issue #13, with the evidence that they are
generic: two unrelated projects had written several of the same lines
independently. `security` is the sharpest — looper ships a secrets gate that
refuses commits, and shipped no doctrine at all about handling a secret. The
others are `evidence`, `frontend`, and `sources` for reading prior work.

Each landed with the map that keeps it selective, and each had to say what it
replaces: `evidence` took the measurement line out of looper's own `process.md`,
`sources` cut looper's own to the two lines that are only true here, and a line
in `security` about untrusted input was deleted before it shipped because the
canon law already says it.

Measured after, on this repo: a TypeScript edit 6,520 characters, a Rust edit
4,174, a screen 4,198, settings or a key 7,233, a document 5,004, doctrine 5,453
— against a 9,800 budget. A turn touching all six areas is 12,557 and drops the
least connected set, which is the second half of this finding: dropping used to
be alphabetical, which is a coin toss dressed as a rule. Branches are now ordered
by how much of the turn they actually govern.

### 52 · `missing` — the canon's own branches reached nobody — cleared

Filed by an adopting agent as issue #13, which reported the symptom: the one
sentence about writing doctrine lives where an adopter never receives it. The
cause underneath it is larger. A branch was injected only when the project's own
`map.toml` tied it to the files being touched, and `init` writes that map empty,
so **every** canon branch waited on a file the adopter had never written.

Measured on a fresh project editing a `.ts` file, before and after:

```
before:  2216 characters, branches: []
after:   5900 characters, branches: ['doctrine', 'law', 'rust']
```

The TypeScript law — the thing looper is built around — was never delivered to
anyone who had not written a map by hand. Cleared by giving the canon its own
default mapping, which a project's own entry overrides one branch at a time.

Two branches were added with it: `doctrine.md`, so the rules for writing rules
arrive when somebody edits their doctrine, and `rust.md`, because the engine
enforced 28 Rust rules while the canon said nothing about writing Rust. The lines
moved into `doctrine.md` were deleted from looper's own project half in the same
commit — the rule they state is the rule they had to obey.

The budget guard was changed in the same pass, and both halves are in
`docs/PLAN.md`: it asserted that every set together fits in one turn, on the
grounds that anything else drops in silence, which stopped being true when the
allocator began naming what it dropped. It now asserts that the constitution plus
any one branch fits, and that a drop is always named. Every set at once is 11,324
characters against a 9,800 budget, measured 2026-08-18.

### 51 · `blunt` — one TypeScript section took the whole Rust half down — cleared

Filed by an adopting agent as issue #4. `LawConfig` carried
`deny_unknown_fields`, so any top-level table the engine does not own made it
reject the entire `law.toml` — including `[entry]` and `[ts]`, which are the
sections looper's own TypeScript half tells a project to write, in the same file
by design. A Rust project stopped being governed the moment it gained a
TypeScript entry point, and it failed as "could not read law.toml" rather than as
anything naming the cause.

Reproduced on a real crate, then fixed and reproduced again:

```
before:  {"error":"could not read …/law.toml: unknown field `entry`,
          expected one of `max_loc`, `max_fn_loc`, `truth`, `deputies`, …"}
after:   {"violations":[{"rule":"ERROR:5","file":"main.rs","line":1}]}
```

The four `deny_unknown_fields` on the inner tables are untouched, and a typo
inside one is still refused by name: `sanctm` gets `expected one of sanctum,
env_files, trace_symbols`. That is the half worth keeping — there, an unknown
field really is a concession nobody notices.

This is a change to copied source, which finding 36 had refused. The policy is
narrowed rather than dropped, and both halves are written there.
`tests/invariants.test.ts` fails if a newer copy of lawkeeper arrives with the
attribute restored, so the change cannot be undone in silence.

### 50 · `blunt` — the vendored engine could not build inside a Rust project — cleared

Filed by an adopting agent as issue #3, with the fix already measured. A looper
checked out inside a Rust project is claimed by that project's workspace, so
cargo refuses the crate outright and looper's Rust half never builds — in exactly
the projects it exists for. Reproduced here, then fixed and reproduced again:

```
with the line:     cargo accepted the crate
without the line:  error: current package believes it's in a workspace when it's not
```

The fix is `[workspace]`, empty, at the top of `vendor/rust-law/Cargo.toml`. It
makes the crate its own root so no ancestor manifest can claim it. It is a line
in the manifest rather than a change to the copied source, and `PROVENANCE.md`
records it beside the one file there that was already ours.

### 49 · `wrong` — `TAURI:1` pooled the commands of every app in the repository — cleared

Filed by an adopting agent as issue #11. `commandsAnswering` merged every
`#[tauri::command]` from every `src-tauri` directory into one set, so a
repository with two Tauri apps accepted `invoke("x")` in app A when only app B
answers `x`. Nothing connects them at runtime, so that call fails exactly the way
the rule exists to prevent, and the rule said it was fine.

One set per app now, keyed by the directory above its `src-tauri`, and a file is
judged against the app it lives under. A file under no app gets no verdict rather
than a wrong one, which is the same choice made everywhere else here.

### 48 · `blunt` — a recall note had to use a character the project's own rules forbid — cleared

Filed by an adopting agent as issue #12. Note headings parsed only with an em
dash, and `.looper/recall.md` is written by the agent and read by the team — so a
project whose constitution bans the em dash had to break one rule or the other on
every note. Worse, a hyphen did not fail loudly: the heading simply did not parse
and the note was swallowed into the entry above it. Either separator is accepted
now.

### 47 · `blunt` — nothing could be kept out of looper's law — cleared

Filed by an adopting agent as issue #7. `OUTSIDE_THE_LAW` was a fixed list of
directory names, so a looper checked out inside a project was judged under its
host's law: 35 violations in code nobody there wrote, and `looper law` exiting 2
forever. A gate that can never pass is a gate people learn to skip.

Two exclusions now, both decidable and neither of them a setting anybody has to
discover: a directory holding its own `law.toml` is governed by itself, and a
path named in `.gitmodules` belongs to whoever wrote it. The walk skips them and
so do the edit and commit gates, which is the half that matters — an exclusion
only the survey honours is not an exclusion.

### 46 · `wrong` — a live pardon reported as dead weight — cleared

Filed by an adopting agent as issue #6, and it is the worse half of 45. The Rust
engine matches `[exempt]` keys against the path it reports, which is relative to
the crate's `src`; looper resolved the same key against the repository root,
found nothing, and said the pardon does nothing. Somebody believing that message
deletes a concession that is holding a rule off generated code.

A key is now taken as live if any judged file matches it the way the engine
matches it. That costs a walk of the project, but only when the key is not found
at the root: measured 2026-08-18 on this repo, 119 files, 0.6 ms.

### 45 · `wrong` — no rule id spelling satisfied both halves of the law — cleared

Filed by an adopting agent as issue #5. The Rust engine hard-errors on a
namespaced id, so `RUST-TRUTH:1` in `law.toml` breaks every judgement in the
project, and `TRUTH:1` — the only spelling that works — was reported on every
single edit as not a rule, with a `TS-` id offered as the correction for a `.rs`
file.

Both spellings are accepted now, matched with the same `withoutLanguage` the
pardon lookup already used, and a suggestion is drawn from the language of the
file it is about.

### 44 · `missing` — init left an existing `.mcp.json` alone and never said the tools were unwired — cleared

Filed by an adopting agent as issue #9. For a git hook it will not overwrite,
init prints the exact line to add and says the check is not running. For an
existing `.mcp.json` it printed `yours already, left alone` and nothing else, so
looper's `doctrine` and `recall` tools silently never appeared — in every project
that already runs any MCP server, which is the common case.

Cleared by merging it the way `.claude/settings.json` is merged: looper's server
added under `mcpServers`, every other server untouched, the previous version kept
beside it. Demonstrated on a project whose file already named another server —
both are in it afterwards. Where the file cannot be parsed, init leaves it
untouched and prints the block to add, because a file we cannot read is not one
we may rewrite.

### 43 · `missing` — init wrote hooks that could not run, and reported them as wired — cleared

Filed by an adopting agent as issue #8. `reachedFrom` knew two shapes — installed
on PATH, or `node_modules/.bin` — so a looper checked out inside the project fell
through to `installed`, and every hook was written as a bare `looper` that is not
on PATH. The hooks were present, correct-looking, and dead. That is precisely the
failure `docs/PLAN.md` had already named as the one init exists to prevent, which
is worth recording: the principle was written, and the case it was written for
was the case nobody checked.

Cleared twice over. Init recognises a checkout — a directory under the root or
under `vendor/` holding `bin/looper.js` and a `package.json` naming looper — and
wires the hooks to it. Then, whatever shape it picked, it checks that the command
resolves and says so in the report when it does not. Demonstrated: in a project
with a checkout at `vendor/looper`, the hooks now read
`node "$CLAUDE_PROJECT_DIR/vendor/looper/bin/looper.js" inject`.

### 42 · `blunt` — the commit gate reading the harness's own ids as the project's secrets — cleared

Filed by an adopting agent as issue #1, 2026-08-18, and it was the one that
stopped work. On `PreToolUse` the secrets gate scanned the whole hook payload
rather than the command inside it. The payload carries a session id, a tool-use
id and a transcript path, all random by construction, so a share of them read as
high-entropy secrets:

```
whole payload, the old behaviour: [{"file":"the commit message","line":1,
  "kind":"a 30-character random-looking string","excerpt":"toolu_01LC8wVMbR…"}]
command only, the new behaviour : []
```

Three failures at once, and the third is the expensive one. It refused a clean
commit; the value was different on every call, so the remedy the message offered
— add it to `.looper/secrets.allow` — could never work; and it named the commit
message for a string that was never in the commit message or the diff. A refusal
with no compliant path is the exact shape this repo calls broken, and it is why
the agent went looking for a way round and settled on asking its human to type
the command.

Cleared by reading the command out of the payload and scanning only that, named
as the command rather than the message. The staged-file scan beside it was always
correct and is untouched. `tests/secrets.test.ts` holds both halves: a payload
whose ids are random and whose command is clean passes, and a key typed into the
command is caught and labelled as the command.

### 41 · `missing` — the advertised install was dead on every machine but this one — cleared

Found 2026-08-18, by doing the only thing every adopter does: installing the
package the way `README.md` tells a stranger to, into an empty project. `npx
looper init` never reached a line of looper's own code.

```
Error [ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING]: Stripping types is
currently unsupported for files under node_modules, for
".../node_modules/looper/src/main.ts"
```

looper's entry point was `src/main.ts`, and Node refuses to strip types from any
file under `node_modules`. No hooks, no `.looper/`, no gate — and no error anyone
could act on. Every test in the suite passed throughout, because every one of
them ran from this checkout, where stripping works. The same shape as findings
34, 37 and 39: tested the way it was built, never the way it is used.

Cleared by `bin/looper.js`, plain JavaScript that strips looper's own types at
startup and then imports `src/main.ts` — no build step, no dependency, and
nothing running on an adopter's machine at install time. The argument against the
two alternatives is in `docs/PLAN.md`, "How looper runs once it is installed".
Measured 2026-08-18 on Node 22.23.2, 20 runs of each: it costs about one
millisecond on the heaviest path.

The control is `tests/installed.test.ts`, which copies the package into a real
`node_modules` directory and runs `init` there. It fails on the old entry point.

A project adopting looper hit exactly this, on its own machine and a different
Node build — the same error, at a different line of Node's own source. It was
never version-specific: any Node refuses, and the entry point was dead
everywhere. The fix is confirmed working there.

It was first read here as a version problem, and that reading is kept because
what it bought is worth keeping: the fix is now run across versions rather than
one. The suite passes on Node 22.23.2, 24.19.0 and 26.7.0, and a packed install
wires a project and refuses a bad commit on both 22.23.2 and 26.7.0. Below Node
22.18 there is nothing to strip types with, and
that used to be a stack trace about a missing export; it now names the version it
is on and the version it needs, verified on Node 22.10.0, and exits 1 — which the
commit hook reads as "could not check", so it fails open.

### 40 · one concession, two spellings — cleared

A project writes it once now. looper's TypeScript half reads `[truth]` when
`[ts]` does not answer, and reads a bare string as readily as a list, because
the Rust convention is `sanctum = "config.rs"` and looper's was a list of one.
`[ts]` still wins where a project wrote both, so nothing that worked stops
working.

Pointed at the real project, looper now reads what was already there:

```
sanctum       = config.rs
env_files     = config.rs, main.rs
trace_symbols = tracing::warn, tracing::error
```

Before this it read none of them and silently used its own defaults.

The pardon seam went the same way. `[exempt] "file.rs" = ["TRUTH:1"]` — the
engine's spelling — now pardons `RUST-TRUTH:1`, and so does `RUST-TRUTH:1`
itself, which is the id every report prints. Either is honoured; neither is
silently ignored.

### 35 · the plan describing rules that do something else — cleared

There is one Rust table now rather than two. The first was written from a design
before the engine was read, the rules were then written from the engine, and the
two were never reconciled — so for a day six ids described something other than
what they ban.

The two that were not renumbering but promises are named as what they are:

| id | would ban | state |
|---|---|---|
| `RUST-ERROR:10` | a blocking call inside an `async fn` | **not built yet** — Tokio's most expensive quiet failure, and neither the engine nor looper reads for it |
| `RUST-TYPE:6` | an `unsafe` block outside a declared module | **not built yet**, and the real answer is a deputy — `#![deny(unsafe_code)]` under `RUST-ERROR:5`, off unless a project declares it |

And a control, because finding 30's lesson is that prose does not hold: the plan
check now compares what each row *says* against what the rule it names *does*,
not merely that both exist. It caught a missing row the moment the old table was
deleted.

### 36 and 33 · gaps in the vendored engine — reopened as ours 2026-08-18, cleared by finding 70

Five known misses, all in code we did not write:
`Err(_) => "".to_string()`, `panic!("not implemented yet")`, `Option::unwrap`
through an alias, `Command::new("printenv")`, and `== Delimiter::None` read as
`Option::None`.

Not fixed here, and that is the decision rather than an omission. Patching
vendored source means owning the change forever and conflicting with every
future copy — `PROVENANCE.md` says as much about updates, and it would be a poor
sort of consistency to break that the first time it was inconvenient. They are
written into `PROVENANCE.md` beside the code, where anyone reading it sees what
it does not catch, and they belong upstream.

Three of the five are rare enough in real Rust to argue about. Two are one word
from a spelling the rule already catches, and are worth an issue.

**Narrowed on 2026-08-18 by finding 51, then dropped the same day.** The
narrowing was: plumbing may be changed here, rule logic goes upstream. The
dropping was: upstream is not a place work goes. Checked that day — the project
has never had an issue opened on it by anybody, and the one change sent from here
on 14 August is still open with no review and no comment.

So these five are open work rather than somebody else's, and the reasoning above
is kept because it was right about the cost: a change to this copy has to be
re-applied by whoever brings a newer one in. That is paid for by listing every
change in `PROVENANCE.md` and by a test that fails if a re-copy drops one.


### 39 · every Rust edit blocked, told it was not TypeScript — cleared

The edit gate now asks what language the file is before it asks what is wrong
with it. A `.rs` file goes to the Rust law; everything else goes where it went.

```
a violating Rust edit  ->  [RUST-ERROR:1] src/good.rs:1   exit 2
a clean Rust edit      ->  exit 0
```

The rule that fires is the right one, and the message is about Rust.

### 34 · Tauri only recognised at the root — cleared

`shapeOf` now walks the tree for `src-tauri/tauri.conf.json` rather than looking
in one place, four levels deep, skipping `target`, `node_modules`, `dist` and
`vendor`. `rustUnder` becomes every directory it found, and `TAURI:1` gathers
commands from all of them rather than from one assumed path.

On a fixture shaped like the real project:

```
shape : tauri — the Rust under crates/launcher/src-tauri is the backend,
        and the TypeScript around it is the interface
[RUST-ERROR:1]  crates/launcher/src-tauri/src/main.rs:7
[TAURI:1]       crates/launcher/ui/src/App.tsx:4
```

All three consequences gone: the shape is right, `DATA:1` no longer fires on the
interface, and the boundary rule catches `invoke("gret")` against `fn greet`.

Writing that walk cost two of looper's own rules first. `TS-ERROR:4` and
`TS-ERROR:3` caught a `catch { return }` and a `catch { return false }` in it —
a directory that cannot be listed is a real answer and was being swallowed. It
now reads directory entries once with their types, so there is one failure to
handle rather than two, and the unreadable directories are named in what the
shape says about itself.

### 37 · one unparseable file silencing a whole crate — cleared

`RUST-ERROR:9`, looper's own rather than the engine's: *a file that cannot be
read as Rust at all*. The engine judges a crate at a time, so one broken file
takes the whole crate with it — the blast radius is larger than `TS-ERROR:8`'s,
which is why the rule says so in its reason.

The engine's refusal names the file and the line, so the rule points at it:

```
[RUST-ERROR:9]  src/broken.rs:1
```

Ids 1 to 8 in each category are the engine's; 9 upward are looper's. Written
into the plan, which the control immediately demanded.

### 38 · the welded message — cleared, and a sibling with it

The doubled opening is gone: the engine's detail already begins "could not
read", and that prefix is stripped before looper adds its own.

The sibling was worth more than the message. A crate that could not be judged
for **any** reason — a malformed `Cargo.toml`, not just unparseable Rust — still
ended with `nothing to fix`. That line now says what is true:

> looper: 2 files, and nothing to fix in the ones it could read. 1 could not be
> read, named above — those were not judged at all, which is not the same as
> being clean.


### 32 · nineteen `??` against a doctrine claiming none — cleared, by building the rule

The doctrine said *"there is not one `??` in the tree"* and there were nineteen.
The fix was not to correct the sentence. It was `TS-TRUTH:1`, the rule the plan
calls its worked example and one of the ten marked **not built yet**.

Built at the strength the plan chose — every spelling of a default born outside
the sanctum: `??`, `||` as a value, `??=`, `||=`, a default parameter, a
destructuring default, `if (!x) x = 5`, and a spread merge over a defaults
object. Twelve cases from the ban text, all passing on the first run.

**Then the corpus made it a better rule twice.**

The plan's reasoning was that banning the construct outright removes all
judgment. That holds for `??`, which only ever supplies a missing value. It does
not hold for `||`, which is also the boolean or, and the corpus said so at once:

```ts
return (value && value instanceof Subscriber) || (isObserver(value) && isSubscription(value));
return _parentage === parent || (Array.isArray(_parentage) && _parentage.includes(parent));
```

Neither births a default. A first attempt excused `||` inside a test position,
which was not enough — the same shape returned from a function still fired. The
line that works asks nothing about booleans at all: **a default's right operand
is a value.** A literal, an identifier, a member expression, an object, an
array, a `new`. If the right side is a call or a comparison, it is logic, not a
fallback. `given || "anonymous"` fires; `isA(x) || isB(x)` does not.

That is the doctrine's own instruction followed to the letter — *a blunt rule is
not a strict rule; sharpen it rather than soften it* — and it took the corpus
from 460 hits to 431, all of which are real.

**And then it was run over this repo, which is the part that counts.** 79
violations, in the repo whose doctrine claimed there were none. Every one fixed
rather than baselined:

- `src/present.ts` is new: `required(value, what)` throws when something that
  must be there is not, and `countIn(counts, key)` names zero as an answer once
  instead of nineteen times.
- Eleven default parameters became explicit arguments, and where that would have
  churned every call site, one function became two named ones — `countIn` and
  `countWhere`, `found` and `foundAtCap`. A pair of honest names costs less than
  a hidden default.
- The test assertions that read `(said[0] ?? "")` now read `first(said)`, which
  fails loudly on an empty list instead of quietly asserting against `""`.

`??` in looper's own code: **nineteen, then zero.** The four that remain are
inside the rule's own ban text, where they are the thing being named.

The doctrine line no longer makes a claim it cannot keep. It now says
`TS-TRUTH:1` holds that line, not the sentence — which is finding 30's lesson
applied to the file that taught it.


### 24 · the security rules now have a category of their own — cleared

`SECURITY` exists, it sorts first so it leads any report, and `DATA:1`,
`DATA:2`, `NODE:1` and `NEXT:1` are in it. The banner says what is actually at
stake:

> **SECURITY** — someone is going to send your program something you did not
> expect, on purpose. these are the ways that ends badly.

Before, "someone can empty your database" printed under *every fact has one
home. two homes means none.*

### 28 · the adoption message no longer contradicts itself — cleared

A freshly adopted repo used to be told *"5 problems still standing. Fix every
one above, then run again"* and then, one line later, that none of them blocked
anything. The loud sentence was the wrong one, and it was the first thing a new
adopter ever read.

The report now knows whether anything is new:

```
looper found 2 problems, all of them older than looper.
…
2 problems above, and none of them are blocking you.
All 2 of these were already here before looper arrived, and are recorded in
.looper/baseline.toml. They do not block a commit until you touch the line
they are on. Fix them when you are next in that file.
```

and when some are new it says which, and that those are the blocking ones.

### 6 · line 0 — cleared

`TS-DECOMPOSITION:1` reported every hit at line 0, which no file has, so the
`file:line` in the report went nowhere when clicked. It now points at the first
line past the cap — a line that exists, and the useful one.

### 29 · the canon said nothing about the highest-stakes rules — cleared

It restated four rules in prose and did not mention SQL, a shell or injection
once, though `DATA:1` and `NODE:1` are the two most serious things in the set.
It now carries one line covering all four security rules.

Paying for it cost two lines, because the budget test refused it twice — 10,072
characters, then 9,905, against 9,800. What went:

- the bullet instructing on defaults in one file, which is `TS-TRUTH:1`, one of
  the ten marked **not built yet**. The other half of finding 29 was that the
  canon instructs on a gate that is not there, so this is both halves at once.
- *"Small functions, plain types, no cleverness"* — judged against the canon's
  own bar, which is a line a model would **not** reliably follow unprompted.
  A model largely does this, and `TS-DECOMPOSITION:1` measures the part that
  matters.

### 31 · the parser's vocabulary — cleared, and it found one more gap

Not the refactor the finding proposed. A misspelled node type compiles, reviews
clean and makes its rule silently never fire, and renaming 56 literals into
constants moves that risk rather than removing it. What removes it is checking
them: `tests/vocabulary.test.ts` parses every file in the repo plus every case
in `audit/cases.ts`, collects every node type a parse actually produces, and
fails if any literal a rule compares against a `type` is not among them.

It found seven node types the rules match and nothing exercised —
`DoWhileStatement`, `ForInStatement`, `SwitchStatement`, `FunctionExpression`,
`TSDeclareFunction`, `TSEnumDeclaration`, `TSTypeAssertion`. Writing cases for
them found a real gap: `export declare function find(id): User | null` was
invisible to `TS-TYPE:2`. Fixed.

`looper` then refused the scanner itself, for a `catch { return }` that
swallowed a parse failure — the rule strengthened two findings earlier, catching
its author inside the commit that was building a control. It reports what it
could not read now.

### 25 · the repair prompt has two readers — cleared

The line above the suggestions said **write it this way instead**, followed by
`throw new NotFound(id)` and three more that name classes existing in no
project. To a model that is right; it knows to invent the class. To the person
the constitution names, it is an instruction that does not compile.

It now says: *the shape that works instead — the names in it are examples, not
code to copy*. Nine words, and both readers are told the truth.


### 20 · the commit gate crosses its own timeout — cleared

The gate is priced per staged file at about 4.5ms, and 30 seconds ran out at
roughly six thousand of them. That is not a daily commit; it is the first commit
of a repo that has just adopted looper, when the whole project is staged and the
tool is being judged.

Hooks now carry their own timeout rather than sharing one. The commit gate gets
**300 seconds**, written down as `COMMIT_GATE_TIMEOUT_SECONDS` beside the
measurement that chose it: 30.3s at 6,001 files, so 300 covers a first commit of
roughly sixty thousand. Every other hook stays at 30, because they are flat in
project size and a slow one there means something is wrong.

The per-file cost is the parse, and it is near the floor already.

### 21, 22 · the startup cost — measured, and neither fix pays

Both are closed by measurement rather than by a change, and the numbers are the
point.

**Finding 22's premise was wrong, and measuring it is what showed that.**
`main.ts` does import the survey, the MCP server, the initialiser and the rest
for every command — but `registry.ts` reaches the same graph anyway, because
every capability contributes to injection. Making each command load its own
machinery cut the eager import from 86ms to 64ms and moved the wall clock **not
at all**: 87ms against 86 before, inside the noise. It was reverted. A change
that buys nothing is not worth the two bugs it introduced while I wrote it, and
it introduced exactly two.

What the tension resolved into is better than either side of it. `TS-LAYER:2`'s
own advice already read *"if something genuinely must load late, the entry point
decides that, not a function buried three levels down"* — the words permitted it
and the code had no way to allow it. The rule now carries the same
`[entry] files` valve `TS-LOG:1` has. That is a correctness fix regardless of
performance, and it is tested.

**Finding 21 stands at 86ms and is accepted.** Bare node is 17ms; the module
graph is 64ms; the judging is about 10. `@babel/parser` is 9ms of it and the
rest is Node stripping types from roughly a hundred modules, one process at a
time. `NODE_COMPILE_CACHE` was tried and saved 6ms, 86 to 80. The only fix that
would move it is a build step, which this project refused deliberately and for
reasons that have not changed.

So the price of no build step is now a number rather than a feeling: **69ms per
process, about 430ms of a turn with three edits.** Written down here so the next
person deciding it is deciding with the figure in front of them.


### 15 · tests written from the code, not the ban — cleared

Two halves: the sweep, and the thing that stops it happening again.

**The sweep.** Every assertion in the suite that expects zero was read against
the reason given for it. Sixty-eight of them, and five carry an explanation.
All five are boundaries between rules rather than rationalised holes — *"as any
is TS-TYPE:3; counting it here would report one mistake twice"*, *"the tag is
the escaping; flagging it would teach people to avoid the safe spelling"*, *"on
the server this is TS-TRUTH:2's business, not this rule's"*. The one bad case
was REACT:1's, which asserted zero under a title claiming the opposite, and it
was corrected when finding 10 was cleared.

**The control.** `audit/evasion.ts` had grown to 126 cases written from ban text
and nothing ran it. It is now split — `audit/cases.ts` holds the cases,
`audit/judge.ts` runs them, `audit/evasion.ts` prints, and
`tests/ban-text.test.ts` fails the suite on any disagreement. A second assertion
requires **every** rule to have at least one case written from its words.

That second one failed immediately on four rules nobody had written a ban-text
case for: `TS-DECOMPOSITION:1`, `TS-ERROR:1`, `TS-ERROR:7` and `NEXT:1`. Writing
them found a real gap in `TS-ERROR:7`:

```ts
class C {
  async close(): Promise<void> {}
  [Symbol.dispose]() { this.close(); }   // was silent
}
```

Its `calledNames` collected bare identifiers only, so a method called on `this`
— which is how a dispose actually reaches its own clean-up — was invisible, and
it never knew a class's own async methods were async. Both fixed.

The harness now stands at **135 cases, 0 mismatches**, run on every commit. A
rule that stops doing what its own words say is a red suite from here on.


### 30 · the doctrine forbids this in prose — cleared, and it took 26 and 27 with it

`tests/plan-is-true.test.ts` is the control. Two assertions:

- a rule the plan's table names is built, or its row says **not built yet**
- a rule that exists is named somewhere in the plan

It failed on its first run with exactly the two findings that prompted it, and
with one more nobody had noticed: `TS-ERROR:8`, added during this clearing three
days after the audit and never written into the design record. The control
caught its author's own omission on the run that introduced it, which is the
whole argument for having it.

**Finding 26** is now true rather than fixed. Ten rows say **not built yet** —
`TS-LOG:2`, `TS-TRUTH:1`, `TS-TYPE:1`, `TS-ERROR:2`, `TS-ERROR:5`, `TS-LAYER:1`,
`TS-LAYER:3`, `TS-DECOMPOSITION:2`, `TS-DECOMPOSITION:3`, `TS-TESTS:1`. The
doctrine sanctions exactly this: *covered by a test, or stated plainly as not yet
built*. They are still worth building and the table still says what each would
do; what has changed is that the document no longer claims a barrier that is not
wired.

**Finding 27** is fixed rather than annotated. Chunk 4 gained the table it never
had, with a row for each of `REACT:1`, `REACT:2`, `DATA:1`, `DATA:2`, `NODE:1`
and `NEXT:1`, and the TypeScript table gained `TS-ERROR:8` with its origin — the
only rule here with no ancestor, born from this audit.

The doctrine line that named the principle now names the gate, and paying for
that sentence cost something. Adding it took the always-on tier to 9,807
characters against a budget of 9,800, and the budget test refused it:

> doctrine at its widest is 9807 characters against a budget of 9800. Something
> falls off silently on the turn every branch matches. Either a branch has grown
> past what it earns, or it is too broad to be selective and is two branches, or
> the budget is wrong — decide which, and write the number down.

Seven characters. The scarcity mechanism `.looper/doctrine/doctrine.md`
describes — *a new line must say what it replaces* — did exactly what it was
built to do, on its author, in the commit that was congratulating itself for
building controls. The sentence was cut to fit rather than the number raised.


### 2 · TS-ERROR:3 cannot tell a made-up value from a reported failure — cleared

Two doors, and a value that goes through either is an answer rather than an
invention.

**The catch looked at the error.** If the caught binding appears in an `if`, a
ternary or a `switch` inside the handler, the value returned was chosen by
examining the failure. That is the RealtimeChannel case: `if (error instanceof
Error && error.name === "AbortError") return "timed out"`. The same door was
added to TS-ERROR:4 for the same reason, one finding earlier.

**The normal path already gives that answer.** If the `try` block returns the
same literal, the catch returning it is not inventing anything. That is
`supportsLocalStorage`, which returns `false` from both.

A value that appears in neither still fires, which is the whole rule:
`try { return db.get(id) } catch { return null }`.

On the corpus TS-ERROR:3 went from 8 hits to 3, and the 3 that remain are real —
a `JSON.parse` failure becoming `null`, and a detection failure becoming
`false`.

### 5 · TS-DEAD:2 fires on compiler directives — cleared

`/// <reference path="…" />` is an instruction to the compiler that happens to be
spelled with slashes; deleting it changes what the project builds. It is no
longer read as prose.

A licence header is excused when it is the first thing in the file and mentions
copyright, a licence or an SPDX identifier. Some projects are required to carry
one, and it is not a description of the code, so the rule's own reasoning —
that a comment drifts out of date while the code moves — does not touch it.
Prose lower down the file that happens to say "Copyright" is not excused.

On the corpus this removed exactly four hits, 4,127 to 4,123, all four of them
reference directives.


### 23 · a mistyped concession is ignored without a word — cleared

`src/law/misspelled.ts` checks what the config names against what exists, and
`looper law` and the edit gate both say what it finds. The correct spelling
stays silent.

```
looper: law.toml [rules] disabled names TS-TRUTH-2, which is not a rule, so it
does nothing. Did you mean TS-TRUTH:2?

looper: law.toml [rules] disabled names ts-truth:2, which is not a rule, so it
does nothing. Did you mean TS-TRUTH:2?

looper: law.toml [exempt] names src/nosuchfile.ts, and there is no such file,
so it does nothing.
```

The nearest real rule is offered when there is one within three characters,
which is what turns a dead end into a fix. The person writing this is copying an
id out of an error message by hand and cannot read the code that would tell them
it did not take.

`ALL` is now settled on the record rather than left ambiguous. Under
`[rules] disabled` it is refused, in words, with the thing they probably wanted
named:

```
looper: law.toml [rules] disabled names ALL, which does nothing here. Rules are
turned off one at a time, by name. To excuse a whole file instead, name it
under [exempt].
```

The asymmetry is deliberate and now stated: `[exempt] "file" = ["ALL"]` is a
graded concession — one file, all rules — and it is honoured. A project-wide off
switch is not a graded concession, and looper does not have one.

Five cases are locked into `tests/misspelled.test.ts`.


### 12, 13, 14 · a rule reads the act, not one spelling of it — cleared
### 3, 4 · two of the blunt findings, cleared alongside them

Five findings, one idea. Each rule was matching a shape; each now matches what
the shape *means*.

**TS-ERROR:6** knew only the word `async` at the call. It now knows which
functions in the file are async, so `items.forEach(save)` and
`items.forEach((i) => save(i))` both fire, and `items.forEach(tally)` on a plain
function stays silent. Its ban text was widened in the same commit to cover
`map` whose answer is thrown away, because that is the same dropped promise and
the words had to move with the behaviour.

**TS-TYPE:4** read type annotations only, so `type Loose = any` and
`function f<T = any>()` were the two places you could write `any` without being
told. Both are read now, and the alias is reported where it is written rather
than at every use.

**TS-TYPE:2** was rewritten, and this is where findings 3 and 13 met. It walked
the whole return type looking for the words `null` or `undefined`, so
`OperatorFunction<T, T | undefined>` counted (finding 3) while
`type Maybe = string | null` did not (finding 13). It now reads the return type
properly: a union member, the answer inside a `Promise`, or an alias followed to
its definition and no further. `Box<string | null>` is silent, `Promise<User |
null>` fires, and `export default function` is finally looked at.

On the corpus that turned 5 hits into 10. The old false positive is gone and
five new ones are real, reached through a two-level alias:
`type BaseValue = null | string | …` then `type RecordValue = BaseValue |
BaseValue[]`.

**TS-DEAD:3** was finding 4: `constructor(private readonly x: number) {}` does
its work in the signature, and `private constructor() {}` exists to stop
construction. Neither is a stub. Both are silent now, and a bare `return;` —
which really does nothing — fires. On the corpus this rule went from **8 hits to
1**, and the one left is `export function noop() { }`, which the pile still
records as a suspicion rather than a finding.

**The rest of finding 14**, one line each: `export * as types from "./x"` is
still `export *`; `s >> 0` truncates exactly as `| 0` does; a made-up value is
still made up behind `as User`, and `void 0` and `NaN` are made-up values; a
handler given to `.then` as its second argument is a catch, and so is one passed
by name.

`audit/evasion.ts` now runs **119 cases with 0 mismatches**, from 42 when the
clearing began. Twenty more shapes are locked into `tests/ts-batch.test.ts`.


### 11 · TS-ERROR:4 is satisfied by naming the error — cleared

The check asked whether the caught binding was *read*. Reading it into nothing
counted, so `String(e)` and `const _unused = e` both passed. I wrote that second
shape four times while building this repo, in the file that enforces the rule,
and recorded it as a discipline problem. It was a mechanical hole worth two
characters.

It now asks whether the error actually **leaves**, which is what the rule's own
`why` says: throw it on, hand it to the caller, or log it, and no fourth. A name
bound to an expression carrying the error carries it too, computed to a
fixpoint, so laundering through one variable does not help.

Fires:

```ts
catch (e) { String(e); return 1 }
catch (e) { const _unused = e; return 1 }
catch (e) { const d = String(e); return 1 }
catch (e) { throw new Error("failed") }
```

The last is new and is the stricter reading taken deliberately: a `throw` that
does not carry the cause loses it. The rule's own `instead` has shown
`throw new CouldNotRead(path, cause)` all along.

Silent, and every one of these was found by running it over the foreign corpus
rather than by thinking about it:

```ts
catch (e) { throw new Wrapped(e) }
catch (e) { const d = String(e); return { d } }
catch (e) { reject(e) }
catch (e) { setState({ error: e }) }
catch (e) { if (e.name === "AbortError") return "timed out"; return "error" }
catch (e) { held = [e] }
```

The last two were false positives the first version produced. Examining the
error to decide what to return **is** looking at what you caught — it is the
ban's own word. And assigning it to a variable declared outside the catch is
handing it to the caller by another door. Both are now doors.

On the corpus TS-ERROR:4 went from 18 to 21. The one new distinct case is a
correct fire: a caught error discarded and replaced by `throw new Error("tried
to push … before joining")`, a message that would actively mislead if the push
had failed for any other reason.

Twelve shapes are locked into `tests/ts-rules.test.ts`.


### 7 · every global matched by one spelling only — cleared

`src/law/ts/globals.ts` is new. It answers one question: what global does this
expression actually reach. It follows `globalThis.`, computed access
(`process["env"]`), a name bound to a global (`const p = process`), and a name
destructured out of one (`const { log } = console`) — and it answers *nothing*
when the name is shadowed by a parameter, an import or a local declaration.

Nine spellings, all now caught, and two things that must stay silent:

```ts
const p = process;       p.env.TOKEN            // TS-TRUTH:2
const { env } = process; env.TOKEN              // TS-TRUTH:2
process["env"].TOKEN                            // TS-TRUTH:2
globalThis.process.env.TOKEN                    // TS-TRUTH:2
const c = console;       c.log("hi")            // TS-LOG:1
const { log } = console; log("hi")              // TS-LOG:1
globalThis.console.log("hi")                    // TS-LOG:1
const r = require;       r("./m")               // TS-LAYER:2
createRequire(import.meta.url)("./m")           // TS-LAYER:2

function f(process) { return process.env }      // silent, it is shadowed
function f(console) { console.log("hi") }       // silent, it is shadowed
```

Making it see aliases immediately produced a false positive worth keeping out.
`const base = process.env.URL` followed by `fetch(base)` fired twice — once at
the read and once at every use of the value. Copying a setting into a local is
not a second read of the outside world. TS-TRUTH:2 now reports the door and not
what came through it: the line where the value leaves `process.env`, once.

Sixteen shapes are locked into `tests/ts-scope-rules.test.ts`.

Across the foreign corpus the totals did not move — 5,199 violations before and
after, TS-LOG:1 steady at 36. No new false positives in 56,366 lines.

The pass 2 note about `process.stdout.write` is not part of this. It is outside
TS-LOG:1's ban, and the rule that covers it is `TS-LOG:2`, which finding 26
records as specified in the plan and never built. Its case in
`audit/evasion.ts` is labelled accordingly rather than forced onto the wrong
rule.


### 8 · no rule follows a value one line — cleared

`src/law/ts/bindings.ts` is new and does one thing: given an expression, hand
back everything that expression could be, following a name to what it was bound
to, up to three hops, with a seen-set so a cycle cannot spin.

Each of the three rules then asks its existing question of every value in that
set rather than only of the expression in front of it. No rule learned a new
idea; each stopped being fooled by a name.

```ts
const q = "SELECT * FROM users WHERE id = " + id;
const rows = db.query(q);                       // DATA:1 now fires

const cmd = "ls " + dir;
execSync(cmd);                                  // NODE:1 now fires

try { g(); } catch { const fallback = null; return fallback; }  // TS-ERROR:3 now fires
```

NODE:1 gained the other half of finding 8 at the same time. It watched `exec`
and `execSync` only, so `spawn(cmd, { shell: true })` walked past — and a shell
is the whole of what the rule exists to stop. It now watches `spawn`,
`spawnSync`, `execFile` and `execFileSync` as well, but only when the call asks
for a shell, so `spawn("git", ["clone", url])` stays silent as it must.

For TS-ERROR:3 the trace is built from the catch body alone rather than the
file, so a name bound to `null` somewhere else entirely cannot reach it.

Sixteen shapes are locked into `tests/security-packs.test.ts`, and the safe
spellings are in there beside the unsafe ones: parameters, an argument array,
a template that is not SQL, a built string that never reaches a shell, and a
real value computed in a catch.

Across the 339-file foreign corpus the change added **no** new violations —
DATA:1 and NODE:1 report zero there before and after. That is worth reading
honestly rather than as a pass: those two libraries contain no SQL and start no
processes, so the corpus does not exercise either rule. Their only evidence
against false positives is the controls written here.


### 9 · REACT:2 cannot see props, and is dead in practice — cleared
### 10 · REACT:1 misses the early return it names — cleared

**Correction to finding 10 first.** It claimed `on && useState(0)` and
`on ? useState(0) : null` were silent as well. They were not — `BRANCHING`
already listed `LogicalExpression` and `ConditionalExpression`, and both fired
all along. The finding was written from an ad-hoc probe that only tested the
early-return forms and then generalised. Only the early return was missing.

**REACT:1.** A function body is now read statement by statement: once a
statement contains a `return` and is not the last one, every hook after it is
reported. The search for that return stops at function boundaries, so a
`return` inside the effect's own callback is not the component's.

Its existing test was titled *"a hook after an early return is caught"* and
asserted **zero**, with the message *"an early return is a separate shape and is
not what this rule reads"*. The title said one thing, the assertion said the
opposite, and the message rationalised the gap. The rule's ban names the early
return, so the test was wrong and now asserts one.

**REACT:2.** It gathered candidate names only from declarators with a plain
`name`, so a destructured prop, an array pattern and a member expression were
all invisible — which is every real source of a missing dependency. It now
gathers from patterns and from function parameters alike, and it stops counting
the property half of `user.id` as a name of its own.

That alone produced false positives on ordinary React, and fixing them was the
better half of the work:

- a `useState` setter and a `useRef` value are stable, and React requires they
  are *not* listed. Both were being demanded.
- a parameter of a callback *inside* the effect — the `x` in `get(id).then((x)
  => …)` — counted as bound but not as declared within, so every promise chain
  in an effect was a violation.

Thirteen idiomatic components — a cleanup return, an async effect with a
cancellation flag, a `setInterval` with a functional update, a `useMemo` with a
sort comparator — now produce **zero** violations between the two rules.

There is no foreign React on this machine, so those thirteen are written here
and carry the weakness finding 15 describes. Stated rather than glossed: this
pair has not met a stranger's code.

Eleven shapes are locked into `tests/react.test.ts`.


### 1 · DATA:2 catches three of ten — cleared

`src/law/data/unchecked-input.ts`, rewritten the other way round.

It walked `VariableDeclarator` nodes and asked whether the thing being declared
was an arrival. So it could only ever see an arrival that was bound to a fresh
`const`, and nothing else — assignment to a variable that already existed, a
straight `return`, a destructure, a value handed to another function, a property
on `this`.

Now it collects every arrival in the file and then forgives the ones that are
accounted for: checked on the spot, bound to a name that is checked later, or
thrown away without being used at all.

On the corpus it went from 3 hits to 11, and one of the 11 was a false positive
worth having found — `await res.text()` as a statement on its own, draining a
response body before a retry. Nothing is used there, and *using* what arrived is
what the rule bans. Forgiving a discarded arrival took it to 10, and all 10 are
real.

Eleven shapes are locked into `tests/security-packs.test.ts`, seven that must
fire and four that must not.


### 16 · a file that does not parse is exempt from every rule — cleared

`TS-ERROR:8` — *a file that cannot be read as TypeScript at all* — in
`src/law/ts/unreadable.ts`. The parse failure already carried its line and its
reason and threw both away; the rule returns them. It goes through the ordinary
report machinery, so it can be baselined at adoption like anything else, which
matters for a repo that has an unparseable file on the day it adopts.

Pass 3's reproduction, re-run:

| | before | after |
|---|---|---|
| `looper law` on a file with a stray bracket and three violations | nothing to fix | 3 problems |
| the edit gate on the same file | exit 0, silent | exit 2, names the line |
| `looper law` on a binary file named `.ts` | nothing to fix | 4 problems |

Fires zero times across the 339-file foreign corpus, so it costs no adopter
anything. Case added to `audit/evasion.ts`.

### 17 · the edit gate fails silently on a malformed payload — cleared

One branch in `src/law/capability.ts`. `targetOf` already built the reason —
"the hook payload was not JSON", "the hook payload named no tool input" — and
the caller dropped it on the floor along with three other cases it was right to
drop. Now the unreadable case alone returns a `mention` carrying the reason, and
the other three still pass in silence because they are deliberate rather than
broken.

```
looper: this edit was not judged, because the hook payload named no tool
input. Nothing here is a verdict on it.
```

It mentions rather than blocks, which is `.looper/doctrine/law.md` exactly:
fail open and fail silent are not the same obligation, so observe, then pass.
The session cannot be wedged by a payload looper does not understand, and
looper can no longer be silently switched off by one.


_None yet._

## Suspicions, not findings

- TS-ERROR:3's second door is sensitive to a spelling it should not care about.
  It excuses a literal the `try` block also returns, so
  `try { return false } catch { return false }` is silent while
  `try { return env.type === "native" } catch { return false }` fires — the same
  function, one of them computing its answer instead of writing it out. The
  corpus has exactly one of these and the fire is defensible on its own terms
  (if detection throws, the honest answer is "I do not know", not "no"). But the
  rule is deciding on a difference that does not matter, and that is worth
  saying out loud rather than leaving in the code.
- A licence header is excused by shape, so a determined writer could keep prose
  at the top of a file by putting the word "Copyright" in it. The exception is
  narrow — first thing in the file only — and the alternative was no way to carry
  a header a project is legally required to have.

- `export function noop() { }` is reported by TS-DEAD:3. A deliberate no-op
  passed as a callback is arguably a real thing rather than a stub, but nothing
  here shows it causing harm. Needs a case where the rule forces a worse
  spelling before it becomes a finding.
- `process.stdout.write("hi")` is silent under TS-LOG:1. The stated ban is the
  console family, so this is outside the letter, but a library writing to stdout
  decides output for every future caller, which is the whole of the reason given
  in the rule's `why`.
- `items.map(async (i) => { await save(i) })` with nothing awaiting the array is
  silent under TS-ERROR:6. The ban names `forEach` only. Same dropped promise.

## Judged and left alone

- TS-TYPE:3 is silent on `const loose: any = x; const a: User = loose`. TS-TYPE:4
  catches the `any` on the line above, so the pair is covered. Deliberate.
- TS-DEAD:2 fires 4,127 times on the corpus and TS-TYPE:4 fires 732. Both are
  the rules working. Neither is a finding, and neither should be reopened as
  one.
- The commit gate holds. Six spellings of the same commit — a leading space,
  `git -C .`, chained after `cd`, prefixed with an environment variable, and
  `--no-verify` — all blocked with the full repair prompt. `--no-verify` matters
  most: it defeats the git hook and does not defeat this one.
- No hook input crashed or hung. Empty stdin, unparseable text, `null`, an
  array and `{}` across PostToolUse, PreToolUse and Stop: fifteen runs, all
  exit 0, none slower than the timeout. Empty stdin staying silent is right —
  git hooks are run with it deliberately.
- No git state broke anything. A repo with no commits, a detached HEAD, a merge
  in progress, and no repo at all: the gate passes cleanly in each.
- A 50,000-line file and 4,000 nested parentheses both finished. Neither hung,
  and the long file was correctly reported as too long.
- `max_loc` written at the root of `law.toml` works, which is the spelling the
  rule's own valve prints. Guessing `[ts] max_loc` does nothing, but nothing in
  looper ever tells anyone to write that.
- Inject, the edit gate and the Stop hook are flat in project size. 100 files or
  6,000, they are 88, 96 and 89ms. Nothing in the per-turn path walks the
  project, which is the property that was designed for and it holds.
- `looper law` is linear and unremarkable: 224ms at 100 files, 781 at 1,000,
  1,731 at 3,000, 3,204 at 6,000. A hundred thousand lines judged in three
  seconds.
- The parse memoisation is doing its job. `surveyProject` over 1,001 files runs
  1,927ms cold and 496ms warm in the same process.
- All 23 rules pass every mechanical check on their text: each offers at least
  one legal spelling, each gives a reason, none names a file or a type from
  looper's own source, and none runs long.
- Every valve spelling a rule prints is the spelling that works. `[ts]
  env_files`, `[entry] files`, `[ts] trace_symbols`, root-level `max_loc` and
  `[exempt]` were each written into a `law.toml` and each did what the rule
  said it would.
- Pardon and disable both work when spelled correctly: `[exempt]` removes one
  rule from one file, `[rules] disabled` removes it from the project.
- Adoption works, end to end, exactly as chunk 5 promises. On a repo with three
  pre-existing violations: `init` writes the baseline, the first commit passes
  with nothing disabled, a new violation in a new file refuses, and adding a
  violation to an already-baselined file refuses. That is the whole adoption
  story and every part of it held.
- `init` holds every claim made for it: a foreign `UserPromptSubmit` hook
  survives, looper's own are added beside it, and running it twice leaves the
  project byte-identical.
- A project with an entirely empty doctrine directory still gets 2,334
  characters of real rules injected.
- `law.toml` is genuinely optional. Deleting it changes no verdict.
- Every one of the 23 rules is exercised by a test. An earlier count here said
  17 were not; that was a bad grep looking for rule ids in files that import the
  check objects by name instead. The coverage is real — what finding 15 says
  about its *quality* still stands.
- The doctrine tree does not repeat itself. The canon half is about writing
  TypeScript and the project half about writing looper, and across six files and
  199 lines the only overlap is finding 29. The line that holds it — *"the
  project half instantiates the canon and never repeats it"* — is working.
- Only five exports in `src/` are referenced once there, and every one of the
  five is used by a test. The dead-export problem found in the earlier
  consolidation pass has not come back.
- The rule prose is the strongest part of this codebase and none of it needed a
  finding. It names the consequence in the reader's terms rather than the
  compiler's — a price of 10.99 becoming 10, a screen holding what was true a
  minute ago, a key printed in the page source. That was the thing this pass
  was built to test and it held.

## Passes run

### Pass 1 — foreign code · 339 files, 56,366 lines

Two open-source client libraries, read from a `node_modules` already on this
machine. Neither was written here, which was the point. 5,192 violations.

| rule | hits | judged |
|---|---|---|
| TS-DEAD:2 | 4127 | correct, minus finding 5 |
| TS-TYPE:4 | 732 | correct — the corpus really does write `any` |
| TS-TYPE:3 | 187 | correct, sampled 8, all real |
| TS-LOG:1 | 36 | correct |
| TS-DEAD:1 | 27 | correct |
| TS-DECOMPOSITION:1 | 19 | finding 6 |
| TS-ERROR:4 | 18 | correct — the two suspicious ones read as deliberate |
| TS-DEAD:4 | 14 | correct |
| TS-DEAD:3 | 8 | finding 4 |
| TS-TYPE:5 | 8 | correct |
| TS-ERROR:3 | 8 | finding 2 |
| TS-TYPE:2 | 5 | finding 3 |
| DATA:2 | 3 | finding 1 |

Ten rules never fired: TS-ERROR:1, TS-ERROR:6, TS-ERROR:7, TS-TRUTH:2,
TS-LAYER:2, REACT:1, REACT:2, DATA:1, NODE:1, NEXT:1. Most have an honest
reason — the corpus has no React and no database — but silence is not evidence
of correctness, and pass 2 owes each of them a case that should fire.

Timing, for pass 4 to take seriously rather than as a result: 1,090ms for the
whole corpus in one process.

### Pass 2 — evasion · 79 cases, 39 mismatches

For each rule, code that breaks its stated ban in a spelling the rule was not
written against. The harness is `audit/evasion.ts`; it lists the case, the rule,
and whether the rule should fire, and prints only the disagreements.

39 of 79 disagreed. Two of those were the pass 1 false positives reproducing in
one line each, which is good news — findings 3 and 4 now have a minimal case.
The other 37 are new, and they are findings 7 through 15.

The shape of it: almost nothing here is a clever dodge. Aliasing a global,
naming a long string before passing it, pulling a callback body out into a
declared function, and destructuring props are all things people do while
tidying. The rules are written against one spelling of each act, and ordinary
tidying produces the others.

### Pass 3 — failure modes · 44 hostile inputs

Malformed hook payloads on every event, nonsense and broken `law.toml`, a
corrupt baseline, binary and UTF-16 and empty and unreadable and enormous and
deeply nested files, symlink loops, symlinks out of the project, a repo with no
commits, a detached HEAD, a merge in progress, no repo at all, and six spellings
of `git commit`.

Two questions were asked of each: does it reach a wrong verdict, and can it
wedge the session. **Nothing wedged the session.** No hang, no hook exiting
non-zero for any reason other than a real block, and the commit gate held
against every spelling put to it.

The wrong verdicts are findings 16 through 19, and the first two share a shape
with each other and with the pass 2 results: when looper does not know, it says
nothing and returns clean. A file it cannot parse is clean. A payload it cannot
read is clean. Both are indistinguishable, from the outside, from a project
with nothing wrong in it.

### Pass 4 — scale · synthetic projects of 100 to 6,000 files

Generated projects with a real import graph, three imports per file, up to
108,000 lines. Every moment measured: inject, the edit gate, the commit gate,
`looper law`, the Stop hook.

Most of it holds. The per-turn path does not touch the project and does not
care how big it is. `looper law` is linear and judges a hundred thousand lines
in three seconds. The parse cache earns its place four times over.

Three costs are worth writing down, and only one of them is a cliff. The commit
gate is priced per staged file and meets its own 30-second timeout at about six
thousand of them, which is nobody's daily commit and exactly the first commit
of a repo that has just adopted looper. The other two are the same cost seen
twice: looper spends 86ms starting before it does 10ms of work, because there
is no build step and every hook re-strips the types off a hundred files.

Findings 20 through 22. Note that 22 is a tension rather than a defect — the
obvious fix for the startup cost is banned by TS-LAYER:2.

### Pass 5 — messages · all 23 rules, read one at a time

Mechanical checks first: a legal spelling on every rule, a reason on every
rule, no word from looper's own source anywhere in the text, nothing over
length. Zero complaints. Then each rule's `bans`, `why`, `instead` and valve
read against the claim that it reads to someone who cannot code.

The prose holds. It is the best-made part of this project and it did not
produce a finding. What produced findings is everything around it: the config
that silently ignores what the reader types back, the banner that frames a
break-in as untidiness, and the fact that the repair prompt is read by two
different creatures and was written for the one that can improvise.

### Pass 6 — claims · every "Done when" in PLAN.md, and the rule table

Seven "Done when" blocks, run rather than read. Six of them hold, and the
adoption one holds in full — which matters more than any single finding here,
because adoption is the thing the product is for.

The failures are all in one place: the rule table. It names ten rules as
carrying or rewritten that were never built, and says nothing at all about five
that were. One of the ten, `TS-LOG:2`, closes a hole this audit spent pass 2
rediscovering.

Findings 26 through 28.

### Pass 7 — consolidation · literals, exports, files and doctrine

The earlier sweeps covered function bodies. This one covered repeated string
literals across every file, exports nobody imports, and the doctrine tree read
against itself.

The doctrine came out clean, which is the result worth having: six files, 199
lines, canon and project half, and one overlap between them. Dead exports are
down to two, both added by the sweep that removed the last three.

Findings 29 through 31. Finding 30 is the one that matters and it is not really
about duplication — it is that three doctrine lines already forbid this audit's
largest finding, and all three are prose, which the first of them says stops
nothing.

## Clearing the pile

31 findings. The order below is severity, and within a severity the cheapest
first.

**`wrong` — it reaches a verdict that is not true.** ~~16~~, ~~17~~, ~~1~~,
~~9~~, ~~10~~, ~~8~~, ~~7~~, ~~11~~, ~~12~~, ~~13~~, ~~14~~, ~~23~~. All cleared.

**`blunt` — it fires on code that is fine.** ~~2~~, ~~3~~, ~~4~~, ~~5~~. All
cleared.

**`missing` — claimed with nothing behind it.** ~~30~~, ~~26~~, ~~27~~, ~~15~~.
All cleared.

**`slow` — a measured cost.** ~~20~~, ~~21~~, ~~22~~. All closed: one fixed,
two measured and accepted with the numbers written down.

**`noise`.** ~~6~~, ~~24~~, ~~25~~, ~~28~~, ~~29~~, ~~31~~. All cleared.

Two rules for the clearing, both learned here. Every fix gets a case in
`audit/evasion.ts` written from the rule's *ban text* before the code is
touched, because finding 15 is what let all of this sit under 261 green tests.
And nothing is called done until it has been run over the foreign corpus, which
is what `.looper/doctrine/law.md` has said all along.
