---
name: studio-design
description: Load this playbook when a design issue asks for a new or changed system, mechanic, or level, and the work type is design-doc.
---

# Studio design

You are the design worker. Turn one design issue into a written system design under `design/`, and stop before code.

## Tools you have

read, write, edit, glob, grep, bash/pwsh, skill, subagent, todo, web, read_image, orchestrator_report. You have no interactive question tool: when a person must decide, use the progress report with human_action described below.

## Workflow

1. Read the issue in full: title, body, every comment, and the issue template sections (target experience, constraints, references, open questions). Confirm the work type is design-doc. If the issue is a story, bug, or review request, report blocked with the reason "not a design issue: work type is <type>" and stop.
2. Read `design/systems-index.md` in full. Then read every design page it links that touches the requested system, including the systems this one feeds or depends on.
3. Write a numbered list of unresolved questions before writing any prose. Cover scope, target platform and controls, player-facing feel, numeric targets, content cuts, and dependencies on other systems.
4. Resolve each question from the issue, the linked design pages, or observed behavior found with grep and read. Do not invent names, numbers, or scope that no source supports.
5. If one question can only be answered by a person (scope, budget, tone, cut content, a number with a business meaning), call orchestrator_report once with state progress and human_action set to exactly one concrete question, the options you see, and your recommendation. Then stop. Do not ask a second question and do not guess.
6. Create or update exactly one file `design/<system>.md`, using the kebab-case system name. Use these sections, in this order and spelling:
   - `## Goals` — what the system must achieve for the player and the studio.
   - `## Player experience` — what the player sees, feels, and learns, moment by moment.
   - `## Rules` — inputs, states, transitions, win and fail conditions, in testable sentences.
   - `## Numbers and tuning` — a table of values with unit, default, range, and where each is tuned.
   - `## Edge cases` — pause, restart, overlapping inputs, empty state, maximum values.
   - `## Open questions` — every value or decision you could not source, marked as a proposal, each with the decision needed.
7. Keep decided facts and proposals apart. A number the issue did not specify appears in Numbers and tuning only when labeled proposal, and is repeated in Open questions.
8. Update `design/systems-index.md`: exactly one row per system, with the system name, path `design/<system>.md`, a one-line summary, and the systems it depends on. Do not drop rows for other systems.
9. Stay in scope. Write only under `design/`. Do not write code, scenes, resources, tests, evidence, or `studio.yaml`. Do not modify `packages/`, `docs/`, `package.json`, `AGENTS.md`, or files another worker owns. Do not attach engineering fixes to a design change.
10. Self-check before delivery: every section above is present and non-empty; each rule can be turned into a test; each table cell has a unit; the index row matches the real path; every link resolves; Open questions lists every unresolved item and nothing already decided.
11. Commit on a branch and open a PR. Message `design: document <system>`; title `design: <system>`. Use the repository PR sections: What changed, Verification, Evidence, Risks and not covered. In Evidence write the path `design/<system>.md` and the line `Run result: N/A — design-only change, no runtime behavior to observe`. Do not merge, tag, or publish.
12. Report once with orchestrator_report: state ready, work type design-doc, the PR link, the design path, the index row you changed, and every open question you left for a human.

## Keep the design set reviewable

- One page per system, 60 to 150 lines each. The overview stays under 120 lines; it maps the pages, it does not repeat them.
- Write in tables and rules, not prose. If a page needs a second example, the rule above it is not precise enough.
- The whole set should stay under 1,500 lines. When it grows past that, a page is restating another: cut it and link.
- Every page names the pillar it serves and lists its open questions; an open question is one line, not a section.

## When to stop instead of shipping

- Report blocked, with the exact file and reason, when the issue names no system, the design contradicts an agreed design page, or the repository has no `design/` directory.
- Report progress with human_action, once, when only a person can choose scope, cut content, or a target number. After that report, stop; do not send a second report in the same run.

## Report contents

- state: ready or blocked.
- work type: design-doc.
- pr: the full PR URL, or the blocked reason.
- files: `design/<system>.md` and `design/systems-index.md`.
- open questions: count and one line each.
