# Case study: Lanternfall, built without a playtester

The fourth game tested the part the previous three never did: **autonomy**. No
human played a build, answered a design question, or merged a pull request. The
studio had to judge quality itself, fix its own infrastructure, and ship.

- Game: <https://github.com/yinhaox/lanternfall> (private)
- Release: <https://github.com/yinhaox/lanternfall/releases/tag/v0.1.0>
- Deployment: profile `superagent-lanternfall`, port 3086, three workers,
  `command-code / deepseek/deepseek-v4.1-flash`.

## What shipped

96 commits, **30 merged pull requests**, **208 headless checks**, zero open
issues.

| System | Content |
|---|---|
| Combat | 9×9 grid, 2 AP, cover, line of sight, knockback, four statuses |
| Light | Shared 0–100 resource, braziers, overload, shadow spawns at zero |
| Heroes | Five, four skills each; two unlocked with embers |
| Enemies | Six kinds plus a three-phase boss |
| Run | Three acts × five rooms: battle, event, caravan, campfire |
| Relics | Fourteen, and their effects actually apply in battle |
| UI | Menu, party select with 3D portraits, settings, result panels, arrival cards, tutorial |
| Audio | Twelve synthesized cues and a ten-second seamless ambient bed |
| Access | Three colour palettes, shape cues, reduced motion |
| Text | English and Chinese |

## Autonomy, measured

| Signal | Result |
|---|---|
| Critic rounds | 5, each with frame numbers and `file:line` findings |
| Critic verdicts | `needs one more pass` → … → `ship-ready` / `PASS` for the battle room and run flow |
| 3v3 auto-play | 20 seeded battles: 60% wins, 7.45 rounds average |
| Full-run auto-play | 10 seeded runs: 40% wins, 45.5 rounds, 10.4 battles, no stuck run |
| Exports | Windows, Linux and Web built; the Windows build launched and captured the menu |

No finding came from a person. The one human input in the whole run was the
initial brief and the asset library; every review was a read-only agent ticket.

## Studio changes the run forced

1. **Template suite discovery.** The test runner loaded one fixed file, so every
   ticket that wanted its own suite had to stop and ask. The template now
   discovers `tests/suites/*.gd`.
2. **Absolute-path ban.** The write guard rejects a drive letter, UNC share or
   home/temp path in authored content; `scripts/scan-paths.py` runs in CI.
3. **Placeholder and literal-UI gate.** `scripts/quality-check.py` fails on
   TODO/FIXME/placeholder and on UI text that bypasses `tr()`.
4. **Translation coverage gate.** `scripts/i18n-check.py` fails when a key used
   in code is missing from a language table.
5. **Feel evidence.** `studio.py clip` records short AVI through Godot's Movie
   Maker, and `clip-frames.py` extracts frames; the quality-critic role reviews
   frames, not stills.
6. **API budget protection.** Closed threads were polled for 14 days and every
   deployment shared one token; the source now polls 48 hours and skips thread
   reads below 300 remaining calls. This incident stopped all work for about an
   hour until the cause was found.
7. **One deployment per active project.** Idle deployments kept spending the
   same token.

## What still needs work

- **Attention delivery is unreliable.** Three times a worker waited for an answer
  that had already been posted; the workaround was to stop the ticket and reopen
  it with the decision, which loses the worker's context.
- **Integration tickets are still 25–45 minutes.** Fine granularity keeps logic
  tickets at 10–15 minutes, but scene wiring stays large.
- **Content authoring is the next bottleneck.** One map, eight event texts and
  fourteen relics are enough for 0.1.0, not for a 1.0.
- **Music is a drone, not a score.** The ambient bed is synthesized; a real
  soundtrack is outside what the studio can produce.
- **Store assets and signing are absent**, as in every previous game.
