import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  kind,
  runProjectCheck,
  versionMismatch,
  type Config,
  type Execute,
} from '../src/producer/project/index.ts'
import type { Health, SourceContext, Trigger } from '../src/shared/superagent.ts'
import { stableKey } from '../src/shared/trigger.ts'

const PROJECT_GODOT = `config_version=5

[application]

config/name="Studio Test"
run/main_scene="res://scenes/main.tscn"
config/features=PackedStringArray("4.4", "Forward Plus")

[autoload]

StudioCapture="*res://addons/studio_capture/capture.gd"
`

const created: string[] = []

afterEach(async () => {
  await Promise.all(created.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

function studioYaml(options: { version?: string; check?: string } = {}): string {
  const lines = [
    'studio: Test Studio',
    'godot:',
    `  version: "${options.version ?? '4.4'}"`,
  ]
  if (options.check !== undefined) lines.push(`check_command: ${options.check}`)
  return `${lines.join('\n')}\n`
}

async function makeCheckout(
  studio: { version?: string; check?: string } = {},
  projectVersion = '4.4',
): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'studio-project-'))
  created.push(dir)
  const project = PROJECT_GODOT.replace('PackedStringArray("4.4"', `PackedStringArray("${projectVersion}"`)
  await writeFile(join(dir, 'project.godot'), project, 'utf8')
  await writeFile(join(dir, 'studio.yaml'), studioYaml(studio), 'utf8')
  return dir
}

function projectConfig(checkout: string, overrides: Partial<Config> = {}): Config {
  return { enabled: true, checkout, intervalSeconds: 900, runCheck: true, ...overrides }
}

function fakeExecute(code: number, output: string): { execute: Execute; calls: Array<{ command: string; cwd: string }> } {
  const calls: Array<{ command: string; cwd: string }> = []
  return {
    calls,
    execute: (command, cwd) => {
      calls.push({ command, cwd })
      return Promise.resolve({ code, output })
    },
  }
}

interface Harness {
  ctx: SourceContext
  received: Trigger[]
  described: Array<{ key: string; label?: string }>
  reported: Array<{ entry: string; health: Health }>
}

function harness(): Harness {
  const received: Trigger[] = []
  const described: Array<{ key: string; label?: string }> = []
  const reported: Array<{ entry: string; health: Health }> = []
  const state = new Map<string, unknown>()
  const ctx: SourceContext = {
    commands: { run: () => Promise.reject(new Error('the project Source must not use ctx.commands')) },
    ready: Promise.resolve(),
    configured: () => true,
    config: () => undefined,
    receive: trigger => {
      received.push(trigger)
      return 'stored'
    },
    atomic: work => work(),
    state: {
      get<V>(key: string): V | undefined {
        return state.get(key) as V | undefined
      },
      set<V>(key: string, value: V | undefined): void {
        if (value === undefined) state.delete(key)
        else state.set(key, value)
      },
    },
    threads: {
      describe: (key, description) => {
        described.push({ key, ...description.label !== undefined ? { label: description.label } : {} })
      },
    },
    report: (entry, health) => {
      reported.push({ entry, health })
    },
  }
  return { ctx, received, described, reported }
}

describe('studio-project kind', () => {
  it('declares the studio-project kind with strict config defaults and one health entry', () => {
    expect(kind.kind).toBe('studio-project')
    expect(kind.health).toEqual(['studio-project'])
    expect(kind.schema.parse({})).toEqual({ enabled: true, checkout: '', intervalSeconds: 900, runCheck: true })
    expect(() => kind.schema.parse({ enabled: true, checkout: '', intervalSeconds: 900, runCheck: true, extra: 'no' })).toThrow()
    expect(kind.schema.safeParse({ intervalSeconds: 59 }).success).toBe(false)
    expect(kind.schema.safeParse({ intervalSeconds: 86_401 }).success).toBe(false)
    expect(kind.scope?.({ meta: {} }, kind.schema.parse({}))).toEqual({ listened: true, observed: true, row: 'studio' })
    const policy = kind.policy
    expect(policy?.schema.parse({})).toEqual({
      allowed: [],
      bots: [{ id: 'studio-producer', name: 'Studio producer' }],
    })
    expect(policy?.rows?.(kind.schema.parse({}) as unknown as Record<string, unknown>)).toEqual([
      {
        id: 'studio',
        label: 'Studio producer',
        note: { zh: '工作室制作人产生的检查项', en: 'Findings produced by the studio producer' },
        cells: { listedUnaddressed: false, unlistedAddressed: false, unlistedUnaddressed: false },
      },
    ])
  })
})

describe('versionMismatch', () => {
  it('compares major.minor prefixes', () => {
    expect(versionMismatch('4.4', '4.3')).toBe(true)
    expect(versionMismatch('4.4', '4.4')).toBe(false)
    expect(versionMismatch('4.4.1', '4.3.9')).toBe(true)
    expect(versionMismatch('4.4', '4')).toBe(false)
    expect(versionMismatch(undefined, '4.4')).toBe(false)
    expect(versionMismatch('4.4', undefined)).toBe(false)
  })
})

describe('runProjectCheck', () => {
  it('emits engine-mismatch naming both versions, then reports the passing check', async () => {
    const dir = await makeCheckout({ version: '4.3', check: 'python scripts/studio.py check' })
    const h = harness()
    const fake = fakeExecute(0, 'check ok')
    const detail = await runProjectCheck(h.ctx, projectConfig(dir), new AbortController().signal, fake.execute)

    expect(h.received).toHaveLength(1)
    const trigger = h.received[0]!
    expect(trigger.source).toBe('studio-project')
    expect(trigger.human).toBe(false)
    expect(trigger.actor).toEqual({ source: 'studio-project', id: 'studio-producer' })
    expect(trigger.meta.check).toBe('engine-mismatch')
    expect(trigger.meta.subject).toBe('4.4->4.3')
    expect(trigger.meta.fingerprint).toBe('4.4->4.3')
    expect(trigger.text).toContain('4.4')
    expect(trigger.text).toContain('4.3')
    expect(trigger.threads).toEqual([{ source: 'studio-project', id: 'engine-mismatch:4.4->4.3' }])
    expect(fake.calls).toEqual([{ command: 'python scripts/studio.py check', cwd: dir }])
    expect(h.described).toEqual([{ key: 'studio-project:engine-mismatch:4.4->4.3', label: 'Engine mismatch 4.4->4.3' }])
    expect(detail).toBe('engine mismatch 4.4->4.3; check passed')
  })

  it('emits check-failed with the exit code and the first 20 output lines', async () => {
    const dir = await makeCheckout({ version: '4.4', check: 'python scripts/studio.py check' })
    const lines = Array.from({ length: 25 }, (_, index) => `output line ${index + 1}`).join('\n')
    const h = harness()
    const fake = fakeExecute(3, lines)
    const detail = await runProjectCheck(h.ctx, projectConfig(dir), new AbortController().signal, fake.execute)

    expect(h.received).toHaveLength(1)
    const trigger = h.received[0]!
    expect(trigger.meta.check).toBe('check-failed')
    expect(trigger.meta.subject).toBe('python')
    expect(trigger.meta.fingerprint).toBe(stableKey(3, lines.slice(0, 200)))
    expect(trigger.threads).toEqual([{ source: 'studio-project', id: 'check-failed:python' }])
    expect(trigger.text).toContain('output line 1')
    expect(trigger.text).toContain('output line 20')
    expect(trigger.text).not.toContain('output line 21')
    expect(detail).toBe('check failed (exit 3)')
  })

  it('keeps trigger ids stable across polls while the state is unchanged', async () => {
    const dir = await makeCheckout({ version: '4.3', check: 'python scripts/studio.py check' })
    const first = harness()
    const second = harness()
    const fake = fakeExecute(2, 'boom')
    const signal = new AbortController().signal

    await runProjectCheck(first.ctx, projectConfig(dir), signal, fake.execute)
    await runProjectCheck(second.ctx, projectConfig(dir), signal, fake.execute)

    expect(first.received.map(trigger => trigger.meta.check)).toEqual(['engine-mismatch', 'check-failed'])
    expect(second.received.map(trigger => trigger.id)).toEqual(first.received.map(trigger => trigger.id))
    expect(second.received.map(trigger => trigger.meta.fingerprint)).toEqual(
      first.received.map(trigger => trigger.meta.fingerprint),
    )
  })

  it('changes the check-failed fingerprint when the failure output changes', async () => {
    const dir = await makeCheckout({ version: '4.4', check: 'python scripts/studio.py check' })
    const first = harness()
    const second = harness()
    const signal = new AbortController().signal

    await runProjectCheck(first.ctx, projectConfig(dir), signal, fakeExecute(1, 'first failure').execute)
    await runProjectCheck(second.ctx, projectConfig(dir), signal, fakeExecute(1, 'second failure').execute)

    expect(first.received).toHaveLength(1)
    expect(second.received).toHaveLength(1)
    expect(second.received[0]!.id).not.toBe(first.received[0]!.id)
  })

  it('emits nothing when the versions agree and the check passes', async () => {
    const dir = await makeCheckout({ version: '4.4', check: 'python scripts/studio.py check' })
    const h = harness()
    const fake = fakeExecute(0, 'ok')
    const detail = await runProjectCheck(h.ctx, projectConfig(dir), new AbortController().signal, fake.execute)

    expect(h.received).toEqual([])
    expect(h.described).toEqual([])
    expect(fake.calls).toEqual([{ command: 'python scripts/studio.py check', cwd: dir }])
    expect(detail).toBe('check passed')
  })

  it('reports a missing check command without triggering or executing anything', async () => {
    const dir = await makeCheckout({ version: '4.4' })
    const h = harness()
    const fake = fakeExecute(1, 'unused')
    const detail = await runProjectCheck(h.ctx, projectConfig(dir), new AbortController().signal, fake.execute)

    expect(detail).toBe('no check_command configured')
    expect(fake.calls).toEqual([])
    expect(h.received).toEqual([])
  })

  it('skips the check when runCheck is false', async () => {
    const dir = await makeCheckout({ version: '4.4', check: 'python scripts/studio.py check' })
    const h = harness()
    const fake = fakeExecute(1, 'would fail')
    const detail = await runProjectCheck(h.ctx, projectConfig(dir, { runCheck: false }), new AbortController().signal, fake.execute)

    expect(detail).toBe('check disabled')
    expect(fake.calls).toEqual([])
    expect(h.received).toEqual([])
  })
})
