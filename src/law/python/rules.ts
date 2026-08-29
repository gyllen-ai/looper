import type { Rule } from "../rule.ts";

export const PYTHON_RULES: readonly Rule[] = [
  {
    id: "PY-ERROR:1",
    category: "ERROR",
    pass: "fast",
    bans: "a bare `except:`, and an `except` whose body does nothing — `pass` or `...`",
    why:
      "a caught error leaves through one of three doors: rethrown, returned to the caller, or logged and recovered from in the open. `except: pass` deletes the evidence that anything went wrong, and the wrong answer surfaces three layers from its cause. A bare `except:` is worse again, because it also swallows the interrupt someone pressed to stop the program",
    instead: [
      "name what is being ignored and it stops being a silence: `with suppress(FileNotFoundError): ...`",
      "log it and carry on: `logger.warning(\"could not read %s\", path, exc_info=True)`",
      "re-raise it as something the caller can act on, keeping the cause: `raise Missing(path) from error`",
      "`except OSError:` rather than `except:` — a bare one catches KeyboardInterrupt and SystemExit too",
    ],
    valve: { kind: "none" },
  },
  {
    id: "PY-TRUTH:1",
    category: "TRUTH",
    pass: "fast",
    bans: "a default argument that is a mutable container — `[]`, `{}`, `set()`, `list()`, `dict()`",
    why:
      "the default is built once, when the function is defined, not each time it is called. Every caller that leaves the argument out is handed the same list, so one call's append is still there on the next call, and the wrong answer appears far from the line that caused it. It reads as a fresh empty list to everyone who has not been bitten by it",
    instead: [
      "`def add(item, items=None): items = [] if items is None else items`",
      "a tuple or a frozenset if it never changes: `def name(names: tuple[str, ...] = ())`",
      "on a dataclass, `field(default_factory=list)`, which is called once per instance",
    ],
    valve: { kind: "none" },
  },
  {
    id: "PY-TRUTH:2",
    category: "TRUTH",
    pass: "fast",
    bans: "`assert` outside a test file, whatever it is checking",
    why:
      "`assert` is not a check. It is a check that disappears when the interpreter is asked to optimise, and `python -O` is how a great many things run in production. A validation written with it passes every test on your machine and is simply absent where it matters, so the first sign of it is the wrong data already saved. That is true of an internal invariant too, which is why this does not try to tell one kind of assert from another",
    instead: [
      "raise, and it survives: `if amount <= 0: raise ValueError(\"amount must be positive\")`",
      "for something arriving from outside, validate it at the edge with a Pydantic model instead",
      "to narrow a type for the checker, narrow it for real: `if proc.stdout is None: raise Broken()`",
      "in a test file this rule is silent — `test_*.py`, `*_test.py`, `conftest.py`, or anything under a `tests` folder — because that is where `assert` is the idiom",
    ],
    valve: { kind: "none" },
  },
  {
    id: "PY-ERROR:2",
    category: "ERROR",
    pass: "fast",
    bans: "answering a failure with a made-up value — `return None`, `return []`, `return \"\"`, `return 0` inside an `except`",
    why:
      "one line later nothing can tell the made-up value from a real one, so a file that could not be opened becomes an empty string and a database that was down becomes an empty list of orders. The person who sees the screen has no way to know anything went wrong, and the cause is three layers away by the time anyone looks",
    instead: [
      "raise something the caller can act on: `raise Missing(path) from error`",
      "use the error, and this rule steps aside: `except OSError as error: logger.warning(\"...\", error); return None`",
      "return a real answer from a real place: `return fallback.read()`",
      "if absence is a genuine answer, return it from inside the `try` too — a check before the `try` does not count, because the value has to stand on the success path for a reader to see it is the answer rather than a patch over the failure",
      "leaving a command with a failing exit code is a report, not a fabrication — say it as one: `raise SystemExit(2)`",
    ],
    valve: { kind: "none" },
  },
  {
    id: "PY-TYPE:1",
    category: "TYPE",
    pass: "fast",
    bans: "`# type: ignore` on a line, and `# mypy: ignore-errors` on a file",
    why:
      "Python's annotations only mean something because a checker reads them, so silencing the checker is not a small local exception — it is the annotation on that line quietly ceasing to be true while still reading as though it were. The comment stays after the code around it changes, and the next person believes the annotation, because that is the part written in words they understand. `# mypy: ignore-errors` does it to a whole file at once",
    instead: [
      "make the annotation true: `def total(rows: list[int]) -> int:`",
      "narrow it where the value arrives, and the checker stops complaining on its own: `if row is None: raise Missing()`",
      "for something from outside, validate it into a Pydantic model and the type is earned rather than claimed",
      "if the checker is genuinely wrong about a library, say so where that is true — a stub, or `[[tool.mypy.overrides]]` naming the module — rather than on your own line",
    ],
    valve: { kind: "none" },
  },
  {
    id: "PY-SECURITY:1",
    category: "SECURITY",
    pass: "fast",
    bans:
      "handing the operating system a command built by pasting values into it — `os.system`, `os.popen`, `subprocess.getoutput` and `getstatusoutput`, and `subprocess` called with `shell=True`",
    why:
      "the text goes to a shell, and a shell reads punctuation as instructions. A value holding a semicolon stops being a filename and becomes a second command, running with everything your program may do. It does not take an attacker: a file somebody named `report;rm -rf ~.csv` is enough. Python makes this the path of least resistance, because `shell=True` is one keyword away and the argument-list form needs the command split up",
    instead: [
      "`subprocess.run([\"convert\", source, target], check=True)` — the arguments stay arguments and are never read as instructions",
      "a pipeline is two `Popen` calls joined by `stdout`, not one string with a `|` in it",
      "if a shell feature is genuinely needed, build the line only from words you wrote, never from one that arrived",
      "`shlex.quote` is a repair for a design that already went wrong; an argument list needs no quoting at all",
    ],
    valve: { kind: "none" },
  },
  {
    id: "PY-SECURITY:2",
    category: "SECURITY",
    pass: "fast",
    bans:
      "building a database query by pasting values into the text of it — an f-string, a `+`, a `%` or `.format(...)` handed to `execute`, `executemany`, `executescript` or `text`",
    why:
      "whatever the value contains becomes part of the instruction. Somebody typing the right thing into a search box can read your whole database, or empty it. This is the single most exploited mistake in software and has been for twenty-five years. Every Python database driver already does this safely, and the safe spelling is shorter than the unsafe one",
    instead: [
      "`cursor.execute(\"SELECT * FROM orders WHERE id = ?\", (wanted,))` — the driver keeps the value out of the instruction",
      "with psycopg the placeholder is `%s` and the values are a tuple, which is not the same as `%` formatting: `cursor.execute(\"... id = %s\", (wanted,))`",
      "a table or column name cannot be a parameter, so choose it from a list you wrote rather than pasting one that arrived",
      "with SQLAlchemy: `session.execute(text(\"... id = :id\"), {\"id\": wanted})`",    ],
    valve: { kind: "none" },
  },
  {
    id: "PY-LOG:1",
    category: "LOG",
    pass: "fast",
    bans:
      "`print`, and writing to `sys.stdout` or `sys.stderr` directly, anywhere in a file that neither is named `__main__.py` nor holds an `if __name__ == \"__main__\":` block. A file holding that block is exempt **in full**, including code an importer can reach: the guard marks the file, not the lines it runs. A `print` whose destination the caller supplied — `print(line, file=out)` — is not this rule, because the caller chose where it went; `file=sys.stdout` and `file=sys.stderr` are, because the module chose",
    why:
      "what a program prints is its output, and it belongs to whoever ran it. A module that prints has made that decision for every caller it will ever have, including the one piping the output into something else, the one running it as a library inside a web service, and the one who wanted the failure raised rather than described. It is also the most common way a value nobody meant to publish reaches a log file, because printing is how you look at something while you are working and nothing removes it afterwards",
    instead: [
      "`logger = logging.getLogger(__name__)` at the top, then `logger.info(\"saving %s\", order)` — the caller decides where it goes and whether it goes anywhere",
      "hand the words back and let the caller print them: `return f\"saved {order}\"`",
      "a failure is raised, not described: `raise CouldNotSave(order) from error`",
      "printing belongs where the program starts, and this rule steps aside in any file that says so — under `if __name__ == \"__main__\":`, or in a `__main__.py`",
      "take the destination as an argument and the choice returns to the caller: `def dump(rows, file): print(rows, file=file)`",
      "a file that both starts a program and is imported as a library is two files: the printing belongs in the one nobody imports",
    ],
    valve: { kind: "none" },
  },
  {
    id: "PY-LOG:3",
    category: "LOG",
    pass: "fast",
    bans:
      "a value baked into a log message instead of carried beside it — an f-string, a `%`, a `.format()` or a concatenation handed to a logger, in a file that imports `logging` or `structlog`. `logger.info(\"saved %s\", order)` is not this rule: the standard library defers that formatting and the value stays a separate argument",
    why:
      "a message with the value inside it is a sentence, and every line is a different sentence. The only way to find them later is to guess the wording, and the value cannot be filtered, counted or grouped by anything. Formatting eagerly also does the work even when the level is off, which is the second cost and the smaller one",
    instead: [
      "`logger.info(\"saved\", extra={\"order\": order})` — the message is a constant and the value is a field",
      "`logger.info(\"saved %s\", order)` — the standard library's own lazy form, formatted only if something is listening",
      "a value nobody will ever query does not need to be in the line at all",
    ],
    valve: { kind: "none" },
  },
  {
    id: "PY-LAYER:1",
    category: "LAYER",
    pass: "fast",
    bans: "`from x import *`, which takes every name a module has without saying which",
    why:
      "afterwards nobody can tell where a name came from — not a reader, not an editor, not a checker. Two star imports in one file and the second silently replaces names from the first, so a function you thought you were calling is a different one with the same name, and nothing anywhere says so. Adding a name to the module you imported from can break this file without touching it",
    instead: [
      "name what you take, and the line says where it came from: `from os.path import join`",
      "keep the module and read through it: `import os.path` then `os.path.join(...)`",
      "re-exporting from a package is worth writing out: `from .models import Order as Order`, or list them in `__all__`",
    ],
    valve: { kind: "none" },
  },
  {
    id: "PY-ERROR:3",
    category: "ERROR",
    pass: "fast",
    bans: "`raise Exception(...)` and `raise BaseException(...)`, which name no failure at all",
    why:
      "the only way to catch this on purpose is `except Exception`, which catches every other failure in the program at the same time — including the ones you meant to let through. So the caller cannot retry the one that is worth retrying, or report the one the person can fix, and the message in the brackets is readable by a human and by nothing else. A name is what lets code downstream tell one failure from another",
    instead: [
      "a class of your own, one per failure: `class AmountNotPositive(Exception): pass` then `raise AmountNotPositive(amount)`",
      "a built-in that already names this kind: `raise ValueError(\"amount must be positive\")`, `raise KeyError(name)`",
      "keeping the cause when you rename it: `raise CouldNotRead(path) from error`",
      "`Exception` as a base class is how a named one is made, and this rule says nothing about that",
    ],
    valve: { kind: "none" },
  },
  {
    id: "PY-ERROR:4",
    category: "ERROR",
    pass: "fast",
    bans: "`time.sleep` and `asyncio.sleep` outside a loop, given a duration this code chose — waiting a fixed number of seconds for something to probably be finished",
    why:
      "the number is a guess about how fast another machine is today, wrong in both directions at once. Too short and it races, on the slowest machine, under the heaviest load, which is exactly where nobody is watching. Too long and every call pays it forever, including the thousand calls where the thing was ready immediately. Nothing in the test suite can catch either half, because the failure belongs to somebody else's hardware",
    instead: [
      "wait for the thing itself — `process.wait()`, `event.wait()`, `await task`",
      "poll for the condition and sleep between tries: `while not ready(): time.sleep(0.5)` — a sleep inside a loop is pacing, and this rule is silent on it",
      "if a service genuinely needs settling time, that is a readiness endpoint it owes you, not a number for the caller to guess",
      "`sleep(0)` yields to the event loop, `sleep(math.inf)` waits to be cancelled, and a duration that arrived as a parameter is the caller's number — this rule is silent on all three",
    ],
    valve: { kind: "none" },
  },
  {
    id: "PY-SECURITY:3",
    category: "SECURITY",
    pass: "fast",
    bans: "`eval`, `exec` and `compile` — code made out of a string while the program runs",
    why:
      "a string that becomes code is code no linter, no type checker and no rule here ever read. Every check this project has runs before that string exists. If any part of it came from outside — a request, a config file, a column in a table — then whoever supplied it is writing your program, with everything the process can reach",
    instead: [
      "a dict from a name to a function, so what can run is written down: `doing = {\"save\": save, \"send\": send}`",
      "`json.loads` for data that arrived as text, which reads data and cannot run it",
      "`getattr(held, name)` against an allowed list of names, if it really is dispatch",
      "`ast.literal_eval` if all you need is a literal, which is the one spelling that cannot call anything",
    ],
    valve: { kind: "none" },
  },
  {
    id: "PY-TRUTH:3",
    category: "TRUTH",
    pass: "fast",
    bans: "`global` — a function claiming the right to rewrite a module-level name",
    why:
      "state that a function can rewrite from underneath is state nobody can reason about from where it is declared. The value at the top of the file is not the value, and finding the real one means reading every function that could have run first. Each one also makes the next easier to justify, which is how a module ends up with four of them and no order anybody can name",
    instead: [
      "return the new value and let the caller hold it: `def bump(count): return count + 1`",
      "put it on an object, so the state has an owner and a name: `self.count += 1`",
      "if it is genuinely one thing for the whole process, make that explicit — a class with one instance, built where the program starts and passed down",
      "`nonlocal` is not this rule: its reach stops at the function above it, and the declaration it rewrites is a few lines up rather than a file away",
    ],
    valve: { kind: "none" },
  },
];
