# Where this came from

This directory is looper's Rust law: the part that reads `.rs` files and judges
them. looper's own code is TypeScript, so this half is Rust, because reading
Rust properly means using `syn`, and `syn` is a Rust crate.

**It was not written here.** It is a copy of Zmole Cristian's `lawkeeper`
(<https://github.com/ZmoleCristian/lawkeeper>), taken at commit
`4953860bd3eb38ea764884af656c83f46b5684f5`, which is the revision that had been
reviewed and run in production in another project before it was brought here.

It is licensed **0BSD** — see `LICENSE`. That licence permits copying,
modification and redistribution with no attribution required. This file exists
anyway, because knowing where 3,900 lines of a repository came from is worth
more than the licence obliges.

**What changed on the way in.** The package is named for what it does here
rather than for the project it came from: the crate is `looper-rust-law`, the
library is `rust_law`, and the program looper runs is `looper-rust`. Its own
command-line and MCP surfaces were dropped — looper is the only caller, and it
drives this over one narrow interface. Nothing else in the source was altered.

**What it does not include.** `rustgraph`, the call-graph engine the earlier
project used beside it, is not here. That serves a `reuse` capability looper has
not built and has deliberately deferred, and the law engine does not depend on
it: its dependencies are `syn`, `proc-macro2`, `serde` and `toml`, and nothing
else.

**What we have changed in it.** This is our copy and it is ours to fix. Every
change is listed here so that whoever copies a newer lawkeeper in knows what to
put back, and `tests/invariants.test.ts` fails until they do.

One attribute in
`src/config.rs`: `#[serde(default, deny_unknown_fields)]` on `LawConfig` became
`#[serde(default)]`. With it, any top-level table the engine does not own — the
`[entry]` and `[ts]` sections looper's TypeScript half reads out of the same
file — made the engine reject the whole `law.toml`, and it failed as "could not
read law.toml" rather than as anything naming the cause. The four
`deny_unknown_fields` on the inner tables are untouched, because there a typo
really is a concession nobody notices: `sanctm` is still refused by name.

**Two loops and one function in `src/config.rs`, 2026-08-29.** `validate`
refused a `law.toml` whose `[exempt]` or `[rules] disabled` named a rule the
engine did not know, and every id of another language (`TS-ERROR:3`,
`CSS-TRUTH:1`, `PY-ERROR:4`) and looper's own spelling of the engine's rules
(`RUST-TRUTH:1`) was such an id: the whole file came back as "could not read
law.toml" and every `.rs` file in the project went unjudged, which looper
reported as unread rather than clean but a project could carry for weeks. Now
`engine_owns` decides which ids the engine can vouch for: `RUST-` followed by a
bare id, or a bare id in one of its own categories. Those are refused when
unknown exactly as before, so a typo in our own spelling is still named, and an
id of another language passes through to the half that owns it. `permits`
accepts both spellings. `tests/rust.test.ts` drives the built engine over a
crate whose pardons name three other languages and then our own spelling.

**The one line in the manifest that is ours.** `[workspace]`, empty, at the top
of `Cargo.toml`. Without it, a looper checked out inside a Rust project is
claimed by that project's workspace and cargo refuses to build it at all —
`current package believes it's in a workspace when it's not`. An empty workspace
table makes this crate its own root, so no ancestor manifest can claim it, and
every consumer is spared discovering `exclude` for their own `Cargo.toml`. It
changes nothing about the copied source. Added 2026-08-18 from adopter issue #3,
which arrived with the fix already measured at 16.56s for a clean release build.

**The one file here that is ours.** `src/bin/looper-rust.rs` is written by us,
not copied, and it is the only interface looper uses:

```
looper-rust <root>              judge the whole crate
looper-rust <root> <file>...    judge only these files
looper-rust --commands <root>   list the Tauri commands it declares
```

Output on stdout is one JSON object — `{"violations":[{"rule","file","line"}]}`,
`{"commands":[…]}`, or `{"error":"…"}` with a non-zero exit. Nothing else is
ever printed, because looper parses it.

It carries no comments, for the same reason nothing else here does. This
directory is outside the law by default — it holds somebody else's code — and
that file is inside it only because it has to compile with the crate. A test
judges it anyway.

**What it used to miss, fixed here on 2026-08-18.** Found by the audit of
2026-08-17, and left alone while this was somebody else's copy:

- `Err(_) => "".to_string()` — `ERROR:3` names `String::new()` and an empty
  collection; this is the same empty string, built differently.
- `panic!("not implemented yet")` — `DEAD:3` names `todo!`. Its own reason is
  half-built code that compiles, which this is. Narrower than banning every
  `panic!`, which `ERROR:4` explicitly permits as the crash door.
- `let g = Option::unwrap; g(x)` — `ERROR:1` reads the method, not an alias.
- `Command::new("printenv")` — `TRUTH:2` names `std::env` and the `env!` macros,
  not the environment reached through a subprocess.
- `x == Delimiter::None` — `ERROR:1` bans comparing against `None`, meaning
  `Option::None`. A syntax-only reader cannot tell one `None` from another, and
  this fires toward strictness.

All five are closed — see finding 70. The fifth was not a miss at all but a
false positive: `ERROR:1` read every type's `None` variant as `Option::None`,
which on 40 crates from a cargo registry was 37 wrong verdicts, in `syn`,
`chrono`, `serde_derive` and others. A `None` is Option's when it stands alone
or is written `Option::None`, and that is now what both the typed reader and the
token scan check.

**Four rules that were blind inside a macro argument — fixed here, 2026-08-18.**
`TYPE:4` (`as`), `TRUTH:2` (`std::env`), `DEAD:3` (`todo!`) and `LAYER:2` (a
`crate::` path) went silent inside `format!`, `assert_eq!`, `tracing::info!` or
any `macro_rules!` that passes its argument through, while the same expression on
its own line fired. Reported by an adopter and reproduced here.

They match on typed syntax, which a macro's tokens never become — so they now
also read the token stream, the way `ERROR:1`, `TYPE:5`, `LOG:2` and `ERROR:7`
always did. Three scanners were added to `patterns.rs`:
`scan_tokens_for_casts`, `scan_tokens_for_paths` and `scan_tokens_for_env_calls`,
and `todo!` reuses the macro scanner that already existed. A `use` statement
inside a macro body is skipped, so a rename is not read as a cast.

Measured before shipping, on 40 crates from `~/.cargo/registry` that nobody here
wrote — 2,538 files: **195 new hits, spread over 18 crates**. Ten were read line
by line and every one is the shape the rule bans: `index.length as usize` inside
`vec!`, `crate::Protocol` inside a macro argument, `MAX_OL as i32` inside
`debug_assert!`. No false positive was found.

`tests/invariants.test.ts` fails if a newer copy of lawkeeper arrives without
these scanners.

**`TYPE:4` read a type-position `as` as a cast — fixed here, 2026-08-18.** The
macro token scan added above fired on the bare word `as` and never looked at what
followed it. In a macro's tokens `as` is not always a cast: `<T as Trait>::method`
is a qualified path, `parse_macro_input!(x as Args)` is syn's own grammar, and
`sqlx::query!("...", role as &str)` is a column type override. The rule's own ban
text is about numbers only — "it truncates, wraps, rounds and re-signs in
silence" — and none of those three can truncate anything.

`scan_tokens_for_casts` now fires only when the token after `as` names a numeric
primitive, `_`, or begins a pointer type. Typed syntax is untouched: a real
`ExprCast` still fires whatever it casts to, because there syn has already told
us it is a cast. The cost of the narrower token rule is a numeric cast written
through a type alias or a path (`as std::os::raw::c_int`, `as MyLen`) inside macro
tokens, which now goes unjudged.

Measured on 599,944 lines of Rust from `~/.cargo/registry` that nobody here
wrote, the old engine and the new one run over the same corpus: **33 hits
removed, 0 added, no other rule moved.** All 33 were read by hand and all 33 are
false positives — 17 `<#ty as Trait>::…` inside `quote!` in
`attribute-derive-macro`, 12 `<Self as Trait>::…` inside `mac!` in `async-trait`,
and 4 `parse_macro_input!(x as Args)`. **1,077 `TYPE:4` hits still stand**,
sampled across crates and every one a real cast, including inside macros
(`bit_width as usize` inside `debug_assert!`). See finding 90.

**A shape reader for `looper report` — added here, 2026-08-18.** New file,
`src/skeleton.rs`, and a `--shape <file> <line> <depth>` mode on the binary. It
lexes the file with `proc_macro2`, keeps the tokens that start on the asked-for
line, and answers with their kinds: `Ident` carries a numbered stand-in unless the
word is Rust's own grammar, `Literal` carries `value-removed`, `Group` carries
which bracket opened it, and the root is the kind of item the line sits in
(`ItemFn`, `ItemImpl`, and the rest). No identifier, no literal and no path
survives. A line with no tokens is refused by name rather than guessed at.

**A rule for a value baked into a log message — added here, 2026-08-19.**
`Rule::ValueInMessage`, its help text, a pattern in `patterns.rs` and a visit in
`visitor.rs`. It fires on a `tracing` or `log` macro whose message interpolates a
value — `info!("saved {id}")` and `info!("saved {}", id)` — and stays silent on
the field form `info!(order = %id, "saved")`, on a message carrying no value, and
on an escaped `{{literal}}` brace.

Measured before it was taken: 4,000 files and 1,124,346 lines from
`~/.cargo/registry`, 205 hits, 25 read by hand and every one true — tower-http,
quinn, reqwest, zlib-rs, tauri-runtime and zune-jpeg, each interpolating a value
into the message. The LOG:3 row in `docs/PLAN.md` carries the rest.

**A line that starts nothing is answered rather than refused — changed here,
2026-08-18.** `shape_at` collected the tokens that begin on the asked-for line and
refused when there were none, which is a blank line inside an item, or a line a
rule named wrongly. It now asks `syn` which item contains the line, re-reads that
item's own first line, and reports `startsAt` beside the shape so the report can
say where the item really begins. A line inside no item at all is still refused by
name. See finding 99 and issue #58.

This exists because `looper report`, the way an adopter argues a rule is wrong,
read every file through the TypeScript parser and answered "the file could not be
read as TypeScript" for every `.rs` file. Twenty-nine Rust rules were judged at
full strength and none of them could be disputed. See finding 92.

`tests/invariants.test.ts` fails if a newer copy of lawkeeper arrives without this
file.

**The crates are here too, since 2026-08-19.** `vendor/` holds the source of all
eighteen crates this depends on, and `.cargo/config.toml` points cargo at them.
Before that, `cargo build --offline` never reached out but read whatever was in
the machine's `~/.cargo/registry`, so on a machine without one the build simply
failed. Proved by building with `CARGO_HOME` set to an empty directory: finished
in 15.02s, binary produced, nothing fetched. `tests/invariants.test.ts` fails if
a crate goes missing, if a nineteenth arrives, or if anything here names
`TcpStream`, `TcpListener`, `UdpSocket`, `socket2` or `libc::socket`.

Run `cargo vendor --offline vendor` from this directory after changing a
dependency, and argue the dependency in `docs/PLAN.md` first.

**Updating it.** Nothing fetches this. If lawkeeper gains something worth having,
someone copies the new source in by hand, deliberately, re-applies the changes
listed above, and says so in the commit. That is the price of never downloading
anything, and it is paid on purpose.
