import { PAGE_EXTENSIONS, STYLESHEET_EXTENSIONS } from "../../config.ts";

export type Declaration = {
  readonly property: string;
  readonly value: string;
  readonly at: number;
};

const LINE_COMMENT_EXTENSIONS: readonly string[] = [".scss", ".sass"];

const NO_SEMICOLONS: readonly string[] = [".sass"];

const NEWLINE = "\n";

const BLANK = " ";

const URL_OPENER = "url(";

const WHITESPACE = /\s/;

export function isStylesheet(file: string): boolean {
  return STYLESHEET_EXTENSIONS.some((suffix) => file.endsWith(suffix));
}

export function isPage(file: string): boolean {
  return PAGE_EXTENSIONS.some((suffix) => file.endsWith(suffix));
}

export function isStyling(file: string): boolean {
  return isStylesheet(file) || isPage(file);
}

export function hasLineComments(file: string): boolean {
  return LINE_COMMENT_EXTENSIONS.some((suffix) => file.endsWith(suffix));
}

export function endsAtNewline(file: string): boolean {
  return NO_SEMICOLONS.some((suffix) => file.endsWith(suffix));
}

export function lineAt(text: string, offset: number): number {
  let line = 1;
  for (let at = 0; at < offset && at < text.length; at += 1) {
    if (text.charAt(at) === NEWLINE) line += 1;
  }
  return line;
}

function blankRun(out: string[], text: string, from: number, to: number): void {
  for (let at = from; at < to && at < text.length; at += 1) {
    out[at] = text.charAt(at) === NEWLINE ? NEWLINE : BLANK;
  }
}

function endOfString(text: string, from: number, quote: string): number {
  let at = from + 1;
  while (at < text.length) {
    const char = text.charAt(at);
    if (char === "\\") {
      at += 2;
      continue;
    }
    if (char === quote || char === NEWLINE) return at;
    at += 1;
  }
  return text.length;
}

function opensUrl(text: string, at: number): boolean {
  return text.slice(at, at + URL_OPENER.length).toLowerCase() === URL_OPENER;
}

function endOfUrl(text: string, from: number): number {
  let at = from;
  while (at < text.length && WHITESPACE.test(text.charAt(at))) at += 1;
  const quote = text.charAt(at);
  if (quote === '"' || quote === "'") {
    const closed = endOfString(text, at, quote);
    const end = text.indexOf(")", closed);
    return end === -1 ? text.length : end;
  }
  const end = text.indexOf(")", from);
  return end === -1 ? text.length : end;
}

export function blankedCss(text: string, lineComments: boolean): string {
  const out = [...text];
  let at = 0;
  while (at < text.length) {
    const pair = text.slice(at, at + 2);
    if (pair === "/*") {
      const end = text.indexOf("*/", at + 2);
      const stop = end === -1 ? text.length : end + 2;
      blankRun(out, text, at, stop);
      at = stop;
      continue;
    }
    if (lineComments && pair === "//") {
      const end = text.indexOf(NEWLINE, at);
      const stop = end === -1 ? text.length : end;
      blankRun(out, text, at, stop);
      at = stop;
      continue;
    }
    const char = text.charAt(at);
    if (char === '"' || char === "'") {
      const stop = endOfString(text, at, char);
      blankRun(out, text, at + 1, stop);
      at = stop + 1;
      continue;
    }
    if (opensUrl(text, at)) {
      const stop = endOfUrl(text, at + URL_OPENER.length);
      blankRun(out, text, at + URL_OPENER.length, stop);
      at = stop;
      continue;
    }
    at += 1;
  }
  return out.join("");
}

const A_STYLE_OPENER = /<style\b[^>]*>/gi;

const A_STYLE_CLOSER = "</style>";

export function styleOnly(page: string): string {
  const out: string[] = [];
  for (const char of page) out.push(char === NEWLINE ? NEWLINE : BLANK);

  A_STYLE_OPENER.lastIndex = 0;
  let held = A_STYLE_OPENER.exec(page);
  while (held !== null) {
    const from = held.index + held[0].length;
    const closed = page.toLowerCase().indexOf(A_STYLE_CLOSER, from);
    const to = closed === -1 ? page.length : closed;
    for (let at = from; at < to; at += 1) out[at] = page.charAt(at);
    A_STYLE_OPENER.lastIndex = to;
    held = A_STYLE_OPENER.exec(page);
  }
  return out.join("");
}

const A_SCRIPT_OPENER = /<script\b[^>]*>/gi;

const A_SCRIPT_CLOSER = "</script>";

const A_CODE_BLOCK = /@(?:code|functions)?\s*\{/g;

function endOfBraces(text: string, from: number): number {
  let depth = 1;
  let at = from;
  let quote = "";
  while (at < text.length) {
    const char = text.charAt(at);
    if (quote.length > 0) {
      if (char === "\\") at += 1;
      else if (char === quote) quote = "";
      at += 1;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      at += 1;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return at + 1;
    }
    at += 1;
  }
  return text.length;
}

export function blankedPage(page: string): string {
  const out = [...page];

  let comment = page.indexOf("<!--");
  while (comment !== -1) {
    const end = page.indexOf("-->", comment + 4);
    const stop = end === -1 ? page.length : end + 3;
    blankRun(out, page, comment, stop);
    comment = page.indexOf("<!--", stop);
  }

  A_SCRIPT_OPENER.lastIndex = 0;
  let held = A_SCRIPT_OPENER.exec(page);
  while (held !== null) {
    const from = held.index + held[0].length;
    const closed = page.toLowerCase().indexOf(A_SCRIPT_CLOSER, from);
    const to = closed === -1 ? page.length : closed;
    blankRun(out, page, from, to);
    A_SCRIPT_OPENER.lastIndex = to;
    held = A_SCRIPT_OPENER.exec(page);
  }

  A_CODE_BLOCK.lastIndex = 0;
  let block = A_CODE_BLOCK.exec(page);
  while (block !== null) {
    const to = endOfBraces(page, block.index + block[0].length);
    blankRun(out, page, block.index, to);
    A_CODE_BLOCK.lastIndex = to;
    block = A_CODE_BLOCK.exec(page);
  }

  return out.join("");
}

export function cssViewOf(file: string, text: string): string {
  if (isPage(file)) return blankedCss(styleOnly(blankedPage(text)), false);
  return blankedCss(text, hasLineComments(file));
}

const AN_IDENTIFIER = /[A-Za-z0-9_-]/;

const SASS_VARIABLE = "$";

function propertyBefore(text: string, colon: number): string {
  let at = colon - 1;
  while (at >= 0 && WHITESPACE.test(text.charAt(at))) at -= 1;
  const end = at + 1;
  while (at >= 0 && AN_IDENTIFIER.test(text.charAt(at))) at -= 1;
  if (text.charAt(at) === SASS_VARIABLE) return text.slice(at, end);
  return text.slice(at + 1, end);
}

function endsValue(char: string, atNewline: boolean): boolean {
  if (char === ";" || char === "}" || char === "{") return true;
  return atNewline && char === NEWLINE;
}

export function declarationsIn(view: string, atNewline: boolean): readonly Declaration[] {
  const found: Declaration[] = [];
  let colon = view.indexOf(":");
  while (colon !== -1) {
    const property = propertyBefore(view, colon);
    if (property.length === 0) {
      colon = view.indexOf(":", colon + 1);
      continue;
    }
    let end = colon + 1;
    while (end < view.length && !endsValue(view.charAt(end), atNewline)) end += 1;
    if (view.charAt(end) !== "{") {
      found.push({ property, value: view.slice(colon + 1, end), at: colon + 1 });
    }
    colon = view.indexOf(":", end);
  }
  return found;
}

const A_TOKEN_NAME = /--[A-Za-z0-9_-]+/g;

export function withoutTokenNames(value: string): string {
  return value.replace(A_TOKEN_NAME, (name) => BLANK.repeat(name.length));
}

export function withoutArithmetic(value: string): string {
  const out = [...value];
  const opener = /\bcalc\s*\(/gi;
  opener.lastIndex = 0;
  let held = opener.exec(value);
  while (held !== null) {
    let depth = 1;
    let at = held.index + held[0].length;
    while (at < value.length && depth > 0) {
      const char = value.charAt(at);
      if (char === "(") depth += 1;
      if (char === ")") depth -= 1;
      out[at] = char === NEWLINE ? NEWLINE : BLANK;
      at += 1;
    }
    opener.lastIndex = at;
    held = opener.exec(value);
  }
  return out.join("");
}
