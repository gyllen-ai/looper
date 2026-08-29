export const CONSTITUTION_STUB = "";

export const MAP_STUB = `# Ties each doctrine branch to the code it governs. A branch is injected only
# when the files this session has touched land in its area, which is what lets a
# large doctrine stay affordable.
#
# The name on the left is the branch: a file called <name>.md beside this one.
# The canon ships its own half under the same names, and yours is added to it.
#
# looper already knows its own: the TypeScript law arrives when you touch a .ts
# file, the Rust law when you touch a .rs file, the Python law when you touch a
# .py file, and these doctrine rules when you edit this folder. Naming a branch here replaces what looper knows for that one
# branch, and leaves the rest alone.
#
# [governs]
# law = ["src/**/*.ts"]
# frontend = ["ui/**", "components/**"]

[governs]
`;

export const DOCTRINE_README_STUB = `# Your project's doctrine

looper injects \`constitution.md\` from this folder on every prompt, after the
rules it ships with. Branch files beside it load only when you touch the area
they govern, per \`map.toml\`.

**This README is never injected. Every other file here is, exactly as written,**
so nothing in them is free and there are no comments to hide notes in. Notes
belong here.

## constitution.md

The constitution is the rules that hold **no matter what you are working on**.
That is what the name means here, and it is why it is not named after a subject
the way the other files are: everything else in this folder loads only when you
touch the area it covers, and this one is read on every single message.

It starts empty on purpose, and empty costs nothing. looper already carries the
rules that are true for any project, so this file is only for what is true for
*yours*.

looper ships rules about writing rules, and they arrive whenever you edit this
folder — read them before adding a line here. The shortest of them: **a new line
has to say what it replaces.** A line earns its place if the model would not
already do it. Good lines sound like:

    Money amounts are integers of the smallest unit. Never a float.
    Ask before changing anything a customer can see.

Lines that restate what it already does make it hedge more, not less:

    Write clean code.
    Be thorough.

Keep it short. Ten lines is a lot.

## Branch files

When a rule only matters while doing one kind of work, put it in a branch
instead, and map that branch to the files it governs. Name the file after the
branch: \`frontend.md\` for the \`frontend\` entry in \`map.toml\`.

A rule anchored to something that actually went wrong, with the date, is
followed. The same rule as a general principle is skimmed.
`;

export const ADOPTED_HEADER = `# Rules this project adopted, and the evidence that earned each one.
#
# Nothing here was approved by opinion. A rule only landed once it caught real
# code in this project, every place it caught was rewritten, and the project
# still worked afterwards. The lines under evidence are where it used to happen.
#
# Delete an entry to drop the rule. It only ever blocked new code, so dropping
# one costs nothing already written.`;

export const RECALL_HEADER = `# What this project has learned

Written by the agent, read by every future session. Committed on purpose: a note
nobody else can see is a note nobody can correct, and a wrong one is worse than
none because it is believed.

Delete an entry the moment it stops being true.`;

export const SECRETS_ALLOW_STUB = `# Values looper is allowed to see in this repository, one per line, each with the
# reason above it. This file is the review: adding a line here is a decision
# somebody can read in a diff, which is why there is no flag to skip the check.
#
# It starts empty, and empty is the right size. A value belongs here only when it
# is genuinely safe to publish — a documented example key, a fixture that was
# never issued. A real credential is taken out of the file and changed at whoever
# issued it, because every clone already has the old one.
`;

export const BASELINE_HEADER = `# Problems that were already here when looper arrived. They are not forgiven and
# they are not exceptions: they are a list of work outstanding, and it can only
# get shorter. looper refuses any new problem, and any problem on a line you
# touch, so this shrinks wherever anyone does anything.
#
# Delete a line here once you have fixed it, or let looper shrink it for you.`;

export const DECISIONS_HEADER = `# Decisions taken with a known cost

Where this project and its own law disagree, on purpose. Append-only.

Most entries are security or legal questions nobody on the team can answer, which
is why they are written down rather than argued. The entry exists so that whoever
can answer one is handed a framed, dated question pointed at the code.

Each entry names the files it rests on and the hash of those files when somebody
last read it, so this document is never trusted to be current: looper recomputes
them and says which entries the code has moved out from under. It never edits the
prose, because what an entry says is a judgement and no tool refreshes a judgement.`;

export const LAW_STUB = `# What this project concedes to looper, and nothing else. Every line here is
# commented out: looper behaves identically whether this file exists or not, and
# a key only does something once you uncomment it and mean it.
#
# generated — directories whose contents nobody wrote. Committed build output
# belongs here. looper reads every word the repository already holds to decide
# which words in a push are new, and a generated tree makes that scan slow and,
# worse, teaches it that machine-made tokens are known words.
# generated = ["dist"]
#
# max_loc — how long a file may be before looper says so.
# max_loc = 500
#
# [entry] files — the files that start the program, where printing is its job.
# [entry]
# files = ["src/main.ts"]
#
# [ts] sanctum — the one file allowed to turn a missing setting into a default.
# [ts] env_files — files that may read the environment directly.
# [ts] trace_symbols — your logger's calls, so writing a failure down counts.
# [ts] loggers — the names your logger is reached by.
# [ts]
# sanctum = "src/config.ts"
#
# [css] palette — the file the colour palette lives in, the one place a colour
# may be written out rather than pointed at. Defaults to tokens.css, matched by
# name in any directory.
# [css] z_max — the highest z-index this project allows.
# [css]
# palette = ["src/styles/tokens.css"]
# z_max = 100
#
# [exempt] — one file, one rule, one reason. A pardon is read in a diff.
# [exempt]
# "src/legacy.ts" = ["TS-TYPE:3"]
#
# [rules] — a rule turned off for this project, which is rarer than it looks.
# [rules]
# disabled = []
`;
