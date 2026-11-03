import { createHash } from 'node:crypto'
import { PRODUCER_ACTOR } from './actor.ts'
import type { Trigger } from './superagent.ts'

/** Deterministic key for ids and fingerprints. */
export function stableKey(...parts: Array<string | number | boolean | undefined>): string {
  return createHash('sha256')
    .update(parts.map(part => String(part ?? '')).join('\u0000'))
    .digest('hex')
    .slice(0, 24)
}

export interface StudioTriggerInput {
  /** The Source kind that produces it, e.g. `studio-evidence`. */
  kind: string
  /** The check name, stable across releases. */
  check: string
  /** The subject the finding is about, e.g. a story slug or a commit SHA. */
  subject: string
  /** The state fingerprint; a changed state produces a new Trigger id. */
  fingerprint: string
  text: string
  meta?: Record<string, unknown>
  at?: string
}

/**
 * Build a proactive Trigger. It is always non-human, so it can only become an
 * inferred candidate; the engine drops identical ids, which is what keeps a
 * standing condition from re-opening work until its state changes.
 */
export function studioTrigger(input: StudioTriggerInput): Trigger {
  return {
    id: stableKey('studio', input.kind, input.check, input.subject, input.fingerprint),
    source: input.kind,
    threads: [{ source: input.kind, id: `${input.check}:${input.subject}` }],
    actor: { source: input.kind, id: PRODUCER_ACTOR },
    human: false,
    at: input.at ?? new Date().toISOString(),
    text: input.text,
    meta: { check: input.check, subject: input.subject, fingerprint: input.fingerprint, ...input.meta },
  }
}
