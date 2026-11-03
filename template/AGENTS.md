# Agent conventions for this Godot 4 game repository

This repository is a Godot 4 game project worked by a small studio agent team. Read this file before you change anything. The ticket you were handed names your work type, and that work type decides which files are yours.

If a rule here conflicts with the ticket, the stricter rule wins and you report the conflict.

## Read first, every ticket

1. This file.
2. studio.yaml: it is the only source of engine commands and repository paths.
3. The story or design file the ticket names, plus the design doc it cites under design/.
4. The evidence directory for the story when the ticket is about a finished story or a qa-evidence task.

Do not work from memory of how other Godot projects are laid out. This checkout is the fact.

## Project facts

- Engine: Godot 4.7, GL Compatibility renderer, window 1152x648.
- Main scene: res://scenes/main.tscn.
- Capture autoload: addons/studio_capture/capture.gd. It writes a PNG when the game starts with --studio-capture=<path> and exits.
- Tests: tests/run_tests.gd, a SceneTree script that exits non-zero when an assertion fails.
- Game code lives in src/ and scenes/. Tooling lives in scripts/.
- Write every path in this repository with forward slashes.
- Godot writes a `<script>.gd.uid` file beside a script on import. Commit it with the script; never hand-edit its value.
- `production/` carries a `.gdignore`, so Godot does not import evidence screenshots or release notes. Keep that file, and never put a game asset under `production/`.
- `.github/workflows/ci.yml` installs Godot and runs `scripts/studio.py test` on every push; keep it, because a merge that adds a `class_name` needs an import before the tests pass.
- `studio.yaml` names Godot as `godot` from PATH. A machine that keeps the engine elsewhere sets `STUDIO_GODOT` instead of editing the shared file; CI relies on that.
- Input actions are registered at runtime with `InputMap.add_action()` (or `InputMap.action_add_event`), not written into `project.godot`: a story cannot edit the project file, and a runtime action is what a settings screen can rebind.

## Engine commands

Every engine command comes from studio.yaml. Never hardcode an engine binary path in a ticket, a script, or a comment.

| Key | What it does for your ticket |
|---|---|
| check_command | Imports the project and parses the scripts you changed. Run it first; a parse error ends the work early. |
| test_command | Runs the test suite. Your change is not done until this passes. |
| run_command | Launches the game with a window so the behavior can be seen. |
| capture_command | Launches the game, saves a screenshot, exits. This is how evidence PNGs are produced. |

If a key is missing or empty, report it as a studio-maintenance problem. Do not invent a command.
`run` and `capture` pass extra user arguments to the game after `--`, so one fixed command can screenshot a specific state: `capture --out production/qa/evidence/<slug>/level-3.png -- --level=3`.

## Write boundaries by work type

Only files inside your work type's boundary may change. Everything else is read-only, even when the fix looks trivial.

| Work type | May write | Must not write |
|---|---|---|
| design-doc | design/<system>.md and design/systems-index.md | code, scenes, tests, production/ |
| story-implement | src/, scenes/, tests/, assets/data/, assets/shaders/, the story file, production/qa/evidence/<story-slug>/ | design/, production/releases/, studio.yaml |
| code-review | nothing: this work type is read-only | any file |
| bug-fix | the smallest set under src/, scenes/, tests/, assets/data/ and assets/shaders/ that removes the root cause, plus the story file and its evidence directory | unrelated refactors, design/, production/releases/ |
| qa-evidence | production/qa/evidence/<story-slug>/ and the story file | src/, scenes/, tests/, design/ |
| release-prep | production/releases/<version>.md | code, scenes, tags, merges |
| studio-maintenance | engineering configuration and scripts: studio.yaml, scripts/, project.godot, the tests harness, .dsh configuration | game design, gameplay behavior beyond the configuration fix |

Hard limits on all work types:

- Never write inside .godot/.
- Never write or edit a .import file.
- Never edit export_presets.cfg.
- Never write inside .git/.
- A shell command that rewrites one of those files is just as out of bounds as opening it. The write guard enforces this for `write` and `edit`; a shell command has no guard, so the limit is on you.

A "small cleanup" is not a reason to leave your boundary. If the fix needs a file outside it, report the problem instead of taking the file.

## Evidence

Evidence must come from a real run of this checkout. A design doc, a reasoning trace, or a hand-written description is not evidence.

- Screenshots come from capture_command, or from run_command plus a capture of the real window. Store them as PNG in production/qa/evidence/<story-slug>/.
- Logs come from the actual command output. Store them as .log in the same directory.
- The directory has an index.md. After the title, it carries a line that starts with Run result:.
- Run result: takes exactly one of three forms:
  - OBSERVED — what was on screen
  - NOT VERIFIED — what is missing and why
  - N/A — why this story has no runtime behavior to observe
- OBSERVED closes a story that changes what the player sees. N/A closes one with no runtime behavior to observe, and its reason must say why nothing is observable. NOT VERIFIED never closes a story: it reports that the evidence is missing.
- A PNG smaller than 1 KB is a broken capture. It does not count as evidence.

Story files carry status in frontmatter: ready, in-progress, done, blocked. Set status: done only after the evidence index exists and the story's Evidence section links to it.

## Commits and pull requests

- Commit messages use the form <type>: <summary>, for example story: add dash cooldown to the player controller.
- Use the type that matches the work: design, story, bug, review, evidence, release, chore.
- One concern per commit. Do not mix a formatting sweep into a behavior change.
- The pull request body uses the template's four sections: What changed, Verification, Evidence, Risks and not covered.
- Verification states the command you ran and its result. Evidence states the path and the Run result: line.
- A pull request without evidence is a draft. Say so in the body instead of implying the work is verified.
- Never force push. Never create, move, or delete a tag. Never publish, export, or upload a build. Never merge your own pull request.

## Asking a human

- When a decision needs a human, send exactly one orchestrator_report with state progress and human_action set to one specific question. Include the options you considered and the one you recommend.
- Do not guess and keep going. Do not ask a second question in the same ticket; wait for the answer.
- When you finish, send one orchestrator_report with state ready and include the pull request link and the evidence path.
- When you cannot proceed, send one orchestrator_report with state blocked and the concrete reason.
- There is no other reporting channel. Do not message people directly and do not comment on unrelated issues or pull requests.

## Stop and report instead of editing

- studio.yaml or project.godot is missing a key you need.
- An engine command fails for a reason outside your change: import failure, missing Godot binary, or a version mismatch between project.godot and studio.yaml.
- The ticket asks for a file outside your boundary.
- A test fails for a reason you cannot explain within your boundary.

## Working with the runtime you were given

Use the tools this runtime provides. Do not follow instructions copied from another agent runtime, and do not assume tool names from another runtime exist here.
