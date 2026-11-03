import type {} from '@deepseek-ai/cordis'
import type { SourceHost } from './superagent.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** superagent's Source host service; present in a profile that mounts dsh-superagent. */
    orchestrator: SourceHost
  }
}
