import type { Check, Finding, Subject } from "../engine.ts";
import type { Rule } from "../rule.ts";
import { fieldAt } from "../../fields.ts";
import { lineOfNode, parseSource, walk } from "./parse.ts";

export const INLINE_STYLE: Rule = {
  id: "TS-LAYER:3",
  category: "LAYER",
  pass: "fast",
  bans: "a `style` attribute on a DOM element in JSX: `<div style={{ color: ink }}>`",
  why:
    "an inline style is a stylesheet of one element that the real stylesheet cannot reach, cannot override without !important and cannot theme; it is CSS-LAYER:1 written in another language, and the one place a value from outside lands in the page as a style",
  instead: [
    'a class in the stylesheet: `className="track-swatch"`',
    'for a value that really is per element, a custom property the stylesheet reads: `style={{ "--tint": tint }}` and `.track-swatch { background: var(--tint) }`',
    'a presentation attribute on an SVG element: `fill="currentColor"`',
  ],
  valve: { kind: "none" },
};

const A_DOM_TAG = /^[a-z]/;

function isACustomProperty(property: unknown): boolean {
  if (fieldAt(property, "type") !== "ObjectProperty") return false;
  if (fieldAt(property, "computed") === true) return false;
  const key = fieldAt(property, "key");
  if (fieldAt(key, "type") !== "StringLiteral") return false;
  const name = fieldAt(key, "value");
  return typeof name === "string" && name.startsWith("--");
}

function onlyCustomProperties(value: unknown): boolean {
  if (fieldAt(value, "type") !== "JSXExpressionContainer") return false;
  const held = fieldAt(value, "expression");
  if (fieldAt(held, "type") !== "ObjectExpression") return false;
  const properties = fieldAt(held, "properties");
  return Array.isArray(properties) && properties.every(isACustomProperty);
}

function isADomElement(name: unknown): boolean {
  if (fieldAt(name, "type") !== "JSXIdentifier") return false;
  const tag = fieldAt(name, "name");
  return typeof tag === "string" && A_DOM_TAG.test(tag);
}

export const inlineStyleCheck: Check = {
  rule: INLINE_STYLE,

  run(subject: Subject): readonly Finding[] {
    const parsed = parseSource(subject.file, subject.text);
    if (parsed.kind === "unreadable") return [];

    const found: Finding[] = [];
    walk(parsed.root, (node) => {
      if (node.type !== "JSXOpeningElement" || !isADomElement(node["name"])) return;
      const attributes = node["attributes"];
      if (!Array.isArray(attributes)) return;
      for (const attribute of attributes) {
        if (fieldAt(attribute, "type") !== "JSXAttribute") continue;
        if (fieldAt(fieldAt(attribute, "name"), "name") !== "style") continue;
        if (onlyCustomProperties(fieldAt(attribute, "value"))) continue;
        const line = fieldAt(fieldAt(fieldAt(attribute, "loc"), "start"), "line");
        found.push({ line: typeof line === "number" ? line : lineOfNode(node) });
      }
    });
    return found;
  },
};
