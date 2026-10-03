# WP8b · Facts / Judgment / Action Selector Boundary

## 目标
把 `CopilotAnalysisResult` 从“所有页面都能直接读的巨型对象”收口为只读契约：页面通过 selector 取得自己拥有的事实、判断和行动摘要。

## 三层选择器

| 层 | Selector | 内容 | 事实来源 |
|---|---|---|---|
| Facts | `selectFacts(result)` | knownFacts / assumptions / unknowns / physicalMechanism / DFMEA / classifiedInfo / analysisBasis / inputIntegrity | 上游当前工程输入 + 确定性引擎/AI 审计结果 |
| Judgment | `selectJudgment(result)` | coreConclusion / risk / finalRecommendation / decisionFrame / multiRiskBreakdown / whyNot / redTeam / multiDomain | 当前分析结果；不创建第二套判断 |
| Action | `selectAction(result)` | candidateActions / recommendedAction / containment / CAPA / 24h plan / dualTimeline / RACI / docs / EDR | 当前候选方案与交付结果 |

## 页面规则

8 个核心工作台不得直接访问以下共享结果字段：`candidateActions`、`finalRecommendation`、`riskRatings`、`decisionFrame`、`coreConclusion`、`physicalMechanism`、`knownFacts`、`assumptions`、`unknowns`、`dualTimeline`、`raciMatrix`、`classifiedInfo`、`dfmea*`、`bldcExtendedAnalysis`、`context`。

`context` 属于 `ScenarioContext / EngineeringContext`，不是 `CopilotAnalysisResult` 的事实来源；结果中的 `context` 只保留兼容性。

## What-if 边界

What-if 草稿允许进入本地计算，但未经“写入当前工程”不得进入 `IssueInput`、AI 当前事实层、保存的分析指纹或正式交付文档。

## 回归门禁

`verify-analysis-result-selector-migration.cjs` 同时检查：
1. 8 个核心工作台使用 owner selector；
2. 核心共享字段不存在直接 `result.<field>` 读取；
3. selector 仍保持只读。

这样后续扩展 `CopilotAnalysisResult` 时，可以先决定字段属于 Facts / Judgment / Action，再决定哪个工作台拥有它。
