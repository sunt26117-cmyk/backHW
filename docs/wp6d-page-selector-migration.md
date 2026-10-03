# WP6d · 页面事实 Ownership 实际收口

本阶段不再继续增加静态说明页，而是把已有 ownership 表落实到页面职责与导航提示。

## 主事实面

| 工作台 | 主事实 | 其它页面允许做什么 |
|---|---|---|
| 总览 / First Screen | 当前决策快照、下一步、反转条件 | 只给摘要与跳转 |
| 工程事实 | IssueInput、provenance、缺参、证据分类 | 其它页只引用事实状态 |
| 物理分析 | 确定性机理、Pattern、公式、计算输出 | 决策页只引用关键证据 |
| 方案决策 | CandidateAction、VETO、C-T-S-Q-L、最终决策框架 | 候选页提供完整方案细节；其它页引用 |
| 验证与回归 | 试验计划、VOI、回填、系统回归 | 决策页只显示验证门禁摘要 |
| 功能安全 / 可靠性 | 安全目标、诊断链、供应链/可靠性专项 | 其它页面只引用相关门禁 |
| 决策交付 | RACI、EDR/ECR、客户交付物 | 只在交付物中重新组合需要的完整信息 |
| Trace 审计 | provenance / 输入→计算→结论 | 横切审计，不产生新业务事实 |

## 实际收口规则

1. First Screen 只做决策摘要，不复制 Facts/Pattern 的完整正文。
2. OptionsComparison 是候选方案细节主入口；DecisionCockpit 可以对排序与决策权衡做二次计算，但不得重新建立候选方案事实源。
3. VerificationLoop 的职责是“验证动作 + 回填闭环”，DesignReviewRegression 的职责是“代码回归与系统行为”，两者不能再维护第二份工程案例库。
4. RecommendationRaci 负责“谁做什么与会签”，EngineeringDocs 负责“受控交付物”，导出文档中的重组内容属于交付物本身，不作为第二事实源。
5. `ResultProvenanceBanner` / `TemplateContentNotice` 继续全局唯一；页面正文中不得重新声明一套来源语义。

现有 `verify-page-content-ownership.cjs` 继续作为最低级静态护栏；后续页面调整必须保持 ownership 清单与导航映射同时成立。
