# Hardcoding Cleanup Audit · WP4d→WP6

## 已处理

- 典型工况快捷预设从 `MotorDriveToolbox` 删除，避免与全局 Scenario Manager 形成第二事实源。
- 决策页第 14 区的通关分数、固定 3/15/28/42/94.5 等演示型数字改为当前候选方案、里程碑、风险和证据数量驱动；不得再把示例数字写成当前工程事实。
- WP4d 派生时间轴只允许从当前 `candidateActions` 生成，不创建新的工程措施或数值。

## 仍保留但需要区分的固定量

- `presetScenarios` / `engineeringGoldCases` / `systemRegressionCases`：属于案例库，不等价于当前项目事实。
- 引擎中的标准公式常数与规范边界：属于计算模型，不等价于当前项目输入。
- `legacy fallback` 中仍有历史模板措施与经验周期：在逐域确认前不得删除；后续应继续检查它们是否会穿透到当前事实/AI上下文。

## 下一步

1. 对 `dualTimelineEngine.ts` 的 legacy 分支做逐域“固定数字 → 当前输入/证据/候选方案”扫描。
2. 对 `MotorDriveToolbox` 剩余局部 What-if 参数建立输入来源标记，避免与 `IssueInput` 绑定状态混淆。
3. 对 `domainAdaptivePromptEngine.ts` 中经验周期/建议阈值做“知识基线 vs 当前事实”边界治理，不把经验数字删除成信息空洞。

## WP4e / WP5b / WP6b 本轮收口

- legacy 双时间轴现在统一标记为“知识基线｜非当前项目事实”，且不再对缺失 `daysRemaining` / `projectPhase` 偷塞 14 天 / DV 默认。
- `MotorDriveToolbox` 的输入边界集中到 `src/utils/motorDriveInputGovernance.ts`；起始值集中到 `src/utils/motorDriveWhatIfDefaults.ts`。核心字段有 IssueInput 时才标为当前工程绑定，其余明确显示为 What-if。
- 工作流帮助抽屉不再重复事实审计、风险与证据详情；这些内容回到正式归属页，帮助抽屉只保留当前问题、缺口与操作路径。

## 本轮追加治理

- Section 14 提示文案不再携带固定验收数字，全部从当前 preset/context 派生。
- Decision Cockpit 不再使用“300 天 / 15 天”作为示例文案，临界判断直接引用当前剩余天数。
- Prompt 中项目排期建议改为“当前剩余天数 + 实际 lead time”，历史经验数字只保留为知识基线。
- 时间轴增加 provenance，legacy 模板与当前候选方案派生结果在 UI / 导出层可区分。
