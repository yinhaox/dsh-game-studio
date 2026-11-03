import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { PreStepDecision } from '@deepseek-ai/dsh-agent'
import type { ToolExecution, ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import {
  absolutePath,
  filePathOf,
  matchesGlobs,
  readTextIfExists,
  relativePath,
  sessionCwd,
} from '../../shared/guard.ts'
import { studioMessage } from '../../shared/message.ts'
import { readFrontmatter } from '../../shared/studio.ts'

/** One `.dsh/rules/*.md` file: the globs it claims and the instruction body. */
export interface RuleFile {
  /** Absolute path of the rule file. */
  path: string
  /** Repo-relative globs from the `paths:` frontmatter list. */
  globs: string[]
  /** Everything after the frontmatter. */
  body: string
  /** Modification time, used to decide whether a rule was already injected. */
  mtimeMs: number
}

/** Longest body a single injected rule message may carry. */
const MAX_BODY_CHARS = 4000

/** Rule files larger than this are skipped before reading; a body past the cap is useless anyway. */
const MAX_RULE_BYTES = 64 * 1024

/** Per-agent bookkeeping: what the agent touched, and which rule versions it already saw. */
interface AgentRuleState {
  touched: Set<string>
  injected: Set<string>
}

function normalizeGlobs(value: unknown): string[] {
  if (typeof value === 'string') return value.trim().length > 0 ? [value.trim()] : []
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string')
    .map(item => item.trim())
    .filter(item => item.length > 0)
}

/** Read every rule file under `<cwd>/.dsh/rules`; unreadable or malformed files are skipped. */
export function loadRules(cwd: string): RuleFile[] {
  const dir = join(cwd, '.dsh', 'rules')
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return []
  }
  const rules: RuleFile[] = []
  for (const entry of entries.sort()) {
    if (!entry.endsWith('.md')) continue
    const path = join(dir, entry)
    try {
      const stat = statSync(path)
      if (!stat.isFile() || stat.size > MAX_RULE_BYTES) continue
      const text = readTextIfExists(path)
      if (text === undefined) continue
      const { data, body } = readFrontmatter(text)
      rules.push({ path, globs: normalizeGlobs(data.paths), body, mtimeMs: stat.mtimeMs })
    } catch {
      // A malformed or vanishing rule file only skips itself.
    }
  }
  return rules
}

/** The dedupe key: one rule file at one version. */
function ruleKey(rule: RuleFile): string {
  return `${rule.path}\u0000${rule.mtimeMs}`
}

/** Cap a rule body so one instruction cannot flood the next step. */
function capBody(body: string): string {
  const trimmed = body.replace(/^\r?\n/, '').trimEnd()
  return trimmed.length <= MAX_BODY_CHARS ? trimmed : `${trimmed.slice(0, MAX_BODY_CHARS - 1)}…`
}

function ruleMessage(rule: RuleFile, cwd: string, target: string): string {
  return `[studio] Rule ${relativePath(cwd, rule.path)} applies to ${relativePath(cwd, target)}:\n${capBody(rule.body)}`
}

export const name = 'dsh-game-studio/guard-rules'

/**
 * Inject `.dsh/rules` instructions after the agent edits a file that a rule
 * claims. The guard only observes results and appends a message at the next
 * step boundary; it never denies a write.
 */
export function apply(ctx: Context): void {
  const states = new Map<string, AgentRuleState>()

  const stateOf = (id: string): AgentRuleState => {
    const existing = states.get(id)
    if (existing !== undefined) return existing
    // Bound the per-agent bookkeeping; the oldest agent is forgotten first.
    if (states.size >= 256) {
      const oldest = states.keys().next().value
      if (oldest !== undefined) states.delete(oldest)
    }
    const created: AgentRuleState = { touched: new Set<string>(), injected: new Set<string>() }
    states.set(id, created)
    return created
  }

  ctx.on('tools/result', (exec: Readonly<ToolExecution>, result: Readonly<ToolExecutionResult>) => {
    if (exec.name !== 'write' && exec.name !== 'edit') return
    if (result.isError) return
    const agent = exec.agent
    if (agent === undefined) return
    const filePath = filePathOf(exec)
    if (filePath === undefined) return
    stateOf(agent.id).touched.add(absolutePath(sessionCwd(agent), filePath))
  })

  ctx.on('agent/pre-step', async (payload, next): Promise<PreStepDecision> => {
    const decision = await next()
    if (decision.kind !== 'enter') return decision
    const state = stateOf(payload.agent.id)
    if (state.touched.size === 0) return decision
    const cwd = sessionCwd(payload.agent)
    const rules = loadRules(cwd)
    const injected: string[] = []
    for (const target of state.touched) {
      const relativeTarget = relativePath(cwd, target)
      for (const rule of rules) {
        if (!matchesGlobs(rule.globs, relativeTarget)) continue
        const key = ruleKey(rule)
        if (state.injected.has(key)) continue
        state.injected.add(key)
        injected.push(ruleMessage(rule, cwd, target))
      }
    }
    if (injected.length === 0) return decision
    return { ...decision, messages: [...decision.messages, ...injected.map(text => studioMessage(text))] }
  })
}
