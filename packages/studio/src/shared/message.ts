import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { UserMessage } from '@deepseek-ai/dsh-session'

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'studio-guard': { kind: 'studio-guard'; form: 'instructions' }
  }
}

/** One model-visible instruction message attributed to the studio guards. */
export function studioMessage(text: string): UserMessage {
  return createUserMessage({
    content: [{ type: 'text', text }],
    source: { kind: 'studio-guard', form: 'instructions' },
  })
}
