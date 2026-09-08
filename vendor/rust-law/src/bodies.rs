use syn::spanned::Spanned;
use syn::visit::Visit;

use crate::patterns::{
    ident_is_drop_producer, last_is, path_last, path_segs, pat_mentions_fallible,
    tokens_contain_idents, DROP_TYPES,
};
use crate::provenance::Provenance;

pub struct ArmFacts {
    pub binding_used: bool,
    pub propagates: bool,
    pub has_crash: bool,
    pub has_trace: bool,
}

pub fn arm_facts(prov: &Provenance<'_>, arm: &syn::Arm, bindings: &[String]) -> ArmFacts {
    let mut scan = BodyScan::new(prov, bindings);
    scan.visit_expr(&arm.body);
    scan_guard(&mut scan, arm);
    ArmFacts {
        binding_used: scan.binding_used,
        propagates: scan.has_try || scan.has_err_ctor,
        has_crash: scan.has_crash,
        has_trace: scan.has_trace,
    }
}

pub fn drop_body_lines(block: &syn::Block) -> Vec<usize> {
    let mut scan = DropScan { lines: Vec::new() };
    scan.visit_block(block);
    scan.lines.sort_unstable();
    scan.lines
}

fn scan_guard(scan: &mut BodyScan<'_>, arm: &syn::Arm) {
    let Some((_if_token, guard)) = &arm.guard else {
        return;
    };
    scan.visit_expr(guard);
}

struct BodyScan<'c> {
    prov: &'c Provenance<'c>,
    bindings: &'c [String],
    has_try: bool,
    has_err_ctor: bool,
    has_crash: bool,
    has_trace: bool,
    binding_used: bool,
}

impl<'c> BodyScan<'c> {
    fn new(prov: &'c Provenance<'c>, bindings: &'c [String]) -> BodyScan<'c> {
        BodyScan {
            prov,
            bindings,
            has_try: false,
            has_err_ctor: false,
            has_crash: false,
            has_trace: false,
            binding_used: false,
        }
    }
}

impl<'ast, 'c> Visit<'ast> for BodyScan<'c> {
    fn visit_expr_try(&mut self, node: &'ast syn::ExprTry) {
        self.has_try = true;
        syn::visit::visit_expr_try(self, node);
    }

    fn visit_expr_call(&mut self, node: &'ast syn::ExprCall) {
        if let syn::Expr::Path(ep) = &*node.func {
            let segs = path_segs(&ep.path);
            if last_is(&ep.path, "Err") {
                self.has_err_ctor = true;
            }
            for window in segs.windows(2) {
                if window[0] == "process" && (window[1] == "exit" || window[1] == "abort") {
                    self.has_crash = true;
                }
            }
            if self.prov.honors(&segs, false) {
                self.has_trace = true;
            }
        }
        syn::visit::visit_expr_call(self, node);
    }

    fn visit_macro(&mut self, node: &'ast syn::Macro) {
        let segs = path_segs(&node.path);
        if last_is(&node.path, "panic") {
            self.has_crash = true;
        }
        if self.prov.honors(&segs, true) {
            self.has_trace = true;
        }
        if tokens_contain_idents(node.tokens.clone(), self.bindings) {
            self.binding_used = true;
        }
        syn::visit::visit_macro(self, node);
    }

    fn visit_ident(&mut self, node: &'ast proc_macro2::Ident) {
        let name = node.to_string();
        if self.bindings.contains(&name) {
            self.binding_used = true;
        }
        syn::visit::visit_ident(self, node);
    }
}

fn name_is_fallible(name: &str) -> bool {
    name == "Ok"
        || name == "Err"
        || name == "Some"
        || name == "None"
        || name == "Option"
        || name == "Result"
}

struct DropScan {
    lines: Vec<usize>,
}

impl<'ast> Visit<'ast> for DropScan {
    fn visit_expr_try(&mut self, node: &'ast syn::ExprTry) {
        self.lines.push(node.question_token.span().start().line);
        syn::visit::visit_expr_try(self, node);
    }

    fn visit_expr_method_call(&mut self, node: &'ast syn::ExprMethodCall) {
        if ident_is_drop_producer(&node.method.to_string()) {
            self.lines.push(node.method.span().start().line);
        }
        syn::visit::visit_expr_method_call(self, node);
    }

    fn visit_path(&mut self, node: &'ast syn::Path) {
        let segs = path_segs(node);
        let opener = segs.iter().any(|s| DROP_TYPES.iter().any(|t| t == s));
        let last = path_last(node);
        if opener || name_is_fallible(&last) || ident_is_drop_producer(&last) {
            self.lines.push(node.span().start().line);
        }
        syn::visit::visit_path(self, node);
    }

    fn visit_pat(&mut self, node: &'ast syn::Pat) {
        if pat_mentions_fallible(node) {
            self.lines.push(node.span().start().line);
        }
        syn::visit::visit_pat(self, node);
    }
}

pub fn expr_mentions(expr: &syn::Expr, names: &[String]) -> bool {
    let mut scan = MentionScan { names, found: false };
    scan.visit_expr(expr);
    scan.found
}

struct MentionScan<'c> {
    names: &'c [String],
    found: bool,
}

impl<'ast, 'c> Visit<'ast> for MentionScan<'c> {
    fn visit_ident(&mut self, node: &'ast proc_macro2::Ident) {
        if self.names.contains(&node.to_string()) {
            self.found = true;
        }
        syn::visit::visit_ident(self, node);
    }
}
