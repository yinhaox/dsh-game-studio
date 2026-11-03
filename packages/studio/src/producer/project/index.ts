import { exec, type ExecOptions } from 'node:child_process'
import { promisify } from 'node:util'
import type { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
import { PRODUCER_BOT } from '../../shared/actor.ts'
import '../../shared/context.ts'
import { pollSource } from '../../shared/poll.ts'
import { loadStudio, readProjectGodot } from '../../shared/studio.ts'
import type { SourceContext, SourceKind, ThreadFact, Trigger } from '../../shared/superagent.ts'
import { clipLines } from '../../shared/text.ts'
import { stableKey, studioTrigger } from '../../shared/trigger.ts'

const ConfigSchema = z.object({
  enabled: z.boolean().default(true),
  checkout: z.string().default(''),
  intervalSeconds: z.number().int().min(60).max(86_400).default(900),
  runCheck: z.boolean().default(true),
}).strict()

export type Config = z.infer<typeof ConfigSchema>

/** One finished check command: its exit code and the combined stdout/stderr. */
export interface ExecOutcome {
  code: number
  output: string
}

/** Runs a shell command in the checkout; injectable so tests never spawn a process. */
export type Execute = (command: string, cwd: string, signal: AbortSignal) => Promise<ExecOutcome>

const execAsync = promisify(exec) as unknown as (
  command: string,
  options: ExecOptions,
) => Promise<{ stdout: string; stderr: string }>

/**
 * Run one check command through a real shell. A non-zero exit is a result, not
 * an exception: only a spawn failure (bad `cwd`, missing shell, abort) rejects.
 */
export async function defaultExecute(command: string, cwd: string, signal: AbortSignal): Promise<ExecOutcome> {
  try {
    const result = await execAsync(command, {
      cwd,
      timeout: 120_000,
      maxBuffer: 1024 * 1024,
      signal,
      windowsHide: true,
    })
    return { code: 0, output: `${result.stdout}${result.stderr}` }
  } catch (error) {
    const failure = error as {
      code?: unknown
      stdout?: string
      stderr?: string
      killed?: boolean
      signal?: string | null
    }
    const output = `${failure.stdout ?? ''}${failure.stderr ?? ''}`
    if (typeof failure.code === 'number') return { code: failure.code, output }
    // A killed process (timeout or maxBuffer) ran and produced output; report it as 124.
    if (failure.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') return { code: 124, output }
    // Killed by the timeout/maxBuffer limits: the command ran, so report 124.
    if (failure.killed === true || (failure.signal ?? null) !== null) return { code: 124, output }
    throw error
  }
}

interface VersionParts {
  major: string
  minor?: string
}

function parseVersion(version: string | undefined): VersionParts | undefined {
  const match = /^\s*v?(\d+)(?:\.(\d+))?/.exec(version ?? '')
  const major = match?.[1]
  if (major === undefined) return undefined
  const minor = match?.[2]
  return minor === undefined ? { major } : { major, minor }
}

/**
 * True when the project engine and the studio-pinned engine disagree on the
 * major.minor prefix (`4.4` vs `4.3`). A version with no minor part only
 * compares its major, and an unreadable version never counts as a mismatch.
 */
export function versionMismatch(projectVersion: string | undefined, studioVersion: string | undefined): boolean {
  const project = parseVersion(projectVersion)
  const studio = parseVersion(studioVersion)
  if (project === undefined || studio === undefined) return false
  if (project.major !== studio.major) return true
  return project.minor !== undefined && studio.minor !== undefined && project.minor !== studio.minor
}

export const kind: SourceKind<Config> = {
  kind: 'studio-project',
  title: { zh: '项目检查', en: 'Project checks' },
  description: {
    zh: '读取 project.godot 与 studio.yaml，报告引擎版本不一致或检查命令失败。',
    en: 'Reads project.godot and studio.yaml and reports engine version drift or a failing check command.',
  },
  schema: ConfigSchema,
  fields: [
    { key: 'enabled', type: 'switch', label: { zh: '启用', en: 'Enabled' } },
    { key: 'checkout', type: 'text', label: { zh: '仓库路径', en: 'Checkout path' } },
    { key: 'intervalSeconds', type: 'number', min: 60, max: 86_400, label: { zh: '间隔', en: 'Interval' } },
    { key: 'runCheck', type: 'switch', label: { zh: '执行检查命令', en: 'Run the check command' } },
  ],
  health: ['studio-project'],
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
    rows: () => [{ id: 'studio', label: 'Studio producer',
      note: { zh: '工作室制作人产生的检查项', en: 'Findings produced by the studio producer' },
      cells: { listedUnaddressed: false, unlistedAddressed: false, unlistedUnaddressed: false } }],
  },
}

async function emit(ctx: SourceContext, trigger: Trigger, label: string, facts: Record<string, ThreadFact | null>): Promise<void> {
  await ctx.receive(trigger)
  const thread = trigger.threads[0]
  if (thread !== undefined) ctx.threads.describe(`${trigger.source}:${thread.id}`, { label, facts })
}

/**
 * Compare the Godot project with `studio.yaml` and, when asked, run the check
 * command. Emits at most one trigger per distinct condition and returns a
 * one-line health detail.
 */
export async function runProjectCheck(
  ctx: SourceContext,
  config: Config,
  signal: AbortSignal,
  execute: Execute = defaultExecute,
): Promise<string> {
  const root = config.checkout.length > 0 ? config.checkout : '.'
  const studio = loadStudio(config.checkout)
  if (studio === undefined) return `no studio.yaml in ${root}`
  const project = readProjectGodot(config.checkout)
  if (project === undefined) return `no project.godot in ${root}`

  const projectVersion = project.version
  const studioVersion = studio.godot.version
  let mismatch: string | undefined
  if (projectVersion !== undefined && studioVersion !== undefined && versionMismatch(projectVersion, studioVersion)) {
    mismatch = `${projectVersion}->${studioVersion}`
    const trigger = studioTrigger({
      kind: kind.kind,
      check: 'engine-mismatch',
      subject: mismatch,
      fingerprint: mismatch,
      text: `[studio] Godot engine mismatch: project.godot declares ${projectVersion} but studio.yaml godot.version is ${studioVersion}. Align the engine version before work that depends on it.`,
      meta: { projectVersion, studioVersion, checkout: config.checkout },
    })
    await emit(ctx, trigger, `Engine mismatch ${mismatch}`, {
      projectVersion: { value: projectVersion },
      studioVersion: { value: studioVersion },
    })
  }

  if (!config.runCheck) {
    return mismatch === undefined ? 'check disabled' : `engine mismatch ${mismatch}; check disabled`
  }

  const command = studio.check_command?.trim() ?? ''
  if (command.length === 0) return 'no check_command configured'

  const result = await execute(command, config.checkout, signal)
  if (result.code === 0) {
    return mismatch === undefined ? 'check passed' : `engine mismatch ${mismatch}; check passed`
  }

  const subject = command.split(/\s+/)[0] ?? command
  const output = result.output.trim()
  const body = output.length > 0 ? clipLines(output, 20) : '(no output)'
  const trigger = studioTrigger({
    kind: kind.kind,
    check: 'check-failed',
    subject,
    fingerprint: stableKey(result.code, result.output.slice(0, 200)),
    text: `[studio] Check command failed (exit ${result.code}): ${command}\n\n\`\`\`text\n${body}\n\`\`\``,
    meta: { command, exitCode: result.code, output: clipLines(result.output, 20) },
  })
  await emit(ctx, trigger, `Check failed: ${subject}`, {
    command: { value: command },
    exitCode: { value: String(result.code) },
  })
  return mismatch === undefined ? `check failed (exit ${result.code})` : `engine mismatch ${mismatch}; check failed (exit ${result.code})`
}

export const name = 'dsh-game-studio/source-project'
export const inject = ['orchestrator']

export function apply(ctx: Context): void {
  ctx.effect(() => ctx.orchestrator.sources.register(kind), 'studio-project: source kind')
  ctx.effect(() => {
    const source = ctx.orchestrator.context(kind)
    const controller = new AbortController()
    const running = pollSource<Config>(source, {
      kind: kind.kind,
      healthEntry: 'studio-project',
      intervalSeconds: config => config?.intervalSeconds ?? 900,
      enabled: config => config.enabled && config.checkout.length > 0,
      run: (config, signal) => runProjectCheck(source, config, signal),
    }, controller.signal).catch((error: unknown) => {
      source.report('studio-project', { state: 'error', detail: String(error) })
    })
    return async () => {
      controller.abort()
      await running
    }
  }, 'studio-project: checks')
}
