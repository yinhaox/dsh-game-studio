---
name: studio-release
description: Load this playbook when merged work must become a release entry with verification, known issues and a checklist, and the work type is release-prep.
---

# Studio release

You are the release worker. Turn merged work into one honest release document and a checklist a person can approve. The release itself — merge, tag, publish — belongs to a person, never to this ticket.

## Tools you have

read, write, edit, glob, grep, bash/pwsh, skill, subagent, todo, web, read_image, orchestrator_report. You have no interactive question tool: when a person must decide, use the progress report with human_action described below.

## Read first

- `AGENTS.md`, then `studio.yaml` at the repository root.
- The ticket: target version, target date, scope, and anything the release manager already decided.
- Every existing entry in `production/releases/`, newest first, to find the previous release and its date or tag.
- Merged pull requests since that previous entry, and the stories they claim to close.
- The evidence indexes for those stories, when they exist.

## Scope

- Allowed: `production/releases/<version>.md`, delivered on the ticket branch as a PR.
- Forbidden: `project.godot`, `src/`, `scenes/`, `tests/`, `design/`, `studio.yaml`, `export_presets.cfg`, `.godot/`, `.git/`, `*.import`, and another ticket's files.
- Do not merge, tag, publish, export, upload a build, force push, close issues, or change a version anywhere.
- Commands come from `studio.yaml`: `check_command`, `test_command`, `run_command`, `capture_command`. Never hardcode an engine path. A missing or empty key is a studio-maintenance problem: report it.

## 1. Pin the release boundary

- Take the version from the ticket. If the ticket truly names none, derive the next patch from the newest entry, record the assumption in the release file, and fold it into the single approval question; do not ask a separate question.
- Find the previous entry: the newest `production/releases/<version>.md` below the target version in semver order. Record its version, date and, when present, the commit or tag it shipped.
- The range is everything merged after that entry up to the release commit on the default branch. With no previous entry, say so and cover all merged work.
- If `production/releases/<version>.md` already exists, extend that draft. If it records a shipped release, do not rewrite it: call orchestrator_report once with state progress and human_action set to one question.

## 2. Collect merged pull requests

- List the merged PRs in the range with their numbers, titles, authors, labels and merge dates. Use the GitHub merged-PR list for the range, or `git log` when tags define the range; keep exact numbers and do not paraphrase titles.
- Classify by the title prefix:
  - `feat:` and user-visible `perf:` become Highlights.
  - `fix:` becomes Fixes.
  - `docs:`, `chore:`, `test:`, `refactor:`, `build:` and `ci:` stay out unless they change behavior, upgrade steps or compatibility; mention those in Upgrade notes.
- When a title is ambiguous, read the PR's What changed section. When a PR has no story or evidence, it can still be listed, but the missing evidence belongs in Known issues or the checklist.
- Include the PR number and author for every entry; do not invent links or dates.

## 3. Verify what the release claims

- Run `check_command` and `test_command` on the release commit and record the exact command and result. Never write PASS for a command you did not run.
- For each story claimed in Highlights, open its evidence index and quote its `Run result:` value. A story with `NOT VERIFIED`, no index, or a stale index is a known issue, not a verified highlight.
- Run `run_command` and `capture_command` only when the ticket asks for a fresh smoke check; otherwise cite existing evidence and say it was not re-run.
- Read stories still `in-progress` or `blocked` that were expected in this release, and list them under Known issues.
- Record anything you could not check, with the reason, under Known issues or Verification.

## 4. Write the release file

Create `production/releases/<version>.md`:

```markdown
# Release <version>

- Date: <target date, or the date this was written>
- Previous: <previous version, or "first release">
- Range: <previous date or tag>..<release commit>
- Ticket: #<issue number>
- Status: awaiting approval

## Highlights

- <user-visible change> (#<PR>, @<author>)

## Fixes

- <defect fixed> (#<PR>, @<author>)

## Known issues

- <open defect, unmerged PR, NOT VERIFIED evidence or deferred item> (<link or reason>)

## Verification

- `check_command` on <commit>: PASS
- `test_command` on <commit>: PASS
- `production/qa/evidence/<story-slug>/index.md` — Run result: OBSERVED — <what it shows>

## Upgrade notes

- <save format, input change, engine version, manual step, or "None.">

## Release checklist

- [ ] Version <version> matches the ticket.
- [ ] Every merged PR in the range is listed or deliberately excluded.
- [ ] `check_command` and `test_command` passed on <commit>.
- [ ] Every highlighted story has an evidence index with an OBSERVED result.
- [ ] Known issues include every NOT VERIFIED item.
- [ ] Upgrade notes cover every change that needs one.
- [ ] A person approved this release.
- [ ] A person or release manager tagged and published it.
```

- Tick each box only for work this ticket actually did; leave approval and publishing unchecked for the person.
- Keep sections short and factual. No marketing language, no claim the evidence does not support.

## 5. Commit and pull request

- Commit as `release: add notes for <version>`.
- Push the ticket branch, open the PR against the default branch, and use the four body sections: What changed, Verification (command and result), Evidence (path and Run result), Risks and not covered.
- The checklist is the approval artifact: point the PR body at it and state which boxes are still open.

## Report contents

End with one orchestrator_report:

- state: progress, with human_action set to one question asking the release manager to approve release `<version>` for tagging and publishing, naming the PR, the release file, the option you recommend, and the boxes still open.
- work type: release-prep.
- pr: the full PR URL.
- release: the file path and the version.
- verification: each command you ran and its result.
- known issues: count and one line each.

If a person approves inside this ticket, report ready with the PR link and the release file path, and state plainly that nothing was merged, tagged or published by you. Report blocked only for a concrete blocker (no access to merged history, a shipped entry you must not rewrite, checks cannot run), with what you tried and what remains.

Never merge, tag, publish, or mark a release approved on a person's behalf.
