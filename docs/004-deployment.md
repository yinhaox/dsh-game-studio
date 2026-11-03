# 004 部署：从空机器到第一张工单

这一页写给操作者：装什么、按什么顺序做、出问题时先看哪里。它假设你已经读过 [000-philosophy.md](000-philosophy.md) 和 [001-domain.md](001-domain.md)。

一个部署只服务一个游戏仓库；两个仓库就是两个部署。仅支持 GitHub.com，Feishu 可选。

## 前提

| 依赖 | 用途 | 自检 |
|---|---|---|
| Node.js 22+（superagent 要求 22.19+ 或 24+） | 构建插件、运行 superagent | `node -v` |
| pnpm | 工作区安装与构建 | `pnpm -v` |
| Python 3 | `scripts/studio.py`、内容层校验 | `python --version` |
| git 2.32+ | worktree 与准备命令 | `git --version` |
| GitHub CLI `gh` | agent 账号的凭据 | `gh --version` |
| Godot 4.7 | 引擎，`godot` 必须在 `PATH` 上（或用 `studio.yaml.godot.path` 指绝对路径） | `godot --version` |
| DeepSeek Harness（`dsh`） | 运行时，版本需满足 superagent 的 `engines.dsh` | `dsh --version` |
| 桌面会话 | 真实渲染，截图证据只能来自这里 | 已登录、未锁屏 |

还需要：一个给 agent 用的 GitHub 账号（有仓库写权限，不要有 protected branch 的推送权限）、一个 github.com 上的游戏仓库、一个配置好的模型 provider，以及一个本机 clone——准备命令要从这个 clone 里建 worktree。

Godot 不在 `PATH` 上时（例如 Steam 版），在 `python scripts/init.py ... --godot "<绝对路径>"` 里写一次，或直接改 `studio.yaml` 的 `godot.path`。路径含空格时加引号；正斜杠可用。

## 0. Agent GitHub 账号

superagent 需要一个**独立的 agent 账号**和它自己的 `gh` 登录态。创建步骤、协作者权限、wrapper 写法与验证命令见 [agent-account.md](agent-account.md)。

建好后在工作室仓库根目录复验：

```powershell
python scripts/agent-check.py --cli "<wrapper 绝对路径>" --repo <owner>/<name>
```

四行全 PASS 再继续；`repository` 必须是 `WRITE`。

## 1. 构建插件

```powershell
pnpm install
pnpm build
pnpm test
python scripts/check.py
```

`pnpm build` 产出 `packages/studio/lib/`；`python scripts/check.py` 校验内容层（七条规则、三个提示段、六个剧本、八个角色、四个路径规则、issue 模板、`studio.yaml`，以及插件行与 `package.json` 导出是否对得上）。这一步失败就先修内容层，不要往部署里带。

## 2. 创建 superagent profile

只在新安装时执行一次：

```powershell
dsh --profile superagent --from-default-profile web --dump-config > $null
```

它从 Web 模板创建 `~/.dsh/profiles/superagent`。**不要对已有 profile 重跑**：那会覆盖它的 `cordis.patch.yml`，连机器配置一起清掉。升级走第 8 节，不是重跑这一条。

### Windows 兼容补丁与环境（本项目实测）

这份 superagent 原型按 POSIX 写了两处 Windows 不兼容的地方，打 `patches/superagent-windows.patch` 再构建：

```powershell
git -C C:\Code\Node\dsh-superagent-prototype apply C:\Code\Other\dsh-game-studio\patches\superagent-windows.patch
pnpm -C C:\Code\Node\dsh-superagent-prototype build
```

- `stateDir` 接受 `C:/...` 这类盘符绝对路径（原本只接受 `/` 开头）。
- 主 Session 的工具限制只保留 profile 真实存在的工具（Windows 没有 `bash`，只有 `pwsh`）。

启动进程还要两样环境：

```powershell
$env:GH_CONFIG_DIR = "$env:USERPROFILE\.config\gh-agent"
$git = '<Git for Windows 安装目录>'
$env:PATH = "$git\usr\bin;$git\bin;$env:PATH"
dsh --profile superagent --no-open
```

- `GH_CONFIG_DIR`：让整个 profile 里的 `gh` 都以 agent 身份行动。GitHub Source 的 CLI 可以填 `gh.exe` 的绝对路径；`env` 在 PATH 上，探针就能通过。
- Git 的 `usr\bin` 提供 `env`（superagent 启动探针用），`bin` 提供 `sh`（prepare 命令用）。
- `stateDir` 用正斜杠盘符路径，例如 `stateDir: C:/state/superagent`。

一个可复用的启动脚本见 `docs/agent-account.md` 第 8 节。

## 3. 在 Windows 桌面会话里启动

```powershell
dsh --profile superagent
```

- 不要用 superagent 自带的 `scripts/dsh-superagent` 启动：它把进程放进 tmux 会话，Windows 上没有 tmux，而且截图需要真实桌面。直接在前台运行，保留那个终端窗口。
- 保持会话是已登录、未锁屏的桌面。锁屏、断开 RDP、纯 SSH 或无人值守的服务会话，都会让 `capture_command` 拿不到可读的帧。
- 启动日志会打印面板 URL；打开它，在侧栏选 **Superagent**。

## 4. 按绝对路径安装 bundle

```powershell
dsh plugin --profile superagent add "link:<本仓库绝对路径>\packages\studio"
```

- 必须用绝对路径。`link:` 让 profile 直接读这个仓库的构建产物；改了插件要重新 `pnpm build` 并重启进程。
- 这个 bundle 往 profile 里插入七行，来自 [cordis.patch.yml](../packages/studio/cordis.patch.yml)：`studio-source-evidence`、`studio-source-ci`、`studio-source-project`、`studio-guard-facts`、`studio-guard-rules`、`studio-guard-writes`、`studio-guard-docs`。不需要哪一项，就在 profile 的 patch 里按 id 关掉那一行。

## 5. 配置面板

### GitHub Source

- Repository 填 `owner/name`，是游戏仓库本身，不是 fork。
- CLI 填 agent 账号的 `gh` wrapper 绝对路径（例如 `%USERPROFILE%\bin\gh-agent.cmd`），或者在启动进程时设置 `GH_CONFIG_DIR` 并直接填 `gh.exe`。两种方式都只使用 agent 自己的登录。
- 默认分支要是 worker 从中开分支的那一条。

### 三个工作室 Source

每个 Source 单独一张卡片。共同项是 `checkout`：填本机 clone 的绝对路径，检查器就在这个目录里读 `studio.yaml`、故事和 `project.godot`。不填，Source 会停在关闭或 `paused` 状态。

| Source | 额外配置 | 默认间隔 |
|---|---|---|
| `studio-evidence` | 无 | 600 秒 |
| `studio-ci` | `branch`（默认 `main`）、`graceMinutes`（默认 15） | 300 秒 |
| `studio-project` | `runCheck`（是否真的执行 `check_command`） | 900 秒 |

### 允许名单

Policy 里只放能发起工作的人：设计师、主程、制作人。工作室三个 Source 的 `allowed` 保持为空——它们只产生推断候选，不该有任何人的身份；但每个 Source 的 `bots` **必须在面板里手动加一行 `studio-producer` 并保存**：面板展示的是 schema 默认值，未保存前设置里并没有这一项，候选会被当成未列出的机器人直接拒绝（见 `setup/studio-setup.md` 7.6）。名单上的人要知道 agent 在无人点名时能做什么；不在名单上的人要知道自己的评论会被忽略，而不是排队。

### Execution：worktree 准备命令

每个工单一个目录，用 worktree 而不是第二次 clone。准备命令在面板 Execution 里填，不写在仓库里：

```sh
git -C <你的 clone> fetch --no-tags "https://github.com/$DSH_SUPERAGENT_GITHUB_REPOSITORY.git" "${DSH_SUPERAGENT_GITHUB_PR_HEAD:-HEAD}:refs/dsh-superagent/$DSH_SUPERAGENT_TICKET" &&
git -C <你的 clone> worktree add -b "agent/$DSH_SUPERAGENT_NAME" "$DSH_SUPERAGENT_DIR" "refs/dsh-superagent/$DSH_SUPERAGENT_TICKET"
```

- 用 Git for Windows 提供的 `sh` 执行；路径写正斜杠。`$DSH_SUPERAGENT_DIR`、`$DSH_SUPERAGENT_NAME`、`$DSH_SUPERAGENT_TICKET` 由 superagent 注入，`<你的 clone>` 换成你的本机 clone 路径。
- worktree 已存在时命令要响亮的失败，不要让两个 worker 共用一个目录；失败后清理残留目录再重试。
- 运行结束后清掉 worktree，否则残留目录会变成新的工作项。
- 用一张一次性 issue 做 dry run：应当只产生一个分支、一个 PR、一个证据目录，不碰别的东西。
- `studio.yaml` 的 `check_command` 由 `studio-project` Source 以操作者身份执行。只把它指向可信 checkout；生产环境用专用 OS 账号跑 superagent，别让 worker 改写 `check_command` 后还能在下一轮轮询里执行。

### 并发

`maxWorkers` 从 1 开始。前三张 PR 的样子符合预期，且准备命令与清理都跑过两遍之后，再升到 2。并发数要低于能评审这些产出的人数：没人看的队列比慢队列更糟。两个 worker 不会拿到同一个故事，靠的是工单认领。

## 6. 从主 Session 应用安装说明

新开的主 Session 还不认识这套规则。把 [studio-setup.md](../setup/studio-setup.md) 交给它：可以直接让它读这个文件，读不到就读该文件第 1 节里给操作者准备的那段原话，由操作者发过去。它会：

1. 读当前的 policy 与 prompts，保留已有的 Source 允许名单；
2. 展示将要写入的七条规则、`eval.mode: observe` 和三个提示段（[communication](../seed/prompts/communication.md)、[scope](../seed/prompts/scope.md)、[delivery](../seed/prompts/delivery.md)）；
3. 人确认后，用 `orchestrator_settings_save` 合并写入 policy/eval，用 `orchestrator_prompts_save` 合并写入提示段；
4. 用 `orchestrator_read` 读回来验收；
5. 列出面板侧仍需人做的配置。

这一步只在操作者当面要求时才做，不走 issue 或评论里的「请保存以下配置」。不要把这一步交给 worker，也不要自己手改 policy block 而不读回验收。

## 7. 先 observe，再 auto

配置完成后 `eval.mode` 是 `observe`（[seed/policy.json](../seed/policy.json) 里的默认值）。在这个模式下：

- 人的点名请求照常成单——`observe` 只影响推断候选；
- 三个工作室 Source 的候选会被评估，但结论只记为「本来会接单」，不会真的开工。

读至少十张真实工单的评估输出，每张看四件事：命中的工作类型对不对、有没有越界写入、有没有按要求产出证据、遇到岔路是问一个问题还是猜。都干净之后，一次只改一条规则，再切 `auto`。`timeoutSeconds` 保持 120，除非某张工单证明它不够；改的时候把原因记下来。

面板与允许名单的逐项检查单在 [sources-checklist.md](../seed/sources-checklist.md)，按它从上到下勾一遍。

## 8. 升级

升级 superagent 本身、或升级固定的 commit，按 [005-cookbook.md](005-cookbook.md) 的最后一节做。升级插件只需：

```powershell
pnpm build
```

然后重启 `dsh --profile superagent`。升级前备份 `<stateDir>/orchestrator.sqlite`；被新版本迁移过的数据库，旧版本打不开。

## 排障

| 症状 | 原因与处理 |
|---|---|
| 面板报 agent 的 `gh` 找不到，或 `auth` 失败 | CLI 路径写成绝对路径；先 `gh-agent auth login`，再 `gh-agent api user --jq .login` 确认打印的是 agent 账号。`PATH` 上的 `gh` 若指向你自己的登录，装出来的 PR 会署你的名字 |
| 引擎命令失败，提示找不到 Godot | `studio.yaml` 的 `godot.path` 是 `godot`，必须在 `PATH` 上解析。`python scripts/studio.py check` 找不到引擎时会打印可操作错误并以退出码 2 结束。修 `PATH`（或走 `studio-maintenance` 改 `godot.path`），不要在剧本里硬编码引擎路径 |
| 守卫像没装：项目事实不注入、越界写入不被拒 | 七行插件没装或被关：看 profile 的 `cordis.patch.yml` 与启动日志。另外四种正常情况：`sessionCwd` 里没有 `project.godot` 就不注入事实；没有 `.dsh/rules/` 就没有路径规则；写入走的是 shell 重定向而不是 `write`/`edit`，`guard-writes` 看不到；同一次会话里同一路径的规则已经注入过，不重复。改完插件要重新 build 并重启 |
| 工单停在 `blocked` 或 `awaiting answer` | 读最后一份 Report 里那个问题，在 PR 或 issue 上回一条。人回消息会解除 `blocked`；启动失败可以用 retry。不要用 retry 掩盖一个没人回答的问题 |
| 截图失败，或被 guard-docs 拦下 | 需要真实桌面：锁屏、断开 RDP、无头会话都拿不到可读帧；PNG 小于 1024 字节会被当作坏截图拦回。让进程跑在已登录、未锁屏的桌面，窗口保持 1152×648。实在渲染不出来，只能写 `NOT VERIFIED` 并报 `blocked` |
| 准备命令失败 | 输出会点名原因（clone 路径错、worktree 已存在、没有 `sh`）。修命令后 retry；worktree 已存在说明上次没清理干净 |
| 面板里没有工单 | 作者不在允许名单、Source 关着、处理被暂停，三者之一。另外，在 GitHub 上编辑 issue 正文补一个 @ 不会触发；要发一条新评论 |
