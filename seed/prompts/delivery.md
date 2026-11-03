# Delivery

How work leaves the studio: what a pull request contains, what counts as evidence, and the narrow case where it may merge without a human pressing the button.

## The pull request body has four sections

Every pull request uses exactly these headings, in this order. The repository template already carries them; do not invent others and do not drop one.

```markdown
## What changed

## Verification
- Command:
- Result:

## Evidence
- Path:
- Run result:

## Risks and not covered
```

- **What changed** — the behavior that is different now, in two to five lines. Name the story id. Do not restate the diff line by line.
- **Verification** — the exact command from studio.yaml and its outcome, pasted, including the exit code. One command per line.
- **Evidence** — the evidence directory path and the value of the Run result: line, copied from the index. One path, one result.
- **Risks and not covered** — what the change deliberately does not handle, what a reviewer should look at first, and any known regression surface. Write "none known" only when that is true.

A pull request missing a heading, an empty Verification result, or a Run result: of NOT VERIFIED is not ready for review.

## Evidence rules

- Evidence comes from a real run of run_command and capture_command on this machine, against this branch.
- Save screenshots as PNG under production/qa/evidence/<story-slug>/, and save command output as a .log file beside them.
- The index.md carries one line beginning with `Run result:` and one of three values:
  - `OBSERVED — <what was on screen>`
  - `NOT VERIFIED — <why the run proved nothing>`
  - `N/A — <why this work has no runtime behavior>`
- A screenshot smaller than 1024 bytes is a blank capture; it is not evidence.
- Re-running after a fix means new artifacts. Never reuse a file from an earlier run, and never hand-edit a PNG or a log.
- Cite the file name next to the claim it supports, for example "capture-1.png — the pause menu opens on Escape".

## No evidence means draft

A pull request that changes runtime behavior and has no evidence stays a draft.

- Open it as a draft, say in the body which evidence is still missing, and keep it a draft until the artifact exists.
- Do not mark a draft ready because the tests pass. Tests are not evidence of what appears on screen.
- Do not ask for review on a draft that is waiting on a run; ask for the run.
- If the run cannot happen, say so plainly and leave the pull request as a draft. A candidate that never became observable is not done.

## Auto-merge is off by default

The default is that a human merges. The single exception:

- the diff is 200 changed lines or fewer, and
- the pull request has the required approvals, and
- Verification shows a passing command, and
- Evidence shows a Run result: of OBSERVED with an artifact from this branch.

Even then, an agent may enable auto-merge only for a story it implemented itself, never for design, release, or maintenance work, and never for a pull request it reviewed. When any condition is unmet, leave merging to a person and say so in the body.

Never widen this exception in a comment. If a change feels too small to review, the answer is a shorter description, not a skipped review.

## Never tag or publish

- Do not create, move, or delete a git tag.
- Do not push to a release branch, cut a release, or publish an artifact, a store build, or a version note.
- Do not edit production/releases/<version>.md outside release-prep, and even there the document is a proposal until a human approves it.
- Do not announce a release on any channel. Release-prep ends with a document and a request for approval.
- If a step seems to require publishing, stop and ask one question with the options; do not do it and report afterwards.

## Screenshots come from a real run

- Capture with capture_command from studio.yaml, on the branch under review, at the window size the project sets.
- Do not mock, composite, crop, annotate over the subject, or reuse an image from the design document or an earlier story.
- A screenshot that shows a debug overlay, a blank viewport, or a window from another project is not evidence of this change.
- When the captured frame is genuinely unreadable at normal size, keep the capture and describe what is visible instead of producing a cleaner-looking substitute.
