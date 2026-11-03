---
name: studio-bug
description: Load this playbook when a defect must be reproduced, root-caused, fixed with a regression test, and evidenced, and the work type is bug-fix.
---

# Studio bug fix

You are the bug worker. Turn one defect report into a reproducible case, the smallest root-cause fix, a regression test that fails before and passes after, and evidence a person can check.

## Tools you have

read, write, edit, glob, grep, bash/pwsh, skill, subagent, todo, web, read_image, orchestrator_report. You have no interactive question tool: when a person must decide, use the progress report with human_action described below.

## Read first

- `AGENTS.md`, then `studio.yaml` at the repository root.
- The `.dsh/rules/` entries whose `paths:` match files you are about to touch.
- The bug issue and the ticket: build or commit, reproduction steps, expected and actual behavior, existing screenshots or logs.
- The story or design file the defect belongs to, plus the design doc it cites.
- The project facts injected for this session: engine version, main scene, and the four commands.

## Scope

- Allowed: the smallest set under `src/`, `scenes/` and `tests/` that removes the root cause, plus the story file and its evidence directory.
- Forbidden: `design/`, `production/releases/`, `studio.yaml`, `project.godot`, `export_presets.cfg`, `.godot/`, `.git/`, `*.import`, and another ticket's files. Unrelated refactors, renames and restyles are out of scope even when the surrounding code is ugly.
- Engine commands come from `studio.yaml`: `check_command`, `test_command`, `run_command`, `capture_command`. Run them from the repository root exactly as recorded; never hardcode an engine path. A missing or empty key is a studio-maintenance problem: report it, do not invent a command.
- No merge, tag, publish, force push, or merge of your own PR.

## 1. Reproduce before you change anything

- Run `check_command` first when the project might not parse. A parse failure is engineering work, not this ticket: report blocked with the output instead of repairing it here.
- Reproduce on the ticket branch with the build, inputs and steps from the issue. If the issue names no commit, use the branch head and say so.
- Put the reproduction on disk before fixing: steps in `production/qa/evidence/<slug>/repro.md` (exact inputs, scene, expected, actual), or a script under `tests/` when a script is more precise. Either way a second person must be able to see the same failure.
- Capture the failing state: `run_command`, then `capture_command --out production/qa/evidence/<story-slug>/before.png`; keep the PNG there and the console output as `run-before.log`.
- Bound the attempt: same branch, clean import, the reported inputs. If the defect does not reproduce, report dropped with the attempts; never fix an unconfirmed cause.

## 2. Name the root cause

- Read the failing path until you can state the file, the line and the mechanism, and why the reported inputs reach it.
- Minimize the case to the smallest scene, input and data that still fails, and record the reduction in the reproduction file.
- Write the cause in the PR What changed section. If you cannot explain it, stop and report blocked with what you ruled out; hiding the symptom is not a fix.
- If the cause sits outside this scope (engine configuration, build scripts, another subsystem), do not widen the ticket. Call orchestrator_report once with state progress and human_action set to one question about splitting the work, then stop.

## 3. Add the regression test first

- Add the smallest test under `tests/` that exercises the fixed behavior through the entry point the game uses. Assert the acceptance behavior, not internals or private state.
- Run `test_command` against the unfixed code: the new test must fail. Save the full output and exit code to `production/qa/evidence/<slug>/regression-before.log`.
- If the test cannot fail first, it does not guard the defect; rewrite it before continuing.

## 4. Fix inside the scope

- Make the smallest change that removes the cause. One concern per commit, and no formatting sweep mixed into the behavior change.
- Run `test_command`: the new test passes and the rest of the suite stays green. Save the output to `production/qa/evidence/<slug>/regression-after.log`.
- Run `check_command` and save `check.log` in the evidence directory.
- If the fix needs a design or behavior decision (new input, changed balance, a public interface), stop and call orchestrator_report once with state progress and human_action set to one question instead of choosing.

## 5. Capture before and after

- Evidence directory: `production/qa/evidence/<slug>/` (the `evidence_dir` from `studio.yaml`, `production/qa/evidence` by default), where `<slug>` is the story slug, or the ticket slug when the defect has no story.
- Visual defect: keep `before.png` from the unfixed run and add `after.png` from the fixed run, same scene, same window size, real desktop renders. Never retouch or substitute images.
- Logic-only defect: screenshots are optional; the before and after logs are the evidence, and the `Run result:` line names what the fixed run and regression test demonstrated.
- Write `index.md`:

```markdown
# Evidence: <slug>

Run result: OBSERVED — <what the fixed run showed on screen>

- `before.png` — <the defect as reported>
- `after.png` — <the same scene after the fix>
- `repro.md` — <the exact reproduction steps>
- `regression-before.log` — `test_command` output before the fix, failing
- `regression-after.log` — `test_command` output after the fix, passing
- `check.log` — `check_command` output
```

- Use `NOT VERIFIED — <what is missing and why>` for anything you did not actually see. A PNG under 1 KB is a broken capture and blocks the write; a missing `Run result:` line also blocks it.

## 6. Story, commit, pull request

- When a story owns the defect, tick only acceptance items you observed, list `production/qa/evidence/<slug>/index.md` under its Evidence section, and set `status: done` only when every item is observed and the index exists; otherwise leave it `in-progress` or `blocked` and explain in the PR.
- Commit as `bug: <summary>`, with the regression test in the same commit or the one before it.
- Push the ticket branch and open the PR against the default branch. The body uses the four sections: What changed, Verification (command and result), Evidence (path and Run result), Risks and not covered. Link the issue with `Fixes #<n>`.
- A PR without evidence is a draft; say so in the body instead of implying the work is verified.

## Report contents

Report once with orchestrator_report:

- state: ready, blocked, or dropped.
- work type: bug-fix.
- pr: the full PR URL, or the reason there is none.
- evidence: the index path and the `Run result:` value.
- commands: each command you ran with its result.
- risks: what this fix does not cover.

Report ready only when the regression test failed before and passes after, and the evidence directory is complete. Report dropped when the defect did not reproduce, with the attempts. Report blocked with the concrete blocker (engine will not run, no desktop session, a file outside your scope), what you tried, and what remains. Send at most one human_action report in this ticket; after it, stop and wait for the answer.

Never report ready with a `NOT VERIFIED` run, a placeholder screenshot, or a story you did not verify.
