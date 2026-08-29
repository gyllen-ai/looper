use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

use serde::Deserialize;

use crate::violation::{Category, LawError, Rule, Violation};

#[derive(Debug, Clone, Deserialize)]
#[serde(default)]
pub struct LawConfig {
    pub max_loc: usize,
    pub max_fn_loc: usize,
    pub truth: TruthConfig,
    pub deputies: DeputiesConfig,
    pub error: ErrorConfig,
    pub layers: BTreeMap<String, Vec<String>>,
    pub rules: RulesConfig,
    pub exempt: BTreeMap<String, Vec<String>>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct TruthConfig {
    pub sanctum: String,
    pub env_files: Vec<String>,
    pub trace_symbols: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct DeputiesConfig {
    pub attrs: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct ErrorConfig {
    pub guard_types: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(default, deny_unknown_fields)]
#[derive(Default)]
pub struct RulesConfig {
    pub disabled: Vec<String>,
}

impl Default for LawConfig {
    fn default() -> LawConfig {
        LawConfig {
            max_loc: 800,
            max_fn_loc: 80,
            truth: TruthConfig::default(),
            deputies: DeputiesConfig::default(),
            error: ErrorConfig::default(),
            layers: BTreeMap::new(),
            rules: RulesConfig::default(),
            exempt: BTreeMap::new(),
        }
    }
}

impl Default for TruthConfig {
    fn default() -> TruthConfig {
        TruthConfig {
            sanctum: "config.rs".to_string(),
            env_files: vec!["config.rs".to_string(), "main.rs".to_string()],
            trace_symbols: vec!["tracing::warn".to_string(), "tracing::error".to_string()],
        }
    }
}

impl Default for DeputiesConfig {
    fn default() -> DeputiesConfig {
        DeputiesConfig {
            attrs: vec![
                "unused_must_use".to_string(),
                "for_loops_over_fallibles".to_string(),
                "dead_code".to_string(),
                "unused_variables".to_string(),
                "unused_assignments".to_string(),
            ],
        }
    }
}

impl Default for ErrorConfig {
    fn default() -> ErrorConfig {
        ErrorConfig {
            guard_types: vec![
                "MutexGuard".to_string(),
                "RwLockReadGuard".to_string(),
                "RwLockWriteGuard".to_string(),
            ],
        }
    }
}


const OURS: &str = "RUST-";

fn engine_owns(id: &str) -> Option<&str> {
    if let Some(bare) = id.strip_prefix(OURS) {
        return Some(bare);
    }
    let (category, _) = id.split_once(':')?;
    if Category::ORDER.iter().any(|known| known.name() == category) {
        Some(id)
    } else {
        None
    }
}

impl LawConfig {
    pub fn load(root: &Path) -> Result<LawConfig, LawError> {
        let mut dir = root.to_path_buf();
        loop {
            let path = dir.join("law.toml");
            if path.is_file() {
                return LawConfig::parse(&path);
            }
            let Some(parent) = dir.parent() else {
                return Ok(LawConfig::default());
            };
            dir = parent.to_path_buf();
        }
    }

    fn parse(path: &Path) -> Result<LawConfig, LawError> {
        let raw = match fs::read_to_string(path) {
            Ok(raw) => raw,
            Err(err) => {
                return Err(LawError::Io {
                    path: path.to_path_buf(),
                    message: err.to_string(),
                });
            }
        };
        let cfg: LawConfig = match toml::from_str(&raw) {
            Ok(cfg) => cfg,
            Err(err) => {
                return Err(LawError::Config {
                    path: path.to_path_buf(),
                    message: err.to_string(),
                });
            }
        };
        cfg.validate(path)?;
        Ok(cfg)
    }

    fn validate(&self, path: &Path) -> Result<(), LawError> {
        for id in &self.rules.disabled {
            let Some(id) = engine_owns(id) else { continue };
            match Rule::from_id(id) {
                Ok(_known) => {}
                Err(unknown) => {
                    return Err(LawError::Config {
                        path: path.to_path_buf(),
                        message: unknown.to_string(),
                    });
                }
            }
        }
        for (file, ids) in &self.exempt {
            for id in ids {
                if id == "ALL" {
                    continue;
                }
                let Some(id) = engine_owns(id) else { continue };
                match Rule::from_id(id) {
                    Ok(_known) => {}
                    Err(unknown) => {
                        return Err(LawError::Config {
                            path: path.to_path_buf(),
                            message: format!("exempt[{file}]: {unknown}"),
                        });
                    }
                }
            }
        }
        for (layer, allowed) in &self.layers {
            for target in allowed {
                if !self.layers.contains_key(target) {
                    return Err(LawError::Config {
                        path: path.to_path_buf(),
                        message: format!("layers[{layer}]: `{target}` is not a declared layer"),
                    });
                }
            }
        }
        Ok(())
    }

    pub fn permits(&self, violation: &Violation) -> bool {
        let id = violation.rule.id();
        if self.rules.disabled.iter().any(|d| engine_owns(d) == Some(id)) {
            return true;
        }
        for (file, ids) in &self.exempt {
            if file_matches(&violation.file, file)
                && ids.iter().any(|i| i == "ALL" || engine_owns(i) == Some(id)) {
                    return true;
                }
        }
        false
    }
}

pub const DEFAULT_LAW_TOML: &str = r#"# law.toml — the enforcement knobs, and the only place a project may argue with the law.
# every key below is written at its default. deleting a key changes nothing, deleting the file
# changes nothing: a missing file means exactly these values.
#
# read this first. a knob here is a LOCAL concession — one visible line in your diff, argued for
# once, reviewable forever. the defaults concede nothing on purpose. widening one is a decision
# you are making about your codebase, so make it deliberately and make it small.
# the whole constitution, with every rule, its reason and its legal spellings: `lawkeeper --rules`.

# DECOMPOSITION:1 — max lines per file before it must split.
# default 800. machine-generated files are the honest reason to move it; prefer pardoning those
# by name under [exempt] instead, so the cap keeps meaning for the code you write.
max_loc = 800

# DECOMPOSITION:3 — max lines per fn before it must split.
# default 80. a smell detector, not a budget: if a function needs 120 lines, it is two functions
# that were never named.
max_fn_loc = 80

[truth]
# TRUTH:1 — the one file where absence may resolve to a default (a None arm that yields a value).
# default "config.rs". one file, not a list: the whole point is that there is a single place to
# read when you ask "what happens when nobody said". rename it to match your layout, never multiply it.
sanctum = "config.rs"

# TRUTH:2 — the only files allowed to touch the outside world: std::env, the env!/option_env!
# macros, and the procfs self/environ and self/cmdline doors.
# default ["config.rs", "main.rs"] — the sanctum plus the bin root. a CLI whose argv IS its
# configuration earns its entry file a place here by name. a library never earns one.
env_files = ["config.rs", "main.rs"]

# ERROR:4 — the calls and macros that count as "observed" in an Err recovery arm.
# default ["tracing::warn", "tracing::error"]. deny the sin, not the lib: swap in your own logger's
# symbols freely — the rule cares that the failure is emitted, not by whom.
# provenance is enforced so the observation cannot be counterfeit: a qualified symbol is honoured
# spelled in full or bare after `use tracing::warn;`, only if its root crate is a real dependency in
# Cargo.toml (checked for files under src/) and no local mod/use/macro_rules of that name shadows
# it. a single-segment symbol is honoured only as a macro — a hand-rolled fn of that name emits
# nothing and buys nothing.
trace_symbols = ["tracing::warn", "tracing::error"]

[deputies]
# ERROR:5 — lint attrs every crate root (lib.rs / main.rs / bin/*.rs) must #![deny(...)].
# this law is syntax-only; these deputies see the types syn cannot. removing a name here removes a
# whole class of sin from enforcement, so add freely and subtract almost never.
# the list is NAMED, never `warnings`: denying warnings hands every future rustc and clippy lint a
# seat in this constitution — a new lint would break the build with no line changed here.
#   unused_must_use          a fallible dropped in statement position
#   for_loops_over_fallibles a for-loop laundering an if-let
#   dead_code                DEAD:1 is decor without it — the compiler names the corpse
#   unused_variables         a payload bound and never read
#   unused_assignments       a value overwritten before anyone read it
attrs = [
  "unused_must_use",
  "for_loops_over_fallibles",
  "dead_code",
  "unused_variables",
  "unused_assignments",
]

[error]
# ERROR:1 — the ONLY types allowed as a `let _name: T = ...` RAII guard.
# default: the std lock guards. anything else with an underscore-prefixed binding is a swallow
# wearing a guard's coat. a real guard is worth one visible line in the diff — add its type here
# with the same seriousness you wrote the guard. `let _: T = ...` is never a guard in any case:
# it drops on the spot.
guard_types = ["MutexGuard", "RwLockReadGuard", "RwLockWriteGuard"]

[layers]
# LAYER:1 — the import map: layer -> the layers it may import from.
# a layer is the first module segment under src/ — a top-level file stem or directory name.
# default: empty, which makes the rule inert. that is a decision to have no declared architecture,
# not the absence of one. every target must itself be a declared key, and the map is only worth
# writing as a DAG: two layers listing each other declares a cycle legal, which is the one thing
# this rule exists to prevent.
# structs = []
# models = ["structs"]
# routines = ["structs", "models"]
# routes = ["structs", "routines"]

[rules]
# rule ids switched off globally. default: none, and this is the loudest thing you can write in
# this file — a disabled rule is a sin legalised everywhere, forever, for everyone who ever edits
# this project. prefer a pardon under [exempt] on the one file that has earned it. all ids:
#   DECOMPOSITION:1 loc cap        DECOMPOSITION:2 lib.rs/mod.rs purity
#   DECOMPOSITION:3 fn loc cap
#   LAYER:1 import map             LAYER:2 inline crate::/self::/super:: paths
#   LAYER:3 callable in a static (runtime dispatch inverting the import graph)
#   ERROR:1 silent ops             ERROR:2 discarded payloads
#   ERROR:3 stub values from Err   ERROR:4 vanished errors
#   ERROR:5 missing deputy attrs   ERROR:6 fallibles fed to iteration
#   ERROR:7 caught/muted crashes   ERROR:8 fallible work in fn drop
#   TYPE:1  erased error types     TYPE:2  Result shorthand/aliases
#   TYPE:3  Option on a pub fn surface   TYPE:4  as-casts
#   TYPE:5  wrapping_/saturating_/overflowing_/*_lossy
#   DEAD:1  lint suppression       DEAD:2  comments
#   DEAD:3  todo!/unimplemented!/unreachable!   DEAD:4  glob imports
#   TRUTH:1 defaults outside sanctum   TRUTH:2 env/argv/procfs outside env_files
#   LOG:1   stray prints           LOG:2   stdout/stderr handles
#   TESTS:1 inline tests under src/
disabled = []

[exempt]
# per-file pardons: file name or src-relative path -> rule ids, or "ALL". default: none.
# a pardon is per FILE, not per line: pardoning ERROR:1 for one legitimate call pardons every
# swallow in that file forever. so keep a pardoned file small, and keep this list shorter.
# "generated.rs" = ["DECOMPOSITION:1", "DEAD:2"]
# "legacy/parser.rs" = ["ALL"]
"#;

pub fn init_law_toml(root: &Path, force: bool) -> Result<PathBuf, LawError> {
    let path = root.join("law.toml");
    match toml::from_str::<LawConfig>(DEFAULT_LAW_TOML) {
        Ok(_template) => {}
        Err(err) => {
            return Err(LawError::Config {
                path,
                message: format!("default template is broken: {err}"),
            });
        }
    }
    if path.exists() && !force {
        return Err(LawError::Config {
            path,
            message: "already exists — pass --force to overwrite".to_string(),
        });
    }
    match fs::write(&path, DEFAULT_LAW_TOML) {
        Ok(()) => Ok(path),
        Err(err) => Err(LawError::Io {
            path,
            message: err.to_string(),
        }),
    }
}

pub fn file_matches(rel: &str, pattern: &str) -> bool {
    if pattern.contains('/') {
        return rel == pattern;
    }
    let Some(name) = rel.rsplit('/').next() else {
        return rel == pattern;
    };
    name == pattern
}
