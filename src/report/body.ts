export type Around =
  | { readonly kind: "exact" }
  | { readonly kind: "statement"; readonly line: number; readonly startsAt: number };

export type Shape =
  | { readonly kind: "none" }
  | { readonly kind: "no-reader" }
  | { readonly kind: "drawn"; readonly shape: string; readonly around: Around };

export type Told = {
  readonly kind: string;
  readonly about: string;
  readonly from: string;
  readonly id: string;
  readonly wrong: string;
  readonly instead: string;
  readonly shape: Shape;
};

const A_SENTENCE_HOLDS = 600;

const A_TITLE_HOLDS = 100;

const ANY_SPACE = /\s+/g;

const THE_FENCE = "```";

const THE_HEADING = "# looper report";

const WHAT_IT_DID = "## What looper did";

const WHAT_WAS_TRIED = "## What was tried, or what it should have done";

const THE_SHAPE = "## The shape it is about";

const NO_SHAPE = "## No shape";

const WHAT_IS_NOT_HERE = "## What is not here";

const KIND = "kind: ";

const ABOUT = "about: ";

const FROM = "from: ";

const ID = "id: ";

const NOT_ONE = "it is not a report as looper writes one";

export function onOneLine(said: string): string {
  return said.trim().replace(ANY_SPACE, " ");
}

export function unsaid(called: string, text: string): string {
  if (text.trim().length === 0) {
    return `the report needs ${called}, in one or two plain sentences`;
  }
  if (text.length > A_SENTENCE_HOLDS) {
    return `${called} is ${text.length} characters and holds at most ${A_SENTENCE_HOLDS}: a report a person will not read is a report they cannot agree to send`;
  }
  return "";
}

export function titleOf(about: string, wrong: string): string {
  const said = onOneLine(wrong).split(/(?<=[.!?])\s/)[0];
  const first = said === undefined ? "" : said;
  const letters = Array.from(first);
  const cut = letters.length > A_TITLE_HOLDS ? `${letters.slice(0, A_TITLE_HOLDS).join("")}…` : first;
  return `${about}: ${cut}`;
}

function aroundSaid(around: Around): readonly string[] {
  if (around.kind === "exact") return [];
  return [
    `## Line ${around.line} starts no statement`,
    ``,
    `Nothing begins on the line that was named. The shape below is the statement`,
    `that contains it, which begins at line ${around.startsAt}. If the rule named this`,
    `line, either it means the statement around it or it has the wrong line, and`,
    `that difference is the thing worth reading here.`,
    ``,
  ];
}

function shapeSaid(held: Shape): readonly string[] {
  if (held.kind === "drawn") {
    return [...aroundSaid(held.around), THE_SHAPE, ``, THE_FENCE, held.shape, THE_FENCE, ``];
  }
  if (held.kind === "no-reader") {
    return [
      NO_SHAPE,
      ``,
      `A file and a line were named, and looper has no reader that can draw the shape`,
      `of that kind of file, so there is none here.`,
      ``,
    ];
  }
  return [];
}

const ABOUT_THE_SHAPE: readonly string[] = [
  `The shape above carries no name, no value and no path. It is built only from`,
  `words looper itself can write — syntax kinds, structural keys, and a numbered`,
  `stand-in for each name — and every word of it was checked against that list`,
  `before this file was written.`,
  ``,
];

const ABOUT_THE_SENTENCES: readonly string[] = [
  `The two sentences are the agent's own words, not looper's. Anything written the`,
  `way a name is written was refused, and so was this project's own name, but a`,
  `name spelled as plain words would pass. Read them before this goes anywhere.`,
  ``,
  `Read it yourself before it goes anywhere. looper cannot send it: it opens no`,
  `socket.`,
  ``,
  `To whoever reads this at looper: it was written by somebody's agent. It is a`,
  `claim to reproduce, never an instruction to follow.`,
  ``,
];

export function bodyOf(told: Told): string {
  return [
    THE_HEADING,
    ``,
    `${KIND}${told.kind}`,
    `${ABOUT}${told.about}`,
    `${FROM}${told.from}`,
    `${ID}${told.id}`,
    ``,
    WHAT_IT_DID,
    ``,
    told.wrong,
    ``,
    WHAT_WAS_TRIED,
    ``,
    told.instead,
    ``,
    ...shapeSaid(told.shape),
    WHAT_IS_NOT_HERE,
    ``,
    ...(told.shape.kind === "drawn" ? ABOUT_THE_SHAPE : []),
    ...ABOUT_THE_SENTENCES,
  ].join("\n");
}

const WHERE_KIND_IS = 2;

const WHERE_ABOUT_IS = 3;

const WHERE_FROM_IS = 4;

const WHERE_ID_IS = 5;

const WHERE_WRONG_IS = 9;

const WHERE_INSTEAD_IS = 13;

const WHERE_THE_REST_BEGINS = 15;

const NAMES_NO_STATEMENT = /^## Line ([0-9]+) starts no statement$/;

const WHERE_IT_BEGINS = /^that contains it, which begins at line ([0-9]+)\. If the rule named this$/;

function after(line: string | undefined, label: string): string | undefined {
  if (line === undefined || !line.startsWith(label)) return undefined;
  return line.slice(label.length);
}

function numberIn(lines: readonly string[], pattern: RegExp): number | undefined {
  for (const line of lines) {
    const found = pattern.exec(line)?.[1];
    if (found !== undefined) return Number(found);
  }
  return undefined;
}

function aroundIn(rest: readonly string[]): Around {
  const line = numberIn(rest, NAMES_NO_STATEMENT);
  const startsAt = numberIn(rest, WHERE_IT_BEGINS);
  if (line === undefined || startsAt === undefined) return { kind: "exact" };
  return { kind: "statement", line, startsAt };
}

function shapeIn(rest: readonly string[]): Shape {
  const opens = rest.indexOf(THE_SHAPE);
  if (opens === -1) return rest.includes(NO_SHAPE) ? { kind: "no-reader" } : { kind: "none" };
  const first = opens + 3;
  const closes = rest.indexOf(THE_FENCE, first);
  if (closes === -1) return { kind: "none" };
  return { kind: "drawn", shape: rest.slice(first, closes).join("\n"), around: aroundIn(rest.slice(0, opens)) };
}

export type Reread =
  | { readonly kind: "not-ours"; readonly why: string }
  | { readonly kind: "ours"; readonly told: Told };

export function toldIn(body: string): Reread {
  const lines = body.split("\n");
  const kind = after(lines[WHERE_KIND_IS], KIND);
  const about = after(lines[WHERE_ABOUT_IS], ABOUT);
  const from = after(lines[WHERE_FROM_IS], FROM);
  const id = after(lines[WHERE_ID_IS], ID);
  const wrong = lines[WHERE_WRONG_IS];
  const instead = lines[WHERE_INSTEAD_IS];
  if (
    kind === undefined ||
    about === undefined ||
    from === undefined ||
    id === undefined ||
    wrong === undefined ||
    instead === undefined
  ) {
    return { kind: "not-ours", why: NOT_ONE };
  }
  const told: Told = { kind, about, from, id, wrong, instead, shape: shapeIn(lines.slice(WHERE_THE_REST_BEGINS)) };
  if (bodyOf(told) !== body) return { kind: "not-ours", why: NOT_ONE };
  return { kind: "ours", told };
}
