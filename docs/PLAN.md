# looper — plan

Binary `looper`. This document is the whole design and the only planning
artifact in the repo. It is written before the code and corrected in place as
the code corrects it.

## What it is

One tool you point at any project to install a governed agent workflow: the
project's rules re-asserted every turn, a coding standard enforced at edit time
and at commit time, a credential gate, and a durable memory.

It prescribes one stack and governs it completely — TypeScript across web,
mobile, API and database — rather than accommodating every language a company
has ever shipped. Repos on other languages still get doctrine, the credential
gate and memory, because those need no parser. They do not get the law. That
asymmetry is the incentive.

Two things it must do, and they pull in opposite directions:

1. **A perfect init on a fresh project.** One command and the project is
   governed from its first commit, with real rules already in force before
   anyone has written a line of doctrine.
2. **A safe plugin on an existing project.** Point it at a repo with its own
   hooks, its own linter and its own settings, and it adds what is missing,
   changes nothing it does not own, and gets better as the user keeps prompting.

Property 2 is the one that is hard, and it is the one that decides whether this
gets used. A tool that can brick a working repo gets run once.

## The pillars: what strictness actually means

Strictness is the product, not a side effect of it. A permissive tool that
occasionally mentions a problem changes nothing, because the consumer is an
optimizer and an optional rule is a rule that is off. What follows is what
looper is strict *about*, and every one of these is a gate somewhere or it is
not real.

The reason is longevity. Each pillar below is a defence against the specific way
a codebase becomes unmaintainable, and each one costs something today to save
much more later. That trade is the whole bet.

**A gate is the floor, not the ceiling.** There are three ways to make something
hold, and they are not equal. They are ranked, and the rank is a design
instruction rather than a preference:

1. **Impossible.** The wrong state cannot be expressed, so no check exists
   because none is needed. A generated type cannot diverge from its schema
   because nobody writes it. A declared check cannot carry a duplicate label
   because the label *is* the config section name and a file cannot hold the same
   section twice. Nothing runs, nothing can be skipped, and it costs nothing per
   turn.
2. **Gated.** A check refuses it at a moment nobody can route around. Real, but
   it is code that runs, and code that runs can be argued with, exempted or
   quietly widened. `tests/invariants.test.ts` refusing a new file that starts a
   process is this level, and on 2026-08-19 it stopped exactly the thing it was
   written for.
3. **Told.** Prose that arrives if there is room. This is the weakest level and
   it is the one most rules live at.

**The instruction: the more a thing matters, the further up it must live, and
anything at level 3 is a suggestion.** Measured on 2026-08-19, `doctrine:frontend`
was dropped for budget 32 times during a session that was almost entirely
frontend work. Those rules did not fail to persuade. They never arrived, and a
rule that never arrived is indistinguishable from one that was followed.

**Level 3 also cannot scale, by construction.** A fixed character budget against a
project that grows means the newest and most specific rules lose to the oldest and
most general, forever, and the failure is silent. Levels 1 and 2 have no per-turn
cost and no ceiling: the law already judges every write mechanically without
spending a character of the budget, which is why the law scales and the doctrine
does not. So the answer to a project outgrowing its budget is not a larger budget.
It is moving what matters down into the law, or out of the problem entirely by
making the wrong state unrepresentable.

**And looper is not exempt from any of it.** It governs itself with its own
doctrine, its own law and its own invariants, which is why its suite could refuse
its author. Every claim in this document about what adopters owe is a claim about
this repository first.

1. **No dead code.** No unreferenced export, no unreachable branch, no
   commented-out block kept "just in case", no stub that returns nothing.
   Dead code is a lie about what the system does, and every future reader pays
   to discover it was a lie. Enforced by the `DEAD` category and by
   `noUnusedLocals` / `noUnusedParameters` in the shared tsconfig.
2. **One source of truth.** A fact is declared once. Not a constant duplicated
   in two modules, not a type hand-written beside the schema that already
   describes it, not two config files that must agree. Divergence is inevitable
   and it is silent. Enforced by the `TRUTH` category, and structurally by the
   stack: one Zod schema yields the database types, the API validation and the
   OpenAPI contract, so there is nothing to keep in sync.
3. **No fallbacks, ever.** No `?? "default"` covering a value that should have
   been there, no silent retry hiding a dependency that is down, no `catch` that
   returns a plausible stub. A fallback converts a loud failure into a wrong
   answer that surfaces three layers away from its cause, and that is strictly
   worse than a crash. Absence may resolve to a default in exactly one declared
   file and nowhere else.
4. **Verify everything.** Every boundary validates: no trusting request bodies,
   no trusting a cast, no trusting that a row exists. Enforced by the `TYPE`
   category — no `as any`, no `as unknown as`, no `!`, no `@ts-ignore` — and by
   the `DATA` pack requiring a schema in front of every input.
5. **Never fail silently.** Every failure is observed or propagated, never
   swallowed. This is the pillar the language fights hardest, which is why the
   law exists at all.
6. **Say it every turn.** The model is told what is allowed and what is not on
   every single prompt, not once in a file it skimmed at session start. This is
   the one pillar that is architecture rather than a rule: it is the injection
   allocator, and it is why per-turn cost is budgeted and printed rather than
   left to grow.

**Strict is not unappealable — where there is somebody to hear the appeal.**
Every pillar has a concession path, and the concession is one visible line in
`law.toml` or a pardon on one named file. The point was never that the rule can
never be bent — it is that bending it costs a diff, a reviewer and a reason. A
rule with no concession path gets disabled wholesale the first time it is wrong,
which is how strict systems die.

That whole argument rests on a reviewer, so it holds only where one exists. On a
project whose owner cannot read the code, the appeal is closed — see
"Self-sufficient, because there is nobody to fall back on". The rules do not get
softer there; the bar on their precision gets higher, because a rule that misfires
with no escape hatch does not get switched off, it strands someone.

**Two failure domains, do not confuse them.** "No fallbacks" governs the code
looper watches: code that cannot get a value must not invent one. "Fail open"
governs looper itself: a governance accessory that cannot reach a verdict must
not wedge the session. Same word, opposite obligation, because one of them is
the product and the other is the inspector.

## Isolation, stated first because it constrains everything else

looper is built from scratch. It is not a port, a fork, a wrapper or a vendored
copy of anything. No code, no rule files, no fixtures, no generated artifacts and
no build outputs enter this tree from any other project.

There is an earlier tool of the same lineage: a governed-agent loop the author
built and ran for months, in a different language, living inside one private
project. looper carries over what he learned from it and none of what he wrote.
That is not an ownership question — both are his. It is a design one, and the
reason is the whole point of this tool:

**that earlier tool was built for one project, in one language, on one machine,
and it is shot through with all three.** Its doctrine names that project's
domain. Its rules encode that language's failure modes. Its hooks assume that
author's setup. Copying it would import every one of those assumptions into a
tool whose first requirement is that anyone can point it at anything. The parts
worth having are exactly the parts that survive being separated out, and
separating them is cheaper by rewriting than by deletion.

So the earlier tool is a source of evidence, never a source of code. It is read
to answer questions and to learn what rotted. It is not opened to copy from.
Where prior experience motivates a decision, this document argues that decision
on its own merits, because a reason that works only as an appeal to unnamed
prior art is not a reason anyone else can check.

### The other direction, which now matters more

looper is written to be adopted by organisations, and their internal
architecture, their vendors, their team structure and their product are
**theirs**. None of it belongs in a generic tool's planning document. Where this
plan needs to speak about an adopting organisation it does so in the abstract,
and the particulars of any one adopter live outside this repo.

This is the same discipline the canon is held to, applied one level up:
**nothing belonging to one adopter is written into the thing every adopter
receives.** A plan that failed this test would produce a canon that failed it
too, and the canon is the part that ships.

## Principles this design commits to

Each is built here from scratch. They are listed because they are load bearing,
and because dropping one later should cost an argument.

| principle | why it is load bearing |
|---|---|
| **when two readings exist, take the stricter one** | the tie-break for every decision in this document — see below |
| container + capability plugins | the seam is the asset; every later capability is additive or it is a rewrite |
| the canon compiled into the binary | generic law that cannot drift into N copies, and nothing written into a repo we do not own |
| doctrine as a tree, budgeted per prompt | a flat rules file cannot hold a real project and cannot be afforded every turn |
| the repair-prompt contract | a violation message must be sufficient on its own to fix from |
| graded concessions in one file | valve, pardon, disabled: same ledger, different blast radius |
| the no-network invariant, checked at the socket layer | a tool that runs on every edit and every commit must not be able to phone home |
| hooks are our own binary | no scripts on disk, no interpreter, one dispatch process per event |

**The tie-break, because it decides more than any single rule.** Where a decision
has a stricter reading and a looser one and both are defensible, **take the
stricter, robust one.** Not as a temperament — as the rule that resolves the
argument, so the argument does not have to be had again at every rule.

Two things make it work rather than merely make it severe:

- **Strict usually turns out to be the more decidable reading, and where it does,
  that settles it.** `TS-TRUTH:1` is the worked example: the lenient version
  needed a judgment — is this `??` inventing a value or discharging an absence? —
  and judgment is where a rule misfires. Banning the construct outright left
  nothing to judge. The looser reading was the fragile one.
- **Where strict is genuinely less robust, that is a signal about the rule, not a
  licence to soften it.** A stricter reading that cannot be decided without
  guessing, or that has no legal spelling to hand back, is not a strict rule — it
  is a broken one, and the answer is to fix or drop it, never to ship a lenient
  version that fires vaguely.

What this rules out is the specific failure that produced two wrong calls in this
document already: reaching for the looser reading on **budget or taste** — "real
but infrequent", "this is the ecosystem convention", "a beginner would find this
harsh". None of those is an argument. There is no rule budget, convention is not
evidence, and severity is paid by the agent.

## The loop: what a project cannot see about itself, and what that costs

A governed project is a chain of parts that hand work to each other. Each part
logs to itself, and nothing joins them, so the question "is it working" is
answered by reading several places and guessing. That is expensive for a human
and ruinous for a model, which pays for every line it reads and cannot skim.

**Internal and external, and the difference is not cosmetic.** An internal check
is answerable from the checkout alone: does it build, does it type-check, is the
law clean, is the branch level with its remote. It can fail but it can never be
`blind`, because nothing it needs can be unreachable. An external check has to
reach something that can be down: a host, a database, a deployed service, a
running process. It can be `blind`, and that is information rather than an error.

Keeping them apart is what stops one poisoning the other. A project with a
network it cannot reach must still be told, precisely, that its own build is
fine. Reporting `13 checks, 4 failed` when four of them merely could not be asked
is the report that made somebody stop reading these.

Two metrics, and they measure different things: one internal to the session, one
external to it.

**The external metric, the loop: can this project be seen at all.** Four numbers, and the last
is the one that matters.

| number | what it says |
|---|---|
| `ok` | checks that answered and passed |
| `broken` | checks that answered and failed |
| `blind` | checks that could not be asked at all |
| `whole for` | how long since the last break |

`blind` is the deepest of the four because it is the one that masquerades as
health. A check that cannot reach the thing it checks returns nothing, and
nothing reads like silence, and silence reads like fine. **A verdict is `ok`,
`broken` or `unknown`, and `unknown` is never `ok`.** A project whose loop is
`9 ok, 0 broken, 4 blind` is not healthy; it is a project that can see two thirds
of itself.

**The internal metric: output over input.** Not code against not-code, which
counts the wrong things. Input is everything taken in to decide: files read, logs
tailed, command output, search results. Output is everything produced: code,
documents, commit messages, the plan itself.

**It is how looper is judged**, not a statistic about a project. A session that
reads two hundred thousand tokens to produce two is worse than one that reads
twenty for the same two, and no measure of time spent typing can tell those
apart. Context is the scarce thing, and input is what spends it.

**The enemy it names precisely is input that produced no new information.** Not
input as such: reading an unfamiliar system carefully is the work. Reading the
same file eleven times with different filters is eleven times the input for one
answer, and it is the second kind the fingerprints already catch. So the target
is never "read less". It is "never read the same thing twice to learn one fact",
which is also why the answer to a stall is a capability rather than a discipline.

**The guard, without which this metric teaches the wrong lesson: the target is
the least input per unit of certainty, never the least input.** Guessing has an
input cost near zero and is the worst available outcome. Every serious error in
the session that produced this document came from too little input rather than
too much: claiming what had not been checked, reading a stale process as the
current one, treating silence as an answer. A score that rewards reading less
rewards all three.

So the instruction is not "read less". It is "make one read enough". A verdict
line that settles a question beats a thousand-line log, and it also beats the
guess that would have skipped both. Where the two readings conflict, the stricter
one wins, as everywhere else in this document: read again rather than assert.

It resists the obvious gaming for the same reason. Output produced on too little
input is wrong, and wrong work returns as diagnosis, which is input, and lands in
the denominator with interest. The ratio can only be raised honestly by making
each unit of output need less input to be right the first time, which is the
whole point of every capability listed below. Time writing
code as a fraction of time working at all. A long stall is not a fact about the
problem, it is a fact about the environment, and the environment is fixable.

This one needs no self-report, which matters because self-reporting is precisely
what would be wrong. The hooks already see every tool call, and the fingerprints
of being stuck are mechanical:

| fingerprint | what it means |
|---|---|
| one command shape repeated N times in a window | no single call answers the question |
| one file read repeatedly with different filters | it is a dump where a view was needed |
| an edit reverted or rewritten within minutes | acting on a guess, because looking was too expensive |
| a long run of reads with no write between them | diagnosing rather than building |

**Both metrics rise on their own, which is the point.** A repeat cluster that
crosses the threshold is not a scolding; it names a shape, and the answer to that
shape is one more check. The set of checks grows where the stalls actually
happened rather than where somebody guessed they would, so the same stall does
not happen twice.

**The scanner is one sweep, not a drawer of tools.** A model asked to run six
commands runs four. One sweep reports every layer at once, in labels, and every
label is unique in the project so a single search lands on the check, its output
and its documentation together.

**Which half is looper's.** Every internal check is looper's, because they are
true of every project it governs and it can run them with nothing declared. Every
external check is the project's, because what a chain is made of is the one thing
looper must not assume. The mechanism is: the sweep, the verdict vocabulary,
the two metrics, the stall fingerprints, and the injection. A project that declares nothing still gets
its full internal report, and an external count of zero rather than a silence.

**Nobody will write the checks, so looper proposes them.** A design that ends at
"declare your checks in a file" has moved the problem rather than solved it. The
adopter who most needs this is the one who does not know what their chain is made
of, and an empty `.looper/loop.toml` is indistinguishable from a healthy project.
Asking a person to author checks is asking them to already have the map the tool
was supposed to draw.

It does not need to be told. **The hooks already see every tool call, and what an
agent reaches for is the chain, revealed by use.** A session that opens two ssh
connections, queries a database and fetches one endpoint has just named four
external layers, none of them guessed. So the proposal is: name what was reached
for, how often, and say that none of it is covered.

> two hosts, one database and one endpoint were reached this session and no check
> covers any of them. Write them?

That is the same evidence discipline the rule set already runs on, and it keeps
the property that makes this safe: **looper never assumes what a project is made
of, it reports what the project's own agent did.** A draft check is a proposal a
person accepts, never a file that appears.

**Init wires it, because a capability an adopter has to discover is a capability
most adopters do not have.** The injection hook is written by `looper init`
alongside the ones already there. Nothing about the loop should require knowing a
command exists: the sweep is a command for the author and for debugging, and the
verdict arrives without anyone asking for it. An adopter who has to be told to run
something has already been failed by this design.

**It must be injected, and it is not yet.** By the principle already stated
above, a check that fires when somebody remembers to run it is a check that does
not fire, so the failing labels and the two numbers belong where the reader
already is, beside the baseline count. `looper loop` is built and injection is
not, deliberately, because the two requirements pull against each other and the
second one has to be argued rather than assumed.

The conflict is real and worth stating: a declared check is a shell line from the
project's own `.looper/loop.toml`, and running it on a hook would mean a session
starting is enough to execute a file somebody committed. That is a different
posture from anything else here, where the only things looper starts are its own
drivers on its own tree. `tests/invariants.test.ts` holds both halves: the runner
is named among the files that may start a process, and a second test refuses to
let the registry reach it, so a hook cannot run a project's line today.

What closes it: run declared checks only from an explicit invocation, cache the
last result with its age, and inject **the cached result** rather than running
anything. The reader gets the fact where they already are, and nothing a project
wrote runs because a session opened. When the cached answer is older than a
threshold, start a refresh out of band and still inject the old one, labelled with
its age, because a stale answer that says it is stale beats no answer.

**Measured before being asked for, in an adopter, 2026-08-19.** The shape above
was built there first to find out what it costs on a hook that runs on every
prompt: **9 ms cold and 23 ms warm**, against the seconds it would take to
actually run a sweep with several remote calls and a compile in it. It says
nothing at all when the loop is whole, because a line that appears every time is
a line nobody reads. That is the number this design needed and did not have: the
objection to injecting anything is that it costs something on every turn, and the
answer is that reading one cached line does not.

**The stall metric is design only.** Nothing reads the hook stream for repeat
clusters yet, and no fingerprint is implemented.

## The budget drops the branch the session is standing in

**Measured in one adopter's session, 2026-08-19, counted from its own transcript.**
The session spent most of its length on interface work. Contributions dropped for
budget, by name:

| dropped | times |
|---|---|
| `doctrine:frontend` | 32 |
| `doctrine:architecture` | 10 |
| `decisions` | 8 |
| `recall` | 6 |
| `law` | 6 |
| `doctrine:<the adopter's own>` | 6 |

The branch governing the work actually being done was the one most often absent,
and it was absent silently: the marker names what was dropped and never what was
in it, so the reader cannot tell whether it mattered. `law` went six times while
its own languages were being written. `recall` went six times while the session
re-derived things this project had already worked out and written down.

**The mechanism, and it is not a tuning problem.** Priorities are `router` 0, every
doctrine branch 10, baseline 20, decisions and recall 30, and the allocator fills
in that order until the budget runs out. Two consequences follow.

The tail is structural: `decisions` and `recall` sit last, so they are dropped
first whenever anything else grows. That is a choice worth making deliberately,
and it is currently made by an ordering nobody argued.

The worse one: **every branch shares a single number, so which branch survives is
arbitrary order rather than relevance.** A branch is signalled precisely because
the session is touching the files it governs. Having earned its way in on
relevance, it then competes on none. Dropping the frontend branch during frontend
work is the allocator preferring a branch that was signalled more weakly.

**The router costs 37% of the budget on every message** (3,659 of 9,800 measured
the same day). That is the always-on half crowding out the situational half, and
the situational half is the part that changes what gets written.

**A rule that never arrived is indistinguishable from a rule that was followed.**
That is the same failure this document already refuses one level down, where a
check that could not be asked must never read as `ok`. A dropped branch is the
`blind` case for governance: the work happens, the output looks like compliance,
and nothing anywhere records that the rule was absent rather than obeyed.

So it is not a reporting problem and better wording does not close it. **The
branch raised by the files being edited must not be droppable.** If the budget
cannot hold what this turn actually needs, that is a fact to say out loud, not a
trim to make quietly.

**And it must not depend on anybody noticing.** This was found by reading a
transcript after an evening had already gone wrong, which is exactly the route
this document says never works: the adopter who is being failed is the least able
to see it, and by construction they are reading fewer rules than they think. So
looper counts its own drops per project, notices when what it dropped governs what
was being edited, and surfaces that itself. Every adopter has this today and none
of them know.

That is the loop applied to looper. The tool that asks whether a project can see
itself owes the same answer about its own delivery, and by the same vocabulary: a
rule delivered is `ok`, a rule refused is `broken`, and a rule silently dropped is
`blind`.

The rest, none of it built: rank a branch by the strength of the signal that
raised it, so the files being edited outrank anything weaker; say what a dropped
contribution contained rather than only its name, since a name cannot be weighed;
and decide on purpose whether `recall` and `decisions` belong at the end rather
than inheriting it.

**Built 2026-08-20, measured in the same adopter's repository before the change.**
Ten editing shapes were replayed in a scratch worktree and the hook's output
counted. Eight of ten went over budget. A feature touching a plugin, the backend
and the client got `csharp` and `frontend` and lost `game`, the adopter's own
branch about the plugin. A schema edit got `architecture` and lost both
`contract` branches. A migration got `architecture` and lost all four `data`
branches. A clean tree, the shape of a question, got the two branches of the
last commit: 8,867 characters for a prompt that edited nothing. The router alone
was 4,020 of the 9,800, and 1,700 of that was the index quoting each branch's
first bullet, which for a canon branch is a principle the constitution already
carries or a rule the law already refuses.

Four things changed, each with a test. A clean tree signals nothing: the last
commit's files no longer raise branches, so a question gets the constitution and
the index, and the branches return the moment a file is in hand. The first
branch the files in hand raised is marked required, so the allocator cannot drop
it; when two tie, the branch the project mapped itself outranks a canon default,
because the project's own words about its own code are the more specific rule.
The index lists names, grouped, in under 900 characters, and a sentence in it
fails a test. And a commit gate refuses a doctrine bullet over 300 characters, a
branch file over 1,300, or a constitution over 1,000, with no line that waves it
through: the rule stays, the story goes to recall, and a branch past the ceiling
is two branches. The canon itself was cut to the same ceilings, from 39,737
characters to about 26,600, and the language branches now carry only what the
law cannot see, because telling a rule the judge refuses is paying for it twice.

What the three-times cost of an anchored rule bought, this keeps: the date and
the one number stay in the bullet. What it stops paying for is the narrative
around them, which persuades on the first reading and is skimmed on the fortieth,
and which was the reason eighteen branches in one project had grown past the
point where three could arrive together.

## A notice speaks once, about this session, by relevance

**Measured in one adopter's repository, 2026-08-21, before the change.** On a
clean tree the prompt hook delivered 4,297 characters, and 2,048 of them were
four notices that said the same thing on every turn: the baseline count
(unchanged since the day looper arrived), three recall entries chosen because
they were the oldest in the file (the first one described behaviour that had
changed twice since), the count of stale decisions, and a stall report whose
shapes were two-word command prefixes (`sed -n`, `grep -rn`), which read a
forty-file investigation as being stuck and, because the stream was keyed by
project rather than by session, counted another session's commands on the same
machine as this one's. Every one of those lines was the always-on tier in
disguise, and by the fifth turn it was wallpaper.

Four things changed, each with a test. The prompt hook reads the payload it is
handed, so a turn knows its session and its prompt; a turn that arrives without
them behaves as before. Every injection says whether it is a rule or a notice,
and a notice is kept per session by the gist of its words with digits masked:
heard once, it is left out until its words change, and one dropped for budget
was never heard, so it speaks next turn. Recall ranks its notes by the words of
the prompt and of the files in hand, names at most three that share at least
two words, and otherwise says once per session that notes exist. The stall
stream carries the session on every line and is read per session; a shape is
the whole command, so two different greps are two shapes; and a run of reads
over more than two distinct targets is research, while eight reads of the same
file is a stall. `looper status` takes paths and answers what a turn editing
them would cost, with notices marked, so a map can be tuned from numbers.

**After, the same repository.** A session's first turn carries 742 characters of
notices; its second carries none unless a note touches the prompt, and then only
the notes that do. The question "is the dev companion showing the correct map"
names the three notes about the map identity and the cargo dock, not the three
oldest. A second session is told once more, because it has heard nothing.

What this deliberately does not do: repeat a counter because it ticked. A
baseline going from 1,705 to 1,698 is not news the turn can act on, and the law
says it again in the file when the file is open. Stream lines written before
this change carry no session and are not read, so the metric starts clean.

## What is missing, ranked by what its absence costs

**None of this is built.** It is a list of capabilities an agent asked for after
an evening in which each absence was paid for, and it is here so the next
argument starts from evidence rather than from taste. Each entry carries the cost
that produced it.

**The investment reflex this list exists to serve.** A tool that only reports is
half a tool. The other half is knowing when to stop reporting and spend an hour:
a stall shape seen nine times in one session, or three times a week, is worth
more than the capability that would end it. That is a calculation, not a feeling,
and the numbers for it are the ones the stall metric already collects. So the
same mechanism that names a recurring shape should be able to say **this has cost
you four hours this month and the thing that ends it is an afternoon**, and say it
unprompted. An agent will not propose spending an hour on tooling while it is
being asked for a feature; it needs the arithmetic handed to it.

### 1. The shape of the code, not only its text

The out-of-scope list below excludes a code navigator, and the reason given is
that the languages have editor tooling that answers location. **That reason is
about humans. An agent has no editor.**

What the absence costs, measured on 2026-08-19: fifteen minutes establishing
which of two configuration functions a binary actually called, when both existed
and both read the same environment variables. A type defined twice because the
generated one could not be found. A removal that missed two of its own call sites
across six files, one of which shipped and had to be taken out again the same
evening.

"Who calls this, and what breaks if I delete it" is the question an agent asks
most and answers worst, with search and luck.

### 2. Cost, which the law has no opinion about

Every rule here judges correctness. Nothing judges what a thing costs, and waste
is invisible at the moment it is written, which is the only cheap moment to fix
it.

Measured the same day: an asset tree holding 44.5 MiB of decoded image to draw
marks nineteen pixels wide, source art thirty times its drawn size; a poll every
sixty milliseconds making sixteen round trips a second to learn nothing had
changed. All of it compiles, type-checks and passes every rule in this document.
An image whose source is thirty times its draw size is as checkable as a
swallowed exception, and cheaper to check.

### 3. What can reach what

A content security policy left unset from the commit that created an application
until somebody went looking. A flag exposing an entire command surface to page
script, read by nothing. A stored preference that could be neither written nor
read because one arm of a conversion was never added.

Three findings, one question: **what crosses this boundary, and what is on the
other side.** Security work is mostly that question, and it is answered today by
reading files until tired. The edges are declarable and the answer is checkable.

### 4. Evidence produced and thrown away

A `catch {}` is refused here because it deletes evidence. **A log line nobody will
ever read is the same failure with more steps**, and nothing refuses it. A
diagnostic written into a process on an end user's machine, reaching no collector
and no operator, is a swallowed exception that took longer and looked responsible.

### 5. Looking without touching

The seer can see a window and cannot act in it. An agent that needs one control
toggled to distinguish two hypotheses must ask a person and wait, and the round
trip costs more than the observation was worth. Whether the answer is letting it
act is a consent question this document is not ready to settle; the asymmetry is
recorded because it is paid for regularly.

## The canon is a tree, and the tree is how it scales

A flat canon forces a coarse adopter. Measured in one project on 2026-08-19: its
frontend doctrine was a single 6,233-character file holding fifteen unrelated
rules, from design tokens to navigation promises to how an unreadable panel
should fail. Editing a drawing routine pulled all fifteen. The file was one file
because **the canon offered one slot**, and that is the general shape: an
adopter's knowledge lands in the containers this canon defines, so the canon's
granularity sets theirs.

So the canon is grouped, two levels, and a branch is small enough to be worth
sending whole. `tests/canon-tree.test.ts` holds four properties, and the fourth
is the one with a number in it: **a branch over 2,500 characters fails the
suite**, because a branch that large is one the budget drops whole. It caught the
TypeScript branch at 2,570 on its first run.

That failure found a real duplication rather than a size problem. The same
logging rule was written into four language branches and, by this work, a fifth.
It now lives once in `observe/logging` and the language branches point at it,
which took the canon *down* by about 1,500 characters while adding twenty-two
branches to it.

**Routing is where the honesty is.** Of the twenty-two, fifteen are selected by
path and seven cannot be: `runtime/time`, `runtime/failure`,
`runtime/concurrency`, `runtime/performance`, `observe/logging`, `observe/health`
and `secure/input` are true of code anywhere and match no glob. They are pulled
by name, which works and is weaker, because it needs the reader to know they
exist.

### The tree is only half a tree until the adopter can follow it

The first version of this shipped with the adopter locked out of it. Branch names
become file paths through `readProjectBranch`, guarded by `A_FILE_STEM`, which
allowed letters, digits, dot, dash and underscore and **no slash**. So
`isABranchName("ui/state")` was false and every one of the twenty-two new
branches was canon-only: an adopter could never write their half of one.
`listBranches` did not recurse either, so a nested file of theirs was invisible.

That is the whole point of the tree, so it is now a property:
`canonBranchNames()` must all pass `isABranchName`, or the tree governs only half
of itself. The guard still refuses `..`, a backslash, a leading slash and an empty
segment, because a branch name is a name and never a way out of the folder.

The pairing is one-to-one on purpose. A branch is a canon half and a project half
under the same name, and the router sends both or neither. That is what makes
many small branches better than one large one: the reader gets three branches
about the thing they are touching instead of one file about everything, and both
halves of each are about that thing.

### A branch that cannot travel with a neighbour

The canon's own 2,500 cap is a test, so it protects the canon and nothing else,
which is exactly how an adopter's files reach 7,988 characters unnoticed. The
ceiling is now derived rather than picked, and it is reported to the adopter:
`INJECTION_BUDGET / 6`, or 1,633 characters for an assembled branch. Six because
the router's required lines take the first third of the budget and a task
routinely names three branches, so a branch that will not fit in a sixth is one
that can only ever travel alone.

`looper status` names every branch over it with its number, under "rule sets that
will never arrive". Run against the project that prompted this work it named
eight on the first run, and three of them are this canon's own: `law` at 2,563,
`python` at 1,690 and `csharp` at 1,685. It is a complaint rather than a refusal,
because splitting a doctrine is the adopter's judgement and a gate that blocks a
commit over it would be a gate nobody keeps.

That ratio is the argument for the next two steps, neither built.

**Route on content, not on paths.** The law already parses every judged file to
an AST. So it already knows a file contains SQL, opens a socket, holds a lock,
spawns a process, catches an error. That is enormously more precise than a glob
and costs nothing new, because the parse has happened either way. A file with a
lock in it should raise `runtime/concurrency`; no path expression will ever say
that.

**The drop marker is that index already, for the part being dropped.** A
contribution may carry a `summary`, one line saying what it holds, and the
allocator prints it beside the size of anything it could not fit:

```
[looper: 8 contribution(s) dropped for budget. Each is listed with what it holds,
so this is an index and not a silence:
  doctrine:data/indexing (1118 chars): Making a query fast before it is slow.
  doctrine:work/deploy (3997 chars): Getting a change onto the machine that runs it.
```

The line costs nothing to write: every canon branch already opens with a sentence
saying what it is for, so the index entry was written the day the branch was. The
router skips the heading `assembleBranch` prepends, which names the branch a
second time and says nothing.

This is what pays for making branches droppable. `#125` was right that a rule
which never arrived reads exactly like a rule that was followed, and a size in
bytes does not fix that, because a reader cannot tell from `1118 chars` whether
they needed it. A rule offered by name **and by subject**, with a tool that
fetches it, is a choice the reader makes. That difference is why the reversal is
written in `.looper/decisions.md` rather than simply taken, and the entry names
what has to be true for it to expire: pushing an index and pulling bodies, so
that nothing is dropped at all.

**The constitution carries the index, and it is generated.** The constitution is
paid on every single message and named no branch at all, so the seven that route
by no path (`runtime/*`, `observe/*`, `secure/input`) could only be reached by a
reader who already knew they existed. `canonBranchIndex()` builds the list from
`canonBranchNames()` and `assembleConstitution` appends it:

```
# THE BRANCHES. Name every one your task touches and pull it by name with the
# doctrine tool before you act; skip the rest. A branch you do not name is one
# you do not get.
#   data/         schema indexing migrations queries
#   runtime/      time failure concurrency performance
#   ...
```

589 characters for 33 branches, 6% of the budget, and adding a branch costs a
word rather than an edit. It is generated rather than written down for the reason
every other list here is: a hand-kept index of a growing tree is an index that is
wrong, and wrong quietly. Two properties hold it, one that every branch appears
and one that the whole block stays under 900 characters, because past that it is
cheaper to name the groups and let the reader ask for the leaves.

This is the first half of the inversion below, taken for the cheapest case. The
second half is the branch bodies.

### A fault outranks a rule, because only one of them can be asked for

The loop injected at priority 20 and doctrine branches at 10, so on any turn
whose branches filled the budget the one line saying a layer is broken went over
the side. Seen in an adopter's own drop markers on 2026-08-20: `loop (337
chars)`, `loop (292 chars)`, `loop (293 chars)`, each time next to several
kilobytes of doctrine that arrived.

That ordering is backwards, and the asymmetry is the argument rather than any
opinion about which matters more. A rule set that does not arrive is still
reachable: the reader is told it was dropped and the `doctrine` tool fetches it
by name. **A fault nobody mentions is one the reader does not know to ask about**,
and the whole reason the loop exists is to reach somebody working three files
away from the thing that broke.

`LOOP_PRIORITY` is now 5, between the constitution and the branches. It costs
nothing to do this: the capability already returns `SILENT` when `broken` and
`blind` are both zero, so a healthy project injects no loop line at all and the
budget is untouched. The change is only visible on a turn where something is
actually wrong, which is the turn it was built for.

Pinned by a test that fills the budget with rule sets, breaks one check, and
requires the check's name in the text that goes out. It fails with the old
priority, which is what makes it a test rather than an agreement.

### The loop grew teeth, and lied on its first firing

The constitution's first rule now names `looper loop`, and a rule that names a
command is still told. `Loop` becomes a `CommitMessage` gate.

**Broken refuses the commit. Blind does not.** Broken is a fact about the code in
front of you; blind is a fact about the world, and a gate that refuses your
commit because a remote box is down is a gate somebody turns off. Blind is stated
and not refused, and every prompt still says it is not ok.

Three more refusals it does not make. A project that declared no checks is never
refused over them, because an empty `loop.toml` means there is nothing of theirs
to be broken. A cache that cannot be read passes rather than blocks, because
looper's own failure is not the committer's. And the departure is available in
the message, `Loop-broken: <why>`, which is the constitution's own rule about
saying a departure out loud, once, applied to itself.

It reads the answer `looper loop` last wrote rather than running anything. A gate
that takes minutes is a gate that gets bypassed, and the loop here takes about
twenty seconds across eight checks. The consequence is that a stale broken answer
still refuses, which is correct: re-running clears it, and that is the behaviour
you want a gate to provoke.

**Fired against an adopting project on the first try and produced a lie.** It
said **one** check was broken and then **named two**, because `Kept.failing`
merged broken with blind and the second of the two was blind, not broken. Naming
a blind check as broken is the exact report this vocabulary exists to make
impossible, produced by the gate built to enforce it. The names are that
project's and stay there. `Tally` and `Kept` now carry `brokenNames` and `blindNames` separately, a
cache written before this says "run looper loop to see which" rather than
guessing, and a test pins it with the real firing in its message.

### The constitution became the index, and the index is generated

The constitution named no branch at all, so the seven that route by no path could
only be reached by a reader who already knew they existed. The fix is not a list
written into the file. It is the file becoming the list.

`constitution.md` now holds a header and four absolutes: run the loop, never
invent data, report what happened with the proof, end with what changed and what
is next. Those are true of a message with no code in it, so they cannot be a
branch.

The loop is first because it is what the predecessor put first, and for the same
reason. Its constitution opened with "No network in the dependency tree, ever,
`just check` stays green. This is the one invariant the whole product rests on",
and that rule had teeth: `just check` ran a `deps-invariant` recipe that failed
the build if a named crate appeared in the resolved tree. The general shape is
"name the thing this rests on, and one command that proves it", and this tool
already ships the command. `looper loop` reads `.looper/loop.toml`, runs what the
project declared, and answers `ok`, `broken` or `blind`. A fresh adopter has
declared nothing, so the rule reads as an instruction to declare it, which is the
right first thing to ask of them.
Everything else moved into one, and `branchIndex(root)` builds the rest at
injection time from `listBranches`, which merges the canon's names with whatever
the adopter has written:

```
- architecture  State has one home and that home is the truth.
- deps          Nothing enters unread, unpinned or unowned.
- rust          No comments.
- <their own>   <its own first rule, exactly as they wrote it>
- data/         indexing migrations queries schema
```

The rule quoted is the branch's own first bullet, preferring its bolded lead,
which is where every canon branch already states its hardest rule in one
sentence. Nothing is stored. A branch added here appears in every adopter's
constitution at the next pin; a branch the adopter writes appears on their next
message; and neither requires anyone to keep a list.

**Five branches were missing and were found by probing rather than by opinion.**
Searching the canon for `third-party`, `supply`, `speculative`, `propagate`,
`vanish`, `outcome` and `commit only` returned nothing, so: `structure` (deciding
the shape), `discipline` (writing code once the shape is decided), `authority`
(who decides, and what an assumption costs), `voice` (anything a person reads)
and `deps` (taking on code you did not write). The last is the serious one: a
canon with rules about indexes and migrations had nothing about what you are
allowed to depend on.

**The cap had to change with it.** `tests/budget.test.ts` counted bullets, capped
at 14, and twenty-seven one-line index entries are not twenty-seven rules. It now
measures the always-on tier in characters, capped at 5,200, because characters
are what the budget actually spends. The index has its own ceiling of 2,200, past
which each group collapses from its leaf names to a count.

**Push an index, pull the body.** The constitution already instructs the reader
to pull the branches their task touches, so pushing whole branches is the
fallback that spends the budget. Inverted, the per-turn cost stops growing with
the rule set: a two-level tree of two hundred branches indexes in about forty
lines, and the bodies arrive only when asked for. That is the only arrangement
that survives a canon which keeps growing, and it is what makes "more branches"
an improvement rather than a heavier bill.

**And everything checkable belongs in the law rather than here.** "An index
exists before the query that needs it", "a migration that has been applied is
immutable", "art is stored at the size it is drawn" are all checks wearing prose.
A law rule is already content-routed and already mechanical, which is why the law
scales without a budget and the doctrine does not.

## Deliberately out of scope

- **A code navigator.** No AST index, no call graph, no `find`/`callers`/
  `usages`. It is the substrate for capabilities we are not building, and the
  languages here already have editor tooling that answers location.
- **`reuse`.** It is a query against that index. Without the index it has no
  substrate, so it is deferred rather than built badly.
- **Vision.** Screen capture with a consent gate is a good product and a
  different one. Out of scope, no removal condition needed.
- **A WSL to Windows bridge.** Only vision would have needed one.

## Who it is for, and how deep it goes

looper is handed to whole teams — marketing, data, engineering — and each points
it at their own project. That is a distribution requirement, and it rules some
things out. It cannot assume the installer is a TypeScript engineer, cannot
require configuration before it is useful, and cannot ever damage a repo it does
not understand.

It resolves into **two depths, and the depth is detected, never declared**:

**Depth 1 — any project, any language, any team.** The doctrine tree, the
credential gate, durable memory, the freshness gate, and the one law rule that
needs no parser: the file-size cap. None of this reads code as code, so it works
on a marketing team's repo of SQL, spreadsheets, scripts and documents exactly
as well as on a service. A team at this depth gets rules re-asserted every turn,
secrets caught before they are committed, and memory that survives the session.
That is already most of the value and it costs them one command.

**Depth 2 — the prescribed stack.** Everything above, plus the full law. This is
where the `TYPE`, `ERROR`, `DEAD`, `LAYER`, `REACT`, `NEXT`, `NODE` and `DATA`
packs live.

The rule that makes this work is already in the capability model and is restated
here as a promise: **what does not apply is silent, never an error.** A repo with
no `.ts` files hears nothing from the TypeScript law. A repo with no React hears
nothing from the React pack. There is no configuration step where someone
declares what they are — the file extensions and the imports already said it.

Four consequences worth writing down before they are discovered:

- **Zero-config must be genuinely useful,** because a marketing team will never
  write a doctrine branch. The canon has to carry real value on its own, which
  raises the bar on chunk 1 rather than lowering it.
- **Every message must read to a non-specialist.** The repair prompt already has
  to be sufficient to fix from; now it also has to be sufficient for someone who
  does not know the language's jargon. That is a constraint on the wording of
  every violation, not a nicety.
- **Depth 1 must never mention depth 2.** Telling a team about rules that will
  never apply to them is noise, and noise is how a governance tool gets
  uninstalled.
- **Nothing load-bearing sits behind a command someone has to know to type.**
  This is the one most easily got wrong, because writing `looper law` into a plan
  feels like shipping the feature. It is not. The user this is built for does not
  know the command exists, and — the harder half — could not tell when running it
  would have helped and when it would not. A check that fires only when someone
  who cannot judge decides to run it is a check that does not fire. So **every
  gate triggers on its own**, and **every fact that must be seen is pushed to
  where the reader already is** rather than waiting in a command's output.
  Commands still exist, for the author and for debugging; they are never the only
  path to anything that matters.

### Self-sufficient, because there is nobody to fall back on

The user this is built for has the idea and none of the craft. Not an engineer
who is busy — no engineer, at any point, ever. Every place the design quietly
assumes one is a place the tool stops working, and the assumption is easy to make
because it looks like ordinary good manners: leave that decision to the user.
There is no user qualified to take it.

So the standing rule is **the system finishes what it starts.** If a step is
needed for looper to work, looper does it. Printing an instruction and calling
that shipping the feature is the same mistake as putting a check behind a command.

**It may ask, and the questions are the product's manners.** Three constraints,
and they are constraints on the wording, not sentiment:

- **Ask about the outcome, never the implementation.** They can answer "should
  people be able to sign in?" They cannot answer "session cookie or bearer
  token?", and asking is worse than useless — it transfers a decision to the one
  person who cannot make it, and they will answer anyway, from the shape of the
  question rather than knowledge. The canon already forbids asking which of two
  sound options to take; here the ban is wider, because at this depth almost every
  technical fork is one the model must simply decide.
- **What earns a question changes with the depth.** For an engineer the short list
  is schema, wire contracts, security boundaries. For this user it is: what the
  thing should *do*, anything that costs money, and anything that cannot be
  undone. Those three and nothing else.
- **No jargon, no acronym, no file path in the question.** Concrete, two or three
  options, each with what it means for them in a sentence.

**The concession path closes at depth 1, and that is deliberate.** A valve is one
visible line in a diff, argued once, reviewable forever — but that model assumes a
reviewer, and here there is none. An agent that could talk this user into waving a
rule through has an elaborate way of talking to itself, and the rule it waves is
the one protecting them from a decision they cannot judge. So the agent finds the
compliant path or it keeps working; it does not offer the user an exit. Valves,
pardons and disabled rules stay what they are — an expert's instrument, on an
expert's project.

That costs something and the cost is named here rather than discovered:
**precision matters more at this depth than anywhere else,** because there is no
escape hatch at all. The failure mode is not the one the plan warns about above —
this user will not disable a rule that keeps misfiring, because they would not
know how. They will simply be stuck, watching an agent fail in a loop, with no way
to tell whether the tool or their idea is at fault. A rule that is wrong here does
not get switched off; it wastes their afternoon and their trust.

Which sets the last obligation: **a violation the agent cannot discharge is our
bug, not their problem.** If the law blocks and no legal spelling exists, that is
a defect in the rule set, and it is recorded as one — never handed to the user as
a technical decision to resolve.

## The stack looper governs

For depth 2, looper prescribes a stack rather than accommodating whatever it
finds. That is the move the law and the doctrine already make, one level up: an
opinion, argued once, enforced everywhere. The alternative — supporting every
language a company has ever shipped — buys breadth by making every language reader
shallow, and a shallow law is one an optimizer walks around.

To be explicit, because the two sections could be read as contradicting each
other: **the stack is a prescription for building new services, not a
precondition for using looper.** A team on none of it still gets depth 1, in
full, with no complaint from any capability about what they are missing.

**One language: TypeScript, everywhere.** Web, mobile, API, scripts. Not because
TypeScript wins every slot on its own merits, but because the coherence is worth
more than any single slot's optimum:

- One grammar means **one parser and one language reader, at full depth, over all new
  code**. The broad-but-thin tier stops being a requirement.
- One type system spans the whole request path, so a renamed database column is
  a compile error in a React component. That is fewer bugs bought structurally
  rather than by discipline.
- One set of idioms to write doctrine about. The canon has one language to be
  right about.

A stack still needs one tool per job. That is not the same as one language per
job, and the distinction is the entire point. **The list of tools lives in
STACK.md and only there** — this section argues the choices, that file states
them, and a test refuses any attempt to keep a second copy here.

Compiler settings are part of the stack, not a preference: `strict`,
`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`. The last two are the
ones teams forget and they are the ones that catch real bugs.

Two entries are load bearing for the law rather than for the product. **Pino**
gives the "a failure must be observed" rule a named symbol whose provenance can
be verified — `logger.warn`, `logger.error` — which is what stops a local
do-nothing function called `warn` from satisfying it. **Drizzle** puts the
database schema in TypeScript, so the parser we already have can read it; a
schema in its own language would cost a second grammar.

### The picks that were close, recorded so they are not relitigated

- **Drizzle, not Prisma.** Prisma has the better first day. But its schema is a
  separate language, which would put a second grammar into a stack whose whole
  premise is one grammar, and it generates a client that must be kept in sync.
- **Hono, not Nest or Fastify.** Nest fails "easy to navigate": decorators and
  dependency-injection metadata mean the call graph is not in the code. Fastify
  is the conservative swap and is not a wrong answer.
- **The API is standalone, not Next.js route handlers.** React Native needs the
  same API the web does, and an API living inside the web app is one the phone
  cannot reach without deploying the website.
- **OpenAPI, not tRPC.** tRPC is nicer when every caller is TypeScript. Callers
  outside it — existing services in other languages, partners, third-party
  integrations — are served by a generated spec and stranded by tRPC.

### What this means for the languages already here

Every organisation that adopts this has services in languages the prescribed
stack does not cover, and they do not disappear. They are **governed shallowly**:
`router`, `secrets`, `recall` and the freshness gate are language-agnostic and
need no parser at all, so those repos still get doctrine, a credential gate and
memory. What they do not get is the law.

New work goes on the prescribed stack and gets the full law. That asymmetry is
the incentive and it is deliberate.

**looper does not scaffold this stack.** Prescribing what a project is built
from is not the same as generating it, and a starter-app generator is a
different product. Out of scope, no removal condition needed.

## The capability model

One trait, registered once, and its MCP tools plus its per-prompt injection plus
its hook reactions all wire themselves:

```ts
interface Capability {
  readonly name: string;
  tools(): ToolDef[];
  call(tool: string, args: unknown): Promise<ToolResult>;
  hooks(): HookEvent[];
  onHook(event: HookEvent, payload: unknown): Promise<Outcome>;
  inject(ctx: InjectCtx): Contribution;
  scaffold(): FileChange[];
}
```

`inject` is synchronous on purpose: it runs on the prompt path, it may only
read state the registry already holds, and a capability that wants to do I/O
there is a capability that will one day hang a turn.

A capability that does not apply to a project is **silent, never an error**. A
Python rule set has nothing to say about a repo with no `.py` files, and saying
so on every prompt is worse than saying nothing.

v0.1 capabilities: `router` (the doctrine tree), `law` (the standard),
`secrets`, `recall`.

**Implementation language: TypeScript on Node.** It is the stack the people who
will maintain this already read, and a governance tool nobody on the team can
edit is a governance tool that gets deleted. Node ≥ 22, shipped as an npm
package with a bundled single-file entry point.

That choice was measured, not assumed, because the honest objection is speed:
the hook runs on every matched tool use, so process start is a tax paid per
edit. Measured on this machine, 2026-08-17, Node v22.23.2:

| | module load | parse (1,562-line TSX) | walk (12k nodes) | cold process |
|---|---|---|---|---|
| `typescript@5.9.3` | 105 ms | 36 ms | 1.2 ms | 164 ms |
| `@babel/parser@7` | 8.8 ms | 38 ms | 2.4 ms | **67 ms** |

Three results, and they set the architecture. **Module load dominates, not
parsing** — so the parser is required lazily and only an event that actually
judges code pays for it. **Walking is free** — 12,254 nodes in 2.4 ms means rule
count is not a cost, and a language reader can run its whole set in one pass. And a
bare `node -e '0'` is 18 ms, which is the floor under everything.

So the budget is **~70 ms on an edit that parses and ~20 ms on one that does
not**, against agent turns measured in seconds.

**Measured again 2026-08-17, with 23 rules built, and it caught a real mistake.**
The whole fast set on one file took 63.8 ms, of which 64.6 ms was parsing: every
rule was parsing the same file again, so the cost grew linearly with the rule
count and would have passed the budget at around thirty rules. The prediction
above — walking is free, rule count is not a cost — was right, and the engine was
not built to it. Parsing is now remembered per file, and the same measurement is
30.3 ms cold and 11.1 ms warm, flat in the number of rules. A test holds it by
comparing the whole set against a single parse rather than against a wall-clock
number, so it stays honest on a slower machine. The old ~15 ms figure was a
number from a compiled language and it is retired rather than missed. Throughput
at pre-commit is the budget that actually bites, and there the process is warm
and the cost is ~38 ms per file.

## The doctrine tree

Four tiers, each matched to how big the content is and how enforceable it is.

| tier | where | how it reaches the model |
|---|---|---|
| 0 | canon constitution (in the binary) + `.looper/doctrine/constitution.md` | injected every prompt, canon half first |
| 1 | canon branch + project branch of the same name, merged | auto-loaded when the session's files land in the branch's area (`map.toml`), or pulled by name with the `doctrine` tool |
| 2 | the project's own long-form docs | read on demand, never injected |
| 3 | `law`, `secrets`, the freshness gate | runs, and is not asked to be remembered |

Two selection mechanisms, both needed. **Signal-directed:** the hook sees which
files the session touches and loads that area's branch unasked. **Model-directed:**
the constitution carries a branch index and an instruction to name every branch
the task touches and pull each, because only the model knows what it is about to
do. The index and the instruction are content, not comments: a router that
strips `#` lines silently kills the model-directed half and every cross-cutting
branch with it.

Injection is **allocated, not taken**: a hard char ceiling, contributors ordered
by priority, overflow dropped with a visible marker, and `looper status` prints
what is injected and what it costs per turn. Invisible per-turn overhead is how
this kind of tool becomes unusable with nobody able to point at the cause.

**The measured numbers, 2026-08-17,** because the budget is a measurement and not
a preference. Always-on tier 3,530 chars; every branch matching at once 9,621;
budget 9,800; hook ceiling 10,000. It runs close because a rule anchored to a
dated failure costs roughly three times what the same rule costs as a principle,
and that anchoring is what stops it being skimmed — so the cost is bought
deliberately. The number that has to come down is the **always-on tier**, not the
total, and the thing that brings it down is the model-directed `doctrine` tool:
the lines with no file to signal them (the isolation rule, the tie-break) are
always-on today only because nothing else can reach them. A test gates the widest
case, so this cannot drift silently.

**The tree must not rot.** `map.toml` ties each branch to the code it governs.
Change code under a governed area without updating that branch and the commit is
refused unless the message carries an explicit `Doctrine-freshness: <why not>`
line. That bypass is itself a counted, surfaced artifact, because a mechanical
gate cannot tell a human's considered "no change needed" from an agent pasting
the same line on every commit. The agent writes both the code and the message.

## The law: one engine, several language readers

This is the part that needs the most care and it is why the plan is chunked.

### What the law is for here, which is not what it was for in a compiled language

Worth stating plainly, because it changes the bar for what counts as a rule.

In a language with checked errors, the compiler already makes failure loud. A
fallible call cannot be ignored by accident — throwing the result away takes a
deliberate keystroke. A law in that world is largely **reactive**: the rigor
already exists and the rules catch people escaping it.

TypeScript is the opposite. Silent failure is the default, and it compiles clean:

```ts
try { await save(user); } catch {}   // the failure vanishes
save(user);                          // never awaited; the failure vanishes
```

Neither line produces a warning from anything. So the law here is not policing
escapes from rigor — **it is supplying rigor the language does not have.** That
is the project in one sentence, and it is why the law is the capability that
justifies the rest.

### Two classes of rule, because "evidence" means two things

Property 5 below says rules grow only on evidence, and it stays. But conflating
the two kinds of evidence would either block the founding rules or license
speculation, so they are named:

- **Constitutive.** The language permits a failure mode by default. The evidence
  is the language's own semantics, demonstrable in a three-line fixture that
  compiles clean and loses an error. These ship from day one, and they are the
  reason the tool exists. An empty `catch` is not a speculative rule.
- **Reactive.** Everything else, added only when a real bypass is caught in real
  work — never because it seemed likely.

A proposed rule that files under neither was invented rather than found, and
that is exactly the signal to reject it.

### The five properties every rule has to hold

A syntax-level rule engine is easy to build badly. These five are what separate
one an agent obeys from one it routes around, and no rule ships without all
five:

1. **Syntax only.** No type inference, no compilation. That is what lets it run
   on a single unsaved file in milliseconds, and it is also what stops it
   disagreeing with itself between versions.
2. **The violation message is the repair prompt.** What is banned, why the rule
   exists, the legal spellings written out as working code, and the valve if the
   rule has one. Enough that the fix needs no other document. A terse
   `E103: disallowed construct` costs a round trip every time it fires.
3. **Non-gameable.** The consumer is an optimizer. A rule that requires failures
   be logged is satisfied by declaring a local do-nothing function called `warn`,
   so the engine verifies the symbol's provenance: real dependency, not shadowed.
   Parameterize the vendor, never the requirement.
4. **The knobs are a single visible file.** `law.toml` at the root, every key
   written at its default, so deleting a key changes nothing and deleting the
   file changes nothing. A concession is one line in a diff, argued once,
   reviewable forever.
5. **Rules grow only on evidence.** A rule is added when a real bypass is
   caught, never speculatively. Rule sets rot by accretion, each addition
   defensible alone, the whole becoming a maze the agent navigates instead of a
   principle it follows.

### How the rule set is derived

Rules are written per language, from how that language actually goes wrong.
Nothing is transcribed from anywhere. The categories are shared, and for each
one the question is what the failure's spelling is in the target language:

- **Silent error handling.** TypeScript: `catch {}`, `.catch(() => {})`, a
  caught error neither logged nor rethrown. Python: a bare `except:`,
  `except Exception: pass`.
- **Erased error types.** TypeScript: `catch (e: any)`, and
  `throw new Error(string)` where a typed error exists.
- **Defeated type checking.** TypeScript: `as any`, `as unknown as T`,
  `@ts-ignore`, `any` in a written position, non-null assertion `!`. Python:
  `# type: ignore`.
- **Namespace laundering.** `export *`, `from x import *`.
- **Language-native rot.** Python: a mutable default argument, a bare `assert`
  used as a runtime check, a mutable module-level global. TypeScript: a floating
  promise in statement position, `==` where `===` is meant.

Where a category has nothing to say in a language, that is recorded as a
deliberate absence, so nobody later fills the gap with a bad approximation.

The categories are language-neutral: `DECOMPOSITION`, `LAYER`, `ERROR`, `TYPE`,
`DEAD`, `TRUTH`, `LOG`, `TESTS`, plus `REACT` where hook and component rules
genuinely have no home in the eight. Rule ids are namespaced by language reader so
`law.toml` reads unambiguously: `TS-ERROR:1`, `PY-ERROR:1`, `REACT:1`.

### The TypeScript rule table

The derivation above, carried out. The question asked of each failure mode is
not "is this rule good" but **"does this failure exist in TypeScript, and what
is its spelling here"** — so a rule survives when the failure survives, changes
when only the spelling changes, and is dropped when the language cannot express
the failure at all. A dropped rule is recorded as a deliberate absence so nobody
later fills the gap with a bad approximation.

The axis this table is judged on is **precision, not severity.** Severity is
free: the agent pays it, in the same turn, from a repair prompt that contains
the fix, and the human never sees it. Imprecision is expensive: a rule that is
wrong a hundred times burns the turn and teaches the consumer that the law is
noise to route around, which is the only way this actually dies. So every rule
below must be decidable from syntax without false positives, and must hand back
a legal spelling the agent can discharge — and the set as a whole must be
collectively satisfiable, because a legal spelling that violates another rule
leaves the agent with nowhere to go.

**`DECOMPOSITION` — every file has one job.**

| id | bans | origin |
|---|---|---|
| `TS-DECOMPOSITION:1` | file over the line cap | carries unchanged; the one law rule that needs no parser, so it is also the depth-1 rule |
| `TS-DECOMPOSITION:2` | an `index.ts` barrel holding anything but `export … from` | rewritten. Logic parked in the map is logic nobody goes looking for, and a barrel with a body is also how the circular-import class that Rust does not have gets built — **not built yet** |
| `TS-DECOMPOSITION:3` | function over the fn line cap | carries unchanged; declarations, arrows and methods alike — **not built yet** |

**`LAYER` — the import graph is law.**

| id | bans | origin |
|---|---|---|
| `TS-LAYER:1` | an import crossing the declared layer map | carries unchanged, and is cheaper here than in a language with inline paths: imports are explicit, and the layer is the first segment under `src/` — **not built yet** |
| `TS-LAYER:2` | `require()` and dynamic `import()` at a call site | rewritten. TypeScript has no inline qualified path, but the failure is the same one — a dependency that no header shows and no layer check can see |
| `TS-LAYER:3` | assignment or mutation into a module-level container of callables | rewritten, and sharper than its ancestor. A `const` map of imported handlers is visible in the graph and passes; what inverts the graph is *registration at runtime*, so the rule targets the write, not the declaration — **not built yet** |

**`ERROR` — propagate or crash; if you recover, the log knows.**

| id | bans | origin |
|---|---|---|
| `TS-ERROR:1` | a floating promise — a fallible call in statement position, never awaited | rewritten, and **not decidable from one file** — it runs on the slow pass, see below |
| `TS-ERROR:2` | a discarded payload: `catch {}` binding nothing, `catch (e)` where `e` is never read, `.catch(() => …)` taking no parameter | rewritten — **not built yet** |
| `TS-ERROR:3` | a catch arm fabricating a value: `catch { return null }`, `return []`, `return {}`, `.catch(() => [])` | carries in full, and it is **the highest-value rule in the set for TypeScript** — the dominant failure in agent-written code, and precisely syntax-decidable |
| `TS-ERROR:4` | a caught error neither rethrown, propagated, nor observed, in a `catch` clause or in an inline `.catch(...)` handler | carries in full, with the provenance check on the blessed symbol: `logger.warn` / `logger.error` resolved through a real import of a real dependency in `package.json`, not shadowed by a local binding |
| `TS-ERROR:5` | a project missing its deputy compiler options | rewritten, and it changes shape: the deputies are `tsconfig.json` settings rather than crate-root attributes, so the rule fires on the project, not on the file — **not built yet** |
| `TS-ERROR:6` | an `async` callback passed to `forEach` | rewritten and narrowed. The ancestor's target (a fallible absorbed by iteration) has no TypeScript form, but `forEach(async …)` silently drops every promise it makes, is a guaranteed bug, and is decidable |
| — | a caught unwind | moved to the `NODE` pack: the TypeScript form is `process.on('uncaughtException' \| 'unhandledRejection')` swallowing, which is server-side only |
| `TS-ERROR:7` | fallible work in a `[Symbol.dispose]` / `[Symbol.asyncDispose]` body | carries after all. First dropped as "JavaScript has no destructors" — it does now, and "few people use it yet" is the same budget argument. A rule for a construct nobody writes costs nothing while nobody writes it and is standing there the day someone does. The reasoning transfers exactly: dispose cannot propagate, so every failure it meets is swallowed by construction |

**`TYPE` — the signature is the contract.**

| id | bans | origin |
|---|---|---|
| `TS-TYPE:1` | an erased error type: `catch (e: any)`, a `throw` of a non-Error, `throw new Error(string)` where a typed error exists | rewritten — **not built yet** |
| `TS-TYPE:2` | `T \| undefined` / `T \| null` returned from an **exported** function | rewritten from the Option-on-a-public-surface rule; the failure is identical — the caller cannot tell "not found" from "found nothing" from "never looked" — and so are the exemptions: private functions, fields, locals and generics are untouched |
| `TS-TYPE:3` | `as any`, `as unknown as T`, `<T>expr`, and the non-null assertion `!` | carries, with a wider spelling list than its ancestor. TypeScript's `as` is worse than a numeric cast: it asserts *any* type, unchecked. This is pillar 4's centrepiece. Legal spellings: a schema parse, a type guard, `satisfies` |
| `TS-TYPE:4` | `any` in a written type position | new; distinct from `as any`, and with no counterpart in a language that has no `any` |
| — | a `Result` alias hiding its error half | **dropped.** The language has no `Result`. Deliberate absence |
| `TS-TYPE:5` | silent numeric mangling: `~~x`, `\| 0`, `parseInt` without a radix, unary `+` on a string, `.toFixed()` feeding arithmetic | rewritten and **constitutive**. First drafted as reactive on the grounds that it is "real but infrequent" — which is a budget argument, and there is no budget. Every spelling is precisely detectable and every one turns a decoding failure into a number that travels on, indistinguishable downstream from data that was always fine |

**`DEAD` — code not serving the program right now is noise.**

| id | bans | origin |
|---|---|---|
| `TS-DEAD:1` | `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`, `eslint-disable*` | carries in full, and it is what makes the deputies airtight: muting the deputy is the evasion the deputation exists to close |
| `TS-DEAD:2` | every comment — `//`, `/* */`, `/** */`, JSDoc | carries in full, and the case is **stronger here than in its origin**, because the primary reader is a model. Comments are high-signal in training data, so a stale comment does not merely fail to help — it overrides what the code says, to a reader who cannot check it. The ban is a relocation, not a silencing: a constraint becomes a type or an assert, an explanation becomes a name, rationale goes in the commit message where it is dated and attached to the change, prose goes in `.md` outside `src/` |
| `TS-DEAD:3` | `throw new Error('not implemented')`, an empty body on an exported function, `return null as any` | rewritten. The language has no `todo!`, so the spelling is the shape rather than the macro |
| `TS-DEAD:4` | `export *`; and `import * as` from a **local** module | carries, split in two — and the split is on the rule's own target, not on convention. What the rule bans is *anonymous* provenance: a name whose origin nobody can trace. `export *` is exactly that and is banned outright, barrel problem included. `import * as z from 'zod'` is the opposite — every use is `z.something`, so the origin is named at every call site. A namespace import from a local module still hides which layer you depend on, which is how `LAYER:1` gets fooled, so that half stays banned |

**`TRUTH` — every fact has exactly one home.**

| id | bans | origin |
|---|---|---|
| `TS-TRUTH:1` | **every spelling** of a default born outside the sanctum: `??`, `\|\|`, `??=`, `\|\|=`, a default parameter `f(x = 5)`, a destructuring default `{ x = 5 }`, `if (!x) x = 5`, and a spread merge over a defaults object | rewritten, and taken at full strength — the reasoning is below |
| `TS-TRUTH:2` | `process.env` and `import.meta.env` outside the declared files | carries in full: trivially decidable, and the same sin in the same shape |

**`LOG` — stdout belongs to the program's output.**

| id | bans | origin |
|---|---|---|
| `TS-LOG:1` | `console.*` outside the entry point | carries, and matters **more** here than in its origin: `console.log` is the language's default debugging idiom, so agent output is full of it |
| `TS-LOG:2` | `process.stdout.write` / `process.stderr.write` outside the entry point | carries; closes `TS-LOG:1`'s loophole exactly as its ancestor does — **not built yet** |

**What the audit added.** `TS-ERROR:8` has no ancestor: it was born from the
audit of 2026-08-17, which found that every check opened with "if the file could
not be parsed, return nothing", so one stray bracket exempted a file from the
whole law while still counting toward a clean report.

| id | bans | origin |
|---|---|---|
| `TS-ERROR:8` | a file that cannot be read as TypeScript at all | new here. A file nothing can parse is judged by no rule, and silence is indistinguishable from a clean file. It reports through the ordinary machinery, so an adopter carrying an unparseable file gets it baselined rather than blocked |

**`TESTS` — tests drive the public surface.**

| id | bans | origin |
|---|---|---|
| `TS-TESTS:1` | an export that exists only so a test can reach it | rewritten, and the ancestor's *rationale* is what failed to transfer rather than its spelling. A test beside its source cannot reach a module-private symbol in TypeScript — the language already prevents it — so banning the file location would enforce a convention rather than prevent a failure. The failure that does survive is widening the public surface forever to keep a private test — **not built yet** |

**What TypeScript rots by, that the origin set had no reason to name.**

- **Module-level `let`** — shared mutable global state, one keyword away at all
  times. A language whose statics are immutable by default never needed the rule.
- **`==` where `===` is meant** — coercion deciding equality in silence.
- **`JSON.parse` with nothing in front of it** — the `DATA` pack, with the SQL
  call-site rule already named above.

**Counts:** of the twenty-eight, **twelve carry unchanged**, **fourteen are
rewritten**, **one is dropped** as a deliberate absence — the `Result` alias,
because the language has no `Result` — and **one moves** to the `NODE` pack. Four
are added. Every rule that survives ships constitutive; nothing is held back as
reactive, because "real but infrequent" was a budget argument and there is no
budget. The categories all survive intact; `ERROR` and `TYPE` change the most,
which is the expected result — they are the two whose failures are spelled by the
language rather than by the culture around it.

**Three decisions this raised, all now taken.** Each would have changed a rule
rather than a wording, so each is recorded with its reasoning rather than
silently folded in:

1. **The floating promise has no gate. — Resolved 2026-08-17: it gets the slow
   pass.** It is the most common way TypeScript loses an error, and it is not
   decidable from single-file syntax: knowing a call finishes later is a question
   about a type the line does not state. `tsc` has no flag for it, so it cannot
   be a deputy the way the others are. The cost is paid rather than the failure
   left ungated — see "Two passes, at three moments".
2. **`TS-TRUTH:1` — Resolved 2026-08-17: taken at full strength, and it is the
   more precise reading, not merely the harsher one.** The worry was that `??` is
   common in legitimate TypeScript and that telling a default from a discharge
   would need judgment — a literal on the right is a default being born, a `throw`
   or a `return` is not. That judgment is exactly where the imprecision lived, and
   it only existed because the rule was being written leniently. Ban the
   construct outright outside the sanctum and there is nothing left to judge: the
   compliant path is always a **statement** rather than an expression, and a
   statement needs no type knowledge to recognise. Strict here is simpler to
   decide, and a rule with no judgment in it cannot misfire.

   The legal spellings, all statements, all available at every site:
   propagate — `if (x === undefined) throw new Missing()`; end the loop —
   `continue` / `break`; return early; or resolve it once in the sanctum, where
   the whole default set is one screen and one diff.

   **A default is a default however it is spelled**, which is why the ban covers
   the destructuring and default-parameter forms too. Pushing the fabrication into
   a parameter list does not push it out of the program: two components each
   defaulting the same prop differently is the two-sources-of-truth failure with
   nicer syntax. This will fire often on React code, and every firing is a real
   instance — volume is not imprecision, and the agent pays it.

   Three supports worth recording. The canon's frontend branch already bans ad-hoc
   colours and spacing inline for the same reason, so this is that principle
   applied to every default rather than only the visual ones. The prescribed
   `exactOptionalPropertyTypes` deputy already forces a project to distinguish
   *property absent* from *property present and undefined*, so a `??` collapsing
   both into a value is erasing a distinction the compiler was maintaining. And an
   optional parameter with no default — `f(x?: string)` — is untouched, because
   nothing is invented there.

   The sanctum is a **filename, not a path**: `config.ts`. Every package in a
   workspace may have one, so there is still exactly one place to read per unit of
   code, and the knob stays a single name rather than a list — a list is how "the
   one place to look" quietly becomes four.
3. **Cross-file rules need a home. — Resolved 2026-08-17: the same slow pass.**
   `TS-TESTS:1` and the unreferenced-export half of `DEAD` are whole-program
   properties a single-file engine cannot reach, and they are answered by the
   same whole-project read the floating promise needs. Two questions, one
   mechanism, which is why they were never really two decisions.

What remains of this table is the other half of its own specification: for each
rule, the repair prompt in full — why the rule exists, the legal spellings
written out as working code, and the valve where it has one. That is the artifact
the whole product rests on and it is deliberately not sketched here.

### Why not eslint as the checker

Because a project-configurable linter is not a law. Any rule can be switched off
in the project's own config, which is exactly what an optimizer does when
satisfying the check is the objective it was given. The law's concessions are
graded, visible in one diff, and never widened to make code pass, and that
property cannot be built on a config format the project owns.

Note that this argument now has to stand alone. While looper was going to be a
compiled binary there was a second reason — wrapping eslint would drag in Node,
`node_modules` and a child process per edit — and that reason is gone, because
we are Node. The remaining reason is the one that was always load bearing, so
the decision survives its own justification getting thinner. Running the law
*additionally* as an eslint plugin, purely to get editor squiggles while the
gates stay where they are, is a fine idea and it is deferred, not refused.

We do not reinvent **parsers**.

### Two tiers of language reader, on purpose

Four languages do not get equal depth, and pretending otherwise would ship a
uniform mediocrity. The engine is one; readers declare which tier they are,
and the engine refuses to load a rule that needs more than its tier provides.

**Tier A — deep. TypeScript, JavaScript, JSX/TSX, via `@babel/parser`.** A real
typed AST with scope and binding information, which is what the non-gameable
property needs: a rule can only verify a symbol's provenance if it can resolve
where that symbol came from. This tier gets the full rule set. It is also where
the overwhelming majority of the code and of the agent's edits live, and it
covers React, Next.js, Node and React Native with no second grammar — those are
rule packs on this AST, not separate readers.

`@babel/parser` over the TypeScript compiler API for two measured reasons: 12×
cheaper to load for the same parse speed, and `typescript@7` has removed the
classic syntax API entirely — the package exports two keys, with no
`createSourceFile` and no `ScriptTarget` — so building on it would mean pinning
a superseded 5.x line forever. Verified on 2026-08-17 against `typescript@7.0.2`
and `typescript@5.9.3`.

**Tier B — broad, and now deferred. Legacy languages via `web-tree-sitter`
(WASM).** Because the stack is prescribed and single-language, tier A covers all
new code, and tier B is no longer on the critical path. It is kept in the design
for one reason: the day judging a legacy Go or Java service is worth doing, the
shape should already be decided rather than invented under pressure.

The shape, when it is wanted: one substrate, one `.wasm` grammar per language,
no native modules and therefore no platform build matrix. It yields a CST rather
than a resolved AST, so rules are written as queries and the set is deliberately
thinner — only failures decidable from syntax alone. That is this plan's
standing preference applied honestly, **the rule set gets thinner rather than
the invariant getting weaker**, and a thin tier B beats no tier B.

Nothing about tier B is measured. Kotlin's grammar is materially less mature
than Java's or Go's, recorded now so it is not discovered as a surprise later.

### SQL needs no parser

The highest-value SQL rule is a TypeScript rule: a query call whose argument is
a template literal with interpolation in it. The failure happens at the call
site, in code tier A already parses. A SQL grammar would buy the ability to
judge migration files, which is worth having and is not worth a reader of its own.
Same reasoning retires most config-injection risks into the tier A packs.

### One repo, several languages

A Next.js frontend beside a Python backend is the common shape, not the
exception. So the law dispatches by file extension to a language reader, and `law.toml`
carries a shared top level plus one table per language:

```toml
max_loc = 500

[ts]
layers = { ui = ["lib"], lib = [] }
sanctum = "config.ts"
env_files = ["config.ts"]
trace_symbols = ["logger.warn", "logger.error"]

[ts.deputies]
tsconfig = [
  "strict",
  "noUnusedLocals",
  "noUnusedParameters",
  "noUncheckedIndexedAccess",
  "exactOptionalPropertyTypes",
]

[python]
layers = {}

[go]
layers = {}

[exempt]
"src/generated/schema.ts" = ["ALL"]
```

`sanctum` is a filename, matched by name in every package rather than one path in
the workspace, and it is deliberately a single name and not a list. `deputies`
are the compiler settings the law requires to be on, because a syntax-only engine
cannot see a type and these can — removing a name there removes a class of
failure from enforcement, so the list grows freely and shrinks almost never.

Rules are code and are compiled in; this file holds only concessions, the layer
maps and the exemptions. That split is the point: if rules were defined in a
file the project owns, the optimizer edits the file instead of the code.

The layer map ships **empty and inert** per language. An empty map is a project
stating it has no declared architecture, which someone can look at and change. A
map we invented on their behalf is one nobody reads and nobody trusts. The rule
set itself is the opposite and ships full: "do not silently swallow a rejected
promise" is not a project's architecture, it is how the language goes wrong.

### Two passes, at three moments

The engine has two passes, because one pass cannot have both properties the
product needs.

**The fast pass — one file, syntax only, no types.** It reads the shape of the
code and nothing else, which is what lets it answer in ~70 ms on a file that has
not been saved. Every rule in the table above is this pass unless it says
otherwise.

**The slow pass — the whole project, with types.** Some failures cannot be seen
from one file, and no amount of care makes them visible: whether an exported
function is used anywhere is a question about every *other* file, and whether a
call finishes later — the floating promise — is a question about a type that the
line itself does not state. Answering either means reading the whole project and
resolving its types, which costs seconds rather than milliseconds. So it does not
run on an edit. It runs at install, when the agent stops, and at commit.

The two are one engine and one report format. The slow pass is not a second
product; it is the same law, answering the questions the fast pass has to decline.

**Four moments, then — and not one of them is a person deciding to check:**

1. **PostToolUse**, the fast pass on the edited file. It fires after the file is
   written and can only hand back a repair prompt — it cannot revert the edit, so
   it is a fast repair loop and not a barrier, and the plan says so rather than
   calling it a gate.
2. **Commit**, both passes. The fast pass over the staged files, and the slow
   pass over the project, judged against the baseline below. This is the moment
   that refuses. Edit-time-only enforcement has a hole you can drive a whole
   session through: if the commit-time enforcer lives in a build recipe the
   project never runs and CI checks other things, a session that ignored the
   repair prompt commits the violating file and nothing stops it. Prose is not a
   control. Anything that must not happen is a gate or it does not exist.
3. **Install**, the slow pass as a survey. `init` on a repo that already has code
   runs it and reports, because that is the moment the question "what did I just
   point this at" is actually being asked. Not a separate command someone has to
   know to run — the moment that matters on an existing repo is the only moment
   we are guaranteed to have their attention.
4. **Stop**, the slow pass again, when the turn changed TypeScript. The agent has
   just finished a piece of work; a dead export it created or an `await` it
   dropped is cheapest to fix now, while the work is still in front of it, rather
   than at a commit that may be an hour away. It reports, it does not refuse —
   the commit is still the barrier. It carries a deadline and says nothing if it
   does not finish in time, because a governance accessory must never wedge the
   session it was only supposed to watch.

`looper law` exists as a command, but it is the author's convenience and the
debugging path, never the mechanism. Every one of the four moments above fires
without anyone deciding to run anything.

**Why the slow pass is not optional, and it is not mainly about promises.** On a
fresh project every file passes the fast gate as it is written, so file-by-file
coverage becomes complete on its own. On a project that already exists it never
does: the repo has five hundred files, the agent touches five, and the other four
hundred and ninety-five are never looked at by anything. Without a whole-project
pass, looper pointed at real existing work has no opinion about the work — only
about the edits. That is the majority case for adoption and it is the case the
fast pass structurally cannot serve.

**The slow pass reads the module graph with our own parser, and takes no type
checker. Decided 2026-08-17, on a measurement that overturned the plan.** The
intention was to drive the TypeScript compiler as a library for type answers.
Measured before adopting it: `typescript@5.9.3` is 23 MB, and
`node_modules/typescript/lib/_tsserver.js` requires the network modules, because
the language server opens sockets to talk to editors. We would never load that
file. It would still be in the resolved tree, and the invariant is about the tree
rather than about our own imports — that is the whole reason the check scans
`node_modules` instead of counting dependencies.

Three ways out, and only one is honest. Take it and narrow the socket check to
files we happen to load: that is widening a check to make code pass, which the
law forbids in someone else's project and cannot be excused in ours. Take it and
accept a socket-capable file in the tree: the first line of looper's own
constitution says no. Or answer the question without a type checker.

**The question is answerable without one.** "Does this call finish later" is
mostly a module-graph question rather than a type-inference question: resolve the
import to a file, parse it, and read whether the exported function is declared
`async`. That is the parser we already have, walking one edge further. It catches
a call to an async function declared in the same file, and to one imported from
anywhere in the project, following a rename at the import.

**And the packages are readable too, for the same price.** A TypeScript package
ships `.d.ts` declaration files, and `Promise<Result>` in a return type is
written there in plain text. A declaration file contains no runnable code at all
— the one `require(` in TypeScript's own 500,000-line declaration file is inside
a comment describing syntax — so reading one is not running anything, and it can
no more open a socket than a photograph of a telephone can make a call.

Better still, **nothing is installed to do it.** The project being judged already
has its own `node_modules` on disk. looper reads what is already there, which
means the tree looper ships stays exactly as small as it was.

**What is left uncaught, stated rather than discovered:** a promise reached
through a *value* rather than an imported name — `db.query(...)` where `db` came
from `new Pool()`. Following that needs the type of the receiver, which is where
real inference begins. Directly imported functions are caught, from your own
files and from installed packages alike, following a rename at the import.
A package that declares no types is passed over rather than guessed at.

### What this project's law does not reach. Settled 2026-08-18, from adopter issue #7

`OUTSIDE_THE_LAW` — `node_modules`, `dist`, `.git`, `target`, `vendor` — was a
fixed list of names and the only way out. A project that checked looper out
inside itself had looper's own source judged under the project's law, which is
somebody else's code failing a gate that then exits 2 forever. A gate that can
never pass is a gate people learn to skip, so this is a defect in the same class
as a false positive.

Two exclusions, and the reason both are derived rather than configured is that a
setting nobody knows to write is not an answer:

- **A directory holding its own `law.toml` is governed by itself.** That file is
  the declaration; nothing else has to be said anywhere.
- **A path named in `.gitmodules` belongs to whoever wrote it.** Free and exact,
  and it covers the checkouts that carry no `law.toml` at all.

**Each gate asks what the file is, 2026-08-18.** The walk and the edit gate route
a `.rs` file to the Rust half and everything else to the TypeScript checks. The
commit gate did not: it ran every staged file through the TypeScript checks, so a
valid Rust file failed to parse and was reported as `TS-ERROR:8`, a file that
cannot be read as TypeScript. A Rust project could not commit a Rust file at all.
Found by an adopter with 257 Rust files who had not yet staged one. The Rust half
judges a crate at a time and names its hits crate-relative, so the gate passes the
staged paths in for naming and then keeps only the hits that belong to them, which
is what the edit gate already does. `tests/pre-commit.test.ts` holds it.

When the Rust half cannot read the crate at all, the gate says so instead of
passing quietly. The engine judges a crate at a time, so one unparseable file
blinds it for every other file in that crate; the staged files are then not
clean, they are unjudged, and those are different. The gate passes (it must not
wedge a commit over somebody else's broken file) and names the file the reader
choked on and how many staged files went unjudged. Measured 2026-08-18: without
this, a staged file containing `v.unwrap()` passed in silence.

One property this does not have: the Rust half reads files from disk, not the
staged content, because the engine is a separate program that opens paths. A file
staged and then edited further is judged as it is on disk. The TypeScript half
reads the index. That difference is worth closing and is not closed here.

Both apply to the walk, the edit gate and the commit gate together. An exclusion
only the survey honours would leave every edit inside the excluded tree still
refused, which is the failure wearing a different hat.

**And both are said out loud. Corrected 2026-08-18, from adopter issue #28.** The
first version took any `law.toml` as the declaration, including an empty one, and
said nothing about it — so `touch law.toml` removed a directory from the law at
the sweep and at the gate, and `looper status` reported nothing left to fix. That
is broader than all three graded concessions — every rule, every file, one
directory, forever — and the quietest thing anybody can write, with no line in a
diff to argue with.

A file with nothing in it is now not a declaration: the nested `law.toml` has to
say something, or the directory is judged like any other. And `looper law` and
`looper status` name every directory that governs itself, why, and how many files
that covers, because self-governed and unjudged are indistinguishable from
outside unless the tool says which is which.

### The baseline, because an existing repo starts non-compliant

Point the slow pass at a real codebase written before looper existed and it will
find hundreds of violations. That is not a bug in the pass; it is the truth about
the code. But a report of four thousand violations is not strictness — it is a
rule set that gets switched off in the first hour, which is the failure this plan
already names as how strict systems die.

So the first slow pass on an adopted repo writes a **baseline**: `.looper/baseline.toml`,
committed, recording per file and per rule how many violations exist today. The
gate then refuses **new** violations and stays quiet about the recorded ones.

Four properties keep it a debt rather than an amnesty:

- **It covers untouched code only.** A violation on a line the edit touched is
  never baselined, whatever the file's history — the agent is already in that
  file, with the repair prompt in front of it, and that is the cheapest moment
  the fix will ever have. This is the stricter reading and also the sounder one:
  a purely count-based baseline is gameable, because removing one violation and
  adding another leaves the count unmoved. Touched lines are not.
- **It can only shrink.** A count that goes down is rewritten down automatically
  on the next commit. A count that goes up refuses the commit. There is no path
  where the baseline grows without someone editing the file on purpose. The two
  rules together mean the debt erodes wherever work happens rather than sitting
  as a permanent floor.
- **It is visible, and visible where they already are.** The total rides the
  per-turn injection channel as one line while it is non-zero, and prints on every
  commit that changes it. `looper status` shows it too, but a number that only
  appears in a command nobody runs is not surfaced — it is stored.
- **It is not a pardon, and it must never be filed as one.** A pardon under
  `[exempt]` says *this rule does not apply to this file*. The baseline says
  *this rule applies and we are not compliant yet*. Conflating them would turn a
  debt into a permission, silently, which is exactly the move the graded
  concessions exist to prevent.
- **New files get none of it.** A file created after adoption is judged in full
  from its first line. The baseline covers what was already there, never what is
  written next.

The effect is that adoption is honest in both directions: the existing code is
not pretended to be compliant, and the team is not asked to fix four hundred
files before the tool does anything for them.

**And the exit code has to be able to say that. Corrected 2026-08-18, from
adopter issue #47, finding 96.** `looper law` printed, correctly, that the
problems it listed were already here and blocked nothing, and then exited 2, which
is the same answer it gives when something is blocking. A caller could not tell
the two apart, so an adopter with 2,391 baselined problems could not put `looper
law` in the one command their project runs before every commit: it would be red
from the first day of the cleanup to the last, and a check that is always red is
not a check.

So the exit code answers exactly one question, *is anything blocking*: 0 when
every problem found is recorded in the baseline, 2 when one is not. The counts in
the message come from the same split, which also corrects them — they were
`min(baseline total, found)` against `found - that`, a subtraction that calls a
new problem old whenever an old one in the same file was fixed in the same pass.
`againstBaseline` in `src/law/baseline.ts` is the one definition.

## How looper runs once it is installed, which is not how it runs here

**Settled 2026-08-18, after the advertised install was found dead.** looper's own
source is TypeScript run by type stripping, with no build step. An install puts
that source under the adopter's `node_modules`, and Node refuses to strip types
from any file below that directory. On Node 22.23.2, in an empty project, the two
lines at the top of `README.md` produced this and nothing else:

```
Error [ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING]: Stripping types is
currently unsupported for files under node_modules, for
".../node_modules/looper/src/main.ts"
```

No hooks written, no `.looper/`, no gate — for every adopter, from the first
command in the README. A global install lands under a `node_modules` directory
too, so it fails identically. Three routes out, and two of them were rejected:

- **Compile to JavaScript at install time**, with a `prepare` script. That runs
  our code on the adopter's machine before anyone has read a line of it, which is
  the exact act `tests/invariants.test.ts` forbids a *dependency* from doing. A
  rule we enforce on others and suspend for ourselves is not a rule. It would
  also need a compiler dependency, argued against everywhere else in this file.
- **Commit the compiled JavaScript.** Two copies of every source file, kept equal
  by a freshness gate that has to be right forever. The generated half is what
  actually runs, so a stale one is a bug nobody can see by reading.
- **Strip the types ourselves, at startup.** `bin/looper.js` is plain JavaScript,
  so Node loads it under `node_modules` without objection. It registers a
  synchronous load hook — `module.registerHooks`, in Node since 22.15, and we
  already require 22.18 — that hands Node the stripped source for looper's own
  `.ts` files, then imports `src/main.ts`. No build, no dependency, no code at
  install time, and one copy of the source.

The third is what is built. **What it costs, measured 2026-08-18 on Node
22.23.2, 20 runs of each:** `--help` 90 ms → 92 ms, `status` 88 ms → 92 ms,
`law` over a one-file project 96 ms → 97 ms. On the heaviest path, which is the
one that runs on every edit, the shim costs about a millisecond.

`tests/installed.test.ts` is the gate: it copies the package into a real
`node_modules` directory and runs `init` there, which is the thing that failed.
It also asserts that Node still refuses `src/main.ts` on that same path — the day
that restriction lifts, that test fails and the shim can be deleted.

Working inside this repository is unaffected: the `dev` invocation still runs
`node ./src/main.ts` straight from the checkout, where type stripping works.

**Which machines this runs on, and which claim is not yet evidence.** Nothing
platform-specific ships: the only place `process.platform` appears in `src/` is
the seer's path lookup, which on a Mac finds no capture program and therefore
offers no `see` tool — the correct answer rather than a failure. The git hooks
init writes are `#!/bin/sh`, and `wslpath` and `powershell.exe` live only under
`seer/`, which is not in the package. So macOS should work — and *should* was the word that did not belong here, since
it had never been run there. **It has now: the suite passes on macOS in CI,
2026-08-18, alongside Linux on Node 22.18.0, 24 and 26.** What a Mac does not get
is the seer, which has no macOS pair.

**Which Node versions this was run on, 2026-08-18.** The suite passes on 22.23.2,
24.19.0 and 26.7.0 — 333 tests, three times. A packed install wires a project and
refuses a bad commit on 22.23.2 and on 26.7.0, so the newest Node is covered by
the same evidence as the oldest supported one. The matrix in
`.github/workflows/test.yml` names 22.18.0, 24.x and 26.x for the same reason:
looper is installed into somebody else's project, and their Node is not ours.

**A Node too old to run looper says so.** Below 22.18 there is nothing to strip
types with, and the failure was a stack trace about a missing export. The shim
now checks for the two things it needs and prints one sentence naming the version
it is on and the version it needs — verified on Node 22.10.0. It exits 1, which
the commit hook reads as "could not check" rather than a refusal, so an
unsupported Node fails open and says so, exactly as everything else here does.
The check is reachable only because `bin/looper.js` imports `node:module` whole
rather than by name: a named import of something an old Node lacks fails at load,
before any message of ours can print. `tests/installed.test.ts` holds that.

## Init: merge, never clobber

Four rules for every file we do not own, and the second one is the whole of
property 2 above.

- **Merge, never clobber.** Add our entries to the existing structure and leave
  every other key alone. Where a project already has a hooks directory, our hook
  files go into it rather than into a second one, because `core.hooksPath` is
  single-valued and two directories means one of them silently never runs.
- **Never report success for a file we did not wire.** Skipping a file that
  already exists and printing `skipped (already there)` reads as success and is
  not: on a repo with any pre-existing `.claude/settings.json`, the entire
  governance layer would be absent while the output looked clean. That failure is
  easy to ship and nearly invisible afterwards, which is why init is a merge from
  the first line of code rather than a later fix.
- **Atomic, and the prior version kept only where somebody is told.** Temp file
  alongside, fsync, rename. A half-written settings file breaks the whole
  session, so the copy exists to survive a crash between write and rename — and
  after the rename it has no job. **Corrected 2026-08-18, from adopter issue
  #27:** it used to be left behind by every write, committed by the next `git add
  -A`, and for `.looper/recall.md` that meant a note somebody deleted for being
  wrong survived in a committed file one filename away, which is the copy a
  future reader has no reason to distrust. The two merges init reports to the
  person keep theirs, and they are named in the output. Everything else deletes
  it.
- **Idempotent.** Twice is indistinguishable from once, which is what makes it
  safe to call from inside a session.

**`core.hooksPath` is never set by us, and never needed to be. Settled
2026-08-17, after two wrong turns.** The original decision was that writing hook
files is ours and turning them on is the user's. Then that was revised to "init
asks and sets it", on the reasoning that the only real barrier in the product sat
behind a command line a non-coder would never type. Both were reasoning about a
question that measurement dissolved: **git runs `.git/hooks/pre-commit` with no
configuration at all.** Verified — a hook written there fired and refused a
commit in a repository with `core.hooksPath` unset.

So init writes into the directory git already looks in: whatever `core.hooksPath`
names if the project set one, and `.git/hooks` otherwise. The gate is live the
moment init finishes, nobody types anything, and `core.hooksPath` is neither read
as a requirement nor written. The original decision stands and the revision was
solving a problem that did not exist.

What that costs, stated plainly: `.git/hooks` is not committed, so a teammate who
clones runs `looper init` once. The agent-side gate *is* committed, in
`.claude/settings.json`, so a fresh clone is still governed on the path that
matters most before anyone does anything.

**Every file we merge into, we merge into — including `.mcp.json`. Corrected
2026-08-18, from adopter issue #9.** The settings file was merged from the first
line of code and `.mcp.json` was not: init found an existing one, said "yours
already, left alone", and stopped. A project that already runs any MCP server has
one, so for that project looper's own tools silently never appeared, and nothing
said so. It is now the same merge as the settings file — looper's server added
under `mcpServers`, everything else untouched, the previous version kept beside
it. Where the file cannot be parsed it is left exactly as it is and init prints
the block to add, because a file we cannot read is not one we may rewrite.

**Merging it in once is not the same as keeping it right. Corrected 2026-08-18,
finding 94.** The merge above tested whether an entry named `looper` was present
and stopped there, so the entry looper itself had written with a path that does
not work was reported as `already wired, nothing to change` and stayed that way
through the pin bump that fixed it. `mergeSettings` had never had this problem: it
compares the command it wants against what the file holds and rewires when it is
missing.

So looper owns two fields of its own entry, `command` and `args`, and nothing
else: every other key in that entry, and every other server in the file, is the
project's. Absent, it is added. Equal, nothing is said. Different, those two
fields are replaced, the previous file is kept beside it, and init prints what the
entry was launching and what it launches now, because a repair nobody is told
about is the same silence as the stale entry.

### What the law defends, and which language answers it

**Added 2026-08-18, from issue #63.** Three languages, sixty-three rules, and
nothing said which of them defended the same thing. The only way to notice that
Python cannot see a `print()` was to count rule ids by hand, which is how it was
noticed.

The row is **the harm**, never the spelling. A rule ports only when the harm
exists in that language, and the harm can exist in a language the others do not
have — `REACT:1` and `REACT:2` have no Rust or Python form and never will. So this
is not Rust's list copied down twice. Half the work is asking what each language
lets an agent do that the others do not.

Every rule the engine loads appears exactly once below, and
`tests/plan-is-true.test.ts` refuses the suite if one is added without a row.

| what goes wrong | TypeScript | Rust | Python | C# | CSS |
|---|---|---|---|---|---|
| a failure vanishes, and nobody hears it | `TS-ERROR:1` `TS-ERROR:4` `TS-ERROR:6` `TS-ERROR:7` `TS-ERROR:8` `TS-ERROR:10` | `RUST-ERROR:1` `RUST-ERROR:2` `RUST-ERROR:4` `RUST-ERROR:6` `RUST-ERROR:8` `RUST-ERROR:9` | `PY-ERROR:1` `PY-TRUTH:2` | `CS-ERROR:1` `CS-ERROR:4` | a stylesheet cannot fail |
| a failure is answered with a made-up value | `TS-ERROR:3` `TS-TYPE:5` | `RUST-ERROR:3` `RUST-TYPE:5` | `PY-ERROR:2` | `CS-ERROR:3` | a stylesheet cannot fail |
| the failure survives but names nothing | `TS-TYPE:2` | `RUST-TYPE:1` `RUST-TYPE:2` `RUST-TYPE:3` | `PY-ERROR:3` | `CS-ERROR:2` | a stylesheet cannot fail |
| the checker is told to trust you | `TS-TYPE:3` `TS-TYPE:4` `TS-DEAD:1` `TS-TYPE:6` | `RUST-TYPE:4` `RUST-DEAD:1` | `PY-TYPE:1` | **refused on measurement**, below | CSS has no checker to tell |
| "what happens when nobody said" is answered in more than one place | `TS-TRUTH:1` `TS-TRUTH:2` `TS-TRUTH:3` | `RUST-TRUTH:1` `RUST-TRUTH:2` | `PY-TRUTH:1` `PY-TRUTH:3` | none built | `CSS-TRUTH:1` `CSS-TRUTH:3` |
| output is taken from whoever ran the program | `TS-LOG:1` | `RUST-LOG:1` `RUST-LOG:2` | `PY-LOG:1` | `CS-LOG:1` | a stylesheet has no output |
| a log line cannot be asked a question, because the value is inside the sentence | `TS-LOG:3` | `RUST-LOG:3` | `PY-LOG:3` | none built | a stylesheet writes no logs |
| the shape of the code hides what it does | `TS-DECOMPOSITION:1` `TS-LAYER:2` `TS-LAYER:3` `TS-DEAD:4` | `RUST-DECOMPOSITION:1` `RUST-DECOMPOSITION:2` `RUST-DECOMPOSITION:3` `RUST-LAYER:1` `RUST-LAYER:2` `RUST-LAYER:3` `RUST-DEAD:4` | `PY-LAYER:1`, and **open on purpose** — 500 does not port, measured below | none built | `CSS-LAYER:1` `CSS-TRUTH:2` |
| unfinished work reads as finished | `TS-DEAD:2` `TS-DEAD:3` | `RUST-DEAD:2` `RUST-DEAD:3` | **tried and not shippable**, measured 2026-08-18 — the argument is below | `CS-TRUTH:1` `CS-DEAD:2` | open |
| the language's own guarantees are stepped around | none built | `RUST-ERROR:5` `RUST-ERROR:7` `RUST-TESTS:1` | none built | none built | `CSS-TYPE:1` |
| a number is guessed where a fact was available | `TS-ERROR:9` | none built | `PY-ERROR:4` | none built | — |
| the same file exists twice under two names | `COPY:1`, which reads the directory rather than a file, so it answers for all five | | | | |
| something from outside is used as an instruction | `DATA:1` `DATA:2` `NODE:1` `NEXT:1` `TS-SECURITY:1` | none built | `PY-SECURITY:1` `PY-SECURITY:2` `PY-SECURITY:3` | `CS-SECURITY:1` | open |
| a framework's own contract is broken in silence | `REACT:1` `REACT:2` `TAURI:1` | — | — | — | — |
| the project gains a language nobody chose | `STACK:1`, which reads the project rather than a file, so it answers for all four | | | | |

**A cell that says `open` is a gap, not a decision.** A cell that says a harm does
not exist in that language has to carry the argument, not the assertion, and none
of them does yet — which is why the four blanks above say `open` instead.

**The CSS column, added 2026-08-29.** Its five "cannot" cells are the one place a
cell carries an argument rather than an assertion, and the argument is the same
each time: CSS has no control flow, no return, no output stream and no type
checker, so five of the twelve harms have nothing in the language to happen to.
The two cells that say `open` are genuine gaps — a half-written stylesheet and a
value pasted in from outside both exist, and neither has a rule yet.

Counted from the table on 2026-08-19, when C# joined: it answers four of the
twelve rows with four rules. That is the smallest column here on purpose — the
reader landed with the rules that had counted evidence behind them in a real
codebase, and the rest wait for the same.

**The weight is in the wrong place and this table is what makes that visible.**
The section below already argues that Python is the language where the law is
worth most, because the language itself checks nothing.

Counted from the table on 2026-08-18: TypeScript answers eleven of the twelve
rows, Rust nine, Python eight — with twenty-six, twenty-nine and eight rules.
**Corrected the same day.** The first version of this paragraph said Python
answered eight rows and Rust eight, which was wrong on both counts and was written
without counting. The numbers above were read off the rows.

**How a cell gets filled**, in the order the seven Python rules already used:
cases first from the ban text, then the reader, then run over real code in that
language that nobody here wrote, every hit judged by hand and the count written
down. That order is not a formality — a test written after the code can only
agree with the code.

**A comment names nothing, so it is not part of the vocabulary. Corrected
2026-08-18, from adopter issue #60, finding 101.** The sentence somebody types
under `--tried` is checked against every word in every judged file, and refused if
a word looks like it came from their code. The vocabulary was built from the whole
file text, comments included, so an ordinary English word written in a comment
became a word nobody could use while arguing with a rule. The word that broke it
was `TRUTH`, from `TS-TRUTH:1` — the one word that sentence cannot avoid.

Two things. The reported rule's own id is never a leak, because the report already
prints it in its `rule:` field. And the vocabulary is built from the file with its
comments removed, per language: `#` for Python, `//` and `/* */` elsewhere, with
quotes tracked so a marker inside a string is not a comment.

**String literals stay in.** A secret in a string is exactly what this guard is
for, so a Python docstring is a string rather than a comment and prose inside one
still counts. That is the deliberate limit, and it is the same one the adopter's
own suggestion of "identifiers and string literals" would have drawn.

**Every judging path asks what the file is first. Corrected 2026-08-18, issue
#56, finding 102.** The commit gate was the one path that judged without a role,
so a rule scoped to the backend half of a project applied to an interface file
there and nowhere else. Which rules run is part of asking what a file is before
asking what is wrong with it, and a gate that answers it differently from the
survey is two laws wearing one name. The shape is read once per commit rather than
once per file.

### The line cap, measured at last

**2026-08-19.** `max_loc` has been 500 since the beginning, in `src/config.ts` and
in every `law.toml`, and no line of this document ever said why. The doctrine here
is explicit that a number inherited is a number unmeasured, so it was measured.

**The cap this measurement argues for is `max_loc = 500`**, unchanged — not
because 500 is right, but because changing it is a decision with a cost that
belongs to whoever owns the repo, and this section exists so that decision can be
made from numbers instead of habit.

**This repo, 150 judged files** — every tracked `.ts`, `.tsx`, `.js`, `.py` and
`.rs` outside `vendor/`:

| | lines |
|---|---|
| median | 122 |
| p90 | 288 |
| p95 | 414 |
| longest | 500 — `src/main.ts`, exactly on the cap |
| over 500 | **0** |
| over 400 | 9 |
| over 300 | 15 |
| over 200 | 27 |

**Three corpora nobody here wrote**, the same measure:

| corpus | files | median | p95 | over 500 |
|---|---|---|---|---|
| npm's own JavaScript, Node 24.19.0 | 1,122 | 65 | 551 | 5% |
| Python's standard library | 167 | 468 | 2,699 | **47%** |
| `/usr/lib/python3/dist-packages` | 3,217 | 139 | 1,279 | 18% |

**Two things follow, and neither is comfortable.**

**The cap is set above where this repo actually lives.** Median 122 and p95 414
say the habit is well under it. The one file at the cap, `src/main.ts`, holds
twenty-four top-level functions — `init`, `law`, `report`, `adopt`, `serve`,
`hook`, `inject`, `status` and the rest. That is a dispatcher and six commands in
one file, which is precisely the thing `TS-DECOMPOSITION:1` exists to name, and
at 500 the rule permits it. A cap that only ever catches the worst file in the
repo, after it has already become seven things, is a ratchet rather than a rule.

Lowering it is a decision with a cost — nine files at 400, fifteen at 300, every
one of them baselined rather than blocking — and that cost belongs to whoever owns
the repo, not to this document. What this document can say is that 500 was never
argued and the numbers above are what an argument would have to start from.

**And 500 does not port to Python.** The standard library's median file is 468
lines and 47% of it is over the cap, against 5% for JavaScript. That is not
Python being worse; it is Python putting a module's whole subject in one file
where TypeScript splits it. A cap copied across would fire on half of a language's
own library on the first run, which is how a tool gets switched off in week one.

So the Python cell in the table above stays open **on purpose**, with this
measurement against it rather than the word "open". A Python cap needs a number
measured on Python, and nobody has measured one.

**A Python rule for the unfinished stub was built, measured, and thrown away.
2026-08-18, from the table above.** Rust bans `todo!` and `unimplemented!`;
TypeScript bans a named function that does nothing, and
`throw new Error('not implemented')` with it. Python's spelling looked obvious: a
body that is only `pass`, only `...`, only a docstring, or only
`raise NotImplementedError`, with `@abstractmethod`, `@overload` and `Protocol`
methods exempt, because those declare a shape on purpose.

Twelve cases passed. Then 167 files of Python's own standard library gave **98
hits, and reading them says the rule is blunt rather than strict.**

- **47 are docstring-only bodies, and they are documented no-op hooks**:
  `bdb.user_call` and `user_line`, `cmd.preloop` and `postloop`, `tzinfo.dst`, and
  `cgi.nolog` whose own name says it does nothing. The docstring says *when the
  method is called*, not what it does. Somebody wrote that prose deliberately.
- **25 are `pass`**, and they are hooks too: `contextlib.__enter__`,
  `enum.__init__`, `_markupbase.unknown_decl`.
- **11 are `raise NotImplementedError`, which in Python means two different
  things.** `argparse.Action.__call__` and `optparse.HelpFormatter.format_usage`
  mean *a subclass implements this*. `ssl.SSLSocket.recvmsg` and
  `pathlib.PurePath.__new__` mean *this operation is refused here*, which is a
  finished decision and the opposite of unfinished.

Narrowing to the shape with no override story at all — a module-level function,
undecorated, whose whole body is `pass` or `...` — still gives eleven, and at
least nine are deliberate: `shutil._nop` by name, three `onerror` callbacks, the
`_copyxattr` platform fallback, and `types._f` and `_c`, which exist only so that
`type(_f)` yields a function type.

**Why it cannot be sharpened.** The difference between a deliberate no-op and an
abandoned stub is intent, and Python carries no marker for it. That is what
`@abstractmethod` is for, and code using it was already exempt. A rule that
refuses `shutil._nop` is refusing a decision, and a blunt rule is not a strict
one.

The cell stays open with this measurement against it, so the next attempt begins
from evidence instead of repeating this one. What would change the answer is a
signal for intent that Python actually carries — not a cleverer reading of the
same shapes.

**`main.ts` is a dispatcher and nothing else. Split 2026-08-19.** It had reached
exactly 500 lines, sitting on the cap, holding twenty-four top-level functions —
the argument reader, every command, and the helpers each one needed. It was the
one file the line cap had genuinely caught, and the file this session grepped
four separate times because nothing about its name predicted where anything was.

Each command is its own file under `src/commands/`, named after the command.
`main.ts` keeps the argument reading and the dispatch, and is thirty-seven lines.

**The split broke `TS-LOG:1` in thirty-six places, and that was correct.**
`main.ts` was the declared entry file, so its printing was legal; the same code in
a command file is a library deciding for every caller. The entry list was not
widened to make it pass — the rule's own advice says to hand it back and let the
entry point decide what to print. So a command takes an `Out` with `say` and
`warn`, `main.ts` builds that from `console`, and it is the only file that names
`console` at all. `serve` streams a protocol and takes the same `Out`, so nothing
needed an exception.

One more fell out of it: `valueAfter` was private and returned `string |
undefined`, which `TS-TYPE:2` refuses once it is exported. It returns a named
`Given` now — `{ kind: "given", value }` or `{ kind: "none" }` — which is the
spelling that rule asks for.

**looper owns its own hooks and repairs them; everything else in that file is the
project's. Corrected 2026-08-19, finding 105.** `mergeSettings` added a hook
beside whatever was there and never over it. That is right for a hook somebody
else wrote and wrong for a stale one of looper's own, so moving the entry left
every already-wired project running looper twice per event — or, if init was never
re-run, still wired to the entry that cannot announce its own failure.

It now recognises a hook it could have written, by the tail it writes and the four
entry spellings it can produce, and replaces that one. It names each replacement in
the report, because a repair nobody is told about is the same silence as the stale
entry. This is the rule finding 94 taught `mergeMcp`, arriving in the second place
it was needed.

**There is one entry, and it cannot fail. Added 2026-08-19, issue #74, finding
104.** looper fails open when a capability cannot reach a verdict, and that was
already true. It did not hold when looper itself could not be **loaded**: the hook
process died on its own import graph, the human saw a hook error in the terminal,
and the agent saw nothing at all and kept writing.

An announcement about a crash has to live somewhere the crash cannot reach, which
means somewhere that imports almost nothing. `bin/looper.js` is that place — two
Node built-ins, then everything else. It loads the rest inside a `try`, and on
failure writes a real hook answer through `additionalContext`, the channel the
agent reads, saying that nothing is being checked and that a verdict is absent
rather than clean. It still exits 0.

So every invocation kind now points at that one file. `dev` pointed at
`src/main.ts` directly, which is how this repo ran and why the gap was found here
rather than reported by somebody depending on it.

**`config.ts` holds what looper runs by, and `stubs.ts` holds what it writes
out. Split 2026-08-18, issue #67.** The file had reached 497 lines against its own
500 cap, so the decisions capability could not put its path there and put it in
its own module instead. A size limit had started deciding where facts live, and
the reason was invisible from either file.

The line is nameable in one sentence: **the prose looper writes into a project is
not a setting.** `CONSTITUTION_STUB`, `MAP_STUB`, `DOCTRINE_README_STUB`,
`ADOPTED_HEADER`, `RECALL_HEADER`, `SECRETS_ALLOW_STUB`, `BASELINE_HEADER` and
`DECISIONS_HEADER` are documents a person reads; they moved. `config.ts` went to
402 lines with the cap untouched at 500.

**The sanctum is still one file.** Nothing that turns a missing value into a
default moved — `stubs.ts` is template literals and nothing else — so the sentence
about `src/config.ts` stays true rather than being quietly widened to two.

`DECISIONS_PATH`, `DECISIONS_TOOL` and `DECISIONS_PRIORITY` came back to
`config.ts` beside every other project-visible path, and the re-export that would
have given them two import paths went out with them: one home means one place to
import from, or it is two homes wearing one name.
**A file is read as bytes; only a list is read as lines. Corrected 2026-08-18,
from adopter issue #44, finding 100.** One helper in `src/git.ts` ran git and
returned `output.split("\n").filter((line) => line.length > 0)`. Dropping empty
lines is right for everything that helper was written for — a config value, a
list of paths, the lines of a diff. `stagedText` used it to read a **file**, so
the commit gate judged every staged file with its blank lines deleted, and every
line below a blank was numbered wrong by the count of blanks above it.

Reading content and reading a list are two different jobs and now have two
different helpers. Nothing else moved: a blank added line reaches a diff as `+`,
which is one character long and survives the filter, so the additions reader that
counts lines for the secrets scan was never affected.

**And the escape hatch has to open widest where the verdict is worst. Corrected
2026-08-18, from finding 99.** `shapeAt` refused unless an enclosing node began
on exactly the line given, so `looper report` — the one route the law offers when
a rule is wrong everywhere — closed on two ordinary cases: a continuation line of
a multi-line expression, which begins nothing, and a line the tool named wrongly,
which is the whole of adopter issue #44. The route was open while looper was
right about where the problem was and shut when it was wrong about it.

So a shape lookup has three answers rather than two. Found, when something begins
there. **Around**, when nothing begins there but a statement contains it: the
report is written anyway, against that statement, and says which line it actually
begins on, because the gap between the named line and the real one is the evidence.
Not-found only when no statement contains the line at all.

**All three readers answer it, finished 2026-08-18 from issue #58.** Rust needed a
different fix and got its own change rather than being forced into the same one:
`skeleton.rs` collects tokens that *start* on the line, so its refusal never had
the same cause. It now asks `syn` which item contains the line, re-reads that
item's first line, and carries `startsAt` out through the binary's JSON, which the
TypeScript side already read. Rust's line that begins nothing is also a different
shape — a method chain continues with `.filter(...)`, which does start tokens — so
it is a blank line inside an item.

**JavaScript is a language this project judges, and was not one. Corrected
2026-08-18, from adopter issue #46, finding 98.** `JUDGED_EXTENSIONS` listed
`.ts`, `.tsx`, `.mts`, `.cts`, `.rs` and `.py`. A `.mjs` was walked past by the
survey, so no rule read it — and because `STACK:1` is handed the same list, the
one rule whose whole job is noticing a language arrive never saw it either. Both
halves of that report have one cause and one fix: `.js`, `.jsx`, `.mjs` and
`.cjs` are judged.

Nothing else had to change. `lawFor` already routes anything that is not Rust or
Python to the TypeScript reader, and `languageOf` already knew all four
extensions mean JavaScript. The list was the only place that disagreed.

`.mjs` is what somebody reaches for precisely when they need something that runs
before or outside the TypeScript build — which is often the part that decides how
everything else runs. The adopter's example configured the build of an entire
Next.js console.

**The rule reached one of the two places a failure is caught. Corrected
2026-08-18, from adopter issue #45, finding 97.** `TS-ERROR:4` walked for
`CatchClause` and nothing else, so `.catch(() => {})` — named twice in the `law`
rule set that is injected on every turn in a TypeScript project — was caught by
nothing. The adopter counted 19 of them in one console, 12 in a single file,
none reported, in a file that reports 630 problems from other rules.

A `.catch(handler)` body is the same thing as a catch clause: a place that
receives the failure. It faces the same two questions the clause already faced —
does the body observe the failure through a blessed logger, and does the failure
escape the body. Two boundaries keep it decidable. A handler that is a bare name,
`.catch(handleIt)`, is not judged, because its body is not there to read. And a
handler whose only act is making up a value belongs to `TS-ERROR:3`, which
already had it: measured, that rule fires on `.catch(() => 0)`, `null`, `false`,
`[]` and `({})` in both the concise and block spellings, so without that boundary
one problem was reported twice.

**Init checks that the command it just wrote can actually be found. Added
2026-08-18, from adopter issue #8.** `reachedFrom` knew two shapes, installed and
`node_modules/.bin`, so a looper checked out inside the project fell through to
`installed` and every hook was written as a bare `looper` that is not on PATH.
The hooks were there, they read correctly in the settings file, and nothing ran.
Two answers, and both are needed. Init now recognises a checkout — any directory
under the root, or under `vendor/`, holding `bin/looper.js` and a `package.json`
naming looper — and wires the hooks to that path, because nothing load-bearing
may sit behind a command somebody has to know to type. And whatever shape it
picks, it then checks: the file exists, or the command is in a directory on PATH.
When it is not, init says so in the report rather than reporting success.

**Three shapes was still one short: the project that is looper. Corrected
2026-08-18, finding 95.** The shapes above are all ways of reaching looper from
somewhere else. Running init in looper's own repo matched none of them and fell
to `installed`, so the entry it wrote launched a bare `looper` that is not on
PATH there, and its own MCP server never started. The fourth shape, `dev`, whose
launch is the root-relative `./src/main.ts`, existed and could only be reached by
typing `--dev`.

So `reachedFrom` asks first whether the root is itself a looper checkout, by the
same test it already applies to subfolders, and answers `dev` when it is. No
adopting project can reach this branch, because an adopting project's root is not
a looper checkout. The flag stays as an override and stops being the only door.

**And the check has to name the path that actually gets written. Corrected
2026-08-18, finding 93.** The check above proved `vendor/looper/bin/looper.js` was
there, and `.mcp.json` was then written with
`$CLAUDE_PROJECT_DIR/vendor/looper/bin/looper.js`, which is a different filename.
For every adopter with looper checked out inside the project the server never
started, so `doctrine`, `recall` and `see` were absent from the session while the
hooks ran normally and nothing said a word.

There are two contexts here and they are not interchangeable. A hook command is a
shell line the agent runs with `CLAUDE_PROJECT_DIR` in the environment, so it
carries the variable and quotes it. An `.mcp.json` argument is argv: no shell, no
expansion, and the agent's own `${VAR}` form reads an environment that this
variable is not in, because the agent sets it for hooks and not for the config it
expands. So the git hook and the MCP entry are both written root-relative through
one helper, `fromRoot`, which returns the same string `entryReach` checked.

What that costs, kept rather than dropped: a relative path resolves against the
directory the agent was started in, so a session started in a subdirectory of the
project gets no server. An absolute path would close that and cannot be used,
because `.mcp.json` is committed and a machine-specific path in it breaks every
other clone.

**A hook the project already wrote is never overwritten.** A shell script cannot
be merged the way a settings file can, so init leaves it exactly as it is,
reports the gate as **not wired**, and prints the one line to add. Reporting a
gate as installed when it is not is the failure this whole section exists to
prevent.

**`--no-verify` is commit intent wherever it appears. Closed 2026-08-18, from
adopter issue #30.** The `PreToolUse` gate is the only check left when somebody
writes `--no-verify`, because git skips its own hook by design — and a wrapper
walked past it: `bash -c "git commit --no-verify …"`, `env git commit …` and a
subshell all passed, because the parser requires the first word of a segment to
be `git`.

The fix is deliberately not a better shell parser; parsing shell properly is
unwinnable, and the here-document false positive earlier the same week is what
over-reaching looks like. Instead the one flag that disables the other gate
counts as a commit wherever it appears in the command, and a bare `-n` counts
when the same segment mentions git. `echo -n`, `grep -n` and `sort -n` are
untouched. Wrappers that do not carry the flag matter less, because for those the
git hook still runs.

**Only a real verdict refuses.** The hook exits non-zero only when looper reached
a verdict of "block". If looper is missing, broken, or unreachable, the commit
goes through with a line saying it was not checked. The first version got this
wrong in the most instructive way: it used the agent hook's entry path, which
resolves through an environment variable Claude Code sets and a shell does not,
so every commit was refused because node could not find a file. A governance
accessory refusing on its own failure is the worst outcome available to it, and
it is what "fail open" means in practice.

**And init must not gitignore the agent config directory:** hooks are executable
code running with the agent's privileges, so they belong in the diff where a human
reviews them.

**What init never writes:** the project's long-form instructions file. The canon
already carries the generic law, so a fresh project is governed on day one, and
the project-specific half is the author's to write. Generating it would be
inventing doctrine nobody agreed to.

## Adoption: rules the project earns, ratified by evidence

On an existing project the doctrine tree starts empty, and demanding it upfront
is how this tool would get abandoned in week one. So the tree fills in from use.

`looper adopt` reads the repo and finds candidates: the layers visible in the
import graph, a symbol the project has clearly banned, a convention it already
follows everywhere but once.

**Reversed 2026-08-17: a human does not ratify these, and the earlier design was
wrong on its own terms.** It said proposals land in a pending file and a human
moves a line into a branch to make it doctrine, on the reasoning that an agent
able to ratify its own doctrine has built an elaborate way of talking to itself.
That reasoning is sound about *judgment* and it was applied to the wrong reader.
The person here cannot read code. They will either wave every proposal through,
which makes the ratification theatre, or never open the file, which leaves the
tree empty forever — and the second is what actually happens. A gate only a
qualified reader can operate is not a gate on a project that has none.

It also contradicts a decision already taken. The canon names three things that
earn a question: what the thing should do, what costs money, what cannot be
undone. Adopting a rule is none of them.

**Evidence ratifies instead, and the bar is mechanical rather than argued.** A
candidate becomes a rule only when all four hold:

1. **It fires on real code in this project.** Not a hypothetical — a line that
   exists. This is "rules grow only on evidence", applied where the evidence has
   to be local.
2. **Every instance it fires on gets fixed.** The agent rewrites each one. A rule
   whose instances cannot be rewritten is not strict, it is broken, and this is
   the test that catches it without anyone having to judge.
3. **The project still passes afterwards.** Its tests, its build, whatever it
   already has. A fix that breaks the project disproves the rule.
4. **The evidence is recorded with the rule** — the file and line that justified
   it, and the rewrite that discharged it. A rule with no recorded instance can
   be deleted by anyone, because nothing shows it was ever needed.

Together these prove what a human reviewer would have been asked to judge: that
the rule is real here, that it can be obeyed, and that obeying it costs nothing
the project cannot pay. None of that needs an opinion.

**An adopted rule is an instance of a shape looper already knows, never new
code.** A banned symbol, a banned import, a layer map entry, a required
construct at a boundary. The engine ships the shapes; the project supplies the
particulars. This is the same split as `law.toml` holding concessions rather than
rules, for the same reason: the moment a project can author executable rules, the
optimizer edits the rules instead of the code.

**And an adopted rule only ever blocks new code.** Adoption baselines everything
currently violating it, so the rule stops the next instance and never strands
anyone in work they did not ask for. That machinery already exists and adoption
gets it for free — which also means a wrongly adopted rule costs a deletion
rather than a crisis.

## The seer: an agent that can look, and cannot look at anything it was not shown

Proposed by an adopting agent as issue #10, and taken on 2026-08-18. The canon
says done means the thing was demonstrated actually working, and for anything
with an interface that sentence is prose today — an agent with no eyes reports
what it believes. The failures it named are the ordinary ones: a screen called
working from a rig that could not have rendered it, an error overlay left up
because a compiler was happy.

**The whole design is one sentence: looper never decides whether a capture may
happen.** It cannot be trusted to, and not because of any defect in it — whoever
writes the prompt chooses what the agent asks for, so a decision made inside
looper is a decision made by whoever last talked to the agent. The decision lives
in a consent process the person at the machine controls, and the capture program
asks that process before every capture. looper drives the program and reads its
answer, exactly the way it drives the Rust engine.

**The seam, exit codes as protocol.** `looper-seer` is run with an argument list,
never a shell line, and answers on stdout with one JSON object:

| exit | means |
|---|---|
| 0 | `{"images":[{"label","media","base64","state"}],"missing":[…]}` — `missing` is named, never silently dropped, and `state` is `rendering`, `minimised` or `blank` |
| 3 | there is no window by that name |
| 5 | disarmed: the person has not armed this target |
| anything else | unavailable, and looper says so rather than guessing |

**The ceiling on one answer, 64 MB.** The picture crosses that seam as base64
inside the JSON, and Node's default buffer for a child process is 1 MB: past it
the child is killed and the answer is discarded, which reads as the seer being
broken rather than the pipe being too narrow. Measured 2026-08-18 on WSL, one
1433x1254 window: 3,060,240 bytes of JSON carrying a 2,295,098 byte PNG, which is
an ordinary window on an ordinary display and three times over the default. A 4K
window is roughly four times that again, so the ceiling is 64 MB — past any real
screen, still short of a runaway. `tests/seer.test.ts` holds it with an answer the
default would have thrown away.

**A branch name is a file stem, not a path, 2026-08-18.** The `doctrine` tool
takes a name from the agent and the project half joined it straight onto the
doctrine directory, so `../../notes` read a file beside the project and
`../../../elsewhere` read one outside it entirely. Any `.md` file the process
could open was reachable by asking for it. The canon half was never exposed: it
checks the name against a fixed list first. Names are now file stems
(`^[A-Za-z0-9][A-Za-z0-9._-]*$`, no `..`), which is what `listBranches` can
produce anyway, and `tests/mcp.test.ts` holds it. The seer had the property
already, for the same reason it was designed with: what the agent supplies is one
title, and nothing it names selects a path.

**Off unless somebody built it.** No capture program ships in the package —
`files` in `package.json` carries none, and a test refuses the suite if one
appears. With no program on disk the `see` tool is not offered at all, and every
call refuses in words. Installing looper therefore cannot gain the ability to
look at anything, which is the property that had to be mechanical rather than
promised.

**What no prompt can reach, and why each is a control rather than a claim.**

- **Nothing off this machine.** looper cannot open a socket and a test refuses any
  import that could, so there is no remote caller to defend against — the
  invariant the whole product already rests on is what makes this one hold.
- **Nothing looper can arm.** There is no arm tool, no arm command, and no
  consent state that looper reads or writes. Exit code 5 is a fact produced by
  another process, and a refusal cannot be argued with by asking again.
- **Nothing the agent names selects the program.** The path is fixed in code,
  inside looper's own tree. What the agent supplies is one window name, crossing
  as one argument with a length cap, and no shell ever sees it.
- **Nothing invented.** A refusal never becomes an image. There is no default
  target, no "closest match", and a capture that did not happen is reported as one
  that did not happen.

**Run against a real screen, 2026-08-18.** A capture program and a consent
process were written outside the tree and driven through the real MCP server, on
this machine, against Windows windows reachable from WSL. Three runs, in order:
with no consent process running, the answer was words and no picture; with one
running that had a different window armed, the same; with the asked-for window
armed, a 1038×808 PNG came back through the tool. The refusal in the middle case
came out of the consent process, not out of looper — its own log recorded the
question and its `no`. Both halves were deleted afterwards and the suite
re-run: the tool is gone from the tool list again, because there is no program on
disk.

**The trap that run exposed, and the first thing the platform stage owes.** The
picture was a real capture of that window and it showed the application's splash
art rather than its content, because `PrintWindow` on a window that is minimised
or composited on the GPU returns what the window last drew. A capture that is
honest and useless is worse than a refusal: an agent will reason from it. So the
capture program has to report the window's state — minimised, occluded, not
rendering — beside the image, and looper has to say it, or the seer will produce
exactly the confident wrong answers it exists to prevent.

**The two programs, built 2026-08-18 for WSL-with-Windows.** `seer/windows/consent.ps1`
is the person's: an always-on-top window listing what is open, a tick box per
window, and a local pipe that answers `yes` only for what is ticked. Closing it
disarms everything. `seer/windows/capture.ps1` asks that pipe before it captures
anything and stops at exit code 5 when the answer is not yes, so the program that
can see is never the program that decides. `seer/linux/looper-seer` is the shim
looper runs from inside WSL, and it passes the title through and nothing else.

**They are source, and installing them is a deliberate act on the machine whose
screen it is.** The package does not ship `seer/`, `vendor/seer/` is ignored so an
installed one cannot be committed by accident, and a test reads `git ls-files` to
prove nothing under it is tracked. This is the one place where a command somebody
has to type is the right answer: the canon's rule against that is about
governance, which must not be optional, and this is an eye, which must be.

**Run against a real desktop, 2026-08-18, and what it cost to get right.** The
first consent window rebuilt its list every two seconds, which wiped a tick the
moment it was made, and docked its panels in an order that hid the first row —
unusable, and found by the person trying to use it rather than by any test. The
second one keeps the armed set as the truth and rebuilds the list only when the
open windows actually change. With one window ticked and one request made through
the real MCP server, the answer came back with the picture and the words *was
minimised, so this is what it last drew rather than what it shows now* — the trap
from the earlier run, now caught and said out loud. One defect on the way: the
window's title came back mangled through the shim until both ends were pinned to
UTF-8.

**Every window on the desktop, asked for at once, 2026-08-18.** Ten open windows,
one request each through the real MCP server, three of them ticked in the consent
window: three pictures back — 1550x830 `rendering`, 620x460 `rendering`, and
159x27 `minimised` with the warning attached — and seven refusals. The seven were
decided by the consent process, not by looper, which is the only division of
labour that survives an agent being told what to ask for.

**What is still not built:** a Linux desktop pair and a macOS pair. Until a
platform has both halves it has no seer, and a capture program without a consent
window is precisely what this design exists to refuse.

## The return path: every adopter's agent is a rule tester

The rule set grows only on evidence, and the plan has never said where evidence
comes from. This is where: **the agents using looper are the only witnesses to
its defects, and they are perfect witnesses.**

A human adopter never reports a misfiring rule. They get stuck, assume they are
the problem, and eventually stop using the tool — the failure is silent and the
first we hear of it is that nobody runs it. The agent is the opposite. It hits
the rule, tries the legal spellings the repair prompt handed it, fails, and knows
precisely what happened: which rule, which construct, which spellings it tried,
and why each was refused. That is a better defect report than any human would
write, and it costs nothing to collect.

It also closes a sentence this plan already contains and could not honour: *a
violation the agent cannot discharge is our defect, recorded as one.* Recorded
where? Here.

**The same argument reaches what is absent, not only what misfires.** A rule that
fires wrongly is one kind of defect. A capability that is not there is the other,
and it is the larger one, because nothing announces it. A human adopter never
files "a search over this would have saved me an hour"; they spend the hour, and
the hour leaves no trace. The agent's version of that hour does leave one, in the
shape the stall metric already reads: one command shape run nine times in forty
minutes, one file read eleven times with different filters, a test rerun three
times before it produced data at all. Those are not complaints. Each one names a
question the toolbox could not answer in a single call, which is a far better
capability request than a feature wish, because it arrives with the evidence
attached and the cost already counted.

So a stall cluster that crosses the threshold becomes a proposal, on the same
route a rule proposal already takes: written down where the adopter can read it
before anything leaves, and sent only on purpose. What travels is the shape and
the count, never the project's own material: the shape is "one process-listing
command, nine times, forty minutes, no write between them" and never the command
line, the paths or what was being built. A capability the tool lacks is
discoverable from the shape alone, and the shape is the part that generalises.

Two consequences worth stating. It means the toolbox grows from where adopters
actually stalled rather than from where anyone guessed they would, which is the
same evidence discipline the rule set already runs on. And it means an adopter
who fixes their own stall locally has produced something worth sending, so the
project half of the loop is not a private workaround but a draft of the next
capability.

**An agent that cannot commit will ask its human to type the command instead.
Observed 2026-08-18.** An agent working in a project that had adopted looper hit
the gate and passed the refused command to the person supervising it, presented
as the one step left to run. The route buys nothing — the git hooks run in that
person's shell as readily as anywhere, so the same rules judge the same commit —
but the refusal never said so, and a route nobody closes is a route somebody
takes. It says so now, and names `looper report` in the same breath: closing a
route without naming the open one leaves switching the rule off as the only idea
left. `tests/commit-gate.test.ts` holds both halves.

What this cannot reach is the case where the person's shell has no hooks at all,
because looper was never wired into that clone. There the handover really does
get past the gate, and the answer is not a better sentence — it is that
`.claude/settings.json` is committed, so the agent-side gate arrives with the
clone even when `.git/hooks` does not.

**The return path ran on its own, 2026-08-18.** An agent adopting looper filed
twelve issues against this repository in one sitting, unasked: each naming the
file and the line, most proposing the fix, one having measured it. Nothing in
looper collected them and nothing was built to — the agent hit the rules, could
not discharge them, and reported. That is this section working before the
machinery for it exists, which is the strongest evidence it is the right shape.

The first of them is finding 42, and it is the one that explains the handover
above: the commit gate was refusing clean commits on a value the agent could not
remove, because the value was not the agent's. A refusal with no compliant path
is what sends an agent looking for a way round, and the way round it found was a
person.

**What a fork is told, and what it is asked to prove. Built 2026-08-18.** The
doctrine tree and `.claude/settings.json` are committed, so a fork receives
looper's own rules the moment somebody works in it — measured on a clone: 8,345
characters on a turn touching a rule file, before this change. What it did not
receive was anything about what a change sent *back* must carry; that lived in
`CONTRIBUTING.md`, in prose, which by this repo's own doctrine stops nothing.

Two halves now. A `contribution` branch, mapped to `src/law/**`, `src/canon/**`
and `audit/**`, arrives exactly when somebody touches a rule: cases first from
the rule's own ban text, a run over code nobody here wrote, and the evidence sent
with the change rather than the conclusion. Measured on a clean fork changing a
rule: 9,577 characters, nothing dropped.

And the half a document cannot do: `.github/workflows/evidence.yml` refuses a
change to **what a rule says** — a `bans:`, `instead:` or `id:` line under
`src/law/` — when `audit/cases.ts` is untouched, and says why.

**It was written as a path prefix and that was wrong. Corrected 2026-08-18, by
the first fork to hit it.** `^src/law/` matches `src/law/capability.ts`, which is
gate wiring rather than a rule, so the fix that made the commit gate stop reading
Rust as TypeScript would have been refused for not adding a case it had no case
to add. A gate that refuses correct work for a reason that is not true is the
failure this repo calls blunt, and it had shipped inside our own contribution
path. It now reads the diff rather than the path: verified against real history,
that gate-wiring fix passes, and a constructed commit changing one rule's ban
text is refused until `audit/cases.ts` moves with it.

It runs on pushes to `main` as well as pull requests, because a gate the
maintainers walk around is not a gate. The third step — the foreign-corpus run — is deliberately not mechanised,
because no machine here can check that somebody read fifty thousand lines of
somebody else's code. It goes in the pull request in their own words, and it is
what decides whether the rule is taken.

**One sentence, at the moment it is true. Added 2026-08-18.** A fork that fixes
something in looper has already done the work; what was missing was anything
telling them the fix belongs upstream, at the moment they are making it. That
line now sits at the end of looper's own code branch, so it arrives whenever
anybody edits looper's TypeScript in any clone — proven on a fresh fork editing
one file: 9,105 characters, the sentence among them.

It is deliberately not in the canon. A line about this repository's pull requests
would be paid for by every project that adopts looper and has nothing to do with
it, which is the always-on tier wearing a disguise. And it is deliberately prose
rather than a gate: a gate is for what must not happen, and an invitation that
refuses a commit is not an invitation.

**looper does not send it. The agent does.** This is not a compromise around the
no-network invariant, it is the only correct shape. looper stays incapable of
opening a socket — that is the first line of its own constitution and the reason
a tool running on every edit and every commit is allowed anywhere near a private
codebase. The adopter's agent already has network access, already has whatever
client their host uses, and is already watched by whoever is sitting there. So
looper produces an artifact and instructs; the agent transports. The thing that must be trustworthy
never gains the capability, and the capability lives where it was already granted
and already visible.

**Four constraints, and the second is the hard one.**

1. **Opt in, off by default, and visible.** A governance tool that quietly emits
   anything is finished the first time someone notices. The adopter turns it on,
   and every report is written to a file they can read before it goes anywhere.
2. **The report carries the shape, never the source.** A rule fired on a
   construct; what we need is the minimal construct that reproduces it, not the
   file it lived in. Not their identifiers, not their paths, not their business
   logic. This is a real design problem and not a disclaimer: the agent must
   reduce a real violation to a synthetic fixture that still fires the rule, and
   a report that cannot be minimised is a report that does not get sent. Our own
   audience rule applies with force — the person running this cannot judge what
   is safe to disclose, so the mechanism has to guarantee it rather than ask.
The shape comes from whichever reader already reads the language, because there is
no second parser to be had: `.ts` through Babel, `.rs` through the engine's
`--shape` mode, `.py` through `read.py`. Each answers with the same three fields
and the guard that checks for a leak is the one guard, so a language cannot be
added to the law and left out of the report. That is what "one report across both
languages" above has always claimed, and finding 92 is the day it became true.

3. **Adopters install, they do not fork.** The canon is compiled in precisely so
   it "cannot drift into N copies", and fifty adopter forks are N copies: a fix
   argued against rules we did not ship, from a version we cannot identify. Forks
   are for the few people changing looper itself. Every report therefore names
   the exact version it came from.
4. **The report is a file, and how it travels is not ours to decide.** looper
   writes a report and says what it is for. Whether it becomes a GitHub pull
   request, a GitLab merge request, a ticket, or a message pasted to someone is
   the adopter's business and their agent's tools. Nothing in looper knows the
   name of a hosting provider, and nothing should: the whole engine speaks plain
   git — `diff`, `show`, `ls-files`, `diff-tree` — which is identical on every
   host and works in a repository with no remote at all.
5. **What the agent is told is doctrine, not code.** The canon gains the rule:
   when a looper rule blocks you and no legal spelling discharges it, that is
   looper's defect and not yours — do not edit looper, do not disable the rule,
   produce a report. Installed in `node_modules`, looper is already effectively
   read-only, so the instruction that carries weight is the positive one, and it
   belongs in the canon because it is true for every governed project.

**What this is really buying.** Not bug reports — a rule set with a supply of
real bypasses, which is the only thing the "never speculatively" bar will accept.
Every adopter is a language surface we do not have, hitting constructs we would
never have invented, and reporting them in the exact terms the rule table is
written in.

### Public or private, and the half of it that is decided

The repo is private today and the question of opening it is live. Three things
are settled and one is not.

**Settled: the canon is already public.** It compiles into the package, so every
adopter reads it. Opening the repo changes nothing about that half.

**Settled: it is all or nothing.** Engine public with the plan held back is the
obvious compromise and it does not work here, because PLAN.md is written before
the code and corrected in the same commit as the work. Split them and the record
drifts from the thing it records, which is the rot this whole design exists to
prevent.

**Settled: write everything as though it will be public, starting now.** This
costs nothing and removes the retrofit, and it is the better discipline anyway —
reasoning aimed at a skeptical outside reader is sharper than reasoning aimed at
oneself. The genericity test already enforces most of it.

**Decided: it goes public, and the design assumes it from now.** The argument is
not adoption or contribution, it is **verifiability**. looper installs hooks that
run on every edit and every commit inside a private codebase. "It cannot phone
home" is a promise while the source is closed and a five-minute check once it is
open: the socket ban, the zero dependency count, the absent lockfile, one test
file. For a tool with this reach, being auditable is worth more than the rule set
is worth hiding, and the rule set is not hideable anyway.

**One repo, everything in it, and that reverses the "all or nothing" worry
above.** That worry assumed the cut was engine-public and plan-private, which
fails because PLAN.md is corrected in the same commit as the code and a split
lets the record drift from what it records. The resolution is not a cleverer cut,
it is that **there is nothing in the plan worth withholding.** The reasoning is
the strongest evidence the tool is what it claims to be, which for a governance
product is closer to the pitch than to a leak. The scar log is a list of the
author's own mistakes. Neither is a moat, and the mechanical cost of splitting
them is real.

**Measured rather than assumed, 2026-08-17:** with only `src/`, `tests/` and the
manifests, 53 of 55 tests passed. The two failures were MCP tests asserting on
looper's own doctrine, using private files as fixtures — a coupling that was
wrong regardless of publishing, and now fixed with a fixture project under
`tests/fixtures/`. The public artifact stands alone because it was checked, not
because it looked like it would.

**One guard, and it is the only ongoing cost.** The scar log's value is naming
real failures precisely. Today every scar is ours. Once the return path is
running, a scar could name an adopter's situation, and that is the line: an
incident from an adopter is recorded as the construct and the rule, never as the
company, the codebase or the person. Same discipline the canon is already held to
by the genericity test, applied one directory over.

**Sequencing.** The switch waits for the law engine, because there is nothing to
judge the tool by until then and a first impression is expensive to redo. What
does not wait is writing as though it is already public, which costs nothing, and
the licence, which is needed before the switch and is the one decision here that
is legal rather than technical: a permissive licence maximises adoption, and an
explicit patent grant is what corporate legal teams look for.

**What this simplifies.** The return path below was designed around inviting
people to a private repo, with the report travelling by a mechanism we build. In
the open it is an issue or a change request against a repository the adopter's
agent can already reach with tools it already has. The minimiser still matters —
a report must carry a synthetic reproduction and none of the adopter's source —
but the transport stops being ours to invent.

## The chunks

Each chunk leaves the tool usable rather than half-built, and no chunk depends on
a later one existing.

### Chunk 0 — the container

MCP server on stdio, capability trait, registry, hook dispatch, the injection
allocator, and the CLI: `init`, `inject`, `hook <event>`, `status`, `freshness`.
Ships `router` only, and knows nothing about any language.

**Done when:** a live Claude Code session in a scratch repo shows the injected
doctrine, `looper status` reports its char cost, and `init` run against a repo
that already has an agent settings file with a foreign hook leaves that hook
intact and adds ours beside it. Twice equals once, byte-identical.

### Chunk 1 — the canon

The generic doctrine compiled into the binary: the constitution plus the
language-neutral branches. The bar for a canon line is the same bar the whole
product rests on: a line a model would not reliably follow unprompted. Lines that
restate what it already does make it hedge more, not less.

**The canon is the published half of this repo, and that is the reason for the
genericity check rather than merely its result.** The engine, this plan and
looper's own doctrine stay private; the canon ships inside the distributed
package, so every adopter can read every line of it. Anything written there is
written in public. A canon line therefore carries a second test beyond "would a
model follow it unprompted": would we be content for every adopter, and everyone
they show it to, to read it.

**Done when:** a project with a completely empty doctrine directory still
receives real rules every prompt, and a genericity check over the canon proves no
host-project vocabulary entered it.

### Chunk 1b — `secrets`, because depth 1 was two capabilities short

**Built 2026-08-17.** `secrets` and `recall` are named as v0.1 capabilities and as
most of what depth 1 is, and neither appeared in any chunk — a scheduling gap in
this plan, not a design one, and the kind that is only visible from outside.
`secrets` is built here because it is the failure that cannot be walked back: a
key that reached history is not fixed by a later commit, since every clone
already has it.

**Shape, never a list of names.** A list of key names cannot cover a vocabulary
someone else owns, so detection reads shape: vendor-prefixed tokens, a private
key block, a connection string carrying its password, something named like a
credential holding a real value, and a high-entropy string that is not a hash or
a uuid. It reads **added lines only**, so a project adopting looper is not
refused every commit over something already in its history.

**The message carries the fact people get wrong under pressure:** deleting it
later does not help. Rotate the key. That sentence is the entire point of the
capability, and a scanner that blocked without saying it would leave the leak
open while feeling solved.

**Language-agnostic, so it is depth 1 in full.** It scans every staged file, not
only TypeScript — a `.env` in a marketing team's repo of scripts is exactly the
case this exists for.

### Chunk 1c — `recall`, and it is committed rather than local

**Built 2026-08-17**, completing the four v0.1 capabilities. Durable project
memory: what took work to find out, kept where the next session reads it.

**Committed, which reverses the prior art.** There, recall is local working state
and gitignored. That is wrong here for a reason worth stating: a note nobody else
can see is a note nobody can correct, and a wrong note is worse than none because
it is believed. Committed, a stale memory shows up in a diff and gets deleted. It
also becomes shared, which is where its value actually is — "why we abandoned
that approach" is worth most to the person who was not there. `secrets` already
scans every staged file, so the obvious objection is already gated.

**The format carries the defences, because rot is the whole difficulty.** Every
note has the date it was learned. Writing the same summary again replaces it, so
correcting is the cheap path and duplicating is the awkward one. Removing is one
call. The file is plain markdown a human can fix by hand.

**And the tool description carries the bar,** since that is what the model reads:
what earns a place is something that took work to find out and is written nowhere
else. What does not is anything the code, tests or git history already say; a
version number or path, which goes stale silently; and one session's stumble
written as permanent law, which makes every later session steer around a pothole
filled months ago. A note earns its place by helping the next session, not by
having surprised the last one.

### Chunk 1d — `decisions`, the rules a project set aside on purpose

**Built 2026-08-18, from an adopting project that had grown the same thing by
hand.** They kept a ledger of every place the doctrine or a rule in `law.toml`
was deliberately ignored, with seven entries in it: a credential that reached git
history and was not rotated, a vendor API built ahead of the legal answer, holding
every customer's server password, an anti-cheat recorder running inside somebody
else's game process. Their own summary of why it exists is the argument for
putting it here: **most of these are security or legal questions nobody on the
team is qualified to answer.**

`recall` is the wrong home for them. A note is a fact somebody worked out. A
decision is a rule that was broken knowingly, whose safety is an open question,
and the difference matters because the two want opposite treatment: a note is
true until something teaches you otherwise, and a decision stops being true the
moment the code under it moves.

**So an entry names the files it rests on, and looper hashes them.** Every later
session is told which entries the ground has shifted under. That is the whole
mechanism and it is deliberately small: looper never edits the prose, because
what an entry says is a judgement and no tool refreshes a judgement. What a tool
can do is refuse to let the document be trusted blindly, which is the failure
every stale design document has in common.

Four standings, and each is said differently on purpose. **Watched**: the files
hash as they did when somebody read it. **Moved**: they do not, so the entry
carries `READ IT AGAIN` with both hashes. **Gone**: a file it rests on no longer
exists, which is louder than moved because a rename can hide a rewrite. And
**unwatchable**: the entry rests on a decision rather than on code, names no
files, and says so rather than being counted as fresh. The adopting project had
one of those and it is the oldest open item they have, which is exactly the entry
a hash would have quietly reported as fine.

**`reread` is the only way a hash is re-recorded**, and the tool says what that
means: a claim that a person read the entry again and it still says something
true. Running it without reading is how the document starts lying. Nothing
re-records itself, and no gate blocks on a moved entry, because a decision that
has rotted is a thing to think about rather than a thing to fix in the next
commit.

**Where the constants live is a finding of its own.** `src/config.ts` was 497
lines against its own 500 cap, so adding a path, a tool name and a priority
tripped `TS-DECOMPOSITION:1`. The cap was not widened. The decisions module names
its own file and tool, which is defensible on its merits since nothing outside it
needs them, and it leaves a note for whoever adds the next capability: that file
is full.

### Chunk 1e — `LOG:3`, because a log you cannot query is a log you re-read

**Built 2026-08-18, from an adopting project's measurement.** They had 269 log
calls across a Rust workspace and not one interpolated message, because a person
had spent hours on it after a silent outage. That is the unusual case. The normal
case is every line reading `logger.info(f"saved {order}")`, and the cost only
arrives on the night somebody needs to count how many orders failed and finds
that the value is inside a sentence rather than beside it.

`LOG:1` in all three languages already says the output belongs to whoever ran the
program. `LOG:3` says the shape of what you do emit: **the message is a constant
and everything that varies is a field.** A constant message can be grouped,
counted and filtered; a sentence can only be grepped, and only if you guess the
wording.

**Each language keys on its own logger, which is what keeps it precise.** Rust
reads the `tracing` and `log` macros, where the first string literal is the
message and a `{` in it is a value. Python reads a call to a level name in a file
that imports `logging` or `structlog`, and refuses an f-string, a `%`, a
`.format()` or a concatenation — **while leaving `logger.info("saved %s", order)`
legal**, because that is the standard library's own lazy form and refusing it
would be refusing the language. TypeScript has no standard logger, so it judges
nothing until a file imports one of the known packages, and `[ts] loggers` lets a
project name its own. A file that imports no logger cannot trip this rule, which
is how `report.info(...)` on some unrelated object stays silent.

**What it deliberately does not do.** It never asks for a log line to exist. That
is a judgement about what is worth saying, no rule can make it, and a rule that
demanded one per function would produce noise, which is how a tool gets switched
off. The presence half belongs in the canon, where it can say where an event is
worth emitting without refusing anything.

### Chunk 1f — the seer says what is ticked, and the shim is gone

**Rebuilt 2026-08-19, from an adopting project that lost twenty minutes to it.**
An agent asked to look at a window, was told "not armed, only the person at this
machine can arm it, and asking again will not change the answer", and told the
person to tick a box. They had ticked one. Three things were wrong at once and
the message could distinguish none of them.

**The consent window was not running.** `capture.ps1` returned `no` when the
named pipe refused to connect, which exits 5, which reads as "not armed". A
closed consent window and an unticked window were the same sentence. They are now
exit 6 and exit 5, and the agent is told which.

**The title was wrong and nothing said so.** The window was `RustOnTop (Ubuntu)`,
because WSLg appends the distro, and the agent asked for `RustOnTop`. The refusal
named neither the titles that are open nor the ones that are ticked, so the only
way through was to read the PowerShell source, which is what the adopter did.

**The agent could not ask.** `see` required a window and had no way to answer
"what may I look at". It now takes no argument to mean that question: the consent
window answers `armed?` with what is ticked and every title currently open, and
the tool's own description says to call it that way first.

**The Linux half was a shim and is deleted.** `seer/linux/looper-seer` was a
shell script that translated a title into a PowerShell call and exit codes back,
and it was where the two failures above became indistinguishable. There is one
seer, it looks at Windows windows, and it lives under `windows/` whether looper
runs on Windows or inside WSL beside it. `underWsl()` decides, in `config.ts`
because it reads the environment, and the drive reaches PowerShell directly.

**What that widened, and how it is held.** The drive used to start exactly one
program: the file at `seerAt()`. It now starts PowerShell and `wslpath`, and it
takes the shell as an argument so a test can hand it a fake. That argument is the
kind of seam that turns into an arbitrary-program hole, so `tests/invariants.test.ts`
refuses any file except the drive itself calling `captureWith` or `standingWith`,
and refuses `shell: true` and `execSync` anywhere in it. A window title is data
and never reaches a command line as anything else.

**One more state, found while proving it.** A consent window from before this
change answers `no` to `armed?`, which is not JSON, and the first version of the
status path printed it as an answer. That is exit 7 now, and the agent is told the
window is running but too old to say, and to restart it.

### Chunk 2 — the law engine, language-neutral half

Everything about the law that is not a parser: the rule and category and
violation types, the report format that carries the repair prompt, the `law.toml`
loader with the three graded concessions and the per-language tables, the file
walker, the extension dispatch, and all four wirings (PostToolUse, install, Stop,
and commit).

**Both passes are shaped here, not just the fast one.** A rule declares which
pass it belongs to and the engine refuses to run it on the other, the same way a
language reader declares its tier. The baseline — read, compare, shrink, refuse a
growth — is engine machinery and lands here too, because retrofitting it after
rules exist means every rule written before it assumed the wrong verdict model.
The type source is measured in this chunk rather than assumed: which TypeScript
compiler API answers "is this a promise", on which version line, at what cost
over a real project.

Ships with zero rules, which makes it a config format until chunk 3. That is
worth saying out loud rather than discovering.

**Done when:** one hand-written fixture rule fires on a fixture file and the
report carries id, location, why, legal spellings and valve; deleting `law.toml`
changes no verdict; and a fixture project with a baselined violation commits
clean while the same violation added to a second file refuses.

### Chunk 3 — TypeScript and JavaScript

Tier A, and the language reader that carries most of the value. Step (a) is already
done and its numbers are recorded above, which is why this chunk now starts at
the rule table rather than at a measurement.

- **(a)** ~~Prove the parser.~~ **Done 2026-08-17.** `@babel/parser`, 8.8 ms
  load, 38 ms for a 1,562-line TSX file, 2.4 ms to walk 12k nodes. What remains
  from this step is the dependency audit — the no-network check over the
  resolved `node_modules` tree, plus a postinstall-script audit, which is a
  different job in npm than it was in Cargo.
- **(b)** Write the TS/JS rule table. **Derived 2026-08-17** — the table is above,
  under "The TypeScript rule table": every rule with its category, what it bans,
  and whether the failure it catches survives into TypeScript unchanged, changes
  spelling, or does not exist here at all, with the deliberate absences recorded.
  What remains of this step is the repair prompt for each rule — why it exists,
  the legal spellings as working code, the valve where it has one — which is the
  artifact the product rests on and is the bulk of the work, not a formatting
  pass over the table.
- **(c)** Implement the shared-category rules from (b), with provenance checks
  anywhere a rule names a symbol.
- **(d)** Add the rules that exist only because TypeScript rots its own way.
- **(e)** The slow-pass rules: the floating promise, the unreferenced export, and
  the test-only export. Three rules, one mechanism, and they are the reason the
  slow pass exists at all.

**Done when:** every rule has a fixture file with a hand-checked expected report,
the whole fast set judges one unsaved file inside the budget, and the slow set
judges a real existing repo and produces a baseline.

### Chunk 4 — the tier A rule packs: React, Next.js, Node, Data

No new parser. Four packs on chunk 3's AST, and React Native comes free with the
React pack because it is the same grammar and the same hooks. These packs may
assume the prescribed stack, which is what makes them sharp rather than generic.

`REACT` starts at the failures already evidenced across the ecosystem rather
than invented here: a hook called conditionally or in a loop, an effect whose
dependency list lies. `NEXT` is the server and client component boundary, which
needs the layer map — that is why `LAYER` for TypeScript lands here and not in
chunk 3. `NODE` is the server-side set, and the first entries translate cleanly
from failures we have already seen in another language: environment access
outside the declared config file, and a child process built from an interpolated
string. `DATA` is the stack-specific pack: the SQL call-site rule above, a
Drizzle query assembled by string concatenation, and an API boundary that
accepts input without a Zod schema in front of it.

**Built, and this table is the record of it.** The prose above described four
packs and named no rule in any of them, which the audit of 2026-08-17 recorded
as finding 27 — four of the five missing were the security rules, so the
highest-stakes part of the program had no design record at all.

| id | bans | origin |
|---|---|---|
| `REACT:1` | a hook called inside an `if`, a loop, or after an early `return` | the ecosystem's own most-hit failure. React matches hooks by counting them in order, so a conditional one returns somebody else's value |
| `REACT:2` | an effect whose dependency list leaves something out | the list is a promise React believes. What is left out stops the effect re-running, and the screen keeps showing what was true a minute ago |
| `DATA:1` | a database query built by pasting values into its text | the oldest exploited mistake there is, and the safe spelling is shorter to write |
| `DATA:2` | reading a request body into an object and trusting its fields | the type you wrote down is a wish until something checks it |
| `NODE:1` | a command for the operating system built by pasting values into it | a shell reads punctuation as instructions, so a filename someone else chose becomes a second command |
| `NEXT:1` | reading a setting that is not marked public, in a file that runs in the browser | a `"use client"` file is sent to whoever opens the page, settings and all |

Grows only on caught bypasses. Inventing framework rules before we have hit the
mistakes is the speculative rule writing the bar forbids.

### Chunk 5 — adoption

`looper adopt`, the pending-proposals file, the ratify path, and the freshness
gate learning to stay quiet on a repo whose doctrine is still empty.

**And the first slow pass, run as a survey by `init` itself.** Adoption is the
moment a repo full of code written before looper existed meets the law for the
first time, so the survey runs as part of installing — not behind a second
command, because the person who most needs the answer is the person least likely
to know to ask for it. It reports what is there in plain terms and writes the
baseline. That report is the honest first answer to "what did I just point this
at", and it is the one output a team on an existing project will actually read
before deciding whether to keep the tool. `adopt` stays what it was: the doctrine
proposals, which do need a human, because ratifying doctrine is a judgment and
surveying code is not.

**Done when:** run against a real existing project, nothing changes except files
looper owns; a candidate rule that fires on real code, is fixed everywhere it
fires, and leaves the project passing becomes a rule with its evidence recorded
beside it; a candidate that cannot be fixed everywhere is refused and says why;
and the survey plus baseline let the next commit pass without a single rule being
disabled to get there.

### Chunk 6 — the return path

`looper report`, the minimiser, and the canon line that tells an agent what to do
when a rule cannot be discharged. With the repo open, the transport is an issue or
a change request the adopter's agent can already open with tools it already has,
so this chunk is the minimiser and little else. It lands after chunk 4 because it needs a rule
set worth reporting against, and before anything in chunk 7, because every week
it does not exist is a week of evidence nobody collected.

The minimiser is the whole of the work and the rest is plumbing: reduce a real
violation to a synthetic fixture that still fires the rule, carrying none of the
adopter's identifiers, paths or logic. A violation that cannot be reduced is not
reported.

**Done when:** a rule fires on a fixture in a repo looper has never seen, the
agent produces a report naming the version, the rule and a minimal reproduction,
a human reads the file before it leaves the machine, and nothing in it came from
the adopter's own source.

### Chunk 7 — named so it is not mistaken for forgotten

**Tier B, if a legacy Go or Java service ever earns the law.** The substrate
first, proved on one grammar, then each further language as a `.wasm` plus a
rule pack. Designed above, not built.

The law republished as an eslint plugin, for editor squiggles only, with the
gates staying exactly where they are. A SQL grammar, if judging migration files
ever earns a reader. Swift and Kotlin-for-mobile, if the apps ever stop being
React Native. `reuse`, once there is a substrate for it. A UI.

Not here: a Rust language reader. Its only justification was that an engine already
existed to be wrapped, and that justification is withdrawn. It rejoins the queue
at the value of any other new language reader, which is to say behind the
languages an adopter actually ships.

## Rust, the backend language, read at full depth

**A note on one word, because it caused a real misreading.** This document has
used "front end" in the compiler sense — the part of the law engine that reads a
given language — in a document that also uses it for Next.js and React. The two
meanings are opposites in a sentence about a Rust backend, and on 2026-08-17 a
reader took "a Rust front end" to mean a Rust user interface, which is the
reverse of what was meant. The constitution's first rule is that everything
written here reads to someone who cannot read code, and a term that inverts its
own meaning fails that. It is **language reader** everywhere below and above.

This section is about the **backend** — the web framework, the async runtime,
the database layer and the crate configuration around them, all named in
STACK.md. Nothing in it proposes writing a user interface in
Rust.

### This reverses a decision, and the old half is kept

Chunk 7 said, and still says: *"Not here: a Rust language reader. Its only
justification was that an engine already existed to be wrapped, and that
justification is withdrawn. It rejoins the queue at the value of any other new
language reader, which is to say behind the languages an adopter actually
ships."*

That reasoning was right and is not withdrawn. What changed is the condition it
named: **an adopter ships Rust.** A Rust backend, a TypeScript front end, and
Tauri joining them in one repository. The queue position argued for
was "behind the languages an adopter actually ships", and Rust has moved to the
front of that queue by satisfying it rather than by being argued for again.

Recorded this way because a reversed decision keeps both halves, or the same
argument returns in a month.

### What is easy, and what is not

Easy, and genuinely so: **detecting which stack a project is**, routing files to
the right language reader, a second doctrine branch, one baseline and one report
across both languages, and most of the rules. The engine has been
language-neutral since chunk 2 — `judge(checks, pass, subject, concessions)`
knows nothing about TypeScript, and the categories, the report, the baseline,
the concessions and the graded valves are all already shared.

Hard, and it is one thing: **reading Rust at all.** Everything below is
downstream of that decision, so it is taken first and in the open.

### The parser, which was the whole problem, and is not any more

Four ways in were weighed and three closed. Then the fourth turned out to be a
fifth, and the analysis is kept in full because it was wrong in a way worth
remembering.

**What was closed, and still is.** `web-tree-sitter` is not in this machine's
npm cache, so the WASM substrate cannot be installed under the no-network rule —
closed on availability rather than merit. `cargo check` yields diagnostics rather
than a tree and costs seconds against an edit gate whose whole budget is ten
milliseconds — closed there, still a candidate for the slow pass. A helper crate
built on `syn` from crates.io breaks the no-network invariant to save writing a
lexer — closed.

**What was chosen, then unchosen.** A Rust lexer and item reader written here in
TypeScript: 400 to 600 lines, exact, no types. That was the plan for about an
hour.

**What was actually true.** The Rust predecessor did not write a Rust law
either. It drove one — Zmole Cristian's `lawkeeper`, incorporated as a library
and pinned to a reviewed commit. That engine is **3,914 lines across 14 files**,
parses Rust with `syn`, depends on `syn`, `proc-macro2`, `serde` and `toml` and
nothing else, and is licensed **0BSD**, which permits copying with no attribution
required. Its rule set is the ancestor the TypeScript table in this document was
derived from, rule for rule.

So the question was never "how do we read Rust". It was "why would we write a
second one". **Resolved 2026-08-17: copy it in and drive it.** It now lives at
`vendor/rust-law/`, renamed for what it does here rather than where it came
from, with its provenance recorded beside it in `PROVENANCE.md`. Its own
command-line and MCP surfaces were dropped; one narrow program, `looper-rust`,
takes a project root and optionally a list of files and prints violations as
JSON. Nothing else.

Measured on the day it landed: **builds offline in 13.5s** against the cargo
cache already present, and judges a whole real project in **14ms**. A file
written to break it returned `.unwrap()`, a discarded `Result`, a lossy `as`
cast and an `#[allow]`, at the right lines.

**What this costs, and it is not nothing.** looper stops being one language. A
project with a `Cargo.toml` pays one `cargo build` the first time and needs the
toolchain — which it has by definition, since it is a Rust project. A
TypeScript-only project never touches any of it. And 3,914 lines of somebody
else's code are now in this repository, updated by hand and deliberately or not
at all, which is the price of never downloading anything.

**`rustgraph` is not taken.** The earlier project used it beside the law for call
graphs and "who calls this". The law engine does not depend on it, and what it
serves is the `reuse` capability, which this plan has deferred since chunk 7.
Checked rather than assumed on 2026-08-17.

**What is still ours to write.** The engine reports a rule id, a file and a
line. Every word a person reads — the ban, the reason, the legal spelling — is
written here, in the voice the rest of the law already has, and keyed by id. The
audit found the rule prose to be the best-made part of this project; the Rust
half gets the same prose or it is not the same tool. The engine's own help text
is not carried over.

### In Rust the compiler is already the deputy, so the law is smaller

This is the reframing the whole Rust reader rests on, and it is not a
concession.

TypeScript's law is large because `tsc` is weak: it will not tell you a promise
was dropped, that a value came from outside unchecked, or that an error vanished.
`TS-ERROR:1` exists and needs a slow pass with a module graph precisely because
the compiler declines to answer.

`rustc` answers. An unused `Result` is `#[must_use]` and already a warning. A
dropped future does not compile. Data races do not compile. Use-after-free does
not compile. Half of what the TypeScript law spends its effort on is not
reachable in safe Rust.

So the Rust law divides in two, and the cheaper half is the larger:

**Appointed deputies — enforced by reading configuration, not code.** A crate
declares its lints in `Cargo.toml` under `[lints.clippy]` and `[lints.rust]`, at
`deny`. `unwrap_used`, `expect_used`, `panic`, `indexing_slicing`,
`unsafe_code`, `missing_docs` where it applies. looper's rule is that the table
exists and denies the named set — it does not re-implement clippy, it checks
that clippy was appointed and not muted. This is `TS-ERROR:5`'s shape, it costs
a TOML read, and it is the single highest-value rule in the Rust pack.

**What compiles clean and is still wrong — enforced by the lexer.** `unwrap` in
production code, `panic!` as control flow, `unsafe` without a stated reason,
`#[allow]` as a silencer, a query built by `format!`, a command built by
interpolation, a blocking call inside an `async fn`, `println!` in a library,
`std::env::var` scattered. None of these need types.

### The Rust rule table

Twenty-eight rules come from the engine and are listed below exactly as it
enforces them. Categories are the existing ones — `SECURITY`, `ERROR`, `TYPE`,
`DEAD`, `TRUTH`, `LOG`, `DECOMPOSITION`, `LAYER`, `TESTS` — because a break-in is
a break-in in either language and the report should not learn a second
vocabulary.

**This table replaced an earlier one, and the reason is worth keeping.** The
first version was written from a design before the engine had been read. The
rules were then written from the engine and the table was never reconciled, so
for a day the document described six ids as banning something other than what
they ban — and two of those six promised rules that do not exist at all. The
audit of 2026-08-17 found it, `tests/plan-is-true.test.ts` now compares each row
against the rule it names, and there is one table rather than two.

**Not built, and named so they are not mistaken for covered.**

| id | would ban | why it is not here |
|---|---|---|
| `RUST-ERROR:10` | a blocking call inside an `async fn` — `std::fs`, `std::thread::sleep`, blocking `reqwest` | **not built yet.** Tokio's most expensive quiet failure: the executor stalls and nothing errors. The engine does not cover it and looper has no Rust reader of its own, so building it means either extending the vendored engine or writing one |
| `RUST-TYPE:6` | an `unsafe` block outside a module declared for it | **not built yet**, and there is a real answer that is not a rule: `#![deny(unsafe_code)]`, appointed as a deputy under `RUST-ERROR:5`. That is off unless a project declares it, which is the honest state of things |


**What the engine also carries, and the table above did not name.** Thirteen more
rules came with it, and the control in `tests/plan-is-true.test.ts` refused this
document until they were written down.

| id | bans | origin |
|---|---|---|
| `RUST-DECOMPOSITION:1` | a file longer than the cap | carries |
| `RUST-DECOMPOSITION:2` | `lib.rs` or `mod.rs` holding anything but wiring | the barrel rule, and sharper here: an inline `mod x { … }` hides a file's worth of code from every per-file rule |
| `RUST-DECOMPOSITION:3` | a function longer than the cap | carries. In a language with no comments the names of the stages are the whole explanation |
| `RUST-LAYER:1` | a `use` crossing the declared layer map | carries; off until a project declares its layers |
| `RUST-LAYER:2` | a `crate::` / `self::` / `super::` path outside a `use` | the top of the file is meant to be the complete list of what it needs |
| `RUST-LAYER:3` | a `static` whose type carries something callable, at any depth | a call looked up at runtime cannot be followed by reading |
| `RUST-ERROR:5` | a crate root that appoints no deputies | the cheapest strong rule in the pack: `rustc` and clippy do the work, for free, on every build |
| `RUST-ERROR:6` | something fallible handed to iteration, where the standard library drops the failures | nine rows load, the tenth was malformed, and the report shows nine |
| `RUST-ERROR:7` | `catch_unwind`, `set_hook`, `panic_any` outside the entry point | a net under a crash the caller never hears about |
| `RUST-ERROR:8` | fallible work inside `fn drop` | clean-up on the way out has nowhere to report to |
| `RUST-TYPE:3` | an `Option` in a public signature | absence needs a name before it can be handled |
| `RUST-TYPE:4` | an `as` cast | it truncates, wraps, rounds and re-signs in silence |
| `RUST-TYPE:5` | `wrapping_*`, `saturating_*`, `overflowing_*` and the lossy decoders | a failure turned quietly into a number that travels |
| `RUST-DEAD:3` | `todo!`, `unimplemented!`, `unreachable!` | a runtime panic that compiles, type-checks and looks finished |
| `RUST-DEAD:4` | `use x::*` | nobody can tell where a name came from |
| `RUST-LOG:2` | taking `io::stdout()` or `Stdout` in a type, outside the entry point | the printing decision, one level down where the printing rule cannot see it |
| `RUST-TESTS:1` | `#[test]` and `#[cfg(test)]` under `src/` | a test inside the module tests the inside rather than the promise |
| `RUST-ERROR:9` | a file that cannot be read as Rust at all | looper's own, not the engine's. The engine judges a crate at a time, so one unparseable file takes the whole crate down and the report would otherwise say nothing to fix. Ids 1 to 8 are the engine's; 9 upward are ours |


**The rest of the set, as the engine enforces it.** Each row is the rule's own
ban text; `tests/plan-is-true.test.ts` refuses the suite if a row and its rule
drift apart.

| id | bans |
|---|---|
| `RUST-ERROR:1` | reading a fallible value without handling it. The whole family: `unwrap`, `expect`, `unwrap_err`, `expect_err`, `unwrap_or`, `unwrap_or_else`, `unwrap_or_default`, `ok()`, `err()`, `or()`, `or_else()`, `map_or()`, `map_or_else()`, every `is_ok` / `is_some` / `is_none_or` predicate, `matches!` on one, `if let` and `while let` on `Some`/`Ok`/`Err`/`None`, `let _ =`, an untyped `let _name =`, `==` or `!=` against `None` or `Some(..)`, `drop(call())`, and `let … else` on `Ok`/`Err` |
| `RUST-ERROR:2` | throwing the payload away: `Ok(_)`, `Err(_)`, `Some(_)`, a `_ =>` arm or a catch-all binding in a match on a fallible, an `Err` you bind and never read, and `_` anywhere in a closure's parameters |
| `RUST-ERROR:3` | an `Err` arm that answers with a made-up value: a literal, `None`, `Ok(())`, an empty collection, `Vec::new()`, `String::new()`, `Default::default()` |
| `RUST-ERROR:4` | an `Err` arm that does none of the three things an `Err` arm may do |
| `RUST-TYPE:1` | an error type that says nothing — `String`, `&str`, `dyn` anything, `Box<dyn Error>`, `anyhow`, `eyre`, `()`, a bare primitive or a bare generic — in **any** written type position: a return, a parameter, a struct field, a local annotation, a generic argument |
| `RUST-TYPE:2` | a `Result` with its error half hidden: `type MyResult<T> = Result<T, MyError>`, a one-argument `Result<T>`, or `io::Result<T>` |
| `RUST-DEAD:1` | `#[allow(…)]`, `#[expect(…)]` and `#[cfg_attr(…, allow(…))]` naming `dead_code`, `unused` anything, or `unreachable_code` |
| `RUST-DEAD:2` | comments, all of them — `//`, `/* */`, `///`, `//!` and `#[doc]` |
| `RUST-TRUTH:1` | a default born outside the one file that gathers settings — an absence arm that resolves to a value instead of passing the absence on |
| `RUST-LOG:1` | `println!`, `print!`, `eprintln!` and `eprint!` outside the file that starts the program, and `dbg!` anywhere |

**The boundary rule, which is new and belongs to neither language.**

| id | bans | origin |
|---|---|---|
| `TAURI:1` | `invoke("name")` in TypeScript with no `#[tauri::command]` named `name` in the Rust half | new here. The IPC boundary is a string on one side and a function on the other, and nothing checks that they agree until a user clicks the button. Built 2026-08-17: the Rust half lists its commands through `looper-rust --commands`, the TypeScript half is read for `invoke("…")` where `invoke` came from `@tauri-apps/`, and a name with no command behind it is refused |

`TAURI:1` is the reason to do this properly rather than bolt a second linter on
the side. It is only decidable if one tool reads both halves of the repository,
and it is exactly the failure a mixed-stack project ships.

**One command pool per app, not one per repository. Corrected 2026-08-18, from
adopter issue #11.** The first version merged every `#[tauri::command]` from
every `src-tauri` directory into one set, so a repository with two Tauri apps
accepted a call in one app that only the other app answers — nothing joins them
at runtime, so that is the failure the rule exists to catch, passing. The pool is
now keyed by the directory above each `src-tauri`, and a file is judged against
the app it lives under. A file under no app is not judged by this rule at all,
because a verdict against a guessed app is how the union got written in the first
place.

### Knowing which stack a project is

Detection is by evidence on disk, in one pass, and it is cheap:

| found | means |
|---|---|
| `Cargo.toml` at the root or in a workspace member | a Rust crate; its `[lints]` table is now governed |
| `package.json` | a TypeScript project |
| `src-tauri/tauri.conf.json` | Tauri, so the boundary rule applies and `src-tauri` is the Rust half |
| both, no Tauri | a mixed repository; each file is judged by its own language |

Routing is per file, by extension, and needs no cleverness: `.rs` to the Rust
language reader, `.ts`/`.tsx` to the TypeScript one. The interesting case is what is
**shared**, and the answer is almost everything — one `law.toml`, one
`.looper/baseline.toml`, one report, one set of categories, one set of graded
concessions. A project does not have two laws. It has one law with two readers.

### What has to change in the engine

Small, and named so the work is not underestimated later:

- `Subject` gains the language it is in, and `Check` declares which language it
  reads. `judge` skips a check whose language does not match the subject — the
  same shape as the existing `pass` filter, which already exists and works.
- `JUDGED_EXTENSIONS` gains `.rs`, and the file walk learns `target/` alongside
  `node_modules/`.
- The doctrine tree gains `src/canon/rust.md`, and `map.toml` learns to select
  it by edited file rather than by project.
- `looper init` learns to say which stack it found, because an adopter with a
  mixed repository needs to see that both halves were noticed.
- The parse cache in `src/law/ts/parse.ts` becomes language-aware, or the Rust
  reader gets its own beside it. The memoisation is what keeps the fast pass at
  10ms and it must not be lost.

### The chunks

**Chunk 8a — the lexer.** Rust tokens, exactly: identifiers, lifetimes,
literals including raw and byte strings, nested block comments, attributes,
punctuation, and the positions of all of them. No rules yet.
**Done when:** every `.rs` file in a real Rust repository lexes with no
unrecognised token, and the token stream round-trips to the original text
byte for byte. That round-trip is the whole test — it cannot be argued with.

**Chunk 8b — item structure.** Enough recursive descent to answer: which item is
this token in, is that item `async`, is it under `#[cfg(test)]`, where does each
block start and end.
**Done when:** for a real crate, every token maps to the right enclosing
function, and a hand-checked fixture with nested modules, impls and test modules
comes out right.

**Chunk 8c — the deputy rule alone.** `RUST-TRUTH:2`, which needs no lexer at
all. Ships first because it is the highest value per line in the whole plan.
**Done when:** a crate with no `[lints]` table is refused with the exact table to
paste, and a crate with one passes.

**Chunk 8d — the rule pack.** The table above, each with cases written from its
ban text before the code, and each run over a foreign Rust corpus.
**Done when:** every rule has cases in `audit/cases.ts`, the vocabulary test
covers the Rust token kinds, and the pack has been run over at least
twenty thousand lines of Rust nobody here wrote — with the false positives
judged one at a time, as pass 1 of the audit did.

**Chunk 8e — the boundary.** `TAURI:1`, and the detection that turns it on.
**Done when:** a Tauri fixture with a renamed command is refused, and a correct
one passes.

**Deferred, and named so it is not mistaken for forgotten:** `cargo check` as a
slow-pass deputy. It is the right answer for anything needing types and it costs
seconds, so it belongs on the commit gate if anywhere. Not in 8a–8e.

### What this costs, honestly

The lexer and item reader are the bulk: call it the largest single piece of work
in this plan since the TypeScript reader itself. The rules after it are each
small, because the reading is done.

Nothing crosses from the Rust predecessor. Reading it to learn **what** is worth
enforcing is authorised; its code is not, and none of it will appear here. The
rules above were derived from the prescribed Rust stack rather
than from anything already written.

There is no foreign Rust corpus on this machine. Pass 1 of the audit found a
safety rule catching three of ten because it had only ever met its author's
fixtures, and that lesson applies here before a line is written: **the Rust pack
is not done until it has met a stranger's code.** Naming a corpus is a
precondition of chunk 8d, not a step inside it.

### The canon's branches reached nobody. Fixed 2026-08-18, from adopter issue #13

A branch was injected only when the project's own `map.toml` tied it to the files
being touched, and `init` writes that map empty. So every canon branch — the
TypeScript law above all — waited on a file the adopter had never written.
Measured before the fix: a fresh project editing a `.ts` file received **2216
characters, the constitution and nothing else.** The law this whole tool is
built around never arrived, and nothing said so.

**The canon now carries its own map.** `law` for TypeScript and JavaScript
extensions, `rust` for `.rs`, `doctrine` for `.looper/doctrine/**`. A project's
own entry replaces the default for that one branch and leaves the others alone,
so anyone who has written a map keeps exactly what they wrote. Same fresh project
after: **5900 characters — law, rust and doctrine — with nothing dropped.**

**`architecture` deliberately gets no default, and that is a trade rather than an
oversight.** It is the one branch whose subject is design rather than editing, so
firing it on every code edit would be the always-on tier wearing a disguise. It
arrives through the `doctrine` tool, which the tool's own description tells the
agent to pull from before starting a task.

**Two new canon branches, and what they replace.** `doctrine.md` carries the
rules for writing rules — including *a new line has to say what it replaces*,
which was looper's own project doctrine and therefore the one sentence an adopter
porting a doctrine in could never see. Those lines came out of
`.looper/doctrine/doctrine.md` in the same commit, because the project half
instantiates the canon and never repeats it. `rust.md` closes the gap where the
engine enforced 28 Rust rules and the canon said nothing about writing Rust.

**What the budget guard now asserts, changed 2026-08-18 with both halves kept.**
It used to require every rule set that exists to fit in one turn together, on the
grounds that anything over the budget "falls off silently". That premise stopped
being true when the allocator started appending
`[looper: N contribution(s) dropped for budget — …]`: a drop is named, in the
same text the agent reads. Measured today, every set at once is 11,324
characters against a 9,800 budget, so on a turn touching TypeScript, Rust,
doctrine and the plan at once, the lowest-priority set is dropped and said. What
is guarded instead is what has to hold: **the constitution plus any single branch
fits**, so one kind of work is always served whole, and **a drop is always
named**. The old guard's value — that the tree cannot grow quietly — is kept by
the bullet cap on the always-on tier, which is untouched.

### The four branches the canon was missing. Built 2026-08-18, from adopter issue #13

Each was proposed with evidence that it is generic: two unrelated projects wrote
several of the same lines without seeing each other's. What each needed before it
could ship was not the words but **the thing that makes it selective**, because a
branch that fires on everything is the always-on tier under another name.

| branch | fires when the turn touches | what it replaces |
|---|---|---|
| `security` | `.env*`, anything named for a secret, credential, token or auth, and `config.*` | nothing — looper shipped a secrets gate with no doctrine behind it |
| `evidence` | any `.md` | the measurement line in looper's own `process.md`, deleted in the same commit |
| `frontend` | `.tsx`, `.jsx`, `.css`, `components/`, `pages/` | nothing — the canon said a view "decides nothing" and stopped there |
| `sources` | nothing, by choice | most of looper's own `sources.md`, cut to the two lines that are only true here |

`sources` gets no path mapping for the same reason `architecture` does not: its
subject is a kind of work rather than a kind of file, and no path says "somebody
is reading prior work right now". Both arrive through the `doctrine` tool, whose
description already tells an agent to pull what a task touches before starting.

**What a turn costs now, measured 2026-08-18 against this repo,** where the
constitution is 3,179 characters:

```
  6520  a TypeScript edit      law
  4174  a Rust edit            rust
  4198  a screen               frontend
  7233  settings or a key      law, security
  5004  a document             evidence, process
  5453  doctrine itself        doctrine, evidence
 12557  all of them at once    everything — over the 9,800 budget
```

Every real kind of work fits with room to spare. The last line is a turn that
touched all six areas at once, and it is over: the lowest-priority sets are
dropped and named, as the allocator has always done.

**Which one drops stopped being alphabetical.** Branches are now ordered by how
many of the turn's touched paths they govern, so the set most connected to the
work survives and a set that matched one file out of six is the one that goes.
Alphabetical order was a coin toss dressed as a rule, and it only became visible
once the budget could actually be reached. `tests/map.test.ts` holds it.

**The line that reports a drop is paid for out of the budget.** It was appended
after the accounting, so an answer could land over the budget while `overflowed`
said no — and the marker names every dropped set, so the case that reports the
problem was the case that made it worse. Room is now taken for it before the
answer is assembled, dropping one more set if that is what it costs, and
`overflowed` means what it says: the text handed over is larger than the budget,
which now happens only when the constitution alone is.

### What the secrets gate was missing. Corrected 2026-08-18, from adopter issue #21

Reported with numbers from a real repository: 119 lines flagged out of 688,138
scanned, 0.017%, and zero real secrets — which is the argument for looking
harder, not the argument for stopping. Four holes, and the first two matter most
because they are what a real project is actually called:

- **`\b` before a credential name.** Underscore is a word character, so
  `rcon_password`, `db_password`, `auth_token` and `PGPASSWORD` never matched
  while `password` did. The names that had been thought about worked; the ones
  that had not were invisible.
- **A note excused the line.** `todo` is in the placeholder vocabulary and the
  excuse applied to the whole line, so the most likely line in any codebase to
  carry a hardcoded credential — the one somebody left a note on — was the one
  line passed over. `FIXME` was not in the list, which is the accident that made
  it visible. The excuse now applies to the value, as the vendor patterns always
  did.
- **A single-case value was never random enough.** Thirty-two lowercase hex
  characters is what an RCON password looks like. Accepted now when the value is
  hex or base32 and long enough, with `GIT_SHA` narrowed to the lengths git
  actually produces rather than every length between 7 and 40.
- **Unquoted assignments.** `export PGPASSWORD=…` is the shape `.env` files and
  shell scripts use.

**The cost of getting this wrong is a scanner nobody believes, so every widening
was measured against foreign code before it shipped.** The first attempt flagged
24 lines of `@babel/parser` — `tokens = file.tokens.map(…)`, because the name
allowance ran into `tokens` and the unquoted value swallowed an expression. The
second flagged looper's own `FRESHNESS_BYPASS`, because bypass ends in pass. The
shipped version allows a prefix only for names that are unambiguous, keeps bare
`pass` and `auth` behind a separator, and requires an unquoted value to end at
whitespace. Measured after: `node_modules` 22 files and 35,358 lines, `src` 89
files, `vendor` 87 files — **zero flagged in all three**, and in `tests/` only
the nineteen deliberate fixtures.

## Freshness: the gate that stops a rule set describing something else

Carried from the Rust predecessor on 2026-08-17, after checking what that
project had and looper did not. It was the only capability worth taking: looper
already had `map.toml` and `[governs]`, and used them to *choose* which rule
sets to inject. It never used them to notice one had gone stale.

The rule is one sentence. **If a commit changes files a rule set governs, and
does not change the rule set, the commit is refused.** Nothing checks a document
against the code it describes, so the commit is the only moment it can be
noticed — after it, the document quietly describes something that is no longer
there.

Two ways on, and both are a decision:

- update the document and stage it beside the change
- or write `Doctrine-freshness: <why>` on its own line in the commit message

The second is deliberately a sentence rather than a flag. "The rename does not
touch what this describes" is an argument someone can disagree with later; a
`--no-verify` is not. It is read from the message **body only** — a line git
will strip as a comment, or one below the scissors, is not a reason, and a
`Doctrine-freshness:` with nothing after it is not one either.

**A reference rots the same way doctrine does.** A key in `[freshness]` ending
in `.md` names a document directly rather than a rule set, so anything can be
watched. `STACK.md` claimed looper read one language for a day after it read
two, and nothing noticed — the gate only ever looked at `.looper/doctrine/`,
because that was the only kind of document it knew about. `STACK.md`,
`README.md` and `CONTRIBUTING.md` are watched now, each against the code that
would make it untrue.

**One map, two purposes, and they want opposite things.** Discovered by the gate
firing on its own author's next commit, two days after it was built. `[governs]`
exists for *injection*, where broad is right: pull the law branch whenever any
code is touched, so looper's own map says `law = ["src/**/*.ts"]`. Staleness
wants the reverse — a document only rots when the thing it describes moves, and
a gate that fires on every commit teaches people to write the bypass line
without reading it. So `map.toml` takes an optional `[freshness]` section with
its own, narrower globs, and falls back to `[governs]` when there is none. A map
written for the predecessor keeps working unchanged, because its branches were
domain-shaped and narrow already.

A branch named in `map.toml` with no document of its own is skipped rather than
refused. There is nothing there to go stale, and a project that has not written
its doctrine yet should not be blocked on every commit for it.

**Done when:** a governed change with an untouched rule set is refused and names
the branch, the file that triggered it and the document to open; the same commit
passes with the document staged; and it passes with a reason given. All three
run in `tests/freshness.test.ts`.

## Nobody is named, including in the check that names them

The canon ships to every adopter, so it carries no name belonging to a project
that adopted looper or to one it was built beside. `tests/canon.test.ts` has
enforced that since chunk 1, by holding a list of forbidden words and refusing
any canon file containing one.

**That list was itself the leak.** A public repository containing
`FOREIGN_VOCABULARY = ["…", "…"]` publishes exactly the thing the check exists
to keep unpublished — and does it in the one file a curious reader is most
likely to open, because it is the file that proves looper is generic.

The words are held as sixteen-character hashes now. The check tokenises each
canon file, fingerprints every word, and refuses a match. It still bites — a
line naming a project was added to `process.md` to confirm it, and the failure
named the word back. Nothing in the source spells any of them.

Everything else went with it on 2026-08-17: the last two mentions anywhere in
the tree, one in a doctrine heading and one in the constitution's index of rule
sets, both rewritten to say *prior work*. A scan for every name across the tree
now returns nothing.

**What deliberately stays.** `vendor/rust-law/` names the author of the engine
it copies, in its `LICENSE` and its `PROVENANCE.md`, and `PLAN.md` names them
where it argues the decision to vendor. 0BSD requires none of that. Removing it
would be erasing whose work it is to make a scan look tidy, which is a different
act from keeping an adopter's name out of a shipped rule set.

## What the canon was missing, and why only some of it could land

Read on 2026-08-17: every markdown file in the predecessor project, its own
canon, its project doctrine, and its docs. That project had already separated
generic from project-specific — its canon is ten branches — so the work was
choosing rather than extracting.

**Five principles were missing here and are worth having anywhere.** They are
now `src/canon/architecture.md`, and every one of them is a thing a model does
wrong unprompted:

- **State has one home and that home is the truth.** Models add a cache without
  being asked, then a reconciliation for the cache.
- **Absence is not an answer.** A value nobody gave you is not a value someone
  set to off. Conflating them lies in a way that looks like data, and it is one
  of the most common quiet bugs there is.
- **A component that refuses to act still has to say so.** A silent refusal and
  a silent success are the same thing from outside. This project found that
  failure in itself four separate times across two audits — findings 16, 17, 34
  and 37 — before reading it stated plainly in somebody else's doctrine.
- **What crosses a boundary is defined once**, and is parsed at the edge.
- **What a person looks at renders what it is told and decides nothing.**

**What did not land, and the reason is a hard ceiling rather than a judgement.**
A Claude Code hook may return at most 10,000 characters. The injection budget of
9,800 is not a preference — it is 200 under a limit nothing here controls, and a
test refuses any budget at or above it, because truncation the agent performs is
truncation looper cannot mark. **So the canon cannot grow. It can only be
chosen.**

**Measured on 2026-08-20 against Claude Code 2.1.236, because a number this
load-bearing should not rest on a document.** A `UserPromptSubmit` hook was made
to emit exactly N characters with a sentinel at each end, and the agent was asked
to quote the last thirty:

| characters emitted | what arrived |
|---|---|
| 500 | whole, both sentinels |
| 9,999 | whole, both sentinels |
| 10,000 | whole, both sentinels |
| 10,001 | **persisted to a file**, 2,000-character preview |
| 16,001 | persisted to a file |
| 30,000 | persisted to a file |

**The ceiling is exactly 10,000 and it is real.** `HOOK_OUTPUT_CEILING` is right.

**The limit is on what the hook writes in total, and a trailing newline is part
of it.** 9,999 characters followed by a newline is 10,000 bytes and arrives;
10,000 characters followed by a newline is 10,001 and does not. A hook that
prints its payload with `echo` spends one of the ten thousand on the newline.

What was not known is what crossing it costs, and it is far worse than
truncation. The output is not trimmed: it is written to a file and replaced with
a 2,000-character preview and a path — `k2r=2000` in the binary, the same
`persisted-output` machinery tool results use. **Overflow is near-total loss, not
a lost tail.** A constitution of 24,000 characters would have reached the agent
as 2,000 characters of itself.

So the ceiling was never enforced anywhere. `HOOK_OUTPUT_CEILING` existed only as
a constant a test compared the budget against, while the allocator emitted
required contributions whatever their size — and the constitution is required.
**An adopter whose constitution ran past the budget would have had it silently
replaced by a preview of itself, by the tool that exists to deliver it.** The
allocator now cuts to the ceiling itself and says so with the count, because
9,700 characters and a stated cut beat 2,000 characters and a file path.

Adding 1,050 characters meant finding 1,050 to remove, and the trade is the
record of what stopped earning its place:

| removed | why it stopped earning it |
|---|---|
| four anecdotes in `doctrine.md` | the mechanisms they argued for now exist — `canon.test.ts`, `plan-is-true.test.ts`, the budget test itself |
| "write the document while the work happens" and its detail | the freshness gate asks for exactly that, and asks why if it is missing |
| the softened-three-rules story | the principle survives; the evidence was five lines |
| the `node:child_process` story | same |
| "model the third state", "fail open and fail silent" | the canon now says both, and the project half never repeats the canon |

**Left on the table, deliberately.** Design tokens defined once and one-of-
everything-reused, from that project's interface doctrine: good practice, but a
model does not reach for the opposite as readily as it reaches for a cache.
Primary sources only, and a measurement written with its date and raw output:
already in this project's own doctrine, and not yet worth the always-on cost for
an adopter. Both are worth revisiting when something else stops earning its
place.

## The audit: seven passes, one pile

Everything here was built and tested by the same author, against fixtures that
author wrote, on the one repository that author controls. That is the weakest
possible evidence and it is worth saying plainly before any of it is trusted.
`TS-ERROR:4` reported eight problems here and six were its own false positives —
found only because it was pointed at real code rather than at its own fixtures.

The audit is chunked because an audit that runs everything at once produces a
list nobody clears. Each pass answers one question, and findings go to
FINDINGS.md. **A pass records; it never fixes.** Fixing as you go means auditing a
moving target, and the count at the end stops meaning anything.

### 1. Foreign code — the false positive hunt

Run the whole rule set over TypeScript nobody here wrote, at least a few thousand
lines of it. Every violation is a candidate `blunt` until judged one by one: is
this code genuinely wrong, or is the rule?

This is first because it is the only pass that can find what the others
structurally cannot. Every rule so far has agreed with its author, because its
author wrote both the rule and the code it was tested on.

**Needs a corpus, and there is none on this machine.** Any real TypeScript
project will do. Name it before starting.

### 2. Evasion — the false negative hunt

For each of the 23 rules, deliberately write code that breaks its spirit and
passes it anyway. Every success is a `wrong`. The consumer is an optimizer, so
this is the pass that tests the non-gameable property rather than assuming it:
a hand-rolled logger, a laundered value, a rule dodged one spelling over.

### 3. Failure modes — what happens when things are broken

Feed every component input it was not built for. A malformed `law.toml`, a
corrupt baseline, an unreadable file, an empty repository, a detached HEAD, a
merge in progress, a symlink loop, a 50,000-line file, a file that is not UTF-8.
Two questions each time: does it reach a wrong verdict, and can it wedge the
session? The second is worse. Every crash on the hook path is a `wrong`.

### 4. Scale — where it stops being acceptable

Generate projects of 100, 1,000 and 10,000 files and measure every moment: the
edit gate, the commit gate, `looper law`, the Stop hook. The slow pass is the
suspect, because it reads the module graph and nothing has ever bounded that.
Findings are `slow`, with the number and the size that produced it.

### 5. Messages — the audience bar

Every rule message read against the claim that it reads to someone who cannot
code. Mechanically checkable: every rule has at least one legal spelling, no
message contains an identifier from the engine, no message is longer than a
screen. The rest is reading them one at a time and asking whether a person who
has never seen a stack trace could act on it. Findings are `noise`.

### 6. Claims — the plan against reality

Every "Done when" in this document and every claim in a rule's `why`, checked
against a test or a run. Anything asserted and unproven is a `missing`. This is
the pass that catches "written is not delivered", which has happened three times
already and was found by accident each time.

### 7. Consolidation — the sweep, widened

The scan already run over function bodies, extended to repeated string literals,
whole files with the same shape, doctrine that says one thing twice, and exports
nobody imports. Findings are `noise`.

### Clearing the pile

Only after every pass has run. In severity order: `wrong`, then `blunt`, then
`missing`, then `slow`, then `noise`. A `blunt` outranks a `missing` because a
false positive gets the tool switched off and then nothing else matters.

## The licence, and what going public actually needs

**Resolved 2026-08-17: Zero-Clause BSD.** The brief was that anyone can use the
code exactly as they want, and 0BSD is the only common licence that means that
without a condition attached: use, copy, modify, distribute, sell, no
attribution, no notice to retain, nothing to carry.

MIT was the alternative and it fails the brief by one clause — it requires the
copyright notice to travel with every copy, which is a condition however small.
Apache-2.0 adds a patent grant and two more obligations. Neither is wrong; both
are more than was asked for.

There is a second argument that settles it here. `vendor/rust-law` is already
0BSD. Licensing looper the same way makes the whole repository one licence with
zero conditions, and removes any question about how the two interact — a
question a reader would otherwise have to answer before using it.

**What "ready" required, and what is done.** `LICENSE`, `README.md` and
`CONTRIBUTING.md` all exist, and a test refuses the suite if any of them goes
missing. `package.json` declares `0BSD` and a test holds it to the same licence
the file states. The vendored engine keeps its own `LICENSE` and
`PROVENANCE.md`, and a test refuses to let either be deleted — 0BSD obliges
neither, and shipping 3,900 lines of somebody else's work without saying whose
is a different thing from what the licence permits.

**The vendored engine is ours to fix. Settled 2026-08-18, and this reverses a
decision taken twice, so both halves are kept.**

The first answer was: change nothing. Five known gaps in the engine's rules were
left alone and written into `PROVENANCE.md`, on the reasoning that a diff against
somebody else's judgement is an argument re-won against every future copy. That
was narrowed the same week — plumbing here, rule logic upstream — when one
attribute in the settings reader took the whole Rust law down for any project
with a TypeScript entry point.

Both versions rested on something that turned out not to be true: that upstream
is a place work goes. Checked 2026-08-18 — the project has never had an issue
opened on it by anybody, and the one change this project sent, on 14 August, is
still open with no review and no comment. A policy that routes defects to a place
where nothing happens does not protect a copy; it parks the defects and tells
every contributor to go somewhere else with them.

So: **this copy is ours, and it is fixed here like any other file.** The licence
is 0BSD and permits it outright. Three things keep that honest. Every change we
make is listed in `PROVENANCE.md`, so whoever copies a newer lawkeeper in knows
what to re-apply. `tests/invariants.test.ts` fails if a re-copy silently drops
one. And the gaps that used to be filed as "upstream's" are open work in
`docs/FINDINGS.md`, counted like every other defect in what looper enforces.

The attribution stays. It costs a paragraph, the licence asks for nothing, and a
project whose whole claim is that it can be checked does not quietly absorb
somebody else's engine.

**And the two controls follow it.** The `contribution` rule set is mapped to
`vendor/rust-law/src/**` as well as our own rule files, so an agent editing the
engine is told what a rule change owes before it writes one. The CI check that
refuses a rule change with no cases reads that directory too, matched on what the
engine uses to judge rather than on any file being touched — a comment there
passes, a change to what it catches does not. Anything less would leave one half
of the law with looser rules than the other, which is how the old policy felt
reasonable in the first place.

**What was checked rather than assumed.** The repository was scanned for every
name that must not ship: no employer, no adopter, no personal path. The only
hits are `tests/canon.test.ts`, where those words are the blocklist that keeps
them out of the shipped canon, and `vendor/rust-law`, where a name is the
provenance. `.looper/doctrine/sources.md` was corrected in the same pass: it
said prior work is *"never a reference"*, which stopped being true the day the
Rust law was vendored.

**The one flag left.** `package.json` still says `"private": true`, deliberately,
so nothing can be published by accident before the decision is taken. A test
asserts it is still there and says to delete the test along with the flag. That
is the whole of the remaining work.

## Decisions taken

| item | decided |
|---|---|
| provenance | built from scratch; no code, artifacts, rule files or fixtures from any other project, and nothing wrapped |
| adopter specifics | never in this repo: an adopting organisation's architecture, vendors or product stay outside the plan and outside the canon |
| the pillars | no dead code, one source of truth, no fallbacks ever, verify everything, never fail silently, say it every turn |
| strictness | every pillar is a gate, and every gate has a visible concession path; a rule with no appeal gets disabled wholesale |
| audience | any team, any project; depth is detected from the repo, never declared, and what does not apply is silent |
| shape | container plus plugin capabilities, one trait |
| language | TypeScript on Node ≥ 22: the team can read it, and the measured hook tax is affordable |
| distribution | npm package, bundled single-file entry, no native modules |
| navigator | not built, and nothing is built on one |
| law engine | ours, one neutral engine with a language reader per language |
| law checker | not eslint: a project-configurable linter is not a law |
| stack | prescribed, not accommodated: one language, TypeScript, everywhere |
| stack picks | one tool per job, listed in STACK.md and argued under "The stack looper governs" |
| languages off the stack | governed shallowly by the language-agnostic capabilities; no law until tier B is earned |
| reader tiers | A (deep, scope-aware) covers the whole prescribed stack; B (CST, thinner) designed but deferred |
| coverage | TS, JS, JSX/TSX + React, Next, Node, Data packs; React Native free with React |
| parsers | `@babel/parser` for tier A, verified 2026-08-17; `web-tree-sitter` WASM for tier B if ever built |
| rule classes | constitutive (the language allows it by default, ships day one) and reactive (caught bypasses only) |
| the tie-break | where two readings are defensible, the stricter one wins — and it is usually the more decidable, which is what makes it robust rather than merely severe. Budget, convention and "a beginner would find this harsh" are not arguments |
| the rule table | derived 2026-08-17 from how TypeScript goes wrong: 12 carry unchanged, 14 rewritten, 1 dropped as a deliberate absence, 1 moved to `NODE`, 4 added, and everything that survives ships constitutive |
| the axis rules are judged on | precision, never severity: the agent pays severity in the same turn from the repair prompt, and only imprecision burns turns and teaches the law is noise |
| `TS-TRUTH:1` | full strength, every spelling, and it is the *more precise* reading — the judgment that could misfire only existed while the rule was being written leniently. The compliant path is always a statement, so no type knowledge is needed to recognise it |
| the sanctum | `config.ts`, matched by filename so a workspace package may each have one; a single name, never a list |
| comments | banned in full, and the case is stronger here than in a language read by people: the primary reader is a model, and a stale comment overrides the code for a reader who cannot check it |
| not the TS compiler API **for the fast pass** | 12× the load cost, and `typescript@7` has removed the syntax API. The slow pass is the opposite case and uses it |
| SQL | a tier A call-site rule, not a reader of its own |
| rule ids | namespaced per language reader, categories shared |
| layer maps | ship empty and inert, per language |
| rule sets | ship full, grow only on caught bypasses |
| law timing | edit-time repair prompt, a survey at install, a report when the agent stops, and commit-time refusal — four moments, none of them a person deciding to check |
| nothing behind a command | no gate waits to be invoked and no fact that must be seen waits in a command's output; the user cannot be expected to know a command exists, and cannot judge when running it would have helped |
| two passes | fast (one file, syntax, ~70 ms) and slow (whole project, types, seconds); one engine, one report format, a rule declares which pass it belongs to |
| why the slow pass | not mainly the floating promise: on a repo that already has code, the fast pass only ever sees the files the agent touches, so without it looper has no opinion about the work it was pointed at |
| type source | **none**: measured 2026-08-17, `typescript` is 23 MB and ships `_tsserver.js`, which requires the network modules. The slow pass walks the module graph with our own parser instead |
| how the slow pass reads packages | it parses the `.d.ts` files already in the project's own `node_modules`. A declaration file holds no runnable code, so reading one runs nothing and installs nothing |
| what the slow pass still misses | a promise reached through a value rather than an imported name, `db.query(...)` where `db` came from `new Pool()`. That needs the type of the receiver, which is where real inference begins |
| the baseline | `.looper/baseline.toml`, committed, per file and rule; covers untouched code only, so a violation on a touched line is never baselined; shrinks automatically, refuses growth, pushed rather than stored, and never confused with a pardon — it records debt, not permission |
| new files after adoption | judged in full from the first line; the baseline covers only what was already there |
| init on an occupied repo | merge, never clobber, and never report a file wired that was not |
| `core.hooksPath` | **never set by us, and never needed**: git runs `.git/hooks` with no configuration, verified. init writes into whatever directory git already looks in. An existing hook is never overwritten; the gate is reported not-wired and the one line to add is printed |
| what refuses a commit | only a verdict of block. Missing, broken or unreachable looper lets the commit through saying it was not checked — refusing on its own failure is the worst outcome a governance accessory has |
| self-sufficiency | the system finishes what it starts: if a step is needed for looper to work, looper does it. Printing an instruction is not shipping the feature |
| what earns a question | what the thing should do, what costs money, what cannot be undone — and nothing else. Never an implementation fork, in words with no jargon in them |
| concessions at depth 1 | closed. A valve assumes a reviewer and there is none; the agent finds the compliant path or keeps working, and never offers the user an exit it cannot judge |
| an undischargeable violation | our defect, recorded as one — never handed to the user as a technical decision |
| doctrine on an existing repo | **reversed**: proposed by the loop and ratified by evidence, not by a human. A reader who cannot read code either waves every rule through or never opens the file, so the gate is theatre either way |
| what ratifies an adopted rule | it fires on real code here, every instance is rewritten, the project still passes, and the evidence is recorded with it. Mechanical, so no opinion is needed |
| what an adopted rule may be | an instance of a shape the engine already knows, never new code — the moment a project can author rules, the optimizer edits the rules instead of the code |
| the return path | adopter agents report rules they cannot discharge; that is where the evidence for reactive rules comes from |
| git, never a git host | looper runs `diff`, `show`, `ls-files` and `diff-tree` and knows no hosting provider's name. GitLab, Bitbucket, Gitea, a bare repo with no remote: all identical. The return path produces a file; how it travels is the adopter's |
| who transports it | never looper, which stays socket-incapable; the adopter's agent, which already has network access and is already watched |
| what a report may carry | a minimal synthetic reproduction and the version, never the adopter's source, identifiers or paths; unminimisable means unsent |
| adopters install, never fork | a fork is N copies of a canon compiled in precisely so it cannot drift; forks are for people changing looper itself |
| written as if public | from now, whatever the repo's setting: it costs nothing, removes the retrofit, and reasoning aimed at a skeptical outsider is sharper |
| opening the repo | decided: it goes public, one repo, plan and scar log included. The case is verifiability — a tool hooked into every edit and commit should be auditable — and nothing in the plan is a moat. The switch waits for the law engine; the writing discipline does not |
| licence | undecided, required before the switch, and the one decision here that is legal rather than technical: permissive maximises adoption, an explicit patent grant is what corporate legal teams look for |
| the scar log in the open | stays, with one guard: an adopter incident is recorded as the construct and the rule, never the company, the codebase or the person |
| network | none, forever, checked at the socket layer in the resolved tree |
| secret detection | by shape, never by a list of names, because a list you choose cannot cover a vocabulary a vendor owns |
| what secrets scans | added lines in the staged diff, every file type, so adopting looper is not refused over history it did not write |
| recall is committed | a note nobody can see is a note nobody can correct, and a wrong one is believed. Shared is also where its value is. Reverses the prior art, which keeps it local |

## Assumptions stated in the open

- **Tier B is unverified and unbuilt.** Tier A is measured and stands.
- **The slow pass is unmeasured.** Which TypeScript compiler API answers "does
  this call finish later", on which version line, and what a whole-project read
  costs on a real repo are all assumed and none are measured. If the honest
  number turns out to be a minute rather than seconds on a large codebase, the
  slow pass stops being a commit gate and becomes an on-demand survey plus a CI
  step — which changes where it is wired, not whether it exists. Measured in
  chunk 2, before rules are written against it.

Three parts of the prescribed stack are asserted without confirmation, and each
would change a decision above rather than merely a detail:

- **Auth is assumed to already exist.** Any organisation with existing users has
  an identity system and it wins by default. Where a project is genuinely
  greenfield the pick is better-auth (TypeScript-native, Drizzle adapter) or a
  managed provider, and that decision is not taken here.
- **Deployment is assumed to be self-hosted infrastructure,** not a managed
  platform. It changes the API topology if wrong.
- **No CPU-bound work is assumed.** Node is excellent at I/O and mediocre at
  compute. Transcoding, media processing and heavy batch jobs are the honest
  case for keeping another language, and uniformity is not a good enough reason
  to move them.

## Traps recorded before they bite

- **`core.hooksPath` is single-valued.** Pointing it somewhere new silently
  disables everything the project already had. Write into the existing directory,
  never create a second, and never *repoint* one that is already set — init only
  ever sets it where it is unset, and only with the human's yes.
- **Skip is not merge.** A file that already exists and was left alone is a hook
  that never runs. Report the difference between wired and skipped, loudly.
- **The installed build is the gate.** A stale install runs yesterday's law with
  no symptom at all. `looper status` prints its own build identity and says when
  the source tree is newer than the build that is answering — but a stale build is
  precisely the case where nobody suspects anything is wrong, so nobody runs
  `status`, so it **pushes**: one line on the injection channel until it is
  resolved. A warning that waits to be asked for is not a warning. This is worse
  in npm than it would have been in Cargo, because a project can pin an old
  version in its lockfile and never notice.
- **Never put `npx` in a hook command.** It re-resolves on every invocation and
  would dwarf the entire measured budget. Hooks point at a resolved binary path.
- **The no-network invariant is harder in npm and must be enforced, not audited.**
  A dependency tree here is deeper than a crate graph and has postinstall scripts
  in it. Three measures, all required: keep the direct dependency count near zero,
  install with scripts disabled and audit anything that wants one, and assert at
  runtime that the network modules were never loaded. The runtime assertion is
  the one that actually holds, and it is stronger than the tree audit it replaces.
- **Node's startup floor is 18 ms and it is not ours to optimise.** Anything that
  wants to be cheaper than that has to not be a process, which is a real design
  option and not one we are taking yet.
- **A hook payload is data from outside.** Any path from one is resolved and must
  sit under the project root before it is touched.
- **Fail open, never closed,** everywhere except the law and the secrets gate,
  whose whole purpose is to block. Those two block only on a verdict they
  actually reached, never on their own failure. A governance accessory must never
  be able to wedge the session it was only supposed to watch.
- **Multi-language repos are the normal case.** A language reader that assumes it owns
  the repo will mis-judge the other half of it.

## Next step

Chunk 0, and inside it the merge path first: `init` against a repo that already
has an agent settings file with a foreign hook, proving the file comes out with
both hooks in it. That is property 2 in one test, and everything else in the
container is the proven part.

## Python, the third language, and the stack it brings

The condition chunk 7 set for any new language reader was that **an adopter
ships it**. Rust met that condition and got a reader. Python meets it now: an
adopter runs a Python service behind a TypeScript front end, and the same
repository carries both. The queue position is earned the same way, by the same
rule, and nothing about the argument is new.

What is new is that Python is the first language looper would read where the
language itself checks nothing. TypeScript has a compiler that catches a
misspelled field. Rust refuses to build. Python runs a file with a typo in it
until the line is reached, and then stops in front of whoever was using it. That
makes the law worth more here than in either of the others, and it also makes
every rule harder to write, because there is no type information to lean on — a
Python rule can only read the shape of the source.

### The reader costs nothing to install

The Rust engine is a compiled binary built with the `cargo` a Rust project
already has, and rebuilt when its own source is newer than it. The equivalent here is smaller: Python ships its own parser in the
standard library, as the `ast` module, so the reader is a script driven over the
same one-JSON-object protocol that `src/law/rust/drive.ts` already uses. No npm
package is added, so the dependency argument this document requires does not
arise — the resolved tree is unchanged and still cannot open a socket.

The one new external requirement is that `python3` exists. That is the same
condition the Rust half already lives under, and it takes the same answer: when
the engine is missing the gate says so by name and passes, rather than reporting
every `.py` file as clean or wedging the session. A repository with no `.py`
files never looks for it.

### The stack, argued one choice at a time

**The web framework is FastAPI.** Not because it is fastest, but because it emits
its OpenAPI description from the same objects that validate the request. That is
the property Zod was chosen for on the TypeScript side: one definition, and the
contract cannot drift from the check, because they are the same object.

**Validation is Pydantic, one model per concept.** It is what makes the previous
paragraph true, and it is the legal spelling the law hands back for data arriving
from outside. A rule that bans trusting an unvalidated request is only fair if
there is an obvious way to validate it.

**The database is PostgreSQL**, as everywhere else here.

**Database access is SQLAlchemy 2.0 with typed models.** This is the Drizzle
argument, unchanged: the schema is written in the language looper reads, so the
parser it already has can see it. An ORM whose schema lives in its own file
format is a wall the reader cannot see through. Migrations are Alembic, because
that is what these models already use.

**Logging is structlog.** This is load-bearing rather than a preference, for the
reason Pino is: the rule that a failure must be observed needs a named symbol
whose origin can be checked, or a local do-nothing function called `warn`
satisfies it.

**Errors are exception classes, one per failure.** The `thiserror` argument in
another language. `raise Exception("something went wrong")` names nothing, so
nothing downstream can act on it differently from anything else.

**Type checking is mypy, in strict mode.** Python is the one language here whose
types are optional, which means the setting is not a preference but the only
thing that makes an annotation mean anything. Where the TypeScript compiler
settings are part of the stack, this is the same decision.

**Tests are pytest. Formatting is Ruff, style only** — the law is not a linter,
and that boundary matters more here than elsewhere, because Python's linters have
historically tried to be both. **Packaging is `uv` with `pyproject.toml`**, and
the server it runs under is Uvicorn.

### The rules, named before they are written

Seven, taken from the failure shapes this document already listed. All seven are
built, as of 2026-08-18:

| rule | bans | state |
|---|---|---|
| `PY-ERROR:1` | a bare `except:`, and an `except` whose body does nothing — `pass` or `...` | built 2026-08-18 |
| `PY-ERROR:2` | answering a failure with a made-up value inside an `except` | built 2026-08-18 |
| `PY-ERROR:3` | `raise Exception(...)` and `raise BaseException(...)` | built 2026-08-18 |
| `PY-TYPE:1` | `# type: ignore` on a line, `# mypy: ignore-errors` on a file | built 2026-08-18 |
| `PY-TRUTH:1` | a default argument that is a mutable container | built 2026-08-18 |
| `PY-TRUTH:2` | `assert` outside a test file, whatever it is checking | built 2026-08-18 |
| `PY-LAYER:1` | `from x import *`, which takes every name without saying which | built 2026-08-18 |
| `PY-LOG:1` | `print`, and writing to `sys.stdout` or `sys.stderr` directly, in a file that does not say it starts the program | built 2026-08-18, from issue #63 |
| `PY-SECURITY:1` | handing the operating system a command built by pasting values into it | built 2026-08-19, from the table of what the law defends |
| `PY-SECURITY:2` | building a database query by pasting values into the text of it | built 2026-08-19, from the table of what the law defends |

`PY-TRUTH:2` is the one worth explaining, because it is the rule most likely to
be argued with. `assert` is not a check in Python; it is a check that disappears
when the interpreter is asked to optimise. A validation written with it works in
every test and is absent in production, which is the exact shape of failure this
whole document exists to refuse.

They shipped one at a time, cases first from each ban text, and each run over real
Python nobody here wrote before it counted as done. Naming all seven up front was
not a promise to build all seven; it was so the gap stayed visible while it was
open. It was open for a few hours, and the record of each is below.

**`TS-TRUTH:1`'s spread clause is wider than its reason, and three narrowings
were measured and thrown away. 2026-08-19, adopter issue #84.** The ban text said
"a spread merge over a defaults object". The code fires on any object literal with
two or more spreads, whatever is being spread, so `{ ...current, ...patch }` — the
immutable-update idiom, where neither operand is a defaults source — is refused.
Reproduced here from their probe.

**Told, not seen:** the 456 sites they were clearing, and that a settings read
falling back to `{}` was the worst thing that cleanup found. What was seen is the
probe rerun on this machine and the three attempts below.

Their suggestion is the obvious one — a defaults object is a constant or a literal
spread first, and spreading a parameter or a local is a copy. Each version of it
was measured against 1,122 files of npm's own JavaScript, where `main` reports
4,280:

| what was excused | hits | what it broke |
|---|---|---|
| the first spread names anything born inside a function | 4,231 | silenced `{ ...defaults, ...filtered }`, `{ ...defaultOptions, ...sanityCheckOptions }`, `{ ...config.defaultConfig, ...config }` |
| the same, but member expressions still fire | 4,235 | still silenced local `defaults` |
| only a parameter is excused | 4,269 | still silenced `{ ...defaultOptions, ...options }` and `{ ...defaultFS, ...fsOption }` |

Every one traded a false positive for a false negative **on the exact pattern the
rule exists for**. The last failed because a parameter-name set gathered across a
whole file is not a scope: one function taking `options` silences every
`{ ...options, … }` in the file. Doing it properly needs real scope resolution,
which this rule does not have and which is a different piece of work.

So the code is unchanged and the text is. The ban now says any object literal
spreading two or more things, and says plainly that this is wider than the harm
because looper cannot tell a defaults source from a copy. `instead` gains the
field-by-field spelling their own report landed on, and names `[exempt]` for a
file that is mostly copy-and-patch — one file, one rule, one line, which is what
that valve is for.

**What `PY-LOG:1`'s guard actually exempts, said out loud. Corrected 2026-08-19,
adopter issue #80.** The ban text read "in a file that does not say it starts the
program", which sounds like a claim about the file's role. It is a claim about one
token appearing anywhere in it: a file holding `if __name__ == "__main__":` is
exempt **in full**, including functions an importer can reach. Reproduced here —
a print two calls below the guard draws nothing.

**Told, not seen.** The counts are from the issue: 104 Python files there hold a
real guard, five of those are imported by other modules and print, 57 prints
between them. What was seen here is the probe rerun on this machine, which
reports nothing exactly as they said.

**The exemption stays, and the reason is theirs.** They traced every one of those
imports and **none reaches a printing function** — the importers take constants
and auth helpers, all silent. So there is a gap in what the rule can see and no
harm anybody can point at. The narrow alternative they offer, exempting only the
lines lexically inside the guard, would fire on the `main()` of essentially every
script that legitimately starts a program — blunt in the other direction, on a
problem that has not happened.

The precise version is reachability: a print is exempt when every path to it
begins at the guard **and** its function is imported by nobody. That needs a call
graph and an import map across the project, which the Python reader does not
build, and it is a different kind of analysis for a harm nobody has shown. It is
written here so the next person starts from the argument rather than the
surprise.

What was actually wrong was the text, and that is fixed: the ban says the file is
exempt in full and that the guard marks the file rather than the block, and a case
pins it so the decision is mechanical rather than remembered.

`PY-SECURITY:2` is its sibling, built the same day and the same way: the query
half of the same row. It mirrors `DATA:1`, whose precision comes from two
conditions together rather than one — the method is a querying one, `execute`,
`executemany`, `executescript` or `text`, **and** the text carries at least two
SQL words. A built string handed to something that merely happens to be called
`execute` is not a query.

**The corpus made this rule, twice over.** 574 files of Python's own standard
library gave **zero** hits, which tests that it is quiet and tests nothing else —
the standard library builds almost no SQL. So it was run over 3,217 files of
third-party packages under `/usr/lib/python3/dist-packages`, none unreadable,
which gave **eight**. Reading all eight found the rule was wrong about six:

```python
params = ", ".join(["?"] * len(message_ids))
cursor.execute(f"SELECT id, data FROM message WHERE id IN ({params})", tuple(message_ids))
```

That is the **correct** way to write `IN (...)`, which no driver takes as a
parameter: the f-string pastes only question marks and the values go through the
driver untouched. Five more pasted `str(int(id))`, which cannot carry SQL either.

So the rule gained the same boundary its sibling has, from the same principle:
**text from outside is the harm, and an integer or a `?` is not text from
outside.** A pasted part is followed back to what built it, and the rule stays
silent when every varying part is a number again or a run of placeholders.

With that, the same 3,217 files give **one hit and no false positives**:

```python
"DELETE FROM task WHERE id NOT IN ({})".format(
    ",".join([str(task.id) for task in except_tasks]))
```

`str(task.id)` with no `int()` around it — nothing there proves the value is a
number, and the repair is one word. That is a rule finding the one place worth
looking at rather than firing on a pattern. Nothing in this repo fires.

**The second corpus also found six more for `PY-SECURITY:1`**, all genuine: a
pager and an editor pasted into shells in `click/_termui_impl.py`, and
`os.system("mkdir %s" % path)` in an SFTP client where `path` is what somebody
typed at its prompt.

`PY-SECURITY:1` came next, on 2026-08-19, from the same table: TypeScript answers
"something from outside is used as an instruction" with four rules and Python
answered with none, in the language where `shell=True` is one keyword away and the
safe form needs the command split into a list.

It fires only where both halves are true: the operating system is handed a
**shell** — `os.system`, `os.popen`, `subprocess.getoutput` and
`getstatusoutput`, or `subprocess` called with `shell=True` — **and** the command
was **built by pasting**, which is an f-string with a value in it, a `+`, a `%`,
or `.format(...)`. A shell handed a line nobody outside wrote cannot be injected
into, so `os.system("ls -la")` is silent, exactly as `NODE:1` treats its literal.

**Ten cases, then 167 files of Python's own standard library: three hits, no false
positives**, each read in full:

- `pydoc.py:1724`, `os.system(cmd + ' "' + filename + '"')`, where `cmd` comes
  from the `PAGER` environment variable. The classic.
- `pydoc.py:1679`, `'more "%s"' % filename` pasted inside double quotes.
- `_osx_support.py:292` pastes a compiler path but hand-escapes it with
  `.replace("'", "'\"'\"'")` and carries a comment saying `subprocess` cannot be
  used during bootstrap. The rule names it correctly and a project would answer
  with a concession, which is what concessions are for — the escaping is the
  repair this rule's own advice calls a repair.

Three hits in 167 files is the shape of a rule that has found something rather
than a rule that fires on a pattern. Nothing in this repo fires.

`PY-LOG:1` came later, on 2026-08-18, from issue #63 rather than from the original
seven: the table of what the law defends showed that Rust and TypeScript both
answered "output is taken from whoever ran the program" and Python answered
nothing, in the language `print` is most reached for.

Two things had to be decided, and the corpus decided the second.

**What says a file starts the program.** There is no `package.json` to read for a
Python project, so the entry list `TS-LOG:1` leans on does not exist here. Python
has its own way of saying it, and the rule uses that: a file named `__main__.py`,
or a file holding an `if __name__ == "__main__":` block. Anything else is a module
somebody imports.

**Who chose the destination.** Thirteen cases, then the reader, then 167 files of
Python's own standard library, where it found 37 with none unreadable. Reading all
37 by hand turned up one class that is not this harm at all: `print(item, file=file)`
in `abc`, `traceback`, `getpass` and `optparse`, where `file` is a parameter the
caller supplied. The caller chose where it went, which is precisely what the rule
wants. `file=sys.stdout` and `file=sys.stderr` are the opposite — the module
choosing the terminal again — so those still fire. With that boundary the same
corpus gives **21, and all 21 were read one at a time and every one is a module
writing to the terminal**: `bdb`'s trace output and its two demo functions,
`this.py` printing on import, `socketserver` printing a traceback banner where no
logging setup can see it, `warnings` and `typing` naming stderr themselves.

Nothing in this repo fires: looper's own `read.py` and `skeleton.py` print only
under `if __name__ == "__main__":`, which is the shape the rule points at.

`PY-ERROR:1` went first because it is the shape with the least room to argue and
the clearest legal spelling. Twelve cases, then the reader, then two corpora
nobody here wrote: 167 files of Python's own standard library, where it found
348, and 176 hand-written files of an adopting project, where it found 51.
Fourteen of the standard library's were read line by line and every one is the
shape the ban text names. Several are considered decisions rather than
accidents — `except KeyError: pass` where the key is genuinely optional — and
that is what makes the legal spelling load-bearing rather than decorative:
`with suppress(KeyError):` says the same thing and names it, so the rule sharpens
the code instead of merely refusing it. The volume is high in the standard
library because that code predates `suppress`; the baseline is what carries it
for anyone adopting.

Corroboration worth recording: several findings in the adopting project already
carried `# noqa: BLE001`, which is Ruff's own blind-except rule being switched
off line by line. A second tool had already reached the same verdict and been
silenced, which is the failure mode a gate exists to prevent.

`PY-TRUTH:1` went second, and it is the quiet one. The same two corpora: 23
findings in 167 files of the standard library, **none at all** in 176
hand-written files of the adopting project. All 23 were read, not sampled, and
none is a misread. Seven are the idiom used knowingly rather than by accident —
a private sentinel compared by identity, a dict default that is deliberately the
cache, a list default capturing a value for a closure — and each of those has a
clearer spelling than the one it uses. That is the line this project draws: the
rule is judged on whether it is decidable and hands back a legal spelling, not on
whether every hit is a live bug.

`PY-TRUTH:2` is the one this document predicted would be argued with, and the
argument turned out to be about scope rather than substance. Two readings were
available: every `assert` outside a test file, or only those checking data that
came from outside. The second is not decidable from syntax, and the first has a
compliant path — `if amount <= 0: raise ValueError(...)` — so the first is what
shipped, under the rule that a stricter reading with a legal spelling is strict
rather than blunt. Test files are silent by path, on pytest's own discovery
rules, because that is where `assert` is the idiom.

Measured: 206 outside test files in 167 files of the standard library, and 4 in
176 hand-written files of the adopting project. All 4 were read. Two are
validations carrying a message, which is the harmful case exactly — they pass
every test and are absent under `-O`. Two narrow a type for the checker, which
`if x is None: raise` does honestly. The standard library's are mostly internal
invariants, the language's own documented use of `assert`, and they vanish under
`-O` no differently, which is why the rule does not try to tell the two apart.

`PY-ERROR:2` is a deliberate mirror rather than a fresh design. `TS-ERROR:3`
already bans answering a failure with a made-up value, and it carries two
exemptions worth copying exactly: a handler that uses the caught error is doing
something with it, and a handler returning the same shape the `try` block already
returns is being consistent rather than inventing. Both are reproduced, so the
two languages agree about what a fabricated answer is instead of drifting apart
one rule at a time.

Measured: 147 in 167 files of the standard library, 63 in 176 hand-written files
of the adopting project. Fourteen of the latter were read and all fourteen are
the shape — a missing key becoming an empty list, malformed XML becoming no rows,
an unreadable settings file becoming an empty dictionary, several already
carrying `# noqa: BLE001`. Two are worth naming: a command-line program that
prints the problem and returns exit code 2. The caller genuinely can tell, so the
rule owes that case a spelling rather than a refusal, and `raise SystemExit(2)`
is it — honest from anywhere in the program, and it does not pretend to be data.

`PY-TYPE:1` needed something the other four did not: a comment is thrown away by
the syntax tree, so the reader runs Python's `tokenize` beside `ast`. Both are in
the standard library, so the cost is still nothing. It is the quietest rule here
and the most clearly right — 1 finding in 167 files of the standard library, 8 in
176 hand-written files of the adopting project, all nine read, none a misread.
Prose that merely mentions the marker stays silent, because the check reads the
start of the comment rather than searching it.

The eight are each an annotation that has stopped being true while still reading
as though it were: a `Callable` assigned `None`, a union never narrowed, an
attribute the type does not declare. One is the optional-import idiom,
`ZoneInfo = None` under an `except ImportError`, and even that has an honest
spelling in `ZoneInfo: type | None`.

`PY-LAYER:1` is the quietest of all: 23 in 167 files of the standard library and
**none** in 176 hand-written files of the adopting project. All 23 were read and
every one is the same idiom — CPython pulling a C accelerator or a platform
module's names in wholesale, `from _heapq import *`, `from _socket import *`,
`from posix import *`.

One of them is the rule's own reasoning, in the wild. `datetime.py` has two star
imports, four lines apart: `_datetime` and then `_pydatetime`. The second
silently replaces names from the first, which is precisely what the rule says
happens and why nothing anywhere can say where a name came from. CPython does it
deliberately and can defend it; the point is that the shape is indefensible
anywhere it is not deliberate, and there is no way to tell those apart by reading
the file.

`PY-ERROR:3` closed the set, and it is where the stricter-reading rule did not
apply. Two readings were available: ban `Exception` and `BaseException`, or ban
`RuntimeError` with them. Measured first: `raise Exception` appears twice in 167
files of the standard library and not once in 176 files of the adopting project,
while `RuntimeError` appears 54 and 29 times. The tie-break says take the
stricter reading **where two are defensible**, and here they are not equally so.
The harm this rule names is that nothing downstream can act on the failure
differently, and that is exactly true of `Exception` — catching it catches every
other failure in the program — and not true of `RuntimeError`, which a caller can
catch on its own. The narrow reading is the accurate one rather than the weaker
one, and saying which of those it is matters more than the count.

Both of the standard library's are the shape: `raise Exception('verify: unknown
type %r')` in `enum.py` and one in `inspect.py`, each a "this should never
happen" that a named class would say better. This is the quietest rule of the
seven on mature code, and that is the point — its value is on code being written
now, where `raise Exception("something went wrong")` is what gets typed first.

What `PY-TRUTH:1` deliberately does not do is fire on every call in a default position.
`def f(t=datetime.now())` has the same underlying cause — the default is built
once at definition — but a rule that fires on every constructor would be blunt
where this one is decidable. That is a separate rule if it is ever wanted, and
naming the boundary here is cheaper than rediscovering it.

## The stack a project actually has, and refusing to grow it by accident

`STACK.md` in this repository is a **prescription**: what a new service should be
built from. It says nothing about what any given project already is, and neither
does anything else looper does. `looper init` on an existing codebase builds a
baseline of rule violations and never looks at what the code is written in.

That leaves a hole with a specific shape. An agent asked to add a job queue to a
Rust backend can reach for Python, because Python is what it knows best for that
job, and nothing anywhere says no. Nobody notices until there is a second runtime
to install, a second dependency file to audit and a second language nobody on the
team reads. The decision was never made; it was arrived at.

### What it is

A file the project owns, written by looper from what is actually on disk and
read back on every survey:

```
CURRENTSTACK.md
```

Grouped by **frontend** and **backend**, because that is the split looper already
computes — `shapeOf(root)` works out which half is the interface and which holds
data, and a rule about database queries already declines to fire on a user
interface. The document uses the same division rather than inventing a second
one.

It is Markdown because a person has to read it in a pull request and argue with
it. It is also machine-read, in a fixed table, because a document nothing parses
cannot gate anything, and this project does not describe barriers that are not
wired.

### Nobody types a command to get it

`looper init` writes it, and that is not enough. The person whose project this is
does not run commands — they talk to an agent, which is the whole premise looper
is built on, and every project that adopted looper before this existed would
never see the file. A rule that cannot fire without a document, and a document
only a command produces, is this project's own load-bearing-behind-a-command
failure wearing a new hat.

So the `Stop` hook writes it when it is absent, at the end of an ordinary turn,
and says out loud that it did. It is written once and never rewritten: after that
the file is the project's, and looper only reads it.

### Where it comes from, and what it never does

**Written from measurement, never from a guess.** `Cargo.toml` means Rust.
`package.json` means TypeScript or JavaScript, and its dependencies name the
frameworks. `pyproject.toml` or `requirements.txt` means Python. A `.py` file
with no manifest is still Python and is recorded as such, because the language is
a fact about the files whatever the manifest says. Nothing is written that was
not found: a project with no frontend gets an empty frontend section, not a
plausible one.

**It is a description, not a second prescription.** `STACK.md` says what looper
recommends. `CURRENTSTACK.md` says what this project is. A project on none of the
recommended stack still gets a truthful document, and no rule anywhere reads
`STACK.md` to judge a project by it.

### The rule it makes possible

`STACK:1` — a source file appears in a language the document does not list.

**Frameworks are recorded and not gated, which is narrower than this section
first said.** A new dependency is ordinary work and firing on every one of them
would be the blunt rule this project refuses to ship. A new *language* is a new
runtime, a new dependency file to audit and a new thing to read, which is a
different size of decision. The document names both; only the language is a
refusal.

The refusal is not "you may not do this". It is: **this is a decision about the
project, and it belongs in a file somebody can read in a diff.** The compliant
path is to add the language to `CURRENTSTACK.md` in the same commit, which takes
one line and turns an accident into a choice. That is the same shape as
`.looper/secrets.allow`: the gate does not forbid, it insists the decision be
visible.

Two things it must not do. It must not fire on a file that already existed when
looper arrived — the baseline covers that, and a project adopting looper is not
asking to be told its own history is wrong. And it must not fire on a test
fixture or a build script in a foreign language, which is why the rule reads the
language of *source* the project ships rather than every file on disk.

### Why a rule and not a note

A note in a document stops nothing. The whole argument of this project is that
only a mechanical check counts as a control, and the languages a codebase speaks
is exactly the kind of decision that gets made by accident at 4pm and lived with
for three years.

| rule | bans | state |
|---|---|---|
| `STACK:1` | a source file in a language `CURRENTSTACK.md` does not list | built 2026-08-18 |

### What building it corrected

Two things the design got wrong, both found by running it.

**A rule about which language a file is cannot live inside one language's
checks.** `STACK:1` first went into `CHECKS`, which only runs over TypeScript —
so it never saw a `.py` file, which is the entire case it exists for. It is a
pass over the file list now, beside the Rust and Python drivers rather than
inside either.

**The report silently swallowed it.** `Category` is a fixed union and `STACK` was
not in it. Nothing type-checks this repository — finding 75, still open — so the
invalid category was accepted, and the reporter, iterating a fixed order, dropped
every violation it produced without a word. A rule that fires and is never shown
is worse than a rule that does not exist. The category is added, and the reporter
now counts what it printed against what it was given and says so loudly when the
two differ, naming the unknown category and calling it looper's bug rather than
the reader's.

### DATA:2 fired on `.text()`, where its own answer has nowhere to attach

Adopter issue #86, from a browser-tour script. `.text()` on a library's own event
object — not an HTTP response — fired the rule, and three hand-written checks in
a row failed to silence it, because the only thing the rule forgives is a schema
parse. Reproduced here: all three shapes fire.

`.json()` and `.formData()` hand back an object whose fields you then trust, and
`OrderSchema.parse` is the answer to that. `.text()` hands back a string. Not one
of the harms in the rule's own `why` — a missing field, a number arriving as
text, an extra field written to the database — can happen to a string, and the
`instead` cannot be applied to one. `text` was in the list because it is a Fetch
body method, not because using its result causes the harm the rule describes.

Measured on 1,177 files of npm's own JavaScript, 2026-08-19. Before: **42 hits**.
After: **41**. The single hit lost is
`for (const line of (await res.text()).trim().split('\n'))` — text split into
lines, no fields, and no schema that could be attached to it. It was a false
positive too. All 42 were judged by hand; every one of the remaining 41 is a
genuine body read.

**`JSON.parse` was measured as a replacement and rejected.** A shape does arrive
from outside when text is parsed, so adding it looked like the stricter reading.
On the same corpus it fires **38 times**, judged by hand: about ten are the
program reading its own `package.json` or config off disk, and two are
`JSON.parse(JSON.stringify(x))` used as a deep copy. The rule cannot tell where
the text came from, so it would fire on a program reading its own files. Blunt,
not strict — it does not ship.

The unchecked-string harm is real and is not this rule's: pasting one into a
query is `DATA:1`, into a shell command is `NODE:1`, and both are origin-blind
already.

### `looper report` named a statement and showed the one inside it

Same issue. `if (kind !== "error") return` on one line reported `ReturnStatement`
and nothing else — the whole shape, useless to argue with. Both readers kept the
**last** node found starting on that line, and both walks visit the parent first,
so the innermost statement always won. The TypeScript one was even called
`smallest` while doing it. Both now keep the first, which is the outermost, and a
test in each language proves it by failing without the fix.

### REACT:2 asked for a name React itself does not want

Adopter issue #87, from a Next.js console with 31 `REACT:2` sites. Four effects,
all with `[]`, differing only in what the body reads: only the one reading a
module-level `const` fired. Reproduced here exactly — their probe now fires on one
line, the effect reading a prop with `[]`, which is the real thing.

`boundInThisFile` gathered every declared name in the file, module scope included.
A `const` made once at module scope cannot change between renders, so it cannot
make an effect stale, which is the entire harm the rule's `why` names. Listing it
changes nothing at runtime. React's own `exhaustive-deps` does not ask for it.

This one mattered more than an ordinary false positive, and the reporter said so:
it is the rule whose wrong fix hangs the page. The rule's own `instead` admits it
— *"if listing it causes a loop, the fix is what the effect does, not a shorter
list"*. Pointing a reader at that change for a value that never varies is worse
than saying nothing.

**Only `const` is excused, which is stricter than React's own tool.**
`exhaustive-deps` excludes everything declared outside the component. A module
`let` can be reassigned, and React does compare listed values at render, so a
module `let` stays judged. A name declared at module scope *and* inside any
function in the same file also stays judged, because looper cannot tell which one
an effect is reading.

Measured on 4,015 files of the JavaScript bundled with an editor, 2026-08-19.
Before: **19 hits**. After: **15**. The four that went quiet are all one shape —
`defaultCoordinates`, `defaultMeasuringConfiguration` and `defaultData`, module
`const`s in `@dnd-kit`, two of them `Object.freeze`d. All four judged by hand;
all four false positives. Of the 15 that remain, **7 carry the library's own
`eslint-disable ... exhaustive-deps` on the same line**: React's tool flagged them
too and the library chose to suppress them.

**Two of this rule's own tests asserted the false positive** and were corrected.
Both used `const userId = 1` at module scope as the thing left out. A test written
to agree with the code can only agree with the code, which is the reason cases are
written from the ban text first. The corrected tests leave out a prop instead, and
a new test pins the module `const` as silent with the issue number in its message.

### REACT:2 read TypeScript types as if they were values

Follow-up on adopter issue #87, after the module-`const` fix landed. They reported
`REACT:2` had gone 31 → 21 in their console but three sites survived that they
could not reproduce in isolation after ten probes, and — the part that cost them —
**no name could be added that satisfied any of them**.

Run against the real files, the rule names what it thinks is missing:
`Section`, and `Set` twice. A TypeScript type and a JavaScript global. Neither can
be a dependency of anything.

`gather` walked every key of every node, so a declaration's **type annotation** was
read as if it declared values. `(at: Section, held: Set<Section>)` yields
`at, Section, held, Set, Section`. Any effect body mentioning one of those names
then fired, with nothing to add. `gather` now skips `typeAnnotation`,
`typeParameters`, `typeArguments` and `returnType` on both sides of the question,
because a type does not exist at runtime and cannot change between renders.

Two more of the same class came out of the same measurement.

**A `catch` binding inside the effect was not counted as declared there.**
`declaredWithin` knew about variable declarators and function parameters, not
`CatchClause`. So `catch (cause) { report(cause) }` inside an effect fired on
`cause` whenever any other function in the file happened to have a `cause`
parameter.

**A parameter of one function made a global unarguable in another.** The rule
gathered every binding in the whole file into one set, so an effect using
`typeof window` fired because a different callback, 113 lines away, took a
parameter named `window`. The same failure that was measured and rejected for
`TS-TRUTH:1` — a set of parameter names gathered across a file is not a scope.
Here it is fixed rather than worked around: the rule now descends the tree
carrying the names visible at each point, adding a function's own parameters and
its own body's declarations on the way in and stopping at each nested function
boundary. `boundInThisFile` and the module-`const` special case are both gone —
a module `const` is simply not in scope, which it never was. A module `let` stays
judged, so it is seeded at the top.

Measured 2026-08-19. On 4,015 files of the JavaScript bundled with an editor:
**15 before and 15 after**, unchanged — that corpus is compiled JavaScript with
no annotations, so it could not have caught this and did not lose anything to it.
On the 4,062-file workspace that filed the issue: **34 → 23**. Every one of the
11 silenced was judged by hand — eight type names (`Section`, `Set` twice,
`WinState`, `AutoPlan`, `Book` twice, and `spend`, which is only ever a property
name inside a type literal), and three `catch` bindings. One further finding kept
firing but changed the name it reports from `window` to a real component value.
All 23 that remain name a value declared in the component.

### A rule that says something is missing now says what

The reason this took ten probes is in their words: *"there is no name I can add,
which means a reader has nowhere to go."* A `REACT:2` finding named a file and a
line. The shape from `looper report` is depth-limited, so the names were truncated
out of it, and they correctly read the shape as containing nothing that could be a
dependency.

`Finding` and `Violation` gain an optional `said`, and the report prints it beside
the place: `src/C.tsx:4 (userId)`. Only `REACT:2` sets it so far. This is the
canon's rule about a refusal naming the route that is open, applied to the one
rule where the reader cannot work the route out from the line alone.

### The Rust half was never checked for network, and never carried its own crates

The no-network invariant was held by `tests/invariants.test.ts`, which greps our
own TypeScript and `node_modules`. **It said nothing at all about the Rust half.**
Eighteen crates were resolved from `Cargo.lock` and nothing in the repository
looked at what they contain, so a future dependency that could open a socket would
have arrived unremarked.

Two separate questions, and they had different answers.

**Can it open a socket?** No, and now it is checked. `TcpStream`, `TcpListener`,
`UdpSocket`, `socket2` and `libc::socket` appear in **zero** files across our own
Rust and all eighteen crates. `serde` does reference `std::net`, and that is
deliberately not banned: it implements `Serialize` and `Deserialize` for
`SocketAddr`, `SocketAddrV4` and `SocketAddrV6`, which parse text into a struct
and cannot connect to anything. The types that connect are the ones banned.

**Can it build without a network?** It could not — not honestly.
`cargo build --offline` never reaches out, but the crate sources were not here, so
the build read whatever was in the machine's `~/.cargo/registry`. On a machine
without one, `--offline` means the build *fails*, and that unstated precondition
was the whole of our claim to being network free.

All eighteen crates are now in the repository under `vendor/rust-law/vendor`, with
`vendor/rust-law/.cargo/config.toml` pointing cargo at them. **13 MB, 780 files.**
That is the price, it is permanent in the history, and it buys the thing the
product rests on: proved on 2026-08-19 by building with `CARGO_HOME` set to an
empty directory — `Finished release profile in 15.02s`, binary produced, nothing
fetched.

Three tests hold it, and each was run against a broken tree first:

- a planted `use std::net::TcpStream;` in the Rust half fails the socket test
- a planted `reqwest` entry in `Cargo.lock` fails the crate-list test
- hiding `vendor/syn` fails the carries-its-own-crates test

The crate list is now a fixed set of eighteen names. A nineteenth fails the suite
until it is argued for here, which is what the canon already asks of every
dependency and could not previously be enforced on this side.

**What is still true and worth stating.** Three build scripts — `serde`,
`serde_core` and `quote` — run `std::process::Command` to ask `rustc --version`.
That is a program starting, not a socket opening, and it happens at build time
rather than on an edit. It is named here so nobody re-discovers it and reads it as
a network call.

### The README no longer points at the vendored engine's provenance

The `## Licence` section ended with a paragraph naming `vendor/rust-law` as
somebody else's work and linking `PROVENANCE.md`. It is gone from the README.

The credit itself stays and was not the thing being removed: `LICENSE` and
`PROVENANCE.md` sit in `vendor/rust-law` where anyone opening that directory
finds them, `CONTRIBUTING.md` points a contributor at the change log because that
is the reader who needs it, and `tests/invariants.test.ts` still fails if either
file is deleted. What went is a pointer on the front page to a subdirectory's
paperwork — the first screen of a public repository is for what the tool is, and
0BSD asks for nothing there.


## C#, the fourth language, and the Razor half nobody was reading

The condition chunk 7 set for any new language reader was that **an adopter ships
it**. Rust met it, then Python. C# meets it now: an adopter runs an ASP.NET Core
service with a Blazor interface, both in one repository, and the interface is
683 C# files and 96 Razor files.

### What the adopter's own CURRENTSTACK.md said

looper was installed there on 2026-08-19 and wrote this without being asked:

| half | languages |
|---|---|
| Backend | JavaScript, 27 files. Python, 19 files |
| Frontend | *Nothing found* |

A Blazor application, and looper reported no interface at all and no C#
anywhere. `.cs` was already in `A_LANGUAGE_BY_EXTENSION` and had been since
before any of this, but `walkProject` filters to `JUDGED_EXTENSIONS` first, so
the entry was unreachable — the name existed and nothing could ever reach it.
That is the whole argument for the change in one measurement: the stack gate and
the law are not two doors, and a language listed in one but absent from the other
is listed nowhere.

### Roslyn costs three packages, and they are vendored

The Rust engine is a compiled binary built from crates vendored beside it. This
is the same arrangement: `Microsoft.CodeAnalysis.CSharp` and its two
dependencies sit under `vendor/csharp-law/vendor` as `.nupkg` files, and
`NuGet.config` clears every remote source so the build cannot reach past them.
Checked by restoring into an empty package folder with no source available:
it succeeds, so the vendored copies are complete rather than merely present.

Roslyn also ships inside the .NET SDK, which would have cost nothing at all. It
was not used: referencing an SDK's internal assemblies is unsupported and breaks
between patch versions, and a reader that stops working when somebody updates
their toolchain is worse than one that costs 25MB.

### Razor is read as C#, and only the half that is code

A `.razor` file is markup with `@code { }` blocks in it. The blocks are judged;
the markup is not. Rather than compute an offset, every line outside a block is
replaced by an empty line and the `@code {` line becomes `class __Razor {`, so
the line count never changes and a reported line is the line somebody opens.
`tests/csharp-cases.test.ts` pins that with a Razor file whose only fault is on
line 7.

The markup is a real gap and is recorded as one: a `catch { }` written inside an
`@onclick` expression is not read. `audit/csharp-cases.ts` carries that as a
case expecting silence, so the limit is written down rather than discovered.

### Four rules, each with a count behind it

Measured on 2026-08-19 across the adopter's API, web and shared projects — 683
C# files and 96 Razor files:

| rule | bans | found | disposition |
|---|---|---|---|
| `CS-ERROR:1` | a `catch` whose body is empty and which names nothing | 429 | built 2026-08-19 |
| `CS-ERROR:3` | a `catch` that names nothing and answers with an invented value | 98 | built 2026-08-19 |
| `CS-ERROR:4` | a `catch` that names nothing and never looks at what it caught | 108 | built 2026-08-19 |
| `CS-LOG:1` | `Console` outside the file that starts the program | 551 | built 2026-08-19 |
| `CS-SECURITY:1` | a query built by pasting values into its text | 72 | built 2026-08-19 |
| `CS-ERROR:2` | `throw new Exception(...)` — the failure type that says nothing about itself | 67 | built 2026-08-19 |
| `CS-TRUTH:1` | `async void` on a method that is not an event handler | 25 | built 2026-08-19 |

**190 of the 429 swallowed catches are inside `.razor` files**, which is the
number that decided Razor was worth reading rather than skipping.

A regex over the same files finds 110 swallowed catches where Roslyn finds 257
in `.cs` alone. The difference is entirely `catch` blocks holding a comment and
`catch` blocks written across more than one line. That gap is why this is a
parser and not a pattern.

### Run over code nobody here wrote, which changed a rule

Two third-party codebases, cloned 2026-08-19: **Newtonsoft.Json** at `09bb545`
and **MudBlazor** at `56f4cc0`. Together 4,102 files and 493,083 lines, neither
written by anyone involved here. MudBlazor was chosen for the second reason as
well: 2,002 `.razor` files, so the Razor half was judged on somebody else's
components rather than only on the adopter's.

**`CS-ERROR:1` was wrong and the foreign code is what showed it.** As first
written it fired on any empty `catch`, and it found 51 across the two
repositories. Classified by hand, 32 of those named exactly which failure they
were ignoring — `catch (JSDisconnectedException) { }`,
`catch (Exception error) when (IsExpectedCancellationException(error)) { }`.
Only 19 named nothing.

That is the same act `PY-ERROR:1` already calls legal in the other direction:
its own `instead` list offers `with suppress(FileNotFoundError)` **because it
names what is ignored**. A rule cannot accept that reasoning in Python and refuse
it in C#. The rule now fires only on a bare `catch`, on `catch (Exception)` and
on `catch (SystemException)`, and stays silent when one failure is named or a
`when` filter names it.

What the narrowing did to each codebase says something on its own:

| | before | after |
|---|---|---|
| Newtonsoft.Json | 9 | 5 |
| MudBlazor | 42 | 14 |
| the adopter | 454 | 429 |

The libraries lost two thirds of their hits and the adopter lost six percent.
Careful third-party code names what it ignores; this codebase mostly does not.
Had the rule shipped as first written it would have fired on 32 deliberate uses
in reviewed code, and the first thing any of those maintainers would have done
is switch it off.

**A line number was also wrong, in a way only long files show.** `CS-TYPE:1`
(refused four days later on measurement — the chunk below has it, and this
paragraph is kept because a reversed decision keeps both halves)
reported the line where a `!`'s expression *began* rather than the line holding
the `!`. In MudBlazor's tests a reflection chain spans three lines with a `!` on
two of them, and both were reported against the first. Thirteen hits pointed at
a line with no `!` on it. It now reports the operator's own token, and
`tests/csharp-cases.test.ts` pins that with a three-line chain expecting 5 and 6.

**After both fixes, every hit was checked against the line it names.** All 1,888
across the two foreign repositories and the adopter land on a line that actually
holds the thing the rule bans, and 4,881 files produced nothing unreadable.
`CS-ERROR:1`, `CS-ERROR:2` and `CS-TRUTH:1` were judged one hit at a time — 19,
55 and 12. `CS-TYPE:1` has 1,071 and was checked by machine against the line
text rather than one at a time, which is the one place below the standard this
document asks for, said out loud rather than left to be assumed.

### What is not built

`--shape`, which the Rust engine answers and the `report` flow uses. It returns
an error naming itself, rather than an empty shape that would read as an answer.
It waits until the rules here are accepted and the shapes `report` asks for are
known.

Seven further rules were drafted and are not here: the made-up value returned
from a `catch`, the unawaited `Task`, interpolated SQL, the unobserved failure,
the stray `Console.WriteLine`, `#pragma warning disable`, and a layer crossing.
They were left out because a first reader is already a large change, and each of
those wants its own counted evidence rather than a place in somebody else's
paragraph.

## The other seven, of which three do not exist

The first C# chunk listed seven rules held back for want of counted evidence.
Going after all seven produced four rules and three refusals, and the refusals
are the more useful half.

Two codebases were added to the corpus for this, because a JSON library and a UI
library have no database layer and could say nothing about a SQL rule:
**Dapper** at `c0b2097` and **dotnet/eShop** at `ae71a06`, cloned 2026-08-19.
Five codebases in all.

### Built

| rule | Newtonsoft | MudBlazor | Dapper | eShop | the adopter |
|---|---|---|---|---|---|
| `CS-ERROR:3` the invented answer | 0 | 1 | 2 | 2 | 98 |
| `CS-ERROR:4` never looks at what it caught | 7 | 6 | 4 | 1 | 108 |
| `CS-LOG:1` `Console` outside the entry point | 275 | 26 | 22 | 2 | 551 |
| `CS-SECURITY:1` a query built by pasting values in | 0 | 0 | 12 | 0 | 72 |

### Refused, and why the refusal is worth more than the rule

**The unawaited `Task` cannot be judged without types.** Written to fire on a
call whose name ends in `Async` and is used as a statement, it found 73 in
MudBlazor and 56 in the adopter — and **48 of each were `InvokeAsync`**, the
Blazor callback every component uses and deliberately does not await. The reader
parses one file at a time and has no compilation, so it cannot tell a
`Task`-returning call from any other method whose name happens to end that way.
A rule that goes by the name catches the convention, not the defect.

**`#pragma warning disable` is not the rule its sibling is.** `PY-TYPE:1` bans
`# type: ignore` — silencing the *type checker*. Across Newtonsoft and MudBlazor
there are 169 pragmas and **not one silences a nullable warning**: 109 are
`CS0618`, an API marked obsolete, and the rest are trimming, XML documentation
and analyzer style. Narrowed to the nullable warnings it would be honest and
would have zero instances anywhere measured. Either way it ships on nothing.

**The layer crossing has nothing to measure.** `RUST-LAYER:1` does nothing when
`law.toml` declares no layers. The adopter has no `law.toml` at all and neither
foreign repository declares layers, so there is no codebase in which the rule
could be observed either firing or staying quiet.

### The same finding, four times

`CS-ERROR:1` was narrowed because 32 of 51 empty catches named the failure they
ignored. Going after `CS-ERROR:3` and `CS-ERROR:4` produced it again: 15 of 20
invented answers, and most of the unobserved catches, were
`catch (SpecificException) { return false; }` — the `Try` shape, where `false`
is the answer and the type is the explanation. Both rules took the same gate,
and `MudBlazor` fell from 14 to 1 and from 30 to 6.

Newtonsoft's `ConvertUtils.cs` added the fourth: `catch { value = null; return
false; }` inside `TryParse`, which is the pattern the .NET framework itself
uses. A method named `TryX` returning `bool` is now exempt from both rules.

**In C# the whole ERROR family needs one exemption, not three.** Naming the
failure is what separates a decision from a silence, and it is worth stating once
here rather than rediscovering it on the next rule.

### Two more line numbers were wrong

`CS-TRUTH:1` reported the line of a method's attribute rather than the method:
Dapper's `MiscTests.cs` has `[Fact]` above `public async void`, and the report
named the `[Fact]`. It now reports the method's own name token.

`CS-SECURITY:1` read `$"Select {item.Name}"` — an accessibility label in
MudBlazor's tests — as SQL, because `select` alone was treated as enough. It now
needs `select` and `from` together.

Both were caught by reading every hit against the line it names. Across all five
codebases — 5,768 files and 3,438 hits, measured 2026-08-19 — every one lands on
a line holding what the rule bans, and nothing was unreadable.


## Choosing a corpus, and the rule it refused

`CS-ERROR:1` was narrowed by running it over somebody else's code. That worked,
so the corpus was asked a harder question: **is it actually good code?** Two of
the four were a serialiser and a UI library, and `Newtonsoft.Json` — the one
leaned on hardest — has no `.github/CODEOWNERS` at all. It is one person's
library. Nothing there was chosen; it was reached for.

### Three things that can be checked, instead of a reputation

- **Enforced review.** `.github/CODEOWNERS` is 4,877 bytes in `dotnet/runtime`
  and 5,632 in `bitwarden/server`. It is absent in `Newtonsoft.Json`. This is a
  file, not an opinion.
- **What it costs to be wrong.** `bitwarden/server` is a password manager and
  `dotnet/runtime` ships to every .NET machine. Neither takes a careless merge.
- **The same kind of code.** This was the gap. A serialiser, a UI library and a
  micro-ORM are not ASP.NET Core applications, and the adopter is one.
  `bitwarden/server` and `jellyfin` are, and they agree with the runtime — so the
  result is not an artefact of comparing an application against libraries.

Four codebases were added on 2026-08-19: `dotnet/runtime` at `77c175b` (four
libraries under `src/libraries`), `dotnet/aspnetcore` at `42e0847` (`src/Http`,
`src/Mvc`, `src/Security`), `bitwarden/server` at `5f3c0b6` and `jellyfin` at
`1722105`. **Eight foreign codebases, 3,602,115 lines.**

### Hits per thousand lines, measured 2026-08-19

| | kloc | ERROR:1 | ERROR:3 | ERROR:4 | LOG:1 | ERROR:2 | SEC:1 | TRUTH:1 | TYPE:1 |
|---|---|---|---|---|---|---|---|---|---|
| dotnet/runtime | 148 | 0.01 | 0.01 | 0.00 | 0.00 | 0.01 | 0.00 | 0.00 | 5.12 |
| dotnet/aspnetcore | 676 | 0.01 | 0.01 | 0.01 | 0.00 | 0.06 | 0.00 | 0.00 | 2.04 |
| bitwarden/server | 1884 | 0.01 | 0.01 | 0.00 | 0.04 | 0.05 | 0.00 | 0.04 | 1.13 |
| jellyfin | 339 | 0.03 | 0.06 | 0.01 | 0.01 | 0.00 | 0.01 | 0.05 | 1.96 |
| Dapper | 26 | 1.50 | 0.07 | 0.15 | 0.82 | 0.07 | 0.45 | 0.04 | 9.32 |
| MudBlazor | 303 | 0.05 | 0.00 | 0.02 | 0.09 | 0.06 | 0.00 | 0.04 | 2.58 |
| Newtonsoft.Json | 193 | 0.03 | 0.00 | 0.04 | 1.42 | 0.19 | 0.00 | 0.00 | 1.49 |
| eShop | 28 | 0.04 | 0.07 | 0.04 | 0.07 | 0.28 | 0.00 | 0.25 | 1.87 |
| **the adopter** | 325 | **1.32** | **0.30** | **0.33** | **1.69** | 0.21 | 0.22 | 0.08 | **0.65** |

**A rule worth having is quiet where the review is hardest and loud where the
work is needed.** Six are: `CS-ERROR:1` is fifty to a hundred and thirty times
rarer in the reviewed code, `CS-ERROR:4` thirty-three times, `CS-LOG:1` forty.
`CS-SECURITY:1` is silent everywhere except `Dapper`, which is a SQL library, and
that is the rule working rather than failing. `CS-TRUTH:1` is quiet everywhere,
including here — it is the weakest of the six and is kept because `async void`
is not arguable, not because the numbers made a case.

`CS-ERROR:2` is the flat one: 0.00 to 0.28 across the corpus against 0.21 here.
`throw new Exception` is a habit everywhere rather than a fault of this codebase.
It stays, because a universal habit is still the thing the rule describes, but it
will not shrink anyone's list much.

### CS-TYPE:1 is refused, and it was already shipped

**Every one of the eight uses `!` more than the adopter.** `dotnet/runtime` —
written by the people who put `!` in the language — uses it **eight times more**,
and `Dapper` fourteen times more. The adopter is the lowest of all nine at 0.65.

That is the opposite of the signature every other rule here has. A rule cannot
claim to find a defect that the most carefully reviewed C# in existence commits
most often; what it has found is an idiom. It is removed from the law, from the
cases, from the engine and from `src/canon/csharp.md`.

**It had already shipped in the first C# commit**, before there was a corpus to
check it against. Four codebases would not have caught it either — the four-way
table showed 1.49 to 9.32 against 0.65 and the inversion was already visible
there, and it was read as "loud everywhere" rather than as "backwards". Adding
codebases is not what found it. Asking whether the corpus was any good is.

### Narrowing it was tried first, and there is nowhere to narrow to

Removing a rule is worse than fixing one, so before it went, every sub-shape of
`!` was counted on 2026-08-19 across `.cs` files only, so nothing turned on Razor
markup being parsed as C#.

| | `!` | `= null!` | `call()!` | `a.b!` | `x!` | in tests | chained |
|---|---|---|---|---|---|---|---|
| dotnet/runtime | 763 | 4% | 12% | 29% | 48% | 1% | 2% |
| dotnet/aspnetcore | 1381 | 7% | 13% | 24% | 33% | 37% | 2% |
| bitwarden/server | 2125 | 15% | 10% | 38% | 15% | 75% | 5% |
| jellyfin | 665 | 15% | 16% | 39% | 25% | 32% | 7% |
| Newtonsoft.Json | 288 | 0% | 23% | 39% | 34% | 0% | 11% |
| the adopter | 174 | 3% | 12% | 56% | 24% | 7% | 6% |

Five narrowings, five refusals. **Only outside tests**: Newtonsoft is 0% tests and
the runtime 1%, so both still fire. **Only chained `a!.b!`**: Newtonsoft 11% and
jellyfin 7% against the adopter's 6% — the adopter is below both. **Only
`= null!`**: bitwarden 15% against 3%, so the adopter does it least. **Only on a
member access**: the adopter's 56% is the highest, but Newtonsoft and jellyfin
are at 39%, a gap of 1.4 against the fifty to a hundred and thirty the six kept
rules show, which is noise. **Only on a bare identifier**: the runtime is at 48%
against 24%.

There is no shape of `!` the adopter uses more than carefully reviewed C# does.
A narrower rule needs somewhere it earns its place and the measurement says there
is nowhere, which is why this is a removal rather than a rewrite.

`<Nullable>enable</Nullable>` stays in STACK.md. The setting is worth having and
the gate on its escape hatch is not, which is a distinction the rest of this
document should probably be asked about more often.
||||||| 4bc7aa8
### `looper law` and the gates answered the same question two different ways

Adopter issue #94. `looper law` called a problem written one minute ago
pre-existing, and exited 0, while the commit gate on the same file refused it.
The command a person runs to check their own work gave the reassuring answer.

They read the cause as a count comparison letting anything under the recorded
number through. It was worse than that: **no count was compared at all.**
`againstBaseline` asked one question — is this rule recorded for this file — and
called every hit of a recorded rule older, however many there were and whenever
they were written.

The gates never made that mistake because they ask a second question:
`separate` and `judgeStaged` also check whether the violation sits on a line you
changed, from the staged diff. `looper law` had no line information at all, so it
could only ask the first half.

Two decision procedures for one question, and the one a person runs was the weaker
half of the other. There is now one: `againstBaseline` takes a
`LinesYouTouched` lookup and makes the gate's decision. `separate` is deleted and
the edit gate calls `againstBaseline` with the lines it already had.
`looper law` passes `linesChangedSinceHead`, which is `git diff HEAD -U0` per
file, memoised, so staged and unstaged changes both count — the working tree is
what that command judges.

Reproduced on a fresh two-file repository, 2026-08-19. A file with one
`TS-TRUTH:1` and one `TS-TRUTH:2` recorded, then two new `TS-TRUTH:1` added on new
lines:

| | before | after |
|---|---|---|
| what it said | `All 4 of these were already here` | `2 … The other 2 are new and are blocking` |
| exit code | **0** | **2** |

**The surplus slots are not what let it through, and a test now says so.** Their
report blamed the twelve spare `TS-TRUTH:1` left behind by splitting a 1,614-line
file — which is what obeying `TS-DECOMPOSITION:1` produces. A recorded count
larger than what is in the file now changes no verdict, because the decision asks
whether you touched the line and a surplus grants nothing. Their second suggested
fix, shrinking a file's entry whenever looper judges it, is not taken: the
baseline already shrinks on every `Stop`, `shrinkToward` is `Math.min` so it
cannot grow, and after this change a stale entry is untidy rather than wrong.

One thing this found in the writing: the first spelling of the test guard read a
missing count as `0` through `??`, which `TS-TRUTH:1` refused. It was right — a
fixture that stopped recording the rule would have read as recorded-zero and the
probe would have proved nothing.



## Comments in C#, and the difference between a house rule and a defect rule

`TS-DEAD:2` and `RUST-DEAD:2` ban comments. Python and C# had the line in their
canon — *"names, types and tests cannot drift out of date, and prose can"* — and
no rule behind it. `CS-DEAD:2` closes that for C#.

### The test that killed CS-TYPE:1 does not apply, and saying why matters

Measured 2026-08-19, hits per thousand lines:

| | kloc | CS-DEAD:2 | per kloc |
|---|---|---|---|
| dotnet/runtime | 148 | 10,037 | 67 |
| dotnet/aspnetcore | 676 | 56,288 | 83 |
| bitwarden/server | 1884 | 24,253 | 12 |
| jellyfin | 339 | 16,614 | 48 |
| Newtonsoft.Json | 193 | 24,690 | 127 |
| MudBlazor | 303 | 19,299 | 63 |
| the adopter | 325 | 21,453 | 65 |

The adopter sits mid-pack. On the reasoning that refused `CS-TYPE:1` — quiet
where the review is hardest, loud where the work is needed — this rule fails
outright.

**It fails because that is the wrong test for it.** The rules here make two
different claims and the corpus can only answer one of them:

- A **defect rule** says *this is wrong*. `CS-ERROR:1`, `CS-SECURITY:1`. It has to
  be rarer where review is hardest, or it is describing an idiom rather than a
  fault. `CS-TYPE:1` was not, and died.
- A **house rule** says *we do not write it this way*. `TS-DEAD:2`,
  `RUST-DEAD:2`, and now this. It fires everywhere by design. `TS-DEAD:2` already
  fires 1,559 times in the adopter's own JavaScript and looper ships it.

Nothing in this document said that out loud before, which is how the density
argument nearly refused a rule looper already enforces in two other languages.
The measurement was right and the question asked of it was wrong.

### `///` is banned, argued rather than assumed

XML documentation comments are 10,727 of aspnetcore's and 10,837 of jellyfin's,
and .NET tooling shows them in a tooltip while you type. Removing them from a
published library costs something real.

They are banned anyway, and the tooltip is the reason rather than the objection:
a stale `///` is displayed to whoever is calling the method, at the moment they
are deciding what it does. That makes it more believable than a stale `//`
sitting in a file nobody opened. `RUST-DEAD:2` already bans `///` and `//!`,
whose contents feed `cargo doc`, so this trade has been made here once before.

### Three exemptions, each checked against a real file

**A file a program wrote** is exempt in full, on the `<auto-generated` marker
.NET already uses. `bitwarden/server` has 462 of them out of 5,293 files, which
is why its density is 12 rather than in line with the others.
`20260731132743_AddUserKeyIdToUser.Designer.cs` holds two comments and the rule
reports none.

**A licence header on the first line** is exempt, matching `TS-DEAD:2`. It is
near-universal: 387 of 400 sampled `dotnet/runtime` files, 400 of 400 in
aspnetcore. Checked on `ZstandardCompressedContent.cs`, which reports nothing on
line 1. The same words further down the file are prose and do fire.

**`looper:allow-secret` after code on the same line**, which the commit gate
reads on every commit and so cannot quietly stop being true. On its own line it
is a comment like any other, and `audit/csharp-cases.ts` pins that.

Razor files are judged inside `@code` blocks as everywhere else. The markup
comment `@* *@` is not read, which is the same boundary the other seven rules
have and is recorded rather than left to be found.
### The C# half arrived clean and unheld, and both drivers swallowed the same failure

`#93` merged: a Roslyn reader for C# and Razor, with the strongest evidence any
contribution here has carried — 493,083 lines of Newtonsoft.Json and MudBlazor,
and two rule defects found and fixed before shipping. Three things were left for
this side, and all three are ours rather than the contributor's: holding someone
else's work while asking them to do what we could do is the failure the canon
names.

**`looper law` said no: 9 new blocking problems.** CI runs `npm test` and not
`looper law`, so they would have landed unremarked. Seven were in
`src/law/csharp/drive.ts` and mirrored `src/law/rust/drive.ts` line for line —
`catch { return newest }`, `catch { continue }`, `catch { return false }`. Those
were baselined debt on the Rust side, which is a record of what we owe, not a
licence to add a second copy.

Both drivers asked the same question — is the built engine newer than every
source — and both answered a failure with a value. An unreadable source read as
age zero, which means a stale engine judges every file with rules nobody can see,
silently. `src/law/engine-age.ts` now answers it once, for both:
`freshnessOf(binary, sources, manifests)` returns `current` or `rebuild` **with
the reason**, and an unreadable anything is a rebuild that names the file. That is
stricter than what it replaced, and it caught a real gap: a deleted `Cargo.lock`
used to read as current. A test pins it.

The duplicated staleness code is gone from both drivers, which closed the 7 new
problems **and** the same 7 baselined on the Rust side. `looper law` went 22 → 7,
and the 7 that remain are older problems in `audit/shape-probe.ts`.

`csharpRuleFor` returned `Rule | undefined`, which `TS-TYPE:2` refuses. It now
matches the `Known` union `rustRuleFor` has had all along, and `project.ts` — which
had its own inline `.find` for the same thing — uses it.

`src/law/project.ts` crossed 500 lines. The half that drives the three language
readers and turns their answers into violations is its own subject and is now
`src/law/readers.ts`, 183 lines.

**The network invariant now covers the C# half**, to the shape `#91` set for Rust:
nothing in our C# source names a connecting type, the package list is exactly the
three that were argued for, and `NuGet.config` clears every remote source and
points at `vendor/`. Each was run against a planted fault first — a `TcpClient`
field, a fourth `.nupkg`, a removed `<clear />`.

**Measured by hand, 2026-08-19, and recorded here because a test cannot do it.**
The three vendored packages are `.nupkg` archives, so the binaries cannot be
grepped the way Rust source can. Unpacked all three and searched every one of the
**114 DLLs** for `Socket`, `TcpClient`, `TcpListener`, `UdpClient`, `HttpClient`,
`WebRequest`, `WebClient`, `Dns` and `NetworkStream`. **The only `System.Net` type
referenced anywhere is `WebUtility`** — HTML and URL string encoding, which Roslyn
uses for XML doc escaping and which cannot open a connection. This is the same
distinction the Rust test draws for `serde`'s `SocketAddr`. The method works
because type references survive in IL metadata as strings: `System.IO` and
`System.Net` both appear.

**A new precondition, named once.** The C# half needs the .NET SDK. Without it six
tests fail, and they fail saying which — *"the C# reader did not answer, so every
case below would fail as though the rules were wrong"* — while `looper law` still
exits 0 and judges everything else. That is fail-open-but-never-fail-silent
working, and it stays exactly as the contributor built it.

**And I broke looper doing this.** The split created a circular import, `looper`
would not load, and every hook in the session announced it: *"looper is not
judging anything in this session … treat every verdict as absent rather than
clean."* Nothing was judged for the minutes it took to fix. That announcement is
the only reason it was caught immediately, and it is finding 74's fix earning its
place a second time.

||||||| parent of b4af769 (C# has no comments either)

### Calibrated against four codebases nobody here wrote

Adopter issue #100, measured 2026-08-19 with looper at `c0f7eb2`. `looper law`
over zod `3c9ca1d`, excalidraw `e160ff7`, tanstack-query `b8e3559`, VS Code
`0dac2a8d`, and this repository. Tests included in both line and problem counts.

| | zod | excalidraw | tanstack | vscode | ours |
|---|---|---|---|---|---|
| lines of TypeScript | 79,636 | 190,487 | 157,039 | 2,613,789 | 10,765 |
| problems per 1,000 lines | 128.7 | 67.2 | 45.2 | 75.9 | 20.1 |
| without `TS-DEAD:2` | 43.4 | 24.4 | 17.8 | 23.6 | 19.9 |

**`TS-DEAD:2` is 61–69% of every problem found in all four**, and 1% of ours only
because a day was spent moving 1,554 comments into documents beside the code. It
is the whole distance between this project and every professional TypeScript
codebase measured. Every other rule can be adopted incrementally; this one cannot
be adopted at all without a mass strip first, and an adopter should hear that from
us rather than discover it. That is not a defect — it is what a house rule costs,
in the sense #101 records.

**Well calibrated**: `TS-DECOMPOSITION:1` lands between 0.28 and 0.54 per 1,000
lines in all five, including a 2.6-million-line editor. A cap that means the same
thing at every size is the strongest thing that can be said for a number that was
picked. `TS-ERROR:3`, `TS-TYPE:5`, `DATA:2` and `TS-LAYER:2` are low everywhere.

**Rules where following them beats the best code in the sample**: `TS-TYPE:3`
(ours 4.1, zod 19.2, vscode 7.0), `TS-TYPE:4` (ours 0, zod 6.9), `TS-DEAD:1`
(ours 0, zod 2.5) and `TS-DEAD:4` (ours 0, zod 3.2).

**Where we are the worst in the sample: `TS-TRUTH:1`.** Ours 14.4 per 1,000 lines
against tanstack 3.2 and VS Code 7.9 across 2.6 million lines. That is not a rule
problem and it is not being softened: it is achievable at enormous scale and we
are behind, on 135 lines of ours of which 43 are default parameters. Recorded as
ours to fix.

**A refinement measured and declined.** The proposal was to exempt `/** */` on an
exported declaration, on the ground that a machine reads it — editor hover,
generated documentation — so it is a different object from a `//` note. From the
issue's own counts it removes 97 of 6,031 comments in zod, 293 of 7,772 in
excalidraw and 209 of 3,409 in tanstack: **1.6%, 3.8% and 6.1% of the rule.** zod
goes from 128.7 problems per 1,000 lines to about 127.3.

It is declined because the canon's one existing exception is conjunctive and this
meets half of it. `looper:allow-secret` is allowed because the commit gate reads
it on every commit *and so it cannot quietly stop being true*. A JSDoc is read by
a machine and nothing fails when it drifts — and a stale doc on an export is worse
than a stale note, because it is shown to callers who cannot check it. The
refinement costs the rule its one-line statement and buys between 1.6% and 6.1% of
one rule.

**Two suspicions the reporter tried to falsify and could not.** Both were about
`TS-TRUTH:1` over-firing: `||` between booleans, classified with the TypeScript
type checker at **5 of 135 distinct sites (3%)**, and the two-spread clause the
ban text already calls wider than the harm at **6 of 135 (4%)**. Also found in the
attempt: looper already ignores `||` used as a condition, which the reporter had
assumed it did not. Recorded because a rule that survived an attempt to break it
is worth more than one nobody tried.

The VS Code column was measured over 71% of that codebase — 2,425 of its 8,319
files could not be parsed at all, which #102 fixed after this was filed.

### A file changed through Bash was judged by nothing until the commit

Adopter issue #95. `looper init` wired `PostToolUse` with the matcher
`Edit|MultiEdit|Write`, so the per-edit check fired for three tools and for
nothing else. An agent that changes files through Bash — `sed -i`, a `python3`
heredoc, a shell redirect, a formatter — got no rule feedback at all.

Not an exotic path: they split a 1,614-line file into five by writing all five
with one heredoc, and those five carried **nine new blocking problems**. looper
said nothing. The commit gate would have caught them, which is why nothing bad
reached the repository — but as nine at once, long after the reasoning that
produced them was still in the agent's head. That is the expensive version of the
same information.

**The shape.** The per-edit check answers *which file did this tool name*, read
from the payload. Bash names none, and the command cannot be parsed for filenames:
a heredoc, `make`, `npm run` are all unreadable. So the question has to become
*which files changed on disk*, and only the filesystem can answer it.

`PreToolUse` on Bash already fires, for the commit gate. It now also touches a
mark file, one per project, beside the session record in the user's home.
`PostToolUse` on Bash asks git which paths differ from HEAD, keeps the ones newer
than that mark, and judges each through exactly the same path a single edit takes
— `judgeOneFile` is now shared by both rather than written twice.

**The mark carries no time, and that is the fix rather than an accident.** The
first version wrote `Date.now()` into the file and compared it against file
mtimes. It failed one run in four, and the trace says why:

```
file mtime 1787139869667.89     mark 1787139869670     keep false
```

The file was written **after** the mark and its mtime reads two milliseconds
**earlier**. `Date.now()` and the filesystem's timestamps are not guaranteed to be
the same clock, and two milliseconds is exactly the window this has to be precise
in. The mark file's own mtime is the mark now, so both sides of the comparison
come from one clock and the skew cancels. Five runs, no flake.

**Why it does not repeat itself.** Git's dirty set does not shrink between
commands, so judging everything dirty would re-report the same problem after every
`ls` until it was fixed or committed. The mark scopes it to what this command
wrote. A test pins that a later command reports nothing.

Verified end to end on a fresh project: a heredoc writing five files, all five
judged in one report immediately after the command, and the next command silent.

Two things looper caught in the writing. `writtenSince` first swallowed a failed
`stat` with `catch { continue }`, and now carries the unreadable paths the way
every other walk here does. `toolNamed` answered an unparseable payload with an
empty string, which `TS-ERROR:3` refuses; it returns a named absence and the
existing `targetOf` path reports the reason, so nothing is lost.

### A word nobody thought of leaves with the push, and now gets named

Adopter issue #97. Before pushing six commits to a public repository, a check
grepped the diff for the company name and the machine's username and reported
clean. Two lines in `docs/PLAN.md` named three project directories from a private
repository. The grep did not look for those, because nobody had thought of them —
they were found four commits later by a person asking, not by the check.

**A denylist answers one question: does this contain a word I already know is bad.
Every word nobody thought of passes,** and the list is written by the same person
who is about to be surprised. `looper report` already has the inverse in
`leaksInShape`: every word must prove it is safe, and anything unproven is a leak.
That is why that file can promise it carries nothing of yours.

**The proposal was `looper strangers <range>`, and the trigger is wrong.** A
command somebody has to remember is the same shape as the grep that failed — it
depends on a person thinking of it, and the canon has a rule against it by name:
*the only input is a sentence*. And a commit does not leave the machine. A push
does. looper already reads `git commit` out of a Bash command line at
`PreToolUse`; `git push` is the same read.

So it runs at push time, prints once, blocks nothing.

**Measured before building, because the issue was filed without a denominator on
purpose.** Every word in a merge's added lines that appears nowhere in the
repository as it stood before, 2026-08-19:

| merged | added lines | strangers |
|---|---|---|
| #85 ban text | 44 | 17 |
| #90 REACT:2 reads types | 183 | 17 |
| #96 looper law decides like the gate | 156 | 17 |
| #104 Bash edits are judged | 323 | 30 |
| #91 vendoring, `vendor/` excluded | 140 | 35 |
| #91 vendoring, nothing excluded | 330,146 | **15,590** |

Seventeen to thirty words is a five-second read. **Vendoring somebody else's tree
is the one thing that breaks it**, so `vendor` and `package-lock.json` are
excluded: a vendored directory is by definition full of words nobody here wrote.

Verified against the incident itself. A repository whose only prose is *"The
engine reads the staged text and refuses a key"*, then a commit adding *"Rolled
out across Contoso.Api, ContosoWeb and Contoso.Widgets this week"*:

```
looper: 7 word(s) in what you are about to push appear
nowhere else in this repository as origin/main has it.

  Base     docs/plan.md:2
  API      docs/plan.md:2
  ContosoWeb  docs/plan.md:2
  Shared   docs/plan.md:2
```

The other three are ordinary English new to a four-line repository — the honest
caveat is that the noise falls as the vocabulary grows, and looper's own is 7,617
words at `HEAD`.

**The before-vocabulary is one subprocess.** `git grep -h -o -E` over a revision
returns every word in that tree: 7,617 words in **57 ms**. The first draft read
each file with `git show`, which is a subprocess per file.

It lives in the secrets capability rather than a new one, because *what must not
leave this machine* is already that capability's subject. It mentions and never
blocks: a new name is usually just new, and a gate that stops a push over a new
identifier would be switched off within a week.

Two things caught in the writing. A second diff parser was written before noticing
`stagedAdditions` already had one; there is now `additionsAgainst` beside it and
both call the same `additionsIn`. And a duplicated type name made `src/git.ts`
unparseable — `TS-ERROR:8`, caught by looper on the next run rather than by a test,
which is the rule that #99 and #102 were about doing its job here.

### The baseline never travelled, so a clone inherited somebody else's debt as its own

`.looper/baseline.toml` was neither tracked nor ignored in this repository, and
had never been tracked. Every other file `looper init` writes under `.looper/` is
committed — the doctrine, `secrets.allow`. Only the record of what the project
owed was left behind.

Measured on a fresh clone of this repository, 2026-08-19:

```
baseline present? NO
7 problems still standing. Fix every one above, then run again.
exit=2
```

**All seven are older than looper.** A colleague cloning this project is handed
them as new and blocking, and nothing says why — the failure is closed and silent,
which is the exact inversion of the rule this repo holds itself to.

It bit this session twice in the mild form: a `git stash -u` took the file as
untracked and the drop discarded it, and switching to a contributor's branch left
it behind, both times making `looper law` exit 2 on code nobody had touched.

Two halves, because there are two causes.

**It is tracked now.** The baseline is shared knowledge: which problems predate
looper is not a per-machine opinion, and two people judging the same commit must
get the same answer. It only ever shrinks — `shrinkToward` is `Math.min` — so the
diffs are monotonic and each one is debt going down.

**And its absence is now said out loud.** `readBaseline` answers a missing file
with `NOTHING_FORGIVEN`, which is indistinguishable from a project that owes
nothing, so no caller could tell the two apart. `adoptedButUnrecorded` asks the
one question that separates them — the doctrine is here and the baseline is not —
and `looper law` says so before it reports anything. `looper init` now names the
file among the things to commit, which nothing did before: not the README, not
CONTRIBUTING, not the doctrine.



### The C# cases failed on a machine with no .NET, which said the wrong thing

#105's own log records `npm test: 511 pass, 6 fail — the six C# cases needing the
.NET SDK, absent here`. Six red tests on a maintainer's machine, from a
contribution that had been green in CI, because CI installs the SDK and a laptop
does not.

Six failures say *these rules are wrong*. The truth was *nothing was asked*. That
is the same confusion `looper law` had in #96 — the reassuring answer given by
the command a person actually runs — pointed the other way.

The rule everywhere else here is that a missing engine is named and passes rather
than reporting every file as clean. `tests/csharp-cases.test.ts` now probes
`dotnet --version` once when it loads and skips all six with the reason attached
to each line:

```
﹣ every C# case agrees with the rule it was written from # no .NET SDK on this
  machine, so these say nothing either way (spawnSync dotnet ENOENT)
```

Checked both ways on 2026-08-19: with the SDK, 519 pass and 0 skipped; with
`dotnet` off `PATH`, 513 pass, 0 fail and 6 skipped.

**It does not hide a broken engine.** The probe asks whether `dotnet` runs at
all, not whether the reader works. If the SDK is present and the engine will not
build, the six run and fail as before. The Rust cases have the same shape and
have never shown it, because `cargo` is on the machine of anyone working here and
`dotnet` is not.

### The README said seven Python rules and never mentioned C#

Rewritten 2026-08-19. Three of its claims had gone stale: *"Python, seven rules"*
when there are eleven, no mention of C# or Razor at all after `#93` merged, and
*"Seventy-two things that were wrong with this tool"* against a hundred and five
findings, all closed.

Everything in it is now checked against the code that answers it: **77 rules**
(TypeScript and JavaScript 28, Rust 30, Python 11, C# 8), **482 cases**, **519
tests**, **18 vendored crates and 3 vendored packages**.

Three things were added. A **before-and-after** — the agent's `catch { return 0 }`
and the repair looper hands back — because the shortest honest description of this
tool is one example of it working, and a `diff` block is the one place GitHub
renders red and green. The **four gates** as a list, which now includes the push
gate `#97` added. And the **calibration table** from `#100`, including the row
that says the comment rule is two thirds of every finding: an adopter should meet
that number on the front page rather than on day three.

The masthead went through three rejected drafts before the shape was right, and
the reason is worth recording. The first two put a box-drawing frame around the
letters. Box-drawing and block characters are *ambiguous width* in Unicode — some
fonts render them at two cells, some at one — so a frame's right edge cannot be
made to line up for every reader, and a frame that is off by one drags the letters
down with it. The letters alone have no edge to misalign. No frame.

### The push check gave up on the branch it matters most for

`#105` shipped the strangers list at push time. It found the revision to compare
against by asking for `@{upstream}`, then `origin/HEAD`. Within the hour it
announced its own gap on a real push here:

```
looper: the words about to leave this machine were not checked, because
Command failed: git rev-parse --abbrev-ref origin/HEAD.
```

**`origin/HEAD` is only set by a fresh `git clone`.** Any repository that
predates one, or that lost the ref, does not have it — this one does not. And a
branch that has never been pushed has no `@{upstream}` either. So the two together
gave up on exactly the case the check exists for: **new work being pushed for the
first time.**

`origin/main` and `origin/master` are now the third and fourth things asked, and
a test covers a branch with no upstream at all. It failed before the change.

The check announced this itself rather than passing quietly, which is the only
reason it was found within an hour of shipping — fail open, never fail silent,
earning its place.

### The Rust guard was right to fire and said the wrong thing

Found by #107, which recorded a suite that failed once and was clean after and
said plainly that it could not explain it. Three sightings across two people. It
reproduces:

```
$ touch vendor/rust-law/src/lib.rs
$ npm test    ->  512 pass, 1 fail
$ npm test    ->  513 pass, 0 fail
```

The one failure is `tests/rust.test.ts:19`, a guard asserting the Rust binary is
newer than `vendor/rust-law/src`. **It is right to exist**: without it a stale
binary means all thirty Rust rules are tested against the law they replaced and
every one passes. Anything that moves those mtimes trips it — an edit, or a branch
checkout.

**It is the verdict that was wrong.** A failure says *these rules are wrong*. The
truth was *nothing was built*. That is exactly #107's own complaint one layer up,
and the guard's message admitted the gap in its last sentence: *"an ordinary
looper run rebuilds it; `npm test` does not, so run one first"* — a step nobody
knows to take, which is the thing this project's canon names by name.

Skipping, the answer #107 took for C#, is wrong here. The .NET SDK is genuinely
absent on a machine without it and nothing can be done; `cargo` is present on any
machine that judges Rust at all, and the fix is one command. Skipping when you
could simply do it means the largest rule family goes untested after every Rust
edit.

So `tests/rust-engine.ts` builds it. If the engine is stale it runs the same build
an ordinary looper run does, and only if *that* fails does it skip, with the
reason on every line. Measured 2026-08-19: an incremental rebuild after touching
one source file is **9.14s**, against a suite that otherwise takes about four —
paid only when the source actually changed.

Nine tests across five files needed the engine and would have failed rather than
skipped without it. Checked by moving the binary aside and running with `cargo`
off `PATH`: **five failures left, and all five are seer tests failing for an
unrelated reason in that artificial environment** — they pass on an ordinary
machine, and are not touched here.

| | pass | fail | skipped |
|---|---|---|---|
| ordinary machine | 515 | 0 | 6 |
| straight after touching the Rust source | 515 | 0 | 6 |
| no `cargo`, no binary | 496 | 5 seer only | 20 |



### A reader's answer was cut off at a megabyte, and 906 files went unjudged

An adopter updated to the merged C# reader on 2026-08-19 and ran `looper law`.
The first line back:

```
looper: could not read 906 C# files (it did not answer in JSON (Unterminated
string in JSON at position 1053440)); it was not judged
```

`execFileSync` caps a child's output at one megabyte unless told otherwise, and
none of the three drivers said otherwise. One of that adopter's files produces
631 findings on its own; 779 files produce 22,803. The answer was cut mid-string
and `JSON.parse` refused it.

**The gate behaved correctly and that is why this was findable.** It did not
report 906 clean files. It named them, said it could not read them, and said they
were not judged — the same contract the Rust and Python halves have. A silent
version of this would have read as a codebase with no problems in it.

`A_READER_MAY_ANSWER_WITH` is 256MB, set on every reader rather than on the one
that hit it. At the eighty-odd bytes a finding costs that is room for about three
million, past which a project has a larger problem than a buffer. With it, the
same 779 files return 22,803 findings and nothing unreadable.

**Only C# has been seen to hit it.** The cap is shared by all three drivers, and
the Rust and Python answers are smaller because neither language has a rule as
loud as `CS-DEAD:2`. The fix is applied to all three because the defect is in all
three, not because the other two were measured hitting it — they were not.

The comment first written above that constant was itself refused by `TS-DEAD:2`
on the next run, which is why this paragraph is here instead.

### The fourth place the megabyte cap was, and the check that stops a fifth

`#112` found node's one-megabyte default on `execFileSync` cutting a reader's
answer mid-string: 906 C# files reported unreadable rather than judged. It fixed
all three language drivers with one constant.

**There was a fourth, and it was already live.** `src/git.ts` reads every git
command through `askWhole`, with no cap, and the strangers check `#105` shipped
this morning reads a whole revision's vocabulary through it. On this repository,
measured 2026-08-19:

```
$ git grep -h -o -E '[A-Za-z_$][A-Za-z0-9_$]{2,}' HEAD -- ':!vendor' | wc -c
1071122          # 1.02 MB

everyWordAt(root, "HEAD", …)   ->   cannot-tell: spawnSync git ENOBUFS
```

Over the line on looper itself, hours after shipping. The push check announced it
rather than passing quietly — the same property `#112` credits the C# gate with —
but it did not work. With the cap it sweeps normally: 7 strangers against the
previous commit.

**Four places is a class, not four bugs, so the fix is a check rather than a
fifth patch.** Every `execFileSync` in code we wrote that pipes stdout must set
`maxBuffer`. `tests/invariants.test.ts` greps for it, and it was run against the
un-capped `git.ts` first to watch it fail.

The audit that came with it: ten `execFileSync` calls in `src/`, eight pipe stdout
and all eight are capped. The two that are not are `cargo build` and `dotnet
build`, both `stdio: ["ignore", "ignore", "pipe"]` — stderr only, nothing to
overflow.

### The VS Code column was measured over 71% of it, and nothing said so

Adopter issue #111, invited when #100 was closed. Same clone `0dac2a8d`, same
command, same 2,613,789 lines. The only difference is that after #102 looper reads
**8,317 of the 8,319 files** instead of 5,894.

**No verdict in #100 flips.** Every "who is cleaner" comparison holds in the same
direction. Two numbers are corrected in place above, and one gets stronger.

| | published | corrected |
|---|---|---|
| every rule | 47.4 | **75.9** |
| without `TS-DEAD:2` | 16.2 | **23.6** |
| `TS-TRUTH:1` | 3.66 | **7.89** |
| `TS-DEAD:2` share | 66% | **69%** |

**`TS-TRUTH:1` is the one that mattered.** The sentence recorded here said "ours
14.4 against VS Code's 3.7". The real gap is 14.4 against 7.9 — still the rule we
are worst on in the sample, still ours to fix, but **half the distance claimed**.
The honest version is that 7.9 is held across 2.6 million lines of code that leans
on dependency injection everywhere, which is a harder place to hold it than a
ten-thousand-line console.

**`TS-DECOMPOSITION:1` did not move at all: 0.54 before, 0.54 after.** 2,423 more
files and 74,548 more findings, and the file-length rate is identical to two
decimal places. That is a cap measuring the same property at every size, now said
across a third more of the codebase than when it was first claimed.

### And the reason the first table could be wrong

The reporter's closing point is the more valuable half: *"the first table was
measured over 71% of the codebase and nothing in the output said so."*

`looper law` did name every unreadable file — but only warned them one by one, and
the **summary said nothing**. Worse, the count of what could not be read was
printed only in the branch where *nothing was found*. In the ordinary case, a
report with findings, it was silent. So a person measuring a large codebase got a
confident number over whatever fraction happened to parse.

The summary now carries it whenever it is not zero:

```
A further 2,425 file(s) could not be read at all and were not judged, named
above. The count above is over the 5,894 that could be. A file nobody could
read produces exactly what a clean file produces, so read this number before
you trust that one.
```

A test holds it, written from the issue and run against the silent version first.

### A file path read as a key, and a wider fix measured and not taken

`#116`: `looper init` wrote `.looper/baseline.toml`, its last line told the adopter
to commit it, and the secrets gate refused it. Reproduced end to end before
merging — one TypeScript file under an abbreviation-heavy namespace directory is
enough:

```
REFUSED  .looper/baseline.toml:8  a 42-character random-looking string
```

Merged as it stands: the baseline is skipped, the detector untouched, and every
path in that file is the path of a file already tracked in the same commit, so
scanning it protects nothing the commit does not already contain.

**The shape that trips it is narrower than it first looked.** A candidate needs 24
or more characters *and* every lowercase run of seven or fewer — `LONGEST_WORD` is
7 — *and* entropy over 4.2. Measured against realistic project paths on
2026-08-19, none of these is refused:

| path segment | length | longest lowercase run | |
|---|---|---|---|
| `OrderSyncJobRunner` | 18 | 5 | under the length floor |
| `PaymentGatewayAdapter` | 21 | 6 | under the length floor |
| `InvoiceReconciliationHost` | 25 | 13 | excused by the word test |
| `EventBusSubscriberHostV2` | 24 | 9 | excused by the word test |

It takes naming like four-or-more short abbreviations run together. Real — the
adopter hit it — but not the common case.

**A wider fix was built, measured and then dropped.** The same false positive can
hit the commit command, where there is no route out: three of my own shell
commands were refused while building the fixture for this review, because a
temporary path carrying a session id was 38, 40 and 47 characters. The fix was to
ask whether a candidate names something on disk — decidable rather than a guess,
and it worked on every case including the adversarial one.

It is not shipped, for three reasons. Six realistic adopter paths do not trip the
detector at all, so it buys little. It puts filesystem reads into the secrets path
on every commit. And the case that kept biting was *writing about* the bug — a
bare CamelCase run with no directory around it names nothing on disk, so the fix
would not have excused it anyway, and the gate is right to refuse it.

Recorded rather than built, so that if this recurs the shape and the measured
answer are already here. `#116`'s author declined to attempt a randomness
heuristic inside a false-positive fix; declining to attempt a filesystem one is
the same judgement.

**Splitting the candidate on `/` is worse and stays rejected.** Verified with a
realistic key rather than AWS's documented example, which the detector correctly
treats as a placeholder: a real key with slashes splits into parts of 12, 10 and
18 — all under the 24-character floor, none flagged — while a path still has a
28-character part that is. It lets the key through *and* keeps the false positive.

### PY-ERROR:2 and TS-ERROR:3 do not disagree, and the text said they might

Adopter issue #119 reported that `PY-ERROR:2` rejects a shape `TS-ERROR:3` allows —
a handler returning the same answer the normal path already returns — and that the
Python rule's own `instead` text recommends what it refuses. It framed the choice
as a decision about what the rule means rather than a defect, and gave the argument
both ways.

**Measured, and both halves of the report are wrong in the same useful way.**
2026-08-19, five shapes through each checker:

| shape | Python | TypeScript |
|---|---|---|
| the default returned **inside** the `try` | silent | silent |
| the default returned **before** the `try` | fires | fires |
| bare `return None` | fires | fires |
| logged, error not carried | fires | fires |
| logged, error carried | silent | silent |

**The two languages agree exactly.** The case in `audit/cases.ts` that the report
quotes as the TypeScript allowance has its `return false` *inside* the `try`; the
Python code it was compared against returns the default from a check *before* it.
Different shapes, judged the same way by both rules.

**So the rule does not recommend what it rejects — but the sentence was ambiguous
enough to read that way**, and that is the real defect. It said *"return it from the
`try` as well, so the handler is not the only place it appears"*. The second clause
invites exactly the reading that any other appearance counts. The implementation is
narrower and deliberate: `answersAlreadyGiven` is passed the try block, so the value
must already be returned from inside it.

Both texts now say that, and say why the narrower rule is the right one — a value on
the success path is visibly the answer, while a value in a pre-check is only visibly
a guard. `TS-ERROR:3` never mentioned this allowance at all, so a TypeScript reader
who hit it had no hint the legal spelling existed; it has the line now too.

Four cases pin it: the inside-the-`try` form silent and the before-the-`try` form
firing, in both languages. No checker changed.

**What the reporter actually needed** was one line moved, not a concession and not a
rule change. Their 43 fixes stand.

### `looper loop` shipped, and four things it said about itself

`#122` built the command the loop design proposed. Reviewed by running it, and
four defects came out — three that `looper law` named, and one the command found
by lying about itself on its first demonstration.

**A check that never answered reported `ok`.** The first run of a four-check demo
printed `ok  loop.timeout  spawnSync sh ETIMEDOUT` — a check killed by its own
patience, counted as healthy, by the command whose whole argument is that
*unknown is never ok*. `spawnSync` can set `error` and a zero `status` together
when a process exits at the same moment the timeout fires, and `verdictOf` read
only the status. It now takes whether the check answered at all, and an
unanswered check is `blind` when external and `broken` when internal, whatever
exit code came with it. `verdictOf` is exported so that decision is tested
directly rather than by racing a process.

**An unreadable `loop.toml` read as a project that declared nothing.** Same class,
one layer up, in the same pull request: `catch { return no checks }`. A file that
is absent and a file that cannot be read are different answers, and only one of
them means *nothing to do*.

**A check that said nothing did not say why.** `${stdout ?? ""}${stderr ?? ""}`
turned a timeout, a missing shell and a buffer overflow all into `no detail`.

**And the fifth megabyte cap, through the door the check for it did not cover.**
`#113` added an invariant after that defect was found in four places. It looked
for `execFileSync` only, and this command uses `spawnSync`. Worse, it asked
whether a call *reads* stdout by looking for an explicit `stdio` array, and
`spawnSync` here relies on the default — so even naming `spawnSync` would not
have caught it. The check is inverted now: a subprocess reads stdout unless it
says otherwise, across `execFileSync`, `spawnSync` and `execSync`. Run against the
uncapped call first, where it names `src/loop/run.ts:55`.

### An adopter's own path was on main, and the check for it never runs on a merge

Found while merging `main` into `#122`: `tests/secrets.test.ts` carried a real
file path from an adopting organisation's C# codebase — a real namespace and a
real class name — as the fixture for the very test proving a path is not a key. It
arrived with `#116` and was merged here without anyone noticing. Two of this
repository's own documents carried three more of that organisation's names, and
those were written here, quoting what `#97` had itself published.

All of them are replaced with invented names of the same shape. The tests never
needed the real ones: 535 pass either way. The canon is one line — *nothing
belonging to any adopting organisation enters this repo* — and it was broken four
times in one day, twice by the person enforcing it.

**The systemic half is worse than the instances.** `#105` built the check for
exactly this: at push time, every word in the outgoing commits that appears
nowhere else in the repository is named. It runs on `git push` from a machine. **A
pull request merged through GitHub never pushes**, so the one check built to catch
this class cannot see the route that most changes take. Recorded rather than
built: the fix is not another local check but a gate on the merge itself, and that
is a different piece of work with its own evidence to gather.

### The leak check ran on the route nothing takes

`#105` names every word in what you are about to push that appears nowhere else in
the repository. It is wired to `git push` from a machine. **A pull request merged
through GitHub never pushes**, so on 2026-08-19 an adopting organisation's real
file path reached `main` through `#116` and the check for exactly that never ran.

Everything merged here today took that route. The check has been running on the
one path almost nothing uses.

**So it runs in CI, on `pull_request`, against the merge base.** `looper strangers`
is the command, and adding a command is a reversal of the position taken in `#97`,
which is worth stating rather than quietly doing. There, `looper strangers <range>`
was refused because *a command somebody has to remember is the same shape as the
grep that failed* — it depends on a person thinking of it. That objection is about
a command **left to memory**. Wired into CI it is remembered by nobody and runs on
every pull request, which is the property the push hook was reaching for and missed.
Both callers exist now: the hook for a local push, the command for the merge.

**It is a report, not a gate, and that is a limit rather than a design choice.**
Nothing here can mechanically separate an adopter's namespace from a new identifier
of ours — `#118` measured that and dropped a fix for it. So this fails no build. It
writes the list to the pull request's own summary, where the person merging is
already looking, and says how many. Calling it a control would be describing a
barrier that is not wired, which this project's own process doctrine forbids.

Measured on the pull request that carried the leak: the words a reader needed were
in the list.

### A rule that never arrived read exactly like a rule that was followed

Adopter PR `#124` counted a session's own transcript: `doctrine:frontend` dropped
for budget **32 times** while interface work was being done, `law` six times while
its own languages were being written. Confirmed here on 2026-08-19 against this
repository, with the allocator an adopter runs:

| contributor | chars | share of 9,800 |
|---|---:|---:|
| `doctrine:law` | 4,418 | 45% |
| `router` | 3,428 | 35% |
| `doctrine:process` | 1,034 | 11% |
| `doctrine:evidence` | 787 | 8% |
| | | **dropped: `law`** |

**Every doctrine branch carried priority 10**, so which one survived was the order
`gather` happened to produce — arbitrary, not relevance. And a branch is emitted
*precisely because* the session changed files it governs: `signalled()` returns
branches whose governed files are in `changedPaths`. Having earned its way in on
relevance, it then competed on none.

This is the failure the plan already refuses one level down, applied to governance
itself. `#96` had it for *older*, `#107` and `#110` for *unbuildable*, `#117` for
*unreadable*: **something that could not be asked reading as something that was
asked and passed.** A rule set that never arrived produces exactly what a rule set
that was obeyed produces — silence.

**`Injection` now says whether the work raised it.** `required` is a stated field,
not an inferred one, and the allocator never drops a required contribution. The
router's constitution and every signalled branch are required; the outstanding-work
count, recall and decisions are not. What may be dropped still is, and is still
named.

**A budget that cannot hold the turn says so, in place of trimming.** Over budget,
everything required is included anyway and the reader is told the number:

```
[looper: the rules for what you are touching came to 10456 characters and the
budget is 9800. Every one of them is below anyway, because a rule that never
arrived reads exactly like a rule that was followed. Nothing was silently cut.]
```

That is the trade taken deliberately: the cost of a turn rises by about a kilobyte
on this repository, and in exchange no rule governing the work can go missing
without the reader seeing it. Measured after the change, `doctrine:contribution`
— 781 characters, silently absent before — now arrives.

**And a missing word cannot mean no.** Nothing type-checks this repository, so an
emitter that omitted `required` would read as droppable, which is the same defect
wearing the fix's clothes. `tests/invariants.test.ts` refuses any injection built
without saying, and was run against a silenced emitter first.

**Not done here.** `#124`'s other two findings — proposing checks from what the
agent reached for, and injecting the loop verdict rather than leaving a command —
stay design. The router's 35% is untouched: it is the constitution, and cutting it
is a separate argument with its own evidence.

### The rest of #124, built

`#125` took finding 1 half way. All three are built now, and one correction to
the first was owed.

**A dropped contribution says what it contained.** A name cannot be weighed, so
the marker carries the size and names the route to the rest: `law (412 chars)`
rather than `law`. The reader can now tell a paragraph from a page.

**The loop verdict is injected, and nothing runs on the hook path.** `looper loop`
exists and nothing carried its answer, so it fired only when somebody remembered
— which this plan already calls a check that does not fire. The command now writes
its tally to a cache beside the session record, and a capability injects **that**.

The shape is what the two standing invariants require, not a way around them:
`tests/invariants.test.ts` refuses any new file that starts a process unless it is
named, and refuses the registry any path to `src/loop/run.ts`, because a project's
shell line must not run because a session opened. So the injecting capability
imports `loop/cache.ts` and never `loop/run.ts`, and **no new file starts a
process at all**. Both invariants pass untouched.

It is silent when the loop is whole. When it is not, the answer arrives with its
age — five hours old is still injected, labelled *old enough to re-ask*, because
an old answer is information and silence is not. `looper init` needs no change:
the capability is in the registry, so an adopter never has to discover a command.

**The stall metric reads the hook stream for the four fingerprints.**
`PostToolUse` already fires on `Edit|MultiEdit|Write|Bash`, so what a session
reached for is recorded — tool and shape only, and for a shell line only its first
two words, never the arguments. The four the plan names are all built: one command
shape repeated in a window, one file read repeatedly, an edit rewritten within
minutes, and a long run of reads with no write between them.

The guard is in the text it injects, because the metric is dangerous without it:
**least input per unit of certainty, never least input.** A guess costs almost
nothing and is the worst outcome available, so the answer to a stall shape is one
more check rather than a shorter one.

Measured after building, on this repository: six identical shell shapes in twenty
minutes produce `ps aux — 6 times over 1 minute(s): no single call answers the
question`, and ordinary work — read, edit, read, edit — produces nothing.

**What a failure does here.** Neither new capability swallows one. A stream that
cannot be appended to says the metric is measuring less than happened; a payload
that will not parse says the same; a cache that will not read says so and names
the command that would refresh it. `looper law` caught all three while they were
being written.

### The ranking was written where nobody reads it

`#127` established that impossible beats gated beats told, and put all 38 lines
of it in this file. `docs/PLAN.md` is the design record: read on demand, never
injected. So the finding governed nothing, and the proof is that the canon
constitution went on saying nothing about it.

The predecessor this tool replaced had the rule in the file read on every single
message: *"A rule states intent; it does not stop anything. What truly must not
happen belongs in a gate (lawkeeper, secrets, the config direction rule), never
in a line here."* Its parenthetical named that project's own gates, which is what
made it act rather than sound good, and it is the part that cannot be copied.

This canon has exactly three gates, and the line now names them by what they
refuse: the law refuses the edit (`src/law/capability.ts`, on PostToolUse and on
commit), the secrets check refuses the commit and the commit message
(`src/secrets/capability.ts`), the freshness gate refuses a commit that changed
code a branch governs and left the branch behind (`src/router.ts:91`).

**The cap made it cost a deletion.** `tests/budget.test.ts` allows 14 rules across
both halves of the always-on tier, and the new line made 15. What paid for it was
a contradiction already in the file: the writing rule ends "This is the only rule
about how to write", and two further bullets were also about how to write.
"Short" is now inside it, whole, one bullet instead of two. That is the cap doing
the job it was built for, on the author of the line.

### Two corrections to what merged tonight, one of them to #125

**The adopter was locked out of the tree it was given.** `#128` shipped 22 nested
branches, and `isABranchName` refused a name containing a slash. So `ui/state` was
not a name an adopter could write, all 22 were canon-only, and `listBranches` did
not recurse either — a nested file of theirs was invisible even if they guessed.
A tree that governs only half of itself. The guard now takes slash-joined
segments and still refuses `..`, a backslash, a leading slash and an empty
segment, because a branch name is a name and never a way out of the doctrine
folder. Verified: `ui/state` and `secure/input` allowed, `../escape`, `/abs` and
`a//b` refused.

**And the budget never applied to the only thing it exists to govern.** `#125`
made every routed branch `required: true` so none could be dropped. The reasoning
was right — a rule that never arrived reads exactly like a rule that was followed
— and the consequence was not: the ceiling then constrained nothing but looper's
own status lines. Measured on the project that prompted it, nine branches went out
at **19,354 characters against a stated 9,800**, and the only things dropped were
`law`, `recall`, `decisions` and `stall`. An adopter's doctrine could grow without
any consequence they could observe, because the number meant to stop it was never
applied to it.

**The resolution keeps both halves.** Branches are droppable again, but they sort
at priority 10 — immediately after the constitution and ahead of everything else —
so they fill the budget first and looper's own status lines yield to them. A branch
that does not fit is named **with its size**, and the marker already points at the
`doctrine` tool that fetches a rule set by name:

```
[looper: 1 contribution(s) dropped for budget — doctrine:law (3894 chars). A name
cannot be weighed, so the size is here: run looper law to see what the
outstanding-work count would have said, and the doctrine tool for a rule set by
name.]
```

So the absence is stated rather than silent, and the rule is still reachable. That
is the difference between this and what `#124` reported: there, a branch vanished
and nothing said so. `#125`'s guarantee was that a missing rule must be visible,
not that the ceiling must be ignored — and honouring the first by breaking the
second made the ceiling decorative.

Both commits carried their reasoning in code comments, which `TS-DEAD:2` refused
on the first run here. The reasoning is above instead, which is what that rule's
own `instead` list says to do.


## NODE:1 read a regular expression as a shell

Found by looper refusing its own commit. `A_SENTENCE.exec(gathered.join(" "))`
in `src/router.ts` was reported as *building a command for the operating system
by pasting values into it* — the callee is named `exec`, and `.join()` counts as
pasting, so a regular expression matching a wrapped line looked exactly like a
shell call.

**Run over 1,068 JavaScript files nobody here wrote** — every `.js`, `.mjs` and
`.cjs` under the machine's global `node_modules`, `.min.js` excluded — the rule
fired three times, and **all three were the same false positive**:

```
ip-address/dist/ipv6.js:116  const subnet = constants6.RE_SUBNET_STRING.exec(address);
ip-address/dist/ipv6.js:131  const zone = constants6.RE_ZONE_STRING.exec(address);
ip-address/dist/ipv4.js:59   const subnet = constants.RE_SUBNET_STRING.exec(address);
```

Zero true positives. A security rule that fires only on innocent code teaches the
reader to skip it, which is the failure this repo calls *judge a rule on
precision, never severity*.

**The first fix was not enough and the corpus said so.** Tracing the receiver to
a `RegExpLiteral` catches `AT_END.exec(...)`, but the three real hits keep their
regular expression behind a namespace, so the receiver is `constants6.RE_SUBNET_
STRING` and there is nothing in the file to trace.

What holds without naming a module: a call to `exec` or `execSync` through a
member reaches a shell only when the receiver is a plain identifier that does not
resolve to a regular expression. A module is bound to one name — `cp.exec`,
`childProcess.exec` — while a regular expression is very often two deep.

Checking provenance directly was tried first and abandoned: it needs the literal
`"node:child_process"`, and `tests/invariants.test.ts` refuses any file
containing it that is not one of the six allowed to start a process. That guard
is right, and a rule about shells is not a file that should be starting one.

After: **0 hits in the same 1,068 files**, 0 in looper's own 176. Both real
shapes still fire and both regular expressions stay silent:

```
a.ts:4  exec("ls " + dir);
a.ts:5  childProcess.exec(`ls ${dir}`);
```

Four cases in `audit/cases.ts` hold it, one of them the nested-namespace shape
the corpus supplied.

## The branch for chasing a fault, and why logging was not its home

An agent finished a run by reporting that an intermittent failure was **"now
rare rather than fixed"**, said it had not found the cause, and offered to keep
chasing it. The answer it got was to chase it — *and add the logging you need
first, so you do not chase blind.*

**Neither half of that was anywhere in the canon.** `observe/logging` is about
writing down what happened for whoever asks later: fields, boundaries, a request
id, no secrets. That is production observability, written for a reader who does
not exist yet. Instrumenting a path *before* hunting is a different act with a
different reader — you, in ten minutes, holding a hypothesis. And `discipline`
says fix the cause rather than the symptom, which names the goal and says
nothing about how to see one.

So `src/canon/debugging.md`, opening "Chasing a fault you cannot yet see."

**Rare is not fixed** came out of the same sentence and is the sharper half. A
fault that got less frequent with no cause named is the same fault with worse
odds of being caught, and an agent that reports it as *rare* without also
reporting the cause as *unknown* has handed over something that reads as closed.
The report in question did say both, which is why it was worth keeping.

**It is a top-level branch because that is what reaches anyone.** The index
quotes a top-level branch's first bullet on every message; a leaf under a group
shows only its name. `- debugging  Add the logging before you chase the fault.`
is 60 characters and takes the index to 1,794 of 2,200. Placing the same rule
under `observe/` would have cost the same and delivered nothing until pulled.

It routes by no path, like `discipline` and `authority`, because the work it
governs is an activity rather than a directory.

## A check killed for being slow was reported as a service that was down

Reported from an adopting project, 2026-08-20, with times: a types-and-imports
check at **1.96s**, a contract check making nine live HTTP calls at **32.2s**,
and a headless-browser tour at **~90s**. `looper loop` gave every check 30
seconds and `.looper/loop.toml` had no way to say otherwise.

Past that limit `spawnSync` sets `error`, `verdictOf` sees `answered === false`,
and an external check becomes **blind** — which the vocabulary defines as *a
layer that could not be asked*. The tour exits 0 and prints its five sections,
and was reported as though the service were unreachable. Worse, the 32.2s check
sits either side of the limit depending on how warm a cache is, and **a check
that changes verdict without the code changing is one people learn to ignore.**

Two things follow, and the second is the one that matters here. `blind` does not
refuse a commit — that is deliberate, from the gate in #139 — so a declared
check that hangs stops gating without saying so.

`patience` is now a per-check number of seconds in `loop.toml`, default 30:

```toml
[loop.console-tour]
reach = "external"
patience = 180
run = "npm run --silent tour"
```

Raising the constant was rejected for the reason the report gives: it trades one
arbitrary number for another, and only the check's author knows what it waits
for. A malformed `patience` is complained about and the check still runs at 30,
because a check that does not run guards nothing.

`Seen` carries `timedOut`, and the detail says so rather than leaving the reader
to look at a healthy service:

```
blind   loop.tour   timed out after 2s, so this says nothing about the thing it
                    checks — raise patience in .looper/loop.toml if it needs longer
```

The blind/broken split itself is unchanged. A timeout on an external check may
still be the world being slow, and refusing the commit for it is how a gate gets
turned off.

## The constitution named branches the tool then denied existed

Reported the same day: the index names 22 sub-branches and tells the reader to
pull each one, and `mcp__looper__doctrine` answered *"there is no rule set called
`observe/logging`"* — for the very branch the `law` set defers its logging rules
to. The reporter was writing structured logging at the time and followed the
one-line summary instead, which is the failure the index warns about.

**It reproduces only across processes, which is why it looked impossible.**
Branch *bodies* are read from disk on every call; branch *names* are the compiled
`BRANCH_NAMES` constant. The injection hook is a fresh process on every prompt,
so its constitution is always current. The MCP server is one long-lived process,
so its names are frozen at whenever it started. A server started before a branch
existed denies a file it could read perfectly well — and the reporter's error
listed the ten pre-#128 names while their repo was at `300eaf1`.

So `canonBranch` no longer treats the compiled list as the authority on what
exists. A name absent from it is served anyway if `isABranchName` accepts it and
the file is there. Restarting the server is still the fix for a stale tool list;
this makes the tool stop lying in the meantime.

`isABranchName` moved to `src/config.ts` so both `canon.ts` and `doctrine.ts`
reach it without importing each other, which is a cycle that has broken looper
twice. The traversal guard is unchanged and tested at the new call site:
`../../../etc/passwd`, `..`, `/abs`, `a//b` and `a\b` are all refused.

## What a frame costs, and why only a live process can make it cheap

Measured 2026-08-20 on one workstation, WSL2 beside Windows, a 1536x864 screen,
against `seer/windows/capture.ps1` as it stands. Every number below is a stage
of **one** `see` call, because every `see` call starts a new PowerShell:

| stage | cost |
|---|---|
| `powershell.exe` start, warm | 126-135 ms |
| `Add-Type` of the inline C# helper | **170 ms** |
| `Get-Process \| Where-Object` to find the window | **47-117 ms** |
| `Add-Type -AssemblyName System.Drawing` | 19 ms |
| grab, PNG encode, base64 | 60-80 ms |
| the blank-detection `GetPixel` scan | 18 ms |
| **a frame** | **~500-600 ms** |
| `standing()` while the consent window is closed | **2,188 ms**, a pipe timeout |

**Roughly 440 of those milliseconds are setup that is thrown away and paid
again on the next frame.** The work itself — grab, encode, decide whether the
window rendered — is about 80.

Two things are cheap to fix and one is not. `Get-Process` materialises every
process to read one title; `EnumWindows` through the helper that is already
loaded answers in **2 ms**, twenty to fifty times faster. The `GetPixel` scan was
the suspect and is innocent at 18 ms.

**The 170 ms compile cannot be cached where the tree lives.** Compiling the
helper once with `-OutputAssembly` and loading it with `Add-Type -Path` is the
obvious move, and .NET refuses it:

```
Could not load file or assembly 'file://\\wsl.localhost\Ubuntu-24.04\...\seerwin.dll'
Operation is not supported. (Exception from HRESULT: 0x80131515)
```

An assembly on a UNC path is a remote assembly, and Windows will not load one.
Putting the DLL on the Windows filesystem would mean the install reaching out of
the tree it was installed into, which is a worse trade than the 170 ms.

**So the only way to stop paying setup per frame is to stop starting a process
per frame.** That is also what an adopter asked for in their own words: arm once,
because arming is the human's decision and belongs to them, and then have a frame
be something the agent can take at any moment while it edits, hot-reloads and
looks again.

**What that must not change.** Consent is asked per capture, over the pipe the
consent window serves, and a live capturer must keep asking per capture rather
than once at start — otherwise a window that stops being ticked keeps being
visible. Closing the consent window still disarms everything, so the capturer
must die with it. A process that holds the screen open and captures on a timer is
a different thing from one that captures when asked, and it is not what anybody
consented to.

**The obstacle, stated rather than solved.** `Capability.call` returns
`ToolResult`, not a promise, so the tool boundary is synchronous and cannot hold
a conversation with a living child over its stdio. A live capturer therefore
needs a protocol the synchronous side can complete in one step — a request file
and a frame file, or a second named pipe — and that is the design decision this
entry stops in front of rather than guessing at.

**Not measured yet, and it matters:** what the frame costs after it arrives. A
full-screen PNG is 90 KB here and reaches the model as base64. Half-size JPEG of
the same screen is 79 KB, and the gap widens on a larger display. Nothing has
been measured about what either costs the reader in tokens or in latency, so
nothing here claims it.

### The consent window was a command somebody had to know to type

The seer's own README said to start the consent window with a PowerShell line,
and the tool's messages repeated it: *"the person at this machine starts it with
`seer/windows/consent.ps1`"*. That is the thing this project's constitution
forbids in as many words — **the only input is a sentence** — and it was in the
one capability whose whole point is to be reached for casually, mid-task, by
somebody who is designing a page rather than administering a machine.

The reasoning that let it in is in the entry above: installing an eye is a
deliberate act on the machine whose screen it is, and that is right. **Opening
the window that asks for consent is not that act.** It sees nothing. It offers a
list and a tick box, and the tick is the decision. Making a person type a command
to be *offered* a choice guards nothing and costs the feature its users.

`startConsent` opens it, detached, the first time an agent finds it missing.
The agent is told what happened rather than handed a command, and the sentence
ends where looper's authority ends:

> the consent window was not running, so looper has just opened it on this
> machine. It lists every window that is open, with a tick box beside each.
> Nothing can be looked at until one is ticked there, which is the person's
> decision and not looper's.

`consent.ps1` is installed beside `capture.ps1` now, because looper cannot open
a program it has no copy of, and a machine with only half the pair is told that
plainly rather than being told a window is opening that never will.

`tests/seer.test.ts` refuses any message in the capability that names a command
to type, so this cannot come back as a helpful sentence.

**Found while doing it, and not yet fixed.** `standing()` returns every open
window title before anything is ticked — eight of them here, including a chat
with a person's name in it and a document title. The consent model gates
capture and not enumeration, so an agent learns what a person has open before
they have agreed to show it anything. That is a separate hole and it is written
down here rather than quietly left.

### Consent gated the capture and not the list

`standing()` returned every open window title, and `saidAbout` printed them under
the heading *"Every window open right now"*. Nothing had been ticked. Measured on
a real desktop 2026-08-20: eight titles, among them a direct-message thread with
a person's name in it and the filename of a document.

So the seer's central claim — the program that can see is never the program that
decides — held for pixels and not for names. **An agent learned what somebody had
open before they had agreed to show it anything**, and a window title is not a
small thing to leak: it carries client names, document names, and who somebody is
talking to.

The list was there to be helpful. A title that does not match anything got a
near-match hint, and the full list was offered so the agent could pick a real
one. Both are the same mistake in different clothes: helpfulness paid for with
something nobody offered.

The consent window no longer sends `open` at all, `Standing` no longer carries
it, and near-match hints are drawn from what is ticked. Asked with nothing
ticked, looper now says what it does not know:

> What else is open on this machine is not looper's to know: the consent window
> lists it to the person, and only what they tick is named here.

The person still sees everything, in their own window, on their own screen. That
is the half that was always right.

### A frame in 57 milliseconds, and the guard that stopped it landing

`capture.ps1 -Serve <dir>` is a capturer that stays alive: it loads
`System.Drawing`, compiles the P/Invoke helper once, and then answers requests
until the consent window goes away. Measured 2026-08-20 against a real ticked
window on this machine:

| | per frame |
|---|---|
| one shot, as shipped | 429-485 ms |
| through the live capturer | **57-85 ms**, first frame 135 |

Five to eight times faster, and it lands where the stage numbers above said it
would: the ~440 ms of setup is paid once instead of per frame.

**Consent does not move.** The server asks the pipe on every single capture, so
a window that stops being ticked stops being visible immediately, and it exits
the moment the consent window is unreachable. Three real bugs were found by
running it rather than reading it: `Set-Content` cannot create a file on a
`\\wsl.localhost` path, `File.Move` with an overwrite flag is .NET Core only and
Windows PowerShell 5.1 has the two-argument one, and `Get-Content -Raw` decodes
as ANSI, so a window title containing an em dash never matched what was ticked
and every frame came back refused.

**It is not wired into looper, and this is why.** The synchronous tool boundary
needs a request channel, and the obvious one is a file the agent's side writes.
`tests/invariants.test.ts` refuses any write from `src/seer/`:

> looper cannot record consent, because consent is not its to record. Anything
> looper can write, whoever is talking to the agent can have it write.

That guard is right about the property it protects and blunter than the property
itself. A request file names a subject; it does not decide anything, and the
consent window still answers yes or no per capture — an injected agent could
already ask for any title through the tool. So the property survives a request
channel and the test does not, which is the shape this project calls a blunt
rule: sharpen it rather than soften it.

**Sharpening a consent guard to let a feature through is not a change to make
quietly**, and it is not one the measurement decides. The capturer is here,
proven, and unused until that is settled.

### The fast frame landed, and the guard got sharper rather than softer

#150 measured a live capturer at 57-85ms against 429-485ms a frame, and left it
unwired because `tests/invariants.test.ts` refused any write from `src/seer/`.
That guard is right about what it protects: **anything looper can write, whoever
is talking to the agent can have it write**, and a record saying a window may be
photographed is the one thing an injected agent must never be able to forge.

It was also blunter than the property. A request names a subject and decides
nothing, and the consent window is still asked over its pipe on **every single
capture**. So the guard now names the one shape that is allowed —
`writeFileSync(ask, window, "utf8")`, and `mkdirSync` of the exchange folder —
and refuses every other write and every other folder.

**It is stricter than it was**, because the old one listed function names and
never looked at what was being written. `writeFileSync(ask, "yes", "utf8")`
would have passed it. It does not pass now.

**The guard was falsified before it was trusted**, and the first version failed:
a regular expression could not read `join(exchangeAt(), "granted")`, because that
is two levels of nesting and the pattern handled one. It is a balanced-paren
scanner now, and all three attacks are refused:

```
REFUSED : writeFileSync(join(exchangeAt(), "granted"), "yes", "utf8");
REFUSED : mkdirSync(join(exchangeAt(), window), { recursive: true });
REFUSED : writeFileSync(ask, "yes", "utf8");
```

Measured end to end through `capture()`, cold and then warm:

```
frame 1: 875 ms      frame 2: 79 ms      frame 3: 83 ms
frame 4: 79 ms       frame 5: 79 ms
leftover in the exchange: (nothing)
```

The first frame waits `SEER_LIVE_WAIT_MS` for a capturer that is not there
before starting one. That began at 2,000ms and a cold frame cost 2,507; a live
capturer answers in well under 100, so 400 is three times the headroom it needs
and a cold frame now costs 875.

**Nothing is left behind and nothing is trusted.** The live path falls back to
the one-shot whenever it cannot get an answer, and it carries the reason it fell
back rather than losing it — `looper law` refused two bare `catch { return
undefined }` while this was being written, and it was right to. The exchange
lives under the person's home, never in the repository, because a picture of a
screen is not project state and a working tree is one careless `git add` from
publishing it.

**The cost is written down in `.looper/decisions.md`**: a frame now exists as a
file for the moment between being written and being read, where before it went
through a pipe and touched no disk.

||||||| parent of b415348 (A project that declared no checks was never told, and the design said it would be)
### A project that declared no checks was never told, and the design said it would be

An adopting .NET codebase installed looper on 2026-08-19 and worked in it for a
day. It never wrote `.looper/loop.toml`. Nothing said so, at any point:

`looper init` names eight files in its output and that one is not among them.
`looper loop` with no file prints *"no checks declared"* and **exits 0**, the
code for fine. And `Loop.inject` returned `SILENT` when the loop had never been
asked, so no prompt in that day carried a word about it.

This page already knew. Under *"Nobody will write the checks, so looper proposes
them"* it says an empty `.looper/loop.toml` **"is indistinguishable from a
healthy project"**, and promises a project declaring nothing still gets *"an
external count of zero rather than a silence"*. The silence was the part that
shipped.

The adopter found it only because they pulled a newer looper, and the
constitution it injects now names the file. The checks turned out to be already
written down — they were sitting in a CI workflow and three project files, so
authoring them was copying, not deciding. The first run answered `ok=1 broken=3
blind=0`: two test projects had stopped compiling against the code they test,
and neither was in the solution file, so nothing had built them in a long time.
That is precisely the report the loop exists to produce, and a day of governed
work had gone by without it.

**Saying it is not the same as refusing it.** A project that declares no checks
is still never refused a commit — that decision stands, and the test that pins
it is untouched. What changed is that the loop no longer says nothing. With no
checks declared it says so on every prompt, and with checks declared but never
asked it says that instead.

`a loop nobody has asked says nothing, rather than guessing it is healthy`
became `a loop nobody has asked invents no counts, and is never read as
healthy`. The guarantee it was written to hold is the real one and it still
holds: no verdict is invented, and the text carries no `ok=`, `broken=` or
`blind=` it did not earn. Silence was never that guarantee. Silence was a
project being told, once a turn, that there was nothing to say.

The half of the design this does not build is the half that matters most —
looper proposing the checks from what the agent reached for. This only makes the
gap audible.

### A pin moved twice, and the only thing watching was a sentence

A submodule pin is a forty-character hash in a tree. It is the one line every
other machine obeys, and in a diff it looks exactly like every other line of its
kind.

On 2026-08-20 an adopting project moved its `vendor/looper` pin twice without
anybody deciding to. Both times a `git add -A` in a commit about something else
found the submodule sitting on a working branch and staged it. The second landed
`cd1281c`, the head of a pull request that was closed rather than merged, inside
a commit whose subject was about frame decoding. Between the two the project
spent a day pinned to a looper that upstream did not have.

Doctrine already carried the rule, written after the first drift: the pin is a
commit on upstream main, never a branch head, so check ancestry before a bump.
It did not stop the second one, because at no point was anybody bumping. A rule
addressed to the deliberate act is not read during the accidental one. Told is
the weakest rank there is, and this is what it looks like when it fails.

**What it costs, measured rather than assumed.** Two throwaway parents were
built and cloned, because the severity was not obvious from the outside:

- A pin the remote still serves that no branch names, which is what a closed
  pull request leaves behind on GitHub: `git submodule update --init` succeeds.
  No error, no warning, and the clone is running something nobody merged.
- A pin that was never pushed at all: `fatal: remote error: upload-pack: not our
  ref`, and the clone is unusable until a person fixes the pin by hand.

The quiet one is the one that happened. It is also the one no amount of care at
commit time catches by reading, because a hash carries no evidence of where it
came from.

**Local, because looper has no network.** The authoritative check is `git
ls-remote`, which would be looper's first outbound connection, and
`tests/no-network.test.ts` exists to stop exactly that arriving by accident. So
the gate reads what is already on disk: the submodule's own remote-tracking
refs. That costs nothing in the workflow that matters, because to pin a
submodule to a new upstream commit you must first fetch that commit, and
fetching is what makes the remote-tracking ref current. A pin anyone can
legitimately make is a pin the local refs already know about.

**On the default branch, or a tag.** Reachable-from-any-ref was the first
formulation and it is too weak: at the moment of the second drift the closed
branch was still in `refs/remotes`, so it would have passed. What catches both
real cases while still allowing deliberate off-main pinning is the default
remote-tracking branch, or an exact tag. A tag is how pinning to a release is
said out loud, and it is checkable without asking anybody.

What is refused and what is not. A pin arriving or moving, at `PreCommit`. A
submodule leaving is not looper's business. A submodule whose default branch
cannot be worked out, because `origin/HEAD` is unset and the branch is called
neither `main` nor `master`, is refused with that as the reason, and `git remote
set-head origin -a` is the fix rather than a bypass. A submodule that is not
checked out is refused rather than assumed, on the same principle that has the
edit gate refuse a file it could not read.

**The rule leaves doctrine.** It was a line in an adopting project's doctrine,
ranked told, and it behaved like it. It is now gated, and it is general: nothing
in it carries that project's shape. No canon line replaces it, because a rule
the machine enforces is a line the prompt no longer has to carry.

Evidence. Six cases in `tests/pins.test.ts`, built as real repositories against
a bare remote: a pin onto main, a pin never pushed, a pin the remote serves that
no branch names, a pin onto a tag off main, a commit that moves no pin, and a
submodule that is not checked out. Then against the real thing, not a fixture: a
parent pinned at `cd1281c` fetched from the real remote is refused with exit 2,
and the same parent moved to `6b835d0` on main is allowed with exit 0.

### A server answering from code that no longer exists

Reported 2026-08-20 and reproduced: `npm install` at 12:51:44 took an adopting
project from `300eaf1` to `6b835d0`, and the MCP server carried on answering
from the code it had loaded on **18 August**. `mcp__looper__doctrine` said
*"there is no rule set called `observe/logging`"* while the file was on disk with
that morning's mtime, and while the constitution injected in the same prompt
carried the full text of other branches.

**The asymmetry is the bug.** `.claude/settings.json` runs `looper inject` and
`looper hook` as commands, so every prompt and every tool call is a **new process
on the new code**. `looper serve` is one process that reads its modules once.
The half that enforces upgrades instantly; the half that explains does not.

What makes it worse than an inconvenience is that the stale answer is
**word for word** what looper says when a branch genuinely does not exist. There
is no way for the reader to tell *not installed* from *installed after this
process started*, and the honest conclusion from the sentence is the wrong one.
It also lands on the person least able to diagnose it: nobody who has not read
this source would guess that reconnecting an MCP server answers *"that rule set
does not exist"*.

`src/code-age.ts` walks `src/` at startup and records the newest mtime and the
file count — **1.3-1.8 ms for 161 files**, so it can be re-read on every tool
call. When either has moved, one line goes in front of whatever the tool returns:

> looper: this server is answering from the code it loaded when it started, and
> the code on disk has changed since. Anything below may be out of date, and a
> rule set it says does not exist may simply not have existed yet when this
> server began. Reconnect the looper MCP server and ask again.

The file count matters on its own, because a new branch can arrive without any
of its neighbours moving. **It cannot restart itself, and it does not pretend to
— it stops lying, which is the part that was missing.**

Half of the reported symptom was already closed by the disk fallback: a branch
whose file exists is served even when the compiled list has never heard of it.
That only helps a server new enough to carry the fallback, and it only covers
branch lookups. This covers the rest, including a stale tool list.

**Not built, and recorded rather than left:** whatever ends a session does not
always end its `looper serve`. A server from 18 August was still alive two days
later, so a machine accumulates them, and the window is wider than one session.

### looper declares its own checks

#153 made a project that declares nothing hear about it on every prompt, and the
first thing it said was that **looper declares nothing**. The tool that had just
shipped that message was not taking its own advice.

Authoring them was copying rather than deciding, exactly as the report that
prompted #153 found. Every one was already written down somewhere:

| check | where it already lived | cold |
|---|---|---|
| `tests` | `package.json`, and `.github/workflows/test.yml` | 4s |
| `rust` | `.github/workflows/test.yml` — *the Rust half, which every Rust verdict needs* | 16s |
| `evasion` | `CONTRIBUTING.md` step 2 — *`node audit/evasion.ts` reports zero mismatches* | under 1s |
| `law` | looper judging itself, which `docs/PLAN.md` already names as an internal check | 1s |

All four are `internal`: answerable from the checkout alone. Nothing here reaches
a host, because the invariant the whole product rests on forbids it. The Rust
build is run `--offline` and passes, which is that invariant demonstrated rather
than asserted — `vendor/rust-law/.cargo/config.toml` replaces crates-io with a
vendored directory.

**`rust` carries `patience = 180`.** It took 16s from cold here, inside the
30-second default, but a cold build on a slower machine or after `cargo clean`
would cross it and be reported `broken` for being slow — which is the failure
#144 was built to fix, arriving in looper's own file the first day it existed.

First run, seven seconds for the four:

```
  ok      tests      > looper@0.1.0 test
  ok      evasion    257 cases, 0 mismatches
  ok      law        looper found 7 problems, all of them older than looper.
  ok      rust       Finished `release` profile [optimized] target(s) in 0.01s

the loop is whole: ok=4 broken=0 blind=0
```

And the prompt went quiet: the loop capability injects nothing at all now, which
is what it does for a project that proves itself.

### The rules arrived for the work you had just put down

`changedPaths` unioned three questions, and the third was `diff-tree HEAD` — the
files of the **last commit**. Unconditionally. So the moment you committed, the
rules for what you had just finished became the rules you were handed for what
you were about to start, and they stayed there until you touched something.

Measured on this repo, 2026-08-20, on a turn spent answering a question about
performance: `doctrine:evidence` and `doctrine:process` arrived — **1,774
characters, 28% of that turn's injection** — for a commit that was already
merged. The turn touched neither.

The three questions are not the same kind of thing. Two of them ask what is *in
hand*: the working tree against `HEAD`, and untracked files. The third asks what
was *just put down*. Unioning them treats a memory as a fact.

**In hand outranks just put down.** Live paths route on their own; the last
commit is a fallback for a clean tree, where continuing what you were doing is
the likeliest thing and there is nothing better to go on.

Demonstrated, holding `starting.ts` one commit after `finished.ts`:

```
  [
    'starting.ts',
+   'finished.ts'      <- before: the rules were for this
  ]
```

And on the turn that built it, with `src/git.ts` and a test in hand, what arrived
was `doctrine:law` and `doctrine:work/testing` — TypeScript and testing, which is
exactly the work.

**A fixture caught itself being wrong.** The first version of the test passed
before the fix, because `diff-tree HEAD` on a root commit has no parent and shows
nothing. A base commit was added so the fixture exercises the thing it names.

### What looper costs a turn, measured, and the optimisation not taken

Asked whether looper is spending effort nobody gets back. Measured 2026-08-20 on
one workstation, WSL2, Node 22.23:

| | |
|---|---|
| bare `node -e ""` | 16 ms |
| loading looper's module graph, doing nothing | 105 ms |
| `looper inject`, a whole prompt hook | 150 ms |
| `looper hook PostToolUse` on a TypeScript file | 155 ms |
| the same on a markdown file, nothing to judge | 122 ms |
| **one realistic turn: a prompt and three judged edits** | **707 ms** |

**About 90 of every 150 ms is looper parsing its own source**, not working.
`src/law/checks.ts` imports 32 rule modules and costs 66-68 ms on its own, and
the prompt hook pays it through `project.ts` for a count it never uses.

**That optimisation was not taken, and the measurement is why.** A turn in this
session costs tens of seconds to minutes of model time. 707 ms is **one to three
percent** of it, and deferring the rule modules would save perhaps 65 of those
milliseconds. Nobody will feel it. Building it would be the thing this branch
warns against — optimising because a number looks large in isolation.

**What does cost a goal its time is imprecision, and that is measurable too.**
Across one long session, looper's gates fired about seven times. **Six were
right** and cost a minute each to satisfy. One was wrong, and one was blamed
wrongly:

- `NODE:1` read `regex.exec(parts.join(" "))` as a built shell command. Over
  1,068 files nobody here wrote it fired three times and every one was that same
  false positive. Fixing the rule cost several turns; not fixing it would have
  cost every adopter who writes a regular expression.
- ~~The stall capability fired on nine reads of one file and called it acting on
  a guess. The nine reads were a benchmark of the hook itself.~~ **That was
  wrong, and checking it took one command.** The benchmark drove
  `looper hook PostToolUse` with a payload saying `"tool_name": "Edit"`, nine
  times. `~/.looper/seen/` holds nine `Edit` rows for that file, in two bursts
  fourteen seconds apart — the two benchmark loops. Stall recorded exactly what
  it was told and named the shape correctly. **The false positive was
  manufactured by the person accusing it**, which is the failure this branch
  exists to prevent: a measurement taken without checking what produced it.

A gate that is right costs a minute. A gate that is wrong costs a turn, and a
turn is two orders of magnitude more than the 65 ms. **Precision is the
performance work here**, which is what `doctrine:law` already says — *only
imprecision burns turns* — and it now has numbers under it.

### Match the ceremony to the change

Measured on 2026-08-20, across 27 commits in one day: **1,822 lines of source,
1,036 of tests, and 1,271 of this document** — about seventy lines of essay per
hundred lines of code, at roughly 47 lines a commit whether the commit moved a
security boundary or fixed a typo. Every change also paid the same eleven
operations: branch, edit, test, law, commit, push, open, watch, sync, delete
twice.

The rules had no notion of proportion. Every one fired at full strength on the
smallest change, and *build the stricter one without asking* pointed only
upward. `process` now carries the line that points the other way. This entry is
four paragraphs because the change is one line, which is the rule working.

### A count cannot be acted on, and looper's own status lines were counts

#134 fixed this for the drop marker — *a size cannot be acted on, nobody can tell
from `1118 chars` whether they needed it* — and never applied it to looper's own
lines. Three of the four announced a number and told the reader to call a tool to
find out what it meant. `stall` was the only one that named anything.

The `law` line was the plainest case: *fixing one while you are already in that
file* never said which files. It does now, and it got **shorter** — 195 to 189
characters — because naming one file beats explaining why you cannot.

`recall` and `decisions` cost more: 481 characters became 908. **This is a growth,
not a saving**, and it is deliberate. A note's summary is usually the whole
useful fact — *a hook may write at most 10,000 bytes* needs no tool call — and
knowing what the notes are about is what lets a turn decide **not** to call.
Measured against the session that prompted it: `recall` was called zero times and
`decisions` once, so the old 481 characters told a turn to call a tool it did not
call, every turn, and delivered nothing.

Three named at most, then *and N more*. Without the cap it becomes wallpaper
again as soon as a project has learned twenty things, and a test holds it at
twelve notes.

### A baseline shrank on a survey that could not read half the project

The baseline is the list of problems that were already there when looper arrived.
Its own header says it can only get shorter, and it shortens by itself: every
turn, `shrinkBaseline` surveys the project and removes anything it no longer
finds, on the reasoning that somebody must have fixed it.

An adopting project lost the C# half of its baseline three times in one day.
Each time, 195 lines vanished in a commit about something else entirely, every
comment in every comment in its C# half became a blocking refusal, and the next person to
touch one of those files was told about 205 problems on lines they had not written.
Each time it was repaired by hand, as a union of both sides, and each time it
came back.

The cause is one line, and it is the failure this project exists to prevent.
`shrinkToward` asked `current.get(file)` for each recorded file and treated
`undefined` as nought:

    const now = nowInFile === undefined ? 0 : countIn(nowInFile, ruleId);

A file with no violations reported and a file that was never read produce
exactly the same answer there. `judgeCsharpIn` is not vague about which one
happened: when its engine will not start it returns no violations AND an
`unreadable` entry naming how many files it could not judge. The survey carries
that entry all the way up. The shrink was handed only the violation counts and
never looked.

So a contributor whose machine could not run the C# half surveyed the project,
found no C# problems because none could be looked for, and looper wrote a
baseline saying the work was done. The commit that carried it was about
scheduled announcements.

**A shrink now refuses on an incomplete survey**, whole rather than per file. If
anything at all could not be read this run, the baseline is left exactly as it
was and looper says so, naming the first three. Per-file would be more precise
and is not available: `unreadable` entries are prose, and the C# failure names a
count rather than paths, so there is nothing reliable to match on. Whole is also
the safer default, because the cost of being conservative is a baseline that
shrinks one turn later, and the cost of being wrong is real debt deleted and a
project unable to commit.

The rule this belongs to was already written down for reading a single file: a
file that cannot be read is never called clean. This applies it to the survey.

### A vocabulary of four million words is not a vocabulary

Reported by an adopting project on 2026-08-21: the stranger check never ran on
one machine, four pushes out of four, saying only *"the words about to leave this
machine were not checked, because spawnSync git ETIMEDOUT"*. They instrumented
`src/git.ts` and found the call: `everyWordAt` grepping every word at
`origin/main`, excluding only `vendor` and `package-lock.json`, over a repository
with a large committed build output. 3.1-3.4 seconds against a 3,000 ms limit —
missing by 150-400 ms, so it failed every time there and would fail
intermittently on a faster machine, which is worse.

**Reproduced here** with 800 committed generated files, and the second number is
the one that matters more than the first:

| | time | vocabulary |
|---|---|---|
| vendor and package-lock excluded only | 5,137 ms | **4,768,965 words** |
| plus what the project declared generated | 42 ms | 3,690 words |

A vocabulary of nearly five million tokens does not tell anyone that a word is
known. It hides every new word behind machine-made noise, so the check was not
merely slow — where it did complete, it was answering yes to almost everything.
The reporter measured that too: excluding their generated tree found three
strangers it had been masking across nine commits.

**Two other shapes were measured and rejected.** Scoping to judged extensions is
automatic but cannot work here, because the generated tree is HTML and people
write HTML by hand — no rule on a file's name separates the two. Asking only
about the words in the diff, rather than building the dictionary, is worse at
scale: 200 candidate words cost 2,654 ms against 476 for the whole grep, because
`git grep -o` still prints every occurrence of every match.

So only the project knows, and it now says: `generated = ["dist"]` in `law.toml`,
feeding the same list that already held `vendor` and `package-lock.json`, and
skipped as vocabulary and as diff both.

**A declaration nobody knows about is worse than none**, so the refusal now names
its own cause and where to answer it, rather than reporting an errno:

> That scan reads every word this repository already holds, so it runs out of
> time when a large generated tree is committed: name those directories as
> `generated` in law.toml and it will not read them.

### A key you could only find by reading looper's own diff

The adopter who reported the timeout came back: the fix worked — 3.42s to 0.07s,
vocabulary 74,667 words to 16,260, and the check named 21 words, all genuinely
new. Then the real remark: *"init doesn't create a law.toml, so there's nowhere
obvious to put `generated` on a fresh project. I only found the key by reading
your diff."*

That is the constitution's own rule failing — **the only input is a sentence** —
and `generated` was the smallest instance of it. `law.toml` has nine keys and not
one of them appeared anywhere a reader would look.

`init` now scaffolds `law.toml` alongside the four stubs it already writes, and
every line in it is a comment. A test holds both halves: each key is named, and
`readConcessions` of a scaffolded project equals one without the file, because a
scaffold that is live on arrival changes every project that runs `init`.

**looper stopped judging while this was written**, and said so: the stub was
wired into `src/init.ts` before `LAW_PATH` was imported, so its own code would
not load. *"Nothing is being checked — not the rules, not the edits, not the
commit."* Fail open, never fail silent, working on the person who broke it.

## The stylesheet was the one file nobody read, 2026-08-29

Every gate looper has — the project law, the edit hook, the commit gate — asked
`JUDGED_EXTENSIONS` which files it was allowed to open, and `.css` was not on
that list. Neither was `.scss`, `.sass`, `.html` or `.htm`. A stylesheet passed
through all three in silence, an inline style in a page was invisible to every
rule of the seventy-seven, and the survey counted neither as unread: they were
not counted at all, which reads exactly like nothing being wrong.

That is the same failure shape as **a rule that never arrived** — a file nobody
judged and a file with nothing in it produce the same output. It is worse here
than for a language looper simply does not speak, because the front end is where
an agent does its fastest and least reviewed work.

### Five rules, and the one thing they have in common

Every one of them bans something a machine can decide, that great stylesheets sit
near zero on, and that an agent optimising for "the screen looks right now"
produces constantly.

| rule | bans |
|---|---|
| `CSS-LAYER:1` | a `style=` attribute on an element |
| `CSS-TRUTH:1` | a colour written where it is used, outside the palette file |
| `CSS-TRUTH:2` | a z-index above the cap |
| `CSS-TRUTH:3` | a negative margin |
| `CSS-TYPE:1` | `!important` |

`CSS-LAYER:1` is the one that makes the other four hold. An inline style outranks
every stylesheet and — before this — was read by no rule at all, so it was the
place a workaround went to live. Judging stylesheets without judging `style=`
would have shipped a law with a hole in the shape of its own evasion.

### The scanner, and what it refuses to be fooled by

The rules do not run over raw text. Each file is first turned into a **CSS view**:
same length, same line breaks, everything that is not a live declaration blanked
to spaces. That is where the precision comes from, and every step of it exists
because of a shape that would otherwise have fired wrongly.

- **Comments and quoted strings are blanked**, so `/* the old brand was #ff0088 */`
  is a comment and `content: "!important"` is text.
- **`url(...)` contents are blanked**, quoted ones to their matching quote. A
  colour inside an inline SVG data URI belongs to the image, not to the sheet.
- **Token names are stripped from values before matching**, so `var(--color-pink)`
  is not the colour pink and `var(--space-2)` is not a negative number.
- **`calc()` contents are exempt from the negative-margin rule.** Subtraction is
  arithmetic; `margin: calc(var(--space-4) - var(--border))` places a box.
- **A declaration is read from its colon to its `;`, `}` or `{`**, so a value
  spread over four lines is one declaration and `a:hover {` is a selector. This is
  what keeps `#face { padding: 0 }` from reading as a hex, and `@media
  (min-width: 700px)` from reading as a property.
- **`<style>` blocks in a page are judged as CSS**, on the page's own line
  numbers, and `<script>` bodies and `<!-- -->` comments are blanked first.
- **`.scss` and `.sass` are judged too**, with `//` comments understood and
  `$brand: #ff0088` read as the token declaration it is. A law that stopped at
  `.css` would be dodged by renaming the file.

The palette's home is a knob, `[css] palette`, defaulting to `tokens.css` matched
by name in any directory. It is the only file where a colour may be written out.
The cap is a knob too, `[css] z_max`.

### The z-index cap is 100, and the number was measured

Deduplicated by content, 62,224 `.css`, `.scss` and `.html` files on this machine
hold 260 `z-index` declarations. **238 of them — 91.5% — are already at or below
100.** The 22 above it are 101, 200 (twice), 1000 (ten times), 1001, 9900
(twice), 999999999, 2147483644, 2147483645 (twice), 2147483647, 9999999999 and
99999999999 (twice). That tail is not a scale anybody designed; it is the war the
rule is named after. Measured 2026-08-29.

A cap of 1000 was the alternative and was rejected: it would have let 9900 and
1001 through while catching only the 32-bit-maximum end, and 1000 is not a small
scale — past it the number has stopped saying which layer this is.

### Run over 61,777 files nobody here wrote, and the one false positive

The five rules were run over every `.css`, `.scss` and `.html` file on this
machine, deduplicated by content, with installed packages and build output
excluded — 61,777 named, 61,664 read, the other 113 skipped for being over
400KB. None of them was written for looper. Measured 2026-08-29.

| rule | findings |
|---|---|
| `CSS-LAYER:1` | 6,102 |
| `CSS-TRUTH:1` | 1,546 |
| `CSS-TRUTH:2` | 17 |
| `CSS-TRUTH:3` | 28 |
| `CSS-TYPE:1` | 103 |

**112 findings were judged by hand** — 28 inline styles, 26 named-colour hits, 16
z-index hits, 12 negative margins and 30 `!important`s — and every one was a
genuine hit. Nothing was reported that was not really there.

**One false positive was found, and it was found by attacking the scanner rather
than by reading the corpus.** A quoted `url()` holding an inline SVG whose markup
contains a `)` — `transform="translate(2,2)"` is the common way that happens —
ended the blanking at that first `)`, leaving the rest of the SVG exposed, and
the image's own `stroke='black'` fired `CSS-TRUTH:1`. A quoted `url()` is now
blanked to its matching quote. It is a case: *a colour inside a data URI belongs
to the image, not the sheet*.

That is the order the contribution rules ask for, and it earned its keep: the
corpus never showed the fault, because the corpus does not contain an adversary.

### What was left out, and why

- **`float`, absolute positioning, fixed pixel heights, CSS comments.** Each has
  uses a machine cannot tell from a workaround, so a rule would nag rather than
  judge. A blunt rule is not a strict rule.
- **`style={{ }}` in JSX and TSX.** It is the same harm as `CSS-LAYER:1`, and it
  is also the only way to hand a computed value to the browser. It needs a rule
  that can tell a literal object from a computed one, and that rule is not
  written yet.
- **`.vue` and `.svelte`.** Their `<style>` blocks are CSS, but the rest of the
  file is TypeScript that the parser here cannot read, so adding them would fire
  `TS-ERROR:8` on every one. They stay out until the file is split by section.
- **`.razor`.** It goes to the C# reader, which judges `@code` blocks and leaves
  the markup alone, so a `style=` attribute in a Razor page is still unread. It
  is the nearest gap left.
- **File length for stylesheets.** `TS-DECOMPOSITION:1` is a TypeScript rule and
  stayed one. A cap for stylesheets would need its own measurement.

### CSS is not added to the language table, on purpose

`.css` and `.html` are deliberately absent from `A_LANGUAGE_BY_EXTENSION`, so
`STACK:1` still says nothing about them. Adding them would make every project
with a stylesheet and a `CURRENTSTACK.md` that predates this fail the moment they
upgraded, for a decision nobody made. Judging a file and demanding it be declared
are two different things, and only the first one shipped.

## Eight rules for the shortcuts that compound, 2026-08-29

The CSS law closed a place nobody was reading. These eight close a different
thing: shortcuts that are individually survivable and get worse as they
accumulate, because each one is the precedent for the next.

| rule | bans |
|---|---|
| `COPY:1` | a file whose name says it is a second go at the one beside it |
| `TS-ERROR:9` / `PY-ERROR:4` | waiting a fixed time for something to probably be done |
| `TS-ERROR:10` | throwing a built-in `Error` from inside a `catch` |
| `TS-SECURITY:1` / `PY-SECURITY:3` | `eval`, `exec`, `compile`, `new Function` |
| `TS-TYPE:6` | `JSON.parse(JSON.stringify(x))` as a deep copy |
| `PY-TRUTH:3` | `global` |

`TS-ERROR:10` has no Python twin on purpose: Python chains exceptions
implicitly, so `raise Missing(path) from error` — and even a bare re-raise inside
an `except` — keeps the original. The harm that rule names does not exist there.

### What the measurement changed, which is most of it

Every rule was run over the code on this machine that nobody here wrote, before
it was called done. Four of the eight came back wrong, and the corpus is the only
reason anybody knows.

**`COPY:1` lost the half it was named for.** Over **95,907 source files** —
`.ts`, `.tsx`, `.js`, `.mjs`, `.py`, `.rs`, `.cs`, `.css`, `.scss`, deduplicated
by path — the first draft found **252 files**, and essentially none of them were
the harm. Measured 2026-08-29:

| the shape | findings | what they actually were |
|---|---:|---|
| a bare trailing number — `utils2.ts` | 230 | 115 icons in one set (`edit-2`, `clock-7`, `music-3`); the rest domain numbers — `es256.py`, `terminal256.py`, `webgl2.js`, `woff2.js`, `http11.py`, `mips64.rs`, `macaddr8.js`, `SOCKADDR_IN6.rs`, `items2020.js`, `applyDecs2301.js` |
| a version tail — `-v1`, `-v2` | 14 | published API versions: `_decorators_v1.py`, `rekor-v2.js`, `colr-v1.js` |
| `-copy`, `-fixed` | 6 | `book-copy.mjs`, `clipboard-copy.mjs`, `locate-fixed.mjs`, `fs_copy.rs`, `rgbxyz_fixed.rs` — copying and fixed-point are things code does |
| `-backup` | 2 | `cloud-backup.mjs`, `database-backup.mjs` — backing up is also a thing code does |
| `-old`, `-new`, `-final`, `-orig`, `-tmp`, `-bak`, `-updated`, `-improved`, `-enhanced`, ` copy`, ` (1)` | **0** | — |

So the rule ships as the last row only: **0 findings in 95,907 files**, which is
the profile the contribution rules ask for — a machine can check it, and great
codebases sit at zero. The headline example from the idea it came from,
`utils2.ts`, is **deliberately not in it**: a trailing number is a fact about a
standard far more often than a confession about a file, and no reading of the
name can tell those apart. Every false positive above is now a silent case in
`audit/copy-cases.ts`, so the narrowing cannot be quietly undone.

`COPY:1` is judged from the filesystem rather than from a file's contents, so it
is the first rule here that runs on every language at once, and the first that
had to be wired into the three gates by hand rather than by joining `CHECKS`.

**`TS-ERROR:9` fired on two things that were not guesses.** Over **38,438**
deduplicated `.ts`, `.tsx`, `.js` and `.mjs` files, 53 findings, of which three
were wrong: a `new Promise` whose body did real work *and* set a timeout
alongside it, and `setTimeout(resolve)` with no delay at all, which yields a tick
rather than guessing a duration. The rule now requires the promise's body to be
*only* a delayed timer. Both are cases.

**`PY-ERROR:4` fired on 36 things that were not guesses**, out of 100, over
**5,420** deduplicated `.py` files: 18 were `sleep(0)`, which hands control to
the event loop, and 18 were a duration that arrived as a parameter of the
enclosing function — the caller's number, passed through, not this code's guess.
`sleep(math.inf)` waits to be cancelled and was the 37th. 64 remain, every
sampled one a genuine fixed wait.

**`PY-SECURITY:3` fired on a function called `eval` that a module had defined
itself** — `setuptools/wheel.py` has `def eval(req, **env)`. Six findings of 118.
It now checks whether the name is bound in the module first, the same way the
TypeScript half already resolved aliases.

**`PY-TRUTH:3` was cut in half on purpose.** The first draft banned `nonlocal`
alongside `global`: 419 findings, of which 98 were `nonlocal`. Reading them, they
are the closure-accumulator idiom — `nonlocal attempts` in a retry test,
`nonlocal request_complete` in an ASGI transport — where the declaration being
rewritten is a few lines up in the enclosing function rather than a file away.
That is a much weaker version of the harm, TypeScript has no equivalent rule for
closure mutation, and making Python stricter than TypeScript for the same shape
needs an argument nobody has. `global` alone: 321 findings, all genuine.

**Two rules came back clean and needed nothing.** `TS-SECURITY:1`: 98 findings,
every one a real `eval` or `Function` constructor, including `const F = Function;
new F("")` — a CSP probe deliberately aliased to dodge bundler analysis, which
the existing alias resolution caught without being asked. `TS-TYPE:6`: 96
findings, every one a real `JSON.parse(JSON.stringify(...))`.

**All eight run clean over looper's own code**, which still stands at the seven
problems that were there before any of this.

### What the vocabulary guard caught while this was being written

`tests/vocabulary.test.ts` refused the suite: `TS-ERROR:10` holds a list of
built-in error *constructor* names in a file that also tests node types against a
list, and the guard reads every `readonly string[]` in such a file as node types.
It was right to complain — the two lists mean different things and looked
identical. The constructor names are a `Set` now, which is both what the guard
wanted and the better lookup.

## The unread half of a Razor page, 2026-08-29

The CSS law shipped naming its own nearest gap: a `.razor` file goes to the C#
reader, which judges `@code` blocks and leaves the markup alone, so a `style=`
attribute in a Blazor component was still read by nothing. Closing it the same
day, because a gap named in a document and not in a gate is a gap.

A `.razor` file is now judged **twice**: by the C# reader for its code, and by
the CSS checks for its markup. That is the first file type here that two readers
answer for, and it is the honest shape — the two halves are different languages
in one file, and neither reader can see the other's.

The markup scanner learned one thing to make it safe: **`@code`, `@functions`
and `@{ }` blocks are blanked before the tags are read**, with brace matching
that steps over C# strings. Without it, `Left < Right` in a C# expression opens a
tag that never closes, and a `"<b style=\"color:red\">"` inside a C# string is an
inline style that isn't on the page. Both are silent cases.

### Where the evidence stops, and it stops earlier than usual

**There is not one `.razor` file on this machine that we did not write.** Every
other rule here was run over a corpus of somebody else's code before it shipped —
95,907 files for `COPY:1`, 61,664 for the CSS five, 38,438 for the TypeScript
four, 5,420 for the Python three. For this change that corpus does not exist and
could not be fetched, because nothing in this repository may reach the network.

So this ships on eight hit-and-evasion cases and one component written here to
exercise it, and **that is weaker evidence than anything else in this file**. The
shapes most likely to be wrong are the ones a real Blazor page would have and our
one page does not: a `@bind-style` attribute, a `<style>` block inside a
`@if` branch, and Razor's `@:` line-literal syntax. If an adopter runs this on a
real Blazor tree, that run is worth more than everything above it.

### `capability.ts` split, because its own rule said so

Adding the second reader took `src/law/capability.ts` to 501 lines and
`TS-DECOMPOSITION:1` refused it — looper's own file cap, on looper. The cap was
not raised and the file was not pardoned. The second job in it was reading the
hook envelope, which the law branch already names as its own concern — *judge
what the person wrote, not the envelope* — so `fileFrom`, `targetOf`,
`commandFrom`, `aboutToCommit` and the payload parsing behind them are
`src/law/payload.ts` now, and `capability.ts` is 404 lines of judging.

**looper stopped judging while that split was happening, and said so.**
`src/secrets/capability.ts` imported `commandFrom` from the file it had just left,
so the hook could not load its own code: *"Nothing is being checked — not the
rules, not the edits, not the commit."* Fail open, never fail silent, working on
the person who broke it. Four importers were repointed and it came back.

## The two open CSS cells, measured, and still open — 2026-08-29

Both `open` cells in the CSS column were put to the corpus the same day they were
written, so that "open" records a decision rather than an absence of attention.

Over **61,666 stylesheets and pages** — the same deduplicated, hand-written-only
corpus the five CSS rules were run against, measured 2026-08-29:

| candidate rule | findings |
|---|---:|
| an empty rule block — `.card { }` | 1 |
| `url()` pointing at another origin | 1 |
| `@import` from another origin | 0 |

The one empty block is an empty `@media` query, not a named selector. The one
off-origin `url()` is a CDN image inside a saved copy of somebody else's web
page, not authored CSS.

**Neither number is a verdict, because the instrument is wrong for the
question.** Every CSS minifier deletes empty rules. This corpus is overwhelmingly
built output, so the harm is removed by the build step before the file being
measured exists. A rule aimed at what an agent writes cannot be validated against
what a bundler shipped, and 1 in 61,666 says almost nothing about how often
`.card { }` gets written in the first place.

So the two cells stay open, each for its own reason:

- **Unfinished work reads as finished.** An empty rule block is decidable, has
  near-zero false positives and hands back an obvious legal spelling — delete it
  or declare something. What is missing is evidence it leaks, and the only corpus
  here is structurally incapable of showing that. It needs CSS as authored:
  adopter source, or looper's own pages once it has any.
- **Something from outside is used as an instruction.** This row does not fit the
  language. A static stylesheet is inert text; nothing arrives at it at runtime,
  so it has no "outside" to be instructed by. The two real shapes belong
  elsewhere — CSS built by string concatenation is a TypeScript rule about a
  template literal, and a stylesheet reaching a third-party origin is closer to
  *the language's own guarantees are stepped around* than to injection. **The row
  needs reshaping before the cell needs a rule**, and that is a decision rather
  than a measurement.

Recorded so the next session does not run this probe again to reach the same two
answers.

## The law reads the colour and the style written in TypeScript, 2026-08-29

The CSS reader arrived in the morning and the companion's stylesheet was clean
by the afternoon: every literal a token, no `style=` on a page. Beside that
stylesheet sat a canvas holding forty colours and a page holding seven `style`
attributes that no rule could see, because they were written in TypeScript,
which is the language the interface is actually written in. The rule set had a
hole in the shape of the language.

Two rules close it, both in the fast pass, both reading the AST the other
TypeScript rules read:

- `TS-TRUTH:3`: a string literal, or a template with no holes, that is a whole
  hex of 3, 4, 6 or 8 digits, a colour function (`rgb`, `rgba`, `hsl`, `hsla`,
  `hwb`, `lab`, `lch`, `oklab`, `oklch`) whose arguments are numbers, a
  `color()` that names a colour space first, or a hex inside a gradient. It is
  silent inside the files `[css] palette` names, and that knob now names a
  TypeScript file as readily as a stylesheet, because React Native's palette is
  `theme.ts`. It does not read a named colour (a word), a hex inside prose (an
  issue number), an id handed to `querySelector`, `querySelectorAll`, `closest`
  or `matches`, a template with holes (a colour built from values is not a
  literal), or `rgb(var(--r), ...)` built from tokens.
- `TS-LAYER:3`: a `style` attribute on a lowercase JSX element, which is a DOM or
  SVG element. A capitalised or member element (`<View style>`,
  `<Animated.View style>`, `<CardPicker style>`) is a component, and what it
  does with the prop is its own business, so React Native is never judged by
  this rule. An object whose every key is a custom property is the remedy the
  rule asks for (`style={{ "--tint": tint }}`), so it is silent.

### Measured 2026-08-29, over four corpora nobody wrote for looper

Every `.ts`, `.tsx`, `.js` and `.mjs` file under each root, deduplicated by
content inside a run, `.d.ts` and files over 1 MB skipped (57 in all), judged
with the default concessions. The fourth corpus is the previous product's
checkout on the Windows drive, which holds largely the same files as one of the
nine repositories, counted again on purpose so its number stands alone.

| corpus | files | `TS-TRUTH:3` | in files | `TS-LAYER:3` | in files |
|---|---|---|---|---|---|
| this project's own code (RustOnTop) | 956 | 103 | 27 | 41 | 12 |
| its installed packages | 8,809 | 454 | 72 | 26 | 10 |
| nine other repositories on the machine, packages included | 20,612 | 3,748 | 444 | 1,924 | 244 |
| the old app's checkout on the Windows drive | 16,224 | 2,806 | 350 | 1,179 | 120 |

**One hit in 7,111 was not a colour.** `color(vec2 coords, float blur)`: a GLSL
function signature inside a shader string. The first draft took any `color(`
with a digit in its arguments. The rule now asks `color()` for a colour space
first and every other function for numeric arguments, and both shapes are
cases. Everything else read was a colour: the largest files are tinycolor2's
own tests (288 each), the `debug` package's console palette (76, and bundled
again inside playwright and yarn's lockfile parser), expo's log-box overlay and
react-navigation's default theme. In a governed project those are installed
packages, which the law does not read. The 1,924 inline styles in the nine
repositories are mostly earlier apps of this team's (one tab file alone holds
169), which is precisely the harm.

**What the rules taught looper about itself.** A case file is now guilty by
construction: this rule reads strings, and the string in a case is the shape
the rule must fire on. looper's own `law.toml` pardons `audit/cases.ts`,
`audit/css-cases.ts` and `tests/law.test.ts` for this one rule, with the
argument beside the line, which is the first pardon looper has needed for a
rule of its own. And `src/canon/law.md` was at its 1,300-character ceiling: the
two rules got one bullet, and the opening sentence lost twelve words to pay for
it.

**Open, and said so.** A program carried as one string (the mobile map's
webview page and script) shows the rule only its `rgba()` calls; its hexes sit
inside prose-shaped text. A style object handed to a component that forwards it
to a DOM element (`<Input style>`) is the component's own rule to write. A
named colour in code is a word this rule does not read.

## Two loopers built the C# half at once, and a reader ran what was half written — 2026-08-29

CI went red on `main` twice in an hour — #179 and #180, both on
`test (22.18.0, ubuntu-latest)` — with the three C# tests failing: *the reader
answers at all* said `unavailable`, and its detail was `Command failed:
…/looper-csharp …` and nothing else. The same code passed as pull requests and
passed on re-run. Over the last twenty runs the failure hit 22.18.0 three
times, 26.x twice and 24.x once, every one since #177 merged at 18:16. #178 had
already met it, and recorded it as transient.

**The cause.** `judgeCsharp` builds the engine on first use. `node --test` runs
files in parallel processes, so on a fresh checkout every file that needs C#
runs `dotnet build` in `vendor/csharp-law`. Until #177 that was one file. #177's
*the markup half of a Razor page is judged* in `tests/edit-gate.test.ts` is a
second: in the green run of the same commit, test 92 took 8.7 s and test 130
took 7 s, each a build. Two builds in one directory rewrite `bin/` under each
other, and a reader run while that happens reads a half-written file.

**Seen, not inferred.** Two `dotnet build` started together here, with the
binary run as soon as it appeared, three rounds out of three: `exit 147 —
Failed to map file. mmap(…looper-csharp.runtimeconfig.json) failed with error
22`, and twice `exit 154 — The application to execute does not exist:
'…/looper-csharp.dll'`; one of the builds itself exited 1 on `MSB3026: Could
not copy … resources.dll`. Through the driver, on a fresh copy of the engine,
three loopers at once pinned to four CPUs like the runner: with the old driver
one or two of the three came back `unavailable` in every one of three rounds;
with this change, nine of nine answered.

**Why #178 saw nothing.** `ranWith` ran the binary with stderr set to `ignore`,
and `reasonFrom` keeps only the message, so the exit status and the runtime's
own words never reached anyone. A failure with its evidence thrown away reads
as transient.

**What changed.** `withLock` in `src/atomic.ts` became
`withLockFor(path, patience, body)`, the write case keeping its old patience.
`judgeCsharp` takes `vendor/csharp-law/building.looper-lock` around deciding
whether the engine is current and building it if not, with the build's own
patience of 300 s, so a second looper waits for the first build and then runs
the finished binary rather than starting a build of its own; a lock a dead
builder left behind is taken over after the same patience. And a reader or a
build that fails now says `exited with status 154 saying: The application to
execute does not exist …` or `was stopped by SIGTERM`, quoting up to 600
characters of what it wrote — `dotnet build` puts its errors on stdout, so that
is read too.

**What it does not cover.** A build that starts while another looper is already
running the binary, which needs the engine's own source to change between two
calls — that is, working on looper itself. It is now loud rather than silent.

Nine cases, written before the change and red against the old driver for the
reasons they name — the lock-wait one says *the reader ran the half-written
binary instead of waiting for the build*. `npm test`: 655 pass, 0 fail.
`looper law` over the seven changed files: nothing to fix. `looper loop`: whole.
