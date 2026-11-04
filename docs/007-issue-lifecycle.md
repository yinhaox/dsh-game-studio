# Issue lifecycle after a merge

A ticket is not finished when its pull request is opened. It is finished when the
change is merged and the issue that asked for it is closed. Two mechanisms make
that happen, in this order.

## 1. The pull request says `Closes #<n>`

When the ticket came from an issue, the worker starts the pull request body with
`Closes #<issue-number>` (see `seed/prompts/delivery.md` and `AGENTS.md`). GitHub
closes the issue itself when the pull request merges into the default branch, and
links the two in the issue timeline.

This is the preferred path: no polling, no extra API call, and the link lives in
GitHub.

## 2. The Source closes it when the merge is observed

A body without the line leaves the issue open after the merge. The GitHub Source
therefore watches the pull requests of open tickets; when a bound pull request
merges, it closes the issue that started the ticket with a comment naming the
pull request:

```
Merged in #31.
```

It leaves the issue open when the pull request closes without merging, and it
does nothing when the issue is already closed.

The behaviour lives in `src/sources/github-pull.ts` of the patched superagent
checkout (`patches/superagent-windows.patch`), with tests in
`tests/sources.spec.ts`.

## What the operator sees

- A merged ticket ends when its pull request merges; the ticket store marks the
  outcome `merged`.
- The issue shows either `Closed as completed` by GitHub (path 1) or a
  `Merged in #<n>.` comment by the agent (path 2).
- A pull request that is closed unmerged ends the ticket with outcome `closed`
  and leaves the issue open on purpose.

## Why both

The prompt path is cheap and survives a deployment being down. The Source path
covers pull requests written before the rule existed, hand-written pull requests,
and a worker that forgot the line. Either alone leaves a class of issues stuck
open.
