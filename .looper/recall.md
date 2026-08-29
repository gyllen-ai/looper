# What this project has learned

Written by the agent, read by every future session. Committed on purpose: a note
nobody else can see is a note nobody can correct, and a wrong one is worse than
none because it is believed.

Delete an entry the moment it stops being true.

## 2026-08-20 — A Claude Code hook may write at most 10,000 bytes to stdout, newline included
Measured 2026-08-20 against Claude Code 2.1.236 by emitting exactly N characters from a UserPromptSubmit hook with a sentinel at each end and asking the agent to quote the last thirty. 9,999 and 10,000 arrive whole. 10,001 is written to a file and replaced with a 2,000-character preview and a path, so crossing the line loses almost everything rather than the tail. The limit counts every byte the hook writes: 9,999 characters plus a newline is 10,000 and arrives, 10,000 plus a newline does not. A hook that prints with echo spends one of the ten thousand on the newline. This is why INJECTION_BUDGET is 9,800 and why src/allocator.ts cuts to the ceiling rather than letting anything past it.

## 2026-08-20 — Windows PowerShell 5.1 breaks three ways when scripts live on a WSL path
All three found on 2026-08-20 building the seer's live capturer, each costing a debugging round.

.NET refuses to load an assembly from a \\wsl.localhost path: "Operation is not supported. (Exception from HRESULT: 0x80131515)". It counts as a remote assembly. So compiling a P/Invoke helper once with -OutputAssembly and loading it with Add-Type -Path does not work while the tree lives in WSL, and the 170ms Add-Type compile cannot be cached that way.

Set-Content cannot create a new file on a UNC path, giving GetContentWriterFileNotFoundError. [System.IO.File]::WriteAllText can. Move-Item -Force works where [System.IO.File]::Move($a,$b,$true) does not, because the three-argument overload is .NET Core only and 5.1 has .NET Framework's two-argument one.

Get-Content -Raw decodes as ANSI, not UTF-8. A window title containing an em dash read back mangled, never matched what the consent window had ticked, and every capture came back refused — which reads exactly like a consent bug and is not one. [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8) is the fix.

## 2026-08-20 — The MCP server holds the code it started with, so its answers can be older than the tree
The hooks in .claude/settings.json run as commands, so every prompt and every tool call is a fresh process on current code. looper serve is one long-lived process that reads its modules once. Upgrading mid-session leaves the two halves disagreeing, and the stale half is the one that explains rather than the one that enforces.

Seen 2026-08-20: a server started on 18 August answered "there is no rule set called observe/logging" while the file sat on disk with that morning's mtime. That sentence is word for word what looper says when a branch genuinely does not exist, so the honest reading of it is the wrong one.

Two things now soften it. canonBranch serves any branch whose file is on disk even when its compiled list has never heard of it, and src/code-age.ts prepends a line to every tool answer once the source has moved under a running server. Neither restarts it: reconnecting the MCP server is still the fix, and it is worth suspecting first whenever a rule set is reported missing.

## 2026-08-29 — A C# reader that fails to start reports as the C# rules being wrong
On 2026-08-29, PR #177 went red on `test (26.x, ubuntu-latest)` with three failures: "the C# reader answers at all" (actual 'unavailable', expected 'found'), the pardon test, and "every C# case agrees with the rule it was written from — 4 of 71 cases disagree". That headline number reads as four broken rules. It was none of them: the vendored binary vendor/csharp-law/bin/Release/net10.0/looper-csharp started and died with empty stderr at 11.6s, well inside its 120s timeout.

It was transient. Re-running the identical commit passed all four matrix jobs. In the failing run, test (24.x, ubuntu-latest) had already passed on the same OS image and the same dotnet, so only the Node version differed, and #176 had passed the same 26.x job ten minutes earlier.

For the next session: when C# cases "disagree with their rule" on CI and nothing about the rules changed, read the "the C# reader answers at all" result in tests/csharp-cases.test.ts first. It is the one that tells a reader that did not start apart from rules that are wrong, and it is why the case count is not the thing to chase. Re-run before investigating the rules.
