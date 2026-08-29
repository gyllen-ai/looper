import ast
import io
import json
import sys
import tokenize

BARE_EXCEPT = "PY-ERROR:1"

MUTABLE_DEFAULT = "PY-TRUTH:1"

ASSERT_AS_A_CHECK = "PY-TRUTH:2"

MADE_UP_ANSWER = "PY-ERROR:2"

SILENCED_CHECKER = "PY-TYPE:1"

LAUNDERED_NAMESPACE = "PY-LAYER:1"

UNNAMED_FAILURE = "PY-ERROR:3"

PRINTS_ITS_OWN_OUTPUT = "PY-LOG:1"

VALUE_IN_THE_MESSAGE = "PY-LOG:3"

A_GUESSED_WAIT = "PY-ERROR:4"

CONJURED_CODE = "PY-SECURITY:3"

REACHES_UPWARD = "PY-TRUTH:3"

CLOCKS = frozenset({"time", "asyncio", "trio", "anyio"})

CONJURING = frozenset({"eval", "exec", "compile"})

A_LOOP = (ast.For, ast.AsyncFor, ast.While)

LOG_LEVELS = frozenset(
    {"debug", "info", "warning", "warn", "error", "exception", "critical", "fatal", "log"}
)

LOGGING_MODULES = frozenset({"logging", "structlog"})

A_BUILT_COMMAND = "PY-SECURITY:1"

A_BUILT_QUERY = "PY-SECURITY:2"

QUERYING = frozenset({"execute", "executemany", "executescript", "text"})

NUMBERS = frozenset({"int", "float"})

SQL_WORDS = frozenset(
    {"select", "insert", "update", "delete", "drop", "from", "where", "into", "values"}
)

ALWAYS_A_SHELL = frozenset({"system", "popen", "getoutput", "getstatusoutput"})

SHELL_ON_REQUEST = frozenset({"run", "call", "check_call", "check_output", "Popen"})

PASTING_METHODS = frozenset({"format", "join"})

TERMINAL_WRITES = frozenset({"write", "writelines"})

TERMINAL_HANDLES = frozenset({"stdout", "stderr"})

SAYS_NOTHING = frozenset({"Exception", "BaseException"})

MUTABLE_BUILDERS = frozenset(
    {"list", "dict", "set", "bytearray", "defaultdict", "Counter", "deque", "OrderedDict"}
)


def does_nothing(body):
    for statement in body:
        if isinstance(statement, ast.Pass):
            continue
        if isinstance(statement, ast.Expr) and isinstance(statement.value, ast.Constant):
            if statement.value.value is Ellipsis:
                continue
        return False
    return True


def destination_of(node):
    for given in node.keywords:
        if given.arg == "file":
            return given.value
    return None


def is_a_terminal_handle(held):
    if not isinstance(held, ast.Attribute) or held.attr not in TERMINAL_HANDLES:
        return False
    return isinstance(held.value, ast.Name) and held.value.id == "sys"


def is_pasted(held):
    if isinstance(held, ast.JoinedStr):
        return any(isinstance(one, ast.FormattedValue) for one in held.values)
    if isinstance(held, ast.BinOp):
        return isinstance(held.op, (ast.Add, ast.Mod))
    if isinstance(held, ast.Call) and isinstance(held.func, ast.Attribute):
        return held.func.attr in PASTING_METHODS
    return False


def written_parts(held):
    if isinstance(held, ast.Constant):
        return held.value if isinstance(held.value, str) else ""
    if isinstance(held, ast.JoinedStr):
        return " ".join(written_parts(one) for one in held.values)
    if isinstance(held, ast.BinOp):
        return written_parts(held.left) + " " + written_parts(held.right)
    if isinstance(held, ast.Call) and isinstance(held.func, ast.Attribute):
        return written_parts(held.func.value)
    return ""


def looks_like_sql(text):
    words = {one.strip(",;()").lower() for one in text.split()}
    return len(words & SQL_WORDS) >= 2


def is_a_number_again(held):
    if not (isinstance(held, ast.Call) and isinstance(held.func, ast.Name)):
        return False
    if held.func.id != "str" or not held.args:
        return False
    inner = held.args[0]
    return isinstance(inner, ast.Call) and isinstance(inner.func, ast.Name) and inner.func.id in NUMBERS


def is_only_marks(held):
    if isinstance(held, ast.List):
        return bool(held.elts) and all(
            isinstance(one, ast.Constant) and one.value == "?" for one in held.elts
        )
    if isinstance(held, ast.BinOp) and isinstance(held.op, ast.Mult):
        return is_only_marks(held.left) or is_only_marks(held.right)
    return False


def carries_nothing_sayable(held):
    if held is None:
        return False
    if isinstance(held, ast.Constant):
        return not isinstance(held.value, str)
    if is_a_number_again(held):
        return True
    if isinstance(held, ast.Call) and isinstance(held.func, ast.Attribute) and held.func.attr == "join":
        joined = held.args[0] if held.args else None
        if is_only_marks(joined):
            return True
        if isinstance(joined, (ast.GeneratorExp, ast.ListComp)):
            return is_a_number_again(joined.elt)
        return False
    return False


def varying_parts(held):
    if isinstance(held, ast.JoinedStr):
        return [one.value for one in held.values if isinstance(one, ast.FormattedValue)]
    if isinstance(held, ast.BinOp):
        return [one for one in (held.left, held.right) if not isinstance(one, ast.Constant)]
    if isinstance(held, ast.Call):
        return list(held.args)
    return []


def names_that_carry_nothing(tree):
    said = {}
    for node in ast.walk(tree):
        if not isinstance(node, ast.Assign) or len(node.targets) != 1:
            continue
        target = node.targets[0]
        if not isinstance(target, ast.Name):
            continue
        safe = carries_nothing_sayable(node.value)
        said[target.id] = said.get(target.id, True) and safe
    return {name for name, safe in said.items() if safe}


def builds_a_query(node, settled):
    if not isinstance(node.func, ast.Attribute) or node.func.attr not in QUERYING:
        return False
    given = node.args[0] if node.args else None
    if not is_pasted(given):
        return False
    if not looks_like_sql(written_parts(given)):
        return False
    parts = varying_parts(given)
    if not parts:
        return False
    return not all(
        (isinstance(one, ast.Name) and one.id in settled) or carries_nothing_sayable(one)
        for one in parts
    )


def asks_for_a_shell(node):
    for given in node.keywords:
        if given.arg != "shell":
            continue
        return not (isinstance(given.value, ast.Constant) and given.value.value is False)
    return False


def hands_the_system_a_line(node):
    if not isinstance(node.func, ast.Attribute):
        return False
    called = node.func.attr
    if called in ALWAYS_A_SHELL:
        return True
    if called not in SHELL_ON_REQUEST:
        return False
    return asks_for_a_shell(node)


def builds_a_command(node):
    if not hands_the_system_a_line(node):
        return False
    given = node.args[0] if node.args else None
    return is_pasted(given)


def writes_to_the_terminal(node):
    if isinstance(node.func, ast.Name):
        if node.func.id != "print":
            return False
        sent = destination_of(node)
        return sent is None or is_a_terminal_handle(sent)
    if not isinstance(node.func, ast.Attribute):
        return False
    if node.func.attr not in TERMINAL_WRITES:
        return False
    return is_a_terminal_handle(node.func.value)


def says_it_starts_the_program(node):
    if not isinstance(node, ast.If) or not isinstance(node.test, ast.Compare):
        return False
    test = node.test
    if len(test.ops) != 1 or not isinstance(test.ops[0], ast.Eq):
        return False
    sides = [test.left, test.comparators[0]]
    named = {one.id for one in sides if isinstance(one, ast.Name)}
    values = {one.value for one in sides if isinstance(one, ast.Constant)}
    return "__name__" in named and "__main__" in values


def starts_the_program(tree, path):
    if path.replace("\\", "/").split("/")[-1] == "__main__.py":
        return True
    return any(says_it_starts_the_program(node) for node in ast.walk(tree))


def is_a_test_file(path):
    parts = path.replace("\\", "/").split("/")
    name = parts[-1]
    if "tests" in parts[:-1] or "test" in parts[:-1]:
        return True
    return name.startswith("test_") or name.endswith("_test.py") or name == "conftest.py"


def shape_of(node):
    if node is None:
        return "None"
    if isinstance(node, ast.Constant):
        return f"constant:{node.value!r}"
    if isinstance(node, ast.List) and not node.elts:
        return "empty:list"
    if isinstance(node, ast.Dict) and not node.keys:
        return "empty:dict"
    if isinstance(node, ast.Set) and not node.elts:
        return "empty:set"
    if isinstance(node, ast.Tuple) and not node.elts:
        return "empty:tuple"
    return ""


def is_made_up(node):
    shape = shape_of(node)
    if shape.startswith("empty:") or shape == "None":
        return True
    return isinstance(node, ast.Constant)


def answers_already_given(body):
    given = set()
    for statement in body:
        for node in ast.walk(statement):
            if isinstance(node, ast.Return):
                shape = shape_of(node.value)
                if shape:
                    given.add(shape)
    return given


def looks_at_the_error(handler):
    if handler.name is None:
        return False
    for node in ast.walk(handler):
        if isinstance(node, ast.Name) and node.id == handler.name:
            return True
    return False


def made_up_answers_in(handler, already):
    found = []
    for statement in handler.body:
        for node in ast.walk(statement):
            if not isinstance(node, ast.Return):
                continue
            if shape_of(node.value) in already:
                continue
            if is_made_up(node.value):
                found.append(node.lineno)
    return found


def builder_name(call):
    if isinstance(call.func, ast.Name):
        return call.func.id
    if isinstance(call.func, ast.Attribute):
        return call.func.attr
    return ""


def is_mutable_default(node):
    if isinstance(node, (ast.List, ast.Dict, ast.Set)):
        return True
    if isinstance(node, ast.Call):
        return builder_name(node) in MUTABLE_BUILDERS
    return False


def defaults_of(node):
    given = list(node.args.defaults)
    for held in node.args.kw_defaults:
        if held is not None:
            given.append(held)
    return given


def a_logger_is_imported(tree):
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            if any(alias.name.split(".")[0] in LOGGING_MODULES for alias in node.names):
                return True
        if isinstance(node, ast.ImportFrom):
            root = (node.module or "").split(".")[0]
            if root in LOGGING_MODULES:
                return True
    return False


def is_a_string(node):
    return isinstance(node, ast.Constant) and isinstance(node.value, str)


def value_baked_into(node):
    if isinstance(node, ast.JoinedStr):
        return any(isinstance(part, ast.FormattedValue) for part in node.values)
    if isinstance(node, ast.BinOp) and isinstance(node.op, (ast.Mod, ast.Add)):
        return is_a_string(node.left) or is_a_string(node.right)
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
        return node.func.attr == "format" and is_a_string(node.func.value)
    return False


def is_a_logger(held):
    if isinstance(held, ast.Name):
        return "log" in held.id.lower()
    if isinstance(held, ast.Attribute):
        return "log" in held.attr.lower()
    if isinstance(held, ast.Call):
        return is_a_logger(held.func)
    return False


def message_carries_a_value(node):
    if not isinstance(node.func, ast.Attribute):
        return False
    if node.func.attr not in LOG_LEVELS:
        return False
    if not is_a_logger(node.func.value):
        return False
    return any(value_baked_into(given) for given in node.args)


def violations_in(tree, in_a_test_file, is_where_it_starts):
    settled = names_that_carry_nothing(tree)
    found = []
    a_logger_here = a_logger_is_imported(tree)
    for line in guessed_waits_in(tree, sleepers_imported(tree), False, set()):
        found.append({"rule": A_GUESSED_WAIT, "line": line})
    shadowed = names_bound_in(tree)
    for node in ast.walk(tree):
        if isinstance(node, ast.Global):
            found.append({"rule": REACHES_UPWARD, "line": node.lineno})
            continue
        if isinstance(node, ast.Call):
            if conjures_code(node, shadowed):
                found.append({"rule": CONJURED_CODE, "line": node.lineno})
            if builds_a_query(node, settled):
                found.append({"rule": A_BUILT_QUERY, "line": node.lineno})
            if builds_a_command(node):
                found.append({"rule": A_BUILT_COMMAND, "line": node.lineno})
            if not is_where_it_starts and writes_to_the_terminal(node):
                found.append({"rule": PRINTS_ITS_OWN_OUTPUT, "line": node.lineno})
            if a_logger_here and message_carries_a_value(node):
                found.append({"rule": VALUE_IN_THE_MESSAGE, "line": node.lineno})
            continue
        if isinstance(node, ast.Raise):
            thrown = node.exc
            if isinstance(thrown, ast.Call):
                thrown = thrown.func
            if isinstance(thrown, ast.Name) and thrown.id in SAYS_NOTHING:
                found.append({"rule": UNNAMED_FAILURE, "line": node.lineno})
            continue
        if isinstance(node, ast.ImportFrom):
            if any(alias.name == "*" for alias in node.names):
                found.append({"rule": LAUNDERED_NAMESPACE, "line": node.lineno})
            continue
        if isinstance(node, ast.Try):
            already = answers_already_given(node.body)
            for handler in node.handlers:
                if looks_at_the_error(handler):
                    continue
                for line in made_up_answers_in(handler, already):
                    found.append({"rule": MADE_UP_ANSWER, "line": line})
            continue
        if isinstance(node, ast.ExceptHandler):
            if node.type is None or does_nothing(node.body):
                found.append({"rule": BARE_EXCEPT, "line": node.lineno})
            continue
        if isinstance(node, ast.Assert):
            if not in_a_test_file:
                found.append({"rule": ASSERT_AS_A_CHECK, "line": node.lineno})
            continue
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda)):
            for given in defaults_of(node):
                if is_mutable_default(given):
                    found.append({"rule": MUTABLE_DEFAULT, "line": given.lineno})
    return found


def sleepers_imported(tree):
    found = set()
    for node in ast.walk(tree):
        if not isinstance(node, ast.ImportFrom):
            continue
        if (node.module or "").split(".")[0] not in CLOCKS:
            continue
        for alias in node.names:
            if alias.name == "sleep":
                found.add(alias.asname or alias.name)
    return found


def names_a_sleep(node, sleepers):
    if not isinstance(node, ast.Call):
        return False
    held = node.func
    if isinstance(held, ast.Attribute):
        if held.attr != "sleep":
            return False
        root = held.value
        while isinstance(root, ast.Attribute):
            root = root.value
        return isinstance(root, ast.Name) and root.id in CLOCKS
    return isinstance(held, ast.Name) and held.id in sleepers


def waits_forever(node):
    if isinstance(node, ast.Attribute):
        return node.attr == "inf"
    return isinstance(node, ast.Constant) and node.value == float("inf")


def is_a_guess(node, given_here):
    if not node.args:
        return False
    asked = node.args[0]
    if isinstance(asked, ast.Constant) and asked.value == 0:
        return False
    if waits_forever(asked):
        return False
    if isinstance(asked, ast.Name) and asked.id in given_here:
        return False
    return True


def parameters_of(node):
    held = node.args
    named = {one.arg for one in held.posonlyargs + held.args + held.kwonlyargs}
    if held.vararg is not None:
        named.add(held.vararg.arg)
    return named


def guessed_waits_in(node, sleepers, in_a_loop, given_here):
    found = []
    if not in_a_loop and names_a_sleep(node, sleepers) and is_a_guess(node, given_here):
        found.append(node.lineno)
    deeper = in_a_loop or isinstance(node, A_LOOP)
    for child in ast.iter_child_nodes(node):
        taken = given_here
        if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef)):
            taken = parameters_of(child)
        found.extend(guessed_waits_in(child, sleepers, deeper, taken))
    return found


def names_bound_in(tree):
    found = set()
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            found.add(node.name)
            continue
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            for alias in node.names:
                found.add(alias.asname or alias.name.split(".")[0])
            continue
        if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Store):
            found.add(node.id)
    return found


def conjures_code(node, shadowed):
    if not isinstance(node, ast.Call):
        return False
    if not isinstance(node.func, ast.Name):
        return False
    return node.func.id in CONJURING and node.func.id not in shadowed


def silences_the_checker(text):
    said = text.lstrip("#").strip()
    if said.startswith("type:"):
        return said[len("type:") :].strip().startswith("ignore")
    if said.startswith("mypy:"):
        return "ignore-errors" in said
    return False


def silenced_lines(source):
    found = []
    reader = io.StringIO(source).readline
    try:
        for token in tokenize.generate_tokens(reader):
            if token.type == tokenize.COMMENT and silences_the_checker(token.string):
                found.append(token.start[0])
    except (tokenize.TokenError, IndentationError, SyntaxError):
        return found
    return found


def judge(path):
    with open(path, "r", encoding="utf-8") as handle:
        source = handle.read()
    try:
        tree = ast.parse(source, filename=path)
    except SyntaxError as error:
        return {"unreadable": {"file": path, "detail": f"line {error.lineno}: {error.msg}"}}
    hits = list(violations_in(tree, is_a_test_file(path), starts_the_program(tree, path)))
    for line in silenced_lines(source):
        hits.append({"rule": SILENCED_CHECKER, "line": line})
    return {"violations": [dict(hit, file=path) for hit in hits]}


def main(argv):
    violations = []
    unreadable = []
    for path in argv:
        answer = judge(path)
        violations.extend(answer.get("violations", []))
        if "unreadable" in answer:
            unreadable.append(answer["unreadable"])
    return {"violations": violations, "unreadable": unreadable}


if __name__ == "__main__":
    try:
        print(json.dumps(main(sys.argv[1:])))
    except OSError as error:
        print(json.dumps({"error": str(error)}))
        sys.exit(1)
