# Decisions taken with a known cost

Where this project and its own law disagree, on purpose. Append-only.

Most entries are security or legal questions nobody on the team can answer, which
is why they are written down rather than argued. The entry exists so that whoever
can answer one is handed a framed, dated question pointed at the code.

Each entry names the files it rests on and the hash of those files when somebody
last read it, so this document is never trusted to be current: looper recomputes
them and says which entries the code has moved out from under. It never edits the
prose, because what an entry says is a judgement and no tool refreshes a judgement.

## 2026-08-21 — Doctrine branches are droppable, reversing the rule that they must always arrive
kind: law
depends: src/router.ts, src/allocator.ts
checked: 2026-08-21  68e98133a1ae

tests/rules-that-never-arrived.test.ts states the opposite, and states it with evidence: adopter PR #124 counted doctrine:frontend going over the side 32 times in one session while interface work was being done, and a rule that never arrived is indistinguishable from a rule that was followed. Branches were made required for that reason. This entry is the departure from it, in the open.

Two measurements taken on 2026-08-20 changed the balance.

Required did not mean arrived. With branches required the allocator could not drop one, so the injection simply grew: nine branches went out at 19,354 characters against a stated ceiling of 9,800, and the only things reported as dropped were looper's own status lines. Nobody was told.

Overflow is not a trimmed tail. Measured against Claude Code 2.1.236, 10,000 characters arrive whole and 10,001 are replaced by a 2,000-character preview and a file path. So one character past the ceiling nothing arrives, including the constitution. Required was therefore not protecting doctrine; it was risking the whole prompt to protect one branch.

The cost accepted: a branch that does not fit is not in the prompt. What made that survivable rather than the failure #124 named is that the drop marker is an index — every dropped contribution listed with its size and its own first line, and the doctrine tool fetches it by name.

HALF OF THIS WAS REVERSED ON 2026-08-21, AND BOTH HALVES ARE KEPT. #167 measured the same failure from the other side in an adopting project: eight of ten replayed turns went over budget and the branch dropped was the one governing the work — a schema edit lost both contract branches, a migration lost all four data branches. So the first branch raised by the files in hand is required again and cannot be dropped, while every other branch stays droppable.

That is not the old rule returning. The old rule made all nine required and grew the prompt to twice the ceiling. This makes exactly one required — the one the session is standing in — and #167 paid for it by cutting the canon from 39,737 to 26,563 characters and the index from quoting each branch's first bullet to listing names, which took the router from 4,020 characters to 2,268. The room was found rather than borrowed.

What still has to be true for the rest of this to come out: push an index and pull the bodies, so that nothing has to be dropped at all. #167 pushed an index of names, which is half of it. The bodies are still pushed for every signalled branch, so the trade stands for them.
