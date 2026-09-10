import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { NEAR_MISS_PX, SAME_LINE_PX } from "../src/config.ts";
import { driftAcross } from "../src/align/across.ts";
import { readFrame, type Frame } from "../src/align/frame.ts";
import { judgeFrame, unmoved, type Alone } from "../src/align/judge.ts";
import { heldIn, keep, newestLook, staleAgainst } from "../src/align/store.ts";
import { standingVerdict } from "../src/align/capability.ts";
import {
  bordered,
  box,
  drawn,
  frameOf,
  ghost,
  lettered,
  painted,
} from "../audit/align-cases.ts";
import { first, gitIn } from "./helpers.ts";

function frameFrom(source: string): Frame {
  const held = readFrame(source);
  assert.equal(held.kind, "frame", held.kind === "unreadable" ? held.why : "");
  if (held.kind !== "frame") throw new Error(held.why);
  return held.frame;
}

function aloneIn(source: string): readonly Alone[] {
  return judgeFrame(frameFrom(source)).alone;
}

function named(alone: readonly Alone[]): readonly string[] {
  return alone.map((one) => `${one.axis} ${one.at} ${one.mark}`);
}

test("a box that paints nothing has no lines, so it can neither break nor make an alignment", () => {
  const source = frameOf([
    ghost("div.wrap", box(10, 10, 900, 700)),
    ghost("div.row", box(37, 41, 613, 89)),
  ]);
  const verdict = judgeFrame(frameFrom(source));
  assert.equal(verdict.lines, 0, "an invisible box contributed a line");
  assert.deepEqual(verdict.alone, [], "an invisible box was judged for an alignment nobody can see");
});

test("two marks with no background line up on the middle of what they draw, whatever their boxes", () => {
  const source = frameOf([
    drawn("header > svg.chevron", box(240, 20, 272, 52), box(250, 30, 262, 38)),
    drawn("sidebar > button.add", box(236, 80, 276, 120), box(248, 88, 264, 104)),
  ]);
  const down = aloneIn(source).filter((one) => one.axis === "down");
  assert.deepEqual(
    named(down),
    [],
    "the chevron and the plus share a centre and were still reported as unaligned; that is the box being judged instead of the mark",
  );
});

test("a painted edge that nothing else sits on is reported, one finding per edge", () => {
  const source = frameOf([painted("main > div.card", box(100, 200, 400, 300))]);
  assert.deepEqual(named(aloneIn(source)).sort(), [
    "across 200 main > div.card",
    "across 300 main > div.card",
    "down 100 main > div.card",
    "down 400 main > div.card",
  ]);
});

test("a mark cannot connect to itself, because a box agreeing with its own edges is not an alignment", () => {
  const square = frameOf([painted("main > div.card", box(100, 100, 400, 400))]);
  assert.equal(aloneIn(square).length, 4, "a square's own edges were read as connecting each other");
});

test("a line just off a shared one is a near miss, and it names the line it missed", () => {
  const source = frameOf([
    painted("main > div.card", box(100, 200, 400, 300)),
    painted("main > div.third", box(100, 400, 400, 460)),
    painted("main > div.other", box(101.5, 320, 400, 380)),
  ]);
  const near = aloneIn(source).filter((one) => one.axis === "down" && one.at === 101.5);
  const held = first(near).miss;
  assert.notEqual(held, null, "a left edge 1.5 from a column of two was not reported as a near miss");
  if (held === null) return;
  assert.equal(held.at, 100);
  assert.equal(held.by, 1.5);
  assert.equal(held.sharedWith, "main > div.card");
});

test("a line further away than the near window stands alone rather than pointing at a column it never tried to meet", () => {
  const far = SAME_LINE_PX + NEAR_MISS_PX + 1;
  const source = frameOf([
    painted("main > div.card", box(100, 200, 400, 300)),
    painted("main > div.third", box(100, 400, 400, 460)),
    painted("main > div.other", box(100 + far, 320, 400, 380)),
  ]);
  const held = aloneIn(source).filter((one) => one.axis === "down" && one.at === 100 + far);
  assert.equal(first(held).miss, null);
});

test("two lines that miss only each other are one finding, not two", () => {
  const source = frameOf([
    drawn("a.one", box(0, 0, 300, 20), box(54.44, 4, 120, 16)),
    drawn("a.two", box(0, 40, 300, 60), box(56, 44, 200, 56)),
  ]);
  const near = aloneIn(source).filter((one) => one.axis === "down" && one.miss !== null);
  assert.equal(near.length, 1, `the same near miss was reported from both sides: ${named(near).join(", ")}`);
  assert.equal(first(near).mutual, true);
});

test("the inside of a border is a line, so a child sitting against it is not a miss", () => {
  const source = frameOf([
    bordered("section > div.panel", box(270, 270, 670, 670), 1),
    painted("div.panel > div.head", box(271, 271, 669, 299)),
  ]);
  const inside = aloneIn(source).filter((one) => one.at === 271 || one.at === 669);
  assert.deepEqual(named(inside), [], "a one pixel border was reported as a one pixel misalignment");
});

test("two text runs of different sizes connect on the baseline they share, not on tops that cannot match", () => {
  const source = frameOf([
    lettered("li > span.number", box(0, 0, 40, 40), box(4, 10, 30, 24), 24),
    lettered("li > h2", box(50, 0, 400, 40), box(54, 4, 380, 24), 24),
  ]);
  const across = aloneIn(source).filter((one) => one.axis === "across");
  assert.deepEqual(
    named(across),
    [],
    "a number and a heading on one baseline were reported as unaligned because their cap heights differ",
  );
});

test("a frame that does not say whether a mark draws ink is refused, because absence is not none", () => {
  const raw = JSON.parse(frameOf([painted("div.a", box(0, 0, 1, 1))]));
  delete raw.marks[0].ink;
  const held = readFrame(JSON.stringify(raw));
  assert.equal(held.kind, "unreadable");
  if (held.kind !== "unreadable") return;
  assert.match(held.why, /whether it draws ink/);
});

test("a frame with no state name is refused, because a page judged under no state is a page half judged", () => {
  const raw = JSON.parse(frameOf([painted("div.a", box(0, 0, 1, 1))]));
  delete raw.state;
  const held = readFrame(JSON.stringify(raw));
  assert.equal(held.kind, "unreadable");
});

test("a control captured in only one of its states is named, never counted as judged", () => {
  const shut: Frame = frameFrom(frameOf([]));
  const open: Frame = frameFrom(frameOf([]));
  const both = [
    { ...shut, state: "shut", switches: [{ at: "button.org", kind: "aria-expanded", value: "false" }] },
    { ...open, state: "open", switches: [{ at: "button.org", kind: "aria-expanded", value: "false" }] },
  ];
  assert.deepEqual(unmoved(both).map((one) => one.at), ["button.org"]);

  const moved = [
    both[0],
    { ...open, state: "open", switches: [{ at: "button.org", kind: "aria-expanded", value: "true" }] },
  ];
  assert.deepEqual(unmoved(moved.filter((one) => one !== undefined)), []);
});

function tabbed(state: string, left: number): Frame {
  return {
    ...frameFrom(
      frameOf([
        painted("main > article.card", box(left, 100, 900, 200)),
        painted("main > article.card", box(left, 220, 900, 320)),
        painted("main > article.card", box(left, 340, 900, 440)),
      ]),
    ),
    state,
  };
}

test("the same element's same edge, standing somewhere else on another page of the same width, is reported", () => {
  const held = driftAcross([tabbed("overview", 312), tabbed("activity", 320)]);
  assert.equal(held.length, 1, `expected one drift, got ${held.length}`);
  const one = first(held);
  assert.equal(one.here.at, 312);
  assert.equal(one.there.at, 320);
  assert.equal(one.by, 8);
  assert.equal(one.here.frame, "case · overview");
  assert.match(one.key, /article\.card — its painted left edge/);
});

test("one card standing somewhere else is a drift, even when it is the only one that moved", () => {
  const overview = frameFrom(
    frameOf([
      painted("main > article.card", box(316, 100, 900, 200)),
      painted("main > aside.note", box(335, 220, 900, 320)),
    ]),
  );
  const activity = frameFrom(
    frameOf([
      painted("main > article.card", box(316, 100, 900, 200)),
      painted("main > aside.note", box(333, 220, 900, 320)),
    ]),
  );
  const held = driftAcross([
    { ...overview, state: "overview" },
    { ...activity, state: "activity" },
  ]);
  const lefts = held.filter((one) => one.key.includes("left"));
  assert.equal(lefts.length, 1, `expected the one moved card, got ${held.map((o) => o.key).join(", ")}`);
  assert.equal(first(lefts).by, 2);
});

test("an element only one of the two pages has drifts nowhere, because it never stood anywhere else", () => {
  const one = frameFrom(frameOf([painted("main > article.card", box(316, 100, 900, 200))]));
  const two = frameFrom(frameOf([painted("main > section.other", box(320, 100, 900, 200))]));
  assert.deepEqual(driftAcross([{ ...one, state: "a" }, { ...two, state: "b" }]), []);
});

test("two pages that stand their elements in the same places drift nowhere", () => {
  assert.deepEqual(driftAcross([tabbed("overview", 312), tabbed("activity", 312)]), []);
});

test("the same edge far away on the other page is a different layout, not a drift", () => {
  assert.deepEqual(driftAcross([tabbed("overview", 312), tabbed("activity", 700)]), []);
});

test("frames captured at different widths are never compared, because the layout is allowed to differ", () => {
  const wide = tabbed("wide", 312);
  const narrow = { ...tabbed("narrow", 320), width: 390 };
  assert.deepEqual(driftAcross([wide, narrow]), []);
});

function projectWith(source: string): string {
  const root = mkdtempSync(join(tmpdir(), "looper-align-"));
  gitIn(root, "init", "-q");
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src", "app.css"), ".card { color: red }\n");
  gitIn(root, "add", "-A");
  keep(root, frameFrom(source), source);
  return root;
}

test("a frame captured before the last change to what the project draws is refused, not passed", () => {
  const source = frameOf([painted("div.a", box(0, 0, 1, 1))]);
  const root = projectWith(source);
  const later = Date.now() / 1000 + 60;
  utimesSync(join(root, "src", "app.css"), later, later);
  const stale = staleAgainst(heldIn(root).frames, newestLook(root));
  assert.equal(stale.length, 1, "a frame older than the stylesheet was treated as an answer");
  assert.equal(first(stale).file, "src/app.css");
});

test("a project with no frames says so rather than passing for having asked nothing", () => {
  const root = mkdtempSync(join(tmpdir(), "looper-align-"));
  const said = standingVerdict(root).join("\n");
  assert.match(said, /no frames captured/);
});

test("what was stored is what is judged, and it comes back the same", () => {
  const source = frameOf([painted("div.a", box(0, 0, 1, 1))]);
  const root = projectWith(source);
  const held = heldIn(root);
  assert.deepEqual(held.unreadable, []);
  assert.equal(first(held.frames).marks.length, 1);
  assert.equal(judgeFrame(first(held.frames)).alone.length, 4);
});
