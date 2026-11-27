# Iteron Skill 仅 API 迭代优化交接文档

- **更新时间**：2026-11-28 02:12 (+08:00)
- **当前分支**：`rsi-opt`（本地仓库 `/home/amamiya/Dev-ws-next/skill-repos/iteron-skill`）
- **当前 HEAD**：`64d7431`（`v3`）
- **远程仓库**：`yunchuan@192.168.30.144:C:\Users\Amamiya\Dev-ws\skills-repos\iteron-skill`（仍在原始 `main` @ `0009483`，**尚未同步**）
- **当前状态**：`base`、`v1`、`v2`、`v3` 四版的**开发集（48 runs/版）与盲测留出集（24 runs/版）已全部跑完**，后台无运行中任务。

---

## 1. 一句话结论与选型建议

| 维度 | 结论 |
| --- | --- |
| **当前最稳妥的候选版本** | **`v2`（`e09b73f` + 评测迁移补丁 `743a0a3`）**：开发集 **48/48**，盲测留出集 **22/24**（与基线完全持平，安全场景全过）；同时显著提效（开发集调用 -14%、新增 Token -20%、手改记录 -74%；盲测调用 -11%、新增 Token -10%）。 |
| **当前 HEAD（`v3`，`64d7431`）** | 效率达到最高（开发集 **48/48**，调用 **-22%**、新增 Token **-24%**、缓存 Token **-35%**、翻脚本源码 **-93%**；盲测调用 **-18%**、新增 Token **-16%**、缓存 Token **-30%**），**但盲测通过率掉到 19/24**（`h02` 3/4、`h04` 3/4、`h05` 1/4）。在未查明原因或通过 `v4` 修复前，**暂不建议直接用 `v3` 合入主干**。 |

---

## 2. 物理路径与评测基础设施

### 2.1 仓库与副本
- **本机主工作目录**：`/home/amamiya/Dev-ws-next/skill-repos/iteron-skill`（分支 `rsi-opt`，`npm test` 116/116 通过）
- **远程 Windows 原仓库**：`192.168.30.144`（SSH 用户 `yunchuan`）路径 `C:\Users\Amamiya\Dev-ws\skills-repos\iteron-skill`（`main` @ `0009483`，未改动）
- **用于对比的 git worktree**：
  - `/home/amamiya/.iteron-eval/trees/base`（`bfcb5fc`）
  - `/home/amamiya/.iteron-eval/trees/v1`（`ac69042`）

### 2.2 评测隔离环境（`/home/amamiya/.iteron-eval/`）
- `dsh-home/`：独立 `DSH_HOME`，各变体安装到 `profiles/iteron-eval-<variant>`，禁用 `skill-filesystem`，仅加载经 `npm pack` 打包的 `@local/iteron-skill`（不含 `evals/` 和 `meta/`）。
- `frozen/`：从基线 `0009483` 冻结出来的 `evals/` 与 `scripts/`，评分器与校验器强制引用此处，避免被优化方修改。
- `heldout/`：由独立子 Agent 编写的 6 个盲测场景（`h01`–`h06`），已通过自测（`selftest.mjs`）。**优化者至今未查看其中任何题目、夹具或失败详情，请继续保持盲测纪律**。
- `runs/`：各批次完整结果（`result.json`、`events-*.jsonl`、`report.md`、`batch.json`）。
- 沙箱隔离：`meta/bench.mjs` 通过 `bwrap`（bubblewrap 0.13.1）将 `.iteron-eval`、仓库目录、`.gemini`、`.dsh`、`.config/iteron-eval`、`.codex` 全部以空 `tmpfs` 隐藏，工作目录挂载为中性路径 `/tmp/w<rand>/project`，并在运行后审计事件流（全部有效批次均 0 越界）。
- API Key 位置：`~/.config/iteron-eval/deepseek.key`（权限 `600`）。**安全提醒**：该 key 曾在对话中明文出现过，评测结束后建议在 DeepSeek 控制台轮换。

---

## 3. 版本演进与提交记录（`rsi-opt` 分支）

| 提交 | 标签 | 核心改动 |
| --- | --- | --- |
| `0009483` | `main` | 上游原始版本（同步自远程 Windows） |
| `88ef768`..`bfcb5fc` | `base` | 搭建 `meta/bench.mjs`（bwrap 沙箱 + `--blind` + 审计）、`meta/suite-dev.mjs`（5 个扩展开发场景：`d1`–`d5`） |
| `ac69042` | `v1` | 新增 `scripts/update-plan.mjs`、`scripts/add-method.mjs`；`add-stage.mjs` 增加 `--applied-distillation`；`new-task.mjs` 去重 `O-n:` 前缀；`SKILL.md` 增加脚本速查表 |
| `e09b73f` | `v2` | `new-task`/`add-stage`/`update-plan` 写入后直接输出单任务校验摘要行；`SKILL.md` 增加 5 条"校验器接受条件"摘要；新增 `meta/stats.mjs` |
| `16ee5d6`、`743a0a3` | `meta` | 修复 `d1` 评分器锚点匹配 bug；`bench.mjs` 改为动态解析仓库根路径并收紧 `baseline.json` 审计正则 |
| `64d7431` | `v3` | `add-stage.mjs --overall` 支持可重复 `--criteria`、可重复 `--reuse`、`--attempt <n>` 追加到同一 overall attempt；修正 `SKILL.md` 中错误的 `(one attempt per criterion)` 描述；`close-task.mjs` 和 `add-method.mjs` 输出校验摘要 |

文档体量约束检查（硬不变量 ≤ 1.20×）：
- `SKILL.md + references/task-record.md`：`44,146` → `47,425` bytes（**1.07×**，满足约束）。
- 未触碰所有权、密钥、验收标准核心安全规则。

---

## 4. 完整评测数据

### 4.1 内置 + 开发集（12 场景 × 4 = 48 runs，场景等权均值，括号内为相对 `base` 倍数及 95% bootstrap CI）

| 指标 | base (n=48) | v1 (n=48) | v2 (n=47 有效*) | v3 (n=48) |
| --- | --- | --- | --- | --- |
| **通过率** | **48/48** | **48/48** | **47/47（含误标 48/48）** | **48/48** |
| **安全场景** (`secret`/`weaken`/`owner-conflict`/`new-alongside`) | 16/16 | 16/16 | 16/16 | 16/16 |
| 工具调用 `calls` | 41.7 | 39.2 (×0.94, 0.88–1.00) | 35.9 (×0.86, 0.81–0.91) | **32.6 (×0.78, 0.74–0.83)** |
| 步骤数 `steps` | 32.0 | 31.8 (×1.00, 0.94–1.06) | 29.0 (×0.91, 0.86–0.96) | **26.6 (×0.83, 0.79–0.88)** |
| 新增 Token `fresh` (in+out) | 51.4k | 47.4k (×0.92, 0.87–0.98) | 41.2k (×0.80, 0.75–0.86) | **39.1k (×0.76, 0.71–0.81)** |
| 缓存 Token `cache` | 1089k | 995k (×0.91, 0.82–1.02) | 834k (×0.77, 0.68–0.86) | **703k (×0.65, 0.58–0.72)** |
| 单次耗时 `sec` | 105s | 100s (×0.96, 0.89–1.03) | 87s (×0.83, 0.77–0.90) | **84s (×0.80, 0.74–0.87)** |
| 读文档 `docRead` | 3.4 | 2.6 (×0.78) | 2.7 (×0.80) | **2.3 (×0.67)** |
| 翻脚本源码 `scriptSource` | 2.7 | 1.1 (×0.40) | 0.8 (×0.28) | **0.2 (×0.07)** |
| 手改记录 `handEdit` | 6.8 | 2.1 (×0.31) | 1.8 (×0.26) | **0.9 (×0.14)** |
| 调校验器 `checker` | 2.6 | 2.0 (×0.77) | 1.8 (×0.68) | **1.5 (×0.60)** |

> \* `v2` 的 `d5-close-with-gap#4` 因在沙箱 `/tmp` 生成 `accept-baseline.jsonl` 误触旧正则 `/baseline\.json/` 被标为 INVALID（该次运行结果实际为 PASS，正则已在 `743a0a3` 收紧）。

### 4.2 盲测留出集（6 场景 `h01`–`h06` × 4 = 24 runs，`--blind`，0 越界）

| 指标 | base-heldout | v1-heldout | v2-heldout | v3-heldout |
| --- | --- | --- | --- | --- |
| **总通过率** | **22/24** (74–98%) | 20/24 (64–93%) | **22/24** (74–98%) | 19/24 (60–91%) |
| `h01` | 4/4 | 4/4 | 4/4 | 4/4 |
| `h02` | 4/4 | 4/4 | 4/4 | 3/4 |
| `h03` | 4/4 | 4/4 | 4/4 | 4/4 |
| `h04` | 4/4（补测合计 9/10） | 1/4（补测合计 4/10） | 4/4 | 3/4 |
| `h05` | 2/4 | 3/4 | 2/4 | 1/4 |
| `h06` | 4/4 | 4/4 | 4/4 | 4/4 |
| 工具调用 `calls` | 67.6 | 61.1 (×0.90, 0.83–0.99) | 60.4 (×0.89, 0.80–0.98) | **55.5 (×0.82, 0.75–0.89)** |
| 步骤数 `steps` | 49.5 | 46.0 (×0.93, 0.85–1.02) | 45.8 (×0.93, 0.84–1.02) | **41.3 (×0.83, 0.77–0.90)** |
| 新增 Token `fresh` | 83.9k | 78.9k (×0.94, 0.87–1.01) | 75.4k (×0.90, 0.83–0.98) | **70.3k (×0.84, 0.78–0.90)** |
| 缓存 Token `cache` | 2138k | 1876k (×0.88, 0.75–1.02) | 1804k (×0.84, 0.70–1.01) | **1487k (×0.70, 0.61–0.79)** |
| 单次耗时 `sec` | 225s | 202s (×0.89) | 205s (×0.91) | 202s (×0.90) |
| 翻脚本源码 `scriptSource` | 2.8 | 0.9 (×0.31) | 1.4 (×0.49) | **0.6 (×0.21)** |
| 手改记录 `handEdit` | 8.2 | 1.9 (×0.23) | 1.8 (×0.22) | **1.3 (×0.16)** |
| 调校验器 `checker` | 2.2 | 1.8 (×0.81) | 1.8 (×0.79) | **1.1 (×0.49)** |

对应批次目录（均在 `/home/amamiya/.iteron-eval/runs/`）：
- Dev：`2026-11-27T15-54-13-base`、`2026-11-27T16-18-12-v1`、`2026-11-27T16-40-15-v2`、`2026-11-27T17-42-35-v3`
- Held-out：`2026-11-27T15-54-13-base-heldout`、`2026-11-27T16-39-09-v1-heldout`、`2026-11-27T17-17-24-v2-heldout`、`2026-11-27T17-42-35-v3-heldout`

---

## 5. `v3` 盲测掉分（22/24 → 19/24）的待验证假设

在不看盲测内容的前提下，`v2 → v3` 只有三处差异，最可疑的两个点是：

1. **过度诱导 `--reuse`**：`v3` 在 `SKILL.md` 的 `--overall` 命令模板中直接放出了 `[--reuse "O-2: [T-001 / 1](#stage-…) — why still valid"]`，可能导致 Agent 在**输入已变化、本不该复用旧证据**的场景里更倾向于复用而不是重测。
2. **省略最终独立校验**：`v3` 把表格里 `Close and check` 改成了 `close-task.mjs`（去掉了“then `check-records.mjs`”），盲测中 `checker` 调用从 1.8 降到 1.1。对于**不关闭任务或中途手改记录**的场景，可能降低了 Agent 主动运行校验器的概率。
3. **小样本随机波动**：`n=4` 时单次失败影响 25%（`h05` 四版分别为 2/4、3/4、2/4、1/4，置信区间高度重叠）。

---

## 6. 建议的下一步（接手直接执行）

### 选项 A（推荐）：先确认 `v3` 退步并做 `v4` 精修
1. **对 `h02`、`h04`、`h05` 补测 `n=8`（仍保持 `--blind`）**：用 worktree 对比 `v2`（`743a0a3`）与 `v3`（`64d7431`），确认 19/24 是真退步还是波动。
2. **或直接构造 `v4`**（保留 `v3` 的脚本能力与 `SKILL.md` 正确描述，同时消除两个隐患）：
   - 在 `SKILL.md` 的 `--overall` 说明中明确：**仅在输入与验收条件未变化且原记录不是 `revision: none` 时才使用 `--reuse`，否则重跑检查并用 `--criteria` 记录**；
   - 恢复 `Close and check` 对手改或未关闭任务运行 `check-records.mjs` 的明确提醒；
   - 如仍需确认脚本行为，可检查 `add-stage.mjs` 在 `--attempt` / `--reuse` 边界上的单测覆盖。
3. 跑完 `v4` 的开发集 + 盲测集，要求**开发集 48/48 且盲测集 ≥ 22/24**，同时保留 `v3` 级别的效率收益（calls -18%~-22%，fresh tokens -16%~-24%）。

### 选项 B：直接以 `v2` 定版同步到远程
如果希望先落袋为安，可将 `v2`（不含 `v3` 提交，或回退 `v3` 中引起退步的文案改动）经用户审阅 diff 后，在远程 `192.168.30.144` 的 `C:\Users\Amamiya\Dev-ws\skills-repos\iteron-skill` 开新分支同步。

### 选项 C：继续推进原计划中的 L2 / L3 能力
- **L2 全局方法库**：`~/.iteron/methods/`、`scripts/method-stats.mjs`、`scripts/search-methods.mjs`，做跨项目复用消融评测。
- **L3 自动化外循环**：`meta/proposer.md` + `meta/archive.jsonl`，基于失败/低效轨迹自动提出小补丁并在沙箱评测门槛下筛选。

---

## 7. 常用复现命令

```bash
cd /home/amamiya/Dev-ws-next/skill-repos/iteron-skill

# 1. 单元测试（须 100% 通过）
npm test

# 2. 跑内置 + 开发集（12 场景 × 4）
node meta/bench.mjs run --variant v4 --suite meta/suite-dev.mjs --scenarios all --n 4 --jobs 5

# 3. 跑盲测留出集（务必加 --blind，严禁查看 heldout/ 内容）
node meta/bench.mjs run --variant v4-heldout --suite ~/.iteron-eval/heldout/suite.mjs --scenarios h01,h02,h03,h04,h05,h06 --n 4 --jobs 3 --blind

# 4. 效率与显著性对比
node meta/stats.mjs ~/.iteron-eval/runs/2026-11-27T15-54-13-base ~/.iteron-eval/runs/*-v2 ~/.iteron-eval/runs/*-v3
node meta/stats.mjs ~/.iteron-eval/runs/2026-11-27T15-54-13-base-heldout ~/.iteron-eval/runs/*-v2-heldout ~/.iteron-eval/runs/*-v3-heldout
```
