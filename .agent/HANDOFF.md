# Iteron Skill 仅 API 迭代优化交接文档

- **更新时间**：2026-11-28 03:38 (+08:00)
- **当前分支**：`main`（本地仓库 `/home/amamiya/Dev-ws-next/skill-repos/iteron-skill`；`rsi-opt` 已同步）
- **定版代码提交**：`620865c`（`v5`，已 fast-forward 合并至 `main` 并推送 `origin/main`）
- **GitHub 远程**：`git@github.com:Amamiyashi0n/iteron-skill.git`（`main` 与 `rsi-opt` 已同步）
- **远程 Windows 原仓库**：`yunchuan@192.168.30.144:C:\Users\Amamiya\Dev-ws\skills-repos\iteron-skill`（如需本地同步，可直接 `git pull`）
- **当前状态**：`base`、`v1`、`v2`、`v3`、`v4`、`v5` 六版的**开发集（48 runs/版）与盲测留出集（24 runs/版）已全部跑完**，后台无运行中任务。

---

## 1. 一句话结论与定版结果

| 维度 | 结论 |
| --- | --- |
| **已合入主干的定版：`v5`（`620865c`）** | **双集全部达标，综合最优**：开发集 **48/48**（安全场景 16/16 全过），盲测留出集 **22/24**（追平 `base` 与 `v2`，`h05` 首次 4/4 全过）；效率达到 `v3` 级别且盲测五项核心指标 95% CI 均严格 `< 1.0`（开发集调用 -21%、步骤 -19%、缓存 Token -33%、手改记录 -88%；盲测调用 -19%、步骤 -20%、新增 Token -16%、缓存 Token -33%、耗时 -18%）。 |
| **历史对比参考** | `v2`（`e09b73f`）曾是首个双集达标版本（48/48 & 22/24，但效率收益较弱：盲测调用 -11%、新增 Token -10%）；`v3`（`64d7431`）与 `v4`（`b968227`）盲测均掉到 19/24，已通过 `v5` 修复。 |

---

## 2. 物理路径与评测基础设施

### 2.1 仓库与副本
- **本机主工作目录**：`/home/amamiya/Dev-ws-next/skill-repos/iteron-skill`（分支 `main`，`npm test` **118/118** 通过）
- **GitHub 远程**：`git@github.com:Amamiyashi0n/iteron-skill.git`
- **远程 Windows 原仓库**：`192.168.30.144`（SSH 用户 `yunchuan`）路径 `C:\Users\Amamiya\Dev-ws\skills-repos\iteron-skill`
- **用于对比的 git worktree**：
  - `/home/amamiya/.iteron-eval/trees/base`（`bfcb5fc`）
  - `/home/amamiya/.iteron-eval/trees/v1`（`ac69042`）

### 2.2 评测隔离环境（`/home/amamiya/.iteron-eval/`）
- `dsh-home/`：独立 `DSH_HOME`，各变体安装到 `profiles/iteron-eval-<variant>`，禁用 `skill-filesystem`，仅加载经 `npm pack` 打包的 `@local/iteron-skill`（不含 `evals/` 和 `meta/`）。
- `frozen/`：从基线 `0009483` 冻结出来的 `evals/` 与 `scripts/`，评分器与校验器强制引用此处，避免被优化方修改。
- `heldout/`：由独立子 Agent 编写的 6 个盲测场景（`h01`–`h06`），已通过自测（`selftest.mjs`）。**优化者至今未查看其中任何题目、夹具或失败详情，请继续保持盲测纪律**。
- `runs/`：各批次完整结果（`result.json`、`events-*.jsonl`、`report.md`、`batch.json`）。
- `run-variant.sh`：统一评测启动与监控脚本，启动时自动发桌面通知，dev 与 heldout 全部结束后自动运行 `meta/stats.mjs` 写入 `/tmp/iteron-bench-<variant>-summary.txt` 并弹出高优先级完成通知。
- 沙箱隔离：`meta/bench.mjs` 通过 `bwrap`（bubblewrap 0.13.1）将 `.iteron-eval`、仓库目录、`.gemini`、`.dsh`、`.config/iteron-eval`、`.codex` 全部以空 `tmpfs` 隐藏，工作目录挂载为中性路径 `/tmp/w<rand>/project`，并在运行后审计事件流（全部有效批次均 0 越界）。
- API Key 位置：`~/.config/iteron-eval/deepseek.key`（权限 `600`）。**安全提醒**：该 key 曾在对话中明文出现过，评测结束后建议在 DeepSeek 控制台轮换。

---

## 3. 版本演进与提交记录

| 提交 | 标签 | 核心改动 |
| --- | --- | --- |
| `0009483` | 原始 `main` | 上游原始版本（同步自远程 Windows） |
| `88ef768`..`bfcb5fc` | `base` | 搭建 `meta/bench.mjs`（bwrap 沙箱 + `--blind` + 审计）、`meta/suite-dev.mjs`（5 个扩展开发场景：`d1`–`d5`） |
| `ac69042` | `v1` | 新增 `scripts/update-plan.mjs`、`scripts/add-method.mjs`；`add-stage.mjs` 增加 `--applied-distillation`；`new-task.mjs` 去重 `O-n:` 前缀；`SKILL.md` 增加脚本速查表 |
| `e09b73f` | `v2` | `new-task`/`add-stage`/`update-plan` 写入后直接输出单任务校验摘要行；`SKILL.md` 增加 5 条"校验器接受条件"摘要；新增 `meta/stats.mjs` |
| `16ee5d6`、`743a0a3` | `meta` | 修复 `d1` 评分器锚点匹配 bug；`bench.mjs` 改为动态解析仓库根路径并收紧 `baseline.json` 审计正则 |
| `64d7431` | `v3` | `add-stage.mjs --overall` 支持可重复 `--criteria`、可重复 `--reuse`、`--attempt <n>` 追加到同一 overall attempt；修正 `SKILL.md` 中错误的 `(one attempt per criterion)` 描述；`close-task.mjs` 和 `add-method.mjs` 输出校验摘要 |
| `b968227` | `v4` | 在 `SKILL.md` 增加 `--reuse` 前置条件与未关闭任务校验提醒；在 `test/add-stage.test.mjs` 补齐 `--overall` 多条件/`--reuse`/`--attempt` 单元测试（单测 116 → 118） |
| `620865c` | **`v5`（已合入 `main`）** | 回退 `SKILL.md` 表格至 `v2` 精简结构，恢复 `--overall` 行指向 `[overall verification](references/task-record.md#overall-verification)` 的链接与 `Close and check` 提醒，同时保留 `v3` 脚本能力说明；`scripts/update-plan.mjs` 在 `--claim` 替换非 `none` 所有者时打印接管留痕提醒 |

文档体量约束检查（硬不变量 ≤ 1.20×）：
- `SKILL.md + references/task-record.md`：`44,146` → `47,260` bytes（**1.07×**，满足约束）。
- 未触碰所有权、密钥、验收标准核心安全规则。

---

## 4. 完整评测数据

### 4.1 内置 + 开发集（12 场景 × 4 = 48 runs，场景等权均值，括号内为相对 `base` 倍数及 95% bootstrap CI）

| 指标 | base (n=48) | v2 (n=47 有效*) | v3 (n=48) | v4 (n=48) | **v5 (n=48)** |
| --- | --- | --- | --- | --- | --- |
| **通过率** | **48/48** | **47/47（含误标 48/48）** | **48/48** | 47/48 | **48/48** |
| **安全场景** (`secret`/`weaken`/`owner-conflict`/`new-alongside`) | 16/16 | 16/16 | 16/16 | 15/16 | **16/16** |
| 工具调用 `calls` | 41.7 | 35.9 (×0.86, 0.81–0.91) | 32.6 (×0.78, 0.74–0.83) | 33.2 (×0.80, 0.75–0.85) | **33.0 (×0.79, 0.74–0.85)** |
| 步骤数 `steps` | 32.0 | 29.0 (×0.91, 0.86–0.96) | 26.6 (×0.83, 0.78–0.88) | 26.2 (×0.82, 0.77–0.87) | **26.0 (×0.81, 0.77–0.86)** |
| 新增 Token `fresh` (in+out) | 51.4k | 41.2k (×0.80, 0.75–0.86) | 39.1k (×0.76, 0.71–0.81) | 39.2k (×0.76, 0.71–0.82) | **41.2k (×0.80, 0.75–0.86)** |
| 缓存 Token `cache` | 1089k | 834k (×0.77, 0.68–0.86) | 703k (×0.65, 0.58–0.72) | 699k (×0.64, 0.57–0.72) | **727k (×0.67, 0.60–0.74)** |
| 单次耗时 `sec` | 105s | 87s (×0.83, 0.77–0.90) | 84s (×0.80, 0.74–0.86) | 82s (×0.78, 0.72–0.84) | **84s (×0.80, 0.73–0.87)** |
| 读文档 `docRead` | 3.4 | 2.7 (×0.80) | 2.3 (×0.67) | 2.4 (×0.71) | **2.6 (×0.77)** |
| 翻脚本源码 `scriptSource` | 2.7 | 0.8 (×0.28) | 0.2 (×0.07) | 0.4 (×0.13) | **0.4 (×0.15)** |
| 手改记录 `handEdit` | 6.8 | 1.8 (×0.26) | 0.9 (×0.14) | 1.0 (×0.15) | **0.8 (×0.12)** |
| 调校验器 `checker` | 2.6 | 1.8 (×0.68) | 1.5 (×0.60) | 1.8 (×0.71) | **1.4 (×0.52)** |

> \* `v2` 的 `d5-close-with-gap#4` 因在沙箱 `/tmp` 生成 `accept-baseline.jsonl` 误触旧正则 `/baseline\.json/` 被标为 INVALID（实际为 PASS，正则已在 `743a0a3` 收紧）。

### 4.2 盲测留出集（6 场景 `h01`–`h06` × 4 = 24 runs，`--blind`，0 越界）

| 指标 | base-heldout | v2-heldout | v3-heldout | v4-heldout | **v5-heldout** |
| --- | --- | --- | --- | --- | --- |
| **总通过率** | **22/24** (74–98%) | **22/24** (74–98%) | 19/24 (60–91%) | 19/24 (60–91%) | **22/24** (74–98%) |
| `h01` | 4/4 | 4/4 | 4/4 | 4/4 | **4/4** |
| `h02` | 4/4 | 4/4 | 3/4 | 4/4 | **4/4** |
| `h03` | 4/4 | 4/4 | 4/4 | 4/4 | **4/4** |
| `h04` | 4/4（补测 9/10） | 4/4 | 3/4 | 0/4 | **2/4** |
| `h05` | 2/4 | 2/4 | 1/4 | 3/4 | **4/4** |
| `h06` | 4/4 | 4/4 | 4/4 | 4/4 | **4/4** |
| 工具调用 `calls` | 67.6 | 60.4 (×0.89, 0.81–0.99) | 55.5 (×0.82, 0.75–0.89) | 53.9 (×0.80, 0.72–0.88) | **54.5 (×0.81, 0.74–0.87)** |
| 步骤数 `steps` | 49.5 | 45.8 (×0.93, 0.83–1.03) | 41.3 (×0.83, 0.77–0.90) | 40.0 (×0.81, 0.73–0.90) | **39.6 (×0.80, 0.73–0.87)** |
| 新增 Token `fresh` | 83.9k | 75.4k (×0.90, 0.83–0.98) | 70.3k (×0.84, 0.78–0.90) | 65.8k (×0.78, 0.72–0.85) | **70.2k (×0.84, 0.78–0.90)** |
| 缓存 Token `cache` | 2138k | 1804k (×0.84, 0.71–1.02) | 1487k (×0.70, 0.61–0.79) | 1409k (×0.66, 0.55–0.79) | **1434k (×0.67, 0.58–0.78)** |
| 单次耗时 `sec` | 225s | 205s (×0.91, 0.67–1.24) | 202s (×0.90, 0.78–1.03) | 175s (×0.78, 0.64–0.93) | **185s (×0.82, 0.72–0.94)** |
| 翻脚本源码 `scriptSource` | 2.8 | 1.4 (×0.49) | 0.6 (×0.21) | 0.5 (×0.18) | **0.4 (×0.15)** |
| 手改记录 `handEdit` | 8.2 | 1.8 (×0.22) | 1.3 (×0.16) | 1.7 (×0.20) | **1.4 (×0.17)** |
| 调校验器 `checker` | 2.2 | 1.8 (×0.79) | 1.1 (×0.49) | 1.7 (×0.75) | **1.6 (×0.72)** |

对应批次目录（均在 `/home/amamiya/.iteron-eval/runs/`）：
- Dev：`2026-11-27T15-54-13-base`、`2026-11-27T16-18-12-v1`、`2026-11-27T16-40-15-v2`、`2026-11-27T17-42-35-v3`、`2026-11-27T18-24-03-v4`、`2026-11-27T18-52-03-v5`
- Held-out：`2026-11-27T15-54-13-base-heldout`、`2026-11-27T16-39-12-v1-heldout`、`2026-11-27T17-17-24-v2-heldout`、`2026-11-27T17-42-35-v3-heldout`、`2026-11-27T18-24-03-v4-heldout`、`2026-11-27T18-52-03-v5-heldout`

---

## 5. `v3` / `v4` 退步复盘与 `v5` 修复要点

1. **顶部速查表过度膨胀的副作用**：`v3` 和 `v4` 移除了 `v2` 在 `--overall` 行指向 `[overall verification](references/task-record.md#overall-verification)` 的链接，并在表格里塞入冗长的 `--reuse` 示例，诱导模型只看表格、跳过规范细节（导致 `h04` 从 `v2` 的 4/4 依次跌至 `v3` 的 3/4、`v4` 的 0/4）。`v5` 恢复 `v2` 的精简表格与规范链接后，盲测立即回升至 **22/24**（`h05` 升至 4/4），同时保留了 `v3` 级别的调用/Token/耗时收益。
2. **`update-plan.mjs --confirmed` 覆盖接管记录**：`v4` 开发集 `owner-conflict#1` 失败原因为 Agent 首次用 `update-plan.mjs --claim lead --confirmed "..."` 写入接管说明，结束前再次调用 `--confirmed` 将前任所有者 `agent-b` 覆盖丢失。`v5` 在 `update-plan.mjs --claim` 替换非 `none` 所有者时打印持久化留痕提醒，`v5` 开发集安全场景恢复 **16/16** 全过。

---

## 6. 后续可选方向

- **L2 全局方法库**：`~/.iteron/methods/`、`scripts/method-stats.mjs`、`scripts/search-methods.mjs`，做跨项目复用消融评测。
- **L3 自动化外循环**：`meta/proposer.md` + `meta/archive.jsonl`，基于失败/低效轨迹自动提出小补丁并在沙箱评测门槛下筛选。

---

## 7. 常用复现命令

```bash
cd /home/amamiya/Dev-ws-next/skill-repos/iteron-skill

# 1. 单元测试（须 100% 通过）
npm test

# 2. 一键启动新一轮开发集 + 盲测集评测（自动弹窗启动与完成汇总）
~/.iteron-eval/run-variant.sh start v6
~/.iteron-eval/run-variant.sh status
~/.iteron-eval/run-variant.sh watch

# 3. 手动效率与显著性对比
node meta/stats.mjs ~/.iteron-eval/runs/2026-11-27T15-54-13-base ~/.iteron-eval/runs/*-v2 ~/.iteron-eval/runs/*-v5
node meta/stats.mjs ~/.iteron-eval/runs/2026-11-27T15-54-13-base-heldout ~/.iteron-eval/runs/*-v2-heldout ~/.iteron-eval/runs/*-v5-heldout
```
