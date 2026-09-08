use proc_macro2::{Delimiter, TokenStream, TokenTree};
use syn::spanned::Spanned;

pub fn path_segs(path: &syn::Path) -> Vec<String> {
    path.segments.iter().map(|s| s.ident.to_string()).collect()
}

pub fn path_last(path: &syn::Path) -> String {
    let Some(seg) = path.segments.last() else {
        return String::new();
    };
    seg.ident.to_string()
}

pub fn last_is(path: &syn::Path, name: &str) -> bool {
    let Some(seg) = path.segments.last() else {
        return false;
    };
    seg.ident == name
}

pub fn attrs_of(item: &syn::Item) -> &[syn::Attribute] {
    match item {
        syn::Item::Const(i) => &i.attrs,
        syn::Item::Enum(i) => &i.attrs,
        syn::Item::ExternCrate(i) => &i.attrs,
        syn::Item::Fn(i) => &i.attrs,
        syn::Item::ForeignMod(i) => &i.attrs,
        syn::Item::Impl(i) => &i.attrs,
        syn::Item::Macro(i) => &i.attrs,
        syn::Item::Mod(i) => &i.attrs,
        syn::Item::Static(i) => &i.attrs,
        syn::Item::Struct(i) => &i.attrs,
        syn::Item::Trait(i) => &i.attrs,
        syn::Item::TraitAlias(i) => &i.attrs,
        syn::Item::Type(i) => &i.attrs,
        syn::Item::Union(i) => &i.attrs,
        syn::Item::Use(i) => &i.attrs,
        _ => &[],
    }
}

pub fn is_test_marker(attr: &syn::Attribute) -> bool {
    let path = attr.path();
    if last_is(path, "test") {
        return true;
    }
    if path.is_ident("cfg") {
        return meta_tokens(attr).replace(' ', "").contains("test");
    }
    false
}

pub fn meta_tokens(attr: &syn::Attribute) -> String {
    match &attr.meta {
        syn::Meta::List(list) => list.tokens.to_string(),
        syn::Meta::NameValue(nv) => match &nv.value {
            syn::Expr::Lit(l) => match &l.lit {
                syn::Lit::Str(s) => s.value(),
                _ => String::new(),
            },
            _ => String::new(),
        },
        syn::Meta::Path(_) => String::new(),
    }
}

pub fn or_cases(pat: &syn::Pat) -> Vec<&syn::Pat> {
    match pat {
        syn::Pat::Or(po) => po.cases.iter().collect(),
        other => vec![other],
    }
}

pub fn path_is_option_none(path: &syn::Path) -> bool {
    if path_last(path) != "None" {
        return false;
    }
    let segs = path_segs(path);
    if segs.len() == 1 {
        return true;
    }
    matches!(segs.get(segs.len() - 2), Some(owner) if owner == "Option")
}

pub fn pat_is_none(pat: &syn::Pat) -> bool {
    match pat {
        syn::Pat::Ident(pi) => {
            let Some(_sub) = &pi.subpat else {
                return pi.ident == "None";
            };
            false
        }
        syn::Pat::Path(pp) => path_is_option_none(&pp.path),
        _ => false,
    }
}

pub fn path_is_fallible_family(path: &syn::Path, family: &[&str]) -> bool {
    let segs = path_segs(path);
    if segs.len() < 2 {
        return false;
    }
    let Some(owner) = segs.get(segs.len() - 2) else {
        return false;
    };
    if owner != "Option" && owner != "Result" {
        return false;
    }
    family.contains(&path_last(path).as_str())
}

const EMPTY_STRING_MAKERS: &[&str] = &["to_string", "to_owned", "into"];

pub fn expr_is_empty_string(expr: &syn::Expr) -> bool {
    match expr {
        syn::Expr::MethodCall(mc) => {
            if !EMPTY_STRING_MAKERS.contains(&mc.method.to_string().as_str()) {
                return false;
            }
            expr_is_empty_literal(&mc.receiver)
        }
        syn::Expr::Call(c) => {
            let syn::Expr::Path(p) = &*c.func else {
                return false;
            };
            let segs = path_segs(&p.path);
            let from_string = path_last(&p.path) == "from"
                && matches!(segs.get(segs.len().saturating_sub(2)), Some(owner) if owner == "String");
            if !from_string {
                return false;
            }
            matches!(c.args.first(), Some(arg) if expr_is_empty_literal(arg))
        }
        _ => false,
    }
}

fn expr_is_empty_literal(expr: &syn::Expr) -> bool {
    let syn::Expr::Lit(lit) = expr else {
        return false;
    };
    let syn::Lit::Str(text) = &lit.lit else {
        return false;
    };
    text.value().is_empty()
}

pub fn pat_mentions_ctor(pat: &syn::Pat, ctor: &str) -> bool {
    match pat {
        syn::Pat::TupleStruct(ts) => {
            if path_last(&ts.path) == ctor {
                return true;
            }
            ts.elems.iter().any(|p| pat_mentions_ctor(p, ctor))
        }
        syn::Pat::Ident(pi) => {
            let Some((_at, sub)) = &pi.subpat else {
                return false;
            };
            pat_mentions_ctor(sub, ctor)
        }
        syn::Pat::Or(po) => po.cases.iter().any(|p| pat_mentions_ctor(p, ctor)),
        syn::Pat::Paren(pp) => pat_mentions_ctor(&pp.pat, ctor),
        syn::Pat::Reference(pr) => pat_mentions_ctor(&pr.pat, ctor),
        syn::Pat::Tuple(pt) => pt.elems.iter().any(|p| pat_mentions_ctor(p, ctor)),
        syn::Pat::Slice(ps) => ps.elems.iter().any(|p| pat_mentions_ctor(p, ctor)),
        syn::Pat::Struct(ps) => ps.fields.iter().any(|f| pat_mentions_ctor(&f.pat, ctor)),
        _ => false,
    }
}

pub fn pat_is_bare_binding(pat: &syn::Pat) -> bool {
    let syn::Pat::Ident(pi) = pat else {
        return false;
    };
    let None = &pi.subpat else {
        return false;
    };
    let name = pi.ident.to_string();
    let Some(first_char) = name.chars().next() else {
        return false;
    };
    !first_char.is_uppercase()
}

pub fn pat_mentions_fallible(pat: &syn::Pat) -> bool {
    pat_mentions_ctor(pat, "Some")
        || pat_mentions_ctor(pat, "Ok")
        || pat_mentions_ctor(pat, "Err")
        || pat_is_none(pat)
        || or_cases(pat).iter().any(|c| pat_is_none(c))
}

pub fn wild_under_fallible_ctor(pat: &syn::Pat) -> bool {
    match pat {
        syn::Pat::TupleStruct(ts) => {
            let name = path_last(&ts.path);
            let is_fallible = name == "Some" || name == "Ok" || name == "Err";
            if is_fallible && ts.elems.iter().any(|p| matches!(p, syn::Pat::Wild(_))) {
                return true;
            }
            ts.elems.iter().any(wild_under_fallible_ctor)
        }
        syn::Pat::Ident(pi) => {
            let Some((_at, sub)) = &pi.subpat else {
                return false;
            };
            wild_under_fallible_ctor(sub)
        }
        syn::Pat::Or(po) => po.cases.iter().any(wild_under_fallible_ctor),
        syn::Pat::Paren(pp) => wild_under_fallible_ctor(&pp.pat),
        syn::Pat::Reference(pr) => wild_under_fallible_ctor(&pr.pat),
        syn::Pat::Tuple(pt) => pt.elems.iter().any(wild_under_fallible_ctor),
        syn::Pat::Slice(ps) => ps.elems.iter().any(wild_under_fallible_ctor),
        syn::Pat::Struct(ps) => ps.fields.iter().any(|f| wild_under_fallible_ctor(&f.pat)),
        _ => false,
    }
}

pub fn pat_contains_wild(pat: &syn::Pat) -> bool {
    match pat {
        syn::Pat::Wild(_) => true,
        syn::Pat::Ident(pi) => {
            let Some((_at, sub)) = &pi.subpat else {
                return false;
            };
            pat_contains_wild(sub)
        }
        syn::Pat::TupleStruct(ts) => ts.elems.iter().any(pat_contains_wild),
        syn::Pat::Or(po) => po.cases.iter().any(pat_contains_wild),
        syn::Pat::Paren(pp) => pat_contains_wild(&pp.pat),
        syn::Pat::Reference(pr) => pat_contains_wild(&pr.pat),
        syn::Pat::Tuple(pt) => pt.elems.iter().any(pat_contains_wild),
        syn::Pat::Slice(ps) => ps.elems.iter().any(pat_contains_wild),
        syn::Pat::Struct(ps) => ps.fields.iter().any(|f| pat_contains_wild(&f.pat)),
        syn::Pat::Type(pt) => pat_contains_wild(&pt.pat),
        _ => false,
    }
}

pub fn err_bindings(pat: &syn::Pat) -> Vec<String> {
    let mut out = Vec::new();
    collect_err_bindings(pat, false, &mut out);
    out
}

fn collect_err_bindings(pat: &syn::Pat, inside_err: bool, out: &mut Vec<String>) {
    match pat {
        syn::Pat::TupleStruct(ts) => {
            let now_inside = inside_err || path_last(&ts.path) == "Err";
            for elem in &ts.elems {
                collect_err_bindings(elem, now_inside, out);
            }
        }
        syn::Pat::Ident(pi) => {
            if inside_err {
                out.push(pi.ident.to_string());
            }
            let Some((_at, sub)) = &pi.subpat else {
                return;
            };
            collect_err_bindings(sub, inside_err, out);
        }
        syn::Pat::Or(po) => {
            for case in &po.cases {
                collect_err_bindings(case, inside_err, out);
            }
        }
        syn::Pat::Paren(pp) => collect_err_bindings(&pp.pat, inside_err, out),
        syn::Pat::Reference(pr) => collect_err_bindings(&pr.pat, inside_err, out),
        syn::Pat::Tuple(pt) => {
            for elem in &pt.elems {
                collect_err_bindings(elem, inside_err, out);
            }
        }
        syn::Pat::Struct(ps) => {
            for field in &ps.fields {
                collect_err_bindings(&field.pat, inside_err, out);
            }
        }
        _ => {}
    }
}

pub fn tail_diverges(expr: &syn::Expr) -> bool {
    match expr {
        syn::Expr::Return(_) | syn::Expr::Break(_) | syn::Expr::Continue(_) => true,
        syn::Expr::Block(b) => {
            let Some(syn::Stmt::Expr(e, _semi)) = b.block.stmts.last() else {
                return false;
            };
            tail_diverges(e)
        }
        syn::Expr::Paren(p) => tail_diverges(&p.expr),
        syn::Expr::Group(g) => tail_diverges(&g.expr),
        _ => false,
    }
}

pub fn tail_is_stub(expr: &syn::Expr) -> bool {
    match expr {
        syn::Expr::Block(b) => {
            let Some(syn::Stmt::Expr(e, None)) = b.block.stmts.last() else {
                return false;
            };
            tail_is_stub(e)
        }
        syn::Expr::Return(r) => {
            let Some(inner) = &r.expr else {
                return false;
            };
            tail_is_stub(inner)
        }
        syn::Expr::Paren(p) => tail_is_stub(&p.expr),
        syn::Expr::Group(g) => tail_is_stub(&g.expr),
        syn::Expr::Lit(_) => true,
        syn::Expr::Tuple(t) => t.elems.is_empty(),
        syn::Expr::MethodCall(_) => expr_is_empty_string(expr),
        syn::Expr::Path(p) => path_last(&p.path) == "None",
        syn::Expr::Call(c) => call_is_stub(c),
        syn::Expr::Macro(m) => path_last(&m.mac.path) == "vec" && m.mac.tokens.is_empty(),
        _ => false,
    }
}

fn call_is_stub(c: &syn::ExprCall) -> bool {
    let syn::Expr::Path(p) = &*c.func else {
        return false;
    };
    let last = path_last(&p.path);
    if last == "new" && c.args.is_empty() {
        return true;
    }
    if last == "default" {
        return true;
    }
    if last == "Ok" {
        let Some(arg) = c.args.first() else {
            return true;
        };
        return tail_is_stub(arg);
    }
    false
}

pub fn expr_is_fallible_ctor(expr: &syn::Expr) -> bool {
    match expr {
        syn::Expr::Path(p) => path_last(&p.path) == "None",
        syn::Expr::Call(c) => {
            let syn::Expr::Path(p) = &*c.func else {
                return false;
            };
            let last = path_last(&p.path);
            last == "Some" || last == "Ok" || last == "Err"
        }
        syn::Expr::Paren(p) => expr_is_fallible_ctor(&p.expr),
        syn::Expr::Reference(r) => expr_is_fallible_ctor(&r.expr),
        syn::Expr::Group(g) => expr_is_fallible_ctor(&g.expr),
        _ => false,
    }
}

pub const FALLIBLE_PRODUCERS: &[&str] = &[
    "get", "get_mut", "first", "first_mut", "last", "last_mut", "pop", "pop_front", "pop_back",
    "next", "next_back", "peek", "peek_mut", "find", "position", "rposition", "parse", "recv",
    "try_recv", "lock", "try_lock", "front", "back", "split_first", "split_last",
];

pub fn ident_is_producer(name: &str) -> bool {
    if FALLIBLE_PRODUCERS.contains(&name) {
        return true;
    }
    name.starts_with("checked_") || name.starts_with("strip_")
}

pub fn expr_is_fallible_source(expr: &syn::Expr) -> bool {
    if expr_is_fallible_ctor(expr) {
        return true;
    }
    match expr {
        syn::Expr::MethodCall(mc) => ident_is_producer(&mc.method.to_string()),
        syn::Expr::Call(c) => call_is_fallible_source(c),
        syn::Expr::Paren(p) => expr_is_fallible_source(&p.expr),
        syn::Expr::Group(g) => expr_is_fallible_source(&g.expr),
        syn::Expr::Reference(r) => expr_is_fallible_source(&r.expr),
        _ => false,
    }
}

fn call_is_fallible_source(c: &syn::ExprCall) -> bool {
    let syn::Expr::Path(p) = &*c.func else {
        return false;
    };
    let segs = path_segs(&p.path);
    if segs.iter().any(|s| s == "Option" || s == "Result") {
        return true;
    }
    ident_is_producer(&path_last(&p.path))
}

pub fn expr_is_place(expr: &syn::Expr) -> bool {
    match expr {
        syn::Expr::Path(_) | syn::Expr::Field(_) => true,
        syn::Expr::Paren(p) => expr_is_place(&p.expr),
        syn::Expr::Reference(r) => expr_is_place(&r.expr),
        _ => false,
    }
}

pub const DROP_PRODUCERS: &[&str] = &[
    "create", "open", "write", "write_all", "write_fmt", "flush", "create_dir", "create_dir_all",
    "remove_file", "remove_dir", "remove_dir_all", "copy", "rename", "read", "read_to_string",
    "read_to_end", "read_dir", "read_link", "metadata", "canonicalize", "set_len",
    "set_permissions", "sync_all", "sync_data", "seek", "hard_link", "symlink_metadata",
];

pub const DROP_TYPES: &[&str] = &["OpenOptions", "File"];

pub fn ident_is_drop_producer(name: &str) -> bool {
    ident_is_producer(name) || DROP_PRODUCERS.contains(&name)
}

pub const LOSSY_FNS: &[&str] = &["from_utf8_lossy", "from_utf16_lossy", "to_string_lossy"];

const MANGLE_PREFIXES: &[&str] = &["wrapping_", "saturating_", "overflowing_"];

pub fn ident_is_mangle(name: &str) -> bool {
    if LOSSY_FNS.contains(&name) {
        return true;
    }
    MANGLE_PREFIXES.iter().any(|p| name.starts_with(p))
}

const PROCFS_ROOT: &str = "/proc/";
const ENVIRON_LEAF: &str = "/environ";
const CMDLINE_LEAF: &str = "/cmdline";

pub fn text_reads_env_door(text: &str) -> bool {
    if !text.contains(PROCFS_ROOT) {
        return false;
    }
    text.contains(ENVIRON_LEAF) || text.contains(CMDLINE_LEAF)
}

pub fn vis_is_public(vis: &syn::Visibility) -> bool {
    match vis {
        syn::Visibility::Public(_) | syn::Visibility::Restricted(_) => true,
        syn::Visibility::Inherited => false,
    }
}

pub fn type_is_guard(ty: &syn::Type, declared: &[String]) -> bool {
    let syn::Type::Path(tp) = ty else {
        return false;
    };
    let last = path_last(&tp.path);
    declared.contains(&last)
}

pub fn ident_is_discard(ident: &proc_macro2::Ident) -> bool {
    let name = ident.to_string();
    name.starts_with('_') && name.len() > 1
}

pub struct UsePathInfo {
    pub segs: Vec<String>,
    pub glob: bool,
    pub line: usize,
}

pub fn flatten_use(tree: &syn::UseTree, prefix: Vec<String>, out: &mut Vec<UsePathInfo>) {
    match tree {
        syn::UseTree::Path(p) => {
            let mut next = prefix;
            next.push(p.ident.to_string());
            flatten_use(&p.tree, next, out);
        }
        syn::UseTree::Name(n) => {
            let mut next = prefix;
            next.push(n.ident.to_string());
            let line = n.ident.span().start().line;
            out.push(UsePathInfo { segs: next, glob: false, line });
        }
        syn::UseTree::Rename(r) => {
            let mut next = prefix;
            next.push(r.ident.to_string());
            let line = r.ident.span().start().line;
            out.push(UsePathInfo { segs: next, glob: false, line });
        }
        syn::UseTree::Glob(g) => {
            let line = g.star_token.span().start().line;
            out.push(UsePathInfo { segs: prefix, glob: true, line });
        }
        syn::UseTree::Group(g) => {
            for item in &g.items {
                flatten_use(item, prefix.clone(), out);
            }
        }
    }
}

fn owned_by_another_type(trees: &[TokenTree], idx: usize) -> bool {
    let separated = idx >= 2
        && matches!(&trees[idx - 1], TokenTree::Punct(p) if p.as_char() == ':')
        && matches!(&trees[idx - 2], TokenTree::Punct(p) if p.as_char() == ':');
    if !separated || idx < 3 {
        return false;
    }
    matches!(&trees[idx - 3], TokenTree::Ident(owner) if owner.to_string() != "Option")
}

pub fn tokens_contain_fallible_ctor(tokens: TokenStream) -> bool {
    let trees: Vec<TokenTree> = tokens.into_iter().collect();
    for (idx, tree) in trees.iter().enumerate() {
        match tree {
            TokenTree::Ident(ident) => {
                let name = ident.to_string();
                if name == "None" && owned_by_another_type(&trees, idx) {
                    continue;
                }
                if name == "Some" || name == "Ok" || name == "Err" || name == "None" {
                    return true;
                }
            }
            TokenTree::Group(group)
                if tokens_contain_fallible_ctor(group.stream()) => {
                    return true;
                }
            _ => {}
        }
    }
    false
}

pub fn tokens_contain_idents(tokens: TokenStream, needles: &[String]) -> bool {
    if needles.is_empty() {
        return false;
    }
    for tree in tokens {
        match tree {
            TokenTree::Ident(ident) => {
                let name = ident.to_string();
                if needles.contains(&name) {
                    return true;
                }
            }
            TokenTree::Literal(lit) => {
                let text = lit.to_string();
                let captured = needles.iter().any(|n| {
                    text.contains(&format!("{{{n}}}")) || text.contains(&format!("{{{n}:"))
                });
                if captured {
                    return true;
                }
            }
            TokenTree::Group(group)
                if tokens_contain_idents(group.stream(), needles) => {
                    return true;
                }
            _ => {}
        }
    }
    false
}

pub fn scan_tokens_for_calls(tokens: TokenStream, names: &[&str], out: &mut Vec<usize>) {
    let trees: Vec<TokenTree> = tokens.into_iter().collect();
    for idx in 0..trees.len() {
        if let TokenTree::Group(group) = &trees[idx] {
            scan_tokens_for_calls(group.stream(), names, out);
            continue;
        }
        let TokenTree::Ident(ident) = &trees[idx] else {
            continue;
        };
        if !names.contains(&ident.to_string().as_str()) {
            continue;
        }
        let Some(after) = trees.get(idx + 1) else {
            continue;
        };
        let TokenTree::Group(args) = after else {
            continue;
        };
        if args.delimiter() == Delimiter::Parenthesis {
            out.push(ident.span().start().line);
        }
    }
}

pub fn message_carries_a_value(tokens: TokenStream) -> Option<usize> {
    for tree in tokens {
        let TokenTree::Literal(literal) = tree else {
            continue;
        };
        let written = literal.to_string();
        if !written.starts_with('"') {
            continue;
        }
        if holds_a_placeholder(&written) {
            return Some(literal.span().start().line);
        }
        return None;
    }
    None
}

fn holds_a_placeholder(written: &str) -> bool {
    let bytes: Vec<char> = written.chars().collect();
    let mut idx = 0;
    while idx < bytes.len() {
        if bytes[idx] != '{' {
            idx += 1;
            continue;
        }
        if bytes.get(idx + 1) == Some(&'{') {
            idx += 2;
            continue;
        }
        return true;
    }
    false
}

pub fn scan_tokens_for_mangle(tokens: TokenStream, out: &mut Vec<usize>) {
    let trees: Vec<TokenTree> = tokens.into_iter().collect();
    for idx in 0..trees.len() {
        if let TokenTree::Group(group) = &trees[idx] {
            scan_tokens_for_mangle(group.stream(), out);
            continue;
        }
        let TokenTree::Ident(ident) = &trees[idx] else {
            continue;
        };
        if !ident_is_mangle(&ident.to_string()) {
            continue;
        }
        let Some(after) = trees.get(idx + 1) else {
            continue;
        };
        let TokenTree::Group(args) = after else {
            continue;
        };
        if args.delimiter() == Delimiter::Parenthesis {
            out.push(ident.span().start().line);
        }
    }
}

pub fn scan_tokens_for_environ(tokens: TokenStream, out: &mut Vec<usize>) {
    for tree in tokens {
        match tree {
            TokenTree::Group(group) => scan_tokens_for_environ(group.stream(), out),
            TokenTree::Literal(lit) if text_reads_env_door(&lit.to_string()) => {
                out.push(lit.span().start().line);
            }
            _ => {}
        }
    }
}

const NUMERIC_TARGETS: &[&str] = &[
    "u8", "u16", "u32", "u64", "u128", "usize", "i8", "i16", "i32", "i64", "i128", "isize", "f32",
    "f64", "_",
];

fn narrows_a_number(trees: &[TokenTree], idx: usize) -> bool {
    match trees.get(idx + 1) {
        Some(TokenTree::Ident(target)) => NUMERIC_TARGETS.contains(&target.to_string().as_str()),
        Some(TokenTree::Punct(punct)) => punct.as_char() == '*',
        _ => false,
    }
}

pub fn scan_tokens_for_casts(tokens: TokenStream, out: &mut Vec<usize>) {
    let trees: Vec<TokenTree> = tokens.into_iter().collect();
    if starts_a_use(&trees) {
        return;
    }
    for idx in 0..trees.len() {
        if let TokenTree::Group(group) = &trees[idx] {
            scan_tokens_for_casts(group.stream(), out);
            continue;
        }
        let TokenTree::Ident(ident) = &trees[idx] else {
            continue;
        };
        if ident.to_string() != "as" {
            continue;
        }
        if !narrows_a_number(&trees, idx) {
            continue;
        }
        out.push(ident.span().start().line);
    }
}

fn starts_a_use(trees: &[TokenTree]) -> bool {
    matches!(trees.first(), Some(TokenTree::Ident(ident)) if ident.to_string() == "use")
}

pub fn scan_tokens_for_paths(tokens: TokenStream, roots: &[&str], out: &mut Vec<usize>) {
    let trees: Vec<TokenTree> = tokens.into_iter().collect();
    if starts_a_use(&trees) {
        return;
    }
    for idx in 0..trees.len() {
        if let TokenTree::Group(group) = &trees[idx] {
            scan_tokens_for_paths(group.stream(), roots, out);
            continue;
        }
        let TokenTree::Ident(ident) = &trees[idx] else {
            continue;
        };
        if !roots.contains(&ident.to_string().as_str()) {
            continue;
        }
        if !followed_by_path_separator(&trees, idx) {
            continue;
        }
        out.push(ident.span().start().line);
    }
}

fn followed_by_path_separator(trees: &[TokenTree], idx: usize) -> bool {
    let first = matches!(trees.get(idx + 1), Some(TokenTree::Punct(p)) if p.as_char() == ':');
    let second = matches!(trees.get(idx + 2), Some(TokenTree::Punct(p)) if p.as_char() == ':');
    first && second
}

pub fn scan_tokens_for_env_calls(tokens: TokenStream, names: &[&str], out: &mut Vec<usize>) {
    let trees: Vec<TokenTree> = tokens.into_iter().collect();
    for idx in 0..trees.len() {
        if let TokenTree::Group(group) = &trees[idx] {
            scan_tokens_for_env_calls(group.stream(), names, out);
            continue;
        }
        let TokenTree::Ident(ident) = &trees[idx] else {
            continue;
        };
        if ident.to_string() != "env" {
            continue;
        }
        if !followed_by_path_separator(&trees, idx) {
            continue;
        }
        let Some(TokenTree::Ident(called)) = trees.get(idx + 3) else {
            continue;
        };
        if !names.contains(&called.to_string().as_str()) {
            continue;
        }
        out.push(ident.span().start().line);
    }
}

fn macro_sites(tokens: TokenStream, names: &[&str], out: &mut Vec<(usize, TokenStream)>) {
    let trees: Vec<TokenTree> = tokens.into_iter().collect();
    for idx in 0..trees.len() {
        if let TokenTree::Group(group) = &trees[idx] {
            macro_sites(group.stream(), names, out);
            continue;
        }
        let TokenTree::Ident(ident) = &trees[idx] else {
            continue;
        };
        if !names.contains(&ident.to_string().as_str()) {
            continue;
        }
        let Some(TokenTree::Punct(bang)) = trees.get(idx + 1) else {
            continue;
        };
        if bang.as_char() != '!' {
            continue;
        }
        let Some(TokenTree::Group(args)) = trees.get(idx + 2) else {
            continue;
        };
        out.push((ident.span().start().line, args.stream()));
    }
}

pub fn scan_tokens_for_macros(tokens: TokenStream, names: &[&str], out: &mut Vec<usize>) {
    let mut found = Vec::new();
    macro_sites(tokens, names, &mut found);
    for (line, _args) in found {
        out.push(line);
    }
}

const CARGO_KEYS: &[&str] = &[
    "CARGO",
    "CARGO_BIN_NAME",
    "CARGO_CRATE_NAME",
    "CARGO_MANIFEST_DIR",
    "CARGO_MANIFEST_PATH",
    "CARGO_TARGET_TMPDIR",
];

const CARGO_KEY_FAMILIES: &[&str] = &["CARGO_BIN_EXE_", "CARGO_PKG_"];

pub fn tokens_name_a_cargo_key(tokens: TokenStream) -> bool {
    let trees: Vec<TokenTree> = tokens.into_iter().collect();
    let [TokenTree::Literal(named)] = trees.as_slice() else {
        return false;
    };
    let said = named.to_string();
    let Some(inner) = said.strip_prefix('"') else {
        return false;
    };
    let Some(key) = inner.strip_suffix('"') else {
        return false;
    };
    CARGO_KEYS.contains(&key) || CARGO_KEY_FAMILIES.iter().any(|family| key.starts_with(family))
}

pub fn scan_tokens_for_env_macros(tokens: TokenStream, names: &[&str], out: &mut Vec<usize>) {
    let mut found = Vec::new();
    macro_sites(tokens, names, &mut found);
    for (line, args) in found {
        if tokens_name_a_cargo_key(args) {
            continue;
        }
        out.push(line);
    }
}

pub fn scan_tokens_for_names(tokens: TokenStream, names: &[&str], out: &mut Vec<usize>) {
    for tree in tokens {
        match tree {
            TokenTree::Group(group) => scan_tokens_for_names(group.stream(), names, out),
            TokenTree::Ident(ident) if names.contains(&ident.to_string().as_str()) => {
                out.push(ident.span().start().line);
            }
            _ => {}
        }
    }
}

pub fn scan_tokens_for_banned(tokens: TokenStream, banned: &[&str], out: &mut Vec<usize>) {
    let trees: Vec<TokenTree> = tokens.into_iter().collect();
    for idx in 0..trees.len() {
        if let TokenTree::Group(group) = &trees[idx] {
            scan_tokens_for_banned(group.stream(), banned, out);
            continue;
        }
        let is_dot = match &trees[idx] {
            TokenTree::Punct(p) => p.as_char() == '.',
            _ => false,
        };
        if !is_dot {
            continue;
        }
        let Some(next) = trees.get(idx + 1) else {
            continue;
        };
        let TokenTree::Ident(ident) = next else {
            continue;
        };
        let name = ident.to_string();
        if !banned.iter().any(|m| *m == name) {
            continue;
        }
        let Some(after) = trees.get(idx + 2) else {
            continue;
        };
        let TokenTree::Group(args) = after else {
            continue;
        };
        if args.delimiter() == Delimiter::Parenthesis {
            out.push(ident.span().start().line);
        }
    }
}
