use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};

use syn::spanned::Spanned;
use syn::visit::Visit;

use crate::config::LawConfig;
use crate::layers;
use crate::lexical;
use crate::patterns::meta_tokens;
use crate::provenance::{dependency_names, Provenance};
use crate::violation::{LawError, Rule, Violation};
use crate::visitor::{FileRole, Judge};

pub fn judge_project(root: &Path) -> Result<Vec<Violation>, LawError> {
    layers::verify_invariants();
    let cfg = LawConfig::load(root)?;
    let roots = member_roots(root)?;
    let deps = dependency_names(&roots)?;
    let mut files = Vec::new();
    for member in &roots {
        let src = member.join("src");
        if !src.is_dir() {
            continue;
        }
        walk(&src, &mut files)?;
    }
    files.sort();
    judge_paths(&cfg, &deps, &files)
}

pub fn judge_files(root: &Path, files: &[PathBuf]) -> Result<Vec<Violation>, LawError> {
    layers::verify_invariants();
    let cfg = LawConfig::load(root)?;
    let deps = dependency_names(&member_roots(root)?)?;
    judge_paths(&cfg, &deps, files)
}

fn member_roots(root: &Path) -> Result<Vec<PathBuf>, LawError> {
    let manifest = root.join("Cargo.toml");
    let mut out = vec![root.to_path_buf()];
    let raw = match fs::read_to_string(&manifest) {
        Ok(raw) => raw,
        Err(err) => {
            return Err(LawError::Io {
                path: manifest,
                message: err.to_string(),
            });
        }
    };
    let doc: toml::Value = match toml::from_str(&raw) {
        Ok(doc) => doc,
        Err(err) => {
            return Err(LawError::Config {
                path: manifest,
                message: err.to_string(),
            });
        }
    };
    let Some(workspace) = doc.get("workspace") else {
        return Ok(out);
    };
    let Some(members) = workspace.get("members") else {
        return Ok(out);
    };
    let Some(list) = members.as_array() else {
        return Ok(out);
    };
    for entry in list {
        let Some(name) = entry.as_str() else {
            continue;
        };
        if name.contains('*') {
            return Err(LawError::Config {
                path: manifest,
                message: format!("glob workspace member `{name}` — list members literally so the law can walk them"),
            });
        }
        out.push(root.join(name));
    }
    Ok(out)
}

fn judge_paths(
    cfg: &LawConfig,
    deps: &BTreeSet<String>,
    files: &[PathBuf],
) -> Result<Vec<Violation>, LawError> {
    let mut hits = Vec::new();
    for file in files {
        hits.extend(judge_one(cfg, deps, file)?);
    }
    hits.retain(|v| !cfg.permits(v));
    hits.sort();
    hits.dedup();
    Ok(hits)
}

fn walk(dir: &Path, out: &mut Vec<PathBuf>) -> Result<(), LawError> {
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(err) => {
            return Err(LawError::Io {
                path: dir.to_path_buf(),
                message: err.to_string(),
            });
        }
    };
    for entry in entries {
        let entry = match entry {
            Ok(entry) => entry,
            Err(err) => {
                return Err(LawError::Io {
                    path: dir.to_path_buf(),
                    message: err.to_string(),
                });
            }
        };
        let path = entry.path();
        if path.is_dir() {
            walk(&path, out)?;
            continue;
        }
        if is_rs(&path) {
            out.push(path);
        }
    }
    Ok(())
}

fn is_rs(path: &Path) -> bool {
    let Some(ext) = path.extension() else {
        return false;
    };
    ext == "rs"
}

fn judge_one(
    cfg: &LawConfig,
    deps: &BTreeSet<String>,
    path: &Path,
) -> Result<Vec<Violation>, LawError> {
    let content = match fs::read_to_string(path) {
        Ok(content) => content,
        Err(err) => {
            return Err(LawError::Io {
                path: path.to_path_buf(),
                message: err.to_string(),
            });
        }
    };

    let full = path_text(path)?;
    let rel = rel_name(&full);
    let mut hits = Vec::new();

    if content.lines().count() > cfg.max_loc {
        hits.push(Violation {
            rule: Rule::Loc,
            file: rel.clone(),
            line: 0,
        });
    }

    let ast = match syn::parse_file(&content) {
        Ok(ast) => ast,
        Err(err) => {
            return Err(LawError::Parse {
                path: path.to_path_buf(),
                message: format!("{} (line {})", err, err.span().start().line),
            });
        }
    };

    hits.extend(lexical::comment_hits(&rel, &content));

    let file_name = file_name_of(&full);
    let role = role_of(path, &full);
    if file_name == "lib.rs" || file_name == "mod.rs" {
        check_switchboard(&rel, &ast, &mut hits);
    }
    if file_name == "lib.rs" || file_name == "main.rs" || rel.starts_with("bin/") || role.build_script
    {
        check_deputies(cfg, &rel, &ast, &mut hits);
    }

    let prov = Provenance::new(&cfg.truth.trace_symbols, deps, &ast, under_src(&full));
    let mut judge = Judge::new(cfg, &rel, prov, role);
    judge.visit_file(&ast);
    layers::check_layer_uses(&cfg.layers, &rel, &judge.uses, &mut hits);
    hits.append(&mut judge.hits);

    Ok(hits)
}

fn path_text(path: &Path) -> Result<String, LawError> {
    let Some(text) = path.to_str() else {
        return Err(LawError::Io {
            path: path.to_path_buf(),
            message: "path is not valid utf-8".to_string(),
        });
    };
    Ok(text.replace('\\', "/"))
}

fn under_src(full: &str) -> bool {
    full.contains("/src/")
}

fn judges_tests(full: &str) -> bool {
    if full.split('/').any(|part| part == "tests") {
        return false;
    }
    under_src(full)
}

fn role_of(path: &Path, full: &str) -> FileRole {
    FileRole {
        judges_tests: judges_tests(full),
        build_script: is_build_script(path, full),
        cargo_test: under_crate_tests(path),
    }
}

fn holds_a_manifest(dir: &Path) -> bool {
    dir.join("Cargo.toml").is_file()
}

fn is_build_script(path: &Path, full: &str) -> bool {
    if file_name_of(full) != "build.rs" {
        return false;
    }
    let Some(dir) = path.parent() else {
        return false;
    };
    holds_a_manifest(dir)
}

fn under_crate_tests(path: &Path) -> bool {
    let mut at = path.parent();
    while let Some(dir) = at {
        if dir.file_name().and_then(|name| name.to_str()) == Some("tests") {
            if let Some(up) = dir.parent() {
                if holds_a_manifest(up) {
                    return true;
                }
            }
        }
        at = dir.parent();
    }
    false
}

fn file_name_of(full: &str) -> &str {
    let Some(name) = full.rsplit('/').next() else {
        return full;
    };
    name
}

fn rel_name(full: &str) -> String {
    let Some(idx) = full.rfind("/src/") else {
        return file_name_of(full).to_string();
    };
    full[idx + 5..].to_string()
}

fn check_switchboard(rel: &str, ast: &syn::File, hits: &mut Vec<Violation>) {
    for item in ast.items.iter() {
        if item_is_wiring(item) {
            continue;
        }
        hits.push(Violation {
            rule: Rule::Switchboard,
            file: rel.to_string(),
            line: item.span().start().line,
        });
    }
}

fn item_is_wiring(item: &syn::Item) -> bool {
    match item {
        syn::Item::Use(_) | syn::Item::ExternCrate(_) => true,
        syn::Item::Mod(m) => mod_is_declaration(m),
        _ => false,
    }
}

fn mod_is_declaration(m: &syn::ItemMod) -> bool {
    let Some(_content) = &m.content else {
        return true;
    };
    false
}

fn check_deputies(cfg: &LawConfig, rel: &str, ast: &syn::File, hits: &mut Vec<Violation>) {
    for required in &cfg.deputies.attrs {
        let want = required.replace(' ', "");
        let mut found = false;
        for attr in &ast.attrs {
            if !attr.path().is_ident("deny") {
                continue;
            }
            if meta_tokens(attr).replace(' ', "").contains(&want) {
                found = true;
            }
        }
        if !found {
            hits.push(Violation {
                rule: Rule::MissingDeputy,
                file: rel.to_string(),
                line: 1,
            });
        }
    }
}
