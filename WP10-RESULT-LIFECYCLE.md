# WP10 · Analysis Result Lifecycle Governance

## 目标

让分析结果在运行时、持久化、备份恢复和版本升级链路使用同一套记录身份：`analysisId + inputHash + engineVersion`。

## 已完成

- `CopilotAnalysisResult.analysisRecord` 成为当前结果的稳定记录元数据。
- 新结果统一绑定 `analysisId / inputHash / engineVersion / generatedAt`。
- 恢复必须同时满足当前 `inputHash` 与当前 `engineVersion`。
- localStorage 新写入升级为 v2 envelope，并校验 envelope 与 payload 的记录元数据一致。
- 保留 v1 envelope 单向兼容读取，不再生成旧格式。
- JSON 备份升级到 `1.4-automotive`，同时保存 `resultRecord`。
- 旧备份若缺少记录元数据，只标记为 `LEGACY_IMPORT_UNKNOWN`，不会伪装成当前引擎结果；导入后按当前输入重新计算。
- 备份中的结果与备份内 `context + issue` hash 不一致时直接拒绝恢复。

## 验收门

- `verify-analysis-result-record-contract.cjs`
- `verify-analysis-persistence-version-contract.cjs`
- `verify-analysis-backup-contract.cjs`

本阶段不改变 Pattern 公式、阈值、VETO 或 AI prompt。
