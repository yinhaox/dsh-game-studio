# 内容规格（dsh-game-studio）

本文件规定所有"内容层"文件的结构与硬性事实。子代理按此写，不自行发明词汇；主代理按此验收。

## 0. 术语与状态

- 工作类型（Policy rule id）：`design-doc`、`story-implement`、`code-review`、`bug-fix`、`qa-evidence`、`release-prep`、`studio-maintenance`。
- 故事状态（story frontmatter `status`）：`ready`、`in-progress`、`done`、`blocked`。
- 工单由 superagent 管理；GitHub issue/PR 是人与 agent 的对话面；故事文件是仓库内的持久上下文。
- 证据目录：`production/qa/evidence/<story-slug>/`；索引 `index.md`；截图 `*.png`；日志 `*.log`。
- 证据索引必须有一行以 `Run result:` 开头，取值 `OBSERVED — …` / `NOT VERIFIED — …` / `N/A — …`。
- 所有本仓库路径使用正斜杠书写；命令通过 `studio.yaml` 提供，不在剧本里硬编码引擎路径。

## 1. `template/studio.yaml`

```yaml
studio: My Game
godot:
  path: godot
  version: "4.7"
check_command: python scripts/studio.py check
test_command: python scripts/studio.py test
run_command: python scripts/studio.py run
capture_command: python scripts/studio.py capture
evidence_dir: production/qa/evidence
story_dir: production/stories
```

## 2. 故事模板 `template/production/stories/_template.md`

```markdown
---
id: story-000
status: ready
updated: 2026-01-01
---

# Story: <title>

## Context

Why this exists, and the design or issue it comes from.

## Acceptance

- [ ] One observable outcome per line.

## Out of scope

- What this story must not change.

## Evidence

- `production/qa/evidence/story-000/index.md`
```

## 3. 证据索引模板 `template/production/qa/evidence/_template.md`

```markdown
# Evidence: <story-slug>

Run result: OBSERVED — <what was on screen>

- `<story-slug>-1.png` — <what it shows>
- `test.log` — `<test command>` output
```

## 4. issue 模板（`template/.github/ISSUE_TEMPLATE/`）

每个模板正文**第一行**必须是 `Type: design` / `Type: story` / `Type: bug` / `Type: review`（superagent 的 GitHub Trigger 不携带 label，分类靠正文与评估规则）。

- `design.md`：目标体验、约束、参考、待决问题。
- `story.md`：故事路径或标题 + 验收标准 + 依赖。
- `bug.md`：构建/提交、复现步骤、期望与实际、已有证据。
- `review.md`：PR 链接、关注点、是否要求改动。

`template/.github/PULL_REQUEST_TEMPLATE.md` 必含四节：

```markdown
## What changed

## Verification
- Command:
- Result:

## Evidence
- Path:
- Run result:

## Risks and not covered
```

## 5. `AGENTS.md`（游戏仓库）

写给 worker 的仓库约定，必须覆盖：

- 这是 Godot 4 项目；引擎命令以 `studio.yaml` 为准。
- 只改工单范围内的文件：设计票只写 `design/`；故事票只写 `src/`、`scenes/`、`tests/`、故事文件、证据目录。
- 证据必须来自真实运行；`NOT VERIFIED` 不算完成。
- 提交信息用 `<type>: <summary>`；不 force push、不 tag、不发布。
- 需要人拍板时，用一次报告提出问题，不猜。

## 6. Policy 规则（`seed/policy.json`）

文件结构：

```json
{
  "rules": [
    { "id": "design-doc", "name": "Design document", "enabled": true, "instruction": "..." }
  ],
  "eval": { "mode": "observe", "timeoutSeconds": 120, "model": null }
}
```

规则 instruction 用英文，≤2000 字符，必须写明：何时匹配、允许的范围、产出、什么时候停下问人。七条规则的要点：

| id | 要点 |
|---|---|
| `design-doc` | 明确的系统/玩法/关卡设计请求；只写 `design/`；未决问题一次问清；不写代码 |
| `story-implement` | 带验收标准的故事；只动 `src/`、`scenes/`、`tests/`、故事文件、证据目录；测试 + 运行证据 |
| `code-review` | 评审 PR；只读；按 `file:line` 给严重度；不代替人批准 |
| `bug-fix` | 可复现缺陷；复现 → 最小化 → 修复 + 回归测试 + 前后证据；不可复现则 `dropped` |
| `qa-evidence` | 补齐/修复证据（含制作人触发）；必须真跑；`Run result:` 必填 |
| `release-prep` | 版本、补丁说明、检查单；不合并、不打 tag |
| `studio-maintenance` | 工程性问题（解析失败、引擎版本不符、配置漂移）；只修工程配置与脚本 |

## 7. 团队提示段（`seed/prompts/*.md`）

- `communication.md`：自动代理声明；跟随 thread 语言；一次一个问题（含选项与建议）；设计与评审用引用；进度留工单；不把 Feishu 私聊内容贴到 GitHub。
- `scope.md`：按工作类型的写入边界；范围扩大先报告；范围不清/引擎跑不起来时停；"小改动"不接受顺手重构。
- `delivery.md`：PR 四节；无证据视为草稿；默认不自动合并（仅 ≤200 行且已获必要批准）；不 tag、不发布；截图必须来自真实运行。

## 8. worker 剧本（`template/.dsh/skills/<name>/SKILL.md`）

frontmatter 只需：

```yaml
---
name: studio-story
description: One sentence describing when a worker loads this playbook.
---
```

正文要求：

- 先读 `AGENTS.md`、`studio.yaml`、工单指定的故事/设计文件。
- 命令一律引用 `studio.yaml` 的 `check_command` / `test_command` / `run_command` / `capture_command`。
- 需要人拍板：调用一次 `orchestrator_report`，`state` 设 `progress`，`human_action` 写成一个具体问题；**不猜、不问第二个问题**。
- 结束：`orchestrator_report` 报 `ready`（PR 链接 + 证据路径）或 `blocked`（原因）。
- 不写 `ask_user_question`（worker 没有这个工具）。

六个剧本与关键步骤：

| 技能 | 关键步骤 |
|---|---|
| `studio-design` | 读请求 → 列未决问题（一次问清）→ 写 `design/<system>.md` → 更新 `design/systems-index.md` → PR |
| `studio-story` | 读故事 → 列计划 → 改代码/场景 → 写测试 → 跑 test/run → 截图证据 → 更新故事 `status` 与 `## Evidence` → PR |
| `studio-review` | 读 PR diff 与故事 → 按 `file:line` 列问题（必须改/建议）→ 不写代码 → 报告 |
| `studio-bug` | 复现并落盘脚本/步骤 → 找根因 → 修复 + 回归测试 → 前后截图 → PR |
| `studio-evidence` | 跑 `run_command`/`capture_command` → 存 PNG/日志到证据目录 → 写 `index.md`（含 `Run result:`）→ 更新故事证据链接 |
| `studio-release` | 汇总合并的 PR → 更新 `production/releases/<version>.md` 与补丁说明 → 检查单 → 报告等人工批准 |

## 9. 角色 brief（`template/.dsh/agents/<role>.md`）

每份 1 页，结构固定：`# <Role>`、`## Responsibilities`、`## Read first`、`## Deliverables`、`## Do not`、`## Escalate when`。八个角色：

`creative-director`、`tech-director`、`producer`、`game-designer`、`gameplay-programmer`、`technical-artist`、`qa-lead`、`release-manager`。

内容用英文（供 subagent 读取），职责必须与上面的工作类型一致。

## 10. 路径规则（`template/.dsh/rules/*.md`）

frontmatter 只含 `paths:` 列表；正文用要点写该目录的硬性规则。四个文件：

- `gdscript.md`：`scripts/**/*.gd`、`src/**/*.gd`
- `scenes.md`：`scenes/**/*.tscn`、`scenes/**/*.tres`
- `data.md`：`assets/data/**/*.json`、`resources/**/*.tres`
- `ui.md`：`scenes/ui/**/*.tscn`、`scripts/ui/**/*.gd`

## 11. Godot 模板

- `project.godot`：Godot 4.7；`config/features=PackedStringArray("4.7", "GL Compatibility")`；`run/main_scene="res://scenes/main.tscn"`；autoload `StudioCapture="*res://addons/studio_capture/capture.gd"`；窗口 1152×648。
- `scenes/main.tscn`：最小可运行场景（Node2D + Label "Game Studio"）。
- `src/main.gd`：最小脚本（游戏代码在 `src/`，`scripts/` 只放工具）。
- `addons/studio_capture/capture.gd`：autoload；读 `OS.get_cmdline_user_args()` 中的 `--studio-capture=<path>`，等约 0.2 秒，`get_viewport().get_texture().get_image().save_png(path)`，`quit(0)`；无参数则什么都不做。
- `tests/run_tests.gd`：`extends SceneTree`；`_init()` 里跑断言，失败 `quit(1)`，成功 `quit(0)`；至少覆盖一个真实逻辑函数。
- `scripts/studio.py`：Python 3 标准库；子命令 `check` / `test` / `run` / `capture`；从 `studio.yaml` 读取 `godot.path` 与命令；`check` 跑 `--headless --import`（失败即非零）并可对改动 `.gd` 做 `--check-only`；`test` 跑 `tests/run_tests.gd`；`run`/`capture` 启动窗口并等待 PNG；找不到 Godot 时打印可操作错误并退出 2。

## 12. 安装器（`setup/studio-setup.md`）

写给 superagent 主 Session 的安装步骤，必须包含：

1. 读当前 `settings/policy` 与 `prompts`（保留现有 `sources` 允许名单）。
2. 展示将要写入的 7 条规则、`eval.mode: observe`、3 个提示段。
3. 人确认后调 `orchestrator_settings_save`（block `policy`，合并 `sources`；block `eval`）与 `orchestrator_prompts_save`（合并当前配置）。
4. 用 `orchestrator_read` 验收。
5. 列出面板侧仍需人做的配置（Sources / Execution / 允许名单）。

## 13. 校验器（`scripts/check.py`）

必须校验：

- `seed/policy.json`：7 条规则、id 唯一、instruction ≤2000 且非空、enabled 为布尔。
- `seed/prompts/` 三个文件存在且非空。
- 六个 skill 的 frontmatter 有 `name`/`description`，name 与目录同名且 kebab-case。
- 八个角色文件存在。
- 四个 rule 文件 frontmatter 有 `paths` 且非空。
- issue 模板第一行 `Type: ...` 合法。
- `studio.yaml` 含必需键。
- `template/scripts/studio.py`、`tests/run_tests.gd`、`addons/studio_capture/capture.gd` 存在。
- `docs/000`–`005` 存在。
