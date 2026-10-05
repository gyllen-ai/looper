use crate::patterns::{last_is, or_cases, pat_is_none, path_is_option_none, path_segs, tail_diverges, tail_of};

enum Yield {
    Nothing,
    Variant(Vec<String>, String),
    Unknown,
}

fn inside_ok(expr: &syn::Expr) -> &syn::Expr {
    let syn::Expr::Call(call) = expr else {
        return expr;
    };
    let syn::Expr::Path(func) = &*call.func else {
        return expr;
    };
    let Some(only) = call.args.first() else {
        return expr;
    };
    if !last_is(&func.path, "Ok") || call.args.len() != 1 {
        return expr;
    }
    tail_of(only)
}

fn is_variant_name(name: &str) -> bool {
    let mut chars = name.chars();
    let Some(first) = chars.next() else {
        return false;
    };
    first.is_uppercase() && chars.any(|c| c.is_lowercase())
}

fn is_owner_name(name: &str) -> bool {
    name.chars().next().is_some_and(|first| first.is_uppercase())
}

fn variant_of(path: &syn::Path) -> Yield {
    let mut segs = path_segs(path);
    let Some(variant) = segs.pop() else {
        return Yield::Unknown;
    };
    let named = segs.last().is_some_and(|owner| is_owner_name(owner));
    if !named || !is_variant_name(&variant) || path_is_option_none(path) {
        return Yield::Unknown;
    }
    Yield::Variant(segs, variant)
}

fn is_propagation(expr: &syn::Expr) -> bool {
    let syn::Expr::Call(call) = expr else {
        return false;
    };
    let syn::Expr::Path(func) = &*call.func else {
        return false;
    };
    last_is(&func.path, "Err")
}

fn yielded(body: &syn::Expr) -> Yield {
    if tail_diverges(body) && !matches!(tail_of(body), syn::Expr::Path(_) | syn::Expr::Call(_) | syn::Expr::Struct(_)) {
        return Yield::Nothing;
    }
    let value = inside_ok(tail_of(body));
    if is_propagation(value) {
        return Yield::Nothing;
    }
    match value {
        syn::Expr::Path(p) => variant_of(&p.path),
        syn::Expr::Call(c) => match &*c.func {
            syn::Expr::Path(p) => variant_of(&p.path),
            _ => Yield::Unknown,
        },
        syn::Expr::Struct(s) => variant_of(&s.path),
        syn::Expr::Macro(m) if last_is(&m.mac.path, "panic") || last_is(&m.mac.path, "unreachable") => Yield::Nothing,
        _ => Yield::Unknown,
    }
}

pub fn hands_absence_on(body: &syn::Expr) -> bool {
    let syn::Expr::Path(p) = inside_ok(tail_of(body)) else {
        return false;
    };
    path_is_option_none(&p.path)
}

pub fn names_the_absence(arm: &syn::Arm, arms: &[syn::Arm]) -> bool {
    if or_cases(&arm.pat).iter().any(|case| !pat_is_none(case)) {
        return false;
    }
    let syn::Expr::Path(p) = inside_ok(tail_of(&arm.body)) else {
        return false;
    };
    let Yield::Variant(owner, variant) = variant_of(&p.path) else {
        return false;
    };
    arms.iter().filter(|other| !std::ptr::eq(*other, arm)).all(|other| match yielded(&other.body) {
        Yield::Nothing => true,
        Yield::Variant(theirs, said) => theirs == owner && said != variant,
        Yield::Unknown => false,
    })
}
