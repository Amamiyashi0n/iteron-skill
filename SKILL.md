---
name: iteron-skill
description: Execute multistage tasks with verifiable milestones. Index tasks in agent.md, track the plan and verification evidence, resume from saved points, and distill reusable methods. Use for staged, verifiable work that is being planned, replanned, or resumed, including requests about 分阶段, 逐项验证, 断点续做, 恢复任务, or 重新规划.
whenToUse: Use when the work splits into at least two independently verifiable items with concrete acceptance criteria, when it may be interrupted and resumed, or when an audit trail is needed. Skip single-step changes and ordinary questions.
---

# Iteron

Use Iteron for work that benefits from separate, verifiable stages. Handle ordinary questions and one-step changes directly. Use the project's existing tools to do and verify the work, and use Git for version history and rollback.

## Relation to other DSH features

- **`plan.md` is the source of truth.** Use the session progress tracker (`todo_write` in DSH) to show progress within the current session, but maintain the authoritative plan and resume point in `plan.md`. When exiting planning or read-only mode, write the plan to `plan.md` immediately.
- **Use with goals.** Long-running tasks can pair with the goal tool (`create_goal` in DSH) to survive session interruptions. The goal tracks the high-level objective, while Iteron records verify each stage.
- **Planning mode is for design.** Use DSH's planning mode to draft the initial plan in conversation, then write it to `plan.md` before starting execution.

## Main workflow

1. **Plan or resume.**
   - New task: identify the deliverable and acceptance criteria, and split the work into independently verifiable items.
   - Create `plan.md` from the [templates](templates/README.md) and register the task in `agent.md`. For the first task in a repository, add the [discovery pointer](references/task-record.md#discovery-pointer).
   - Resuming: open the existing plan and confirm the goal and resume point.
   - Claim the task in `owner` before writing. If another owner is recorded, read only and ask the user before taking over ([Ownership](references/task-record.md#ownership)).
   - Use the [record rules](references/task-record.md) for naming, numbering, and search, and create files and blocks from the [template files](templates/README.md).
   - In planning or read-only mode, keep the plan in the conversation.
2. **Do and verify one item.** Pick an item whose prerequisites are met. Apply a distilled method if it fits, then verify the result using the project's tools, and record the `revision` that was checked. Reuse evidence only after comparing its recorded revision with the current state, as [Evidence freshness](references/task-record.md#evidence-freshness) describes.
3. **Record the result and continue.** Write the actual delivery and verification in `stages/records.md`. Fill in the plan item's `acceptance_ref` before marking it complete. Distill a method into `distillation/notes.md` only when a verified route can help with similar work. Record actual use in the downstream stage. Update the resume point when the state changes materially or work is handed off. A delegated item returns its Verification Block to the owner, who writes it.
4. **Verify the overall result and deliver.** Write the `overall` stage described in [Overall verification](references/task-record.md#overall-verification): one Verification Block per overall criterion, reusing only fresh evidence and checking the rest now. Once every criterion passes, close the task: set the plan's `status`, `overall_acceptance_ref`, `owner`, and resume point, update the index, and report the result, verification, and record location.

## Changes and blockers

- **Replan when needed.** Pause affected actions and update the current plan in the same file. Check which verification evidence and distilled methods still apply and what needs to be verified again. Continue with ready items. For splits, merges, downstream feedback, or dependency cycles, see [Complex replanning](references/task-record.md#complex-replanning).
- **Handle blockers.** Fix recoverable implementation problems and verify again. When a prerequisite is missing, save confirmed progress and the conditions for resuming, and continue independent work. When the prerequisite arrives, verify its source, target, and scope, then resume from the next ready action. If the task remains blocked, report the unfinished work and what would unblock it.
