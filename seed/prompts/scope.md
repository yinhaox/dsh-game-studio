# Scope

Write boundaries, stop conditions, and the rule against widening a ticket by accident. This is a hard constraint, not a preference: a write outside its boundary is a defect even when the change looks obviously correct.

## Boundaries per work type

| Work type | Writes | Never writes |
|---|---|---|
| design-doc | design/<system>.md, design/systems-index.md | src/, scenes/, tests/, scripts/, any .gd file |
| story-implement | src/, scenes/, tests/, the story file under production/stories/, production/qa/evidence/<story-slug>/ | design/, production/releases/, studio.yaml, another story's files |
| code-review | nothing — read-only | any file, any branch, any approval |
| bug-fix | src/, scenes/, tests/, the story file for the defect, that story's evidence directory | unrelated modules, studio.yaml, release notes |
| qa-evidence | production/qa/evidence/<story-slug>/, the Evidence section of the story file | game code, story acceptance criteria, design/ |
| release-prep | production/releases/<version>.md and its checklist | src/, scenes/, tests/, design/, studio.yaml, tags, merge state |
| studio-maintenance | studio.yaml, scripts/studio.py, addons/studio_capture/, engineering configuration | src/ and scenes/ gameplay code, story acceptance criteria, evidence rules |

Read anything you need. Write only what the table allows, and only for the ticket you were given.

## Stop conditions

Stop and ask one question — with options and a recommendation — instead of proceeding when:

- **Scope is unclear.** The ticket does not name the files, the story, or the target behavior and two readings would produce different diffs. Ask which reading is meant.
- **The engine will not run.** studio.yaml points at a missing engine, check_command fails before your change, or run_command cannot open a window. Report the command, the exit code, and the first error line; do not start from a broken baseline.
- **A design decision is needed.** The choice changes the player experience, a number a designer owns, or a story's acceptance criteria. Implementation cannot settle it.
- **The fix needs a file outside the boundary.** Say which file and why it must change. Do not edit it and explain afterwards.
- **Two sources disagree.** The story says one thing and the design document another; surface both and ask which one wins.
- **Evidence cannot be produced honestly.** The run cannot capture a screenshot for a real reason. Say so and ask whether to proceed as NOT VERIFIED or to spend effort on the capture path.

One question, then stop. Do not stack a second question into the same report, and do not produce a partial diff while waiting for the answer.

## Size the ticket before writing

Count the acceptance criteria and the directories you expect to touch before the
first edit.

- More than 5 criteria, more than 3 directories, or an expected diff over 300
  lines: do not implement. Report one `progress` message with a split plan (2–5
  smaller tickets, each with its own acceptance and evidence), recommend the
  split, and stop. The same rule applies when the work needs two work types.
- A design file the story cites does not exist: report it instead of inventing the
  behavior; the design page is its own ticket.
- Every criterion must be observable. "Make it feel better" is not one; ask for a
  measurable target in one question rather than guessing.

## No opportunistic refactors

Small changes stay small.

- Do not rename, reformat, relocate, or delete a file you were not asked to touch, even if it is obviously wrong. Note it in the pull request body under "Risks and not covered" or open a separate issue.
- Do not add a helper, an abstraction layer, or a base class because it would make this change cleaner. Add it when a second caller exists.
- Do not upgrade an engine, a dependency, or a project format version to fix a local failure.
- Do not add a config option for a value that has exactly one caller.
- Do not fix a nearby typo, a stale comment, or a dead function in the same diff. A review that has to separate two changes is a slow review.
- Keep a diff reviewable: if the change cannot be read in one sitting, it is probably two tickets.

## Report a scope change instead of doing it

When the work genuinely requires going outside the boundary:

1. Stop writing.
2. Post one message on the ticket that states the current change, the file that must also change, and the reason, with two options: extend this ticket, or split a follow-up story.
3. Recommend one option in one sentence.
4. Wait for the answer. Do not expand scope and ask forgiveness in the pull request body.

Record the agreed extension in the story file or the pull request body so the next agent reads the same boundary you did.
