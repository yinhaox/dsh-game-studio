import type { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
import { PRODUCER_BOT } from '../../shared/actor.ts'
import '../../shared/context.ts'
import { pollSource } from '../../shared/poll.ts'
import { closingEvidence, evidenceDir, listStories, loadStudio, repoPath } from '../../shared/studio.ts'
import type { Story } from '../../shared/studio.ts'
import { oneLine } from '../../shared/text.ts'
import { stableKey, studioTrigger } from '../../shared/trigger.ts'
import type { SourceContext, SourceKind } from '../../shared/superagent.ts'

/** The one check this Source performs; stable across releases. */
const CHECK = 'evidence-missing'

export const ConfigSchema = z.object({
  enabled: z.boolean().default(true),
  checkout: z.string().default(''),
  intervalSeconds: z.number().int().min(60).max(86_400).default(600),
}).strict()

export type Config = z.infer<typeof ConfigSchema>

export const kind: SourceKind<Config> = {
  kind: 'studio-evidence',
  title: { zh: '工作室证据检查', en: 'Studio evidence checks' },
  description: {
    zh: '检查已标记完成的故事是否在证据目录里留有 QA 证据（截图、index.md）。',
    en: 'Reports stories marked done whose QA evidence directory has no files.',
  },
  schema: ConfigSchema,
  fields: [
    { key: 'enabled', type: 'switch', label: { zh: '启用', en: 'Enabled' } },
    { key: 'checkout', type: 'text', label: { zh: '仓库路径', en: 'Checkout path' } },
    { key: 'intervalSeconds', type: 'number', min: 60, max: 86_400, label: { zh: '间隔', en: 'Interval' } },
  ],
  health: ['studio-evidence'],
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

/** The finding text: names the story, its done status, and why the evidence cannot close it. */
function evidenceText(story: Story, dir: string, reason: string): string {
  return oneLine(
    `Story "${story.slug}" is marked done but its evidence cannot close it: ${reason}. `
    + `Write Run result: OBSERVED - <what was on screen> in ${dir}/index.md and commit the capture, `
    + 'or reopen the story until the evidence exists.',
    500,
  )
}

/** Count one noun phrase with correct singular/plural. */
function counted(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`
}

/**
 * Report every story whose `status` is `done` while its evidence directory is
 * empty. The fingerprint is the story's content and status, so a standing
 * condition keeps its id across clones and checkouts, while editing the story
 * (or adding evidence, which removes the finding) changes it.
 */
export async function runCheck(ctx: SourceContext, config: Config, signal: AbortSignal): Promise<string> {
  if (signal.aborted) return 'check aborted'
  const studio = loadStudio(config.checkout)
  if (studio === undefined) return 'no studio.yaml'
  const stories = listStories(config.checkout, studio)
  let findings = 0
  for (const story of stories) {
    if (signal.aborted) return 'check aborted'
    if (story.status !== 'done') continue
    const dir = evidenceDir(config.checkout, studio, story.slug)
    const evidence = closingEvidence(dir)
    if (evidence.ok) continue
    const shownDir = repoPath(studio.evidence_dir, story.slug)
    const shownStory = repoPath(studio.story_dir, `${story.slug}.md`)
    await ctx.receive(studioTrigger({
      kind: kind.kind,
      check: CHECK,
      subject: story.slug,
      fingerprint: stableKey(story.body, story.status),
      text: evidenceText(story, shownDir, evidence.reason ?? 'no usable evidence'),
      meta: { story: shownStory, evidence: shownDir, reason: evidence.reason ?? null },
    }))
    ctx.threads.describe(`${kind.kind}:${CHECK}:${story.slug}`, {
      label: `Missing QA evidence: ${story.slug}`,
      facts: { story: { value: story.slug } },
    })
    findings += 1
  }
  return `checked ${counted(stories.length, 'story', 'stories')}, ${counted(findings, 'finding', 'findings')}`
}

export const name = 'dsh-game-studio/source-evidence'
export const inject = ['orchestrator']

export function apply(ctx: Context): void {
  ctx.effect(() => ctx.orchestrator.sources.register(kind), 'studio-evidence: source kind')
  ctx.effect(() => {
    const source = ctx.orchestrator.context(kind)
    const controller = new AbortController()
    const running = pollSource<Config>(source, {
      kind: kind.kind,
      healthEntry: 'studio-evidence',
      intervalSeconds: config => config?.intervalSeconds ?? 600,
      enabled: config => config.enabled && config.checkout.length > 0,
      run: (config, signal) => runCheck(source, config, signal),
    }, controller.signal).catch((error: unknown) => {
      source.report('studio-evidence', { state: 'error', detail: String(error) })
    })
    return async () => {
      controller.abort()
      await running
    }
  }, 'studio-evidence: checks')
}
