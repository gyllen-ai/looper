import type { Check, Finding, Subject } from "../engine.ts";
import type { Rule } from "../rule.ts";
import { lineOfNode, parseSource, walk, type Node } from "./parse.ts";
import { fieldAt } from "../../fields.ts";

export const WRITTEN_PAGE: Rule = {
  id: "TS-SECURITY:2",
  category: "SECURITY",
  pass: "fast",
  bans:
    "handing a value to something that reads it as markup: `innerHTML` and `outerHTML` assigned anything but a written-out string, `insertAdjacentHTML`, `document.write`, React's `dangerouslySetInnerHTML`, and Angular's `bypassSecurityTrust` family",
  why:
    "the browser does not read markup as text — it reads it as instructions, and a `<script>` or an `onerror=` inside a value someone else supplied runs with everything the page can reach: the session, the token in storage, whatever the logged-in person can do. Every framework already escapes what it renders; each of these is the door out of that escaping, and once a value goes through it nothing downstream can tell it apart from markup you wrote. The value looks harmless in a log, because a log is text",
  instead: [
    "set the text and let the browser escape it: `node.textContent = said`",
    "render it as a value, not as markup: `<span>{said}</span>` — the framework escapes it for you",
    "if it genuinely has to be markup, sanitise it into markup first and name that step: `const safe = sanitise(said)`",
    "build the element instead of the string: `const a = document.createElement('a'); a.href = url`",
  ],
  valve: { kind: "none" },
};

const MARKUP_PROPERTY: readonly string[] = ["innerHTML", "outerHTML"];

const WRITES_TO_THE_PAGE: readonly string[] = ["write", "writeln"];

const THE_DOCUMENT = "document";

const INSERTS_MARKUP = "insertAdjacentHTML";

const REACT_DOOR = "dangerouslySetInnerHTML";

const ANGULAR_DOOR = /^bypassSecurityTrust/;

function isWrittenOut(value: unknown): boolean {
  const type = fieldAt(value, "type");
  if (type === "StringLiteral") return true;
  if (type !== "TemplateLiteral") return false;
  const holes = fieldAt(value, "expressions");
  return Array.isArray(holes) && holes.length === 0;
}

function propertyOf(value: unknown): string {
  const name = fieldAt(fieldAt(value, "property"), "name");
  return typeof name === "string" ? name : "";
}

function objectOf(value: unknown): string {
  const name = fieldAt(fieldAt(value, "object"), "name");
  return typeof name === "string" ? name : "";
}

function argumentsOf(node: Node): readonly unknown[] {
  const held = node["arguments"];
  return Array.isArray(held) ? held : [];
}

function saidOf(node: Node, called: string): string {
  return `${called} on line ${lineOfNode(node)}`;
}

function fromACall(node: Node): Finding | null {
  const callee = node["callee"];
  const called = propertyOf(callee);
  if (called === INSERTS_MARKUP) {
    if (isWrittenOut(argumentsOf(node)[1])) return null;
    return { line: lineOfNode(node), said: saidOf(node, INSERTS_MARKUP) };
  }
  if (WRITES_TO_THE_PAGE.includes(called) && objectOf(callee) === THE_DOCUMENT) {
    if (isWrittenOut(argumentsOf(node)[0])) return null;
    return { line: lineOfNode(node), said: saidOf(node, `document.${called}`) };
  }
  if (ANGULAR_DOOR.test(called)) {
    return { line: lineOfNode(node), said: saidOf(node, called) };
  }
  return null;
}

export const writtenPageCheck: Check = {
  rule: WRITTEN_PAGE,

  run(subject: Subject): readonly Finding[] {
    const parsed = parseSource(subject.file, subject.text);
    if (parsed.kind === "unreadable") return [];

    const found: Finding[] = [];
    walk(parsed.root, (node) => {
      if (node.type === "AssignmentExpression") {
        const written = propertyOf(node["left"]);
        if (!MARKUP_PROPERTY.includes(written)) return;
        if (isWrittenOut(node["right"])) return;
        found.push({ line: lineOfNode(node), said: saidOf(node, written) });
        return;
      }
      if (node.type === "JSXAttribute") {
        if (fieldAt(node["name"], "name") !== REACT_DOOR) return;
        found.push({ line: lineOfNode(node), said: saidOf(node, REACT_DOOR) });
        return;
      }
      if (node.type !== "CallExpression") return;
      const held = fromACall(node);
      if (held !== null) found.push(held);
    });
    return found;
  },
};
