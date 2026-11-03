# 002 工作类型：七条规则与写入边界

七条规则住在 [seed/policy.json](../seed/policy.json)，由 [studio-setup.md](../setup/studio-setup.md) 写进 superagent 的 policy block。`instruction` 用英文写，因为它是模型指令；每条必须回答四件事：何时匹配、能写什么、产出什么、什么时候停下问一个问题。规则由人改，不由 agent 改。

## 分类靠 issue 正文，不靠 label

superagent 的 GitHub Trigger 不携带 label，所以四个 issue 模板的正文第一行必须是 `Type: design`、`Type: story`、`Type: bug` 或 `Type: review`（见 [ISSUE_TEMPLATE](../template/.github/ISSUE_TEMPLATE)）。`qa-evidence`、`release-prep`、`studio-maintenance` 常常由制作人、评审或观察到的失败发起，不一定从一张 issue 开始；但它们的写入边界和其余四条一样硬。

## 七条规则

### `design-doc` — 设计文档

- **何时匹配**：issue 第一行是 `Type: design`，或明确要求为某个系统、玩法、关卡写设计。
- **可写**：只写 `design/<system>.md` 与 `design/systems-index.md`。不写 `src/`、`scenes/`、`tests/`、`scripts/`、`studio.yaml`，不写任何 `.gd`。需要改代码才能成立的设想，记成后续故事，不在设计票里实现。
- **产出**：一份设计文档（目标体验、约束、参考、未决问题、涉及系统的编号列表）、更新后的 `design/systems-index.md`、四节正文的 PR。
- **停下问一个问题**：请求没有可观察目标、两段要求互相冲突、或某个选择会改变玩家体验时。给出选项、标出推荐，不在同一轮问第二个问题。猜测创作决定是禁止的。

### `story-implement` — 故事实现

- **何时匹配**：`production/stories/` 下 `status: ready` 的故事，或明确要求实现一个带验收标准的故事。
- **可写**：`src/`、`scenes/`、`tests/`、`assets/data/`、`assets/shaders/`、故事文件本身、`production/qa/evidence/<story-slug>/`。不碰 `design/`、`production/releases/`、`studio.yaml`，也不碰另一个故事的文件。
- **产出**：代码与场景改动；至少一个改动前失败、改动后通过的测试；`test_command` 与 `run_command` 的真实运行；证据目录里的 PNG；`index.md` 里以 `Run result: OBSERVED — …` 开头的一行。故事在开工时 `ready → in-progress`，只有证据存在才 `done`。
- **停下问一个问题**：验收标准有歧义、`studio.yaml` 没有可运行的命令、或需要设计决定时。`Run result:` 还是 `NOT VERIFIED` 时不许把故事标成 `done`。

### `code-review` — 代码评审

- **何时匹配**：要求评审一个 PR 或一份 diff，或 issue 第一行是 `Type: review`。
- **可写**：什么也不写，只读。不 approve、不 request changes、不代替人做评审决定；也不为了演示修法而推一个分支。
- **产出**：PR 线程上一份报告，逐条写 `file:line`、严重度（must-fix 或 suggestion）、一句影响、以及要人决定的事。顺带核对四节正文、改动是否留在故事范围内、证据是否来自真实运行。缺证据索引、或 `Run result:` 是 `NOT VERIFIED`，算 must-fix。
- **停下问一个问题**：描述和 diff 说的不是同一件事，或某个结论依赖产品决定时。用文字说明修法，不动手改。

### `bug-fix` — 缺陷修复

- **何时匹配**：issue 第一行是 `Type: bug` 且可复现，或失败检查的原因在游戏代码里。
- **可写**：`src/`、`scenes/`、`tests/`、`assets/data/`、`assets/shaders/` 中能消除根因的最小集合，加这个缺陷的故事文件与它的证据目录。不顺手重构，不改 `studio.yaml`。
- **产出**：落盘的复现步骤或脚本；最小失败用例；修复；一个没有修复时失败、有修复时通过的回归测试；前后截图与日志；`index.md` 的 `Run result:` 反映修复后的状态；PR 正文写出 issue 编号。
- **停下问一个问题**：诚实尝试一次仍无法复现、修复需要设计改动、或根因在引擎/工具链而不在游戏代码里时。确实不可复现就报 `dropped` 并附上尝试记录；不许猜一个修复，也不许悄悄关掉 issue。

### `qa-evidence` — 证据补齐

- **何时匹配**：故事声称 `done` 但证据无法收口（没有 `index.md`，或 `Run result:` 写的是 `NOT VERIFIED`）；制作人要求补证据；或 PR 声称验证过却没有产物。
- **可写**：只写 `production/qa/evidence/<story-slug>/` 和故事文件（Evidence 节、验收勾选与 `status`）。不改游戏代码；运行中发现缺陷就报告并停下，不在这里修。
- **产出**：在本机真实运行 `run_command` 与 `capture_command`；证据目录里的 PNG；命令输出存成 `.log`；`index.md` 在标题后的第一行内容以 `Run result:` 开头。三个取值只用 `OBSERVED — …`、`NOT VERIFIED — …`、`N/A — …`，最后一个只给没有运行时行为的工作。
- **停下问一个问题**：`studio.yaml` 没有可运行命令、引擎缺失、或截图对不对必须由人判断时。没跑过的运行不许写成 `OBSERVED`，旧截图不许当新证据。

### `release-prep` — 发布准备

- **何时匹配**：要求准备一个版本、写补丁说明、或整理发布检查单。
- **可写**：只写 `production/releases/<version>.md` 和它自己的检查单。不改 `src/`、`scenes/`、`tests/`、`design/`、`studio.yaml`；不合并 PR、不创建/移动/删除 tag、不发布产物、不改动正在发布中的 PR 对话。
- **产出**：版本号、范围内已合并的 PR 列表、面向玩家的补丁说明、已知问题、以及每项都写清「由哪个命令或哪个人关闭」的检查单。汇总故事里已经链接的证据；故事还是 `NOT VERIFIED` 就不能算 shipped。
- **停下问一个问题**：列了却未合并的 PR、版本号有歧义、或检查单需要人签字时。文档交给人批准后停止，自己宣布或发布 release 是禁止的。

### `studio-maintenance` — 工程维护

- **何时匹配**：不是游戏缺陷的工程失败——场景、脚本或数据解析/导入失败；`project.godot` 与 `studio.yaml` 的引擎版本不一致；`studio.yaml`、`scripts/studio.py` 或 agent 配置漂移。
- **可写**：`studio.yaml`、`scripts/studio.py`、`addons/studio_capture/`、工程配置文件。不改 `src/` 与 `scenes/` 的玩法代码；不为让检查通过而放宽验收标准或证据规则。
- **产出**：让 `check_command` 退出 0 的最小改动；改动前后 `check_command` 的输出；PR 正文里一句原因。版本不一致时用一张表列出两个值，不替人挑一个。
- **停下问一个问题**：失败在引擎安装本身、版本变更会迁移工程资产、或漂移可能是有意为之的时候。不擅自升级引擎或工程格式。

## 七条写入边界

[template/AGENTS.md](../template/AGENTS.md) 给 worker 的边界表，路径保持原文：

| 工作类型 | 可以写 | 不写 |
|---|---|---|
| `design-doc` | `design/<system>.md` 与 `design/systems-index.md` | 代码、场景、测试、`production/` |
| `story-implement` | `src/`、`scenes/`、`tests/`、故事文件、`production/qa/evidence/<story-slug>/` | `design/`、`production/releases/`、`studio.yaml` |
| `code-review` | 无，只读 | 任何文件 |
| `bug-fix` | `src/`、`scenes/`、`tests/` 中消除根因的最小集合，加故事文件与它的证据目录 | 无关重构、`design/`、`production/releases/` |
| `qa-evidence` | `production/qa/evidence/<story-slug>/` 与故事文件 | `src/`、`scenes/`、`tests/`、`design/` |
| `release-prep` | `production/releases/<version>.md` | 代码、场景、tag、合并 |
| `studio-maintenance` | 工程配置与脚本：`studio.yaml`、`scripts/`、`project.godot`、测试 harness、`.dsh` 配置 | 游戏设计、超出配置修复的玩法行为 |

所有工作类型的硬限制：不写 `.godot/`；不写或编辑 `.import` 文件；不编辑 `export_presets.cfg`；不写 `.git/`。用 shell 命令重写这些文件，和用编辑器打开一样越界——[guard-writes](../packages/studio/src/guard/writes/index.ts) 会在 `write`/`edit` 这一步拒绝。

有一处不一致要知道：`AGENTS.md` 的 `studio-maintenance` 行比 `seed/policy.json` 同一条规则宽（多了 `project.godot`、测试 harness、`.dsh` 配置）。`AGENTS.md` 开头写着「冲突时更严格的那条赢，并报告冲突」，这里照此处理。

## 规则怎么变成一次打断

七条规则的「停下问一个问题」形态是同一种：

1. 说清当前状态：哪个文件、哪个命令、哪条验收无法落定；
2. 给两三个具体选项，每个一行，写清选它会怎样；
3. 标一个推荐，并给一句理由；
4. 然后停止——不问第二个问题，不产出半成品 diff，不猜。

范围变大不能替代提问。需要动边界外的文件时，先停下，在工单上说明要动的文件和原因，给「扩大本工单」与「拆一个后续故事」两个选项，然后等人回答。把扩大的范围写进 PR 正文、请求事后原谅，不算。

这些规则由谁执行、按什么顺序执行，见 [003-playbooks.md](003-playbooks.md)。
