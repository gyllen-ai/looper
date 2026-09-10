import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Secrets } from "../src/secrets/capability.ts";
import { dispatchHook } from "../src/registry.ts";
import { intentOf } from "../src/law/commit-command.ts";
import { everyWordAt } from "../src/git.ts";
import { strangers } from "../src/commands/strangers.ts";
import { saidAboutStrangers, strangersLeaving, tokensIn } from "../src/secrets/strangers.ts";
import { gitIn as git } from "./helpers.ts";

function repoWithARemote(): string {
  const bare = mkdtempSync(join(tmpdir(), "looper-remote-"));
  git(bare, "init", "-q", "--bare");
  const root = mkdtempSync(join(tmpdir(), "looper-strangers-"));
  mkdirSync(join(root, "docs"), { recursive: true });
  git(root, "init", "-q");
  git(root, "config", "user.email", "t@example.com");
  git(root, "config", "user.name", "t");
  writeFileSync(join(root, "docs/plan.md"), "The gate reads the staged text.\n");
  git(root, "add", "-A");
  git(root, "commit", "-qm", "first");
  git(root, "remote", "add", "origin", bare);
  git(root, "push", "-q", "-u", "origin", "HEAD");
  return root;
}

function pushing(root: string) {
  return dispatchHook([new Secrets()], {
    root,
    event: "PreToolUse",
    payload: {
      kind: "text",
      text: JSON.stringify({ tool_name: "Bash", tool_input: { command: "git push" } }),
    },
  });
}

function said(run: ReturnType<typeof pushing>): string {
  return [...run.refusals.map((one) => one.reason), ...run.mentions.map((one) => one.note)].join("\n");
}

test("a push is read as a push", () => {
  assert.equal(intentOf("git push").kind, "push");
  assert.equal(intentOf("git push -u origin HEAD").kind, "push");
  assert.equal(intentOf("git commit -m x && git push").kind, "commit");
  assert.equal(intentOf("npm run push").kind, "other");
});

test("a word that appears nowhere else in the repository is named before it leaves", () => {
  const root = repoWithARemote();
  try {
    writeFileSync(join(root, "docs/plan.md"), "The gate reads Contoso.Api and ContosoWeb.\n");
    git(root, "add", "-A");
    git(root, "commit", "-qm", "second");

    const spoken = said(pushing(root));
    assert.ok(
      spoken.includes("ContosoWeb"),
      `adopter issue #97: a grep for the words somebody thought of reported clean, and three directory names nobody had pictured went to a public repository.\n${spoken}`,
    );
    assert.ok(spoken.includes("docs/plan.md"), spoken);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a push carrying only words this repository already knows says nothing", () => {
  const root = repoWithARemote();
  try {
    writeFileSync(join(root, "docs/plan.md"), "The gate reads the staged text.\nThe gate reads the text.\n");
    git(root, "add", "-A");
    git(root, "commit", "-qm", "second");

    assert.equal(said(pushing(root)), "", "every word was already in the repository");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a repository with nothing to compare against says so rather than staying quiet", () => {
  const root = mkdtempSync(join(tmpdir(), "looper-noremote-"));
  try {
    git(root, "init", "-q");
    git(root, "config", "user.email", "t@example.com");
    git(root, "config", "user.name", "t");
    writeFileSync(join(root, "a.md"), "one\n");
    git(root, "add", "-A");
    git(root, "commit", "-qm", "only");

    const spoken = said(pushing(root));
    assert.ok(
      spoken.includes("not checked"),
      `silence is indistinguishable from approval, which is the whole complaint in #97\n${spoken}`,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a branch with no upstream still has something to compare against", () => {
  const bare = mkdtempSync(join(tmpdir(), "looper-remote-"));
  git(bare, "init", "-q", "--bare");
  const root = mkdtempSync(join(tmpdir(), "looper-noupstream-"));
  try {
    mkdirSync(join(root, "docs"), { recursive: true });
    git(root, "init", "-q");
    git(root, "config", "user.email", "t@example.com");
    git(root, "config", "user.name", "t");
    writeFileSync(join(root, "docs/plan.md"), "The gate reads the staged text.\n");
    git(root, "add", "-A");
    git(root, "commit", "-qm", "first");
    git(root, "remote", "add", "origin", bare);
    git(root, "push", "-q", "origin", "HEAD:main");
    git(root, "checkout", "-q", "-b", "work");

    writeFileSync(join(root, "docs/plan.md"), "The gate reads Contoso.Api and ContosoWeb.\n");
    git(root, "add", "-A");
    git(root, "commit", "-qm", "second");

    const spoken = said(pushing(root));
    assert.ok(
      spoken.includes("ContosoWeb"),
      `a branch with no upstream is the ordinary case for a first push, and git only sets origin/HEAD on a fresh clone. Falling back to it alone means the check gives up exactly when somebody is pushing new work for the first time.\n${spoken}`,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(bare, { recursive: true, force: true });
  }
});

test("a repository whose vocabulary is larger than a megabyte still has one", () => {
  const said = everyWordAt(join(import.meta.dirname, ".."), "HEAD", ["vendor", "package-lock.json"]);
  assert.equal(
    said.kind,
    "words",
    `looper's own vocabulary is over a megabyte, and git's answer was capped at one, so the push check could not build it: ${said.kind === "cannot-tell" ? said.why : ""}. Every reader got a larger cap in #112; the git commands they are read through did not.`,
  );
});

test("the command names a stranger, its file and its line", () => {
  const bare = mkdtempSync(join(tmpdir(), "looper-remote-"));
  git(bare, "init", "-q", "--bare");
  const root = mkdtempSync(join(tmpdir(), "looper-cmd-"));
  const wasIn = process.cwd();
  try {
    mkdirSync(join(root, "docs"), { recursive: true });
    git(root, "init", "-q");
    git(root, "config", "user.email", "t@example.com");
    git(root, "config", "user.name", "t");
    writeFileSync(join(root, "docs/plan.md"), "The gate reads the staged text.\n");
    git(root, "add", "-A");
    git(root, "commit", "-qm", "first");
    git(root, "remote", "add", "origin", bare);
    git(root, "push", "-q", "-u", "origin", "HEAD");

    writeFileSync(join(root, "docs/plan.md"), "The gate reads Contoso.Widgets now.\n");
    git(root, "add", "-A");
    git(root, "commit", "-qm", "second");

    process.chdir(root);
    const out: string[] = [];
    const said = strangers([], { say: (line) => out.push(line), warn: (line) => out.push(line) });
    const spoken = out.join("\n");

    assert.equal(said, 0, "it reports and never fails a build");
    assert.match(spoken, /ContosoWeb|Contoso/, spoken);
    assert.match(spoken, /docs\/plan\.md:1/, spoken);
  } finally {
    process.chdir(wasIn);
    rmSync(root, { recursive: true, force: true });
    rmSync(bare, { recursive: true, force: true });
  }
});

test("a directory the project says is generated is not vocabulary and is not searched", () => {
  const root = repoWithARemote();
  try {
    writeFileSync(join(root, "law.toml"), 'generated = ["dist"]\n');
    mkdirSync(join(root, "dist"), { recursive: true });
    writeFileSync(join(root, "dist/page.html"), "<p>zqxwvu</p>\n");
    git(root, "add", "-A");
    git(root, "commit", "-qm", "build output");
    git(root, "push", "-q", "origin", "HEAD");
    writeFileSync(join(root, "docs/plan.md"), "The gate reads zqxwvu now.\n");
    git(root, "add", "-A");
    git(root, "commit", "-qm", "about to be pushed");

    const swept = strangersLeaving(root);

    assert.equal(swept.kind, "swept");
    assert.equal(
      swept.kind === "swept" && swept.strangers.some((one) => one.word === "zqxwvu"),
      true,
      "a word that appears only in committed build output was treated as known, so a genuinely new word walked past the check because a generator had happened to emit it",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a scan that ran out of time says what it was doing and what would fix it", () => {
  const said = saidAboutStrangers({ kind: "cannot-tell", why: "spawnSync git ETIMEDOUT" });

  assert.match(said, /generated/i);
  assert.match(
    said,
    /law\.toml/,
    "an adopter told only 'spawnSync git ETIMEDOUT' has no way to reach the fix; the sentence has to name what timed out and where to say so",
  );
});

test("a hyphenated name is one word, so a class name is not read as the common words in it", () => {
  const held = tokensIn("span.seek-mark > svg");
  assert.ok(held.has("span.seek-mark"), `read as ${[...held].join(", ")}`);
  assert.equal(held.has("seek"), false, "the halves of a class name were read as separate words");
  assert.equal(held.has("mark"), false, "the halves of a class name were read as separate words");
});

test("both sides of the comparison read a written name the same way, or the check answers about nothing", () => {
  const root = repoWithARemote();
  try {
    writeFileSync(join(root, "docs/plan.md"), "The gate reads a data-panel and a wrap.cell here.\n");
    git(root, "add", "-A");
    git(root, "commit", "-qm", "second");
    git(root, "push", "-q", "origin", "HEAD");

    const known = everyWordAt(root, "HEAD", []);
    assert.equal(known.kind, "words");
    if (known.kind !== "words") return;
    for (const word of tokensIn("a data-panel and a wrap.cell")) {
      assert.ok(
        known.words.has(word),
        `the change side read ${word} and the repository side never produced it, so every compound name would be a stranger forever`,
      );
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a name whose every half is an ordinary word is still a stranger, because it is the name that got out", () => {
  const root = repoWithARemote();
  try {
    writeFileSync(
      join(root, "docs/plan.md"),
      "The gate reads the staged text. The seek and the mark and the span and the svg was measured.\n",
    );
    git(root, "add", "-A");
    git(root, "commit", "-qm", "second");
    git(root, "push", "-q", "origin", "HEAD");

    writeFileSync(
      join(root, "docs/plan.md"),
      "The gate reads the staged text. A span.seek-mark > svg was measured.\n",
    );
    git(root, "add", "-A");
    git(root, "commit", "-qm", "third");

    const sweep = strangersLeaving(root);
    assert.equal(sweep.kind, "swept");
    if (sweep.kind !== "swept") return;
    assert.deepEqual(
      sweep.strangers.map((one) => one.word),
      ["span.seek-mark"],
      "every half of this name was already in the repository, which is how it got out on 2026-09-10",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
