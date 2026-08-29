Writing Python in a governed project. Nothing here is checked by the language, so
the law reads every edit: the bare `except`, the value answered for a failure,
the bare `Exception`, the mutable default, `assert`, `import *`, `# type: ignore`,
the string-built command, the stray print, `eval` and `global` are all refused
before you see them.

- **A caught error leaves through one of three doors: re-raised, returned to the
  caller, or logged and recovered from in the open.** There is no fourth door.
- **State has an owner.** `global` lets any function rewrite a name declared a
  file away, so the value at the top is never the value. Return it, or put it on
  an object. `nonlocal` is not this rule: its reach stops one function up.
- **Wait for the thing, never for a number.** A fixed `sleep` is a guess about
  another machine; inside a loop that checks a condition it is pacing, and
  allowed, as are `sleep(0)` and a duration the caller handed in.
- **Logging is `observe/logging`.** Same rules in every language.
