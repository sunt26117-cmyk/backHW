# backHW 冗余清理与优化 · 当前执行状态与后续路线

## 已完成

- 分析结果过期检测：新增 `analysisInputFingerprint`，当前 context / issue 改变后结果明确标记为过期；同一输入保持稳定指纹。
- 多入口分析收口：工况切换、自建工况保存、Section 14 入口与导入结果均避免无意义的重复分析。

- WP0：基线已保存到 `docs/baseline-before.txt`；重复文案扫描护栏已存在。
- WP1：`ResultProvenanceBanner` / `TemplateContentNotice` 全局唯一；`约 约三周` 已修正。
- WP2：Trace 数据口径已明确，不删除 Pattern 页本地 what-if Trace。
- WP3：机器人关节与双时间轴共用 `src/content/robotJointText.ts`。
- 典型工况切换补强：选择工况时清除旧结果，取消 App 层重复 `runAnalysis`。
- AI 输入绑定护栏：新增 Prompt 变化回归。

### 当前 WP4a–4c 验证覆盖

15 个典型工况实跑：**12/15 可由 `candidateActions` 形成双时间轴，3/15 保留 legacy fallback**。保留 fallback 的三个工况都是候选方案在 VETO 过滤后缺少独立的非硬件遏制轨，继续强行派生会人为制造“临时方案”，因此当前不启用。

## 已完成：WP4d · WP5 · WP6

### WP4d · 双时间轴逐域启用

已将双时间轴从“全局实验开关”升级为“域级默认启用 + legacy fallback”：

- 默认启用域：`EMC_RE_CE / EMC_BCI / EMC_ESD / POWER_TRANSIENT / COMPONENT / THERMAL / WCCA_EOL / SIGNAL / CUSTOMER`。
- `BLDC / ROBOT_JOINT` 暂不默认启用，继续使用 legacy fallback。
- 即使 allowlist 域的 `candidateActions` 无法形成“非硬件遏制 + 硬件永久纠正”两条完整轨道，也自动回落 legacy，不制造虚假措施。
- 测试仍保留 `setDerivedTimelineEnabledForTest(true/false)` 做 A/B，防止默认行为漂移。

对应护栏：`scripts/verify-wp4d-domain-gates.ts`。

### WP5 · 计算器套娃拆解

已完成容器层去套娃，但没有删除或改写物理公式：

- `EngineeringCalculatorView` 保留通用 WCCA、Foster 瞬态热、稳态热、电压裕量四类计算。
- `MotorDriveToolbox` 不再作为平级计算器 tab，而是默认折叠的 BLDC 专项工具卡片。
- 删除 `MotorDriveToolbox` 内部的座椅 / 滑屏 / 按摩泵 / 机器人快捷预设，典型工况唯一入口回到全局 Scenario Manager。
- BLDC 专项中与通用 Thermal 方法“概念相关但参数边界不同”的堵转瞬态热核算暂时保留，不强行合并。

对应说明：`docs/wp5-calculator-boundary.md`。
对应护栏：`scripts/verify-wp5-calculator-boundary.cjs`。

### WP6 · 工作流页降级为帮助抽屉

已完成：

- `SUB_TABS.overview` 不再包含 `workflow`。
- `LEGACY_NAV.workflow` 解析为 `overview + helpDrawer=workflow`。
- 工作台头部提供“工作流帮助”入口。
- `EngineeringWorkflowView` 内容只搬到 `src/content/domainGuides.ts`，不改内容职责。
- 历史 `workflow` 深链接仍可达，治理脚本按“正式二级页 OR 帮助抽屉”判定能力覆盖。

对应护栏：`scripts/verify-7-workbench-architecture.ts`。

## 下一阶段

### WP4e · 剩余域确认与硬编码收口

重点不是再做 UI，而是逐域检查 legacy fallback 中仍存在的固定工程措施、周期、阈值和示例数字。保留确有“知识基线”职责的常量；把会冒充当前工程事实的演示数字移出业务结果路径。

### WP5b · 专项工具输入治理

继续把 `MotorDriveToolbox` 中未进入 `IssueInput` 的局部 What-if 参数标成明确的独立计算输入；不允许它们被误写成当前工程实测值或进入 AI 的当前事实层。

### WP6b · 工作流内容进一步去重

不再增加新的静态说明页。后续只把需要操作指引的文字继续收进帮助抽屉或共享 content source，避免在多个页面复制。

### WP7 · 三套案例库边界与体积

明确 `presetScenarios / engineeringGoldCases / systemRegressionCases` 的运行时职责，测离线 bundle 体积后再判断是否动态 import；不得把案例移出 `src/`。

### WP8 · `CopilotAnalysisResult` 字段治理

统计字段数量，建立“生产者 / 消费者 / 是否可派生”映射；增加只读 selectors，不删除旧字段。

## 建议额外补强

1. 增加 `resultStale`：输入变化后明确提示“当前结果基于上一次分析”。
2. 让 Section 14 UI 摘要从当前工况读取，不写固定 BLDC 示例数字。
3. 将 Prompt 中的工程经验周期/阈值逐步参数化，避免经验数字成为 AI 的隐含当前事实。
4. 在 WP4d 前建立逐域 snapshot 对比，确保派生时间轴不会因为候选方案字段缺失而悄悄降级成另一套逻辑。

## 本轮新增完成

- WP4e：legacy 时间轴固定数字加知识基线边界，移除隐藏的 14 天 / DV 默认事实。
- WP5b：专项工具输入源治理，`CURRENT_ISSUE` / `WHAT_IF` 明确分层，What-if 起始值集中管理。
- WP6b：帮助抽屉去除事实/风险/证据重复，只保留操作路径与当前缺口。

## 下一步

- WP4e-2：逐域建立 legacy vs derived snapshot，完成剩余 3 个 fallback 域的可派生性复核。
- WP5c：继续盘点 `MotorDriveToolbox` 的局部 What-if 参数，把真正属于当前工程的字段正式纳入 domain schema；其他保持隔离。
- WP6c：继续扫描 `FirstScreen10sView / AnalysisFactView / OptionsComparisonView / DecisionCockpitView / VerificationLoopView / DesignReviewRegressionView / RecommendationRaciView / EngineeringDocsView` 的重复段落，但只移动“事实归属”，不做文字表面删减。

## WP4e-2 / WP5c / WP6c 本轮继续收口

- **WP4e-2 · 时间轴来源治理**：`DualTimelineActionPlan.provenance` 区分 `DERIVED_FROM_CANDIDATES`、`LEGACY_KNOWLEDGE_BASELINE`、`AI_GENERATED`；Recommendation/RACI 页面和导出文本均展示来源，避免 legacy 固定工步被误读为当前工程事实。
- **WP4e-2 · Section 14**：验收工况提示不再写死 `3800rpm / 37.8V / 15天`，改为从实际 preset 的 title / phase / daysRemaining 派生；同工况重载先清旧结果再执行唯一一次显式分析。
- **WP5c · 输入治理继续收口**：MotorDriveToolbox 的 What-if 起始值继续集中在 `motorDriveWhatIfDefaults.ts`，当前工程绑定仅通过 IssueInput 明确字段进入确定性链路；专项工具不再维护第二套典型工况源。
- **WP6c · 页面归属**：工作台头部统一承载当前场景标签，候选方案页移除重复横幅；工作流帮助只负责“怎么走”，事实/风险/证据详情回到正式归属页。
- **结果恢复闸门**：AnalysisProvider 恢复保存结果前先比较当前 `context + issue` 指纹；保存结果与当前输入不匹配时直接清空并按当前输入重算。
- **Prompt 工期经验边界**：`domainAdaptivePromptEngine.ts` 中 14/20/18~25 天等经验值明确标成历史知识基线，并要求使用当前 `context.daysRemaining` + 实际 lead time 判断，不得当作当前项目事实。

## 下一步

- **WP5c-2**：把 `MotorDriveToolbox` 中尚未结构化的 What-if 参数逐项映射到 domain schema；只对具有明确 IssueInput 归属和 provenance 的参数开放“一键写入当前工程”。
- **WP6c-2**：继续建立页面级内容 ownership 清单，只把真正的事实/结论移动到唯一主页面；保留必要的摘要，但取消第二份完整解释。
- **WP7**：整理 `presetScenarios / engineeringGoldCases / systemRegressionCases` 的边界与离线 Bundle 体积，避免案例数据既作为测试夹具又作为生产事实源。
- **WP8**：治理 `CopilotAnalysisResult` 字段生产者/消费者，优先建立 selector，不做破坏性删字段。

## WP5c-2 / WP6c-2 / WP7 本轮完成

- **WP5c-2 · MotorDriveToolbox 正式输入 schema**：新增 `src/domains/bldc/motorDriveInputSchema.ts`，按 `CURRENT_ISSUE` / `WHAT_IF_ONLY` 明确字段归属；只有具备明确 IssueInput key 与 provenance 的字段才允许通过“写入当前工程”进入工程事实层。局部 What-if 草稿可立即参与工具计算，但不会自动污染 IssueInput / AI 当前事实层。
- **WP6c-2 · 8 个核心事实面 ownership**：新增 `src/content/workbenchOwnership.ts`，明确 7 个正式工作台 + 1 个横切 Trace 审计面的 owns / maySummarize / mustNotDuplicate；新增 ownership contract。
- **WP7 · 三套 Case Library 边界与体积**：固定三套库的生产职责与边界，并测得当前源码体积：`presetScenarios` 34,816 B（gzip 13,974 B）、`engineeringGoldCases` 19,081 B（gzip 7,990 B）、`systemRegressionCases` 13,736 B（gzip 4,797 B），合计 67,633 B；当前签入离线 bundle 快照约 1,817,889 B。未在没有新 Linux build 的情况下宣称精确 bundle 分摊，因此暂不贸然 dynamic import。
- **本轮护栏**：`verify-motor-drive-input-governance.cjs`、`verify-page-content-ownership.cjs`、`verify-case-library-boundaries.cjs` 已纳入测试链。

## 下一阶段

- **WP5d**：继续把 `MotorDriveToolbox` 剩余 What-if 参数做字段级 provenance / units / sourceType 收口，并逐项复核哪些字段应进入 IssueInput、哪些必须永久保持独立 What-if。
- **WP6d**：按 ownership 表对 8 个事实面做实际页面正文扫描；优先删除完整重复解释，只保留一两句摘要和导航引用，不改变信息量。
- **WP7b**：用一次干净 Linux `npm ci + npm test + npm run build` 生成新的离线 bundle 基线，再决定是否值得对三套 Case Library 做 dynamic import / production-only packaging。
- **WP8**：治理 `CopilotAnalysisResult` 字段生产者/消费者，优先建立 selector 和兼容层，避免继续向页面直接塞大型结果对象。
