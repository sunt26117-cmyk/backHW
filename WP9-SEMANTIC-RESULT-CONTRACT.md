# WP9 · Semantic Analysis Result Contract

## 目标

把核心工作台对 `CopilotAnalysisResult` 的消费，从多个历史 slice selector 收敛到单一、稳定的语义结果契约。

## 本阶段完成

- `AnalysisResultContract` 作为核心页面统一消费入口。
- `readAnalysisResultContract()` 负责一次性从兼容结果映射出 `decision / risk / facts / judgment / action / delivery / safety / verification / trace / basis / templateNotice`。
- `selectAnalysisResultContract()` 成为页面层唯一总入口。
- 8 个核心工作台统一改为消费该 contract：
  - `FirstScreen10sView`
  - `AnalysisFactView`
  - `BldcPatternEngineView`
  - `DecisionCockpitView`
  - `OptionsComparisonView`
  - `RecommendationRaciView`
  - `TraceAuditView`
  - `SeniorEngineeringWorkbenchView`
- 既有 `VerificationLoopView / EngineeringDocsView / FunctionalSafetyReliabilityView` 同步迁移，保持历史 selector 门禁语义不被削弱。
- 原有 WP8 slice selectors 继续保留，供非核心迁移面兼容使用；新的核心页面不得再直接依赖它们。
- 新增 WP9 反向治理门禁，并把旧 selector migration / fact-judgment-action 门禁升级为 contract-aware 版本。

## 边界

本阶段不改变 Pattern 阈值、物理公式、风险判定或 AI prompt 内容；只改变结果消费的架构边界。

## 验证

- `node --check`：全部 CJS 门禁脚本通过。
- `scripts/*.cjs`：27 / 27 PASS。
- WP9 反向场景：核心页面强制退回旧 slice selector 时，WP9 门禁应失败；恢复后通过。
- 全量 TypeScript `tsc` 仍受执行环境依赖缺失影响，未宣称完整 lint/build 全绿。
