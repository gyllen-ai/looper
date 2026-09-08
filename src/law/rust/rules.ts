import type { Rule } from "../rule.ts";

const NO_VALVE = { kind: "none" } as const;

function knob(key: string, note: string) {
  return { kind: "knob", key, note } as const;
}

export const RUST_RULES: readonly Rule[] = [
  {
    id: "RUST-DECOMPOSITION:1",
    category: "DECOMPOSITION",
    pass: "fast",
    bans: "a file longer than the cap",
    why:
      "a file that grew past one job is hiding the second one, and nobody goes looking for it there. Length is the only signal a rule can see for a file that stopped being about one thing, and the split is cheap now and expensive once three other modules depend on the tangle",
    instead: [
      "lift a group of items that belong together into their own file and `use` them back",
      "cutting at an arbitrary line to get under the cap is the evasion, not the fix",
    ],
    valve: knob("max_loc", "the cap in lines, for the whole project"),
  },
  {
    id: "RUST-DECOMPOSITION:2",
    category: "DECOMPOSITION",
    pass: "fast",
    bans: "anything in `lib.rs` or `mod.rs` that is not wiring — only `mod`, `use`, `extern crate` and attributes belong there",
    why:
      "the switchboard is the map of the crate. Logic parked in the map is logic nobody goes looking for, and an inline `mod x { … }` hides a whole file's worth of code from every rule that works per file",
    instead: [
      "move the item into its own file and declare it: `mod ingest;` then `use ingest::Row;`",
      "an inline `#[cfg(test)] mod tests` is not an exception — tests have their own place",
    ],
    valve: NO_VALVE,
  },
  {
    id: "RUST-DECOMPOSITION:3",
    category: "DECOMPOSITION",
    pass: "fast",
    bans: "a function longer than the cap",
    why:
      "a function that long is several functions nobody named, and in a codebase with no comments the names are the whole of the explanation. Each stage you name is a thing a reader can find, test and change without holding the other four in their head",
    instead: ["name the stages and split them into private helpers in the same file"],
    valve: knob("max_fn_loc", "the cap in lines for one function, for the whole project"),
  },
  {
    id: "RUST-LAYER:1",
    category: "LAYER",
    pass: "fast",
    bans: "a `use` that crosses the declared layer map",
    why:
      "the imports are the architecture. A layer that may only be reached downward stays replaceable; one reached from anywhere is load bearing for the whole crate whether anyone decided that or not, and nothing announces the day it changed",
    instead: [
      "reach downward, or move the thing you need into a layer you may reach",
      "if the map is wrong, change the map on purpose in law.toml rather than around it",
    ],
    valve: knob("[layers]", "each layer names the layers it may import; an empty table means the map is off"),
  },
  {
    id: "RUST-LAYER:2",
    category: "LAYER",
    pass: "fast",
    bans: "a `crate::`, `self::` or `super::` path written anywhere but a `use` statement",
    why:
      "the `use` block at the top is meant to be the complete list of what this file depends on. A path spelled inline halfway down is a dependency no reader sees and no boundary check can catch",
    instead: ["`use crate::ingest::Row;` at the top, then `Row` where you meant it"],
    valve: NO_VALVE,
  },
  {
    id: "RUST-LAYER:3",
    category: "LAYER",
    pass: "fast",
    bans:
      "a `static` whose written type carries something callable at any depth — a function pointer, a `dyn Fn`, `dyn FnMut` or `dyn FnOnce` — bare or wrapped in `OnceLock`, `LazyLock`, `Mutex`, `RwLock`, `Box`, `Vec` or a map",
    why:
      "a call that is looked up at runtime cannot be followed by reading. The compiler stops being able to tell you who calls what, and so does anyone tracing a bug backwards from the thing that went wrong",
    instead: [
      "call the function by name",
      "if the choice is real, make it an enum and match on it — the arms are then a list a reader can see",
    ],
    valve: NO_VALVE,
  },
  {
    id: "RUST-ERROR:1",
    category: "ERROR",
    pass: "fast",
    bans:
      "reading a fallible value without handling it. The whole family: `unwrap`, `expect`, `unwrap_err`, `expect_err`, `unwrap_or`, `unwrap_or_else`, `unwrap_or_default`, `ok()`, `err()`, `or()`, `or_else()`, `map_or()`, `map_or_else()`, every `is_ok` / `is_some` / `is_none_or` predicate, `matches!` on one, `if let` and `while let` on `Some`/`Ok`/`Err`/`None`, `let _ =`, an untyped `let _name =`, `==` or `!=` against `None` or `Some(..)`, `drop(call())`, and `let … else` on `Ok`/`Err`",
    why:
      "each one answers a failure without saying so. `unwrap` turns it into a crash in front of whoever is using the thing; `unwrap_or` turns it into a value that looks exactly like a real one, one line later. The person who sees the result has no way to know anything went wrong",
    instead: [
      "`?`, and let the caller decide",
      "`.ok_or(NotFound { id })?` turns a missing Option into an error that says which",
      "`match` with lawful arms — bind the payload, and every arm passes it on, crashes, or writes it down",
      "`let Some(row) = table.get(key) else { return Err(NotFound { id }) };` — absence, named",
      "the predicate forms are the quietest of all: `is_ok()` reads the answer and throws the evidence away",
    ],
    valve: NO_VALVE,
  },
  {
    id: "RUST-ERROR:2",
    category: "ERROR",
    pass: "fast",
    bans:
      "throwing the payload away: `Ok(_)`, `Err(_)`, `Some(_)`, a `_ =>` arm or a catch-all binding in a match on a fallible, an `Err` you bind and never read, and `_` anywhere in a closure's parameters",
    why:
      "the payload is the evidence. Matching on the shape and discarding what it carried means the program knew exactly what happened and chose not to keep it, and the report months later says only that it was slow that week",
    instead: [
      "bind it: `Err(cause) => return Err(Failed::Read(cause))`",
      "if it truly does not matter, say which case it is by name rather than with `_`",
    ],
    valve: NO_VALVE,
  },
  {
    id: "RUST-ERROR:3",
    category: "ERROR",
    pass: "fast",
    bans:
      "an `Err` arm that answers with a made-up value: a literal, `None`, `Ok(())`, an empty collection, `Vec::new()`, `String::new()`, `Default::default()`",
    why:
      "one line later nothing can tell the made-up value from a real one, so a database that was down becomes an empty list of rows and a parse that failed becomes a zero in a report. The failure is gone and the wrong answer travels",
    instead: [
      "propagate it with `?`",
      "return an error that names what could not be done",
      "log it and recover in the open, so the recovery is a thing someone can see happened",
    ],
    valve: NO_VALVE,
  },
  {
    id: "RUST-ERROR:4",
    category: "ERROR",
    pass: "fast",
    bans: "an `Err` arm that does none of the three things an `Err` arm may do",
    why:
      "a failure nobody hears about is a bug reported months later as something else entirely. There are three doors out and no fourth: pass it on, stop the program, or read the error and write it down before recovering. An arm that does none of those has decided the failure did not happen",
    instead: [
      "pass it on: `?`, or `return Err(CouldNotRead { path, cause })`",
      "stop: `panic!` or `process::exit` — loud, immediate, and honest about being a dead end",
      "observe it, then recover: `Err(cause) => { tracing::warn!(?cause, \"cache unreadable, counting again\"); count(source) }`",
    ],
    valve: NO_VALVE,
  },
  {
    id: "RUST-ERROR:5",
    category: "ERROR",
    pass: "fast",
    bans: "a crate root that does not appoint its deputies",
    why:
      "the compiler will catch most of this law for you, for free, on every build — but only for the lints the crate actually turns on. A crate that appoints none is one where every rule below has to be caught by looper instead, on a machine that may not be running it. This is the cheapest strong rule there is: a few lines of configuration buy a second reader who never gets tired",
    instead: [
      "declare them at the crate root, denied rather than warned, so they stop the build rather than scroll past",
      "add to the list freely; every name you take off is a rule you are choosing to enforce by hand",
    ],
    valve: knob("[deputies] attrs", "the attributes a crate root must carry; add to it freely, and know what each removal costs"),
  },
  {
    id: "RUST-ERROR:6",
    category: "ERROR",
    pass: "fast",
    bans:
      "handing something fallible to iteration, where the standard library drops the failures without an arm. Always: `.flatten()`, `.filter_map(..)`, `.flat_map(..)` — deleting what failed is their job. And `.iter()`, `.into_iter()`, `.drain(..)`, `.chain(..)`, `.extend(..)`, `.zip(..)`, `from_iter(..)` when what goes in is fallible — a `Some`/`Ok`/`Err` constructor, or a call to `get`, `first`, `last`, `pop`, `next`, `peek`, `find`, `parse`, `recv`, `lock`, `checked_*` and their like",
    why:
      "the failures do not stop anything and do not appear anywhere. Nine rows load, the tenth was malformed, and the report shows nine rows with no sign that a tenth was ever attempted. This is the quietest way a program can be wrong and still look finished",
    instead: [
      "`collect::<Result<Vec<_>, _>>()?` — one failure stops the batch and says so",
      "partition them and report the failures explicitly, if partial success is the intent",
    ],
    valve: NO_VALVE,
  },
  {
    id: "RUST-ERROR:7",
    category: "ERROR",
    pass: "fast",
    bans: "`catch_unwind`, `set_hook`, `take_hook`, `panic_any` and `AssertUnwindSafe` outside the file that starts the program",
    why:
      "catching a panic in a library turns a crash — loud, immediate, with a stack — into something the caller never hears about, and leaves whatever was half-done half-done. A panic means an assumption broke; the fix is the assumption, not a net under it",
    instead: [
      "return a `Result` and let the caller decide",
      "if the boundary genuinely needs a net, the entry point is where it goes, once",
    ],
    valve: NO_VALVE,
  },
  {
    id: "RUST-ERROR:8",
    category: "ERROR",
    pass: "fast",
    bans:
      "fallible work inside `fn drop`: a `?`, an `Ok`/`Err`/`Some`/`None` anywhere in it, calls that hand back something fallible — `get`, `pop`, `next`, `parse`, `lock`, `recv`, `checked_*`, `strip_*` — and the file work `create`, `open`, `write`, `write_all`, `flush`, `create_dir_all`, `copy`, `rename`, `read`",
    why:
      "clean-up on the way out has nowhere to report to. `drop` cannot return anything and cannot be waited for, so a failure there is swallowed by the shape of the thing rather than by anyone's mistake — the connection you asked it to close is still open and nobody will ever be told",
    instead: [
      "close it explicitly where someone can still handle the failure: `connection.close().await?`",
      "keep `drop` for the release that cannot fail",
    ],
    valve: NO_VALVE,
  },
  {
    id: "RUST-TYPE:1",
    category: "TYPE",
    pass: "fast",
    bans:
      "an error type that says nothing — `String`, `&str`, `dyn` anything, `Box<dyn Error>`, `anyhow`, `eyre`, `()`, a bare primitive or a bare generic — in **any** written type position: a return, a parameter, a struct field, a local annotation, a generic argument",
    why:
      "the caller cannot match on it, so they cannot handle one failure differently from another. Every error becomes the same error, the only thing left to do with it is log it and give up, and the type signature — which is the one part of the promise the compiler keeps — has told them nothing",
    instead: [
      "an enum with a variant per thing that can go wrong, deriving `thiserror::Error`",
      "keep the cause: `#[from]` or a `source` field, so the chain survives",
    ],
    valve: NO_VALVE,
  },
  {
    id: "RUST-TYPE:2",
    category: "TYPE",
    pass: "fast",
    bans:
      "a `Result` with its error half hidden: `type MyResult<T> = Result<T, MyError>`, a one-argument `Result<T>`, or `io::Result<T>`",
    why:
      "the alias saves eight characters and costs the reader the answer to the only question that matters at a call site: what can go wrong here. They have to go and look it up, so they do not, so they handle it generically",
    instead: ["write both halves: `Result<Row, ReadFailed>`"],
    valve: NO_VALVE,
  },
  {
    id: "RUST-TYPE:3",
    category: "TYPE",
    pass: "fast",
    bans: "an `Option` in an argument or return type of a public function",
    why:
      "whoever calls it cannot tell the three cases apart: there was no such thing, there was one and it was empty, or the lookup never happened. So they guess, and they guess whichever way makes their code shorter. Absence needs a name before it can be handled",
    instead: [
      "return an error when absence is a failure: `Err(NotFound { id })`",
      "name both cases when both are real answers: an enum with `Found` and `None` arms",
      "keep it private — this is about what you promise other modules, not how you work inside one",
    ],
    valve: NO_VALVE,
  },
  {
    id: "RUST-TYPE:4",
    category: "TYPE",
    pass: "fast",
    bans: "an `as` cast",
    why:
      "it truncates, wraps, rounds and changes sign without a word, and the signature says nothing about any of it. A count that outgrew a `u32` becomes a small number rather than an error, and every total after it is wrong with nothing anywhere recording that it happened",
    instead: [
      "`u32::try_from(count)?` — it can say it will not fit",
      "`f64::from(small)` where the conversion genuinely cannot lose anything",
    ],
    valve: NO_VALVE,
  },
  {
    id: "RUST-TYPE:5",
    category: "TYPE",
    pass: "fast",
    bans:
      "arithmetic or decoding that turns a failure quietly into a value: `wrapping_*`, `saturating_*`, `overflowing_*`, and the lossy decoders `from_utf8_lossy`, `from_utf16_lossy`, `to_string_lossy`",
    why:
      "a price that overflowed becomes a small price rather than a refusal; a subtraction that went below zero becomes zero rather than an error. The program carries on with a number that is simply wrong, and the only place it was ever knowable was the line that chose to look away",
    instead: [
      "`checked_add(other).ok_or(Overflowed)?` — say it could not",
      "`saturating_*` is the right answer sometimes; when it is, the name should say so at the call site",
    ],
    valve: NO_VALVE,
  },
  {
    id: "RUST-DEAD:1",
    category: "DEAD",
    pass: "fast",
    bans: "`#[allow(…)]`, `#[expect(…)]` and `#[cfg_attr(…, allow(…))]` naming `dead_code`, `unused` anything, or `unreachable_code`",
    why:
      "the compiler is the one reader here that cannot be talked round. Silencing it does not fix what it saw, it only makes the next person believe there was nothing to see. This is also the rule that keeps every deputy honest, because a lint that can be muted line by line is not on",
    instead: [
      "delete the thing that is unused — that is what the compiler is telling you",
      "if it is genuinely needed and genuinely unused today, it is not needed today",
    ],
    valve: NO_VALVE,
  },
  {
    id: "RUST-DEAD:2",
    category: "DEAD",
    pass: "fast",
    bans: "comments, all of them — `//`, `/* */`, `///`, `//!` and `#[doc]`",
    why:
      "nothing checks a comment. The code around it changes and the comment stays, so it slowly becomes a confident description of something that is no longer true — and it is the part a reader believes, because it is the part written in words they understand. A name cannot go stale that way, because the compiler reads it too",
    instead: [
      "a rule about a value becomes a type, or a check",
      "an explanation becomes a name: `rename_orders_older_than_a_year()` needs no comment above it",
      "the reason you did it goes in the commit message, where it is dated and attached to the change",
      "longer background goes in a `.md` file beside the code, which looper never asks you to hold in your head",
    ],
    valve: NO_VALVE,
  },
  {
    id: "RUST-DEAD:3",
    category: "DEAD",
    pass: "fast",
    bans: "`todo!`, `unimplemented!` and `unreachable!`",
    why:
      "half-built code that compiles is worse than code that is missing. It passes every check, it looks finished to anyone reading the list of what exists, and it fails in front of whoever is using the thing rather than in front of you. Missing code fails immediately and loudly, which is the cheapest failure there is",
    instead: [
      "write it now, even roughly, so it does something real",
      "delete it and let the call fail to compile — the loudest and cheapest error available",
    ],
    valve: NO_VALVE,
  },
  {
    id: "RUST-DEAD:4",
    category: "DEAD",
    pass: "fast",
    bans: "`use path::*`",
    why:
      "nobody can tell where a name came from, and renaming something upstream silently changes what your file means without your file being touched. It also hides which part of the project you actually depend on, which is how a layer boundary gets crossed without anyone seeing it",
    instead: ["name what you use: `use crate::orders::{Order, OrderLine};`"],
    valve: NO_VALVE,
  },
  {
    id: "RUST-TRUTH:1",
    category: "TRUTH",
    pass: "fast",
    bans: "a default born outside the one file that gathers settings — an absence arm that resolves to a value instead of passing the absence on",
    why:
      "two places answering \"what happens when nobody said\" means the answer is whichever one ran last, and neither place knows about the other. Nobody can say what the program does when a value is missing, and the value that was never given is also the one nobody tested",
    instead: [
      "pass the absence on and let the settings file answer it, once",
      "if absence is a real answer here, name it in the type so the reader sees it",
    ],
    valve: knob("[truth] sanctum", "one file name, not a list — the point is that there is one place"),
  },
  {
    id: "RUST-TRUTH:2",
    category: "TRUTH",
    pass: "fast",
    bans:
      "reading the outside world outside the declared files: `std::env::var`, `vars`, `var_os`, `args`, `args_os`, `set_var`, `remove_var`; the `env!` and `option_env!` macros, which do the same read at build time and bake the answer into the program; and reaching the same door by path, such as `/proc/self/environ`",
    why:
      "settings enter a program in one place or they enter in every place. Scattered, nobody can answer what the program needs in order to run, a missing one is found by whichever line happens to execute first, and a test cannot hand it anything different",
    instead: [
      "read it in the settings file, put it in a typed struct, and pass that struct down",
      "`let config = Config::from_env()?;` once, at the top",
    ],
    valve: knob("[truth] env_files", "the files allowed to touch the outside world"),
  },
  {
    id: "RUST-LOG:1",
    category: "LOG",
    pass: "fast",
    bans: "`println!`, `print!`, `eprintln!` and `eprint!` outside the file that starts the program, and `dbg!` anywhere",
    why:
      "what a program prints is its output, and it belongs to whoever ran it. A library that prints has decided for every future caller, including the one piping the output into something else. `dbg!` is the one that reaches production, because it is written to be removed and removing it is a step nobody schedules",
    instead: [
      "`tracing::info!(order_id, \"order placed\")` — structured, and the caller chooses where it goes",
      "hand the failure back and let the entry point decide what to print",
    ],
    valve: knob("[truth] trace_symbols", "the logging calls that count; name your own, never remove the requirement"),
  },
  {
    id: "RUST-LOG:2",
    category: "LOG",
    pass: "fast",
    bans: "taking the output handles directly — `io::stdout()`, `io::stderr()`, or `Stdout` and `Stderr` in any type position — outside the file that starts the program",
    why:
      "this is the same decision as printing, taken one level down where the rule about printing cannot see it. A library holding a handle to standard output has still decided for its caller, and has done it in a way that reads as plumbing rather than as a choice",
    instead: ["write to something the caller passed in, or hand the text back and let them place it"],
    valve: NO_VALVE,
  },
  {
    id: "RUST-LOG:3",
    category: "LOG",
    pass: "fast",
    bans: "a value interpolated into a log message instead of carried as a field — `info!(\"saved {id}\")` or `info!(\"saved {}\", id)` in any `tracing` or `log` macro",
    why:
      "a message with the value baked in is a sentence, and every line is a different sentence. The only way to find them later is to guess the wording, and the value cannot be filtered, counted or grouped by anything. A field keeps the message constant and the value queryable, which is the difference between a log you read at three in the morning and one you can ask a question of",
    instead: [
      "`tracing::info!(order = %id, \"saved\")` — the message is a constant, everything that varies sits beside it",
      "`tracing::warn!(attempt, delay_ms, \"retrying\")` — several fields, still one message",
      "a value nobody will ever query does not need to be in the line at all",
    ],
    valve: NO_VALVE,
  },
  {
    id: "RUST-TESTS:1",
    category: "TESTS",
    pass: "fast",
    bans: "`#[test]` and `#[cfg(test)]` under `src/`",
    why:
      "a test that sits inside the module can reach what the module keeps private, so it tests the inside rather than the promise. Then the inside cannot be changed without changing the tests, which is the opposite of what tests are for — and the public surface grows to keep them reachable",
    instead: [
      "put it in `tests/`, where it can only reach what a real caller can reach",
      "if a test needs something private, that is the design telling you the private thing wants a name of its own",
    ],
    valve: NO_VALVE,
  },
  {
    id: "RUST-ERROR:9",
    category: "ERROR",
    pass: "fast",
    bans: "a file that cannot be read as Rust at all",
    why:
      "the Rust law is judged a crate at a time, so a file nothing can parse takes the whole crate down with it. Every other file around it goes unjudged, and without this rule the report says nothing to fix — which is indistinguishable from a crate with nothing wrong in it. A file in this state will also not build",
    instead: [
      "fix what the parser points at on the line named, and the rest of the crate can be seen again",
      "if the file is not Rust, give it the extension it actually is",
    ],
    valve: NO_VALVE,
  },
];

export type Known =
  | { readonly kind: "known"; readonly rule: Rule }
  | { readonly kind: "unknown" };

export function rustRuleFor(id: string): Known {
  const held = RUST_RULES.find((one) => one.id === `RUST-${id}`);
  return held === undefined ? { kind: "unknown" } : { kind: "known", rule: held };
}
