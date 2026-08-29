export type CopyCase = {
  readonly name: string;
  readonly beside: readonly string[];
  readonly judged: string;
  readonly expect: "fires" | "silent";
};

export const COPY_CASES: readonly CopyCase[] = [
  { name: "control: a second go beside the original", expect: "fires",
    beside: ["src/helper.py"], judged: "src/helper-old.py" },
  { name: "new is the same confession as old", expect: "fires",
    beside: ["src/page.css"], judged: "src/page-new.css" },
  { name: "an underscore separates it just as well", expect: "fires",
    beside: ["src/parser.rs"], judged: "src/parser_final.rs" },
  { name: "casing does not hide the word", expect: "fires",
    beside: ["src/client.ts"], judged: "src/client-ORIG.ts" },
  { name: "the duplicate an editor makes", expect: "fires",
    beside: ["src/report.ts"], judged: "src/report copy.ts" },
  { name: "the number a second download adds", expect: "fires",
    beside: ["src/report.ts"], judged: "src/report (1).ts" },
  { name: "a stylesheet is named by the same rule as everything else", expect: "fires",
    beside: ["src/theme.scss"], judged: "src/theme-updated.scss" },

  { name: "a second go with no original beside it is just a name", expect: "silent",
    beside: ["src/other.ts"], judged: "src/utils-old.ts" },
  { name: "the original in another directory is another module", expect: "silent",
    beside: ["src/utils.ts"], judged: "src/deep/utils-old.ts" },
  { name: "a different extension is a different file, not a second go", expect: "silent",
    beside: ["src/utils.ts"], judged: "src/utils-old.css" },
  { name: "a test beside the thing it tests is not a second go", expect: "silent",
    beside: ["src/utils.ts"], judged: "src/utils.test.ts" },
  { name: "the original alone is never a variant of itself", expect: "silent",
    beside: [], judged: "src/utils.ts" },

  { name: "a trailing number is a name, not a confession: 256 is the hash", expect: "silent",
    beside: ["src/es.py"], judged: "src/es256.py" },
  { name: "a trailing number names a standard: the 2 in webgl2", expect: "silent",
    beside: ["src/webgl.js"], judged: "src/webgl2.js" },
  { name: "a numbered icon is a different picture, not a second attempt", expect: "silent",
    beside: ["icons/edit.mjs"], judged: "icons/edit-2.mjs" },
  { name: "a version suffix is a published API, not a dodged edit", expect: "silent",
    beside: ["src/decorators.py"], judged: "src/decorators_v1.py" },
  { name: "copy is a thing code does, so the word alone is not evidence", expect: "silent",
    beside: ["tests/fs.rs"], judged: "tests/fs_copy.rs" },
  { name: "fixed is a kind of number as often as it is an excuse", expect: "silent",
    beside: ["src/rgbxyz.rs"], judged: "src/rgbxyz_fixed.rs" },
  { name: "backup is something a module does, not something it admits", expect: "silent",
    beside: ["src/database.ts"], judged: "src/database-backup.ts" },
  { name: "two files whose names merely share a prefix", expect: "silent",
    beside: ["src/user.ts"], judged: "src/username.ts" },
];
