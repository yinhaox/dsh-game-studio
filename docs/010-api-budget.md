# API budget

The GitHub source spends one read per polled thread. A studio repository with a
dozen closed tickets and three deployments sharing one agent token can exhaust
the 5,000-call hourly budget and then receive no triggers at all.

Three changes keep it alive:

1. **Closed threads are polled for 48 hours**, not 14 days
   (`POLL_HORIZON_MS` in `src/sources/poll.ts`).
2. **When fewer than 300 calls remain, the round skips per-ticket and per-thread
   reads** and only reads notifications and repository streams
   (`rateRemaining` guard in `src/sources/github.ts`). The health detail says
   `thread polls paused`.
3. **One deployment per machine for active work.** Idle deployments share the
   same token and keep polling; stop them when their project is not the one being
   worked on.

The patches live in `patches/superagent-ratelimit.patch` on top of the pinned
superagent checkout.
