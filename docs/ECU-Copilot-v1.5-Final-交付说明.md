# ECU Copilot v1.5 Final 交付说明

## 这次完成的工作

1. 工程主流程已经形成“工况/项目输入 → 事实 → 物理机理 → 候选方案 → C-T-S-Q-L → 验证/VOI → 安全/可靠性 → 评审/RACI → EDR”的闭环。
2. 非 BLDC 场景不再用 P001~P018 作为唯一物理机理入口，增加 EMC/BCI、EMC RE/CE、ESD、电源瞬态、WCCA、WCCA+EOL、Thermal、Power、Signal、Safety、Reliability、DFM、Production 等领域模板。
3. 真实数据有来源标记：USER_MEASURED / IMPORTED / BENCHMARK / SPEC / CONTEXT / CALCULATED / ASSUMPTION / UNKNOWN。
4. Benchmark 只能作为演示；正式分析中的未知值不会被自动当成实测。
5. BCI 重点链路：Iinj → 共模路径 → 敏感节点 → 功能异常 → Recovery。
6. WCCA 重点链路：公差/温漂/偏置/老化 → Extreme/RSS/Monte Carlo → 实测分布 → EOL → Residual → Cpk/Ppk。
7. 增加 CSV/TXT 自动提取入口；XLSX/PDF/图片可作为证据附件留档。
8. 工况快速切换的异步结果采用 runId 隔离，旧任务不能覆盖新工况。
9. 关键页面增加异常/空结果保护，避免 `.map()` / `.join()` / undefined 字段导致白屏。
10. 主工作台取消固定 1280px 宽列，改为全视口工程工作台布局。

## 使用原则

不要把系统的 CALCULATED 数字直接当作 MEASURED；不要因为“模型通过”就跳过真实验证；不要把客户口头意见当成正式需求基线；不要用 Benchmark 数字替代当前项目数据。

## 推荐最小输入

- 项目：项目名称、阶段、客户、SOP、下一里程碑、剩余天数
- 问题：问题类别、Requirement/Spec、Actual、Condition、Environment、Failure Phenomenon、Engineering Concern
- 领域数字：根据当前领域填写必需字段
- 原始证据：Scope/频谱/CSV/WCCA表/供应商资料/测试报告

## 交付验证说明

源码已经完成 TypeScript/TSX 语法级扫描。由于当前交付环境未能完整安装项目依赖，因此没有宣称完成真实浏览器端构建/运行验收。导入 Google AI Studio 后应优先做：工况切换、5/10 页面、EMC BCI、WCCA+EOL、BLDC 物理机理等关键回归。
