/**
 * Facts guard: inject one compact block of repository facts before an agent's
 * first step, once per agent and only when the working directory is a Godot
 * project. Later steps are left untouched, so the facts never crowd a
 * conversation that already knows them.
 */
import type { Context } from '@deepseek-ai/cordis'
import type { PreStepDecision } from '@deepseek-ai/dsh-agent'
import { sessionCwd } from '../../shared/guard.ts'
import { studioMessage } from '../../shared/message.ts'
import { loadStudio, readProjectGodot } from '../../shared/studio.ts'
import { oneLine } from '../../shared/text.ts'

export const name = 'dsh-game-studio/guard-facts'

/** The block is model instructions; keep it small enough to never dominate a step. */
const MAX_FACTS_CHARS = 1990

function commandLine(label: string, value: string | undefined): string {
  const command = value === undefined ? '' : oneLine(value, 200)
  return `${label}: ${command === '' ? '(not configured in studio.yaml)' : command}`
}

/**
 * The facts a worker needs about the repository: engine version, main scene,
 * autoloads, the four studio commands and the evidence directory. Undefined
 * when the directory is not a Godot project.
 */
export function factsText(cwd: string): string | undefined {
  try {
    const project = readProjectGodot(cwd)
    if (project === undefined) return undefined
    const studio = loadStudio(cwd)
    const engine = project.version ?? studio?.godot.version ?? 'unknown'
    const autoloads = project.autoloads.length > 0 ? project.autoloads.join(', ') : '(none)'
    const lines = [
      '[studio] Project facts, read from project.godot and studio.yaml. Do not edit those files.',
      `Engine: Godot ${engine}`,
      `Main scene: ${project.mainScene ?? '(not set)'}`,
      `Autoloads: ${autoloads}`,
      commandLine('Check', studio?.check_command),
      commandLine('Test', studio?.test_command),
      commandLine('Run', studio?.run_command),
      commandLine('Capture', studio?.capture_command),
      `Evidence dir: ${studio?.evidence_dir ?? 'production/qa/evidence'}`,
      'Run these commands as written; evidence must come from a real run.',
    ]
    const text = lines.join('\n')
    return text.length <= MAX_FACTS_CHARS ? text : `${text.slice(0, MAX_FACTS_CHARS - 1)}…`
  } catch {
    // A missing or unreadable project file is not an error for this guard.
    return undefined
  }
}

/**
 * Append the facts message to the first step of each agent whose session
 * directory holds a `project.godot`. Agent ids are remembered in a per-plugin
 * Set so one agent is served exactly once.
 */
export function apply(ctx: Context): void {
  const injected = new Set<string>()
  ctx.on('agent/pre-step', async (payload, next): Promise<PreStepDecision> => {
    const decision = await next()
    if (decision.kind !== 'enter') return decision
    // A first step with no admitted message owns a no-op turn; do not turn it
    // into a model call that contains only the facts.
    if (payload.step === 1 && decision.messages.length === 0) return decision
    const id = payload.agent.id
    if (id.length === 0 || injected.has(id)) return decision
    const text = factsText(sessionCwd(payload.agent))
    if (text === undefined) return decision
    injected.add(id)
    return { ...decision, messages: [...decision.messages, studioMessage(text)] }
  })
}
