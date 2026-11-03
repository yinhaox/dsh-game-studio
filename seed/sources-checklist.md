# Sources Checklist (superagent panel)

A short operator checklist for the person who turns the studio on. Run it top to bottom before the first work item, and repeat the marked items after any configuration change.

## 1. GitHub source and agent account

- [ ] The flow's GitHub source points at the game repository, not a fork, and the default branch is the one workers branch from.
- [ ] The agent account is a real bot or machine account with push access to branches only — not to the protected branch.
- [ ] The account token has issue and pull request scope; it has no admin, no tag, and no release scope.
- [ ] The account can read the checkout path the Execution step will use.
- [ ] One smoke test: the account opens a comment on a scratch issue and you see it arrive in the ticket list.

## 2. Allowed people

- [ ] The allowed list contains only the people who may originate work: designers, leads, the producer.
- [ ] Each of the three studio sources (studio-evidence, studio-ci, studio-project) has a bots row with id studio-producer, saved and reopened; without that row the candidate is rejected as an unlisted bot. No other account is on those lists.
- [ ] Everyone on the allowed list has been told what the agent may do without asking.
- [ ] Everyone not on the list knows their comments are ignored rather than routed, so they use a listed person for real requests.

## 3. Execution

- [ ] The prepare command clones or fetches into an isolated directory, one per worker, using a worktree rather than a second clone:

  ```bash
  git worktree add ../studio-worker-{{id}} {{branch}}
  ```

- [ ] The prepare command fails loudly when the worktree already exists, so two workers never share a directory.
- [ ] The working directory handed to the worker is the worktree path, and studio.yaml resolves inside it.
- [ ] Cleanup removes the worktree after the run; a leftover directory shows up as a new work item if you do not.
- [ ] A dry run on a throwaway issue produces one branch, one pull request, and one evidence directory, and touches nothing else.

## 4. Worker concurrency

- [ ] Start at one worker until the first three pull requests look the way you want them to.
- [ ] Raise to two only after the prepare command and cleanup have both proven repeatable.
- [ ] Keep concurrency below the number of people who can review the output; an unreviewed queue is a worse failure than a slow queue.
- [ ] Confirm two workers never receive the same story; the ticket claim is what prevents it.

## 5. Pause behavior

- [ ] Pausing the flow stops new work items and lets the running worker finish its current step.
- [ ] The paused state is visible on the panel where an operator will look, not only in a log.
- [ ] A paused worker does not keep polling, and it does not open a pull request on resume for work that was already finished.
- [ ] There is a named person who owns pausing during a release freeze, and they know how to do it.
- [ ] Kill and resume have both been tried once, on a throwaway issue.

## 6. Observe before auto

- [ ] Policy evaluation runs with mode observe first.
- [ ] Read the evaluation output on at least ten real tickets before changing the mode.
- [ ] Check the four things that matter per ticket: did it match the right work type, did it stay inside its write boundary, did it produce the evidence the rule requires, did it ask one question instead of guessing.
- [ ] Move to any automatic mode only after the observed tickets are clean, and change one rule at a time.
- [ ] Keep the 120 second evaluation timeout unless a real ticket proves it too short; note the reason when you change it.
- [ ] After every policy or prompt edit, re-read the saved configuration to confirm all seven rules, the eval block, and the three prompt sections landed.
