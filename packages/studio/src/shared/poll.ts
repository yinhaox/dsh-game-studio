import type { SourceContext } from './superagent.ts'

/** Runs one polling callback, reporting health and surviving individual failures. */
export interface PollOptions<C extends Record<string, unknown>> {
  kind: string
  healthEntry: string
  intervalSeconds(config: C | undefined): number
  enabled(config: C): boolean
  run(config: C, signal: AbortSignal): Promise<string>
  failureLimit?: number
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    if (signal.aborted) {
      resolve()
      return
    }
    const finish = (): void => {
      clearTimeout(timer)
      signal.removeEventListener('abort', finish)
      resolve()
    }
    const timer = setTimeout(finish, ms)
    signal.addEventListener('abort', finish, { once: true })
  })
}

/**
 * Wait for setup, follow the Source switch, run one round per interval, and
 * report a health entry. Three consecutive failed rounds become `error`; a
 * success resets the count. An abort ends the loop at once.
 */
export async function pollSource<C extends Record<string, unknown>>(
  ctx: SourceContext,
  options: PollOptions<C>,
  signal: AbortSignal,
): Promise<void> {
  await ctx.ready
  if (signal.aborted) return
  if (!ctx.configured()) {
    ctx.report(options.healthEntry, { state: 'paused', detail: 'Waiting for the deployment check' })
    return
  }
  const failureLimit = options.failureLimit ?? 3
  let failures = 0
  for (;;) {
    if (signal.aborted) return
    const config = ctx.config<C>(options.kind)
    if (config === undefined || !options.enabled(config)) {
      ctx.report(options.healthEntry, { state: 'paused', detail: 'Off' })
    } else {
      const at = new Date().toISOString()
      try {
        const detail = await options.run(config, signal)
        failures = 0
        ctx.report(options.healthEntry, { state: 'ready', detail, at })
      } catch (error) {
        if (signal.aborted) return
        failures += 1
        if (failures >= failureLimit) {
          ctx.report(options.healthEntry, { state: 'error', detail: String(error), at })
        }
      }
    }
    const requested = options.intervalSeconds(config)
    const interval = Number.isFinite(requested) ? Math.min(86_400, Math.max(10, requested)) : 600
    await delay(interval * 1000, signal)
  }
}
