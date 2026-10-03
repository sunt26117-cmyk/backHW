# WP8 · CopilotAnalysisResult 生产/消费治理

## 本阶段目标

把 CopilotAnalysisResult 的生产、消费与兼容写入收敛到明确边界：

- 页面通过 semantic selectors 消费事实、判断、行动、交付、Trace。
- 结果生产/审计通过 `createSemanticAnalysisResultEditor()` 修改业务切片。
- `analysisInputFingerprint` / `provenance` 等兼容元数据通过 adapter helper 写入。
- UI/Context 不直接写历史顶层字段。
- 确定性计算缺失值不得通过 `|| 0` 伪装为 0。

## 本轮变更

- `src/adapters/analysisResultAdapter.ts` 增加结果指纹读取/写入与 provenance 写入边界。
- `src/contexts/AnalysisContext.tsx` 移除直接的结果顶层元数据读写。
- `src/App.tsx` 导入备份/AI 结果时通过 adapter 写入结果指纹。
- `src/data/expertEngine.ts` 不再把无法解析的确定性计算值强制变为 0，而是保持 `undefined`。
- 新增 `scripts/verify-analysis-result-producer-governance.cjs` 并纳入 `npm test`。

## 验证要求

至少执行：`node scripts/verify-analysis-result-producer-governance.cjs`、`npm run lint`、`npm test`、`npm run build`。

本阶段不改变业务 Pattern 的阈值与计算公式，只收紧 Result 边界与缺失值语义。
