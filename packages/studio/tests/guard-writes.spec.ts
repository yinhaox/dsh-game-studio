import { resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { PreToolDecision, ToolExecution } from '@deepseek-ai/dsh-tools'
import { describe, expect, it } from 'vitest'
import { apply, denyReason, name } from '../src/guard/writes/index.ts'

const CWD = resolve('studio-game')

type PreExecuteListener = (
  exec: ToolExecution,
  next: () => Promise<PreToolDecision>,
) => Promise<PreToolDecision>

interface FakeHost {
  ctx: Context
  listener: () => PreExecuteListener
}

/** A Context that records the `tools/pre-execute` listener so a test can call it. */
function fakeHost(): FakeHost {
  let listener: PreExecuteListener | undefined
  const ctx = {
    on: (event: string, registered: unknown): (() => boolean) => {
      if (event === 'tools/pre-execute') listener = registered as PreExecuteListener
      return () => true
    },
    effect: (run: () => unknown): (() => void) => {
      const dispose = run()
      return () => {
        if (typeof dispose === 'function') (dispose as () => void)()
      }
    },
    logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
  } as unknown as Context
  return {
    ctx,
    listener: () => {
      if (listener === undefined) throw new Error('tools/pre-execute listener was not registered')
      return listener
    },
  }
}

/** A tool execution with parsed arguments and the caller's session directory. */
function fakeExec(tool: string, filePath: string | undefined, cwd = CWD): ToolExecution {
  const args = filePath === undefined ? {} : { file_path: filePath }
  return {
    callId: 'call-1',
    name: tool,
    arguments: args,
    agent: { session: { header: { cwd } } },
    signal: new AbortController().signal,
  } as unknown as ToolExecution
}

interface Outcome {
  decision: PreToolDecision
  delegated: boolean
}

/** Run the guard with a `next` that reports whether the call was delegated. */
async function run(host: FakeHost, tool: string, filePath: string | undefined): Promise<Outcome> {
  let delegated = false
  const decision = await host.listener()(fakeExec(tool, filePath), async () => {
    delegated = true
    return { kind: 'allow' }
  })
  return { decision, delegated }
}

describe('guard-writes denyReason', () => {
  it('denies an absolute path outside the working directory', () => {
    const reason = denyReason(CWD, resolve('elsewhere', 'scripts', 'main.gd'))
    expect(reason).toBeDefined()
    expect(reason).toContain('outside the project directory')
    expect(reason).toContain(resolve('elsewhere', 'scripts', 'main.gd'))
  })

  it('denies a relative path that escapes the working directory', () => {
    expect(denyReason(CWD, '../escape/scripts/main.gd')).toBeDefined()
    expect(denyReason(CWD, 'scripts/../../escape/main.gd')).toBeDefined()
  })

  it('denies the Godot cache under .godot/', () => {
    expect(denyReason(CWD, '.godot/editor/project_metadata.cfg')).toBeDefined()
    expect(denyReason(CWD, '.godot')).toBeDefined()
    expect(denyReason(CWD, resolve(CWD, '.godot', 'imported', 'icon.png.ctex'))).toBeDefined()
  })

  it('denies generated .import files', () => {
    expect(denyReason(CWD, 'assets/icon.png.import')).toBeDefined()
    expect(denyReason(CWD, 'a.tscn.import')).toBeDefined()
  })

  it('denies export_presets.cfg', () => {
    expect(denyReason(CWD, 'export_presets.cfg')).toBeDefined()
    expect(denyReason(CWD, resolve(CWD, 'export_presets.cfg'))).toBeDefined()
  })

  it('denies repository metadata under .git/', () => {
    expect(denyReason(CWD, '.git/config')).toBeDefined()
    expect(denyReason(CWD, '.git/refs/heads/main')).toBeDefined()
  })

  it('allows ordinary project files', () => {
    expect(denyReason(CWD, 'scripts/main.gd')).toBeUndefined()
    expect(denyReason(CWD, 'scenes/main.tscn')).toBeUndefined()
    expect(denyReason(CWD, 'design/a.md')).toBeUndefined()
    expect(denyReason(CWD, resolve(CWD, 'scripts', 'main.gd'))).toBeUndefined()
    expect(denyReason(CWD, '.gitignore')).toBeUndefined()
    expect(denyReason(CWD, 'docs/export_presets.cfg.md')).toBeUndefined()
  })
})

describe('guard-writes apply', () => {
  it('exports the plugin name', () => {
    expect(name).toBe('dsh-game-studio/guard-writes')
  })

  it('denies a write into the Godot cache', async () => {
    const host = fakeHost()
    apply(host.ctx)
    const { decision, delegated } = await run(host, 'write', '.godot/editor/project_metadata.cfg')
    expect(delegated).toBe(false)
    expect(decision.kind).toBe('deny')
    if (decision.kind !== 'deny') throw new Error('expected a deny decision')
    expect(decision.reason).toContain('.godot/')
  })

  it('denies an edit outside the working directory', async () => {
    const host = fakeHost()
    apply(host.ctx)
    const target = resolve('elsewhere', 'main.gd')
    const { decision, delegated } = await run(host, 'edit', target)
    expect(delegated).toBe(false)
    expect(decision.kind).toBe('deny')
    if (decision.kind !== 'deny') throw new Error('expected a deny decision')
    expect(decision.reason).toContain(target)
  })

  it('denies a write to export_presets.cfg and .git/', async () => {
    const host = fakeHost()
    apply(host.ctx)
    expect((await run(host, 'write', 'export_presets.cfg')).decision.kind).toBe('deny')
    expect((await run(host, 'write', '.git/config')).decision.kind).toBe('deny')
    expect((await run(host, 'edit', 'a.tscn.import')).decision.kind).toBe('deny')
  })

  it('delegates allowed writes and edits to the next listener', async () => {
    const host = fakeHost()
    apply(host.ctx)
    for (const [tool, path] of [['write', 'scripts/main.gd'], ['edit', 'scenes/main.tscn'], ['write', 'design/a.md']] as const) {
      const { decision, delegated } = await run(host, tool, path)
      expect(delegated).toBe(true)
      expect(decision).toEqual({ kind: 'allow' })
    }
  })

  it('leaves tools other than write and edit untouched', async () => {
    const host = fakeHost()
    apply(host.ctx)
    for (const tool of ['read', 'bash', 'glob']) {
      const { decision, delegated } = await run(host, tool, '.godot/editor/project_metadata.cfg')
      expect(delegated).toBe(true)
      expect(decision).toEqual({ kind: 'allow' })
    }
  })

  it('leaves write and edit calls without a file_path untouched', async () => {
    const host = fakeHost()
    apply(host.ctx)
    expect(await run(host, 'write', undefined)).toEqual({ decision: { kind: 'allow' }, delegated: true })
    expect(await run(host, 'edit', undefined)).toEqual({ decision: { kind: 'allow' }, delegated: true })
  })
})
