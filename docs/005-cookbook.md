# 005 菜谱：扩展这个工作室

扩展分两层，先确认你在哪一层：

- **内容层**（`seed/`、`template/.dsh/`、`template/.github/`）：规则、提示段、剧本、角色、路径规则。改完由新仓库初始化带过去，或提交到已有的游戏仓库。不需要重新构建插件。
- **插件层**（`packages/studio/`）：三个 Source 与四个 Guard。改完要 `pnpm build` 并重启 superagent。

不管改哪层，都不改 superagent 本身：它是外部依赖，版本固定在 [compat.json](../compat.json)。扩容前先读 [content-spec.md](content-spec.md) 的硬性事实和 [implementation-contract.md](implementation-contract.md) 的接口约定。

## 加一条工作类型

1. 在 [seed/policy.json](../seed/policy.json) 的 `rules` 里加一条：`id`（kebab-case）、`name`、`enabled: true`、`instruction`。`instruction` 用英文，不超过 2000 字符，必须写清四件事——何时匹配、能写什么、产出什么、什么时候停下问一个问题。照抄现有七条的写法，不要写口号。
2. 如果它从 issue 开始，加一个 [issue 模板](../template/.github/ISSUE_TEMPLATE)，正文第一行是 `Type: <你的类型>`；并把模板文件名加进 `scripts/check.py` 的 `ISSUE_TEMPLATES`、把新类型加进 `ISSUE_TYPES`，否则校验器不会看这个新模板。它只能由制作人或观察到的失败发起时，可以不加模板。
3. 把新类型加进 [template/AGENTS.md](../template/AGENTS.md) 的写入边界表，写清「可以写」和「不写」。这张表是 worker 读到的第一份约定。
4. 跑 `python scripts/check.py`：规则数量、id 唯一、`instruction` 长度与非空、issue 模板首行都会被校验。校验器把七条 id 写成常量 `RULE_IDS`，新增规则时同步加进去；它要求「恰好七条」，不改常量就会报 unexpected rule id。
5. 让主 Session 按 [studio-setup.md](../setup/studio-setup.md) 重新写入 policy，并用 `orchestrator_read` 读回验收。面板保存会整块覆盖 policy，所以别两边各改一半。
6. 保持 `observe`，在真实工单上读几条评估结果，再决定是否让它自动接单。

一次只加一条。两条新规则同时上线时，你分不清是哪一条判错了。

## 加一个角色

1. 新建 [template/.dsh/agents/](../template/.dsh/agents) 下的 `<role>.md`。结构固定六节：`# <Role>`、`## Responsibilities`、`## Read first`、`## Deliverables`、`## Do not`、`## Escalate when`。
2. 内容用英文，一页以内。职责必须能对上七种工作类型之一；对不上的职责说明这个角色不必要。
3. 在 `design/systems-index.md` 的 Owner 列、发布检查单的负责人里用角色名，不写人名。
4. 把角色名加进 `scripts/check.py` 的 `ROLE_NAMES`，再跑一遍；不加进去，新角色不会被校验。校验器只检查文件存在，内容一致性靠评审。

角色不是授权。角色 brief 给 subagent 一个判断视角，写边界仍由工单的 Mandate 与 `AGENTS.md` 决定（见 [003-playbooks.md](003-playbooks.md)）。

## 加一个剧本

1. 新建 `template/.dsh/skills/<name>/SKILL.md`，frontmatter 只有 `name` 和 `description`。`name` 必须与目录同名，kebab-case；`description` 写「什么时候加载我」，一句话。
2. 正文按现有六个剧本的骨架写：工具清单 → 先读什么 → 计划 → 范围 → 跑命令 → 证据 → 交付 → 报告内容。
3. 命令一律引用 `studio.yaml` 的 `check_command`、`test_command`、`run_command`、`capture_command`；不写引擎路径，不造新命令。
4. 需要人拍板时用一次 `orchestrator_report` 的 `state: progress` 加 `human_action`，只问一个问题；结束时报 `ready`、`blocked` 或 `dropped`。不要写 `ask_user_question`——worker 没有这个工具。
5. 把剧本名加进 `scripts/check.py` 的 `SKILL_NAMES`，再跑 `python scripts/check.py`；frontmatter 的 `name`/`description`、目录同名、kebab-case 都会被校验，而不在常量里的剧本不会被检查。
6. 让一个真实工单走一遍。剧本写错通常表现为 worker 跳过测试或跳过截图，看 PR 就能发现。

剧本只在游戏仓库里生效，前提是它已经提交到那个仓库的 `.dsh/skills/`。`template/` 里的改动不会自动同步到已经在跑的仓库。

## 加一条路径规则

1. 新建 `template/.dsh/rules/<area>.md`，frontmatter 只有 `paths:` 列表，glob 相对于仓库根，例如：

   ```yaml
   ---
   paths:
     - shaders/**/*.gdshader
   ---
   ```

2. 正文用要点写该目录的硬性规则：能做什么、不能做什么、评审时看什么。写可检查的事实，不写风格偏好。
3. [guard-rules](../packages/studio/src/guard/rules/index.ts) 会在 `write`/`edit` 成功之后，把命中 `paths:` 的规则注入下一步；按 `(path, mtime)` 去重，所以同一个文件改一次只注入一次，规则文件改了会重新注入。
4. 它不拒绝写入。拒绝越界写入是 [guard-writes](../packages/studio/src/guard/writes/index.ts) 的职责，两者不要混。
5. 把文件名加进 `scripts/check.py` 的 `RULE_FILES`，跑一遍校验器；不在这个列表里的规则文件不会被检查。
6. 验证：在游戏仓库里改一个命中 glob 的文件，下一步应当出现 `[studio] Rule .dsh/rules/... applies to ...`。没出现就检查 `paths:`、当前目录是不是仓库根、以及规则文件是否真的在 `.dsh/rules/` 下。

## 加一个 producer 检查（Source）

插件层的最小扩展。四步：写入口、复用共享模块、注册入口、写测试。

### 1. 写 `packages/studio/src/producer/<name>/index.ts`

照 [source-evidence](../packages/studio/src/producer/evidence/index.ts) 的骨架：

- 导出 `name`（固定写 `'dsh-game-studio/source-<name>'`）、`inject = ['orchestrator']`、`apply(ctx)`，以及可单测的 `runCheck(ctx, config, signal)`；`runCheck` 返回一句健康详情。
- `kind` 的 `kind` 必须与入口对应（`studio-<name>`）；`health` 恰好一个条目，名字与 `kind` 相同，只经 `ctx.report` 写它。
- `scope` 返回 `{ listened: true, observed: true, row: 'studio' }`；`policy.schema` 含 `allowed`（默认 `[]`）与 `bots`（默认 `[PRODUCER_BOT]`），`.strict()`；`policy.rows` 只返回 `studio` 一行。
- 触发器一律用 `studioTrigger({ kind, check, subject, fingerprint, text, meta? })`，因此 `human: false`、actor 是 `studio-producer`、**不设 channel**（原因见 [001-domain.md](001-domain.md)）。
- `apply` 用两个 `ctx.effect`：注册 kind；启动可中止的轮询并在 disposer 里 `abort` 再 await。轮询用 `pollSource`，`run` 里调用你的 `runCheck`。
- `fingerprint` 必须随状态变化。状态不变时重复 `receive` 会得到 `duplicate`，这是预期行为；不要每轮换一个新 fingerprint 来绕过它。

### 2. 复用共享模块，不要复制

`packages/studio/src/shared/` 只读，由主代理维护。新检查需要的东西基本都在里面：

| 模块 | 提供 |
|---|---|
| `shared/superagent.ts` | `Trigger`、`SourceContext`、`SourceKind`、`SourceHost`、`Health`、`FieldSpec`、`PolicyRow`、`ScopeResult` |
| `shared/actor.ts` | `PRODUCER_ACTOR`、`PRODUCER_BOT` |
| `shared/trigger.ts` | `studioTrigger`（另有 `stableKey` 用于稳定的 hash 键） |
| `shared/poll.ts` | `pollSource`：等 setup、跟随开关、按间隔运行、三轮失败才报 `error` |
| `shared/studio.ts` | `loadStudio`、`readProjectGodot`、`readFrontmatter`、`listStories`、`listFiles`、`evidenceDir` |
| `shared/gh.ts` | `latestWorkflowRun`、`isFailingConclusion`、`ghJson` |
| `shared/text.ts` | `oneLine`、`clipLines`（触发器的 `text` 用它们压成一行或截断） |
| `shared/guard.ts` | 路径判断与读取：`sessionCwd`、`filePathOf`、`absolutePath`、`isWithin`、`relativePath`、`matchesGlobs`、`globToRegExp` |
| `shared/message.ts` | `studioMessage`：注入给模型的一条用户消息 |

### 3. 注册入口

- `packages/studio/tsdown.config.ts` 的 `entry` 加 `'source-<name>': 'src/producer/<name>/index.ts'`；
- `packages/studio/package.json` 的 `exports` 加 `"./source-<name>": "./lib/source-<name>.js"`；
- `packages/studio/cordis.patch.yml` 加一行 `id: studio-source-<name>`，`name: '@local/dsh-game-studio/source-<name>'`。

`scripts/check.py` 校验这三处是否互相对得上，并固定了「七行插件」的数量；加完后把它的期望行数一起改成 8，否则校验器会失败。这个「恰好」是有意的：它让误删一行也会被发现。

### 4. 写测试

`packages/studio/tests/source-<name>.spec.ts`。用假 `Context`（`effect`、`on`、`logger`、`orchestrator`）与 `mkdtemp` 夹具，断言：`receive` 收到的 trigger（id、text、thread）、fingerprint 稳定性、状态没变时不重发。不测 `apply` 里的轮询循环，不依赖网络、Godot 或 `gh`。

```powershell
pnpm -C packages/studio test
pnpm build
```

重新构建后重启 superagent，面板里会出现新的 Source 卡片；启用它并填 `checkout`。先在 `observe` 下让它跑几轮，看健康条目和候选文字，再接单。

## 升级固定的 superagent commit

[compat.json](../compat.json) 的 `commit` 是唯一事实，它决定插件对着哪个协议版本编译。升级步骤：

1. 在 superagent 的 checkout 里检出目标 commit，`pnpm install && pnpm build`。
2. 更新 `compat.json` 的 `commit`（`version` 变了也一起改）。
3. 跑 `python scripts/compat-check.py --superagent <superagent 路径>`。它用 superagent 的 `src/sources/host.ts` 与 `src/sources/kind.ts` 校验 `src/shared/superagent.ts` 的结构镜像；报出差异时，只有维护共享代码的人能改 `src/shared/`。
4. `pnpm -C packages/studio test`，再 `pnpm build`。
5. 重新安装 bundle 并重启进程：

   ```powershell
   dsh plugin --profile superagent add "link:<本仓库绝对路径>\packages\studio"
   ```

6. 按 superagent 自己的升级流程动运行时：备份 `<stateDir>/orchestrator.sqlite`，`pnpm install && pnpm build`，重启，再看面板与健康。数据库被新版本迁移后旧版本打不开，回滚只能靠备份。
7. 切回 `observe` 观察一轮。`check.py` 与 `compat-check.py` 通过只说明结构和内容没坏，不说明行为没变——`kind`、policy 字段、事件签名、Source 的 `receive` 语义都可能在两个 commit 之间改掉。

升级时不要顺手改规则或提示段。协议升级和内容调整分开做，出问题时才知道是谁引起的。
