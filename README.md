# Iteron

Iteron 是一个可供 Claude Code、Codex 和 DeepSeek Harness 使用的 Agent Skill，适合能拆成多个可独立验收阶段、需要跨会话续做的任务。它把计划、验收证据和下一步留在项目里，让新的会话可以接着上一次的发现继续工作。

> [!WARNING]
> 作者不建议在 Claude（包括 Claude Code）中使用本 Skill，使用过程中账号很容易被封禁。请优先在 Codex 或 DeepSeek Harness 中使用；如果仍要在 Claude 中使用，风险由使用者自行承担。

## 安装

### Claude Code、Codex 和其他 Agent

在目标项目根目录运行以下命令，用 [Vercel Skills CLI](https://github.com/vercel-labs/skills) 为 Claude Code 和 Codex 安装 Iteron。其中 Claude Code 不推荐使用，见上方警告。

```sh
npx skills add Amamiyashi0n/iteron-skill --skill iteron-skill -a claude-code -a codex
```

只用一个 Agent 时保留对应的 `-a` 参数。加 `-g` 可安装到用户目录，供多个项目使用。其他受支持的 Agent 可指定其 [安装器标识](https://github.com/vercel-labs/skills/blob/main/docs/agents.md)。安装后开启新会话。

| Agent | 用户级目录 | 项目级目录 | 调用方式 |
| --- | --- | --- | --- |
| Claude Code（不推荐） | `~/.claude/skills/iteron-skill/` | `.claude/skills/iteron-skill/` | `/iteron-skill` |
| Codex | `~/.agents/skills/iteron-skill/` | `.agents/skills/iteron-skill/` | `$iteron-skill` |

也可以手动将 `SKILL.md`、`references/`、`templates/` 和 `scripts/` 放进对应的 `iteron-skill/` 目录，保留相对路径。项目任务记录仍写入目标项目的 `agent.md` 和 `.agent/`，运行记录校验器需要 Node.js 20 或更高版本。

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

新任务统一写到 `.agent/`。已有任务如果放在 `agent/`，可以直接查找、续做和校验，索引链接使用实际路径。

## 创建任务

可以用脚手架一次生成任务目录、`plan.md` 和 `agent.md` 索引行，省去手工替换模板占位符。`--criterion` 和 `--item` 可重复；`--item` 的三个字段用 `|` 分隔，依次是需求、预期结果和验收标准。

```sh
node scripts/new-task.mjs --title "导出批量金额" --goal "导出的每一行都带转换后的金额" \
  --criterion "导出文件包含全部源数据行" \
  --item "复现缺失的数据行|能用 feed.csv 复现|用 feed.csv 复现出缺失的数据行" <目标仓库路径>
```

任务 ID 取 UTC 创建时间，同一秒内重复创建会加 `-2`、`-3` 后缀。脚本生成的 `plan.md` 带 `owner` 认领和第一个续做动作 `start T-001`，生成后应能通过下面的校验。依赖关系、`baseline` 等可选字段需要再手工补充。

## 校验与开发

在插件仓库目录下运行，需要 Node.js 20 或更高版本。

```sh
npm test
npm run check -- <目标仓库路径> <任务ID>
npm run check -- <目标仓库路径>
npm run check -- --json --strict --stale-days 7 <目标仓库路径>
```

带任务 ID 时检查指定任务及其索引行。省略任务 ID 时检查目标仓库的全部记录。记录校验报告错误时返回退出码 1，只有警告时返回 0（传入 `--strict` 时警告也返回 1，`--json` 输出结构化 JSON，`--stale-days <天数>` 自定义认领过期阈值，`--help` 查看用法）。没有 Node.js 时，按[任务记录规范](references/task-record.md#without-node)里的清单人工核对，并向用户说明脚本没有运行。校验器报告的问题怎么处理，见[规范中的对照表](references/task-record.md#resolving-checker-findings)。
