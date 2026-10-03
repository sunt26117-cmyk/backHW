# WP5c-2 · MotorDriveToolbox 正式输入 Schema

`src/domains/bldc/motorDriveInputSchema.ts` 是 MotorDriveToolbox 输入归属的唯一清单。

## 两类字段

- `CURRENT_ISSUE`：存在明确 `IssueInput.measuredValues` canonical key，且该字段确实进入当前 BLDC/物理链路。允许工程师显式“写入当前工程”。
- `WHAT_IF_ONLY`：只用于专项计算器的独立推演，不自动进入当前工程，也不进入 AI 当前事实层。

## 重要规则

1. What-if 输入只在本地计算链路中生效。
2. 只有点击“写入当前工程”后，且字段属于 `CURRENT_ISSUE`，才写入 `IssueInput`。
3. 新写入默认 provenance 不得冒充实测；schema 默认使用 `ASSUMPTION` 或 `SPEC/CONTEXT`，已有更强 provenance 时保留原来源。
4. `stallDurationMs`、`controlMode`、`sensorType`、安全链时序等目前仍属于 `WHAT_IF_ONLY`，没有为了“看起来都能回填”而猜造 canonical key。
