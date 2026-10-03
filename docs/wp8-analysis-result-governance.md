# WP8 · CopilotAnalysisResult 字段治理

## 当前策略
- 不删除旧字段；以 `analysisResultFieldCatalog.ts` 记录生产者、消费者和是否可派生。
- 跨工作台共享的读取优先使用 `analysisResultSelectors.ts`，selector 只读、无副作用。
- `context` / `source` 等兼容字段保留，但不作为第二套事实源。
- 页面不得通过 `(result as any).options` 等旧别名建立新的事实路径；已有兼容读取只用于旧 AI 返回格式。

## 迁移顺序
1. First Screen：决策摘要
2. Decision / Options：候选方案与推荐方案
3. Verification：推荐方案与下一验证动作
4. Delivery：推荐方案与交付快照
5. Safety：风险快照
6. Trace：计算证据、citedFields、provenance

## 后续
复杂嵌套对象继续保留在结果契约内；只有确认所有消费者都迁移到 selector / adapter 后，才考虑缩减兼容字段。
