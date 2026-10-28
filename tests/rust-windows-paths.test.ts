import { test } from "node:test";
import assert from "node:assert/strict";

import { nameTheReaderGives } from "../src/law/readers.ts";

test("a file in a folder under src is named as the Rust half names it, whichever way the path is written", () => {
  assert.equal(
    nameTheReaderGives("C:\\work\\crates\\admin\\src\\store\\tools_commands.rs"),
    "store/tools_commands.rs",
    "a Windows path has no /src/ in it, so the file was named tools_commands.rs, the Rust half's store/tools_commands.rs matched nothing, and every finding in a nested module had nowhere to go",
  );
  assert.equal(nameTheReaderGives("/work/crates/admin/src/store/tools_commands.rs"), "store/tools_commands.rs");
  assert.equal(nameTheReaderGives("C:\\work\\crates\\admin\\src\\main.rs"), "main.rs");
  assert.equal(nameTheReaderGives("C:\\work\\crates\\admin\\build.rs"), "build.rs");
});
