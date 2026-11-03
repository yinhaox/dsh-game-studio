import type { Commands } from './superagent.ts'

/** One workflow run as `gh run list --json` reports it. */
export interface WorkflowRun {
  conclusion?: string
  status?: string
  headSha?: string
  url?: string
  updatedAt?: string
  databaseId?: number
}

/** Parse the JSON a `gh` command prints. */
export async function ghJson<T>(commands: Commands, args: string[], cwd: string): Promise<T> {
  return JSON.parse(await commands.run('gh', args, cwd)) as T
}

/** The latest workflow run on a branch, or undefined when the repository has none. */
export async function latestWorkflowRun(commands: Commands, cwd: string, branch: string): Promise<WorkflowRun | undefined> {
  const runs = await ghJson<WorkflowRun[]>(commands,
    ['run', 'list', '--branch', branch, '--limit', '1', '--json', 'conclusion,status,headSha,url,updatedAt,databaseId'], cwd)
  return Array.isArray(runs) ? runs[0] : undefined
}

/** One job of a run, as `gh run view --json jobs` reports it. */
export interface WorkflowJob {
  name?: string
  conclusion?: string
  steps?: { name?: string; conclusion?: string }[]
}

/**
 * The failing jobs of one run and the first step that failed in each. A
 * candidate that names the job and the step lets an assessment match a work
 * type; a bare "CI is red" cannot.
 */
export async function failingJobs(commands: Commands, cwd: string, runId: number): Promise<string[]> {
  const view = await ghJson<{ jobs?: WorkflowJob[] }>(commands, ['run', 'view', String(runId), '--json', 'jobs'], cwd)
  const lines: string[] = []
  for (const job of view.jobs ?? []) {
    if (job.conclusion !== 'failure' && job.conclusion !== 'cancelled' && job.conclusion !== 'timed_out') continue
    const step = (job.steps ?? []).find(item => item.conclusion === 'failure')
    const name = job.name ?? 'unnamed job'
    lines.push(step?.name ? `${name} failed at step "${step.name}"` : `${name} failed`)
    if (lines.length >= 3) break
  }
  return lines
}

/** True for a conclusion that means the run failed rather than skipped or succeeded. */
export function isFailingConclusion(conclusion: string | undefined): boolean {
  return conclusion === 'failure' || conclusion === 'cancelled' || conclusion === 'timed_out' || conclusion === 'action_required'
}
