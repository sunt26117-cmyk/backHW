import type { MainWorkbenchTab } from '../components/workbenchNavigation';

/**
 * WP6c-2：事实 ownership 唯一清单。
 * 这里定义“哪个页面拥有完整事实/结论”，其它页面只允许摘要、链接或引用。
 * 7 个正式工作台 + 1 个横切 Trace 审计面 = 8 个核心事实面。
 */
export type CoreFactSurface = MainWorkbenchTab | 'trace-audit';

export interface FactOwnershipEntry {
  id: CoreFactSurface;
  label: string;
  owns: readonly string[];
  maySummarize: readonly string[];
  mustNotDuplicate: readonly string[];
}

export const WORKBENCH_FACT_OWNERSHIP: readonly FactOwnershipEntry[] = [
  {
    id: 'overview', label: '总览 / First Screen',
    owns: ['当前问题摘要', '当前核心风险状态', '当前推荐动作摘要', '当前决策反转条件'],
    maySummarize: ['事实缺口', '物理结论', '验证状态', '交付状态'],
    mustNotDuplicate: ['完整输入表', '完整 Trace', '完整候选方案对比'],
  },
  {
    id: 'facts', label: '工程事实',
    owns: ['IssueInput 原始输入', '测量值与 provenance', '五类信息分类', '缺参与证据完整度', 'DFMEA 失效链条'],
    maySummarize: ['核心风险结论'],
    mustNotDuplicate: ['候选方案理由', 'RACI 正文', '完整验证计划'],
  },
  {
    id: 'physics', label: '物理分析',
    owns: ['确定性物理机理', 'Pattern P001~P018 结果', '公式与计算输出', 'Pattern 本地 What-if Trace'],
    maySummarize: ['当前最关键事实'],
    mustNotDuplicate: ['最终候选方案排名', 'RACI 文档正文'],
  },
  {
    id: 'decision', label: '方案决策',
    owns: ['CandidateAction 候选方案', 'VETO 与残余风险', 'C-T-S-Q-L 权衡', '最终决策框架'],
    maySummarize: ['关键物理证据', '验证门禁'],
    mustNotDuplicate: ['完整工程输入', '完整试验计划'],
  },
  {
    id: 'verification', label: '验证与回归',
    owns: ['Verification/VOI 试验计划', '实测回填闭环', '设计审查与系统回归状态'],
    maySummarize: ['当前风险与候选方案状态'],
    mustNotDuplicate: ['完整物理公式', '完整决策 RACI'],
  },
  {
    id: 'safety', label: '功能安全 / 可靠性',
    owns: ['ISO 26262 / FSR 专项评估', '安全目标与诊断链', '供应链/可靠性专项证据'],
    maySummarize: ['与当前问题直接相关的安全门禁'],
    mustNotDuplicate: ['完整通用案例库', '完整候选方案描述'],
  },
  {
    id: 'delivery', label: '决策交付',
    owns: ['RACI 与会签责任', 'EDR/ECR/偏差/客户交付文档'],
    maySummarize: ['最终推荐与门禁'],
    mustNotDuplicate: ['完整物理证据链', '完整试验推演'],
  },
  {
    id: 'trace-audit', label: 'Trace 审计（横切）',
    owns: ['输入→计算→结论的 provenance 链', '证据来源与假设标记'],
    maySummarize: ['任何主页面的来源状态'],
    mustNotDuplicate: ['Pattern 页本地 What-if Trace 数值'],
  },
] as const;

export function getFactOwnership(surface: CoreFactSurface): FactOwnershipEntry | undefined {
  return WORKBENCH_FACT_OWNERSHIP.find((entry) => entry.id === surface);
}
