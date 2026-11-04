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
3D run showed the difference directly: a one-criterion footer ticket used 87 k
input tokens and 43 steps, while the UI-shell feature used 511 k input tokens and
126 steps for the same worker and model.

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
