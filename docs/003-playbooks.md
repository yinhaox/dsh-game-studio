# 003 剧本与角色：worker 怎么拿到步骤

三层内容各管一件事：**规则**说允许做什么（[002-work-types.md](002-work-types.md)），**剧本**说按什么顺序做，**角色 brief** 说从哪个位置判断。三层都在仓库里，改它们不需要改插件，也不需要改 superagent。

## 六个 worker 剧本

位置是 `template/.dsh/skills/<name>/SKILL.md`，frontmatter 只有 `name` 与 `description`：

```yaml
---
name: studio-story
description: Load this playbook when a story with acceptance criteria must be implemented, tested, run, and evidenced, and the work type is story-implement.
---
```

`name` 必须与目录同名且是 kebab-case。`description` 写的是「什么时候加载我」，不是剧本摘要——它决定 worker 在哪个工单上读到这份步骤。

| 剧本 | 工作类型 | 关键步骤 | 结束报告 |
|---|---|---|---|
| [studio-design](../template/.dsh/skills/studio-design/SKILL.md) | `design-doc` | 读请求并一次列清未决问题 → 写 `design/<system>.md` → 更新 `design/systems-index.md` → PR | `ready` + PR |
| [studio-story](../template/.dsh/skills/studio-story/SKILL.md) | `story-implement` | 读 `AGENTS.md`/`studio.yaml`/故事 → 3–5 行计划 → 改代码与场景 → 加测试 → 跑 check/test/run/capture → 写 `index.md` → 更新故事 → PR | `ready` + PR + 证据 |
| [studio-review](../template/.dsh/skills/studio-review/SKILL.md) | `code-review` | 读 diff、故事与路径规则 → 按 `file:line` 列 must-fix/suggestion → 不写代码 | `ready` + findings |
| [studio-bug](../template/.dsh/skills/studio-bug/SKILL.md) | `bug-fix` | 落盘复现 → 找根因 → 最小化 → 回归测试先失败后通过 → 前后证据 → PR | `ready`、`blocked` 或 `dropped` |
| [studio-evidence](../template/.dsh/skills/studio-evidence/SKILL.md) | `qa-evidence` | 建基线 → 重跑四个命令 → 核对 PNG 是否真实 → 写或修 `index.md` → 更新故事 | `ready` 或 `blocked` |
| [studio-release](../template/.dsh/skills/studio-release/SKILL.md) | `release-prep` | 定版本边界 → 汇总已合并 PR → 核对证据 → 写 `production/releases/<version>.md` 与检查单 | `progress` + `human_action`，等人批准 |

七条工作类型只有六个剧本。`studio-maintenance` 没有专属剧本，它走 [AGENTS.md](../template/AGENTS.md) 的工程约定和 `.dsh/rules/` 下的路径规则；这类工单通常更短、改动更小，不需要一套完整流程。

## 一个 worker 怎么加载剧本

- worker 的 preset 里有 `skill` 工具，剧本就是游戏仓库的 DSH 项目技能，位于 `.dsh/skills/`。所以 story 工单加载 `studio-story`，review 工单加载 `studio-review`；不是靠记忆，也不是靠主 Session 转述。
- 加载后先读三样，顺序固定：`AGENTS.md`（仓库约定与写入边界）、`studio.yaml`（四个命令、`story_dir`、`evidence_dir`）、工单指定的故事或设计文件。
- 命令一律引用 `studio.yaml` 的键——`check_command`、`test_command`、`run_command`、`capture_command`。剧本里不写引擎二进制路径；键缺失或为空是 `studio-maintenance` 的问题，不是自己造一条命令的理由。
- 剧本不写 `ask_user_question`：worker 没有这个工具，唯一的提问通道是下一节的报告。

## 八个角色 brief

位置是 `template/.dsh/agents/<role>.md`，一页，结构固定：`# <Role>`、`## Responsibilities`、`## Read first`、`## Deliverables`、`## Do not`、`## Escalate when`。内容用英文写，供 subagent 读。

| 角色 | 关注点 |
|---|---|
| [creative-director](../template/.dsh/agents/creative-director.md) | 愿景、支柱与反面目标；每个设计稿服务哪根支柱 |
| [tech-director](../template/.dsh/agents/tech-director.md) | 架构形状、引擎约束、逻辑是否可无窗口测试、决策记录 |
| [producer](../template/.dsh/agents/producer.md) | 范围、里程碑、工单排序、验收是否可测、状态是否诚实 |
| [game-designer](../template/.dsh/agents/game-designer.md) | 系统作为循环、真实数值、边界情况、可断言的验收 |
| [gameplay-programmer](../template/.dsh/agents/gameplay-programmer.md) | `src/` 里的实现、`tests/` 里的断言、真实运行证据、PR |
| [technical-artist](../template/.dsh/agents/technical-artist.md) | 资源规格、Godot 导入设置、着色器、画面是否可读 |
| [qa-lead](../template/.dsh/agents/qa-lead.md) | 证据质量、回归清单、缺陷分级、每个故事给结论 |
| [release-manager](../template/.dsh/agents/release-manager.md) | 已合并 PR、发布文档、玩家向补丁说明、发布门禁与回滚备注 |

角色和七种工作类型对得上：`design/systems-index.md` 的 Owner 列写角色名，不写人名；PR 里的人的批准与角色判断是两件事。

## 什么时候委派给带角色 brief 的 subagent

- 只读、可独立完成、结论能一句话带回的活才委派。例如：让 `qa-lead` 复核一份证据清单是否够格、让 `tech-director` 判断一个架构取舍、让 `game-designer` 检查数值表的边界。委派方式是把对应 brief 的全文放进 subagent 的 prompt，要求它按那个角色的视角回答。
- 委派不产生新授权。范围还是本工单的范围；subagent 不能写边界外的文件、不能对人说话、不能开 PR，也不能替人做决定。结果回到 worker，由 worker 写进报告和 PR。
- subagent 沿用 worker 的权限与 `standard` preset，所以它不比 worker 更能越界；worker 停下时它停，工单交接给人或结束时它被释放。
- 需要人拍板的判断不要委派给 subagent：角色 brief 提供的是视角，不是人的批准。

## 一问规则：`orchestrator_report` 的 `progress` 加 `human_action`

worker 没有交互式提问工具。唯一的人机接口是一次 `orchestrator_report`。

- 需要人决定时，调用一次，`state` 设 `progress`，`human_action` 写成**一个**具体问题：发生了什么、两三个选项、推荐哪个、一句为什么。然后停下。
- 停下意味着：不问第二个问题，不继续写半成品，不猜一个答案再在 PR 里说明。同一个工单最多一次 `human_action`；期间出现的新决定记进 PR 正文或故事文件，等第一个回答到了再说。
- 答案以 PR 或 issue 评论的形式回到工单。工单的 Subscription 会把它交给 worker，在同一个 Mandate 下继续，不重新评估。
- 收尾只有三种：
  - `ready`：PR 链接 + 证据路径 + 跑过的命令与结果；
  - `blocked`：具体原因（引擎跑不起来、文件在边界外、两个来源互相矛盾），附上命令、退出码和第一行错误；
  - `dropped`：缺陷不可复现或工作已被取代，附尝试记录。只有 `bug-fix` 用它。
- 面板里的 `idle`（等待下一个 Trigger）是**工单阶段**，不是报告状态。`orchestrator_report` 只接受 `progress`、`ready`、`blocked`、`failed`、`dropped` 五个值；`waiting` 不在其中，发出去会被 schema 拒绝。一轮做完且没有问题时，正常结束回合即可；需要人决定时才用 `progress` 加 `human_action`。

报告之后不再补一条「补充说明」。需要补充的信息写进 PR 正文，或者等下一个 Trigger。
