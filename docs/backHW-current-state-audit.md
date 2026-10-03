# backHW 当前版本工程审计（基于 backHW-main-wp123-merged.zip）

> 目标：检查页面实际逻辑、典型工况切换、14 个旧页面/新工作台的内容重复、运行时硬编码，以及 AI 上下文是否真正绑定当前工程输入。

## 1. 页面实际逻辑

当前导航结构已经完成「14 个旧目标 → 7 个主工作台」的收敛：

- `overview`: `first` / `workflow`
- `facts`: `inputs` / `facts`
- `physics`: `patterns` / `calculator`
- `decision`: `options` / `cockpit`
- `verification`: `loop` / `review`
- `safety`: 单页
- `delivery`: `raci` / `docs`
- `trace-audit`: 全局 Trace 审计覆盖层

因此旧 `LEGACY_NAV` 仍保留 14 个可达目标，但实际页面主体是 13 个二级页 + 1 个 Trace 审计覆盖层。导航与二级页状态已经统一在 `workbenchNavigation.ts`，并由 `verify-7-workbench-architecture.ts` 守门。

所有工作台共享同一 `context / issue / result`，没有重新建立第二套工程事实源。

## 2. 典型工况切换

### 已确认的正确路径

`ScenarioContext.selectScenario()` 同步切换 `currentScenarioId / context / issue`；`AnalysisProvider` 监听 `currentScenarioId`，负责恢复该工况的已保存结果或基于新输入重新分析。

### 本轮修复的问题

原 `App.tsx -> handleSelectScenario()` 又自行调用一次 `runAnalysis()`，与 `AnalysisProvider[currentScenarioId]` 的 effect 重复，存在重复请求、并发结果覆盖和旧工况结果短暂残留风险。

现已改为：

1. 选择工况；
2. 立即清空旧 `result`；
3. 由 `AnalysisProvider` 单一入口负责“恢复 / 重新计算”。

新增 `verify-scenario-switch-contract.cjs` 作为源码契约守门。

### 仍需后续处理

用户在当前工况内直接修改工程输入后，旧分析结果不会自动标记为“基于旧输入”。必须重新点击分析后才会生成新结果。后续建议增加 `resultStale` 输入签名/版本标记，避免“表单已经改了，但页面仍显示旧分析”的认知风险。

## 3. 14 页重复内容

### 已经完成的去重

- `ResultProvenanceBanner`：只在 `SeniorEngineeringWorkbenchView` 渲染一次。
- `TemplateContentNotice`：只在 `SeniorEngineeringWorkbenchView` 渲染一次。
- 机器人关节方案文案：已统一到 `src/content/robotJointText.ts`，`dualTimelineEngine` 与 `robotJointExpert` 不再逐字复制。
- Trace：没有删除本地 what-if `TraceDrawer`，因为它和全局审计页数据口径不同；现在明确写出“按已保存工况重算、不含 Pattern 页本地调参”的口径。

### 仍存在的高价值重复

| 区域 | 当前状态 | 后续归属建议 |
|---|---|---|
| `FirstScreen10sView` ↔ `AnalysisFactView` | 都显示核心结论/风险，但一个是决策摘要、一个偏事实审计 | 第一屏只留摘要；事实页收敛成事实、证据、缺口，不重复完整决策文本 |
| `OptionsComparisonView` ↔ `DecisionCockpitView` | 都消费 `candidateActions`，Cockpit 仍包含较大候选方案展示 | Options 作为候选方案主归属；Cockpit 只引用排序/选中结果/关键 trade-off |
| `VerificationLoopView` ↔ `DesignReviewRegressionView` | 都消费验证数据，但一个偏闭环行动、一个偏回归评审 | 保留双入口，但避免两边重复完整测试内容 |
| `RecommendationRaciView` ↔ `EngineeringDocsView` | 两边都展示推荐方案/时间轴/责任信息 | RACI 归属“谁做什么”；文档页只负责受控交付物 |
| `EngineeringCalculatorView` ↔ `MotorDriveToolbox` | 仍存在整块套娃 | WP5 单独拆解，禁止改公式 |

## 4. 硬编码审计

### 明确属于合法固定数据

- `src/data/presetScenarios.ts`：典型工况输入库，本身就是固定示例输入。
- `src/data/engineeringGoldCases.ts`：AI 相似案例检索/回归用 Gold Case，数值固定是测试资产，不应当冒充当前工况。
- `src/data/legacy/decisionPillars.ts`：历史模板已被运行时隔离，当前专家分析不再直接使用。

### 仍需继续清理的运行时风险

1. `src/utils/dualTimelineEngine.ts`：保留一套按域写死的 legacy fallback，包含固定 MHz/dB/电压/周期等工程数字。当前默认派生开关为 `false`，所以本轮没有改变现有结果；WP4d 必须逐域完成对比和工程师确认后才能删除。
2. `src/utils/domainAdaptivePromptEngine.ts`：Prompt 指南中还有“18~25 天”“不足 14 天”等固定经验值。这些不是当前工况实测，但会影响模型建议，应后续参数化为“当前项目输入 + 证据状态”。
3. `src/App.tsx` 的 Section 14 入口仍有 BLDC 示例性固定数字 toast；属于 UI/验收入口，不是计算结果，但长期应改为读取当前工况摘要。
4. `ProjectContextView` 中的固定数字主要是 placeholder 示例，不应进入结果层；后续可统一标记为“输入示例”。

## 5. AI 上下文绑定审计

当前链路为：

`AnalysisContext -> /api/copilot/analyze(context, issue, modelConfig) -> buildAnalysisPrompt(context, issue) -> runExpertAnalysis(context, issue) + precomputedFacts(context, issue) -> AI -> validate/enrich -> audit`

Prompt 明确包含：

- 当前项目上下文
- 当前主导域/关联域
- `issueCategories`
- requirement / actualMeasurement / testCondition / environment / failurePhenomenon / engineeringConcern
- `issue.measuredValues` 的 JSON
- 缺失字段与证据完整度
- 当前确定性 baseline 与 precomputed facts
- 当前候选方案 baseline

因此 AI 并非只拿一个固定场景标题工作，而是以当前 `context + issue` 重建本地确定性基线后再进入云端推理。

本轮新增 `verify-ai-input-binding.ts`，实际验证：

- 修改一个结构化实测值，Prompt 必须变化；
- 修改项目阶段/剩余工期，Prompt 必须变化；
- Prompt 必须包含当前结构化测量键和值。

### 结果过期机制（本轮已补）

当前结果保存时绑定 `context + issue` 指纹；只要工程输入、规格、测量值或项目上下文变化，UI 会显示“当前结果已过期”，要求重新分析后再用于工程决策。旧版无指纹结果也不会被默认为最新。

### 仍需增强

Prompt 中仍允许 Gold Case 作为相似案例 grounding，因此必须继续保持“案例数值不能进入当前结论”的 Auditor 门禁。后续可增加“当前输入 fingerprint / result fingerprint”，让保存结果在输入变化后自动显示 stale，而不是继续展示旧结论。
