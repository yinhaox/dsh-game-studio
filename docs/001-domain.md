# 001 领域：工作室概念与 dsh-superagent 的对应

队列、授权、隔离执行、追问、面板与恢复由 [dsh-superagent](../compat.json) 提供，本仓库不重写。工作室只补它缺的三样东西：主动发现欠账的 Source、工程守卫、工作室工艺（规则、提示段、剧本、角色、模板）。它的插件只实现三个 Source 与四个 Guard，见 [cordis.patch.yml](../packages/studio/cordis.patch.yml)。

所以先读 superagent 自己的领域文档，再把工作室词汇对上去。这一页只讲对应关系，以及三个工作室 Source 特有的几条规则。

## 概念对应

| 概念 | 在 dsh-superagent 里的含义 | 在工作室里是谁 |
|---|---|---|
| Source | 一条事件流。`kind` 是可复用的实现，实例是一份配置：是否运行、监听什么。它持有读取位置和自己的机器人身份 | 三个 kind：`studio-evidence`、`studio-ci`、`studio-project`（[src/producer](../packages/studio/src/producer)），外加 superagent 自带的 `github` Source，负责人与 agent 的对话 |
| Trigger | 一条不可变事件，带 actor 与 `human` 标记。同一个 id 只收一次 | 由 `studioTrigger()` 构造，id 是 `hash(kind, check, subject, fingerprint)`；`human: false`，actor 是 `studio-producer` |
| Thread | Trigger 的时间序列，同一 Thread 同时最多一个 Eval；工单通过 Subscription 关联到它 | 每条发现一个 Thread，例如 `evidence-missing:<story-slug>`；`ctx.threads.describe` 给面板标题和 facts |
| Eval | 对一批 Trigger 的判定，分 gate 与 assessment 两层，输出 Decision；每条启用的规则判一次 | `seed/policy.json` 的七条规则是 assessment 的输入；模式是 `off`/`observe`/`auto` |
| Ticket | 授权工作的单位。只有 Eval 能创建，引用 Mandate；它的状态不跟随 worker Session | 一张 GitHub issue/PR 背后的工单；工单本身由 superagent 管，仓库里看不到它 |
| Mandate | 接单授予的东西：policy 版本、范围、强度（`explicit`/`inferred`）、命中的规则、发送者在该 Source 的身份 | 人点名 → `explicit`；三个工作室 Source → 只能 `inferred` |
| Assignment | 把工单绑定到一个 Executor 实例（worker Session 加一个目录）；一个工单会有多个 | worker 在独立 worktree 里跑的那一段；只有最后一份 Report 能在 worker 侧结束工单 |
| Subscription | 工单与 Thread 的多对多关系，决定后续消息是否到达 worker；工单结束后仍保留 | PR 的 Thread 就是交付对话；人后来在 PR 上评论，可以恢复工单 |
| Report | worker 用 `orchestrator_report` 报的进展与结论；面板的工单阶段由它推出 | `progress`（含 `human_action` 提问）、`ready`、`blocked`、`dropped` 等，用法见 [003-playbooks.md](003-playbooks.md) |

## 三个工作室 Source 为什么只产生推断候选

它们读的是仓库和 CI，不是人的请求；actor 是 `studio-producer`，`human: false`。所以它们走推断路径：`observe` 模式下评估结果只记为「本来会接单」，`auto` 模式才接单，而且必须命中一条启用中的规则。

| kind | 读什么 | 何时产生候选 | fingerprint |
|---|---|---|---|
| `studio-evidence` | `studio.yaml` 的 `story_dir`/`evidence_dir`、故事 frontmatter 的 `status`、证据目录的 `index.md` 与 `Run result:` | 故事 `status: done`，但证据无法收口（无 `index.md`、或写成 `NOT VERIFIED`） | 故事正文与 `status`（与 checkout 时间无关） |
| `studio-ci` | `gh run list --branch <branch> --limit 1 --json conclusion,status,headSha,url,updatedAt` | 最近一次运行属于失败类，且 `updatedAt` 早于 `graceMinutes` | `headSha:conclusion` |
| `studio-project` | `studio.yaml.check_command`、`project.godot` 与 `studio.yaml.godot.version` | 命令非零退出；或版本前缀不一致（`4.7` 对 `4.6`） | `hash(退出码, 输出前 200 字符)`，或版本对 |

三条规则值得记住：

- **同一状态不重复开单。** fingerprint 不变，trigger 的 id 就不变，`receive` 返回 `duplicate`。main 一直红，只提醒一次；重新跑 CI、或修好后再红，fingerprint 变了才是新候选。
- **候选是文字，不是动作。** 每个候选带一句具体的话（哪个故事、哪个目录、哪个提交），让 Eval 有东西可判，也让人在面板上能读懂。
- **健康是每个 Source 一条。** 名字与 `kind` 相同，只有它自己写。连续三轮失败才报 `error`，一次成功就复位；`checkout` 没填则报 `paused`。

## 为什么没有 Channel

Channel 是 Thread 的写侧：回帖、评论回复、PR 都是写。三个工作室 Source 只读——它们不评论、不建 PR、不 @ 人，所以不声明 Channel，trigger 上也没有 `channel`。policy 的 `explicit` 字段因此写着「不适用：该来源只产生推断候选」。

这样做是为了让写侧只有两条路径：

- superagent 的 GitHub Source 负责在工单的对话里说话；
- worker 的 PR 负责交付。

如果检查器自己发评论，就会和 worker 抢同一段对话：检查器说「证据缺失」，worker 说「已补」，人看到互相矛盾的两条。候选必须先经 Eval 变成工单，回复走工单的 Channel，结果落在 PR 上。要观察检查器，看面板的 Source 卡片和健康条目，不要在 GitHub 上多开一条机器人评论。

## 一张工单怎么结束

完成由 PR 表达，而不是由 `ready` 报告表达：

- 工单跟随它开的 PR（包括从它的分支开出来的 PR）。它开的 PR 全部关闭，工单才结束，并取最后一次关闭的结果。没有 PR 的 `ready` 报告，才算直接完成。
- 合并的人是人。`delivery.md` 里的自动合并例外极窄：≤200 改动行、已获必要批准、`Verification` 通过、证据是 `OBSERVED`，而且只限 worker 自己实现的 story。
- 故事的 `status: done` 只是仓库内的记录，不能结束工单；反过来，工单结束也不改写证据。
- 工单结束后保留 Subscription。人在 PR 上再发一条评论，工单在同一个 Mandate 下恢复，不重新评估；但推断 Mandate 还要求当前 policy 与 `auto` 模式仍然成立。
- 被 `studio-evidence` 抓到的「done 但没证据」就是这样闭环的：候选 → 工单 → `studio-evidence` 剧本补证据 → PR → 人合并 → PR 关闭 → 工单结束。

```text
   GitHub issue/PR                       三个工作室 Source
   人 @agent，在允许名单上                   轮询仓库与 CI，human: false
         │                                       │
         ▼                                       ▼
   Trigger(human: true)                  Trigger(human: false)
         │                                       │
         └──────────────┬────────────────────────┘
                        ▼
        Eval（seed/policy.json 的七条规则，mode = observe | auto）
          · 不在允许名单 → 丢弃
          · 推断候选且 observe → 只记「本来会接单」
                        │ accept，附 Mandate
                        ▼
                     Ticket ── Assignment ──► worker Session
                        │                     （独立 worktree）
                        │◄────── Report ───────┘
                        │      progress / ready / blocked / dropped
                        ▼
               PR（四节正文 + 证据目录）
                        │
              人审阅并合并 → PR 关闭 → 工单结束
```

## 状态由谁持有

- **worker Session 与目录**：superagent 管，一个工单一份，不跨工单共享。
- **仓库**：故事文件、`design/`、`production/qa/evidence/` 是持久上下文。下一个 agent、下一次重启都能读到，不依赖工单历史。
- **工单**：执行与报告的单位。面板显示谁在等谁；人不在工单之外的地方做决定。

规则本身见 [002-work-types.md](002-work-types.md)。
