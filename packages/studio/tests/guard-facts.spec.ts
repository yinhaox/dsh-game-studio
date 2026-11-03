import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { PreStepDecision } from '@deepseek-ai/dsh-agent'
import { apply, factsText, name } from '../src/guard/facts/index.ts'

interface FakeAgent {
  id: string
  session: { header: { cwd: string } }
}

type PreStepListener = (
  payload: { agent: FakeAgent },
  next: () => Promise<PreStepDecision>,
) => Promise<PreStepDecision>

/** Minimal Context stand-in: it collects `on` listeners and runs `effect` setup once. */
class FakeContext {
  readonly listeners = new Map<string, PreStepListener>()
  readonly teardowns: Array<() => void> = []

  on(event: string, listener: PreStepListener): () => void {
    this.listeners.set(event, listener)
    return () => {
      this.listeners.delete(event)
    }
  }

  effect(setup: () => void | (() => void)): void {
    const teardown = setup()
    if (typeof teardown === 'function') this.teardowns.push(teardown)
  }
}

const roots: string[] = []

async function makeTempDir(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'studio-guard-facts-'))
  roots.push(root)
  return root
}

async function makeGodotRepo(): Promise<string> {
  const root = await makeTempDir()
  await writeFile(join(root, 'project.godot'), [
    '; Engine configuration file.',
    'config_version=5',
    '',
    '[application]',
    '',
    'config/name="Game Studio"',
    'run/main_scene="res://scenes/main.tscn"',
    'config/features=PackedStringArray("4.4", "Forward Plus")',
    '',
    '[autoload]',
    '',
    'StudioCapture="*res://addons/studio_capture/capture.gd"',
    '',
  ].join('\n'))
  await writeFile(join(root, 'studio.yaml'), [
    'studio: Game Studio',
    'godot:',
    '  path: godot',
    '  version: "4.4"',
    'check_command: python scripts/studio.py check',
    'test_command: python scripts/studio.py test',
    'run_command: python scripts/studio.py run',
    'capture_command: python scripts/studio.py capture',
    'evidence_dir: production/qa/evidence',
    'story_dir: production/stories',
    '',
  ].join('\n'))
  return root
}

function register(context: FakeContext): PreStepListener {
  apply(context as unknown as Context)
  const listener = context.listeners.get('agent/pre-step')
  if (listener === undefined) throw new Error('guard-facts did not register an agent/pre-step listener')
  return listener
}

/** The model-visible text of an enter decision, flattened. */
function injectedText(decision: PreStepDecision): string {
  if (decision.kind !== 'enter') return ''
  return decision.messages
    .map(message => message.content.map(block => (block.type === 'text' ? block.text : '')).join('\n'))
    .join('\n')
}

function appendedMessages(decision: PreStepDecision): number {
  return decision.kind === 'enter' ? decision.messages.length : -1
}

async function nextEnter(): Promise<PreStepDecision> {
  return { kind: 'enter', messages: [] }
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('guard-facts factsText', () => {
  it('describes the Godot project and its studio commands in one bounded block', async () => {
    const root = await makeGodotRepo()
    const text = factsText(root)
    expect(text).toBeDefined()
    expect(text ?? '').toContain('4.4')
    expect(text ?? '').toContain('res://scenes/main.tscn')
    expect(text ?? '').toContain('StudioCapture')
    expect(text ?? '').toContain('python scripts/studio.py check')
    expect(text ?? '').toContain('python scripts/studio.py test')
    expect(text ?? '').toContain('python scripts/studio.py run')
    expect(text ?? '').toContain('python scripts/studio.py capture')
    expect(text ?? '').toContain('production/qa/evidence')
    expect((text ?? '').length).toBeLessThan(2000)
  })

  it('is undefined for a directory without project.godot', async () => {
    const root = await makeTempDir()
    expect(factsText(root)).toBeUndefined()
  })
})

describe('guard-facts apply', () => {
  it('registers an agent/pre-step listener under the plugin name', async () => {
    expect(name).toBe('dsh-game-studio/guard-facts')
    const context = new FakeContext()
    const listener = register(context)
    expect(context.listeners.has('agent/pre-step')).toBe(true)
    expect(typeof listener).toBe('function')
  })

  it('injects the facts once for a Godot session and never again for that agent', async () => {
    const root = await makeGodotRepo()
    const context = new FakeContext()
    const listener = register(context)
    const agent: FakeAgent = { id: 'agent-facts-1', session: { header: { cwd: root } } }

    const first = await listener({ agent }, nextEnter)
    expect(first.kind).toBe('enter')
    expect(appendedMessages(first)).toBe(1)
    const text = injectedText(first)
    expect(text).toContain('4.4')
    expect(text).toContain('python scripts/studio.py test')

    const second = await listener({ agent }, nextEnter)
    expect(second.kind).toBe('enter')
    expect(appendedMessages(second)).toBe(0)
  })

  it('injects nothing when the session directory has no project.godot', async () => {
    const root = await makeTempDir()
    const context = new FakeContext()
    const listener = register(context)
    const agent: FakeAgent = { id: 'agent-plain-1', session: { header: { cwd: root } } }

    const decision = await listener({ agent }, nextEnter)
    expect(decision.kind).toBe('enter')
    expect(appendedMessages(decision)).toBe(0)
    expect(injectedText(decision)).toBe('')
  })

  it('leaves a rejected step exactly as the next listener returned it', async () => {
    const root = await makeGodotRepo()
    const context = new FakeContext()
    const listener = register(context)
    const agent: FakeAgent = { id: 'agent-reject-1', session: { header: { cwd: root } } }
    const rejection: PreStepDecision = { kind: 'reject' }

    const decision = await listener({ agent }, async () => rejection)
    expect(decision).toBe(rejection)
  })
})
