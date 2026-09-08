use crate::violation::Rule;

pub fn help_for(rule: Rule) -> &'static str {
    match rule {
        Rule::Loc => LOC,
        Rule::Switchboard => SWITCHBOARD,
        Rule::FnLoc => FN_LOC,
        Rule::LayerBreach => LAYER_BREACH,
        Rule::InlinePath => INLINE_PATH,
        Rule::RuntimeDispatch => RUNTIME_DISPATCH,
        Rule::SilentOp => SILENT_OP,
        Rule::DiscardedPayload => DISCARDED_PAYLOAD,
        Rule::StubValue => STUB_VALUE,
        Rule::VanishedError => VANISHED_ERROR,
        Rule::MissingDeputy => MISSING_DEPUTY,
        Rule::FallibleIterated => FALLIBLE_ITERATED,
        Rule::CaughtCrash => CAUGHT_CRASH,
        Rule::DropFallible => DROP_FALLIBLE,
        Rule::ErasedErrorType => ERASED_ERROR_TYPE,
        Rule::ResultShorthand => RESULT_SHORTHAND,
        Rule::NamedOption => NAMED_OPTION,
        Rule::CastErasure => CAST_ERASURE,
        Rule::SilentMangle => SILENT_MANGLE,
        Rule::DeadSuppression => DEAD_SUPPRESSION,
        Rule::Comment => COMMENT,
        Rule::Unfinished => UNFINISHED,
        Rule::GlobImport => GLOB_IMPORT,
        Rule::ScatteredDefault => SCATTERED_DEFAULT,
        Rule::EnvOutsideSanctum => ENV_OUTSIDE_SANCTUM,
        Rule::FallbackRoute => FALLBACK_ROUTE,
        Rule::StrayPrint => STRAY_PRINT,
        Rule::ValueInMessage => VALUE_IN_MESSAGE,
        Rule::StrayHandle => STRAY_HANDLE,
        Rule::InlineTest => INLINE_TEST,
    }
}

const LOC: &str = concat!(
    "file is over the line cap.\n",
    "    why: a file that outgrew one job is hiding the second one, and length is the only signal\n",
    "    a syntax-only law has for a module that stopped being about one thing.\n",
    "    legal: split by responsibility — lift a coherent group of items into its own file and\n",
    "    `use` it back. cutting at an arbitrary line to get under the cap is the evasion, not the fix.\n",
    "    valve: law.toml `max_loc` (default 800), project-wide.",
);

const SWITCHBOARD: &str = concat!(
    "lib.rs / mod.rs holds something that is not wiring. only `mod`, `use`, `extern crate` and\n",
    "    attributes live here.\n",
    "    why: the switchboard is the map of the crate — logic parked in the map is logic nobody\n",
    "    goes looking for, and an inline `mod x { .. }` hides a whole file's worth of code from\n",
    "    every file-level rule.\n",
    "    legal: move the item into its own file and declare it: `mod ingest;` + `use ingest::Row;`.\n",
    "    an inline `#[cfg(test)] mod tests` is not an exception — tests live in tests/ (TESTS:1).",
);

const FN_LOC: &str = concat!(
    "function is over the fn line cap.\n",
    "    why: a function that long is several functions that were never named, and the names are\n",
    "    the documentation this law still lets you keep.\n",
    "    legal: name the stages and split them into private helpers in the same file.\n",
    "    valve: law.toml `max_fn_loc` (default 80), project-wide.",
);

const LAYER_BREACH: &str = concat!(
    "import crosses the declared layer map.\n",
    "    why: the import graph is the architecture. unenforced, it is a diagram; an upward or\n",
    "    sideways import is a cycle waiting for the second commit.\n",
    "    legal: point the dependency down the map — the lower layer never learns the higher one\n",
    "    exists | move the code to the layer it belongs to | pass the thing you reached for in as\n",
    "    a parameter, so the caller keeps the dependency.\n",
    "    valve: law.toml [layers] — `layer = [layers it may import]`. an empty table makes the rule\n",
    "    inert, which is a decision to have no architecture, not an absence of one.",
);

const INLINE_PATH: &str = concat!(
    "crate:: / self:: / super:: qualified path outside a `use` statement.\n",
    "    why: a file's imports are meant to be the complete list of what it depends on. an inline\n",
    "    path grows a cross-layer dependency that no header shows and no layer check can see.\n",
    "    legal: hoist `use crate::ingest::Row;` to the top of the file and reference the short name.\n",
    "    a name that would collide gets renamed at the import: `use crate::ingest::Row as IngestRow;`.",
);

const RUNTIME_DISPATCH: &str = concat!(
    "a `static` whose written type carries a callable: a fn pointer (`fn(..) -> T`) or a\n",
    "    `dyn Fn` / `dyn FnMut` / `dyn FnOnce`, at any depth — bare, or wrapped in OnceLock,\n",
    "    LazyLock, Mutex, RwLock, AtomicPtr, Box, Vec, HashMap.\n",
    "    why: the import graph is the law, and a global handler slot inverts it at runtime. a leaf\n",
    "    module calls up into its own caller with no import, no signature and nothing for LAYER:1 to\n",
    "    see, and it inherits whatever powers the installed function has. registries like this are\n",
    "    how a module acquires permissions its own file never asked for.\n",
    "    legal: call the thing directly through a `use` — then the edge exists in the graph | if the\n",
    "    caller must supply behaviour, take it as a parameter: `fn drain<F: Fn(&str) -> usize>(events:\n",
    "    &[&str], upward: F)`. a generic Fn bound on a normal fn is a visible contract and is never\n",
    "    judged here — only statics are | if the choice is data, make it data: match an enum and call\n",
    "    the arms by name.",
);

const SILENT_OP: &str = concat!(
    "silent handling of a fallible value. banned: unwrap / expect / unwrap_err / expect_err /\n",
    "    unwrap_or / unwrap_or_else / unwrap_or_default / ok / err / or / or_else / map_or /\n",
    "    map_or_else / is_ok / is_err / is_some / is_none / is_some_and / is_ok_and / is_err_and /\n",
    "    is_none_or, `matches!` on a fallible, if-let and while-let on Some|Ok|Err|None, `let _ =`,\n",
    "    untyped `let _name =`, ==/!= against None|Some(..)|Ok(..)|Err(..), `drop(call())`, and\n",
    "    let-else on Ok|Err — the else block cannot bind the error, so use match.\n",
    "    why: every one of these turns a failure into control flow that leaves no trace. the\n",
    "    predicate forms are the quietest: `is_ok()` reads the answer and drops the evidence.\n",
    "    legal: `?` | `return Err(YourError::Missing)` | `.ok_or(YourError::Missing)?` on an Option |\n",
    "    `match` with lawful arms — bind the payload, and every arm propagates, crashes or observes |\n",
    "    let-else on Some: `let Some(v) = table.get(key) else { return Err(YourError::Missing) };` |\n",
    "    end a loop on absence: `loop { let Some(v) = stack.pop() else { break }; total += v; }` |\n",
    "    presence with continuation: `for x in opt.iter() { .. }` — a 0-or-1 walk over a value that\n",
    "    did not fail.\n",
    "    RAII guard: a NAMED binding whose written type is declared — `let _guard: MutexGuard<u8> =\n",
    "    acquire();`. `let _: T = ..` is never a guard: it drops on the spot.\n",
    "    valve: law.toml [error] guard_types — the declared list of types allowed as `let _name: T`.\n",
    "    a real guard is worth one visible line in the diff, which is why the list is declared and\n",
    "    not guessed.",
);

const DISCARDED_PAYLOAD: &str = concat!(
    "the payload is the evidence and it was thrown away. banned: `Ok(_)` / `Err(_)` / `Some(_)`,\n",
    "    a `_ =>` arm or a bare catch-all binding in a match on a fallible, an Err binding that is\n",
    "    bound and never read, and `_` anywhere in a closure parameter list.\n",
    "    why: a wildcard claims the case was handled when nothing was handled. the error you did not\n",
    "    read is the one your user reads to you over the phone.\n",
    "    legal: bind it and use it — `Err(e) => return Err(YourError::Read(e))` |\n",
    "    `Err(e) => { tracing::warn!(error = %e, \"cache unreadable, recounting\"); recount(src) }` |\n",
    "    if an adaptor hands you an argument you refuse to look at, that adaptor is the wrong one:\n",
    "    take the value and match on it.",
);

const STUB_VALUE: &str = concat!(
    "an Err arm fabricated a value: a literal, `None`, `Ok(())`, an empty collection,\n",
    "    `Vec::new()` / `String::new()` / `Default::default()`.\n",
    "    why: failure never becomes data. one line downstream the fabricated value is\n",
    "    indistinguishable from a real one — that is how a parse error becomes a 0 in a report and\n",
    "    a missing file becomes an empty list of users. a warn! next to it does not buy it back.\n",
    "    legal: `Err(e) => return Err(YourError::Read(e))` | crash on the spot with `panic!` if the\n",
    "    process genuinely cannot continue | if \"empty\" is a real domain answer, it is the caller's\n",
    "    call to make: hand them the Err and let them write the fallback where the meaning is known.",
);

const VANISHED_ERROR: &str = concat!(
    "an error vanished. every Err arm leaves through exactly one of three doors:\n",
    "    propagate — `?` or `return Err(..)` | crash — `panic!` / `process::exit` / `process::abort` |\n",
    "    observed recovery — consume the error AND call a blessed trace symbol. there is no fourth door.\n",
    "    why: a recovery nobody can see is a bug that gets reported as \"it was just slow that week\".\n",
    "    legal observation: `Err(e) => { tracing::warn!(error = %e, \"cache unreadable, recounting\");\n",
    "    recount(src) }` — the binding is read AND the symbol emits.\n",
    "    the observation cannot be counterfeit: a symbol counts only spelled in full (`tracing::warn!`)\n",
    "    or bare after exactly `use tracing::warn;`, only if its root crate is a real dependency in\n",
    "    Cargo.toml (checked for files under src/), and only if no local `mod` / `use` / `macro_rules!`\n",
    "    of that name shadows it. a hand-rolled `fn warn()` in your own src/ emits nothing and buys\n",
    "    nothing. a single-segment symbol is honoured only as a macro.\n",
    "    valve: law.toml [truth] trace_symbols — your logger's symbols go here. deny the sin, not the lib.",
);

const MISSING_DEPUTY: &str = concat!(
    "crate root is missing a deputy attribute.\n",
    "    why: this law is syntax-only — it cannot see a type. the deputies are rustc lints that can,\n",
    "    uplifted from warning to error so they cannot be scrolled past.\n",
    "    legal: put them at the top of lib.rs / main.rs / bin/*.rs —\n",
    "      #![deny(unused_must_use)]           a fallible dropped in statement position\n",
    "      #![deny(for_loops_over_fallibles)]  a for-loop laundering an if-let\n",
    "      #![deny(dead_code)]                 DEAD:1 is decor without it: the compiler names the corpse\n",
    "      #![deny(unused_variables)]          a payload bound and never read\n",
    "      #![deny(unused_assignments)]        a value overwritten before anyone read it\n",
    "    muting one locally with #[allow(..)] is DEAD:1, so the deputation is airtight.\n",
    "    the list is NAMED on purpose: `deny(warnings)` would hand every future rustc and clippy lint\n",
    "    a seat in this constitution — a new lint would break the build with no line changed here.\n",
    "    valve: law.toml [deputies] attrs — add to it freely. every name you remove is a class of sin\n",
    "    this law cannot see on its own.",
);

const FALLIBLE_ITERATED: &str = concat!(
    "a fallible was fed to iteration, where std drops it without an arm.\n",
    "    banned on any receiver: .flatten() / .filter_map(..) / .flat_map(..) — deleting the items\n",
    "    that failed IS their job. banned when the receiver or an argument is syntactically fallible:\n",
    "    .iter() / .iter_mut() / .into_iter() / .drain(..) / .chain(..) / .extend(..) / .zip(..) /\n",
    "    from_iter(..). syntactically fallible = a Some/Ok/Err/None constructor, an `Option::` or\n",
    "    `Result::` qualified call, or a call to a known producer (get, first, last, pop, next, peek,\n",
    "    find, position, parse, recv, lock, split_first, checked_*, strip_*).\n",
    "    why: Result and Option are IntoIterator, so an Err or a None silently becomes length zero —\n",
    "    an if-let with no `if`, no arm, and no line in the diff for a reviewer to argue with.\n",
    "    legal: a stream of fallibles collects into one fallible —\n",
    "    `.collect::<Result<Vec<Row>, YourError>>()?` keeps the first failure and hands it to the caller |\n",
    "    a genuine skip stays in the open: `for x in xs { let Some(y) = f(&x) else { continue }; .. }` |\n",
    "    presence with continuation: `for x in opt.iter() { .. }`, where the Option is a 0-or-1\n",
    "    collection and nothing failed.",
);

const CAUGHT_CRASH: &str = concat!(
    "panic::catch_unwind / set_hook / take_hook / panic_any / AssertUnwindSafe outside a bin root,\n",
    "    on a path or inside macro tokens.\n",
    "    why: catching an unwind turns a crash back into a value — the fourth door ERROR:4 denies —\n",
    "    with the cause reduced to `Box<dyn Any>`, which is erasure (TYPE:1) on top of it. swapping\n",
    "    the hook mutes the report the crash exists to produce.\n",
    "    legal: make the failing call return `Result<T, YourError>` and propagate it. a process\n",
    "    boundary that genuinely must not unwind — an ffi callback, a supervisor loop — belongs in\n",
    "    main.rs, where the process is owned and the decision is one file deep.",
);

const DROP_FALLIBLE: &str = concat!(
    "fallible work inside `fn drop`. banned in a drop body: `?`, Ok/Err/Some/None in any expression\n",
    "    or pattern, and calls that hand back a fallible — get / first / pop / next / parse / lock /\n",
    "    recv / find / checked_* / strip_*, plus the I/O openers create / open / write / write_all /\n",
    "    flush / create_dir_all / copy / rename / read* and the File / OpenOptions types.\n",
    "    why: drop returns (). it cannot propagate, cannot be retried, and a panic there during an\n",
    "    unwind aborts the process — so every failure it meets is swallowed by construction. this is\n",
    "    the one place where ERROR:4 is impossible to obey, which is exactly why the work must leave it.\n",
    "    legal: `fn close(self) -> Result<(), YourError>`, called and discharged by the owner. drop\n",
    "    keeps only the release that cannot fail.\n",
    "    moving the body into a helper called from drop buys nothing: the helper's own fallibles fall\n",
    "    under ERROR:1/2/4, and its Result back in drop is either `let _ =` (ERROR:1) or a bare\n",
    "    statement the deputy unused_must_use rejects.",
);

const ERASED_ERROR_TYPE: &str = concat!(
    "erased error type: String / &str / dyn / Box<dyn ..> / anyhow / eyre / () / a bare primitive /\n",
    "    a bare generic parameter. judged in EVERY written type position — return, parameter, struct\n",
    "    field, local annotation, generic argument: a `Box<dyn Error>` in a field is the same erasure\n",
    "    as in a return.\n",
    "    why: the caller matches on your error to decide what to do next. an erased error can only be\n",
    "    printed, so every recovery downstream degrades into a string compare or a shrug.\n",
    "    legal: `enum IngestError { Read(io::Error), Parse(ParseIntError) }` with `impl Display` and\n",
    "    `impl std::error::Error`, then `Result<Row, IngestError>` at the signature. crossing layers\n",
    "    goes through `impl From<LowerError> for UpperError`, so `?` keeps working and the conversion\n",
    "    is one reviewable place.\n",
    "    an `impl Trait` that is not carrying an error is untouched: `&mut impl Write` is fine.",
);

const RESULT_SHORTHAND: &str = concat!(
    "Result with its error half hidden: `type MyResult<T> = Result<T, MyError>`, a single-argument\n",
    "    `Result<T>`, or `io::Result<T>`.\n",
    "    why: an alias is a contract written in invisible ink. the reader of the signature still does\n",
    "    not know what can go wrong, and editing the alias silently re-writes every signature that\n",
    "    used it.\n",
    "    legal: spell it at every signature — `fn load(path: &Path) -> Result<Config, ConfigError>`.\n",
    "    if that feels tedious, the error enum has too many jobs: split the enum, do not alias it.",
);

const NAMED_OPTION: &str = concat!(
    "Option in an argument or return type of a pub / pub(crate) / pub(super) fn — methods of a\n",
    "    pub trait included.\n",
    "    why: Option on a public surface invites silent skip and default-by-absence. the caller cannot\n",
    "    tell \"not found\" from \"found nothing\" from \"never looked\", so they invent a meaning, and the\n",
    "    meaning they invent is whichever one makes their branch shorter.\n",
    "    legal: `Result<T, YourError>` — `.ok_or(YourError::Missing)?` right at the boundary | a named\n",
    "    domain state when BOTH cases are real answers: `enum Slot { Occupied(Row), Free }`. if one of\n",
    "    the two states means \"it failed\", it is a Result wearing a mask, not an enum | for an optional\n",
    "    input, take two functions, or a parameter struct whose absence was already resolved in the\n",
    "    sanctum (TRUTH:1).\n",
    "    struct fields, type aliases, locals, generics and fully-private fn are exempt: a data shape is\n",
    "    not an API contract. making the fn private takes it off the public surface, which is the\n",
    "    honest version of the same move.",
);

const CAST_ERASURE: &str = concat!(
    "`as` cast. it truncates, wraps, rounds and re-signs in silence, and the signature says nothing\n",
    "    about any of it.\n",
    "    why: the one place where a narrowing decision gets made is the one place with no name, no\n",
    "    error type and no line for a reviewer to stop on.\n",
    "    legal: widening that cannot fail — `u64::from(n)` or `.into()` | narrowing that can —\n",
    "    `u32::try_from(n)?`, or `match u32::try_from(n) { Ok(small) => small, Err(e) =>\n",
    "    return Err(YourError::TooWide(e)) }` | a float boundary that must round says so by name:\n",
    "    `n.round()` then `u64::try_from(..)?`.\n",
    "    reaching for wrapping_* / saturating_* / *_lossy instead is the same sin one spelling over,\n",
    "    and TYPE:5 is standing there.",
);

const SILENT_MANGLE: &str = concat!(
    "arithmetic or decoding failure turned quietly into a value that travels on: wrapping_* /\n",
    "    saturating_* / overflowing_* / from_utf8_lossy / from_utf16_lossy / to_string_lossy — as a\n",
    "    method, as a qualified path, or inside macro tokens.\n",
    "    why: the same sin as unwrap_or in another spelling, and unlike `as` (TYPE:4) it does not even\n",
    "    look like a conversion, so nobody greps for it. a replacement character and a wrapped counter\n",
    "    are indistinguishable downstream from data that was always fine.\n",
    "    legal: `checked_add(n)` and a judged discharge of the None — `.ok_or(YourError::Overflow)?` |\n",
    "    `u32::try_from(x)` + match | suspect bytes go through `String::from_utf8(v)` + match, and a\n",
    "    path that may not be utf-8 through `path.to_str()` + let-else on Some |\n",
    "    deliberate wraparound is the TYPE `std::num::Wrapping<T>`, deliberate clamping is\n",
    "    `Saturating<T>` or `.clamp(min, max)`: the intent is declared once in the type instead of\n",
    "    once per call site. Wrapping and Saturating are not banned — they ARE the legal spelling.",
);

const DEAD_SUPPRESSION: &str = concat!(
    "#[allow(..)] / #[expect(..)] / #[cfg_attr(.., allow(..))] naming dead_code, unused* or\n",
    "    unreachable_code — tape over the check engine light.\n",
    "    why: the compiler is the one witness in this codebase that cannot be talked out of it.\n",
    "    muting it is how a dead branch survives three refactors and then gets resurrected by accident.\n",
    "    legal: delete the code — git remembers it. if it is not dead but merely unused today, then it\n",
    "    has no caller today: delete it and write it again when there is one, against the real caller.\n",
    "    making the item `pub` to silence dead_code is the same lie with a wider blast radius: the lint\n",
    "    goes quiet because you promised the corpse to every future caller instead.",
);

const COMMENT: &str = concat!(
    "comment. `//`, `/* */`, `///`, `//!` and #[doc] are all the same thing.\n",
    "    why: a comment is an unverifiable claim that ages in silence. the compiler checks the code\n",
    "    and nothing checks the prose, so the two drift apart — and the prose is what the next reader\n",
    "    believes.\n",
    "    legal: a constraint becomes an `assert!` or a type that cannot hold the wrong value | an\n",
    "    explanation becomes a name — `fn drain_lawfully`, `enum Slot { Occupied, Free }` | a rationale\n",
    "    goes in docs outside src/ | history goes in the commit message, where it is dated and signed.\n",
    "    prose parked in a `const &str`, or in a sentence-long identifier, is the same unverifiable\n",
    "    claim with extra steps.",
);

const UNFINISHED: &str = concat!(
    "todo! / unimplemented! / unreachable! — a runtime panic wearing a trenchcoat.\n",
    "    why: half-built code that COMPILES is worse than missing code. it type-checks, it passes\n",
    "    review, and it detonates in front of a user instead of in front of you.\n",
    "    legal: implement it now, or delete the function and let the caller fail to compile — the\n",
    "    loudest and cheapest error there is.\n",
    "    respelling it `panic!(\"unreachable\")` changes nothing. if a branch truly cannot happen, make\n",
    "    it unrepresentable: split the enum, or carry the value out of the match that proved it.\n",
    "    todo! is tolerated in a bin root only, where the process is owned and the gap is visible in main.",
);

const GLOB_IMPORT: &str = concat!(
    "`use x::*` — anonymous provenance.\n",
    "    why: nobody can tell where a name came from, and an upstream rename changes what your code\n",
    "    means without touching your file. it also hides which layer you actually depend on, which is\n",
    "    how LAYER:1 gets fooled.\n",
    "    legal: name every import — `use std::io::{Read, Write};`. a prelude you own is still a list:\n",
    "    write the list.",
);

const SCATTERED_DEFAULT: &str = concat!(
    "a default born outside the sanctum: a None or absence arm that resolves to a value instead of\n",
    "    propagating, crashing or diverging.\n",
    "    why: a default at a call site is a second source of truth. two files answering \"what is the\n",
    "    timeout when nobody said\" means the answer is whichever file ran last.\n",
    "    legal: `None => return Err(YourError::Missing)` | `None => break` / `continue` / `return`\n",
    "    when absence ends a loop rather than a meaning | resolve it once in the sanctum file, where\n",
    "    the whole default set is one screen and one diff.\n",
    "    a default is a default however it is spelled: `impl Default`, `unwrap_or`, `or_insert`,\n",
    "    `chain(once(FALLBACK)).take(1)`, a neutral element folded into a sum. pushing the fabrication\n",
    "    one call deeper does not push it out of the program.\n",
    "    valve: law.toml [truth] sanctum — one file name, not a list: the point is that there is a\n",
    "    single place to read.",
);

const ENV_OUTSIDE_SANCTUM: &str = concat!(
    "the outside world was read outside the declared files. banned there: std::env::var / vars /\n",
    "    var_os / vars_os / args / args_os / set_var / remove_var; the `env!` and `option_env!` macros\n",
    "    — the same read done at compile time and baked into the binary, with option_env! resolving\n",
    "    absence to None on top of it; and a string literal naming the procfs `self/environ` or\n",
    "    `self/cmdline` door, including inside macro tokens. in a crate's tests/ target the `env!`\n",
    "    and `option_env!` macros may name a key cargo sets itself — CARGO, CARGO_BIN_NAME,\n",
    "    CARGO_CRATE_NAME, CARGO_MANIFEST_DIR, CARGO_MANIFEST_PATH, CARGO_TARGET_TMPDIR,\n",
    "    CARGO_BIN_EXE_* and CARGO_PKG_* — because there the compiler is the one saying where\n",
    "    things are; std::env and every other key stay refused.\n",
    "    why: configuration enters a program in one place or it enters in every place. reading the\n",
    "    environment through the filesystem is still reading the environment, and a grep for `env`\n",
    "    misses it entirely — which is precisely why it gets used.\n",
    "    legal: read it in the declared file, land it in a `Config` struct with named typed fields, and\n",
    "    pass that down. everything else takes what it needs as a parameter, so a test can hand it\n",
    "    something else.\n",
    "    valve: law.toml [truth] env_files — the list of files allowed to touch the outside. keep it at\n",
    "    the sanctum plus the bin root; a CLI whose argv IS its configuration earns a place on that\n",
    "    list by name, and the entry is one visible line.\n",
    "    other procfs paths (`self/status`, `uptime`, `stat`) are untouched: a system tool reading them\n",
    "    honestly is not smuggling configuration through the back door.",
);

const VALUE_IN_MESSAGE: &str = concat!(
    "a value interpolated into a log message instead of carried as a field.\n",
    "    why: a message with the value baked in is a sentence. every line is a different sentence,\n",
    "    so the only way to find them later is to guess the wording, and the value cannot be filtered,\n",
    "    counted or grouped by anything. a field keeps the message constant and the value queryable,\n",
    "    which is the whole difference between a log you read at 3am and one you grep at 3am.\n",
    "    legal: info!(order = %id, \"saved\") rather than info!(\"saved {id}\") or info!(\"saved {}\", id).\n",
    "    the message stays a constant; everything that varies is a field beside it.\n",
    "    valve: none. a message with no value in it is always available.",
);

const STRAY_PRINT: &str = concat!(
    "println! / print! / eprintln! / eprint! outside a bin root, or dbg! anywhere. a crate's\n",
    "    build.rs IS a bin root: cargo compiles and runs it as its own program, and what it writes\n",
    "    to stdout is cargo's protocol rather than output.\n",
    "    why: stdout is the program's OUTPUT and it belongs to whoever owns the process. a library\n",
    "    that prints has decided for every future caller, including the one piping your output into\n",
    "    another program. dbg! is a debugging artifact that shipped.\n",
    "    legal: diagnostics go through the blessed trace symbols | a routine that renders takes its\n",
    "    sink: `fn render(out: &mut impl Write) -> Result<(), YourError>`, and the bin root decides\n",
    "    whether that sink is stdout, a file, or a buffer in a test.\n",
    "    valve: law.toml [truth] trace_symbols — a CLI that genuinely reports on stderr may bless\n",
    "    `eprintln` there by name, and that blessing is one line in the diff.",
);

const STRAY_HANDLE: &str = concat!(
    "io::stdout() / io::stderr(), or Stdout / Stderr / StdoutLock / StderrLock in any type position,\n",
    "    outside a bin root — on a path, in a type, or inside macro tokens.\n",
    "    why: holding the handle is println! with one extra step. `writeln!(stderr(), ..)` is eprintln!\n",
    "    under an assumed name, and LOG:1 would be theatre if the handle stayed free.\n",
    "    legal: take the sink as a parameter — `fn render(out: &mut impl Write) -> Result<(), YourError>`\n",
    "    — and let the bin root pass it `io::stdout().lock()`. diagnostics go to the blessed trace\n",
    "    symbols (law.toml: [truth] trace_symbols).",
);

const INLINE_TEST: &str = concat!(
    "#[test] / #[cfg(test)] under src/.\n",
    "    why: a test that lives inside the implementation drives private helpers, so the\n",
    "    implementation can rot behind a green suite — the suite ends up verifying the shape of the\n",
    "    code instead of the promise of the crate. from tests/ you can only touch what a real caller\n",
    "    can touch.\n",
    "    legal: move the tests to tests/, driving the public API.\n",
    "    if a helper deserves a direct test, it deserves its own module with its own public API and\n",
    "    its own error type — then the test proves a contract. adding `pub` to a helper so a test can\n",
    "    reach it is the evasion this rule exists to prevent: it widens the public surface forever to\n",
    "    keep a private test.\n",
    "    a file under a tests/ directory, or outside src/ entirely, is never judged by this rule.",
);

const FALLBACK_ROUTE: &str = concat!(
    "a second route taken because the first one failed or was not there: an Err arm whose value\n",
    "    comes from calling something else, or a `let ... else` whose else branch calls another route.\n",
    "    why: a fallback is a second implementation of the same behaviour, and from the moment it\n",
    "    exists nobody can say which one ran. the failure that sent the program down the second path\n",
    "    is invisible one line later, so the slow route quietly becomes the normal route and nothing\n",
    "    reports it, while the first one rots because it is never the one being read when something\n",
    "    looks wrong. it is also the shape that hides an outage: the primary was down for a week and\n",
    "    every screen looked fine.\n",
    "    legal: `Err(cause) => return Err(CouldNotRead { path, cause })` | `Err(cause) => { warn!(?cause, \"unread\"); Held::Absent }`\n",
    "    legal: `let Some(row) = table.get(key) else { return Held::Absent };` — a named absence, not a call\n",
    "    if the second route is genuinely needed, ask the person whose project this is, say why the\n",
    "    first one is not enough, and write the answer down: a `decisions` entry naming the file, what\n",
    "    it costs and what would have to be true to take it out again. a pardon in law.toml is honoured\n",
    "    only while that entry stands.\n",
);
