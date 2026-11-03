import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PRODUCER_BOT } from '../src/shared/actor.ts'
import { evidenceDir, listFiles, loadStudio } from '../src/shared/studio.ts'
import type { Studio } from '../src/shared/studio.ts'
import type {
  Health,
  SourceContext,
  SourceKind,
  ThreadDescription,
  Trigger,
} from '../src/shared/superagent.ts'
import { ConfigSchema, apply, inject, kind, name, runCheck } from '../src/producer/evidence/index.ts'

interface FakeSource {
  ctx: SourceContext
  triggers: Trigger[]
  described: Array<{ key: string; description: ThreadDescription }>
  health: Array<{ entry: string; health: Health }>
}

/** A SourceContext that records receives, thread descriptions and health reports. */
function fakeSource(config: Record<string, unknown> | undefined): FakeSource {
  const state = new Map<string, unknown>()
  const fake: FakeSource = {
    triggers: [],
    described: [],
    health: [],
    ctx: {
      commands: {
        run: async (program, args) => {
          throw new Error(`unexpected command: ${program} ${args.join(' ')}`)
        },
      },
      ready: Promise.resolve(),
      configured: () => true,
      config: <C extends Record<string, unknown>>() => config as unknown as C | undefined,
      receive: (trigger: Trigger) => {
        fake.triggers.push(trigger)
        return 'stored'
      },
      atomic: <T>(work: () => T): T => work(),
      state: {
        get: <V>(key: string): V | undefined => state.get(key) as V | undefined,
        set: <V>(key: string, value: V | undefined): void => {
          if (value === undefined) state.delete(key)
          else state.set(key, value)
        },
      },
      threads: {
        describe: (key: string, description: ThreadDescription) => {
          fake.described.push({ key, description })
        },
      },
      report: (entry: string, health: Health) => {
        fake.health.push({ entry, health })
      },
    },
  }
  return fake
}

const CONFIG = { enabled: true, checkout: '', intervalSeconds: 600 }

async function writeStory(root: string, slug: string, status: string, title: string): Promise<void> {
  await writeFile(join(root, 'production', 'stories', `${slug}.md`), [
    '---',
    `status: ${status}`,
    'updated: 2026-01-02',
    '---',
    `# ${title}`,
    '',
    '## Acceptance',
    '- It works.',
    '',
  ].join('\n'), 'utf8')
}

async function writeStudioYaml(root: string): Promise<void> {
  await writeFile(join(root, 'studio.yaml'), [
    'studio: Test Studio',
    'story_dir: production/stories',
    'evidence_dir: production/qa/evidence',
  ].join('\n'), 'utf8')
}

function loadedStudio(root: string): Studio {
  const studio = loadStudio(root)
  if (studio === undefined) throw new Error('fixture is missing studio.yaml')
  return studio
}

function firstTrigger(fake: FakeSource): Trigger {
  const trigger = fake.triggers[0]
  if (trigger === undefined) throw new Error('expected a trigger')
  return trigger
}

/** Wait until the polling loop has reported at least one health entry. */
async function until(predicate: () => boolean, timeoutMs = 3000): Promise<void> {
  const started = Date.now()
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error('timed out waiting for condition')
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}

describe('source-evidence kind', () => {
  it('declares the studio-evidence kind with a strict, defaulted config', () => {
    expect(kind.kind).toBe('studio-evidence')
    expect(kind.health).toEqual(['studio-evidence'])
    expect(name).toBe('dsh-game-studio/source-evidence')
    expect(inject).toEqual(['orchestrator'])

    expect(ConfigSchema.parse({})).toEqual({ enabled: true, checkout: '', intervalSeconds: 600 })
    expect(ConfigSchema.parse({ checkout: 'C:/repo' }).checkout).toBe('C:/repo')
    expect(() => ConfigSchema.parse({ intervalSeconds: 59 })).toThrow()
    expect(() => ConfigSchema.parse({ intervalSeconds: 86_401 })).toThrow()
    expect(() => ConfigSchema.parse({ intervalSeconds: 60.5 })).toThrow()
    expect(() => ConfigSchema.parse({ unknown: true })).toThrow()

    expect(kind.scope?.({ meta: {} }, { enabled: true, checkout: '', intervalSeconds: 600 }))
      .toEqual({ listened: true, observed: true, row: 'studio' })

    const policy = kind.policy
    expect(policy).toBeDefined()
    expect(policy?.schema.parse({})).toEqual({ allowed: [], bots: [PRODUCER_BOT] })
    expect(policy?.rows?.({})).toEqual([{
      id: 'studio',
      label: 'Studio producer',
      note: { zh: '工作室制作人产生的检查项', en: 'Findings produced by the studio producer' },
      cells: { listedUnaddressed: false, unlistedAddressed: false, unlistedUnaddressed: false },
    }])
  })
})

describe('runCheck', () => {
  let root = ''

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'studio-evidence-'))
    await mkdir(join(root, 'production', 'stories'), { recursive: true })
    await writeStudioYaml(root)
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
    root = ''
  })

  it('reports a done story with an empty evidence directory, with a stable id', async () => {
    await writeStory(root, 'login-flow', 'done', 'Login flow')
    await mkdir(join(root, 'production', 'qa', 'evidence', 'login-flow'), { recursive: true })

    const fake = fakeSource({ ...CONFIG, checkout: root })
    const config = ConfigSchema.parse({ checkout: root })
    const dir = evidenceDir(root, loadedStudio(root), 'login-flow')

    const detail = await runCheck(fake.ctx, config, new AbortController().signal)
    await runCheck(fake.ctx, config, new AbortController().signal)

    expect(fake.triggers).toHaveLength(2)
    const first = firstTrigger(fake)
    const second = fake.triggers[1]
    expect(second).toBeDefined()
    expect(second?.id).toBe(first.id)
    expect(first.source).toBe('studio-evidence')
    expect(first.human).toBe(false)
    expect(first.channel).toBeUndefined()
    expect(first.meta).toMatchObject({
      check: 'evidence-missing',
      subject: 'login-flow',
      story: 'production/stories/login-flow.md',
      evidence: 'production/qa/evidence/login-flow',
    })
    expect(typeof first.meta.fingerprint).toBe('string')
    expect(first.threads).toEqual([{ source: 'studio-evidence', id: 'evidence-missing:login-flow' }])

    expect(first.text).toContain('login-flow')
    expect(first.text).toContain('marked done')
    expect(first.text).toContain('cannot close it')
    expect(first.text).toContain('production/qa/evidence/login-flow')

    expect(fake.described.length).toBeGreaterThan(0)
    const described = fake.described[0]
    expect(described?.key).toBe('studio-evidence:evidence-missing:login-flow')
    expect(described?.description.facts).toEqual({ story: { value: 'login-flow' } })
    expect(described?.description.label).toContain('login-flow')

    expect(detail).toBe('checked 1 story, 1 finding')
  })

  it('stops reporting once the evidence directory has a file', async () => {
    await writeStory(root, 'login-flow', 'done', 'Login flow')
    await writeStory(root, 'pause-menu', 'ready', 'Pause menu')
    const dir = join(root, 'production', 'qa', 'evidence', 'login-flow')
    await mkdir(dir, { recursive: true })

    const fake = fakeSource({ ...CONFIG, checkout: root })
    const config = ConfigSchema.parse({ checkout: root })

    const before = await runCheck(fake.ctx, config, new AbortController().signal)
    expect(fake.triggers).toHaveLength(1)
    expect(before).toBe('checked 2 stories, 1 finding')

    await writeFile(join(dir, 'index.md'), 'Run result: OBSERVED - login screen\n', 'utf8')
    expect(listFiles(dir)).toEqual(['index.md'])

    const after = await runCheck(fake.ctx, config, new AbortController().signal)
    expect(fake.triggers).toHaveLength(1)
    expect(after).toBe('checked 2 stories, 0 findings')
  })

  it('reports nothing for a ready story and nothing when evidence exists', async () => {
    await writeStory(root, 'pause-menu', 'ready', 'Pause menu')
    await writeStory(root, 'settings', 'done', 'Settings')
    await mkdir(join(root, 'production', 'qa', 'evidence', 'settings'), { recursive: true })
    await writeFile(join(root, 'production', 'qa', 'evidence', 'settings', 'index.md'), 'Run result: OBSERVED - settings screen\n', 'utf8')

    const fake = fakeSource({ ...CONFIG, checkout: root })
    const detail = await runCheck(fake.ctx, ConfigSchema.parse({ checkout: root }), new AbortController().signal)

    expect(fake.triggers).toEqual([])
    expect(fake.described).toEqual([])
    expect(detail).toBe('checked 2 stories, 0 findings')
  })

  it('returns no studio.yaml when the checkout has no studio contract', async () => {
    await rm(join(root, 'studio.yaml'))
    const fake = fakeSource({ ...CONFIG, checkout: root })
    const detail = await runCheck(fake.ctx, ConfigSchema.parse({ checkout: root }), new AbortController().signal)
    expect(detail).toBe('no studio.yaml')
    expect(fake.triggers).toEqual([])
  })

  it('does not receive anything when the signal is already aborted', async () => {
    await writeStory(root, 'login-flow', 'done', 'Login flow')
    await mkdir(join(root, 'production', 'qa', 'evidence', 'login-flow'), { recursive: true })
    const fake = fakeSource({ ...CONFIG, checkout: root })
    const controller = new AbortController()
    controller.abort()
    const detail = await runCheck(fake.ctx, ConfigSchema.parse({ checkout: root }), controller.signal)
    expect(detail).toBe('check aborted')
    expect(fake.triggers).toEqual([])
  })
})

describe('apply', () => {
  it('registers the kind and runs an abortable polling effect', async () => {
    const root = await mkdtemp(join(tmpdir(), 'studio-evidence-apply-'))
    try {
      await mkdir(join(root, 'production', 'stories'), { recursive: true })
      await writeStudioYaml(root)
      await writeStory(root, 'login-flow', 'done', 'Login flow')
      await mkdir(join(root, 'production', 'qa', 'evidence', 'login-flow'), { recursive: true })

      const fake = fakeSource({ enabled: true, checkout: root, intervalSeconds: 600 })
      const registered: SourceKind[] = []
      const unregistered: SourceKind[] = []
      const effects: Array<{ label?: string; dispose?: unknown }> = []

      const host = {
        effect: (run: () => unknown, label?: string): (() => void) => {
          const dispose = run()
          effects.push({ label, dispose })
          return () => {
            if (typeof dispose === 'function') (dispose as () => void)()
          }
        },
        on: () => undefined,
        logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
        orchestrator: {
          sources: {
            register: (registeredKind: SourceKind) => {
              registered.push(registeredKind)
              return () => {
                unregistered.push(registeredKind)
              }
            },
          },
          context: () => fake.ctx,
        },
      } as unknown as Context

      apply(host)

      expect(registered).toHaveLength(1)
      expect(registered[0]?.kind).toBe('studio-evidence')
      expect(effects).toHaveLength(2)
      expect(effects[0]?.label).toBe('studio-evidence: source kind')

      await until(() => fake.health.some(entry => entry.health.state === 'ready'))
      const ready = fake.health.find(entry => entry.health.state === 'ready')
      expect(ready?.entry).toBe('studio-evidence')
      expect(ready?.health.detail).toBe('checked 1 story, 1 finding')
      expect(fake.triggers).toHaveLength(1)

      const firstDispose = effects[0]?.dispose
      expect(typeof firstDispose).toBe('function')
      ;(firstDispose as () => void)()
      expect(unregistered).toHaveLength(1)

      const secondDispose = effects[1]?.dispose
      expect(typeof secondDispose).toBe('function')
      const started = Date.now()
      await (secondDispose as () => Promise<void>)()
      expect(Date.now() - started).toBeLessThan(2000)
      expect(fake.triggers).toHaveLength(1)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
