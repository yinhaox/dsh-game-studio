# Ticket granularity

A ticket's size decides how long a worker holds context, how large the diff is,
how long a person reviews it, and how often a turn stalls. The studio defaults to
**fine**: one reviewable change per ticket.

## The three sizes

| Size | One ticket is | Acceptance criteria | Diff target | Review |
|---|---|---|---|---|
| `fine` (default) | one outcome | 1–3 | ≤ 300 lines, ≤ 3 directories | minutes |
| `balanced` | one task | 2–4 | ≤ 600 lines | under 15 minutes |
| `coarse` | one feature | 5–10 | one sitting | a real review |

`fine` is the default because a worker's context grows with every file and every
test it touches, and a long ticket is where a stalled turn hurts most. The Coil
3D run measured the difference with `scripts/studio-metrics.py`:

| Ticket | Size | Work | Steps | Input tokens | Output tokens |
|---|---|---|---|---|---|
| UI shell, pause, end panel, save | coarse (2,500 lines) | (long; overnight gap) | 126 | 510,911 | 145,732 |
| Mode selector in the main menu | fine (156 lines, 5 files) | 20.6 min | 74 | 181,493 | 72,229 |
| Remember last mode | fine | 9.1 min | 61 | 106,318 | 32,631 |
| Version in the footer | fine | 8.3 min | 43 | 87,351 | 21,869 |
| Mode catalog in the logic layer | fine (736 lines with tests) | 7.6 min | 41 | 127,388 | 30,179 |

A fine ticket costs roughly a third of a coarse one in steps and input tokens,
and finishes in 8–21 minutes. The 20.6-minute outlier asked one scope question
mid-flight: the issue named a closed list of files, the change needed a fifth, and
the round trip cost more than the code. **Name directories, not a closed file
list**, or the boundary check turns into a question.

## No timeout on the model, yet

The metrics separate "slow" from "stuck": the longest single step across the
measured tickets was 4.5 minutes (a build/test run), and every ticket finished.
Nothing here justifies a step timeout; a timeout would turn a slow build into a
failed ticket. Watch for a step beyond ten minutes, and only then consider a
retry — not a kill.

## Splitting

Split a ticket when any of these is true:

- more than 5 acceptance criteria;
- more than 3 directories will change;
- the expected diff is larger than 300 lines;
- the work needs two different work types (for example a story and a release
  note);
- the design page it cites does not exist yet; the design work is its own ticket.

A split keeps the same evidence discipline: each piece has its own acceptance,
its own evidence directory, and its own pull request.

## Readiness, before writing

Before the first edit, a worker checks:

1. Every acceptance criterion is observable and testable.
2. Every design file it cites exists and covers the behavior.
3. Dependencies named by the story are `done`.
4. No open question remains; if one does, it goes to a single `attention` question
   instead of a guessed implementation.

Failing readiness is not a failure of the ticket: it is the cheapest moment to
fix the ticket.

## What the prompts enforce

- `seed/prompts/scope.md` tells the worker to size the ticket first and report a
  split plan instead of implementing an oversized one.
- `template/production/stories/_template.md` carries a `## Size` block so the
  author has to state the estimate.
- `scripts/studio-metrics.py` reports work time, steps, tool calls and tokens per
  ticket, so the size rule can be checked against data instead of memory.
