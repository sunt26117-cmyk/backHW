# WP8e · Legacy schema isolation

## 目标

WP8d 已把非 UI 消费者的旧结果读取限制在 adapter view；WP8e 进一步把 **legacy schema 知识本身** 收回 `src/adapters`。

```text
CopilotAnalysisResult / 旧 JSON
          ↓
  src/adapters/analysisResultAdapter.ts
          ↓
 Facts / Judgment / Action / Trace / Decision
          ↓
 analysisResultSelectors.ts
          ↓
 UI / 业务消费者
```

## 规则

1. `analysisResultSelectors.ts` 不得出现 legacy 顶层字段名，也不得调用 `createLegacyResult(Read|Mutable)View`。
2. legacy 字段的读取与语义切片映射只允许出现在 `src/adapters/analysisResultAdapter.ts`。
3. selector 对外只暴露语义 slice，不把旧对象结构继续传给页面。
4. `analysisStorageAdapter.ts` 只管理 versioned persistence envelope；运行时结果 schema 对 storage adapter 透明。
5. storage adapter 对 `ecu_copilot_analysis_results_v1` 只做兼容读取，新写入永远使用 v2 key + envelope。
6. `analysisStorage.ts` 只保留兼容 facade，不拥有 storage key、JSON 解析或 legacy schema。

## 本阶段改动

- 将 Facts / Judgment / Action / Trace / Decision / Risk / Delivery 等 selector 实现移入 `analysisResultAdapter.ts`。
- `analysisResultSelectors.ts` 变为 schema-blind 的语义 selector facade。
- storage 写入改为 `autohw.analysis-record` version 1 envelope；旧 v1 key 只允许读取迁移，不再写回。
- 新增 `verify-wp8e-legacy-schema-isolation.cjs`，使用 TypeScript AST 检查 selector 是否泄漏 legacy 字段。

## 下一阶段边界

结果生产、AI 审计和场景派生函数仍可能需要对 legacy carrier 做兼容写入/读取；这些属于 producer/sanitizer 迁移，不在 WP8e selector 边界内直接重写。
