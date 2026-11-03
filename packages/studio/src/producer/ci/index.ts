/**
 * The `studio-ci` Source: watches the latest workflow run on the configured
 * branch and raises one candidate per red state once the run has been red for
 * longer than the grace window. A re-run or a fix changes the fingerprint, so
 * the engine lets the new state through and drops the standing one.
 */
import type { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
import { PRODUCER_BOT } from '../../shared/actor.ts'
import { isFailingConclusion, latestWorkflowRun } from '../../shared/gh.ts'
import { pollSource } from '../../shared/poll.ts'
import { oneLine } from '../../shared/text.ts'
import { studioTrigger } from '../../shared/trigger.ts'
import type { SourceContext, SourceKind } from '../../shared/superagent.ts'
import '../../shared/context.ts'

/** Configuration of the CI Source, strict so typos in a profile patch fail loudly. */
const ConfigSchema = z.object({
  enabled: z.boolean().default(true),
  checkout: z.string().default(''),
  intervalSeconds: z.number().int().min(60).max(86_400).default(300),
  branch: z.string().default('main'),
  graceMinutes: z.number().int().min(0).max(1440).default(15),
}).strict()

export type Config = z.infer<typeof ConfigSchema>

/** The check name this Source reports; it is stable across releases. */
const CHECK = 'ci-red'

/** The health entry this Source owns. */
const HEALTH = 'studio-ci'

export const kind: SourceKind<Config> = {
  kind: HEALTH,
  title: { zh: '工作室 CI 检查', en: 'Studio CI checks' },
  description: {
    zh: '读取分支上最近一次工作流运行；失败持续超过宽限期后产生一个推断候选。',
    en: 'Reads the latest workflow run on a branch and proposes one inferred candidate once a failure outlives the grace window.',
  },
  schema: ConfigSchema,
  fields: [
    { key: 'enabled', type: 'switch', label: { zh: '启用', en: 'Enabled' } },
    { key: 'checkout', type: 'text', label: { zh: '仓库路径', en: 'Checkout path' },
      hint: { zh: '执行 gh 命令的目录', en: 'The directory gh commands run in' }, pattern: '^.*$' },
    { key: 'intervalSeconds', type: 'number', min: 60, max: 86_400,
      label: { zh: '轮询间隔', en: 'Interval' }, hint: { zh: '秒', en: 'Seconds' } },
    { key: 'branch', type: 'text', label: { zh: '分支', en: 'Branch' }, pattern: '^.*$' },
    { key: 'graceMinutes', type: 'number', min: 0, max: 1440,
      label: { zh: '宽限期', en: 'Grace period' }, hint: { zh: '分钟', en: 'Minutes' } },
  ],
  health: [HEALTH],
  scope: () => ({ listened: true, observed: true, row: 'studio' }),
  policy: {
    schema: z.object({
      allowed: z.array(z.object({ id: z.string(), name: z.string().optional() }).strict()).default([]),
      bots: z.array(z.object({ id: z.string(), name: z.string().optional() }).strict()).default([PRODUCER_BOT]),
    }).strict(),
    fields: [
      { key: 'allowed', type: 'rows', label: { zh: '可发起工作的人', en: 'People who may originate work' },
        columns: [{ key: 'id', type: 'text', label: { zh: 'ID', en: 'ID' } }] },
      { key: 'bots', type: 'rows', label: { zh: '可作为候选的机器人', en: 'Bots whose messages may become candidates' },
        columns: [{ key: 'id', type: 'text', label: { zh: 'ID', en: 'ID' } }] },
    ],
    explicit: { zh: '不适用：该来源只产生推断候选。', en: 'Not applicable: this Source only produces inferred candidates.' },
    rows: () => [{
      id: 'studio',
      label: 'Studio producer',
      note: { zh: '工作室制作人产生的检查项', en: 'Findings produced by the studio producer' },
      cells: { listedUnaddressed: false, unlistedAddressed: false, unlistedUnaddressed: false },
    }],
  },
}

/**
 * One polling round: read the latest run on the branch and raise a candidate
 * when it has been red for longer than the grace window. `now` is injectable so
 * the grace decision is testable without waiting.
 */
export async function runCheck(
  ctx: SourceContext,
  config: Config,
  signal: AbortSignal,
  now: number = Date.now(),
): Promise<string> {
  signal.throwIfAborted()
  const commands = ctx.commands.withSignal ? ctx.commands.withSignal(signal) : ctx.commands
  const run = await latestWorkflowRun(commands, config.checkout, config.branch)
  signal.throwIfAborted()
  if (run === undefined) return 'no workflow runs'

  const conclusion = run.conclusion ?? run.status ?? 'unknown'
  if (!isFailingConclusion(run.conclusion)) {
    return oneLine(`latest run ${conclusion} on ${config.branch} is not failing`)
  }

  const updated = Date.parse(run.updatedAt ?? '')
  if (!Number.isFinite(updated)) {
    return oneLine(`latest run ${conclusion} on ${config.branch} has no usable timestamp`)
  }
  const age = now - updated
  if (age < config.graceMinutes * 60_000) {
    return oneLine(`latest run ${conclusion} on ${config.branch} within the ${config.graceMinutes}m grace window`)
  }

  const subject = run.headSha !== undefined && run.headSha.length > 0 ? run.headSha : 'unknown'
  const url = run.url ?? ''
  const fingerprint = `${subject}:${conclusion}:${run.updatedAt ?? ''}`
  const text = oneLine(`CI ${conclusion} on branch ${config.branch} at ${subject}${url.length > 0 ? `: ${url}` : ''}`)

  await ctx.receive(studioTrigger({
    kind: kind.kind,
    check: CHECK,
    subject,
    fingerprint,
    text,
    at: new Date(now).toISOString(),
    meta: { url, conclusion, branch: config.branch },
  }))
  ctx.threads.describe(`${kind.kind}:${CHECK}:${subject}`, {
    label: `CI ${conclusion} on ${config.branch}`,
    ...url.length > 0 ? { url } : {},
    facts: {
      branch: { value: config.branch },
      conclusion: { value: conclusion },
      subject: { value: subject },
    },
  })
  return oneLine(`CI ${conclusion} on ${config.branch} at ${subject}`)
}

export const name = 'dsh-game-studio/source-ci'
export const inject = ['orchestrator']

export function apply(ctx: Context): void {
  ctx.effect(() => ctx.orchestrator.sources.register(kind), 'studio-ci: source kind')
  ctx.effect(() => {
    const source = ctx.orchestrator.context(kind)
    const controller = new AbortController()
    const running = pollSource<Config>(source, {
      kind: kind.kind,
      healthEntry: HEALTH,
      intervalSeconds: config => config?.intervalSeconds ?? 300,
      enabled: config => config.enabled && config.checkout.length > 0,
      run: (config, signal) => runCheck(source, config, signal),
    }, controller.signal).catch((error: unknown) => {
      source.report(HEALTH, { state: 'error', detail: String(error) })
    })
    return async () => {
      controller.abort()
      await running
    }
  }, 'studio-ci: checks')
}
