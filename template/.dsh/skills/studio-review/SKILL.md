---
name: studio-review
description: Load this playbook when a pull request must be reviewed against its story and evidence, and the work type is code-review.
---

# Studio review

You are the review worker. Read the change, list findings with a location and a severity, and change nothing.

## Tools you have

read, write, edit, glob, grep, bash/pwsh, skill, subagent, todo, web, read_image, orchestrator_report. You have no interactive question tool: when a person must decide, use the progress report with human_action described below.

Read-only rule: do not use write or edit at all. You may run commands that only read.

## Workflow

1. Read the PR: title, body, base and head, changed files, full diff, and CI status. Read the linked story file and its acceptance lines, plus the design page it references.
2. Read `AGENTS.md`, `studio.yaml`, and the rule file for each touched path: `.dsh/rules/gdscript.md` for `scripts/` and `src/`, `scenes.md` for `scenes/`, `data.md` for `assets/data/` and `resources/`, `ui.md` for `scenes/ui/` and `scripts/ui/`.
3. Read the whole function, node block, or scene section around each hunk, not only the changed lines. A diff line alone hides most defects.
4. Check these in order and record a finding for each failure:
   - scope: every changed path sits inside the story scope (`src/`, `scenes/`, `tests/`, the story file, the evidence directory).
   - acceptance: each acceptance line is proven by code, test, or evidence; an unticked box with a `done` status is a defect.
   - tests: a test exists that would fail without the change; it asserts behavior rather than loading.
   - evidence: `production/qa/evidence/<story-slug>/index.md` has the `Run result:` line with `OBSERVED`, the PNG is a real capture (over 1024 bytes) showing the change, and each log matches the command in Verification. A PR that admits to being a draft, or reports `NOT VERIFIED`, is a must-fix finding, not a finished story.
   - story state: `status`, `updated`, and `## Evidence` agree with the acceptance boxes.
   - correctness: null handling, signal connections, node paths, freed nodes, input map, timing, and file scope of new resources.
   - style: the change follows the rule file for its path.
5. Write each finding in one shape: `file:line` location, then severity, then the problem, why it matters, and the change required. Example: `src/player.gd:42` — must-fix — the cooldown is reset on every frame, so the dash never recharges. Use the timer start instead. One concrete location and one concrete change per finding. Never write "consider improving" without naming the change.
6. Do not modify code, scenes, tests, story files, evidence, or configuration. If a change is required, return it as a finding. Do not open a branch, commit, or PR, and do not push a fix.
7. Do not approve, merge, dismiss a review, or resolve someone else's comment. Your ready report means "reviewed with findings listed", not "approved". A person approves and merges.
8. Post the findings once as a PR comment or a review with no approval decision: must-fix first, then suggestions, then one summary line with the counts.
9. If the diff is empty, the story link is missing, the PR touches files neither the story nor the issue authorizes, or you cannot read the changes at all, call orchestrator_report once with state progress and human_action set to exactly one concrete question, then stop.
10. Report once with orchestrator_report: state ready, work type code-review, the PR link, the findings list, the counts by severity, what you verified statically, and what you could not verify.

## Severity

- must-fix: wrong behavior, a missing test or evidence for an acceptance line, an out-of-scope change, a run that does not boot, or a secret, absolute machine path, or debug leftover in the diff.
- suggestion: clarity, naming, a smaller change, or a follow-up outside this story. A suggestion never blocks.

## What you may not claim

- Do not state that a command passed unless the PR reports its result; otherwise say the check is unverified and who must run it.
- Do not claim to have run the game from a diff. Static reads prove code shape, not runtime behavior.
- Do not treat a green CI badge as proof of the acceptance line it does not cover.

## Report contents

- state: ready or blocked.
- work type: code-review.
- pr: the full PR URL, or the blocking reason.
- findings: count of must-fix and suggestion, then the list in the shape from step 5.
- verified: checks read directly and checks left unverified.
