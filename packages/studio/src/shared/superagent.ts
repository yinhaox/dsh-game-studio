/**
 * Structural mirror of the superagent Source protocol as used by third-party
 * plugins. The upstream package does not export these types (see the pinned
 * commit in `compat.json`), so the shapes are declared here and checked by
 * `scripts/compat-check.py` against `src/sources/host.ts` and `src/sources/kind.ts`.
 */
import type { z } from 'zod'

export interface Localized {
  zh: string
  en: string
}

export interface FieldOption {
  value: string
  label: Localized
}

export interface RowColumn {
  key: string
  label: Localized
  type: 'text' | 'select'
  pattern?: string
  optional?: boolean
  options?: FieldOption[]
}

export type FieldSpec =
  | { key: string; type: 'switch'; label: Localized; hint?: Localized; advanced?: true }
  | { key: string; type: 'select'; label: Localized; hint?: Localized; advanced?: true; options: FieldOption[] }
  | { key: string; type: 'number'; label: Localized; hint?: Localized; advanced?: true; min: number; max: number }
  | { key: string; type: 'text'; label: Localized; hint?: Localized; advanced?: true; pattern?: string; readonly?: boolean }
  | { key: string; type: 'fact'; label: Localized; hint?: Localized; advanced?: true; settings?: 'deployment' }
  | { key: string; type: 'rows'; label: Localized; hint?: Localized; advanced?: true; columns: RowColumn[] }

export interface ThreadRef {
  source: string
  id: string
}

export interface ActorRef {
  source: string
  id: string
}

export interface ChannelRef {
  source: string
  thread: string
  address: Record<string, string>
}

/** One immutable event produced by a Source. `text` and `meta` are untrusted external data. */
export interface Trigger {
  id: string
  source: string
  threads: ThreadRef[]
  actor: ActorRef
  human: boolean
  addressed?: 'mention' | 'direct'
  at: string
  text: string
  channel?: ChannelRef
  url?: string
  meta: Record<string, unknown>
}

export type ReceiveResult = 'stored' | 'duplicate' | 'filtered'

export interface Health {
  state: 'starting' | 'ready' | 'paused' | 'error'
  detail: string
  at?: string
  code?: string
  values?: Record<string, string>
}

export interface ThreadFact {
  label?: Localized | string
  value: Localized | string
  problem?: true
}

export interface ThreadDescription {
  label?: string
  url?: string
  facts?: Record<string, ThreadFact | null>
}

/** The CLI transport a Source receives; runs a program as the deployment's accounts. */
export interface Commands {
  run(program: string, args: string[], cwd?: string): Promise<string>
  /** A transport bound to one caller's lifetime; an absent method means the call is not cancellable. */
  withSignal?(signal?: AbortSignal): Commands
}

export interface StateStore {
  get<V>(key: string): V | undefined
  set<V>(key: string, value: V | undefined): void
}

/** Application capabilities exposed to one Source kind. */
export interface SourceContext {
  readonly commands: Commands
  readonly ready: Promise<void>
  configured(): boolean
  config<C extends Record<string, unknown>>(kind: string): C | undefined
  receive(trigger: Trigger): ReceiveResult | Promise<ReceiveResult>
  atomic<T>(work: () => T): T
  state: StateStore
  threads: {
    describe(key: string, description: ThreadDescription): void
  }
  report(entry: string, health: Health): void
}

/** The registry surface a Source plugin uses to claim its kind. */
export interface SourceRegistryLike {
  register(kind: SourceKind): () => void
}

/** The `orchestrator` service superagent provides; Sources register their kind through it. */
export interface SourceHost {
  readonly sources: SourceRegistryLike
  context(kind: { kind: string; health: readonly string[] }): SourceContext
}

export type ScopeResult =
  | { listened: true; observed: boolean; row?: string }
  | { listened: false; reason: string }

export interface PolicyRow {
  id: string
  label: Localized | string
  note: Localized
  cells: { listedUnaddressed: boolean; unlistedAddressed: boolean; unlistedUnaddressed: boolean }
}

export interface SourcePolicyPart {
  schema: z.ZodType
  fields: FieldSpec[]
  explicit: Localized
  rows?(config: Record<string, unknown>): PolicyRow[]
}

/** Pluggable source kind descriptor registered with the SourceRegistry. */
export interface SourceKind<C extends Record<string, unknown> = Record<string, unknown>> {
  kind: string
  title: Localized
  description: Localized
  schema: z.ZodType<C>
  fields: FieldSpec[]
  health: string[]
  scope?(input: { meta: Record<string, unknown> }, config: C): ScopeResult
  policy?: SourcePolicyPart
}
