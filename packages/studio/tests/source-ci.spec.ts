import { describe, expect, it } from 'vitest'
import { kind, runCheck, type Config } from '../src/producer/ci/index.ts'
import type {
  Commands,
  Health,
  ReceiveResult,
  SourceContext,
  ThreadDescription,
  Trigger,
} from '../src/shared/superagent.ts'

const CHECKOUT = 'C:/work/game'
const BRANCH = 'main'
const SHA = 'a1b2c3d4'
const RUN_URL = 'https://github.com/studio/game/actions/runs/42'
/** Fixed clock: 2026-03-01T12:00:00.000Z. */
const NOW = Date.parse('2026-03-01T12:00:00.000Z')
const MINUTE = 60_000

interface Call {
  program: string
  args: string[]
  cwd: string | undefined
}

interface Harness {
  ctx: SourceContext
  triggers: Trigger[]
  results: ReceiveResult[]
  threads: Array<{ key: string; description: ThreadDescription }>
  reports: Array<{ entry: string; health: Health }>
  calls: Call[]
}

/** A fake SourceContext: records receives, thread descriptions, health and commands. */
function makeHarness(output: string): Harness {
  const triggers: Trigger[] = []
  const results: ReceiveResult[] = []
  const threads: Harness['threads'] = []
  const reports: Harness['reports'] = []
  const calls: Call[] = []
  const seen = new Set<string>()
  const store = new Map<string, unknown>()
  const commands: Commands = {
    run: async (program, args, cwd) => {
      calls.push({ program, args, cwd })
      return output
    },
  }
  const ctx: SourceContext = {
    commands,
    ready: Promise.resolve(),
    configured: () => true,
    config: <C extends Record<string, unknown>>(_kind: string): C | undefined => undefined,
    receive: (trigger) => {
      triggers.push(trigger)
      const result: ReceiveResult = seen.has(trigger.id) ? 'duplicate' : 'stored'
      seen.add(trigger.id)
      results.push(result)
      return result
    },
    atomic: work => work(),
    state: {
      get: <V>(key: string) => store.get(key) as V | undefined,
      set: <V>(key: string, value: V | undefined) => {
        if (value === undefined) store.delete(key)
        else store.set(key, value)
      },
    },
    threads: {
      describe: (key, description) => {
        threads.push({ key, description })
      },
    },
    report: (entry, health) => {
      reports.push({ entry, health })
    },
  }
  return { ctx, triggers, results, threads, reports, calls }
}

function config(overrides: Partial<Config> = {}): Config {
  return {
    enabled: true,
    checkout: CHECKOUT,
    intervalSeconds: 300,
    branch: BRANCH,
    graceMinutes: 15,
    ...overrides,
  }
}

function workflowRuns(run: Record<string, unknown>): string {
  return JSON.stringify([run])
}

function redRun(ageMs: number, overrides: Record<string, unknown> = {}): string {
  return workflowRuns({
    conclusion: 'failure',
    status: 'completed',
    headSha: SHA,
    url: RUN_URL,
    updatedAt: new Date(NOW - ageMs).toISOString(),
    ...overrides,
  })
}

/** The single element of a one-element collection, narrowed for strict mode. */
function only<T>(items: T[]): T {
  expect(items).toHaveLength(1)
  const [item] = items
  if (item === undefined) throw new Error('expected exactly one item')
  return item
}

const signal = new AbortController().signal

describe('studio-ci source kind', () => {
  it('declares kind, health entry, fields and scope', () => {
    expect(kind.kind).toBe('studio-ci')
    expect(kind.health).toEqual(['studio-ci'])
    expect(kind.fields.map(field => field.key)).toEqual([
      'enabled', 'checkout', 'intervalSeconds', 'branch', 'graceMinutes',
    ])
    expect(kind.scope?.({ meta: {} }, config())).toEqual({
      listened: true, observed: true, row: 'studio',
    })
  })

  it('parses strict config with the documented defaults and bounds', () => {
    expect(kind.schema.parse({})).toEqual({
      enabled: true,
      checkout: '',
      intervalSeconds: 300,
      branch: 'main',
      graceMinutes: 15,
    })
    expect(kind.schema.parse({ graceMinutes: 0 }).graceMinutes).toBe(0)
    expect(kind.schema.parse({ intervalSeconds: 86_400 }).intervalSeconds).toBe(86_400)
    expect(() => kind.schema.parse({ intervalSeconds: 59 })).toThrow()
    expect(() => kind.schema.parse({ intervalSeconds: 86_401 })).toThrow()
    expect(() => kind.schema.parse({ graceMinutes: -1 })).toThrow()
    expect(() => kind.schema.parse({ graceMinutes: 1441 })).toThrow()
    expect(() => kind.schema.parse({ unknownKey: true })).toThrow()
  })

  it('declares the studio policy part with allowed and bots defaults', () => {
    const policy = kind.policy
    if (policy === undefined) throw new Error('expected a policy part')
    expect(policy.schema.parse({})).toEqual({
      allowed: [],
      bots: [{ id: 'studio-producer', name: 'Studio producer' }],
    })
    expect(policy.rows?.({})).toEqual([{
      id: 'studio',
      label: 'Studio producer',
      note: { zh: '工作室制作人产生的检查项', en: 'Findings produced by the studio producer' },
      cells: { listedUnaddressed: false, unlistedAddressed: false, unlistedUnaddressed: false },
    }])
  })
})

describe('studio-ci runCheck', () => {
  it('reads the latest run on the configured branch through gh', async () => {
    const harness = makeHarness(redRun(16 * MINUTE))
    await runCheck(harness.ctx, config(), signal, NOW)
    expect(harness.calls).toEqual([{
      program: 'gh',
      args: [
        'run', 'list', '--branch', BRANCH, '--limit', '1',
        '--json', 'conclusion,status,headSha,url,updatedAt',
      ],
      cwd: CHECKOUT,
    }])
  })

  it('raises one stable candidate once a failure outlives the grace window', async () => {
    const harness = makeHarness(redRun(16 * MINUTE))

    const detail = await runCheck(harness.ctx, config(), signal, NOW)

    const trigger = only(harness.triggers)
    expect(trigger.source).toBe('studio-ci')
    expect(trigger.human).toBe(false)
    expect(trigger.channel).toBeUndefined()
    expect(trigger.actor).toEqual({ source: 'studio-ci', id: 'studio-producer' })
    expect(trigger.threads).toEqual([{ source: 'studio-ci', id: `ci-red:${SHA}` }])
    expect(trigger.at).toBe(new Date(NOW).toISOString())
    expect(trigger.meta).toMatchObject({
      check: 'ci-red',
      subject: SHA,
      fingerprint: `${SHA}:failure:${new Date(NOW - 16 * MINUTE).toISOString()}`,
      url: RUN_URL,
      conclusion: 'failure',
      branch: BRANCH,
    })
    expect(trigger.text).toContain('failure')
    expect(trigger.text).toContain(BRANCH)
    expect(trigger.text).toContain(RUN_URL)
    expect(detail).toContain('failure')
    expect(detail).toContain(BRANCH)

    const thread = only(harness.threads)
    expect(thread.key).toBe(`studio-ci:ci-red:${SHA}`)
    expect(thread.description.facts).toEqual({ branch: { value: BRANCH }, conclusion: { value: 'failure' }, subject: { value: SHA } })
    expect(thread.description.url).toBe(RUN_URL)

    // The same red state on a later poll reuses the id, so the engine drops it.
    await runCheck(harness.ctx, config(), signal, NOW + MINUTE)
    expect(harness.triggers).toHaveLength(2)
    expect(harness.triggers[1]?.id).toBe(trigger.id)
    expect(harness.triggers[1]?.meta.fingerprint).toBe(`${SHA}:failure:${new Date(NOW - 16 * MINUTE).toISOString()}`)
    expect(harness.results).toEqual(['stored', 'duplicate'])
  })

  it('stays quiet while the failure is still inside the grace window', async () => {
    const harness = makeHarness(redRun(5 * MINUTE))

    const detail = await runCheck(harness.ctx, config(), signal, NOW)

    expect(harness.triggers).toHaveLength(0)
    expect(harness.threads).toHaveLength(0)
    expect(detail).toContain('grace window')
  })

  it('emits at exactly the grace boundary', async () => {
    const harness = makeHarness(redRun(15 * MINUTE))

    await runCheck(harness.ctx, config(), signal, NOW)

    expect(harness.triggers).toHaveLength(1)
    expect(harness.triggers[0]?.meta.fingerprint).toBe(`${SHA}:failure:${new Date(NOW - 15 * MINUTE).toISOString()}`)
  })

  it('does nothing for a successful run', async () => {
    const harness = makeHarness(redRun(30 * MINUTE, { conclusion: 'success' }))

    const detail = await runCheck(harness.ctx, config(), signal, NOW)

    expect(harness.triggers).toHaveLength(0)
    expect(harness.threads).toHaveLength(0)
    expect(detail).toContain('success')
  })

  it('reports no workflow runs when the branch has none', async () => {
    const harness = makeHarness('[]')

    const detail = await runCheck(harness.ctx, config(), signal, NOW)

    expect(detail).toBe('no workflow runs')
    expect(harness.triggers).toHaveLength(0)
    expect(harness.threads).toHaveLength(0)
  })

  it('does not raise a candidate when the red run has no usable timestamp', async () => {
    const harness = makeHarness(workflowRuns({
      conclusion: 'timed_out',
      status: 'completed',
      headSha: SHA,
      url: RUN_URL,
    }))

    const detail = await runCheck(harness.ctx, config(), signal, NOW)

    expect(harness.triggers).toHaveLength(0)
    expect(detail).toContain('timestamp')
  })

  it('falls back to an unknown subject when the run has no head SHA', async () => {
    const harness = makeHarness(workflowRuns({
      conclusion: 'cancelled',
      status: 'completed',
      url: RUN_URL,
      updatedAt: new Date(NOW - 60 * MINUTE).toISOString(),
    }))

    await runCheck(harness.ctx, config(), signal, NOW)

    const trigger = only(harness.triggers)
    expect(trigger.meta.fingerprint).toBe(`unknown:cancelled:${new Date(NOW - 60 * MINUTE).toISOString()}`)
    expect(trigger.threads).toEqual([{ source: 'studio-ci', id: 'ci-red:unknown' }])
    expect(only(harness.threads).key).toBe('studio-ci:ci-red:unknown')
  })
})
