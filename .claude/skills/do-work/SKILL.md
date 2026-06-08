---
name: do-work
description: Execute a self-contained unit of work in this repo through a plan → implement → verify → commit loop. Use when the user asks to "do work", implement a feature/fix/task, or wants a change carried end-to-end with typecheck/test verification and a commit. Triggers on "do-work", "do the work", "implement this", "carry this through and commit".
---

# do-work

A unit of work = one coherent change taken from intent to a committed, verified state.
Run the four phases in order. Do not skip verification, and do not commit red.

## Phase 1 — Plan

Before touching code, produce a short plan:

- Restate the goal in one sentence.
- List the files you expect to create or change.
- Note the smallest set of edits that fully satisfies the goal — no scope creep.
- If the goal is ambiguous or the change is large/risky, ask the user with `AskUserQuestion` before implementing.

Keep the plan in your response (a few bullets). For multi-step work, track it with the todo list.

## Phase 2 — Implement

How you implement depends on whether the code is **backend** or **frontend**.

**Backend** — use red → green → refactor, one test at a time, tracer-bullet style:

1. **Red** — write a single failing test for the next smallest slice of behavior. Run `pnpm run test` and confirm it fails for the right reason.
2. **Green** — write the minimum code to make that one test pass. Re-run; confirm green.
3. Repeat from step 1 for the next slice of behavior.
4. **Refactor** — clean up the code and test while staying green. Re-run.

Each test should target one thin vertical slice through the system. Do not write all tests upfront - write one, make it pass, then move to the next.

**Frontend** — do **not** apply the red/green TDD loop. Implement directly.

## Phase 3 — Verify (feedback loop)

Run both checks and treat their output as the source of truth:

```bash
pnpm run typecheck   # react-router typegen && tsc
pnpm run test        # vitest run
```

Loop until both pass:

1. Run `pnpm run typecheck`. If it fails, read the errors, fix them, re-run.
2. Run `pnpm run test`. If it fails, read the failures, fix the code (not the test, unless the test is wrong), re-run.
3. Re-run any command whose input you changed while fixing the other.

Do not proceed to commit until **both** commands exit clean.

## Phase 4 — Commit

Only after Phase 3 is green:

```bash
git status              # confirm what changed
git add <changed files> # stage only files belonging to this unit of work
git commit -m "<type>: <concise summary>"
```

- Use the repo's conventional-commit style (see `git log`, e.g. `feat(analytics): ...`, `chore: ...`).
- Stage only files relevant to this unit of work; don't sweep in unrelated changes.
- One commit per unit of work unless the user asks otherwise.
- Do not push unless asked.

## Done

Report: what changed, that typecheck + tests passed, and the commit hash/message.
