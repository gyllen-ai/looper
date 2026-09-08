use syn::spanned::Spanned;
use syn::visit::Visit;

use crate::bodies::{arm_facts, drop_body_lines, expr_mentions, ArmFacts};
use crate::config::{file_matches, LawConfig};
use crate::shapes::{
    collect_results, erased_error_carrier, shape_of_type, sig_option_lines, type_holds_callable,
    ResultShape,
};
use crate::patterns::{
    attrs_of, err_bindings, expr_is_fallible_ctor, expr_is_fallible_source, expr_is_place,
    flatten_use, ident_is_discard, ident_is_mangle, is_test_marker, last_is, message_carries_a_value,
    meta_tokens, or_cases,
    pat_contains_wild, pat_is_bare_binding, pat_is_none, pat_mentions_ctor, pat_mentions_fallible,
    path_is_fallible_family,
    path_last, path_segs, scan_tokens_for_banned, scan_tokens_for_calls, scan_tokens_for_environ,
    scan_tokens_for_casts, scan_tokens_for_env_calls, scan_tokens_for_env_macros,
    scan_tokens_for_macros,
    scan_tokens_for_mangle, scan_tokens_for_names, scan_tokens_for_paths, tail_diverges,
    tail_is_another_route, tail_is_stub, tail_of, text_reads_env_door,
    tokens_contain_fallible_ctor, tokens_name_a_cargo_key, type_is_guard, vis_is_public,
    wild_under_fallible_ctor,
};
use crate::provenance::Provenance;
use crate::violation::{Rule, Violation};

pub const BANNED_METHODS: &[&str] = &[
    "unwrap",
    "expect",
    "unwrap_err",
    "expect_err",
    "unwrap_unchecked",
    "unwrap_err_unchecked",
    "unwrap_or",
    "unwrap_or_else",
    "unwrap_or_default",
    "ok",
    "err",
    "or",
    "or_else",
    "map_or",
    "map_or_else",
    "is_ok",
    "is_err",
    "is_some",
    "is_none",
    "is_some_and",
    "is_ok_and",
    "is_err_and",
    "is_none_or",
];

const ENV_FNS: &[&str] = &[
    "var", "vars", "var_os", "vars_os", "args", "args_os", "set_var", "remove_var",
];

const ITER_TOTAL: &[&str] = &["flatten", "filter_map", "flat_map"];
const ITER_RECV: &[&str] = &["iter", "iter_mut", "into_iter", "drain"];
const ITER_ARG: &[&str] = &["chain", "extend", "zip", "from_iter"];
const HANDLE_FNS: &[&str] = &["stdout", "stderr"];
const HANDLE_TYPES: &[&str] = &["Stdout", "Stderr", "StdoutLock", "StderrLock"];
const CRASH_FNS: &[&str] = &["catch_unwind", "set_hook", "take_hook", "panic_any"];
const CRASH_TYPES: &[&str] = &["AssertUnwindSafe"];
const ENV_MACROS: &[&str] = &["env", "option_env"];

const LAYER_ROOTS: &[&str] = &["crate", "self", "super"];

const HALF_BUILT_MACROS: &[&str] = &["todo", "unimplemented", "unreachable"];

const HALF_BUILT_WORDS: &[&str] = &["not implemented", "unimplemented", "not yet implemented", "todo"];

const ENV_PROGRAMS: &[&str] = &["printenv", "env"];

pub struct FileRole {
    pub judges_tests: bool,
    pub build_script: bool,
    pub cargo_test: bool,
}

pub struct Judge<'c> {
    cfg: &'c LawConfig,
    prov: Provenance<'c>,
    rel: String,
    is_bin: bool,
    is_sanctum: bool,
    env_allowed: bool,
    judges_tests: bool,
    cargo_keys_allowed: bool,
    generics: Vec<String>,
    in_foreign_contract: bool,
    pub_trait: bool,
    pub uses: Vec<(usize, Vec<String>)>,
    pub hits: Vec<Violation>,
}

impl<'c> Judge<'c> {
    pub fn new(cfg: &'c LawConfig, rel: &str, prov: Provenance<'c>, role: FileRole) -> Judge<'c> {
        let is_bin = role.build_script || rel == "main.rs" || rel.starts_with("bin/");
        let is_sanctum = file_matches(rel, &cfg.truth.sanctum);
        let env_allowed = cfg.truth.env_files.iter().any(|f| file_matches(rel, f));
        Judge {
            cfg,
            prov,
            rel: rel.to_string(),
            is_bin,
            is_sanctum,
            env_allowed,
            judges_tests: role.judges_tests,
            cargo_keys_allowed: role.cargo_test,
            generics: Vec::new(),
            in_foreign_contract: false,
            pub_trait: false,
            uses: Vec::new(),
            hits: Vec::new(),
        }
    }

    fn hit(&mut self, rule: Rule, line: usize) {
        self.hits.push(Violation {
            rule,
            file: self.rel.clone(),
            line,
        });
    }

    fn fn_loc_check(&mut self, sig: &syn::Signature, span_end: usize) {
        let span_start = sig.fn_token.span().start().line;
        if span_end > span_start && span_end - span_start + 1 > self.cfg.max_fn_loc {
            self.hit(Rule::FnLoc, span_start);
        }
    }

    fn push_generics(&mut self, generics: &syn::Generics) -> usize {
        let prev = self.generics.len();
        for param in &generics.params {
            if let syn::GenericParam::Type(tp) = param {
                self.generics.push(tp.ident.to_string());
            }
        }
        prev
    }

    fn check_public_surface(&mut self, is_pub: bool, sig: &syn::Signature) {
        if self.in_foreign_contract || !is_pub {
            return;
        }
        let mut lines = Vec::new();
        sig_option_lines(sig, &mut lines);
        for line in lines {
            self.hit(Rule::NamedOption, line);
        }
    }

    fn check_written_type(&mut self, node: &syn::Type) {
        if self.in_foreign_contract {
            return;
        }
        let line = node.span().start().line;
        if erased_error_carrier(node) {
            self.hit(Rule::ErasedErrorType, line);
        }
        let mut found: Vec<(usize, ResultShape)> = Vec::new();
        shape_of_type(node, &mut found);
        self.check_result_shapes(found);
    }

    fn check_result_shapes(&mut self, found: Vec<(usize, ResultShape)>) {
        for (line, shape) in found {
            match shape {
                ResultShape::Shorthand => self.hit(Rule::ResultShorthand, line),
                ResultShape::Erased => self.hit(Rule::ErasedErrorType, line),
                ResultShape::MaybeGeneric(name) => {
                    if self.generics.contains(&name) {
                        self.hit(Rule::ErasedErrorType, line);
                    }
                }
                ResultShape::Lawful => {}
            }
        }
    }

    fn check_env_segs(&mut self, segs: &[String], line: usize) {
        if self.env_allowed {
            return;
        }
        for window in segs.windows(2) {
            if window[0] == "env" && ENV_FNS.iter().any(|f| *f == window[1]) {
                self.hit(Rule::EnvOutsideSanctum, line);
                return;
            }
            if window[0] == "std" && window[1] == "env" {
                self.hit(Rule::EnvOutsideSanctum, line);
                return;
            }
        }
    }

    fn check_inline_path(&mut self, segs: &[String], line: usize) {
        if segs.len() < 2 {
            return;
        }
        let Some(first) = segs.first() else {
            return;
        };
        if first == "crate" || first == "self" || first == "super" {
            self.hit(Rule::InlinePath, line);
        }
    }

    fn check_log_dest(&mut self, segs: &[String], line: usize) {
        if self.is_bin {
            return;
        }
        if segs.iter().any(|s| HANDLE_TYPES.iter().any(|h| h == s)) {
            self.hit(Rule::StrayHandle, line);
            return;
        }
        let [.., last] = segs else {
            return;
        };
        if segs.len() >= 2 && HANDLE_FNS.iter().any(|h| h == last) {
            self.hit(Rule::StrayHandle, line);
        }
    }

    fn check_mangle_path(&mut self, segs: &[String], line: usize) {
        let [.., last] = segs else {
            return;
        };
        if ident_is_mangle(last) {
            self.hit(Rule::SilentMangle, line);
        }
    }

    fn check_crash_path(&mut self, segs: &[String], line: usize) {
        if self.is_bin {
            return;
        }
        if segs.iter().any(|s| CRASH_TYPES.iter().any(|c| c == s)) {
            self.hit(Rule::CaughtCrash, line);
            return;
        }
        let [.., last] = segs else {
            return;
        };
        if CRASH_FNS.iter().any(|c| c == last) {
            self.hit(Rule::CaughtCrash, line);
        }
    }

    fn check_iter_entry(&mut self, node: &syn::ExprMethodCall, name: &str, line: usize) {
        if ITER_TOTAL.contains(&name) {
            self.hit(Rule::FallibleIterated, line);
            return;
        }
        if ITER_RECV.contains(&name) && expr_is_fallible_source(&node.receiver) {
            self.hit(Rule::FallibleIterated, line);
            return;
        }
        if !ITER_ARG.contains(&name) {
            return;
        }
        if node.args.iter().any(expr_is_fallible_source) {
            self.hit(Rule::FallibleIterated, line);
        }
    }

    fn check_iter_call(&mut self, node: &syn::ExprCall, last: &str, line: usize) {
        let entry = ITER_RECV.contains(&last) || ITER_ARG.contains(&last);
        if !entry {
            return;
        }
        if node.args.iter().any(expr_is_fallible_source) {
            self.hit(Rule::FallibleIterated, line);
        }
    }

    fn scan_macro_tokens(&mut self, node: &syn::Macro) {
        let mut silent = Vec::new();
        scan_tokens_for_banned(node.tokens.clone(), BANNED_METHODS, &mut silent);
        for line in silent {
            self.hit(Rule::SilentOp, line);
        }
        let mut iters = Vec::new();
        scan_tokens_for_banned(node.tokens.clone(), ITER_TOTAL, &mut iters);
        for line in iters {
            self.hit(Rule::FallibleIterated, line);
        }
        let mut mangles = Vec::new();
        scan_tokens_for_mangle(node.tokens.clone(), &mut mangles);
        for line in mangles {
            self.hit(Rule::SilentMangle, line);
        }
        self.scan_macro_environ(node);
        self.check_half_built_panic(node);

        let mut casts = Vec::new();
        scan_tokens_for_casts(node.tokens.clone(), &mut casts);
        for line in casts {
            self.hit(Rule::CastErasure, line);
        }
        let mut unfinished = Vec::new();
        scan_tokens_for_macros(node.tokens.clone(), HALF_BUILT_MACROS, &mut unfinished);
        for line in unfinished {
            self.hit(Rule::Unfinished, line);
        }
        let mut paths = Vec::new();
        scan_tokens_for_paths(node.tokens.clone(), LAYER_ROOTS, &mut paths);
        for line in paths {
            self.hit(Rule::InlinePath, line);
        }
        if self.is_bin {
            return;
        }
        let mut handles = Vec::new();
        scan_tokens_for_calls(node.tokens.clone(), HANDLE_FNS, &mut handles);
        scan_tokens_for_names(node.tokens.clone(), HANDLE_TYPES, &mut handles);
        for line in handles {
            self.hit(Rule::StrayHandle, line);
        }
        let mut crashes = Vec::new();
        scan_tokens_for_calls(node.tokens.clone(), CRASH_FNS, &mut crashes);
        scan_tokens_for_names(node.tokens.clone(), CRASH_TYPES, &mut crashes);
        for line in crashes {
            self.hit(Rule::CaughtCrash, line);
        }
    }

    fn check_env_program(&mut self, node: &syn::ExprCall) {
        if self.env_allowed {
            return;
        }
        let syn::Expr::Path(ep) = &*node.func else {
            return;
        };
        if path_last(&ep.path) != "new" {
            return;
        }
        if !path_segs(&ep.path).iter().any(|s| s == "Command") {
            return;
        }
        let Some(syn::Expr::Lit(lit)) = node.args.first() else {
            return;
        };
        let syn::Lit::Str(named) = &lit.lit else {
            return;
        };
        if !ENV_PROGRAMS.contains(&named.value().as_str()) {
            return;
        }
        self.hit(Rule::EnvOutsideSanctum, callee_line(&ep.path));
    }

    fn check_half_built_panic(&mut self, node: &syn::Macro) {
        if path_last(&node.path) != "panic" {
            return;
        }
        let said = node.tokens.to_string().to_lowercase();
        if !HALF_BUILT_WORDS.iter().any(|word| said.contains(word)) {
            return;
        }
        self.hit(Rule::Unfinished, node.path.segments[0].ident.span().start().line);
    }

    fn names_a_cargo_key(&self, node: &syn::Macro) -> bool {
        self.cargo_keys_allowed && tokens_name_a_cargo_key(node.tokens.clone())
    }

    fn scan_macro_environ(&mut self, node: &syn::Macro) {
        if self.env_allowed {
            return;
        }
        let mut envs = Vec::new();
        scan_tokens_for_environ(node.tokens.clone(), &mut envs);
        if self.cargo_keys_allowed {
            scan_tokens_for_env_macros(node.tokens.clone(), ENV_MACROS, &mut envs);
        } else {
            scan_tokens_for_macros(node.tokens.clone(), ENV_MACROS, &mut envs);
        }
        scan_tokens_for_env_calls(node.tokens.clone(), ENV_FNS, &mut envs);
        for line in envs {
            self.hit(Rule::EnvOutsideSanctum, line);
        }
    }

    fn check_drop_arg(&mut self, node: &syn::ExprCall, line: usize) {
        let Some(arg) = node.args.first() else {
            return;
        };
        if !expr_is_place(arg) {
            self.hit(Rule::SilentOp, line);
        }
    }

    fn drop_body_check(&mut self, sig: &syn::Signature, block: &syn::Block) {
        if sig.ident != "drop" {
            return;
        }
        let lines = drop_body_lines(block);
        let [first, ..] = lines.as_slice() else {
            return;
        };
        self.hit(Rule::DropFallible, *first);
    }

    fn judge_match(&mut self, node: &syn::ExprMatch) {
        let fallible = node.arms.iter().any(|a| pat_mentions_fallible(&a.pat));
        if !fallible {
            return;
        }
        for arm in &node.arms {
            self.judge_arm(arm);
        }
    }

    fn local_binding_check(&mut self, node: &syn::Local, line: usize) {
        let Some(_init) = &node.init else {
            return;
        };
        match &node.pat {
            syn::Pat::Wild(_) => self.hit(Rule::SilentOp, line),
            syn::Pat::Ident(pi) => {
                if ident_is_discard(&pi.ident) {
                    self.hit(Rule::SilentOp, line);
                }
            }
            syn::Pat::Type(pt) => self.typed_discard_check(pt, line),
            _ => {}
        }
    }

    fn typed_discard_check(&mut self, pt: &syn::PatType, line: usize) {
        let declared = &self.cfg.error.guard_types;
        let undeclared = !type_is_guard(&pt.ty, declared);
        match &*pt.pat {
            syn::Pat::Wild(_) => self.hit(Rule::SilentOp, line),
            syn::Pat::Ident(pi) if ident_is_discard(&pi.ident) && undeclared => {
                self.hit(Rule::SilentOp, line);
            }
            _ => {}
        }
    }

    fn judge_arm(&mut self, arm: &syn::Arm) {
        let line = arm.pat.span().start().line;
        let cases = or_cases(&arm.pat);

        for case in &cases {
            if matches!(case, syn::Pat::Wild(_)) {
                self.hit(Rule::DiscardedPayload, line);
            }
            if pat_is_bare_binding(case) && !pat_is_none(case) {
                self.hit(Rule::DiscardedPayload, line);
            }
            if wild_under_fallible_ctor(case) {
                self.hit(Rule::DiscardedPayload, line);
            }
        }

        let is_err_arm = cases.iter().any(|c| pat_mentions_ctor(c, "Err"));
        let is_none_arm = cases.iter().any(|c| pat_is_none(c));

        if is_err_arm {
            self.judge_err_arm(arm, line);
        }

        if is_none_arm {
            self.judge_none_arm(arm, line);
        }
    }

    fn judge_err_arm(&mut self, arm: &syn::Arm, line: usize) {
        let bindings = err_bindings(&arm.pat);
        let facts = self.arm_facts(arm, &bindings);
        let bound = !bindings.is_empty();
        if bound && !facts.binding_used {
            self.hit(Rule::DiscardedPayload, line);
        }
        if tail_is_stub(&arm.body) {
            self.hit(Rule::StubValue, line);
        }
        let observed = facts.has_trace && (!bound || facts.binding_used);
        if !facts.propagates && !facts.has_crash && !observed {
            self.hit(Rule::VanishedError, line);
        }
        if takes_another_route(&arm.body, &bindings) {
            self.hit(Rule::FallbackRoute, line);
        }
    }

    fn judge_none_arm(&mut self, arm: &syn::Arm, line: usize) {
        let facts = self.arm_facts(arm, &[]);
        let lawful = facts.propagates || facts.has_crash || tail_diverges(&arm.body);
        if !lawful && !self.is_sanctum {
            self.hit(Rule::ScatteredDefault, line);
        }
    }

    fn arm_facts(&self, arm: &syn::Arm, bindings: &[String]) -> ArmFacts {
        arm_facts(&self.prov, arm, bindings)
    }

    fn judge_let_else(&mut self, node: &syn::Local, line: usize) {
        let Some(init) = &node.init else {
            return;
        };
        let Some((_else_token, otherwise)) = &init.diverge else {
            return;
        };
        if !pat_mentions_fallible(&node.pat) {
            return;
        }
        if !tail_is_another_route(otherwise) {
            return;
        }
        self.hit(Rule::FallbackRoute, line);
    }
}

impl<'ast, 'c> Visit<'ast> for Judge<'c> {
    fn visit_item(&mut self, item: &'ast syn::Item) {
        let markers: Vec<&syn::Attribute> =
            attrs_of(item).iter().filter(|a| is_test_marker(a)).collect();
        for marker in &markers {
            if self.judges_tests {
                self.hit(Rule::InlineTest, marker.span().start().line);
            }
        }
        if !markers.is_empty() {
            return;
        }
        if let syn::Item::Macro(im) = item
            && path_last(&im.mac.path) == "macro_rules" {
                return;
            }
        syn::visit::visit_item(self, item);
    }

    fn visit_item_impl(&mut self, node: &'ast syn::ItemImpl) {
        let was_foreign = self.in_foreign_contract;
        let prev_len = self.push_generics(&node.generics);
        for _bound in node.trait_.iter() {
            self.in_foreign_contract = true;
        }
        syn::visit::visit_item_impl(self, node);
        self.in_foreign_contract = was_foreign;
        self.generics.truncate(prev_len);
    }

    fn visit_item_fn(&mut self, node: &'ast syn::ItemFn) {
        let prev_len = self.push_generics(&node.sig.generics);
        self.fn_loc_check(&node.sig, node.span().end().line);
        self.check_public_surface(vis_is_public(&node.vis), &node.sig);
        syn::visit::visit_item_fn(self, node);
        self.generics.truncate(prev_len);
    }

    fn visit_impl_item_fn(&mut self, node: &'ast syn::ImplItemFn) {
        let prev_len = self.push_generics(&node.sig.generics);
        self.fn_loc_check(&node.sig, node.span().end().line);
        self.check_public_surface(vis_is_public(&node.vis), &node.sig);
        self.drop_body_check(&node.sig, &node.block);
        syn::visit::visit_impl_item_fn(self, node);
        self.generics.truncate(prev_len);
    }

    fn visit_item_trait(&mut self, node: &'ast syn::ItemTrait) {
        let was_pub = self.pub_trait;
        self.pub_trait = vis_is_public(&node.vis);
        syn::visit::visit_item_trait(self, node);
        self.pub_trait = was_pub;
    }

    fn visit_trait_item_fn(&mut self, node: &'ast syn::TraitItemFn) {
        let prev_len = self.push_generics(&node.sig.generics);
        let is_pub = self.pub_trait;
        self.fn_loc_check(&node.sig, node.span().end().line);
        self.check_public_surface(is_pub, &node.sig);
        syn::visit::visit_trait_item_fn(self, node);
        self.generics.truncate(prev_len);
    }

    fn visit_item_type(&mut self, node: &'ast syn::ItemType) {
        let mut found = Vec::new();
        collect_results(&node.ty, &mut found);
        if !found.is_empty() {
            self.hit(Rule::ResultShorthand, node.type_token.span().start().line);
        }
        syn::visit::visit_item_type(self, node);
    }

    fn visit_type(&mut self, node: &'ast syn::Type) {
        self.check_written_type(node);
        syn::visit::visit_type(self, node);
    }

    fn visit_expr_method_call(&mut self, node: &'ast syn::ExprMethodCall) {
        let name = node.method.to_string();
        let line = node.method.span().start().line;
        if BANNED_METHODS.iter().any(|m| *m == name) {
            self.hit(Rule::SilentOp, line);
        }
        if ident_is_mangle(&name) {
            self.hit(Rule::SilentMangle, line);
        }
        self.check_iter_entry(node, &name, line);
        syn::visit::visit_expr_method_call(self, node);
    }

    fn visit_expr_path(&mut self, node: &'ast syn::ExprPath) {
        if path_is_fallible_family(&node.path, BANNED_METHODS) {
            self.hit(Rule::SilentOp, callee_line(&node.path));
        }
        syn::visit::visit_expr_path(self, node);
    }

    fn visit_expr_call(&mut self, node: &'ast syn::ExprCall) {
        self.check_env_program(node);
        if let syn::Expr::Path(ep) = &*node.func {
            let line = callee_line(&ep.path);
            let segs = path_segs(&ep.path);
            let last = path_last(&ep.path);
            let qualified_fallible = segs.iter().any(|s| s == "Option" || s == "Result");
            if segs.len() >= 2 && qualified_fallible && last_banned(&segs) {
                self.hit(Rule::SilentOp, line);
            }
            if last_is(&ep.path, "drop") && node.args.len() == 1 {
                self.check_drop_arg(node, line);
            }
            self.check_iter_call(node, &last, line);
            if !self.is_bin && HANDLE_FNS.iter().any(|h| *h == last) {
                self.hit(Rule::StrayHandle, line);
            }
        }
        syn::visit::visit_expr_call(self, node);
    }

    fn visit_expr_cast(&mut self, node: &'ast syn::ExprCast) {
        self.hit(Rule::CastErasure, node.as_token.span().start().line);
        syn::visit::visit_expr_cast(self, node);
    }

    fn visit_expr_binary(&mut self, node: &'ast syn::ExprBinary) {
        if let syn::BinOp::Eq(_) | syn::BinOp::Ne(_) = node.op
            && (expr_is_fallible_ctor(&node.left) || expr_is_fallible_ctor(&node.right))
        {
            self.hit(Rule::SilentOp, node.op.span().start().line);
        }
        syn::visit::visit_expr_binary(self, node);
    }

    fn visit_expr_closure(&mut self, node: &'ast syn::ExprClosure) {
        for input in &node.inputs {
            if pat_contains_wild(input) {
                self.hit(Rule::DiscardedPayload, input.span().start().line);
            }
        }
        syn::visit::visit_expr_closure(self, node);
    }

    fn visit_path(&mut self, node: &'ast syn::Path) {
        let segs = path_segs(node);
        let line = node.span().start().line;
        self.check_env_segs(&segs, line);
        self.check_inline_path(&segs, line);
        self.check_log_dest(&segs, line);
        self.check_crash_path(&segs, line);
        self.check_mangle_path(&segs, callee_line(node));
        syn::visit::visit_path(self, node);
    }

    fn visit_item_static(&mut self, node: &'ast syn::ItemStatic) {
        if type_holds_callable(&node.ty) {
            self.hit(Rule::RuntimeDispatch, node.static_token.span().start().line);
        }
        syn::visit::visit_item_static(self, node);
    }

    fn visit_lit_str(&mut self, node: &'ast syn::LitStr) {
        if !self.env_allowed && text_reads_env_door(&node.value()) {
            self.hit(Rule::EnvOutsideSanctum, node.span().start().line);
        }
        syn::visit::visit_lit_str(self, node);
    }

    fn visit_item_use(&mut self, node: &'ast syn::ItemUse) {
        let mut paths = Vec::new();
        flatten_use(&node.tree, Vec::new(), &mut paths);
        for info in &paths {
            self.check_env_segs(&info.segs, info.line);
            self.check_log_dest(&info.segs, info.line);
            self.check_crash_path(&info.segs, info.line);
            if info.glob {
                self.hit(Rule::GlobImport, info.line);
            }
            self.uses.push((info.line, info.segs.clone()));
        }
        syn::visit::visit_item_use(self, node);
    }

    fn visit_macro(&mut self, node: &'ast syn::Macro) {
        let last = path_last(&node.path);
        let line = callee_line(&node.path);
        match last.as_str() {
            "todo" => {
                if !self.is_bin {
                    self.hit(Rule::Unfinished, line);
                }
            }
            "unimplemented" | "unreachable" => self.hit(Rule::Unfinished, line),
            "matches" => {
                if tokens_contain_fallible_ctor(node.tokens.clone()) {
                    self.hit(Rule::SilentOp, line);
                }
            }
            "println" | "print" | "eprintln" | "eprint" => {
                if !self.is_bin {
                    self.hit(Rule::StrayPrint, line);
                }
            }
            "dbg" => self.hit(Rule::StrayPrint, line),
            "info" | "warn" | "error" | "debug" | "trace" => {
                if let Some(at) = message_carries_a_value(node.tokens.clone()) {
                    self.hit(Rule::ValueInMessage, at);
                }
            }
            "env" | "option_env" if !self.env_allowed && !self.names_a_cargo_key(node) => {
                self.hit(Rule::EnvOutsideSanctum, line);
            }
            _ => {}
        }
        self.scan_macro_tokens(node);
        syn::visit::visit_macro(self, node);
    }

    fn visit_expr_let(&mut self, node: &'ast syn::ExprLet) {
        if pat_mentions_fallible(&node.pat) {
            self.hit(Rule::SilentOp, node.let_token.span().start().line);
        }
        syn::visit::visit_expr_let(self, node);
    }

    fn visit_local(&mut self, node: &'ast syn::Local) {
        let line = node.let_token.span().start().line;
        if pat_mentions_ctor(&node.pat, "Ok") || pat_mentions_ctor(&node.pat, "Err") {
            self.hit(Rule::SilentOp, line);
        }
        self.local_binding_check(node, line);
        self.judge_let_else(node, line);
        syn::visit::visit_local(self, node);
    }

    fn visit_expr_assign(&mut self, node: &'ast syn::ExprAssign) {
        if matches!(*node.left, syn::Expr::Infer(_)) {
            self.hit(Rule::SilentOp, node.span().start().line);
        }
        syn::visit::visit_expr_assign(self, node);
    }

    fn visit_expr_match(&mut self, node: &'ast syn::ExprMatch) {
        self.judge_match(node);
        syn::visit::visit_expr_match(self, node);
    }

    fn visit_attribute(&mut self, node: &'ast syn::Attribute) {
        let line = node.span().start().line;
        let path = node.path();
        if path.is_ident("allow") || path.is_ident("expect") || path.is_ident("cfg_attr") {
            let tokens = meta_tokens(node);
            if tokens.contains("dead_code")
                || tokens.contains("unused")
                || tokens.contains("unreachable_code")
            {
                self.hit(Rule::DeadSuppression, line);
            }
        }
        if path.is_ident("doc") {
            self.hit(Rule::Comment, line);
        }
        syn::visit::visit_attribute(self, node);
    }
}

fn callee_line(path: &syn::Path) -> usize {
    let Some(seg) = path.segments.last() else {
        return path.span().start().line;
    };
    seg.ident.span().start().line
}

fn last_banned(segs: &[String]) -> bool {
    let Some(last) = segs.last() else {
        return false;
    };
    BANNED_METHODS.iter().any(|m| m == last)
}


fn takes_another_route(body: &syn::Expr, bindings: &[String]) -> bool {
    if !tail_is_another_route(body) {
        return false;
    }
    !expr_mentions(tail_of(body), bindings)
}
