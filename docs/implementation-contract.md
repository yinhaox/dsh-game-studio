# 实现契约（dsh-game-studio）

本文件是多智能体协作的唯一事实源。子代理只读本文件与相关源码，只写自己名下的文件。

## 1. 工程事实

- 仓库根：`C:\Code\Other\dsh-game-studio`
- 包：`packages/studio`（`@local/dsh-game-studio`），单包多入口。
- 共享代码：`packages/studio/src/shared/`，**只由主代理修改**。
- 测试：`packages/studio/tests/*.spec.ts`，vitest，运行 `pnpm -C packages/studio test`。
- 构建：`pnpm -C packages/studio build`（tsdown），类型检查 `pnpm -C packages/studio typecheck`。
- 不联网、不装包、不跑 git 命令（含 commit/checkout）；不修改别人名下的文件。
- 不依赖 Godot、`gh`、网络：测试必须自包含（临时目录 + 假对象）。

## 2. 共享模块（只读，不得修改）

| 文件 | 提供 |
|---|---|
| `src/shared/superagent.ts` | `Trigger`、`SourceContext`、`SourceKind`、`SourceHost`、`Health`、`FieldSpec`、`PolicyRow`、`ScopeResult` |
| `src/shared/actor.ts` | `PRODUCER_ACTOR = 'studio-producer'`、`PRODUCER_BOT` |
| `src/shared/trigger.ts` | `studioTrigger({ kind, check, subject, fingerprint, text, meta? })` |
| `src/shared/poll.ts` | `pollSource(ctx, { kind, healthEntry, intervalSeconds, enabled, run, failureLimit? }, signal)` |
| `src/shared/studio.ts` | `StudioSchema`、`loadStudio(root)`、`readProjectGodot(root)`、`readFrontmatter`、`listStories`、`listFiles`、`evidenceDir` |
| `src/shared/gh.ts` | `latestWorkflowRun`、`isFailingConclusion`、`ghJson` |
| `src/shared/text.ts` | `oneLine`、`clipLines` |
| `src/shared/guard.ts` | `sessionCwd`、`filePathOf`、`absolutePath`、`isWithin`、`relativePath`、`readTextIfExists`、`matchesGlobs`、`globToRegExp` |
| `src/shared/message.ts` | `studioMessage(text)`（模型可见的用户消息） |
| `src/shared/context.ts` | 给 `ctx.orchestrator` 的模块增强 |

## 3. Source 插件契约（三个入口）

入口文件：`src/producer/<name>/index.ts`，必须导出 `name`、`inject = ['orchestrator']`、`apply(ctx)`，并导出可单测的检查函数。

**硬性要求**

- `kind` 必须等于入口对应值：`studio-evidence` / `studio-ci` / `studio-project`。
- `health` 数组恰好一个条目，名字与 kind 相同；只通过 `ctx.report(entry, health)` 写这个条目。
- `scope` 返回 `{ listened: true, observed: true, row: 'studio' }`。
- `policy.schema` 必须包含 `allowed`（默认 `[]`）与 `bots`（默认 `[PRODUCER_BOT]`），`.strict()`。
- `policy.rows` 返回一行：`{ id: 'studio', label: 'Studio producer', note: {...}, cells: { listedUnaddressed: false, unlistedAddressed: false, unlistedUnaddressed: false } }`。
- 触发器一律用 `studioTrigger(...)`，因此 `human: false`、actor `studio-producer`；**不设 channel**。
- `apply` 用两个 `ctx.effect`：注册 kind；启动可中止的轮询循环并在 disposer 里 `abort` + await。
- 轮询用 `pollSource`，`run` 里调用导出的检查函数；检查函数签名：`(ctx: SourceContext, config: Config, signal: AbortSignal) => Promise<string>`，返回健康详情（一句话）。
- 同一状态不得重复产生新 id：`fingerprint` 必须随状态变化。状态未变时再次 `receive` 会得到 `duplicate`，这是预期行为，但不要每次轮询都换 fingerprint。

**参考骨架**

```ts
import type { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
import { PRODUCER_BOT } from '../../shared/actor.ts'
import { pollSource } from '../../shared/poll.ts'
import { studioTrigger } from '../../shared/trigger.ts'
import type { SourceContext, SourceKind } from '../../shared/superagent.ts'

const ConfigSchema = z.object({
  enabled: z.boolean().default(true),
  checkout: z.string().default(''),
  intervalSeconds: z.number().int().min(60).max(86_400).default(600),
}).strict()
type Config = z.infer<typeof ConfigSchema>

export const kind: SourceKind<Config> = {
  kind: 'studio-evidence',
  title: { zh: '工作室证据检查', en: 'Studio evidence checks' },
  description: { zh: '……', en: '…' },
  schema: ConfigSchema,
  fields: [
    { key: 'enabled', type: 'switch', label: { zh: '启用', en: 'Enabled' } },
    { key: 'checkout', type: 'text', label: { zh: '仓库路径', en: 'Checkout path' } },
    { key: 'intervalSeconds', type: 'number', min: 60, max: 86_400, label: { zh: '间隔', en: 'Interval' } },
  ],
  health: ['studio-evidence'],
  scope: () => ({ listened: true, observed: true, row: 'studio' }),
  policy: {
    schema: z.object({
      allowed: z.array(z.object({ id: z.string(), name: z.string().optional() }).strict()).default([]),
      bots: z.array(z.object({ id: z.string(), name: z.string().optional() }).strict()).default([PRODUCER_BOT]),
    }).strict(),
    fields: [
      { key: 'allowed', type: 'rows', label: { zh: '可发起工作的人', en: 'People who may originate work' },
        columns: [{ key: 'id', type: 'text', label: { zh: 'ID', en: 'ID' } }] },
      { key: 'bots', type: 'rows', label: { zh: '可作为候选的机器人', en: 'Bots whose messages may become candidates' },
        columns: [{ key: 'id', type: 'text', label: { zh: 'ID', en: 'ID' } }] },
    ],
    explicit: { zh: '不适用：该来源只产生推断候选。', en: 'Not applicable: this Source only produces inferred candidates.' },
    rows: () => [{ id: 'studio', label: 'Studio producer',
      note: { zh: '工作室制作人产生的检查项', en: 'Findings produced by the studio producer' },
      cells: { listedUnaddressed: false, unlistedAddressed: false, unlistedUnaddressed: false } }],
  },
}

export async function runCheck(ctx: SourceContext, config: Config, signal: AbortSignal): Promise<string> {
  // 读文件、构造 trigger、ctx.receive(...)、ctx.threads.describe(...)
  return 'checked'
}

export const name = 'dsh-game-studio/source-evidence'
export const inject = ['orchestrator']
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.orchestrator.sources.register(kind), 'studio-evidence: source kind')
  ctx.effect(() => {
    const source = ctx.orchestrator.context(kind)
    const controller = new AbortController()
    const running = pollSource(source, {
      kind: kind.kind,
      healthEntry: 'studio-evidence',
      intervalSeconds: config => config?.intervalSeconds ?? 600,
      enabled: config => config.enabled && config.checkout.length > 0,
      run: (config, signal) => runCheck(source, config, signal),
    }, controller.signal).catch((error: unknown) => {
      source.report('studio-evidence', { state: 'error', detail: String(error) })
    })
    return async () => { controller.abort(); await running }
  }, 'studio-evidence: checks')
}
```

**各 Source 的检查与指纹**

| 入口 | 读什么 | 何时触发 | fingerprint |
|---|---|---|---|
| `source-evidence` | `studio.yaml` 的 `story_dir`/`evidence_dir`；故事 frontmatter `status`；证据目录的 `index.md` 与 `Run result:` | `status: done` 且证据无法收口（无 `index.md` 或为 `NOT VERIFIED`） | `hash(故事正文, status)`，与 checkout 时间无关 |
| `source-ci` | `gh run list --branch <branch> --limit 1 --json conclusion,status,headSha,url,updatedAt` | 结论属于失败类且 `updatedAt` 早于 `graceMinutes` | `headSha + conclusion + updatedAt`（重跑会变） |
| `source-project` | `studio.yaml.check_command`；`project.godot` 与 `studio.yaml.godot.version` | 命令非零退出；或版本前缀不一致（如 `4.7` vs `4.6`） | `hash(退出码, 输出前 200 字符)` / `版本对` |

`source-project` 执行 shell 命令：用 `node:child_process.exec`（`cwd: config.checkout`、`timeout: 120000`、`maxBuffer: 1MB`），不经过 `ctx.commands`（后者不做 shell 解析）。命令缺失时返回 `"no check_command configured"` 且不触发。

## 4. Guard 插件契约（四个入口）

入口：`src/guard/<name>/index.ts`，导出 `name`、`apply(ctx)`。**不新增模型工具**，只挂事件。

| 入口 | 事件 | 行为 | 失败处理 |
|---|---|---|---|
| `guard-facts` | `agent/pre-step` | 若 `sessionCwd(agent)` 含 `project.godot`，每会话注入一次项目事实（≤2KB）：版本、主场景、autoload、check/test/run/capture 命令、证据目录 | 读不到文件则不动 |
| `guard-rules` | `tools/result` 记录触碰；`agent/pre-step` 注入 | 触碰 `write`/`edit` 的 `file_path` 后，匹配 `<cwd>/.dsh/rules/*.md` 的 `paths:` glob，把命中规则注入下一步；按 `(path, mtime)` 去重 | 解析失败仅记日志 |
| `guard-writes` | `tools/pre-execute` | 拒写：cwd 之外的路径；`.godot/` 下；`*.import`；`export_presets.cfg`；`.git/` 下 | 返回 `{ kind: 'deny', reason }` |
| `guard-docs` | `tools/post-execute` | 故事文件必须有 `status` 与 `## Acceptance`；`status: done` 必须有能收口的证据（`index.md` + `Run result: OBSERVED/N/A`）；证据 PNG 必须有 PNG 签名且 ≥1024 字节；`Run result:` 为 `NOT VERIFIED` 阻断 | 返回 `{ kind: 'block', feedback: [{ type: 'text', text }] }` |

**事件签名**（从 `@deepseek-ai/dsh-agent` / `@deepseek-ai/dsh-tools` 导入类型）：

```ts
ctx.on('agent/pre-step', async (payload, next): Promise<PreStepDecision> => {
  const decision = await next()
  if (decision.kind !== 'enter') return decision
  return { ...decision, messages: [...decision.messages, studioMessage('...')] }
})

ctx.on('tools/pre-execute', async (exec, next): Promise<PreToolDecision> => {
  if (exec.name !== 'write' && exec.name !== 'edit') return next()
  return { kind: 'deny', reason: '...' }
})

ctx.on('tools/post-execute', async (exec, result, next): Promise<PostToolDecision> => {
  const downstream = await next()
  if (downstream.kind === 'block') return downstream
  return { kind: 'block', feedback: [{ type: 'text', text: '...' }] }
})

ctx.on('tools/result', (exec, result) => { /* 只观察，不返回 */ })
```

注意：

- `agent/pre-step` 的 `payload.agent` 取会话目录用 `sessionCwd(payload.agent)`。
- 去重状态用 `WeakMap`/`Map` 按 `agent.id` 保存；不要用全局可变状态跨会话混用。
- **只有 guard-docs 可以说"不"**；其余 guard 不阻断正常写入。
- 事实/规则文本用中文还是英文？用英文（模型指令一致性），标题行标注 `[studio]`。

## 5. 测试契约

- 每个入口一个 spec：`tests/<entry>.spec.ts`。
- 用假 `Context`：`{ effect, on, logger, orchestrator }`，`on` 收集监听器，测试里手动触发。
- Source：导出 `runCheck`，用 `mkdtemp` + `writeFile` 造夹具；断言 `receive` 收到的 trigger（id、text、thread）、fingerprint 稳定性、无变化不重发。
- Guard：构造假 `exec`（`name`、`arguments.file_path`、`agent.session.header.cwd`）与假 `next`；断言 deny/block/注入消息。
- 不 mock 时间做无限循环；不要调用 `apply` 里的轮询循环（只测 `runCheck`）。
- 全部测试不得需要网络、Godot、`gh`。

## 6. 完成定义

- 入口文件、测试文件都写完；`pnpm -C packages/studio test` 通过（本文件+自己的 spec）。
- 不修改 `src/shared/`、`package.json`、`tsdown.config.ts`、`cordis.patch.yml`。
- 交付说明：列出写了哪些文件、测试命令与结果、未决问题（如有）。
