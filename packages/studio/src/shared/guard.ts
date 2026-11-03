import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'

/** The session's working directory, falling back to the process directory. */
export function sessionCwd(agent: unknown): string {
  const session = (agent as { session?: { header?: { cwd?: string } } } | undefined)?.session
  return session?.header?.cwd ?? process.cwd()
}

/** The `file_path` argument of a file tool execution, when present. */
export function filePathOf(execution: { arguments?: unknown }): string | undefined {
  const value = (execution.arguments as { file_path?: unknown } | undefined)?.file_path
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

export function absolutePath(cwd: string, filePath: string): string {
  return isAbsolute(filePath) ? filePath : resolve(cwd, filePath)
}

/** True when `target` is inside `root` (or is `root`). */
export function isWithin(root: string, target: string): boolean {
  const rel = relative(root, target)
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !rel.startsWith('../') && !isAbsolute(rel))
}

/**
 * Containment after resolving symlinks and junctions. The deepest existing
 * ancestor of `target` is canonicalized, and the missing tail is appended, so
 * a link inside the worktree cannot point the check at a different tree.
 */
export function realWithin(root: string, target: string): boolean {
  try {
    // A session directory that does not exist yet cannot be canonicalized; the
    // lexical check is the only meaningful answer then.
    if (!existsSync(root)) return isWithin(root, target)
    const realRoot = realpathSync.native(root)
    let current = target
    const tail: string[] = []
    while (!existsSync(current)) {
      const parent = dirname(current)
      if (parent === current) return false
      tail.unshift(basename(current))
      current = parent
    }
    const real = join(realpathSync.native(current), ...tail)
    const fold = (path: string): string => process.platform === 'win32' ? path.toLowerCase() : path
    return isWithin(fold(realRoot), fold(real))
  } catch {
    return false
  }
}

/** Path relative to the working directory, with forward slashes. */
export function relativePath(cwd: string, target: string): string {
  return relative(cwd, target).split(sep).join('/')
}

export function readTextIfExists(path: string): string | undefined {
  return existsSync(path) ? readFileSync(path, 'utf8') : undefined
}

/** Expand `{a,b}` groups once, enough for the studio rule globs. */
function expandBraces(pattern: string): string[] {
  const match = /\{([^{}]+)\}/.exec(pattern)
  if (match === null) return [pattern]
  const [whole, body = ''] = match
  return body.split(',').flatMap(part =>
    expandBraces(pattern.slice(0, match.index) + part + pattern.slice(match.index + whole.length)))
}

/** Convert one glob to an anchored regular expression. */
export function globToRegExp(glob: string): RegExp {
  let out = ''
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index] ?? ''
    if (char === '*') {
      if (glob[index + 1] === '*') {
        index += 1
        if (glob[index + 1] === '/') {
          index += 1
          out += '(?:[^/]+/)*'
        } else {
          out += '.*'
        }
      } else {
        out += '[^/]*'
      }
    } else if (char === '?') {
      out += '[^/]'
    } else if ('\\^$+.()|[]{}'.includes(char)) {
      out += `\\${char}`
    } else {
      out += char
    }
  }
  return new RegExp(`^${out}$`)
}

/** True when a repo-relative path matches one of the globs. */
export function matchesGlobs(globs: readonly string[], path: string): boolean {
  const normalized = path.replaceAll('\\', '/').replace(/^\.\//, '')
  return globs.some(glob => expandBraces(glob.replace(/^\.\//, '')).some(expanded => globToRegExp(expanded).test(normalized)))
}
