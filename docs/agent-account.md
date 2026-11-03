# Agent GitHub 账号：创建与验证

superagent 需要一个**独立的 GitHub 账号**当 agent：它用自己的身份读通知、评论、推分支、开 PR。这个账号不能由我代建——GitHub 注册要邮箱验证、CAPTCHA、接受服务条款和 2FA，自动化建号也违反其条款。你按下面的清单创建，10 分钟能完成；建好后把三样信息给我（见第 6 节），我来验证和接部署。

## 1. 为什么必须是独立账号

- superagent 的 GitHub Source 读的是 **agent 账号自己的通知**；用你的个人账号会把你的通知流混进工单。
- agent 的评论、提交、PR 会署名这个账号，审计上分得清人和 agent。
- 权限可以只给到这一个仓库、只给 Write，不碰你的其他项目。
- 用 GitHub App 不行：superagent 读通知、发评论都走 `gh`，App 没有这个登录态。

## 2. 创建账号

1. 准备一个**专用邮箱**（可以是别名；必须能收验证邮件）。
2. 打开 <https://github.com/signup>，用这个邮箱注册。用户名建议 `<游戏名>-agent`，例如 `mygame-agent`；显示名写 `My Game Studio Agent`。
3. 验证邮箱，然后**立即开启 2FA**（Settings → Password and authentication → Authenticator app），把恢复码存进密码管理器。
4. 头像和简介写清楚是自动化账号，例如 "Automated studio agent. A human reviews before anything ships."

## 3. 准备仓库与权限

推荐：**仓库归你**，agent 当协作者。

1. 在你的账号下建游戏仓库（private 即可），默认分支 `main`。
2. Settings → Collaborators → Add people → 输入 agent 用户名 → 角色选 **Write**。
3. Settings → Branches / Rulesets：保护 `main`——禁止直接 push、要求 PR；agent 的 Write 权限只够推自己的分支和开 PR。
4. 确认 agent 账号**不是**仓库 admin，也没有 tag/release 权限。

也可以反过来把仓库建在 agent 账号下、把你加成 admin；但工单、通知和审计都更绕，不推荐。

## 4. 给 agent 配一个独立的 gh

agent 不能用你的 `gh` 登录态。做一个小 wrapper，让它只读自己的配置目录。

### Windows（CMD，superagent 面板里填这个路径）

```bat
@echo off
rem %USERPROFILE%\bin\gh-agent.cmd
set "GH_CONFIG_DIR=%USERPROFILE%\.config\gh-agent"
gh %*
```

把 `%USERPROFILE%\bin` 放进 PATH，或在面板里直接填 `%USERPROFILE%\bin\gh-agent.cmd`。

### Windows（PowerShell 里手动用）

```powershell
$env:GH_CONFIG_DIR = "$env:USERPROFILE\.config\gh-agent"
gh auth login --hostname github.com --git-protocol https --web --scopes "repo,notifications,read:org,workflow"
gh auth status
gh api user --jq .login
```

第二条命令会打开浏览器；**用 agent 账号登录**，不是你的账号。`--scopes` 里的 `notifications` 是 superagent 读通知要用的；少了它，Source 会健康但读不到事件。

### 提交身份

```powershell
git config --global user.name "My Game Studio Agent"
git config --global user.email "<agent-user-id>+<agent-login>@users.noreply.github.com"
```

`<agent-user-id>` 在 `https://api.github.com/users/<agent-login>` 的 `id` 字段。superagent 的 execution environment 也会设置提交身份；这里配好是为了你在本机手动验证时不串号。

## 5. 验证

在工作室仓库根目录跑：

```powershell
python scripts/agent-check.py --cli "%USERPROFILE%\bin\gh-agent.cmd" --repo <你的账号>/<游戏仓库>
```

期望四行全 PASS：

```text
PASS  cli: gh version ...
PASS  login: <agent-login>
PASS  repository: <owner>/<repo> (WRITE, default branch main)
PASS  notifications: ...
```

- `login` 必须是 agent 账号，不是你的。
- `repository` 的权限必须是 `WRITE`；`READ` 说明还没加协作者。
- `notifications` 失败通常是 token 少了 `notifications` scope：重新 `gh-agent auth login --scopes ...`，或 `gh-agent auth refresh -s notifications`。

## 6. 建好后告诉我

只需要三样，**不要发密码、2FA 种子或 token**：

1. agent 的 GitHub 登录名（例如 `mygame-agent`）；
2. 游戏仓库的 `owner/name`；
3. wrapper 的绝对路径（例如 `%USERPROFILE%\bin\gh-agent.cmd`）。

我拿到后会：
- 跑 `agent-check.py` 复核；
- 按 [004-deployment.md](004-deployment.md) 建 superagent profile、装 bundle、配面板；
- 如果你想让我先跑一个最小闭环，我会用一个**一次性私有测试仓库**做 A–E 场景，不碰你的正式仓库。

## 7. 不想建第二个账号时的临时办法

可以先用**你自己的账号**在**一次性私有仓库**里跑通闭环：把仓库设成 private，allowed list 只写你自己，跑完就归档。

代价：

- agent 的评论和提交都署你的名，审计分不清人机；
- superagent 会读你的通知（只限该仓库相关，但仍在你的账号下）；
- 不能用于正式项目。

如果你选这条路，告诉我一声，我按"个人账号 + 一次性仓库"配置，并在结束后清理。

## 8. 启动脚本（Windows）

把下面存成 `%USERPROFILE%\bin\start-superagent.ps1`，用 `pwsh -NoProfile -File` 启动：

```powershell
$env:GH_CONFIG_DIR = "$env:USERPROFILE\.config\gh-agent"
$git = '<Git for Windows 安装目录>'
$env:PATH = "$git\usr\bin;$git\bin;$env:PATH"
Set-Location '<superagent 仓库>'
dsh --profile superagent --no-open
```

- `GH_CONFIG_DIR` 让整个 profile 以 agent 身份调用 `gh`。
- Git 的 `usr\bin` 提供 `env`（启动探针用），`bin` 提供 `sh`（prepare 命令用）。
- 面板 GitHub Source 的 CLI 填 `gh.exe` 的绝对路径 即可；env 已指向 agent。

## 9. 浏览器会话：评审与合并用你自己的账号

`gh-agent auth login` 的浏览器授权会留下一个 agent 账号的 GitHub 登录态。**用完就退出**，或者用无痕窗口；否则你在浏览器里点“Merge”会以 agent 身份合并，GitHub 记 `mergedBy` 为 agent，审计上分不清人和 agent。

- 评审、approve、合并：用你自己的账号。
- agent 只负责开 PR；它不会合并（prompt 里也禁止）。
- 如果 agent 账号的浏览器会话还在，先 `Sign out`，再切回你的账号。
