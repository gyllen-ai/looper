import { test } from "node:test";
import assert from "node:assert/strict";

import { NOTHING_LAID, answeredByACopy } from "./copied-src.ts";

const AGE = "code-age.ts";

test("a server whose code has not moved says nothing at all", () => {
  assert.equal(answeredByACopy(NOTHING_LAID, AGE, "copied.agingSaid(copied.ageOfOurCode())"), "");
});

test("a server running code older than what is on disk says so, and says what to do", () => {
  const said = answeredByACopy(
    NOTHING_LAID,
    AGE,
    "copied.agingSaid({ newest: copied.ageOfOurCode().newest - 60000, files: copied.ageOfOurCode().files })",
  );

  assert.equal(typeof said, "string");
  assert.notEqual(
    said,
    "",
    "a long-lived server keeps answering from the code it loaded while npm install replaces the files underneath it, and its stale answer is word for word what looper says when a thing genuinely does not exist",
  );
  assert.match(String(said), /reconnect/i);
});

test("a file count that changed is enough on its own, because a file can arrive without any of its neighbours moving", () => {
  const said = answeredByACopy(
    NOTHING_LAID,
    AGE,
    "copied.agingSaid({ newest: copied.ageOfOurCode().newest, files: copied.ageOfOurCode().files - 1 })",
  );

  assert.notEqual(said, "");
});

test("a file that is gone by the time the walk reaches it is passed over, never thrown", () => {
  const said = answeredByACopy(
    { written: {}, gone: ["gone-before-it-was-read.ts"] },
    AGE,
    "copied.agingSaid(copied.ageOfOurCode())",
  );

  assert.equal(
    said,
    "",
    "npm install replaces looper's files under a running server, which is the moment this walk exists for; a file listed and then gone failed the whole answer with ENOENT",
  );
});
