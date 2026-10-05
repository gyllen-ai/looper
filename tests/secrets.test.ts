import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { entropyOf, findingsIn, looksRandom } from "../src/secrets/detect.ts";
import { Secrets, scanMessage, scanStaged } from "../src/secrets/capability.ts";

const NOTHING_ALLOWED: ReadonlySet<string> = new Set();

function kindsAllowing(line: string, allowed: ReadonlySet<string>): readonly string[] {
  return findingsIn(line, allowed).map((held) => held.kind);
}

function repo(): string {
  const root = mkdtempSync(join(tmpdir(), "looper-secrets-"));
  mkdirSync(join(root, "src"), { recursive: true });
  execFileSync("git", ["init", "-q"], { cwd: root, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "t@e.com"], { cwd: root, stdio: "ignore" });
  execFileSync("git", ["config", "user.name", "t"], { cwd: root, stdio: "ignore" });
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "t" }));
  execFileSync("git", ["add", "-A"], { cwd: root, stdio: "ignore" });
  execFileSync("git", ["commit", "-qm", "before"], { cwd: root, stdio: "ignore" });
  return root;
}

function stage(root: string, file: string, text: string): void {
  writeFileSync(join(root, file), text);
  execFileSync("git", ["add", "-A"], { cwd: root, stdio: "ignore" });
}

function kinds(line: string): readonly string[] {
  return kindsAllowing(line, NOTHING_ALLOWED);
}


const BODY = "zzzz1111zzzz1111zzzz1111zzzz";

const STRIPE = "sk_".concat("live_");

const GITLAB = "gl".concat("pat-");

test("vendor-shaped keys are caught by their shape, not by a list of names", () => {
  assert.deepEqual([...kinds('k = "AKIAZZZZ1111ZZZZ1111"')], ["an AWS access key"]);
  assert.deepEqual(
    [...kinds('k = "ghp_zzzz1111zzzz1111zzzz1111zzzz1111zzzz"')],
    ["a GitHub token"],
  );
  assert.deepEqual([...kinds(`k = "${GITLAB}${BODY}"`)], ["a GitLab token"]);
  assert.deepEqual([...kinds(`k = "${STRIPE}${BODY}"`)], ["a Stripe live key"]);
});

test("a Meta access token is caught by its shape", () => {
  const META = "EAA".concat("BcDeFgHi1ZBxKZBoZBqZAZCwZDZD8yQZBvZC0ZAmZBhZC9ZBkZBnZBpZC2ZBsZByZBvZCZAZDaBcDeFgHiJkLmNoPqRsTuVwXyZ");
  assert.deepEqual([...kinds(`token = "${META}"`)], ["a Meta access token"]);
});

test("a long word starting with the same three letters is not a Meta token", () => {
  assert.deepEqual([...kinds('const name = "EAAsomething";')], []);
});

test("a credential word with more name after it is still a credential", () => {
  assert.equal(kinds("SECRET_KEY=mnbvcxzlkjhgfdsa99").length, 1);
  assert.equal(kinds("STRIPE_SECRET_KEY=mnbvcxzlkjhgfdsa99").length, 1);
  assert.equal(kinds("PASSWORD_HASH=mnbvcxzlkjhgfdsa99").length, 1);
});

test("a word that merely begins with a credential word is not one", () => {
  assert.deepEqual([...kinds('const tokenizer = "mnbvcxzlkjhgfdsa99"')], []);
  assert.deepEqual([...kinds('const authorName = "Ferdinand Bloggsss"')], []);
});

test("a password with a full stop in it is caught", () => {
  assert.equal(kinds("SUPABASE_DB_PASSWORD=Ab3.xY7%zQ*w?Kd").length, 1);
  assert.equal(kinds('password = "s3cret.value.here"').length, 1);
});

test("a credential read out of an object is not a value", () => {
  assert.deepEqual([...kinds("const token = config.apiToken")], []);
  assert.deepEqual([...kinds("const apiKey = settings.google.apiKey")], []);
  assert.deepEqual([...kinds("_token = data.session?.access_token ?? null;")], []);
  assert.deepEqual([...kinds("_token = live?.access_token ?? null;")], []);
});

test("a database address carrying its password is caught", () => {
  assert.equal(kinds("DATABASE_URL=postgres://app:Tr0ub4dor3@db:5432/shop").length, 1);
  assert.equal(kinds("redis://user:s3cret@cache:6379").length, 1);
});

test("a private key block is caught", () => {
  assert.equal(kinds("-----BEGIN OPENSSH PRIVATE KEY-----").length, 1);
});

test("something named like a credential, with a real value, is caught", () => {
  assert.equal(kinds('const password = "Tr0ub4dor3xKQ99"').length, 1);
  assert.equal(kinds('apiKey: "8f4b2c9d1e6a3f7b0c5d"').length, 1);
});

test("the right way to write it is never flagged", () => {
  assert.deepEqual([...kinds("const key = process.env.API_KEY;")], []);
  assert.deepEqual([...kinds("const key = import.meta.env.VITE_KEY;")], []);
  assert.deepEqual([...kinds('password = "${DB_PASSWORD}"')], []);
  assert.deepEqual([...kinds('password = "change-me"')], []);
  assert.deepEqual([...kinds('token = "your-token-here"')], []);
});

test("a documented example key is not a leak, but a real one beside the word example is", () => {
  assert.deepEqual([...kinds('k = "AKIAIOSFODNN7EXAMPLE"')], []);
  assert.equal(kinds('k = "AKIAZZZZ1111ZZZZ1111" // just an example').length, 1);
});

test("ordinary code is left alone, which is what makes the rest believable", () => {
  assert.deepEqual([...kinds('export const VERSION = "1.2.3";')], []);
  assert.deepEqual([...kinds("const id = a3f5c9e1b2d4f6a89012;")], []);
  assert.deepEqual([...kinds('import { readFileSync } from "node:fs";')], []);
  assert.deepEqual([...kinds("  const excerpt = text.slice(0, 16);")], []);
});

test("entropy tells a random key from a long ordinary word", () => {
  assert.ok(looksRandom("Tr0ub4dor3xKQ99mZp2Wq7Lm4Xn"));
  assert.ok(!looksRandom("theQuickBrownFoxJumpedOverTheLazyDog"));
  assert.ok(entropyOf("aaaaaaaaaaaaaaaaaaaaaaaa") < 1);
});

test("a git hash and a uuid are not secrets", () => {
  assert.ok(!looksRandom("a3f5c9e1b2d4f6a8c0e2b4d6f8a0c2e4b6d8f0a2"));
  assert.ok(!looksRandom("3f2504e0-4f89-11d3-9a0c-0305e82c3301"));
});

const HARNESS_PAYLOAD = JSON.stringify({
  session_id: "d41f9a2c7b6e4f08a1c35d9e0b7f2a64",
  tool_use_id: "toolu_01LC8wVMbRqZ3nT7yFhKpXwA",
  transcript_path: "/home/someone/.claude/projects/8f3a1c/2b7d9e4a.jsonl",
  tool_name: "Bash",
  tool_input: { command: "git commit -m 'add the reader'" },
});

test("the ids the harness puts in its own payload are not the user's secrets", () => {
  const root = repo();
  try {
    const outcome = new Secrets().onHook({
      root,
      event: "PreToolUse",
      payload: { kind: "text", text: HARNESS_PAYLOAD },
    });

    assert.equal(
      outcome.kind,
      "pass",
      "the session id, the tool-use id and the transcript path are random by construction and are in every payload. Reading them as the user's secrets refuses a clean commit, differently each time, and names a commit message that never contained them.",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a key typed into the command itself is caught, and named as the command", () => {
  const root = repo();
  const payload = JSON.stringify({
    tool_use_id: "toolu_01LC8wVMbRqZ3nT7yFhKpXwA",
    tool_name: "Bash",
    tool_input: { command: 'git commit -m "token ghp_zzzz1111zzzz1111zzzz1111zzzz1111zzzz"' },
  });
  try {
    const outcome = new Secrets().onHook({
      root,
      event: "PreToolUse",
      payload: { kind: "text", text: payload },
    });

    assert.equal(outcome.kind, "block");
    if (outcome.kind !== "block") return;
    assert.ok(outcome.reason.includes("the command you typed"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a commit carrying a key is refused, and says nothing was committed", () => {
  const root = repo();
  try {
    stage(root, "src/deploy.ts", 'const t = "ghp_zzzz1111zzzz1111zzzz1111zzzz1111zzzz";\n');
    const outcome = new Secrets().onHook({
      root,
      event: "PreCommit",
      payload: { kind: "none" },
    });

    assert.equal(outcome.kind, "block");
    if (outcome.kind !== "block") return;
    assert.ok(outcome.reason.includes("Nothing was committed"));
    assert.ok(outcome.reason.includes("not a way through"));
    assert.ok(outcome.reason.includes("change the key at whoever issued it"));
    assert.ok(outcome.reason.includes("already has a copy of it"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("only what is being added is scanned, so old files do not block every commit", () => {
  const root = repo();
  try {
    stage(root, "src/clean.ts", "export const rate = 0.2;\n");
    assert.deepEqual([...scanStaged(root)], []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the baseline looper writes itself is not scanned for keys", () => {
  const root = repo();
  const held = ["Contoso.Widgets", "OrderV2", "Tools", "ListShippingRatesTool.cs"].join("/");
  try {
    mkdirSync(join(root, ".looper"), { recursive: true });
    stage(root, ".looper/baseline.toml", `["${held}"]\n"CS-DEAD:2" = 31\n`);
    assert.deepEqual(
      [...scanStaged(root)],
      [],
      "every byte of the baseline is a path, a rule id or a count that looper wrote, and a deep namespace reads as random to the blob check",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the same string in a file somebody wrote is still caught", () => {
  const root = repo();
  const held = ["Contoso.Widgets", "OrderV2", "Tools", "ListShippingRatesTool.cs"].join("/");
  try {
    stage(root, "src/held.ts", `const value = "${held}";\n`);
    assert.equal(scanStaged(root).length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a value on the allow list, with the reason beside it, passes", () => {
  const root = repo();
  try {
    mkdirSync(join(root, ".looper"), { recursive: true });
    writeFileSync(
      join(root, ".looper/secrets.allow"),
      `# the public test key from the payment docs\n${STRIPE}${BODY}\n`,
    );
    stage(root, "src/pay.ts", `const k = "${STRIPE}${BODY}";\n`);

    assert.deepEqual([...scanStaged(root)], []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the inline marker excuses one line and no others", () => {
  const root = repo();
  try {
    stage(
      root,
      "src/pay.ts",
      'const a = "ghp_zzzz1111zzzz1111zzzz1111zzzz1111zzzz"; // looper:allow-secret\nconst b = "ghp_yyyy2222yyyy2222yyyy2222yyyy2222yyyy";\n',
    );
    assert.equal(scanStaged(root).length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("images and lockfiles are not scanned", () => {
  const root = repo();
  try {
    stage(root, "package-lock.json", '{"key":"ghp_zzzz1111zzzz1111zzzz1111zzzz1111zzzz"}\n');
    assert.deepEqual([...scanStaged(root)], []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a key in the commit message is caught, not only in the files", () => {
  const root = repo();
  try {
    const caught = scanMessage(root, "rotated ghp_zzzz1111zzzz1111zzzz1111zzzz1111zzzz\n");
    assert.equal(caught.length, 1);
    assert.equal(caught[0]?.file, "the commit message");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the commented lines git puts in the message are not scanned", () => {
  const root = repo();
  try {
    const message = "fix the thing\n\n# ghp_zzzz1111zzzz1111zzzz1111zzzz1111zzzz\n";
    assert.deepEqual([...scanMessage(root, message)], []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an ordinary message passes", () => {
  const root = repo();
  try {
    assert.deepEqual([...scanMessage(root, "rotate the deploy key\n\nIt leaked.\n")], []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the agent typing a key into the commit command is caught before it runs", () => {
  const root = repo();
  try {
    const outcome = new Secrets().onHook({
      root,
      event: "PreToolUse",
      payload: {
        kind: "text",
        text: JSON.stringify({
          tool_name: "Bash",
          tool_input: {
            command: 'git commit -m "removed ghp_zzzz1111zzzz1111zzzz1111zzzz1111zzzz"',
          },
        }),
      },
    });
    assert.equal(outcome.kind, "block");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

const A_MADE_UP_VALUE = "correcthorsebatterystaple";

const NAMES_THAT_MUST_BE_CAUGHT: readonly string[] = [
  "password",
  "api_key",
  "private_key",
  "rcon_password",
  "db_password",
  "auth_token",
  "admin_secret",
  "PGPASSWORD",
];

test("a credential name is not defeated by what somebody put in front of it", () => {
  for (const name of NAMES_THAT_MUST_BE_CAUGHT) {
    assert.ok(
      findingsIn(`${name} = "${A_MADE_UP_VALUE}"`, NOTHING_ALLOWED).length > 0,
      `${name} carries a value and nothing was said. An underscore is a word character, so \\b never matched between rcon_ and password — and rcon_password is what a real project called its credential.`,
    );
  }
});

const NAMES_THAT_MUST_STAY_SILENT: readonly string[] = [
  "FRESHNESS_BYPASS",
  "compass_heading",
  "oauth_url",
];

test("a word that merely ends in a credential name is not one", () => {
  for (const name of NAMES_THAT_MUST_STAY_SILENT) {
    assert.deepEqual(
      [...findingsIn(`${name} = "${A_MADE_UP_VALUE}"`, NOTHING_ALLOWED)],
      [],
      `${name} was read as a credential. Bypass ends in pass, and a gate that fires on the word bypass is one somebody switches off.`,
    );
  }
});

test("a note about a secret does not excuse the secret", () => {
  assert.ok(
    findingsIn(`password = "${A_MADE_UP_VALUE}" // TODO: move to env`, NOTHING_ALLOWED).length > 0,
    "the single most likely line in a codebase to carry a hardcoded credential is the one somebody left a note on, and TODO in the note excused the whole line",
  );
  assert.deepEqual(
    [...findingsIn('token = "TODO"', NOTHING_ALLOWED)],
    [],
    "a value that really is a placeholder is not a secret; the word is only an excuse where the value carries it",
  );
});

test("a value nobody quoted is still a value", () => {
  assert.ok(
    findingsIn("export PGPASSWORD=abc123def456ghi789jkl", NOTHING_ALLOWED).length > 0,
    "env files and shell scripts are where unquoted assignments live, and they were invisible",
  );
  assert.deepEqual(
    [...findingsIn("token: tokenLabelName(tokenType)", NOTHING_ALLOWED)],
    [],
    "an unquoted value that is code is not a credential, and reading one as a credential is how a scanner earns being switched off",
  );
});

test("a secret of one case is still a secret", () => {
  for (const value of [
    "a3f9c2e7b14d8f60a3f9c2e7b14d8f60",
    "5d41402abc4b2a76b9719d911017c592",
    "mfrggzdfmztwq2lknnwg23tpobyxe43uov",
  ]) {
    assert.ok(
      looksRandom(value),
      `${value} was passed over for having no capital letter. An RCON password is thirty-two random characters and looks like nothing in particular.`,
    );
  }
});

const PATHS_THROUGH_A_CREDENTIAL_WORD: readonly string[] = [
  "Sessions are checked by `app::auth::SessionToken` before any handler runs.",
  "Sessions are checked by app::auth::SessionToken before any handler runs.",
  "See `crate::auth::SessionStore` for where they live.",
  "The login form posts to `auth::login`.",
  "Refresh goes through `self::token::KindOfRefresh` now.",
  "- `crate::secret::SecretString`",
  "    let user: auth::AuthenticatedUser = extract(&request)?;",
  "use crate::auth::AuthenticatedUser",
];

test("a double colon joins two names in a path and is never the assignment", () => {
  for (const line of PATHS_THROUGH_A_CREDENTIAL_WORD) {
    assert.deepEqual(
      [...kinds(line)],
      [],
      `${line} — the first colon of a path was read as the assignment, and the rest of the path as the value`,
    );
  }
});

const A_PATH_WRITTEN_AS_A_TYPE: readonly string[] = [
  "    let token: auth::BearerToken = load_token();",
  "    let password: secrecy::SecretString = read_password()?;",
  "    pub api_key: secrecy::SecretString",
];

test("a path written as the type of a credential is not its value", () => {
  for (const line of A_PATH_WRITTEN_AS_A_TYPE) {
    assert.deepEqual(
      [...kinds(line)],
      [],
      `${line} — the type was read as the credential's value`,
    );
  }
});

const A_REAL_LOOKING_VALUE = "Tr0ub4dor3xKQ99mZp";

test("a credential beside a path, or after a type written as one, is still caught", () => {
  for (const line of [
    `auth: ${A_REAL_LOOKING_VALUE}`,
    `auth = "${A_REAL_LOOKING_VALUE}"`,
    `password: ${A_REAL_LOOKING_VALUE}`,
    `AUTH_TOKEN=${A_REAL_LOOKING_VALUE}`,
    `"auth": "${A_REAL_LOOKING_VALUE}"`,
    "password: Tr0ub4dor::3xKQ99mZp",
    `token = "auth::${A_REAL_LOOKING_VALUE}"`,
    `    let token: auth::BearerToken = "${A_REAL_LOOKING_VALUE}";`,
    `    let api_key: secrecy::SecretString = ${A_REAL_LOOKING_VALUE}`,
    `See crate::auth::Session; the deploy secret: ${A_REAL_LOOKING_VALUE}`,
  ]) {
    assert.ok(kinds(line).length > 0, `${line} carries a credential and nothing was said`);
  }
});

test("what one case must not swallow", () => {
  for (const value of [
    "thequickbrownfoxjumpedoverthelazydog2",
    "a_long_snake_case_identifier_here1",
    "8f3a1c2b4d5e6f708192a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4",
    "sha384-Kj9mQ2wTz7bR4nX8vC1pL6hF3sD5gA0eJ8tR2yU7pZqAAAA",
  ]) {
    assert.equal(
      looksRandom(value),
      false,
      `${value.slice(0, 40)} is prose, an identifier, a git object or a published hash, and calling it a secret is the failure that gets a scanner ignored`,
    );
  }
});
