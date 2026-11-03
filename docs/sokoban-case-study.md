# Case study: a 3D Sokoban, built by the studio

The kit's first real product was a commercial-quality 3D Sokoban developed
entirely through GitHub tickets: **45 commits, 15 merged pull requests, 20
levels, 911 headless checks, three platform exports and a published 0.1.0
release.**

- Game repository: <https://github.com/yinhaox/sokoban-3d>
- Deployment: a second superagent profile (`superagent-sokoban`, port 3083,
  state directory `~/.dsh/state/superagent-sokoban`), one repository, two worker
  slots, model route `command-code / deepseek/deepseek-v4.1-flash`.
- The kit itself stayed external: the game repository carries a copy of
  `template/.dsh`, `AGENTS.md` and `studio.yaml`, not the plugin.

## What the tickets produced

| Ticket | Work type | Result |
|---|---|---|
| #1 | design-doc | 12-page design set, 4 pillars, 20-level plan, release gates |
| #3, #4 | story | headless rules, level format, save-free test harness (175 checks) |
| #5, #7 | design-doc | reconciled undo cap, level example and vision |
| #6, #8 | story | 3D room, isometric camera, wall fade, capture evidence |
| #9, #10 | bug | camera framing, translucent near walls, four-angle evidence |
| #11, #12 | story | movement, push, undo, restart, victory overlay |
| #13, #14 | story | menu, HUD, pause, victory shell, runtime InputMap |
| #15, #19 | story | twenty-level campaign, solver-checked |
| #16, #18 | story | save, progression, settings, EN/ZH, colour-blind mode |
| #20, #22 | story | boot-only debug arguments for state-specific screenshots |
| #21, #23 | story | seven runtime-synthesized audio cues wired to gameplay |
| #24, #25 | release-prep | 0.1.0 release notes and checklist |
| #26, #29 | story | visual polish: grid, contact shadows, room base, faded-wall outlines |
| #27, #28 | design-doc | aligned the audio page with runtime synthesis |
| #30, #31 | bug | faded walls lost their black holes and per-cell seams |

Each story and bug PR carried its own `check.log`, `test.log`, `capture` logs
and PNGs under `production/qa/evidence/<slug>/`, and the merge gate was a
person reading them.

## What the kit lacked, and how it was fixed

| Gap found in the run | Fix |
|---|---|
| A story could not write level data or shaders under `assets/` | `assets/data/` and `assets/shaders/` joined the story and bug scopes (policy, `AGENTS.md`, scope prompt, docs) |
| `AGENTS.md` said only OBSERVED closes a story, contradicting the evidence contract for logic-only work | `N/A` closes work with nothing to observe, with its reason required |
| Godot imported every evidence screenshot and wrote `.import` files the rules forbid | `template/production/.gdignore` |
| A ticket wrote scratch scripts into `.dsh/` | `guard-writes` allows only `.dsh/rules`, `.dsh/skills`, `.dsh/agents` |
| A design ticket produced 145 KB of pages | the design playbook now names a page budget and forbids restating |
| Nothing could screenshot a mid-game state | `capture` and `run` pass extra game arguments after `--` |
| A story cannot edit `project.godot`, so input actions had no home | the template says to register `InputMap` actions at runtime |
| Merging a PR that adds a `class_name` broke `test` until an import | `studio.py test` imports first |
| The game repository's CI ran the shared `studio.yaml` with a Windows engine path | `STUDIO_GODOT` overrides the path; CI names `godot` |
| Two issues filed during a slow poll were never read | a ten-minute notification lookback in the superagent patch |

## Release

`v0.1.0` is tagged and published with Windows, Linux and Web downloads:
<https://github.com/yinhaox/sokoban-3d/releases/tag/v0.1.0>. The exported
Windows binary was launched and captured from the shipped build, not the
editor.

## What is still rough

- **Intake is fragile around restarts.** The GitHub source advances its cursor
  each round; an issue created while the process restarts can be skipped. The
  lookback patch reduces it, but a comment still sometimes wakes a lost issue.
- **Model stalls.** A few turns hung for minutes at a request; the worker
  recovered on restart, at the cost of a re-issued turn.
- **Design and implementation drift.** `design/audio.md` still proposes
  committed WAVs where the implementation synthesizes audio; the release notes
  list it.
- **Art and audio are procedural placeholders**, not a shipped soundtrack or
  asset pack. The studio was designed so they can be replaced without touching
  rules.
