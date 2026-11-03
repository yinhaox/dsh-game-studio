---
name: studio-story
description: Load this playbook when a story with acceptance criteria must be implemented, tested, run, and evidenced, and the work type is story-implement.
---

# Studio story

You are the story worker. Deliver one story end to end: code, test, real run, real screenshot, evidence, PR.

## Tools you have

read, write, edit, glob, grep, bash/pwsh, skill, subagent, todo, web, read_image, orchestrator_report. You have no interactive question tool: when a person must decide, use the progress report with human_action described below.

## Plan before you edit

1. Read `AGENTS.md`, then `studio.yaml`. Take `check_command`, `test_command`, `run_command`, `capture_command`, `story_dir`, and `evidence_dir` from `studio.yaml`. Never retype an engine path and never call the engine binary directly.
2. Read the story file at `<story_dir>/<id>.md` in full: Context, Acceptance, Out of scope, Evidence, and the current `status`, which is normally `ready` for a story handed to you. Read the design page linked from Context.
3. Read the rule files that match the paths you will touch: `.dsh/rules/gdscript.md`, `scenes.md`, `data.md`, `ui.md`.
4. Confirm the story starts at `status: ready`. If it is `status: in-progress`, resume the existing branch instead of starting over. If it is `status: blocked`, read the blocking reason and continue only when that condition is gone; otherwise report blocked with the same reason.
5. Write a plan of 3 to 5 lines: the files to change, the test that proves the behavior, and the screen state the capture must show. Keep it in your todo list and repeat it in the PR body. Do not create a planning file.

## Scope

6. Change only the story scope:
   - allowed: `src/`, `scenes/`, `tests/`, the story file, `production/qa/evidence/<story-slug>/`;
   - forbidden: `design/`, `scripts/`, `addons/`, `project.godot`, `export_presets.cfg`, `.godot/`, `*.import`, `packages/`, `docs/`, `package.json`, `AGENTS.md`, `studio.yaml`;
   - if an acceptance line cannot be met inside that scope, call orchestrator_report once with state progress and human_action set to exactly one concrete question, then stop.
7. Set the story `status: in-progress` and bump `updated: <YYYY-MM-DD>` before the first code edit.

## Implement

8. Make the smallest change that satisfies each acceptance line. One behavior per change. Do not refactor unrelated code, rename public functions, add dependencies, or reformat whole files.
9. Add or extend a test in `tests/` that fails before the change and passes after. Assert behavior, not that the script loads. Note in the PR which test would have failed.
10. Keep scenes minimal: change a node or property, do not restructure a scene the story does not mention.

## Run the commands from studio.yaml

11. Run `check_command`. A non-zero exit means a parse or import failure; fix it and rerun. Do not proceed past a failed check.
12. Run `test_command` and save the full output to `production/qa/evidence/<story-slug>/test.log`. A failing test is not evidence.
13. Run `run_command`. Confirm the project boots and the log shows no script errors. Read the log, do not assume.
14. Run `capture_command --out production/qa/evidence/<story-slug>/<story-slug>-1.png` (create the directory first). The helper writes that PNG and verifies it is non-empty; use the path it reports.
15. Open that PNG with read_image and confirm the acceptance state is actually visible. If the frame is black, empty, cropped, or does not show the change, fix the cause and capture again. Never hand-pick, edit, or reuse a screenshot from elsewhere.

## Evidence

16. Write `production/qa/evidence/<story-slug>/index.md`:
    - heading `# Evidence: <story-slug>`;
    - the required line `Run result: OBSERVED — <what was on screen>`;
    - one bullet per PNG with what it shows;
    - one bullet per log with the exact command that produced it;
    - no `NOT VERIFIED` or `N/A` line: a story that ran must be `OBSERVED`.
17. Update the story file: tick the acceptance boxes that the evidence proves, set `status: done` only when every box is proven, and list the evidence paths under `## Evidence`.
18. If any acceptance line stays unproven, leave the status `in-progress`, say which line is unproven in the PR, and report blocked rather than calling it done.

## Deliver

19. Commit with `<type>: <summary>`, using the repository types (for example `story: add double jump`), and open a PR. Use the four PR sections: What changed, Verification with one command and result per line, Evidence with the path and the `Run result:` line, and Risks and not covered. Link the story file. No force push, no tag, no publish, no merge.
20. Report once with orchestrator_report: state ready, work type story-implement, the PR link, the evidence path, the story id and new status, and the commands you ran with their results.

## If the engine cannot run

Report blocked with the exact command, its exit code, and the first error line. Set the story `status: blocked` and leave the same one-line reason under Context so the next worker starts informed. Do not switch to another engine, do not fabricate a capture, do not mark the story done, and do not write `OBSERVED`.

## Report contents

- state: ready or blocked.
- work type: story-implement.
- pr: the full PR URL, or the blocked reason.
- evidence: the index path and the `Run result:` value.
- story: id and final status.
