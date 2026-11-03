import { closeSync, existsSync, openSync, readFileSync, readSync, readdirSync, statSync } from 'node:fs'
import { basename, join, relative } from 'node:path'
import { parse as parseYaml } from 'yaml'
import { z } from 'zod'

/** `studio.yaml`, the game repository's studio contract. Unknown keys are kept for future use. */
export const StudioSchema = z.object({
  studio: z.string().default('Untitled Studio'),
  godot: z.object({
    path: z.string().default('godot'),
    version: z.string().default('4'),
  }).default({ path: 'godot', version: '4' }),
  check_command: z.string().optional(),
  test_command: z.string().optional(),
  run_command: z.string().optional(),
  capture_command: z.string().optional(),
  evidence_dir: z.string().default('production/qa/evidence'),
  story_dir: z.string().default('production/stories'),
}).passthrough()

export type Studio = z.infer<typeof StudioSchema>

export function loadStudio(root: string): Studio | undefined {
  const file = join(root, 'studio.yaml')
  if (!existsSync(file)) return undefined
  try {
    return StudioSchema.parse(parseYaml(readFileSync(file, 'utf8')) ?? {})
  } catch {
    return undefined
  }
}

export interface GodotProject {
  version?: string
  mainScene?: string
  autoloads: string[]
}

/** Read the few `project.godot` facts a worker needs; undefined when the directory is not a Godot project. */
export function readProjectGodot(root: string): GodotProject | undefined {
  const file = join(root, 'project.godot')
  if (!existsSync(file)) return undefined
  const text = readFileSync(file, 'utf8')
  const features = /config\/features=PackedStringArray\(([^)]*)\)/.exec(text)?.[1] ?? ''
  const version = /"(\d+\.\d+)"/.exec(features)?.[1]
  const mainScene = /run\/main_scene="([^"]+)"/.exec(text)?.[1]
  const autoloads = [...text.matchAll(/^([A-Za-z0-9_]+)="\*res:\/\/[^"]+"/gm)].map(match => match[1] ?? '')
  return { ...version ? { version } : {}, ...mainScene ? { mainScene } : {}, autoloads: autoloads.slice(0, 20) }
}

export interface Frontmatter {
  data: Record<string, unknown>
  body: string
}

export function readFrontmatter(text: string): Frontmatter {
  const normalized = text.replace(/^\uFEFF/, '')
  if (!normalized.startsWith('---')) return { data: {}, body: normalized }
  const end = normalized.indexOf('\n---', 3)
  if (end < 0) return { data: {}, body: normalized }
  const raw = normalized.slice(3, end).trim()
  const body = normalized.slice(end + 4).replace(/^\r?\n/, '')
  let data: Record<string, unknown> = {}
  try {
    const parsed: unknown = parseYaml(raw)
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) data = parsed as Record<string, unknown>
  } catch {
    data = {}
  }
  return { data, body }
}

export interface Story {
  slug: string
  path: string
  status: string
  updated?: string
  title: string
  hasAcceptance: boolean
  body: string
  mtimeMs: number
}

export function listStories(root: string, studio: Studio): Story[] {
  const dir = join(root, studio.story_dir)
  if (!existsSync(dir)) return []
  const out: Story[] = []
  for (const entry of readdirSync(dir)) {
    if (!entry.endsWith('.md') || entry.startsWith('_')) continue
    const path = join(dir, entry)
    const stat = statSync(path)
    if (!stat.isFile()) continue
    const raw = readFileSync(path, 'utf8')
    const { data, body } = readFrontmatter(raw)
    const status = typeof data.status === 'string' ? data.status : ''
    const updated = typeof data.updated === 'string' ? data.updated : undefined
    const title = /^#\s+(.+)$/m.exec(body)?.[1]?.trim() ?? basename(entry, '.md')
    out.push({
      slug: basename(entry, '.md'),
      path,
      status,
      ...updated ? { updated } : {},
      title,
      hasAcceptance: /^##\s+Acceptance\b/m.test(body),
      body,
      mtimeMs: stat.mtimeMs,
    })
  }
  return out.sort((a, b) => a.slug.localeCompare(b.slug))
}

/** Files under a directory, relative to it; empty when the directory is absent. */
export function listFiles(dir: string, depth = 3): string[] {
  if (!existsSync(dir)) return []
  const out: string[] = []
  const walk = (current: string, level: number): void => {
    if (level > depth) return
    for (const entry of readdirSync(current)) {
      const path = join(current, entry)
      const stat = statSync(path)
      if (stat.isDirectory()) walk(path, level + 1)
      else out.push(relative(dir, path).replaceAll('\\', '/'))
    }
  }
  walk(dir, 1)
  return out.sort()
}

export function evidenceDir(root: string, studio: Studio, slug: string): string {
  return join(root, studio.evidence_dir, slug)
}

/** A repository path with forward slashes, as every studio document requires. */
export function repoPath(...parts: string[]): string {
  return parts.join('/').replaceAll('\\', '/')
}

export interface EvidenceState {
  ok: boolean
  reason?: string
}

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** True when the file starts with the PNG signature; a renamed text file is not a screenshot. */
export function isPng(path: string): boolean {
  let fd: number | undefined
  try {
    fd = openSync(path, 'r')
    const head = Buffer.alloc(PNG_MAGIC.length)
    const read = readSync(fd, head, 0, head.length, 0)
    return read === head.length && head.equals(PNG_MAGIC)
  } catch {
    return false
  } finally {
    if (fd !== undefined) closeSync(fd)
  }
}

/**
 * Whether a story's evidence directory can close it: an index.md whose
 * `Run result:` line says OBSERVED or N/A. A NOT VERIFIED index, a bare
 * screenshot, or a stray log is not closing evidence.
 */
export function closingEvidence(dir: string): EvidenceState {
  if (listFiles(dir).length === 0) return { ok: false, reason: 'the evidence directory contains no files' }
  const index = join(dir, 'index.md')
  if (!existsSync(index)) return { ok: false, reason: 'the evidence directory has no index.md' }
  const text = readFileSync(index, 'utf8')
  const line = /^Run result:\s*(.*)$/m.exec(text)?.[1]?.trim() ?? ''
  if (line.length === 0) return { ok: false, reason: 'the evidence index has no Run result: line' }
  const value = line.toUpperCase()
  if (!value.startsWith('OBSERVED') && !value.startsWith('N/A')) {
    return { ok: false, reason: `the evidence index says "${line}"` }
  }
  return { ok: true }
}
