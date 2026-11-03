# 验收记录

本文件记录 dsh-game-studio 在交付机器上的静态验收结果，以及需要真实 GitHub / superagent / Godot 环境才能完成的实战验收清单。

- 验收时间：2026-11-03
- 机器：Windows，Node 24，pnpm 12，Python 3
- 引擎：Godot **4.7.2.stable**（本机用 `studio.yaml` 的 `godot.path` 指向可执行文件）
- GitHub CLI：**2.103.x**，已用一个个人账号登录（`gh auth status` 通过），另有一个 agent 账号做协作者
- superagent：`C:\Code\Node\dsh-superagent-prototype`，commit `6337fc8`（0.1.0）
- 本机**没有**运行中的 superagent 部署；因此第 3 节的工单闭环仍需操作者执行。Godot 与 `gh` 已可用。

## 1. 已通过的验收（本机）

| 门槛 | 命令 | 结果 |
|---|---|---|
| 依赖安装 | `pnpm install` | 通过 |
| 类型检查 | `pnpm -C packages/studio typecheck` | 0 error |
| 构建 | `pnpm -C packages/studio build` | 8 个入口，22 个文件 |
| 单测 | `pnpm -C packages/studio test` | 7 个文件，83 个测试通过 |
| 静态校验 | `python scripts/check.py` | 16 项通过，0 失败 |
| 契约校验 | `python scripts/compat-check.py --superagent <superagent 路径>` | 8 项通过，0 失败 |
| Python 单测 | `python -m unittest discover -s tests -p "test_*.py"` | 20 个测试通过 |
| 构建产物导入 | Node ESM 导入 8 个 `lib/*.js` | `name` / `apply` 齐全 |
| 假上下文挂载 | 用假 `Context` 调 7 个插件的 `apply` | 全部挂载，三个 Source 报 `paused` |
| 模板初始化 | `python scripts/init.py <tmp> --studio "Godot Demo"` | 生成完整仓库，`studio.yaml` 生效 |
| **Godot 真实导入** | `python scripts/studio.py check` | 退出 0，`[check] import OK` |
| **Godot 真实测试** | `python scripts/studio.py test` | 退出 0，16 个断言全过 |
| **Godot 真实截图** | `python scripts/studio.py capture --out ...` | 退出 0，生成 1152×648、13,313 字节 PNG；用 `read_image` 目检确认标题 "Game Studio" 可见 |
| **真实证据守卫** | 对真实故事/证据跑 `validateWrite` | 合法证据通过；`NOT VERIFIED`、伪 PNG、done 无证据均被拒 |
| **真实 evidence Source** | 对真实仓库跑 `runCheck` | 2 个故事、1 个发现（`bad`），合法故事不报 |
| **真实 project Source** | 对真实仓库跑 `runProjectCheck` | 正常时 `check passed` 无触发；版本改 4.6 → `engine-mismatch`；命令退出 3 → `check-failed` |
| **真实 ci Source** | 对 `cli/cli` 的真 remote 跑 `runCheck`（branch `trunk`） | `gh run list` 返回最新一次成功运行，`latest run success on trunk is not failing`，0 触发 |
| 缺引擎路径 | 把 `godot.path` 指向不存在的文件 | 退出 2，打印安装/路径指引 |

独立评审（4 个只读 reviewer）之后修掉的实质问题：

- Thread fact 形状改为 superagent 真实的 `{ value }`，面板不再显示空 fact；
- CI 指纹加入 `updatedAt`，重跑同一提交的失败会重新成为候选；
- 证据收口改为 `index.md` + `Run result: OBSERVED/N/A`，仅有一个文件、或 `NOT VERIFIED` 不再能关闭故事；
- 证据 PNG 校验 PNG 签名；`_` 开头的草稿不再被当故事校验；
- 路径包含性增加 realpath 检查，symlink/junction 不能骗过写入守卫；
- `defaultExecute` 处理 `maxBuffer` 溢出（退出码 124），不再抛异常；
- 轮询间隔对 NaN 兜底；guard-rules 限制单个规则文件大小并给 per-agent 状态设上限；
- 文档明确：`guard-writes` 只覆盖 `write`/`edit`，shell 命令不在守卫范围；`check_command` 以操作者身份执行；
- 三个工作室 Source 的 `bots` 默认值不会自动落库，安装说明新增了手动保存 `studio-producer` 的步骤；
- 内容层统一：`src/` vs `scripts/`、GL Compatibility、Godot 4.7、`state progress` + `human_action`、`## Goals`、release 模板与发布剧本、新增 `design/vision.md`。

## 2. 已知未验证

| 项 | 原因 | 谁来验 |
|---|---|---|
| PR 合并后工单结束 | **已验证**：PR #2 合并后工单以 `merged` 结束（见第 4 节） | — |
| GitHub 主动 Source 的 `ci` 检查 | 需要带 workflow 的测试仓库；`gh` 本身已登录可用 | 操作者：按第 3 节 F 执行 |
| guard 的拦截路径在真实 worker 中 | 真实 worker 里守卫放行了合法写入；拦截逻辑已用真实文件验证 | 操作者：按第 3 节 G 执行 |
| 三个工作室 Source 的定时轮询 | 当前部署里 `studio-evidence` / `ci` / `project` 还停在 `paused`（checkout 未填） | 操作者：在面板填 checkout 并开启 |

## 3. 实战验收清单（需要操作者环境）

先按 `docs/004-deployment.md` 完成部署，并按 `setup/studio-setup.md` 写入规则与提示段。然后在测试仓库逐项执行：

### A. 设计 issue
1. 开一个 `Type: design` issue，@ agent，只写目标与约束。
2. 期望：工单接单；agent 若需要拍板，会在 issue 里提**一个**问题（面板显示 attention）；回答后继续。
3. 期望：产出只改 `design/` 的 PR，PR 四个小节齐全，无代码改动。

### B. 故事 issue
1. 开一个 `Type: story` issue，引用 `production/stories/<slug>.md`（`status: ready`，含 `## Acceptance`）。
2. 期望：PR 含 `src/`、`scenes/`、`tests/` 改动、真实测试输出、证据目录与 `Run result: OBSERVED — …`；故事 `status` 变为 `done`。
3. 期望：`orchestrator_report` 的 `state` 为 `ready`，而不是自定义状态。

### C. PR 迭代
1. 在 agent 的 PR 上评论一条具体修改要求，不要 @。
2. 期望：订阅唤醒同一工单；PR 更新；不需要新工单。

### D. 提问回路
1. 给一个故意含糊的故事（缺少验收标准）。
2. 期望：只出现一条 `human_action` 问题；在 issue 回复后工单恢复；不会出现第二个问题。

### E. 证据缺失（主动制作人）
1. 把某个故事的 `status` 改成 `done`，但不建证据目录。
2. 在面板把 `studio-evidence` Source 的 `checkout` 指向仓库，间隔设为 60 秒。
3. `observe` 模式：期望面板出现 would-accept 记录，不建工单。
4. 切 `auto`：期望自动建 `qa-evidence` 工单，产出证据 PR。
5. 证据补齐后：同一状态不再重复触发；修改故事文件后才会产生新指纹。

### F. CI 红（主动制作人）
1. 让 main 分支上一次 workflow 失败，等待超过宽限期（默认 15 分钟）。
2. 期望：`observe` 下记录候选；`auto` 下建 `bug-fix` 工单。
3. 重跑通过后不再触发。

### G. 守卫
1. 让 worker 用 `write`/`edit` 尝试写 `.godot/x`、`a.tscn.import`、仓库外路径：期望被 `guard-writes` 拒绝。shell 命令不在守卫范围，属于 agent 自律 + 人工评审。
2. 让 worker 写一个 `status: done` 但无证据的故事文件：期望被 `guard-docs` 阻断并给出修复提示。
3. 写一个 10 字节的 PNG 作为证据：期望被阻断。
4. 写证据 `index.md` 但缺 `Run result:` 行：期望被阻断。

### H. 面板
1. 打开 overview：需要人的工单、问题、三个 Source 的健康状态与实际一致。
2. 打开任一工单：Mandate、Inputs、Reports、PR 订阅齐全。
3. 打开 Prompts：三个团队段与 7 条规则已生效。

## 5. 回滚

- 停用插件：在 superagent profile 的 patch 中把对应 `id` 置 `disabled: true`，重启。
- 撤回规则：用保存前的 `settings/policy` 与 `prompts/current` 重新保存一次（保留 `sources`）。
- 停用主动 Source：面板把对应 Source 关闭；不影响 GitHub 人工请求路径。

## 4. 首次真实工单（已跑通）

部署：

- 独立 profile `superagent`，端口 3082，`stateDir` 指向本机的一个盘符绝对路径
- 独立的 agent 账号（`gh` 登录、仓库 `WRITE` 协作者）
- 一个 private 演示仓库
- 模型：Eval 与 Executor 都设为 `command-code / deepseek/deepseek-v4.1-flash`；`GET models` 的默认路由也是它。主 Session 的 `request/header` 实测为 `{"provider":"command-code","model":"deepseek/deepseek-v4.1-flash"}`，worker 同路由
- 两处 Windows 兼容补丁见 `patches/superagent-windows.patch`
- 规则、3 个提示段、allowed list、studio bots 已通过管理 API 写入；`studio-evidence` 与 `studio-ci` 已开启（checkout 指向主 clone），健康状态 `ready`

一次完整闭环：

1. 人在演示仓库开一个 `Type: story` issue，正文 @ agent。
2. GitHub Source 收到；主 Session 以 `explicit` 强度接单，建 Ticket，起一个 worker（独立 worktree）。
3. worker 加载仓库里的 `studio-story`，改 `scenes/main.tscn`、`src/main.gd`、`tests/run_tests.gd`，新建故事与证据。
4. worker 真实执行：`check` 退出 0；`test` 20 个断言通过；`capture` 生成 1152×648、18,330 字节 PNG。
5. worker 以 agent 账号提交、推分支、开 PR。
6. 工单进入 `person` 阶段，summary 写明命令、结果、证据路径与风险；面板与 API 一致。

截图已人工目检：标题 “Game Studio” 下方显示新增的副标题。

7. 合并 PR 后，工单随即结束（`ended.by: executor`，`outcome: merged`），面板不再显示待人工。

合并后的主分支复核：

- `git pull` 后 `python scripts/studio.py test` → 20 checks passed；
- `studio-evidence` 对主 clone 跑 `runCheck`：1 个 done 故事、0 个发现（证据能收口）。

**流程提醒**：如果浏览器仍登录着 agent 账号，点“Merge”会以 agent 身份合并，GitHub 会记录 `mergedBy` 为 agent。评审和合并应当用你自己的账号（或在 agent 账号上退出登录）；superagent 只关心 PR 是否合并，谁点的都会结束工单。
