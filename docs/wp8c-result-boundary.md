# WP8c · 结果对象边界与兼容层隔离

## 目标

`CopilotAnalysisResult` 保留为跨层结果载体，但不再允许页面组件把它当成自由可读的全量状态对象。

当前正式边界：

```text
ScenarioContext / IssueInput
        ↓
 deterministic / expert / AI result
        ↓
 analysisResultSelectors
   ┌────┼────┬────┐
 Facts Judgment Action Trace
   ↓      ↓      ↓     ↓
 pages  pages  pages  audit/export
```

## WP8c 规则

1. `src/components/*.tsx` 不得直接读取 `CopilotAnalysisResult` 顶层字段；统一通过 selector。
2. `context` 仅作为旧备份兼容快照保留，当前页面必须使用上游 `ScenarioContext`。
3. `templateContentNotice`、`provenance`、`source` 等兼容/追溯字段只允许通过 selector 展开。
4. Markdown/HTML 导出使用 Facts/Judgment/Action selector，不能绕过页面边界直接拼接结果对象。
5. `CopilotAnalysisResult` 新增顶层字段必须进入 `analysisResultFieldCatalog.ts`，并声明 producer/consumer/derivability。

## 当前结果

- 35 个组件文件通过 selector boundary。
- 8 个核心工作台已经使用共享 owner selector。
- Facts / Judgment / Action / Trace 四类切片均有独立 selector。
- 旧 `result.context` 已不再作为页面事实源。
- 导出层不再直接读取核心结论、风险、候选方案和推荐字段。

## 后续

WP8d 将继续处理非 UI 层的 legacy result 读取：

- `scenarioDerived.ts`：明确只允许“输入 → 派生”函数读取 result 的原因与兼容范围。
- `expertEngine.ts` / `aiResultAuditor.ts`：区分 result 的生产写入与消费读取。
- `analysisStorage.ts` / `backupRestore.ts`：把持久化格式与运行时结果模型解耦。
- 最终目标：运行时业务链只依赖 `ScenarioContext + IssueInput + typed result slices`，旧字段仅存在于 adapter 层。

## WP8d · 非 UI legacy result 收口

WP8d 把兼容字段读取与写入进一步限制到 `src/adapters/analysisResultAdapter.ts`：

- `scenarioDerived.ts` 只能通过 legacy read view 读取兼容结果，并把 `result` 视为可选输入。
- `expertEngine.ts` / `aiResultAuditor.ts` 区分结果生产与兼容字段消费；旧结构的读取/写入均经过 adapter view。
- `analysisStorage.ts` 只保留兼容 facade；实际 storage key 与 JSON 读写位于 `analysisStorageAdapter.ts`。
- `aiProtocol.ts`、`aiGrounding.ts`、`dualTimelineEngine.ts`、`scenarioDynamic.ts`、`verificationLoopEngine.ts` 等非 UI 消费者统一经 adapter 访问旧字段。
- `COPILOT_RESULT_JSON_SCHEMA` 与 `baseline.analysisBasis.calculatedOutputs:*` 等外部协议字段/字符串不属于运行时 legacy object 直接读取。

守护：`scripts/verify-wp8d-legacy-result-boundary.cjs` 使用 TypeScript AST 检查非 UI 结果消费者，禁止直接从旧变量读取兼容字段，并确认 `analysisStorage.ts` 不再持有持久化 key。

最终边界：`CopilotAnalysisResult` 可以继续作为兼容载体存在，但业务链只能经 adapter / selector 获取旧结构；新业务代码不得把旧结果对象当成自由状态树。
