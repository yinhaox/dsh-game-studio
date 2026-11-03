# Probe report: the mechanisms the Sokoban run never exercised

The first game (Sokoban 3D) used only the explicit path: a human opened an
issue, the agent implemented it, a human merged. The second game, **Coil 3D**
(3D snake), was built while deliberately driving every path that run skipped.

- Game: <https://github.com/yinhaox/coil-3d> (private)
- Deployment: third profile `superagent-coil`, port 3084, state
  `~/.dsh/state/superagent-coil`, model
  `command-code / deepseek/deepseek-v4.1-flash`, two workers.
- Policy: `eval.mode: auto` for the probe window, GitHub admission
  `issues.listedUnaddressed: inferred`, all three studio sources enabled.

## Results

| Mechanism | How it was probed | Evidence | Verdict |
|---|---|---|---|
| **Inferred + auto** | Issue #4 written without `@nightjar-agent`; admission marks an allowed person's unaddressed issue as `inferred`; `auto` accepts | Decision `accept / inferred` for `#4 Add touch controls…`; ticket created; PR #5 merged | **Works.** Automatic acceptance produced a real, in-scope change |
| **Human attention loop** | Issue #15 asked for a product decision and told the worker not to code first | Ticket object gained `attention` with exactly one question (`选 A 还是 B？… 推荐 A`); no files changed; the issue comment answer resumed the same ticket; PR #16 | **Works.** One question, then a resume, then delivery |
| **`studio-evidence`** | Deleted `production/qa/evidence/arena-view-3d/` while the story stayed `done` | Source health `checked 2 stories, 1 finding`; inferred ticket "Restore arena-view-3d evidence directory"; a `qa-evidence` worker re-ran captures and opened PR #9 | **Works.** Finding → ticket → restored evidence, no human prompt |
| **`studio-ci`** | Pushed a step named "Deliberate red probe" that exits 1 | Candidate text included the failing job and step (`ci / test failed at step "Deliberate red probe"`); the assessor **declined** it as intentional | **Candidate works, routing refused on purpose.** Rename the step and the same path routes; see the project row |
| **`studio-project`** | Broke `src/main.gd` parsing, then fixed the check to notice it | `Check failed (exit 1)`; candidate `Check fails: GDScript parse error on import`; decision `accept / studio-maintenance`; PR #10 repaired the script | **Works.** `studio-maintenance` work type exercised |
| **`qa-evidence` work type** | Same probe as `studio-evidence` | PR #9: only evidence directory + story Evidence section changed; fresh PNGs and logs, no reused artifacts | **Works.** Boundary respected |
| **`code-review` work type** | Opened probe PR #12 raising the per-frame step cap 4 → 40; issue `Type: review` | Read-only review posted on PR #12: 2 blockers (design conflict, failing test), 2 majors, 1 minor, 1 nit; no file changed, no approval | **Works.** Findings-only, cites design lines |
| **`studio-maintenance`** | The parse-error probe above | Decision `accept / studio-maintenance`; PR #10 | **Works.** Also required widening `.github/` into that scope |
| **Subagents + role briefs** | Story #7 told the worker to run `.dsh/agents/tech-director.md` through `subagent` before implementing | PR #8 body: three findings from the tech-director review, fixed before implementation; session shows a `subagent` call | **Works.** Role briefs are usable, not decoration |
| **Panel UI** | Playwright against `http://127.0.0.1:3084/` | Opened the Superagent panel, dismissed the preview modal, read 概览 / 来源 / 执行, paused and resumed processing through the confirmation dialogs | **Works.** No API typing needed for pause or source inspection |
| **Pause / resume** | Paused via the panel while a story ran; filed issue #18 while paused | `paused: true`; no ticket for #18 while paused; after resume the trigger was judged and ticketed, then PR #19 | **Works.** Sources keep recording, dispatch waits |
| **Retry** | Blocked ticket from issue #22 (asked for `export_presets.cfg` and `project.godot`) | Worker reported `blocked` with quoted boundary lines, changed nothing; `POST /tickets/:id/retry` accepted; a new assignment started and re-reported the same decision | **Works.** Retry does not invent a decision; it re-runs |
| **PR comment wake** | Commented on PR #20 without `@` asking for a stricter default tolerance | The ended ticket woke, changed `DEFAULT_TOLERANCE` 0.02 → 0.01, pushed `a4badf9`, updated evidence and the PR body | **Works** for a PR the ticket already tracks |
| **Input automation** | Story #17 | `tests/input_events.gd` injects real key events; 33 event-driven assertions (turn, reverse rejection, pause, over state) in `tests/run_tests.gd` | **Works.** PR #20 |
| **Visual regression** | Same story | `tests/visual_diff.py` (stdlib PNG decode), baseline `tests/baselines/arena-initial.png`; fresh capture diff 1420 px / 0.001902 under 0.01 | **Works.** Not yet wired into CI |
| **Performance data** | Story #21 | `--fps-log` + `--quit-after=10`: 38,365 samples, average 3,941 FPS uncapped, min 12.68 (first frame), p95 frame time 0.328 ms; PR #23 | **Works.** Proves headroom, not 60 Hz pacing |

## What the probes changed in the kit

1. **A red-CI candidate said only "CI is red".** The assessor cannot match a work
   type without the failing job. `studio-ci` now reads `gh run view --json jobs`
   and names the failing job and step in the candidate (`81defe1`).
2. **No work type could edit `.github/`.** Maintenance now covers CI and release
   workflow configuration — otherwise a red CI ticket had no legal fix.
3. **`studio.py check` passed a broken script.** Godot's `--import` exits 0 while
   printing `Parse Error`, and the changed-script list was empty after a worker
   committed. Check now fails on those output lines and takes scripts from the
   branch diff (`f8a8d59`).
4. **`STUDIO_GODOT` was set only in a terminal.** The shared `studio.yaml` keeps
   `path: godot`, but the superagent process, its sources and its workers all
   need the override; the deployment docs now say so (`7845e21`).
5. **Windows worker shims were POSIX scripts named `gh`.** PowerShell cannot run
   them, so it opened a stack of "choose an app" dialogs. The patch writes
   `gh.cmd` / `lark-cli.cmd` and removes stale files (`7a55639`).
6. **`init --godot` wrote a desktop path into a committed file**, and evidence
   logs echoed the absolute engine path. Init now keeps `godot`; the helper
   prints `godot` and project-relative paths (`9a7b20c`, `4361dd2`).
7. **Path scrub.** Both game repositories had machine paths in committed evidence
   logs; the working trees were scrubbed and the public kit's history was
   verified clean.

## What is still not covered

- **Feishu**: no bot credentials in this environment; the channel stays untested.
- **`auto` on a bot-authored candidate** was exercised through the evidence
  source (studio-producer bot), but not through a third-party bot.
- **Project-source `engine-mismatch`** variant: only `check-failed` was seen.
- **Long-running recovery**: the probe restarted the deployment mid-flight once
  and the ticket resumed, but a crash during a model call was not forced.
- **Metrics**: tokens and cost per ticket are still not recorded anywhere.
