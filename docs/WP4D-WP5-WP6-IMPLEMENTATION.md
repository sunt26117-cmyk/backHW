# WP4d → WP5 → WP6 实施记录

## WP4d

`src/utils/dualTimelineEngine.ts` 已从“全局实验关闭”切换为“域级默认启用 + legacy fallback”。默认启用的是已经有 12/15 preset 派生覆盖证据的域：

`EMC_RE_CE / EMC_BCI / EMC_ESD / POWER_TRANSIENT / COMPONENT / THERMAL / WCCA_EOL / SIGNAL / CUSTOMER`

`BLDC / ROBOT_JOINT` 仍保留 legacy fallback。派生算法只读取当前 `candidateActions`，VETO 不得进入时间轴；若不能同时形成 containment 与 permanent 两类有效项，则自动回落，不制造新工程措施。

## WP5

`EngineeringCalculatorView` 只保留通用计算器入口。`MotorDriveToolbox` 变成默认折叠的 BLDC 专项卡片，只有用户展开时才挂载。

删除了专项工具内部的典型应用快捷预设，避免与全局 Scenario Manager 形成第二套“典型工况”事实源。物理计算函数和公式未修改。

通用计算器与 BLDC 专项的边界见 `docs/wp5-calculator-boundary.md`。

## WP6

`EngineeringWorkflowView` 不再占用总览正式二级页。工作流内容通过 `EngineeringWorkflowHelpDrawer` 打开；旧 `workflow` id 仍可深链接到抽屉；`DOMAIN_GUIDES` 只迁移位置到 `src/content/domainGuides.ts`。

第一屏增加轻量工作流帮助入口，确保原来“第一屏 → 工作流”的能力继续可达。

## 硬编码清理

决策页第 14 区去除了固定的 96%、42%、28 天、15 天、3 天、94.5% 和固定寄存器地址等演示数字，改为读取当前候选方案、里程碑、风险和证据状态。案例库和模型常量仍保留为其原本职责，不当作当前工程事实。
