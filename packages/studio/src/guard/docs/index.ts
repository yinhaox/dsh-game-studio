import { existsSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { PostToolDecision } from '@deepseek-ai/dsh-tools'
import {
  absolutePath,
  filePathOf,
  isWithin,
  realWithin,
  readTextIfExists,
  relativePath,
  sessionCwd,
} from '../../shared/guard.ts'
import { closingEvidence, isPng, listFiles, loadStudio, readFrontmatter, repoPath } from '../../shared/studio.ts'

/** The docs guard: the one guard allowed to say no after a write landed. */
export const name = 'dsh-game-studio/guard-docs'

/** Story statuses a story file may declare. */
const STORY_STATUSES = ['ready', 'in-progress', 'done', 'blocked'] as const

const DEFAULT_STORY_DIR = 'production/stories'
const DEFAULT_EVIDENCE_DIR = 'production/qa/evidence'

/** A screenshot below this many bytes is a blank or broken capture, not evidence. */
const MIN_PNG_BYTES = 1024

/** A story must expose observable acceptance criteria under this heading. */
const ACCEPTANCE_HEADING = /^##\s+Acceptance\b/m

/** Evidence index files must record a closing run outcome on a line starting with this. */
const RUN_RESULT_LINE = /^Run result:\s*(.*)$/m

/** Only these values can close a story; NOT VERIFIED is a report that evidence is missing. */
const CLOSING_VALUE = /^(?:OBSERVED|N\/A)\b/i

function storyReason(cwd: string, path: string, evidenceRoot: string): string | undefined {
  if (!path.toLowerCase().endsWith('.md')) return undefined
  // `_template.md` and other underscore-prefixed drafts are not stories.
  if (basename(path).startsWith('_')) return undefined
  const text = readTextIfExists(path)
  if (text === undefined) return undefined
  const shown = relativePath(cwd, path)
  const { data, body } = readFrontmatter(text)
  const status = typeof data.status === 'string' ? data.status.trim() : ''
  if (status.length === 0) {
    return `Story ${shown} has no frontmatter status; set status: one of ${STORY_STATUSES.join(', ')}.`
  }
  if (!(STORY_STATUSES as readonly string[]).includes(status)) {
    return `Story ${shown} has status "${status}"; use one of ${STORY_STATUSES.join(', ')}.`
  }
  if (!ACCEPTANCE_HEADING.test(body)) {
    return `Story ${shown} has no "## Acceptance" heading; list the observable acceptance criteria.`
  }
  if (status === 'done') {
    const slug = basename(path).replace(/\.md$/i, '')
    const dir = join(evidenceRoot, slug)
    const evidence = closingEvidence(dir)
    if (!evidence.ok) {
      return `Story ${shown} is done but ${repoPath(relativePath(cwd, dir))}/ cannot close it: ${evidence.reason ?? 'no usable evidence'}. Record Run result: OBSERVED - <what was on screen> in index.md.`
    }
  }
  return undefined
}

function evidenceReason(cwd: string, path: string): string | undefined {
  if (!existsSync(path)) return undefined
  const shown = relativePath(cwd, path)
  const file = basename(path).toLowerCase()
  if (file.endsWith('.png')) {
    if (!isPng(path)) {
      return `Evidence ${shown} is not a PNG file; capture the real frame with capture_command instead of renaming another file.`
    }
    const size = statSync(path).size
    if (size < MIN_PNG_BYTES) {
      return `Evidence ${shown} is ${size} bytes; a PNG under ${MIN_PNG_BYTES} bytes is not a usable capture.`
    }
    return undefined
  }
  if (file === 'index.md') {
    const text = readTextIfExists(path)
    if (text === undefined) return undefined
    const line = RUN_RESULT_LINE.exec(text)?.[1]?.trim() ?? ''
    if (line.length === 0) {
      return `Evidence ${shown} has no "Run result:" line; record Run result: OBSERVED - <what was on screen>.`
    }
    if (!CLOSING_VALUE.test(line)) {
      return `Evidence ${shown} says "Run result: ${line}"; NOT VERIFIED cannot close a story. Run the game, capture the frame, and record OBSERVED or N/A.`
    }
  }
  return undefined
}

/**
 * Judge one written file against the studio document contract. Returns a
 * correction message for the model, or undefined when the file may stand.
 * `filePath` may be absolute or relative to `cwd`.
 */
export function validateWrite(cwd: string, filePath: string): string | undefined {
  const path = absolutePath(cwd, filePath)
  const studio = loadStudio(cwd)
  const storyRoot = join(cwd, studio?.story_dir ?? DEFAULT_STORY_DIR)
  const evidenceRoot = join(cwd, studio?.evidence_dir ?? DEFAULT_EVIDENCE_DIR)
  if (isWithin(storyRoot, path) && realWithin(storyRoot, path)) return storyReason(cwd, path, evidenceRoot)
  if (isWithin(evidenceRoot, path) && realWithin(evidenceRoot, path)) return evidenceReason(cwd, path)
  return undefined
}

export function apply(ctx: Context): void {
  ctx.on('tools/post-execute', async (exec, result, next): Promise<PostToolDecision> => {
    const downstream = await next()
    if (downstream.kind === 'block') return downstream
    if (exec.name !== 'write' && exec.name !== 'edit') return downstream
    if (result.isError) return downstream
    const filePath = filePathOf(exec)
    if (filePath === undefined) return downstream
    let reason: string | undefined
    try {
      reason = validateWrite(sessionCwd(exec.agent), filePath)
    } catch (error) {
      // Fail closed on an unreadable target, and leave a trace for the operator.
      ctx.logger.warn(`studio guard-docs: could not validate ${filePath}: ${String(error)}`)
      reason = `[studio] Could not validate ${filePath} after the write (${String(error)}). Fix the file and its evidence index, then retry.`
    }
    if (reason === undefined) return downstream
    return { kind: 'block', feedback: [{ type: 'text', text: reason }] }
  })
}
