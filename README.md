# dsh-game-studio

[English](README.en.md) | 中文

用 **dsh-superagent** 搭起来的一个**只在 GitHub 上工作的游戏工作室**：人在 issue / PR 里提需求、回答关键问题、合并 PR；agent 在独立 worktree 里按剧本产出设计文档、代码、测试、截图证据和补丁说明；面板显示谁在等谁。

引擎只支持 **Godot 4**（模板按 4.7 验证）。

## 它由什么组成

| 层 | 内容 | 位置 |
|---|---|---|
| 运行时 | `dsh-superagent`（外部依赖，**不修改**） | 独立仓库/部署 |
| 插件 | 3 个主动 Source + 4 个 Guard，可逐行开关 | `packages/studio` |
| 内容 | 7 条工作规则、3 个团队提示段、6 个 worker 剧本、8 个角色 | `seed/`、`template/.dsh` |
| 模板 | 可直接开工程的 Godot 4 项目 + issue/PR 模板 + `studio.py` | `template/` |
| 工具 | 初始化、结构校验、协议兼容检查 | `scripts/` |

superagent 提供授权、工单、隔离执行、追问、PR 交付、面板与恢复；本仓库只补它缺的部分：

- **主动发现**：证据缺失、main CI 红、Godot 解析失败 / 引擎版本漂移 → 变成 bot 候选（先观察，再自动接单）。
- **工程守卫**：项目事实注入、按路径的规则、写入边界、故事与证据校验。
- **工作室工艺**：规则、提示、剧本、角色、模板。

## 快速开始

### 1. 构建插件

```powershell
pnpm install
pnpm build
pnpm test
python scripts/check.py
python scripts/compat-check.py --superagent <superagent 路径>
```

### 2. 部署 superagent

按 [docs/004-deployment.md](docs/004-deployment.md) 建独立 profile、agent GitHub 账号和测试仓库。agent 账号不能由机器代建，创建与验证见 [docs/agent-account.md](docs/agent-account.md)。Windows 上建议直接在桌面会话运行：

```powershell
dsh --profile superagent
```

### 3. 安装工作室 bundle

```powershell
dsh plugin --profile superagent add "link:<本仓库绝对路径>\packages\studio"
```

### 4. 初始化一个游戏仓库

```powershell
python scripts/init.py ../my-game --studio "My Game"
```

Godot 不在 `PATH` 上时（例如 Steam 版），把可执行文件写进 `studio.yaml`：

```powershell
python scripts/init.py ../my-game --studio "My Game" --godot "<Godot 可执行文件绝对路径>"
```

推到 GitHub，然后按 [setup/studio-setup.md](setup/studio-setup.md) 让 superagent 主 Session 写入规则与提示段。

### 5. 开工

在 issue 里 @ agent 并写明类型（`Type: design|story|bug|review`）。先保持 `observe` 模式观察制作人的判断，稳定后再切 `auto`。

## 目录

```
packages/studio/      插件包（单包多入口，tsdown + vitest）
src/producer/         三个 Source：evidence / ci / project
src/guard/            四个 Guard：facts / rules / writes / docs
src/shared/           结构化 superagent 契约与共享工具
seed/                 规则与提示段种子
template/             游戏仓库模板（Godot 4）
docs/                 设计、部署、排障（中文）
setup/                主 Session 用的安装说明
scripts/              init / check / compat-check
```

## 实战案例

这套工具的第一个完整产物是一个 3D 推箱子：40 次提交、12 个合并的 PR、20 关、884 项无头检查、三平台导出。过程与暴露的缺口见 [docs/sokoban-case-study.md](docs/sokoban-case-study.md)。

## 边界

- 一个部署一个游戏仓库；多个仓库就是多个部署。
- 仅 GitHub.com；Feishu 可选，按 superagent 文档配置。
- 截图需要真实渲染：superagent 必须跑在有桌面的会话里；无桌面时 worker 只能报 `NOT VERIFIED`。
- worker 以操作者 OS 用户运行（superagent 的既有边界）；守卫只降低误写风险，不是安全沙箱。`guard-writes` 只检查 `write`/`edit`，shell 命令不在守卫范围；真正的边界是专用 OS 账号与人工合并。

## 许可

MIT
