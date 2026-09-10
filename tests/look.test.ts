import { test } from "node:test";
import assert from "node:assert/strict";

import { TEXT_RATIO, THING_RATIO } from "../src/config.ts";
import { censusOf } from "../src/look/census.ts";
import { luminanceOf, neededFor, ratioBetween, tooFaintIn } from "../src/look/contrast.ts";
import { disagreements } from "../src/look/kinds.ts";
import {
  BLACK,
  DARK_GREY,
  DIM_GREY,
  EDGE_GREY,
  MID_GREY,
  NEAR_BLACK,
  OFF_TAB,
  ON_TAB,
  STRIPE_ONE,
  STRIPE_TWO,
  WHITE,
  WIDE_BLACK,
  WIDE_WHITE,
  frameOf,
  painted,
  worn,
} from "../audit/look-cases.ts";
import { first } from "./helpers.ts";

const NOTHING_SHIPPED = {};

test("two things of one kind wearing different lettering are one finding, naming both", () => {
  const held = disagreements([
    frameOf("only", 1440, [
      worn("span.label", { "font-size": "12px" }, 0),
      worn("span.label", { "font-size": "12px" }, 20),
      worn("span.label", { "font-size": "15px" }, 40),
    ], NOTHING_SHIPPED),
  ]);
  assert.equal(held.length, 1);
  const one = first(held);
  assert.equal(one.kind, "span.label");
  assert.equal(one.wearers, 3);
  const split = first(one.splits);
  assert.equal(split.property, "font-size");
  assert.equal(split.most.value, "12px");
  assert.equal(split.most.wearers.length, 2);
  assert.equal(first(split.others).value, "15px");
});

test("a caps heading and a sentence-case value are two kinds, so a table's own grammar is left alone", () => {
  const held = disagreements([
    frameOf("only", 1440, [
      worn("th.head", { "text-transform": "uppercase", "-looper-text-case": "UPPER" }, 0),
      worn("th.head", { "text-transform": "uppercase", "-looper-text-case": "UPPER" }, 0),
      worn("td.value", { "-looper-text-case": "Sentence case" }, 20),
      worn("td.value", { "-looper-text-case": "Sentence case" }, 40),
    ], NOTHING_SHIPPED),
  ]);
  assert.deepEqual(held, [], "a heading and a value were compared with each other");
});

test("a tab that is on and a tab that is off are two kinds, because the state is part of what it is", () => {
  const held = disagreements([
    frameOf("only", 1440, [
      worn("button.tab[data-state=active]", { color: ON_TAB }, 0),
      worn("button.tab[data-state=active]", { color: ON_TAB }, 0),
      worn("button.tab[data-state=inactive]", { color: OFF_TAB }, 0),
      worn("button.tab[data-state=inactive]", { color: OFF_TAB }, 0),
    ], NOTHING_SHIPPED),
  ]);
  assert.deepEqual(held, [], "an active tab was judged against an inactive one");
});

test("the same kind at two viewport widths is never compared, because a layout is allowed to answer the width", () => {
  const held = disagreements([
    frameOf("wide", 1440, [
      worn("a.link", { "padding-left": "20px" }, 0),
      worn("a.link", { "padding-left": "20px" }, 20),
    ], NOTHING_SHIPPED),
    frameOf("narrow", 390, [
      worn("a.link", { "padding-left": "14px" }, 0),
      worn("a.link", { "padding-left": "14px" }, 20),
    ], NOTHING_SHIPPED),
  ]);
  assert.deepEqual(held, [], "responsive padding was read as an inconsistency");
});

test("a stripe that alternates down the page is a pattern, not a disagreement", () => {
  const rows = [];
  for (let index = 0; index < 6; index += 1) {
    rows.push(worn("tr.row", { "background-color": index % 2 === 0 ? STRIPE_ONE : STRIPE_TWO }, index * 20));
  }
  assert.deepEqual(disagreements([frameOf("only", 1440, rows, NOTHING_SHIPPED)]), []);
});

test("a thing caught mid-animation is judged for nothing rather than reported as a stray value", () => {
  const held = disagreements([
    frameOf("only", 1440, [
      worn("div.fade", { opacity: "0.35" }, 0),
      worn("div.fade", { opacity: "0.35" }, 20),
      worn("div.fade", { opacity: "0.61", "-looper-moving": "yes" }, 40),
    ], NOTHING_SHIPPED),
  ]);
  assert.deepEqual(held, [], "a value read while it was still moving was reported as a defect");
});

test("a property nobody set reads as what the browser ships, never as the word unset", () => {
  const held = disagreements([
    frameOf("only", 1440, [
      worn("p.copy", { "font-size": "16px" }, 0),
      worn("p.copy", {}, 20),
    ], { "font-size": "16px" }),
  ]);
  assert.deepEqual(held, [], "a value equal to the browser default was read as missing instead");

  const differs = disagreements([
    frameOf("only", 1440, [
      worn("p.copy", { "font-size": "15px" }, 0),
      worn("p.copy", {}, 20),
    ], { "font-size": "16px" }),
  ]);
  const split = first(first(differs).splits);
  assert.equal(split.others.length, 1);
  assert.equal(first(split.others).value, "16px", "the default was not resolved to its real value");
});

test("black on white is twenty-one to one, which is the whole scale", () => {
  const held = ratioBetween(BLACK, WHITE);
  assert.equal(held.kind, "measured");
  if (held.kind !== "measured") return;
  assert.equal(held.ratio, 21);
  assert.equal(luminanceOf([255, 255, 255]), 1);
  assert.equal(luminanceOf([0, 0, 0]), 0);
});

test("a colour written the modern way is read, or every page using one is judged for nothing", () => {
  const held = ratioBetween(WIDE_BLACK, WIDE_WHITE);
  assert.equal(held.kind, "measured");
  if (held.kind !== "measured") return;
  assert.equal(held.ratio, 21);
});

test("large text needs less than small text, and the sizes that count as large are the written ones", () => {
  assert.equal(neededFor(new Map([["font-size", "14px"]])), TEXT_RATIO);
  assert.equal(neededFor(new Map([["font-size", "24px"]])), THING_RATIO);
  assert.equal(neededFor(new Map([["font-size", "19px"], ["font-weight", "700"]])), THING_RATIO);
  assert.equal(neededFor(new Map([["font-size", "19px"], ["font-weight", "400"]])), TEXT_RATIO);
});

test("words too faint against what is behind them are reported with the number that decided it", () => {
  const told = tooFaintIn([
    frameOf("only", 1440, [
      worn("span.dim (text)", {
        color: DIM_GREY,
        "font-size": "14px",
        "-looper-behind": MID_GREY,
      }, 0),
    ], NOTHING_SHIPPED),
  ]);
  assert.equal(told.faint, 1);
  const pair = first(told.pairings);
  assert.equal(pair.needs, TEXT_RATIO);
  assert.ok(pair.ratio < TEXT_RATIO, `${pair.ratio} was not read as too faint`);
});

test("a painted border is held to the lower bar, because it is a thing rather than words", () => {
  const told = tooFaintIn([
    frameOf("only", 1440, [
      painted("input.field", {
        "border-top-color": EDGE_GREY,
        "-looper-behind": DARK_GREY,
      }, ["top"]),
    ], NOTHING_SHIPPED),
  ]);
  assert.equal(told.faint, 1);
  assert.equal(first(told.pairings).needs, THING_RATIO);
});

test("one colour pair on many things is one decision, said once", () => {
  const many = [];
  for (let index = 0; index < 5; index += 1) {
    many.push(worn("span.dim (text)", {
      color: DIM_GREY,
      "font-size": "14px",
      "-looper-behind": MID_GREY,
    }, index * 20));
  }
  const told = tooFaintIn([frameOf("only", 1440, many, NOTHING_SHIPPED)]);
  assert.equal(told.faint, 5);
  assert.equal(told.pairings.length, 1);
  assert.equal(first(told.pairings).on, 5);
});

test("a ground nobody can work out is said out loud, never counted as passing", () => {
  const told = tooFaintIn([
    frameOf("only", 1440, [
      worn("span.dim (text)", { color: NEAR_BLACK, "font-size": "14px" }, 0),
    ], NOTHING_SHIPPED),
  ]);
  assert.equal(told.faint, 0);
  assert.equal(told.unknowable.length, 1);
  assert.match(first(told.unknowable).why, /nothing opaque/);
});

test("a value used exactly once is named, because it is a decision nobody else followed", () => {
  const held = censusOf([
    frameOf("only", 1440, [
      worn("p.a", { "font-family": "Inter" }, 0),
      worn("p.b", { "font-family": "Inter" }, 20),
      worn("p.c", { "font-family": "Comic Sans" }, 40),
    ], NOTHING_SHIPPED),
  ]);
  const font = held.filter((one) => one.property === "font-family");
  assert.equal(first(font).values, 2);
  assert.deepEqual(first(font).onceOnly, ["Comic Sans"]);
});
