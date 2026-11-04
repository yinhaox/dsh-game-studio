# Case study: Bastion 3D, a complex project under the studio

Sokoban 3D proved the loop. Coil 3D probed the missing mechanisms. **Bastion 3D**
was the scale test: a genre with many coupled systems, a content pipeline, and a
performance gate.

- Game: <https://github.com/yinhaox/bastion-3d> (private)
- Release: <https://github.com/yinhaox/bastion-3d/releases/tag/v0.1.0> —
  Windows, Linux and Web downloads.
- Deployment: fourth profile `superagent-bastion`, port 3085, three worker slots,
  `command-code / deepseek/deepseek-v4.1-flash`.

## What shipped

53 commits, **21 merged pull requests**, **150 headless checks**, zero open
issues.

| System | Content |
|---|---|
| Waves | 20 data-driven waves, Boss on wave 20 |
| Towers | 5 kinds (single, splash, slow, pierce, support) with 3 upgrade levels |
| Enemies | 6 kinds plus a boss |
| Map | One 12×9 courtyard with two routes, A* pathfinding |
| Economy | Build, sell at 60%, upgrade, wave bonuses, leaks cost lives |
| UI | Main menu, battle HUD, build menu, victory/defeat panels, settings |
| Persistence | Best wave and settings in `user://bastion_save.json` |
| Language | English and Chinese |

## Performance as an acceptance criterion

The benchmark story ran a real window with **200 enemies and 5 towers** for ten
seconds and wrote a per-frame log:

| Metric | Value |
|---|---|
| Samples | 3,053 frames |
| Average FPS | 328.8 |
| p95 frame time | 5.46 ms |
| Worst frame | 24.9 ms (first frame) |
| 60 fps budget (16.67 ms p95) | met |

The gate lives in `design/technical-architecture.md`; the story's evidence index
records the numbers and the exact command.

## Parallel workers, measured

`maxWorkers: 3` and disjoint write sets held up across the run. Pairs and
triples of tickets ran concurrently with **no merge conflicts**, because:

1. the test runner discovers `tests/suites/*.gd`, so two tickets never edit the
   same test file;
2. each ticket names its directories, and the ones that share a scene run alone;
3. a design-vs-implementation mismatch becomes a separate `design` ticket
   (the 60% sell refund), not a silent edit.

Measured work, in minutes of the longest assignment:

| Ticket | Kind | Minutes | Steps | Input tokens |
|---|---|---|---|---|
| 3D enemy and tower views | integration | 43.7 | 217 | 291,009 |
| HUD overlap bug | bug | 29.5 | 104 | 183,163 |
| Battle loop wiring | integration | 24.7 | 97 | 276,215 |
| Design set | design | 22.4 | 87 | 210,000 |
| HUD and settings i18n | integration | 21.2 | 88 | 207,362 |
| Build interaction | integration | 21.1 | 103 | 196,463 |
| Navigation + A* | logic | 14.5 | 59 | 98,686 |
| Tower and enemy data | logic | 14.6 | 65 | 132,251 |

The pattern is stable: **logic tickets finish in 10–15 minutes; integration
tickets take 20–45 and cost two to three times the tokens.** The fine-granularity
rule is the reason the logic side stays cheap; the remaining cost sits in scene
wiring, which is where the next split should happen.

## What the studio got wrong, and the fixes

1. **The template hard-coded its title.** `src/main.gd` and the template tests
   assumed "Game Studio", so the first rename turned CI red. The title now reads
   `application/config/name`, and the tests compare against it (`ede66c7`).
2. **A source settings save before setup finished returned `404 Source not
   found`.** Documented in `docs/004-deployment.md`; wait for the runtime to be
   ready.
3. **`github.com:443` was blocked while `api.github.com` was not.** Workers
   published branches through the Git Data API, and the deployment's prepare was
   pointed at a local bare mirror; the operator used SSH over 443. Documented.
4. **An attention question stayed open after the issue reply was delivered.**
   The workable path was to stop the ticket, close the issue, and file the
   approved split as its own ticket. The better long-term fix is a delivery
   signal the panel shows, which is still open.

## Not covered

- One map only; mode and difficulty selection are not built.
- Splitter, healer and boss phases, and the full splash/pierce/support behaviour,
  are implemented in data and partial logic but not verified end to end.
- Twenty-wave completion is proven with scripted tower placement and a raised
  life pool, not by a human playtest.
- No audio, no store assets, no code signing.
