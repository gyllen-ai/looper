use std::fmt;
use std::path::PathBuf;

use crate::helps::help_for;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum Category {
    Decomposition,
    Layer,
    Error,
    Type,
    Dead,
    Truth,
    Log,
    Tests,
}

impl Category {
    pub const ORDER: &'static [Category] = &[
        Category::Decomposition,
        Category::Layer,
        Category::Error,
        Category::Type,
        Category::Dead,
        Category::Truth,
        Category::Log,
        Category::Tests,
    ];

    pub fn name(self) -> &'static str {
        match self {
            Category::Decomposition => "DECOMPOSITION",
            Category::Layer => "LAYER",
            Category::Error => "ERROR",
            Category::Type => "TYPE",
            Category::Dead => "DEAD",
            Category::Truth => "TRUTH",
            Category::Log => "LOG",
            Category::Tests => "TESTS",
        }
    }

    pub fn spirit(self) -> &'static str {
        match self {
            Category::Decomposition => "every file has one job. if it outgrew that job, split it.",
            Category::Layer => "the import graph is law. declare the map, import down it — never up, never sideways. every internal reference goes through use, and nothing installs a callee at runtime that the graph cannot show.",
            Category::Error => "propagate or crash. if you recover, the log knows. no error vanishes.",
            Category::Type => "the signature is the contract. anonymity is the sin.",
            Category::Dead => "code that isn't serving the program right now is noise. noise misleads. delete it.",
            Category::Truth => "every fact has exactly one home. two sources of truth means zero.",
            Category::Log => "stdout belongs to the program's output, owned by bin roots. diagnostics go through the blessed trace symbols.",
            Category::Tests => "tests drive the public API from tests/. reaching into private helpers lets implementations rot behind a green suite.",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum Rule {
    Loc,
    Switchboard,
    FnLoc,
    LayerBreach,
    InlinePath,
    RuntimeDispatch,
    SilentOp,
    DiscardedPayload,
    StubValue,
    VanishedError,
    MissingDeputy,
    FallibleIterated,
    CaughtCrash,
    DropFallible,
    ErasedErrorType,
    ResultShorthand,
    NamedOption,
    CastErasure,
    SilentMangle,
    DeadSuppression,
    Comment,
    Unfinished,
    GlobImport,
    ScatteredDefault,
    EnvOutsideSanctum,
    FallbackRoute,
    StrayPrint,
    StrayHandle,
    ValueInMessage,
    InlineTest,
}

impl Rule {
    pub const ALL: &'static [Rule] = &[
        Rule::Loc,
        Rule::Switchboard,
        Rule::FnLoc,
        Rule::LayerBreach,
        Rule::InlinePath,
        Rule::RuntimeDispatch,
        Rule::SilentOp,
        Rule::DiscardedPayload,
        Rule::StubValue,
        Rule::VanishedError,
        Rule::MissingDeputy,
        Rule::FallibleIterated,
        Rule::CaughtCrash,
        Rule::DropFallible,
        Rule::ErasedErrorType,
        Rule::ResultShorthand,
        Rule::NamedOption,
        Rule::CastErasure,
        Rule::SilentMangle,
        Rule::DeadSuppression,
        Rule::Comment,
        Rule::Unfinished,
        Rule::GlobImport,
        Rule::ScatteredDefault,
        Rule::EnvOutsideSanctum,
        Rule::FallbackRoute,
        Rule::StrayPrint,
        Rule::ValueInMessage,
        Rule::StrayHandle,
        Rule::InlineTest,
    ];

    pub fn id(self) -> &'static str {
        match self {
            Rule::Loc => "DECOMPOSITION:1",
            Rule::Switchboard => "DECOMPOSITION:2",
            Rule::FnLoc => "DECOMPOSITION:3",
            Rule::LayerBreach => "LAYER:1",
            Rule::InlinePath => "LAYER:2",
            Rule::RuntimeDispatch => "LAYER:3",
            Rule::SilentOp => "ERROR:1",
            Rule::DiscardedPayload => "ERROR:2",
            Rule::StubValue => "ERROR:3",
            Rule::VanishedError => "ERROR:4",
            Rule::MissingDeputy => "ERROR:5",
            Rule::FallibleIterated => "ERROR:6",
            Rule::CaughtCrash => "ERROR:7",
            Rule::DropFallible => "ERROR:8",
            Rule::ErasedErrorType => "TYPE:1",
            Rule::ResultShorthand => "TYPE:2",
            Rule::NamedOption => "TYPE:3",
            Rule::CastErasure => "TYPE:4",
            Rule::SilentMangle => "TYPE:5",
            Rule::DeadSuppression => "DEAD:1",
            Rule::Comment => "DEAD:2",
            Rule::Unfinished => "DEAD:3",
            Rule::GlobImport => "DEAD:4",
            Rule::ScatteredDefault => "TRUTH:1",
            Rule::EnvOutsideSanctum => "TRUTH:2",
            Rule::FallbackRoute => "TRUTH:3",
            Rule::StrayPrint => "LOG:1",
            Rule::ValueInMessage => "LOG:3",
            Rule::StrayHandle => "LOG:2",
            Rule::InlineTest => "TESTS:1",
        }
    }

    pub fn category(self) -> Category {
        match self {
            Rule::Loc | Rule::Switchboard | Rule::FnLoc => Category::Decomposition,
            Rule::LayerBreach | Rule::InlinePath | Rule::RuntimeDispatch => Category::Layer,
            Rule::SilentOp
            | Rule::DiscardedPayload
            | Rule::StubValue
            | Rule::VanishedError
            | Rule::MissingDeputy
            | Rule::FallibleIterated
            | Rule::CaughtCrash
            | Rule::DropFallible => Category::Error,
            Rule::ErasedErrorType
            | Rule::ResultShorthand
            | Rule::NamedOption
            | Rule::CastErasure
            | Rule::SilentMangle => Category::Type,
            Rule::DeadSuppression | Rule::Comment | Rule::Unfinished | Rule::GlobImport => {
                Category::Dead
            }
            Rule::ScatteredDefault | Rule::EnvOutsideSanctum | Rule::FallbackRoute => {
                Category::Truth
            }
            Rule::StrayPrint | Rule::StrayHandle | Rule::ValueInMessage => Category::Log,
            Rule::InlineTest => Category::Tests,
        }
    }

    pub fn help(self) -> &'static str {
        help_for(self)
    }

    pub fn from_id(id: &str) -> Result<Rule, UnknownRule> {
        for rule in Rule::ALL {
            if rule.id() == id {
                return Ok(*rule);
            }
        }
        Err(UnknownRule { id: id.to_string() })
    }
}

#[derive(Debug)]
pub struct UnknownRule {
    pub id: String,
}

impl fmt::Display for UnknownRule {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "unknown rule id `{}`", self.id)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct Violation {
    pub rule: Rule,
    pub file: String,
    pub line: usize,
}

#[derive(Debug)]
pub enum LawError {
    Io { path: PathBuf, message: String },
    Parse { path: PathBuf, message: String },
    Config { path: PathBuf, message: String },
    Usage { message: String },
    RootNotFound { start: PathBuf },
}

impl fmt::Display for LawError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            LawError::Io { path, message } => {
                write!(f, "io failure on {}: {}", path.display(), message)
            }
            LawError::Parse { path, message } => {
                write!(f, "rust parse failure in {}: {}", path.display(), message)
            }
            LawError::Config { path, message } => {
                write!(f, "law.toml rejected ({}): {}", path.display(), message)
            }
            LawError::Usage { message } => {
                write!(f, "{message}")
            }
            LawError::RootNotFound { start } => {
                write!(f, "no Cargo.toml found walking up from {}", start.display())
            }
        }
    }
}

impl std::error::Error for LawError {}
