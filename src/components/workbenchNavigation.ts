/**
 * 工作台导航解析：**唯一**真源。
 *
 * 背景（真实故障）：7 工作台重构后，AppTabRouter 用"旧 id → 新工作台"的**单向**映射去解析
 * activeTab，而 Navbar 与 onNavigateMain 传进来的却是**新工作台 id**。physics / decision / delivery
 * 不在旧 id 表里 → 命中 `|| 'overview'` 静默弹回总览，表现为"点 ③物理分析 / ④方案决策 / ⑦决策交付 没反应"。
 * facts / verification / safety / overview 恰好两套命名相同，所以只有那三个坏。
 * tsc 没抓住的原因：UIContext 把 activeTab 声明成 string。
 *
 * 因此解析必须是**双向且完全**的：先认新工作台 id，再退回旧 id 表，最后由
 * scripts/verify-7-workbench-architecture.ts 逐个断言（7 个新 id + 14 个旧 id + 未知值）。
 */
export type MainWorkbenchTab = 'overview' | 'facts' | 'physics' | 'decision' | 'verification' | 'safety' | 'delivery';

export const MAIN_TABS: readonly MainWorkbenchTab[] = [
  'overview', 'facts', 'physics', 'decision', 'verification', 'safety', 'delivery',
];

/** 旧一级 Tab id → 新工作台 */
export const LEGACY_TO_MAIN: Readonly<Record<string, MainWorkbenchTab>> = {
  workflow: 'overview', overview: 'overview',
  input: 'facts', facts: 'facts',
  patterns: 'physics', calc: 'physics',
  options: 'decision', cockpit: 'decision',
  verification: 'verification', review: 'verification',
  safety: 'safety',
  recommendation: 'delivery', docs: 'delivery',
  'trace-audit': 'overview',
};

export function toMainTab(tab: string | undefined | null): MainWorkbenchTab {
  if (!tab) return 'overview';
  if ((MAIN_TABS as readonly string[]).includes(tab)) return tab as MainWorkbenchTab;
  return LEGACY_TO_MAIN[tab] ?? 'overview';
}
