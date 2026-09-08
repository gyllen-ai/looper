Writing Rust in a governed project. The compiler is one deputy and the law is the
other: it refuses the comment, `unwrap`, `expect`, `let _ =`, the `as` cast, the
boxed error, the fallback route and the inline test on every edit. This is what
neither can judge.

- **An error type says which failure it is**, one variant per thing that can go
  wrong, so a caller can tell one from another and handle either.
- **Keep the interface small and the types plain.** If a new reader cannot follow
  it in one pass, rewrite it until they can.
- **Logging is `observe/logging`.** Same rules in every language.
