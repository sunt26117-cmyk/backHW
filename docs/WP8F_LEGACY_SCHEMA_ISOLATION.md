# WP8f Legacy Schema Isolation

## 基线

本阶段严格基于 `backHW-main-wp123-developed-wp8e.zip`。

## 目标

把 legacy `CopilotAnalysisResult` 的字段结构知识继续收口到 adapter，避免 producer / sanitizer / business utility 通过旧字段名直接读写结果。

## 已完成

- `src/adapters/analysisResultAdapter.ts`
  - 提供语义化 mutable editor：Facts / Judgment / Action / Delivery / Metadata。
  - 提供空结果构建器 `createEmptyLegacyAnalysisResult()`；旧字段骨架不再放在 producer 中。
  - 保留 legacy field mapping 仅在 adapter 内。
- `src/data/expertEngine.ts`
  - 使用 adapter 的空结果构建器和语义 editor。
- `src/utils/scenarioDerived.ts`
  - 使用 `readFacts` / `readRiskSnapshot`，不直接读取 legacy result tree。
- `src/utils/scenarioDynamic.ts`
  - 使用 semantic editor 写回候选、结论、事实、验证、交付信息。
- `src/utils/aiProtocol.ts`
  - 使用 semantic editor / semantic readers；外部 AI JSON schema 中的 legacy field names 仍作为 wire contract 保留。
- `src/utils/aiResultAuditor.ts`
  - 使用 semantic editor / readers，sanitized result 不直接操作 legacy tree。
- `src/utils/aiGrounding.ts`
  - 使用 `readAnalysisBasis`。
- `src/utils/dualTimelineEngine.ts`
  - 使用 candidate/timeline semantic readers；不重新创建候选措施。
- `src/data/verificationLoopEngine.ts`
  - 使用 recommended-action / risk semantic readers。

## 门禁

新增：

`scripts/verify-wp8f-legacy-schema-isolation.cjs`

该门禁剥除注释和字符串后检查真实 TypeScript property access，只允许 adapter 层持有 legacy schema 知识，并禁止重新引入 legacy mutable/read view。

`npm test` 已接入 WP8f gate，并保留 WP8d/WP8e 之前的相关治理门禁。

## 验证结果

- 所有 `scripts/*.cjs`：PASS
- WP8d legacy boundary：PASS
- WP8e legacy isolation：PASS
- WP8f legacy isolation：PASS
- WP8 field governance：PASS
- 35/35 view selector boundary：PASS
- WP8b selector contract：PASS
- WP6d selector migration：PASS
- WP8f 目标 TS 文件定向 `tsc`：无诊断

当前容器仍无法完整安装 npm 依赖，因此完整 `npm run lint` / `npm test` / `npm run build` 尚未在该容器内形成有效的依赖完备验证；这些命令需在依赖可安装的环境中最终执行。
