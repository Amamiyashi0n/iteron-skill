# Iteron

Iteron 是一个可供 Claude Code、Codex 和 DeepSeek Harness 使用的 Agent Skill，适合能拆成多个可独立验收阶段、需要跨会话续做的任务。它把计划、验收证据和下一步留在项目里，让新的会话可以接着上一次的发现继续工作。

## 安装

### Claude Code、Codex 和其他 Agent

把本仓库克隆到对应的技能目录。也可以在 `iteron-skill` 目录中只复制 `SKILL.md`、`references/`、`templates/` 和 `scripts/`，保留这些文件和目录的相对位置。运行记录校验器时需要 Node.js 20 或更高版本。

| Agent | 用户级目录 | 项目级目录 | 调用方式 |
| --- | --- | --- | --- |
| Claude Code | `~/.claude/skills/iteron-skill/` | `.claude/skills/iteron-skill/` | `/iteron-skill` |
| Codex | `~/.agents/skills/iteron-skill/` | `.agents/skills/iteron-skill/` | `$iteron-skill` |

例如，在目标项目根目录运行下列对应命令，然后开启新会话。

```sh
# Claude Code
git clone https://github.com/Amamiyashi0n/iteron-skill.git .claude/skills/iteron-skill

# Codex
git clone https://github.com/Amamiyashi0n/iteron-skill.git .agents/skills/iteron-skill
```

其他兼容 Agent Skills 格式的工具，可将同一份 `iteron-skill/` 放进该工具的技能目录。项目任务记录仍写入目标项目的 `agent.md` 和 `.agent/`。

### DeepSeek Harness

1. 将本仓库克隆到 DeepSeek Harness 所在的机器。
2. 在 DeepSeek Harness 打开 **Plugins → Add plugin**，选择克隆后的仓库根目录，也就是包含 `package.json` 和 `cordis.patch.yml` 的目录。
3. 安装并启用插件，然后新建会话。技能列表中应出现 `iteron-skill`。

## 使用

在目标项目的会话里请求加载 `iteron-skill`，例如：

> 用 Iteron 分阶段修复导出问题。先复现缺失的数据行，再定位原因、修复并用同一份输入验收。每次尝试记录结果和下一步，方便下次继续。

续做时提供任务 ID，或请它从项目根目录的 `agent.md` 找到已有任务。

每一轮尝试都用观察结果决定下一步。比如导出少了一行，追踪同一个 ID 后发现它是在过滤阶段丢失的，这个发现就能把排查范围缩小到过滤条件。修复后用同一份输入重跑。确认交付通过后，报告起点、关键发现和最终结果。如果这条方法能帮到其他任务，再记录它的适用条件、操作步骤和验证方法。

## 任务记录

| 路径 | 用途 |
| --- | --- |
| `agent.md` | 任务索引和计划入口 |
| `.agent/<任务 ID>-plan/plan.md` | 当前计划、验收条件和续做位置 |
| `.agent/<任务 ID>-plan/stages/records.md` | 逐次验收、重规划和总验收 |
| `.agent/<任务 ID>-plan/distillation/notes.md` | 按需记录有证据支撑的可复用方法 |

工作流见 [SKILL.md](SKILL.md)，记录格式和完整示例见 [任务记录规范](references/task-record.md)，可复制的文件见 [模板](templates/README.md)。

## 校验与开发

在插件仓库目录下运行，需要 Node.js 20 或更高版本。

```sh
npm test
npm run check -- <目标仓库路径> <任务ID>
npm run check -- <目标仓库路径>
```

带任务 ID 时检查指定任务及其索引行。省略任务 ID 时检查目标仓库的全部记录。记录校验报告错误时返回退出码 1，只有警告时返回 0。
