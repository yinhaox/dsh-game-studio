# dsh-game-studio

English | [中文](README.md)

A **game studio that works only on GitHub**, built on **dsh-superagent**: people file requests in issues and pull requests, answer the one question that matters, and merge; an agent implements the work in an isolated worktree and answers with a pull request that carries its verification and evidence. A panel shows who is waiting on whom.

The engine is **Godot 4** only (the template is verified on 4.7).

## What is in the box

| Layer | Content | Location |
|---|---|---|
| Runtime | `dsh-superagent` (external dependency, **not modified**) | its own repository and deployment |
| Plugins | 3 proactive Sources + 4 Guards, each switchable on its own line | `packages/studio` |
| Content | 7 work types, 3 team prompt sections, 6 worker playbooks, 8 roles | `seed/`, `template/.dsh` |
| Template | an openable Godot 4 project + issue/PR templates + `studio.py` | `template/` |
| Tooling | project init, structure checks, protocol compatibility check | `scripts/` |

superagent already provides authorization, tickets, isolated execution, follow-up questions, pull-request delivery, the panel and recovery. This repository adds only what it lacks:

- **Proactive findings**: missing evidence, a red default branch, a Godot parse failure or engine-version drift become bot candidates (observed first, accepted later).
- **Engineering guards**: project facts, path-scoped rules, write boundaries, and the story/evidence contract.
- **Studio craft**: work types, prompts, playbooks, roles and templates.

## Quick start

### 1. Build the plugins

```powershell
pnpm install
pnpm build
pnpm test
python scripts/check.py
python scripts/compat-check.py --superagent <superagent checkout>
```

### 2. Deploy superagent

Follow [docs/004-deployment.md](docs/004-deployment.md) to create a dedicated profile, an agent GitHub account and a test repository. An agent account cannot be created by a machine; see [docs/agent-account.md](docs/agent-account.md) for creating and verifying one. On Windows, run it in a desktop session:

```powershell
dsh --profile superagent
```

### 3. Install the studio bundle

```powershell
dsh plugin --profile superagent add "link:<absolute path to this repository>\packages\studio"
```

### 4. Initialize a game repository

```powershell
python scripts/init.py ../my-game --studio "My Game"
```

When Godot is not on `PATH` (the Steam build, for example), write its executable path once:

```powershell
python scripts/init.py ../my-game --studio "My Game" --godot "<absolute path to the Godot executable>"
```

Push the repository to GitHub, then use [setup/studio-setup.md](setup/studio-setup.md) so the superagent main Session writes the work types and prompt sections.

### 5. Start working

Mention the agent in an issue and name its type (`Type: design|story|bug|review`). Keep `observe` mode until the producer's judgements look right, then switch to `auto`.

## Layout

```
packages/studio/      plugin package (one package, several entries, tsdown + vitest)
src/producer/         the three Sources: evidence / ci / project
src/guard/            the four Guards: facts / rules / writes / docs
src/shared/           structural superagent contract and shared helpers
seed/                 work types and prompt sections
template/             game-repository template (Godot 4)
docs/                 design, deployment and troubleshooting (Chinese)
setup/                the installer document for the main Session
scripts/              init / check / compat-check / agent-check
```

## Boundaries

- One deployment serves one game repository; several repositories mean several deployments.
- GitHub.com only. Feishu is optional and configured as superagent documents.
- Screenshots need real rendering: superagent must run in a session with a desktop; without one a worker can only report `NOT VERIFIED`.
- Workers run as the operator's OS user (superagent's existing boundary). The guards reduce mistakes; they are not a sandbox. `guard-writes` covers `write` and `edit` only, not shell commands; the real boundary is a dedicated OS account and human merging.

## License

MIT
