import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import { apply, loadRules } from '../src/guard/rules/index.ts'
import { relativePath } from '../src/shared/guard.ts'

type Listener = (...args: any[]) => unknown

interface FakeAgent {
  id: string
  session: { header: { cwd: string } }
}

const tempDirs: string[] = []

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function tempProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-guard-rules-'))
  tempDirs.push(dir)
  mkdirSync(join(dir, '.dsh', 'rules'), { recursive: true })
  return dir
}

function writeRule(dir: string, file: string, frontmatter: string, body: string): void {
  writeFileSync(join(dir, '.dsh', 'rules', file), `---\n${frontmatter}\n---\n${body}`, 'utf8')
}

function fixtureProject(): string {
  const dir = tempProject()
  writeRule(dir, 'gdscript.md', 'paths: scripts/**/*.gd',
    '# GDScript rules\n\nUse tabs for indentation and typed arrays everywhere.\n')
  writeRule(dir, 'scenes.md', 'paths:\n  - scenes/**/*.tscn',
    '# Scene rules\n\nNever hand-edit a .tscn file; use the editor.\n')
  return dir
}

function fakeContext(): { ctx: Context; listeners: Map<string, Listener[]> } {
  const listeners = new Map<string, Listener[]>()
  const ctx = {
    on(name: string, listener: Listener): () => boolean {
      const bucket = listeners.get(name) ?? []
      bucket.push(listener)
      listeners.set(name, bucket)
      return () => true
    },
    effect(callback: () => unknown): () => void {
      callback()
      return () => {}
    },
    logger: () => ({ debug(): void {}, info(): void {}, warn(): void {}, error(): void {} }),
  }
  return { ctx: ctx as unknown as Context, listeners }
}

function agentFor(dir: string): FakeAgent {
  return { id: 'agent-1', session: { header: { cwd: dir } } }
}

function touch(
  listeners: Map<string, Listener[]>,
  agent: FakeAgent,
  filePath: string,
  options: { tool?: string; isError?: boolean } = {},
): void {
  const exec = { name: options.tool ?? 'write', arguments: { file_path: filePath }, agent }
  const result = { isError: options.isError ?? false }
  for (const listener of listeners.get('tools/result') ?? []) listener(exec, result)
}

async function runPreStep(listeners: Map<string, Listener[]>, agent: FakeAgent): Promise<unknown[]> {
  const decision = { kind: 'enter' as const, messages: [] as unknown[] }
  let outcome: unknown = decision
  for (const listener of listeners.get('agent/pre-step') ?? []) {
    outcome = await listener({
      agent,
      messages: [],
      turn: 1,
      step: 1,
      signal: new AbortController().signal,
      modelSelection: {},
    }, async () => decision)
  }
  return (outcome as { messages?: unknown[] }).messages ?? []
}

function textOf(message: unknown): string {
  const content = (message as { content?: unknown }).content
  if (!Array.isArray(content)) return ''
  return content
    .map(block => {
      const typed = block as { type?: unknown; text?: unknown }
      return typed.type === 'text' && typeof typed.text === 'string' ? typed.text : ''
    })
    .join('\n')
}

describe('loadRules', () => {
  it('reads every rule file, splitting frontmatter globs from the body', () => {
    const dir = fixtureProject()
    const rules = loadRules(dir)

    expect(rules.map(rule => relativePath(dir, rule.path))).toEqual([
      '.dsh/rules/gdscript.md',
      '.dsh/rules/scenes.md',
    ])
    const gdscript = rules[0]
    expect(gdscript?.globs).toEqual(['scripts/**/*.gd'])
    expect(gdscript?.body).toContain('# GDScript rules')
    expect(gdscript?.body).not.toContain('paths:')
    expect(gdscript?.mtimeMs).toBeGreaterThan(0)

    const scenes = rules[1]
    expect(scenes?.globs).toEqual(['scenes/**/*.tscn'])
    expect(scenes?.body).toContain('# Scene rules')
  })

  it('returns nothing when the rules directory does not exist', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-guard-rules-empty-'))
    tempDirs.push(dir)
    expect(loadRules(dir)).toEqual([])
  })
})

describe('guard-rules', () => {
  it('injects the matching rule after a touched write and never the unmatched one', async () => {
    const dir = fixtureProject()
    const { ctx, listeners } = fakeContext()
    apply(ctx)
    const agent = agentFor(dir)

    touch(listeners, agent, 'scripts/player.gd')
    const messages = await runPreStep(listeners, agent)

    expect(messages).toHaveLength(1)
    const text = textOf(messages[0])
    expect(text.startsWith('[studio] Rule .dsh/rules/gdscript.md applies to scripts/player.gd:')).toBe(true)
    expect(text).toContain('# GDScript rules')
    expect(text).toContain('Use tabs for indentation and typed arrays everywhere.')
    expect(text).not.toContain('# Scene rules')
    expect(text).not.toContain('scenes.md')
  })

  it('does not inject the same rule version twice for a repeated touch', async () => {
    const dir = fixtureProject()
    const { ctx, listeners } = fakeContext()
    apply(ctx)
    const agent = agentFor(dir)

    touch(listeners, agent, 'scripts/player.gd')
    expect(await runPreStep(listeners, agent)).toHaveLength(1)

    touch(listeners, agent, 'scripts/player.gd')
    expect(await runPreStep(listeners, agent)).toHaveLength(0)
  })

  it('does nothing for a path no rule claims', async () => {
    const dir = fixtureProject()
    const { ctx, listeners } = fakeContext()
    apply(ctx)
    const agent = agentFor(dir)

    touch(listeners, agent, 'production/stories/player-jump.md')
    expect(await runPreStep(listeners, agent)).toHaveLength(0)
  })

  it('ignores failed file tool results', async () => {
    const dir = fixtureProject()
    const { ctx, listeners } = fakeContext()
    apply(ctx)
    const agent = agentFor(dir)

    touch(listeners, agent, 'scripts/player.gd', { isError: true })
    expect(await runPreStep(listeners, agent)).toHaveLength(0)
  })

  it('records edit results too', async () => {
    const dir = fixtureProject()
    const { ctx, listeners } = fakeContext()
    apply(ctx)
    const agent = agentFor(dir)

    touch(listeners, agent, 'scripts/enemy.gd', { tool: 'edit' })
    const messages = await runPreStep(listeners, agent)
    expect(messages).toHaveLength(1)
    expect(textOf(messages[0])).toContain('applies to scripts/enemy.gd:')
  })

  it('caps a long rule body at 4000 characters', async () => {
    const dir = tempProject()
    const longBody = 'x'.repeat(5000)
    writeRule(dir, 'gdscript.md', 'paths: scripts/**/*.gd', longBody)
    const { ctx, listeners } = fakeContext()
    apply(ctx)
    const agent = agentFor(dir)

    touch(listeners, agent, 'scripts/player.gd')
    const messages = await runPreStep(listeners, agent)
    expect(messages).toHaveLength(1)
    const text = textOf(messages[0])
    const body = text.slice(text.indexOf(':\n') + 2)
    expect(body).toHaveLength(4000)
    expect(body.endsWith('…')).toBe(true)
  })
})
