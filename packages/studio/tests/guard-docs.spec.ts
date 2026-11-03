import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { PostToolDecision } from '@deepseek-ai/dsh-tools'
import { afterEach, describe, expect, it } from 'vitest'
import { apply, validateWrite } from '../src/guard/docs/index.ts'

type Handler = (
  exec: Record<string, unknown>,
  result: Readonly<{ isError: boolean }>,
  next: () => Promise<PostToolDecision>,
) => Promise<PostToolDecision>

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** A real PNG header padded to the requested size. */
function png(size: number): Buffer {
  return Buffer.concat([PNG_MAGIC, Buffer.alloc(Math.max(0, size - PNG_MAGIC.length))])
}

const STORY_PATH = 'production/stories/launch.md'
const EVIDENCE_ROOT = 'production/qa/evidence'

const repos: string[] = []

afterEach(() => {
  while (repos.length > 0) {
    const root = repos.pop()
    if (root !== undefined) rmSync(root, { recursive: true, force: true })
  }
})

function write(root: string, rel: string, content: string | Uint8Array): string {
  const path = join(root, rel)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
  return path
}

/** A repo with `studio.yaml`; pass `studioYaml: false` to exercise the defaults. */
function makeRepo(studioYaml = true): string {
  const root = mkdtempSync(join(tmpdir(), 'studio-docs-'))
  repos.push(root)
  if (studioYaml) {
    write(root, 'studio.yaml', [
      'studio: Fixture Studio',
      'story_dir: production/stories',
      `evidence_dir: ${EVIDENCE_ROOT}`,
      '',
    ].join('\n'))
  }
  return root
}

function storyText(status: string | undefined, body = '## Acceptance\n\n- it launches\n'): string {
  const head = status === undefined ? '---\ntitle: Untitled\n---\n' : `---\nstatus: ${status}\n---\n`
  return `${head}\n# Story\n\n${body}`
}

function accepted(): PostToolDecision {
  return { kind: 'accept' }
}

function mount(): Map<string, Handler> {
  const listeners = new Map<string, Handler>()
  const ctx = {
    on: (event: string, listener: Handler): (() => boolean) => {
      listeners.set(event, listener)
      return () => listeners.delete(event)
    },
  } as unknown as Context
  apply(ctx)
  return listeners
}

function execution(cwd: string, name: string, filePath?: string): Record<string, unknown> {
  return {
    name,
    arguments: filePath === undefined ? {} : { file_path: filePath },
    agent: { session: { header: { cwd } } },
  }
}

describe('validateWrite: story files', () => {
  it('accepts a story with an allowed status and an Acceptance heading', () => {
    const root = makeRepo()
    write(root, STORY_PATH, storyText('ready'))
    expect(validateWrite(root, STORY_PATH)).toBeUndefined()
  })

  it('accepts every allowed status', () => {
    const root = makeRepo()
    for (const status of ['ready', 'in-progress', 'blocked']) {
      write(root, STORY_PATH, storyText(status))
      expect(validateWrite(root, STORY_PATH)).toBeUndefined()
    }
  })

  it('rejects a story without a frontmatter status', () => {
    const root = makeRepo()
    write(root, STORY_PATH, storyText(undefined))
    const reason = validateWrite(root, STORY_PATH)
    expect(reason).toBeDefined()
    expect(reason).toContain('launch.md')
    expect(reason).toContain('status')
    expect(reason).toContain('in-progress')
  })

  it('rejects an unknown status', () => {
    const root = makeRepo()
    write(root, STORY_PATH, storyText('shipped'))
    const reason = validateWrite(root, STORY_PATH)
    expect(reason).toBeDefined()
    expect(reason).toContain('shipped')
    expect(reason).toContain('blocked')
  })

  it('rejects a story without an Acceptance heading', () => {
    const root = makeRepo()
    write(root, STORY_PATH, storyText('ready', '## Notes\n\n- nothing observable\n'))
    const reason = validateWrite(root, STORY_PATH)
    expect(reason).toBeDefined()
    expect(reason).toContain('## Acceptance')
  })

  it('resolves a relative and an absolute path the same way', () => {
    const root = makeRepo()
    const absolute = write(root, STORY_PATH, storyText(undefined))
    expect(validateWrite(root, STORY_PATH)).toContain('status')
    expect(validateWrite(root, absolute)).toBe(validateWrite(root, STORY_PATH))
  })

  it('rejects a done story with no evidence files', () => {
    const root = makeRepo()
    write(root, STORY_PATH, storyText('done'))
    const reason = validateWrite(root, STORY_PATH)
    expect(reason).toBeDefined()
    expect(reason).toContain('done')
    expect(reason).toContain('launch')
    expect(reason).toContain('evidence')
  })

  it('accepts a done story whose evidence directory holds a file', () => {
    const root = makeRepo()
    write(root, STORY_PATH, storyText('done'))
    write(root, `${EVIDENCE_ROOT}/launch/screenshot.png`, png(2000))
    write(root, `${EVIDENCE_ROOT}/launch/index.md`, '# Evidence\n\nRun result: OBSERVED - launch screen\n')
    expect(validateWrite(root, STORY_PATH)).toBeUndefined()
  })

  it('still validates the default story directory without studio.yaml', () => {
    const root = makeRepo(false)
    write(root, STORY_PATH, storyText(undefined))
    expect(validateWrite(root, STORY_PATH)).toContain('status')
    write(root, STORY_PATH, storyText('ready'))
    expect(validateWrite(root, STORY_PATH)).toBeUndefined()
  })

  it('ignores non-Markdown files under the story directory', () => {
    const root = makeRepo()
    write(root, 'production/stories/notes.txt', 'free text')
    expect(validateWrite(root, 'production/stories/notes.txt')).toBeUndefined()
  })
})

describe('validateWrite: evidence files', () => {
  it('rejects a PNG smaller than 1024 bytes', () => {
    const root = makeRepo()
    write(root, `${EVIDENCE_ROOT}/launch/tiny.png`, png(10))
    const reason = validateWrite(root, `${EVIDENCE_ROOT}/launch/tiny.png`)
    expect(reason).toBeDefined()
    expect(reason).toContain('tiny.png')
    expect(reason).toContain('10 bytes')
    expect(reason).toContain('1024')
  })

  it('accepts a PNG of 2000 bytes', () => {
    const root = makeRepo()
    write(root, `${EVIDENCE_ROOT}/launch/shot.png`, png(2000))
    expect(validateWrite(root, `${EVIDENCE_ROOT}/launch/shot.png`)).toBeUndefined()
  })

  it('rejects an index.md without a Run result line', () => {
    const root = makeRepo()
    write(root, `${EVIDENCE_ROOT}/launch/index.md`, '# Evidence\n\n- some capture\n')
    const reason = validateWrite(root, `${EVIDENCE_ROOT}/launch/index.md`)
    expect(reason).toBeDefined()
    expect(reason).toContain('index.md')
    expect(reason).toContain('Run result:')
  })

  it('accepts an index.md with a Run result line', () => {
    const root = makeRepo()
    write(root, `${EVIDENCE_ROOT}/launch/index.md`, '# Evidence\n\nRun result: OBSERVED - launch screen\n')
    expect(validateWrite(root, `${EVIDENCE_ROOT}/launch/index.md`)).toBeUndefined()
  })

  it('rejects an index that says NOT VERIFIED', () => {
    const root = makeRepo()
    write(root, `${EVIDENCE_ROOT}/launch/index.md`, '# Evidence\n\nRun result: NOT VERIFIED - engine missing\n')
    const reason = validateWrite(root, `${EVIDENCE_ROOT}/launch/index.md`)
    expect(reason).toBeDefined()
    expect(reason).toContain('NOT VERIFIED')
  })

  it('ignores other evidence files', () => {
    const root = makeRepo()
    write(root, `${EVIDENCE_ROOT}/launch/console.log`, 'Run result: ignored, not an index\n')
    expect(validateWrite(root, `${EVIDENCE_ROOT}/launch/console.log`)).toBeUndefined()
  })
})

describe('validateWrite: unrelated files', () => {
  it('ignores a normal repository document', () => {
    const root = makeRepo()
    write(root, 'README.md', '# Repo\n')
    expect(validateWrite(root, 'README.md')).toBeUndefined()
  })

  it('ignores a path outside the studio directories', () => {
    const root = makeRepo()
    write(root, 'docs/design.md', '---\ntitle: Design\n---\n\n# Design\n')
    expect(validateWrite(root, 'docs/design.md')).toBeUndefined()
  })

  it('ignores a file that does not exist yet', () => {
    const root = makeRepo()
    expect(validateWrite(root, 'production/stories/missing.md')).toBeUndefined()
  })
})

describe('guard-docs: tools/post-execute listener', () => {
  it('registers exactly the post-execute event', () => {
    const listeners = mount()
    expect([...listeners.keys()]).toEqual(['tools/post-execute'])
    expect(typeof listeners.get('tools/post-execute')).toBe('function')
  })

  it('blocks a write that leaves a story without a status', async () => {
    const root = makeRepo()
    write(root, STORY_PATH, storyText(undefined))
    const listeners = mount()
    const handler = listeners.get('tools/post-execute')
    expect(handler).toBeDefined()
    const decision = await handler!(execution(root, 'write', STORY_PATH), { isError: false }, async () => accepted())
    expect(decision.kind).toBe('block')
    if (decision.kind !== 'block') throw new Error('unreachable')
    expect(decision.feedback).toHaveLength(1)
    expect(decision.feedback[0]?.type).toBe('text')
    const block = decision.feedback[0] as { type: 'text'; text: string }
    expect(block.text).toContain('production/stories/launch.md')
    expect(block.text).toContain('status')
  })

  it('blocks a write that leaves a PNG too small to be evidence', async () => {
    const root = makeRepo()
    write(root, `${EVIDENCE_ROOT}/launch/tiny.png`, png(10))
    const handler = mount().get('tools/post-execute')
    const decision = await handler!(
      execution(root, 'write', `${EVIDENCE_ROOT}/launch/tiny.png`),
      { isError: false },
      async () => accepted(),
    )
    expect(decision.kind).toBe('block')
    if (decision.kind !== 'block') throw new Error('unreachable')
    expect((decision.feedback[0] as { text: string }).text).toContain('1024')
  })

  it('blocks an edit as well as a write', async () => {
    const root = makeRepo()
    write(root, STORY_PATH, storyText('ready', '## Notes\n'))
    const handler = mount().get('tools/post-execute')
    const decision = await handler!(execution(root, 'edit', STORY_PATH), { isError: false }, async () => accepted())
    expect(decision.kind).toBe('block')
  })

  it('passes a valid write through unchanged', async () => {
    const root = makeRepo()
    write(root, STORY_PATH, storyText('ready'))
    const handler = mount().get('tools/post-execute')
    const downstream = accepted()
    const decision = await handler!(execution(root, 'write', STORY_PATH), { isError: false }, async () => downstream)
    expect(decision).toBe(downstream)
  })

  it('leaves a downstream block alone', async () => {
    const root = makeRepo()
    write(root, STORY_PATH, storyText(undefined))
    const handler = mount().get('tools/post-execute')
    const downstream: PostToolDecision = { kind: 'block', feedback: [{ type: 'text', text: 'upstream' }] }
    const decision = await handler!(execution(root, 'write', STORY_PATH), { isError: false }, async () => downstream)
    expect(decision).toBe(downstream)
  })

  it('does not block a failed execution', async () => {
    const root = makeRepo()
    write(root, STORY_PATH, storyText(undefined))
    const handler = mount().get('tools/post-execute')
    const decision = await handler!(execution(root, 'write', STORY_PATH), { isError: true }, async () => accepted())
    expect(decision.kind).toBe('accept')
  })

  it('does not block tools other than write and edit', async () => {
    const root = makeRepo()
    write(root, STORY_PATH, storyText(undefined))
    const handler = mount().get('tools/post-execute')
    const decision = await handler!(execution(root, 'read', STORY_PATH), { isError: false }, async () => accepted())
    expect(decision.kind).toBe('accept')
  })

  it('does not block a write without a file_path argument', async () => {
    const root = makeRepo()
    const handler = mount().get('tools/post-execute')
    const decision = await handler!(execution(root, 'write', undefined), { isError: false }, async () => accepted())
    expect(decision.kind).toBe('accept')
  })
})
