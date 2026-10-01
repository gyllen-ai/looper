import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const A_PYTHON_READER_LOADS: readonly string[] = ["ast", "io", "json", "sys", "tokenize"];

const NEVER_WRITTEN_IN_A_PYTHON_READER: readonly string[] = [
  "__import__",
  "importlib",
  "eval",
  "exec",
  "compile",
  "__builtins__",
  "modules",
  "globals",
  "locals",
  "vars",
  "setattr",
  "__loader__",
  "__spec__",
  "breakpoint",
];

const READS_PYTHON_AS_PYTHON_DOES = [
  "import ast, json, sys",
  "tree = ast.parse(sys.stdin.read())",
  "loads, names = [], []",
  "for node in ast.walk(tree):",
  "    if isinstance(node, ast.Import):",
  "        loads.extend(alias.name for alias in node.names)",
  "    elif isinstance(node, ast.ImportFrom):",
  "        loads.append(node.module or '.')",
  "    elif isinstance(node, ast.Name):",
  "        names.append(node.id)",
  "    elif isinstance(node, ast.Attribute):",
  "        names.append(node.attr)",
  "print(json.dumps({'loads': sorted(set(loads)), 'names': sorted(set(names))}))",
].join("\n");

export function reachesInPython(source: string): readonly string[] {
  const ran = spawnSync("python3", ["-I", "-S", "-c", READS_PYTHON_AS_PYTHON_DOES], { input: source, encoding: "utf8" });
  if (ran.status !== 0) return [`python could not read it (${String(ran.stderr).trim().split("\n").at(-1)})`];
  const said: unknown = JSON.parse(ran.stdout);
  const loads: unknown = Object.getOwnPropertyDescriptor(said, "loads")?.value;
  const names: unknown = Object.getOwnPropertyDescriptor(said, "names")?.value;
  assert.ok(Array.isArray(loads) && Array.isArray(names));
  return [
    ...loads.map(String).filter((one) => !A_PYTHON_READER_LOADS.includes(one)).map((one) => `loads ${one}`),
    ...names.map(String).filter((one) => NEVER_WRITTEN_IN_A_PYTHON_READER.includes(one)).map((one) => `names ${one}`),
  ];
}
