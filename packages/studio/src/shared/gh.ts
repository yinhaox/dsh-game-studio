import type { Commands } from './superagent.ts'

/** One workflow run as `gh run list --json` reports it. */
export interface WorkflowRun {
  conclusion?: string
  status?: string
  headSha?: string
  url?: string
  updatedAt?: string
}

/** Parse the JSON a `gh` command prints. */
export async function ghJson<T>(commands: Commands, args: string[], cwd: string): Promise<T> {
  return JSON.parse(await commands.run('gh', args, cwd)) as T
}

/** The latest workflow run on a branch, or undefined when the repository has none. */
export async function latestWorkflowRun(commands: Commands, cwd: string, branch: string): Promise<WorkflowRun | undefined> {
  const runs = await ghJson<WorkflowRun[]>(commands,
    ['run', 'list', '--branch', branch, '--limit', '1', '--json', 'conclusion,status,headSha,url,updatedAt'], cwd)
  return Array.isArray(runs) ? runs[0] : undefined
}

/** True for a conclusion that means the run failed rather than skipped or succeeded. */
export function isFailingConclusion(conclusion: string | undefined): boolean {
  return conclusion === 'failure' || conclusion === 'cancelled' || conclusion === 'timed_out' || conclusion === 'action_required'
}
