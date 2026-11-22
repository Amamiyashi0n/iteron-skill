# 评测

这里的评测用来回答两个问题：skill 会不会在该用的时候被触发，以及 agent 按它工作后产出的记录是否合格。一次真实运行的结果记录在 [results/2026-11-22-deepseek-harness.md](results/2026-11-22-deepseek-harness.md)，包括它的限制；换一个 agent 或模型需要自己重新跑。

## 触发用例

[trigger-cases.json](trigger-cases.json) 有 24 条提示：10 条明确应该触发、10 条明确不该触发，另有 4 条边界用例（`kind: boundary`）。每条写了期望结果和理由。

用法：对每条提示，在装了 iteron-skill 的 agent 里新开会话，只给这一句话，记录它有没有加载 `iteron-skill`。把结果和 `trigger` 字段对比，分别统计明确用例的准确率，边界用例单独看，不计入总分。

## 端到端场景

[scenarios.json](scenarios.json) 有三个场景：`fresh`（从零做完并关闭）、`resume`（接手上一个会话的任务）、`replan`（需求变化后重新规划）。

```sh
node evals/run.mjs list
node evals/run.mjs setup resume /tmp/eval-resume   # 准备目录并打印要给 agent 的提示
# 在 /tmp/eval-resume 里让 agent 按提示工作
node evals/run.mjs grade resume /tmp/eval-resume   # 校验器加场景专属检查，通过返回 0
```

评分器先运行记录校验器，再检查场景专属的条件，例如 `resume` 要求 T-002 完成、T-001 没有被重做，`replan` 要求计划版本前进并有对应的 replan 条目。

## 评分器自身是否可靠

`test/evals.test.mjs` 用脚手架脚本生成每个场景的"标准答案"，要求评分器判定通过；再对"什么都不做"的初始状态，要求评分器判定失败。这只能证明评分器能区分好坏，不能证明某个 agent 的表现。
