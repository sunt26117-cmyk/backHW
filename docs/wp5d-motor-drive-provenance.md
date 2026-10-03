# WP5d · MotorDriveToolbox 字段级 Provenance

本阶段把 WP5c-2 的“字段归属表”推进到“运行时字段覆盖 + 写回 provenance + UI 来源可见”。

## 1. 正式 schema

`src/domains/bldc/motorDriveInputSchema.ts` 是专项工具字段的唯一归属表。每个字段同时声明：

- `binding`：`CURRENT_ISSUE` / `WHAT_IF_ONLY`
- `unit`：显示与写回单位（枚举字段可无单位）
- `valueType`：`number` / `enum`
- `sourceType`：CONTEXT / MEASURED / IMPORTED_EVIDENCE / SPECIFICATION / DATASHEET / DERIVED / ASSUMPTION / WHAT_IF
- `provenancePolicy`：`PRESERVE_STRONGER` / `WRITE_AS_ASSUMPTION` / `NEVER_WRITE`

本轮补齐了 Foster 堵转热工具实际使用但此前没有进入正式 schema 的 `biasPowerW / tjMaxC / tjDeratedLimitC / packageType`。

## 2. 写回语义

“写入当前工程”不是把 What-if 值伪装成原始来源。对于没有已有 provenance 的字段，显式写回统一记录为 `ASSUMPTION`；已有 `USER_MEASURED / IMPORTED / SPEC / DATASHEET / ...` 等来源则保留已有来源。

因此：

`What-if draft → 工程师显式确认 → IssueInput + ASSUMPTION`

而不是：

`What-if draft → 自动变成 CONTEXT/SPEC/MEASURED`

## 3. 运行时覆盖护栏

`scripts/verify-motor-drive-field-coverage.cjs` 同时扫描：

- `MotorDriveToolbox.tsx` 实际使用的 `*Params.<field>`；
- `motorDriveWhatIfDefaults.ts` 中的所有默认输入；
- 正式 domain schema 的绑定、来源与写回策略。

任何工具实际使用或默认存在、但没有正式 schema 的字段都会让门禁失败。

## 4. UI 来源可见性

MotorDriveToolbox 的输入边界摘要现在显示字段的 provenance/source，例如 `标称母线[CONTEXT]`、`急停相电流[ASSUMPTION]`、`线束电感[WHAT_IF]`。

这只是来源提示，不改变当前工程事实；完整事实仍以工程事实页和 Trace 审计为准。
