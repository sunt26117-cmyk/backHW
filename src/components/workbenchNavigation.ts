/**
 * 工作台导航：**唯一**真源（主工作台 + 二级页 + 旧 id 映射 + 二级页记忆）。
 *
 * 历史故障 1（已修）：7 工作台重构后，AppTabRouter 只做"旧 id → 新工作台"的单向映射，
 * Navbar 传进来的却是新工作台 id，physics / decision / delivery 命中 `|| 'overview'`
 * 静默弹回总览。解析必须是**双向且完全**的：先认新工作台 id，再退回旧 id 表。
 *
 * 历史故障 2（本次修复）：二级页(subTab)原来是 SeniorEngineeringWorkbenchView 的 useState，
 * 而 App.tsx 里 `<PageErrorBoundary key={ui.activeTab}>` 会在**主工作台切换时整体重挂载**它。
 * 于是 `onNavigateMain('physics'); setSubTab('calculator')` 里的 setSubTab 落在即将被销毁的
 * 旧实例上，新实例按初始值渲染 —— 所有跨工作台的"深链接"（如 工作流页的"看受控文档/EDR"、
 * 第一屏的"事实与证据"）都会落到该工作台的**第一个**二级页，而不是目标页。
 * 因此二级页选择必须放在**不随组件重挂载而丢失**的地方：本文件里的小型外部 store。
 *
 * 另外，原先 LEGACY_TO_MAIN（只有主工作台）和 SeniorEngineeringWorkbenchView.mapNavigation
 * （主工作台 + 二级页）是两份手写映射，本文件合并为 LEGACY_NAV 一份，LEGACY_TO_MAIN 由它派生。
 *
 * scripts/verify-7-workbench-architecture.ts 逐个断言。
 */
export type MainWorkbenchTab = 'overview' | 'facts' | 'physics' | 'decision' | 'verification' | 'safety' | 'delivery';

export type SubTab =
  | 'first'
  | 'inputs' | 'facts'
  | 'patterns' | 'calculator'
  | 'options' | 'cockpit'
  | 'loop' | 'review'
  | 'raci' | 'docs';

export const MAIN_TABS: readonly MainWorkbenchTab[] = [
  'overview', 'facts', 'physics', 'decision', 'verification', 'safety', 'delivery',
];

/** 每个主工作台下的二级页（第一个为默认页）。safety 没有二级页。 */
export const SUB_TABS: Readonly<Record<MainWorkbenchTab, readonly SubTab[]>> = {
  overview: ['first'],
  facts: ['inputs', 'facts'],
  physics: ['patterns', 'calculator'],
  decision: ['options', 'cockpit'],
  verification: ['loop', 'review'],
  safety: [],
  delivery: ['raci', 'docs'],
};

export interface NavTarget {
  main: MainWorkbenchTab;
  /** 省略 = 该工作台的默认/上次停留的二级页 */
  sub?: SubTab;
  /** 旧页面仍然可达，但以帮助抽屉呈现，不占正式二级页 */
  helpDrawer?: 'workflow';
}

/** 旧一级 Tab id → 新工作台 + 二级页（唯一一份手写映射） */
export const LEGACY_NAV: Readonly<Record<string, NavTarget>> = {
  workflow: { main: 'overview', helpDrawer: 'workflow' },
  overview: { main: 'overview', sub: 'first' },
  input: { main: 'facts', sub: 'inputs' },
  facts: { main: 'facts', sub: 'facts' },
  patterns: { main: 'physics', sub: 'patterns' },
  calc: { main: 'physics', sub: 'calculator' },
  options: { main: 'decision', sub: 'options' },
  cockpit: { main: 'decision', sub: 'cockpit' },
  verification: { main: 'verification', sub: 'loop' },
  review: { main: 'verification', sub: 'review' },
  safety: { main: 'safety' },
  recommendation: { main: 'delivery', sub: 'raci' },
  docs: { main: 'delivery', sub: 'docs' },
  'trace-audit': { main: 'overview' },
};

/** 旧 id → 新工作台（由 LEGACY_NAV 派生，保持原导出形状） */
export const LEGACY_TO_MAIN: Readonly<Record<string, MainWorkbenchTab>> = Object.freeze(
  Object.fromEntries(Object.entries(LEGACY_NAV).map(([id, t]) => [id, t.main])) as Record<string, MainWorkbenchTab>,
);

const hasOwn = (obj: object, key: string): boolean => Object.prototype.hasOwnProperty.call(obj, key);

export function isMainTab(tab: unknown): tab is MainWorkbenchTab {
  return typeof tab === 'string' && (MAIN_TABS as readonly string[]).includes(tab);
}

export function toMainTab(tab: string | undefined | null): MainWorkbenchTab {
  if (!tab) return 'overview';
  if (isMainTab(tab)) return tab;
  // hasOwn：避免 'constructor' / 'toString' 之类原型链键命中并返回函数
  return hasOwn(LEGACY_TO_MAIN, tab) ? LEGACY_TO_MAIN[tab] : 'overview';
}

/**
 * 解析任意导航 id（新工作台 id / 旧一级 id / 未知值）→ 目标工作台 + 二级页。
 * 注意 'facts' / 'overview' / 'verification' / 'safety' 同时是新旧 id：
 * 页面内部跳转（navigate）按旧 id 语义落到具体二级页；Navbar 点击不走本函数，
 * 直接 setActiveTab(主工作台 id)，二级页由 store 记忆恢复。
 */
export function resolveNav(id: string | undefined | null): NavTarget {
  if (id && hasOwn(LEGACY_NAV, id)) return LEGACY_NAV[id];
  return { main: toMainTab(id) };
}

export function defaultSubTab(main: MainWorkbenchTab): SubTab | null {
  return SUB_TABS[main][0] ?? null;
}

/** 二级页必须属于该主工作台，否则回落到默认页（safety 返回 null） */
export function normalizeSubTab(main: MainWorkbenchTab, sub: string | undefined | null): SubTab | null {
  const list = SUB_TABS[main];
  if (sub && (list as readonly string[]).includes(sub)) return sub as SubTab;
  return list[0] ?? null;
}

/* ───────────── 二级页记忆 store（不随组件重挂载而丢失） ───────────── */

const selection: Partial<Record<MainWorkbenchTab, SubTab>> = {};
const listeners = new Set<() => void>();

export function getSubTab(main: MainWorkbenchTab): SubTab | null {
  return normalizeSubTab(main, selection[main]);
}

export function setSubTab(main: MainWorkbenchTab, sub: SubTab | null | undefined): void {
  const next = normalizeSubTab(main, sub);
  if (next === null || getSubTab(main) === next) return;
  selection[main] = next;
  listeners.forEach((l) => l());
}

export function subscribeSubTabs(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** 仅供测试 */
export function resetSubTabsForTest(): void {
  (Object.keys(selection) as MainWorkbenchTab[]).forEach((k) => { delete selection[k]; });
  listeners.forEach((l) => l());
}
