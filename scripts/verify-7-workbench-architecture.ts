/**
 * 治理断言：7 工作台重构后「原有一级页面的能力一个都不能少」。
 *
 * 这类"页面被顶掉"的回归已经真实发生过两次：
 *   1) 黄金用例页的子页 id 'GOLD_CASES' 被"系统回归中心"挪用 -> Engineering Gold Cases 从 UI 消失；
 *   2) 7 工作台包把 EngineeringWorkflowView（原「0. 工程工作流」）漏掉 -> 该页无处可达，
 *      而包自己声称"不删除原有业务能力"。现在该内容改为帮助抽屉，因此"可达"允许通过正式二级页或帮助抽屉满足。
 * 因此这里把"原 14 个视图必须仍被 import 且被渲染"钉死，并顺带守住几处最容易被静默改坏的锚点：
 *   - App.tsx 的浮层挂载（该步在安装脚本里是无守卫的 str.replace，失效不会报错，只会静默不挂载）；
 *   - UIContext 的 traceAuditOpen；
 *   - 我给 FSR 加的一供/二供写回接线（onApplyMeasuredValues）。
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  MAIN_TABS, LEGACY_TO_MAIN, LEGACY_NAV, SUB_TABS, toMainTab, resolveNav,
  getSubTab, setSubTab, resetSubTabsForTest,
} from '../src/components/workbenchNavigation';

const ROOT = process.cwd();
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf8');

assert(fs.existsSync(path.join(ROOT, 'src/components/Navbar.tsx')), '请在仓库根目录运行（npm test 会自动满足）');

const navbar = read('src/components/Navbar.tsx');
const ui = read('src/contexts/UIContext.tsx');
const app = read('src/App.tsx');
const workbench = read('src/components/SeniorEngineeringWorkbenchView.tsx');
const appRouter = read('src/components/AppTabRouter.tsx');
const overlay = read('src/components/GlobalTraceAuditOverlay.tsx');
const workflowHelp = read('src/components/EngineeringWorkflowHelpDrawer.tsx');

let checks = 0;
const ok = (cond: boolean, msg: string) => { assert(cond, msg); checks += 1; };

// 1) 7 个工作台入口齐备
for (const id of ['overview', 'facts', 'physics', 'decision', 'verification', 'safety', 'delivery']) {
  ok(navbar.includes(`id: '${id}'`), `Navbar 缺少工作台入口: ${id}`);
}
// 2) 旧的一级 Tab 不再出现在导航里（能力由工作台承载，避免两套导航并存）
for (const id of ['workflow', 'input', 'patterns', 'options', 'cockpit', 'review', 'recommendation', 'docs', 'calc', 'trace-audit']) {
  ok(!navbar.includes(`id: '${id}'`), `Navbar 仍残留旧一级 Tab: ${id}`);
}
// 3) Trace 改为全局浮层
ok(ui.includes('traceAuditOpen') && ui.includes('setTraceAuditOpen'), 'UIContext 缺少 traceAuditOpen/setTraceAuditOpen');
ok(app.includes('GlobalTraceAuditOverlay'), 'App.tsx 未引用 GlobalTraceAuditOverlay（全局 Trace 会静默失效）');
ok(/<GlobalTraceAuditOverlay\s*\/>/.test(app), 'App.tsx 只 import 了 GlobalTraceAuditOverlay 却没有渲染它');

// 4) 原 14 个视图：必须仍被 import 且被渲染（能力覆盖闸）
const ORIGINAL_VIEWS = [
  'EngineeringWorkflowView', 'FirstScreen10sView', 'ProjectContextView', 'AnalysisFactView',
  'BldcPatternEngineView', 'OptionsComparisonView', 'DecisionCockpitView', 'VerificationLoopView',
  'FunctionalSafetyReliabilityView', 'DesignReviewRegressionView', 'RecommendationRaciView',
  'EngineeringDocsView', 'EngineeringCalculatorView', 'TraceAuditView',
];
const surface = workbench + '\n' + overlay + '\n' + workflowHelp;
for (const name of ORIGINAL_VIEWS) {
  ok(surface.includes(`from './${name}'`), `${name} 不再被任何工作台 import（能力丢失）`);
  ok(new RegExp(`<${name}[\\s/>]`).test(surface), `${name} 被 import 但从未渲染（页面不可达）`);
}

// 5) 关键接线不能被重构吃掉
// 必须是"接在 FSR 渲染处"的写回，而不只是 import 或类型声明：属性名到 setIssue 之间不能断
ok(/<FunctionalSafetyReliabilityView[\s\S]{0,600}?onApplyMeasuredValues/.test(workbench), 'FSR 渲染处没有接 onApplyMeasuredValues（一供/二供写回会退化成只改本页状态）');
ok(/onApplyMeasuredValues=\{\(values, sourceLabel\)[\s\S]{0,600}?setIssue/.test(workbench), 'onApplyMeasuredValues 的 handler 没有真正写回 setIssue');
ok(workbench.includes('measurementProvenance'), '一供/二供写回缺少 measurementProvenance 记录');

// 6) 恰好 7 个工作台
ok(MAIN_TABS.length === 7, `工作台应为 7 个，实际 ${MAIN_TABS.length}`);
for (const id of ['overview', 'facts', 'physics', 'decision', 'verification', 'safety', 'delivery']) {
  ok((MAIN_TABS as readonly string[]).includes(id), `工作台缺少: ${id}`);
}

// 7) 导航解析必须"双向完全" —— 真实故障回归：physics/decision/delivery 被单向映射静默弹回总览
//    （Navbar 与 onNavigateMain 传的是新工作台 id，而当时只做了"旧 id → 新工作台"的单向查表）
for (const id of MAIN_TABS) {
  ok(toMainTab(id) === id, `新工作台 id 解析错误: ${id} → ${toMainTab(id)}（会静默弹回总览，表现为该 Tab 点不动）`);
}
for (const legacy of Object.keys(LEGACY_TO_MAIN)) {
  ok(toMainTab(legacy) === LEGACY_TO_MAIN[legacy], `旧 id 解析错误: ${legacy} → ${toMainTab(legacy)}`);
}
ok(toMainTab('不存在的-tab') === 'overview', '未知 id 应回落到总览而不是抛错');
ok(toMainTab(undefined) === 'overview', '空 id 应回落到总览');
// router 必须复用这份唯一真源，不能再本地另写一份单向映射
ok(appRouter.includes('toMainTab(activeTab)'), 'AppTabRouter 未使用共享的 toMainTab 解析（可能又写了第二份单向映射）');

// 8) Trace 审计的交互契约：点一下就在右侧常驻显示详情，不得再弹窗
const traceAudit = read('src/components/TraceAuditView.tsx');
const traceDrawer = read('src/components/TraceDrawer.tsx');
ok(traceAudit.includes('TraceNodeList'), 'Trace 审计未复用 TraceNodeList（详情会出现第二套渲染/两套说法）');
// 注意只能匹配 JSX 用法：审计页仍然要从 './TraceDrawer' 里 import TraceNodeList/verdictClass
ok(!/<TraceDrawer[\s/>]/.test(traceAudit), 'Trace 审计又用回了 TraceDrawer 弹窗（应改为右侧常驻详情）');
ok(traceAudit.includes('setSelectedNodeId'), 'Trace 审计缺少选中状态（无法在右侧切换详情）');
ok(traceDrawer.includes('export const TraceNodeList'), 'TraceDrawer 未导出可复用的 TraceNodeList');
// 列表每行必须仍能看到「结果 / 输入 / 判定边界」这三项事实（本次重构曾把它们从列表里删掉，
// 只剩右侧详情，导致无法在列表里横向扫读）。右侧详情的同名标签在 TraceDrawer 里，不在本文件。
for (const label of ['结果', '输入', '判定边界']) {
  ok(traceAudit.includes(label), `Trace 审计列表每行缺少事实项: ${label}（重构时又被删掉了）`);
}

// 9) 二级页（subTab）治理 —— 真实故障回归：
//    App.tsx 的 <PageErrorBoundary key={ui.activeTab}> 会在主工作台切换时重挂载工作台，
//    原先 subTab 是组件内 useState，跨工作台的深链接（setSubTab 落在旧实例上）全部落到第一个二级页。
//    现在二级页选择放在 workbenchNavigation 的外部 store 里，这里钉死它。
for (const id of MAIN_TABS) {
  ok(id in SUB_TABS, `SUB_TABS 缺少工作台: ${id}`);
}
ok(SUB_TABS.safety.length === 0, 'safety 不应有二级页');
for (const [legacy, t] of Object.entries(LEGACY_NAV)) {
  ok((MAIN_TABS as readonly string[]).includes(t.main), `LEGACY_NAV[${legacy}] 指向不存在的工作台 ${t.main}`);
  if (t.sub) ok((SUB_TABS[t.main] as readonly string[]).includes(t.sub), `LEGACY_NAV[${legacy}] 的二级页 ${t.sub} 不属于 ${t.main}`);
}
// 子页面实际传给 onNavigateTab 的 id → 必须落在预期的 工作台/二级页（与 FirstScreen10sView / EngineeringWorkflowView 的 tab 值逐一对应）
const DEEP_LINKS: Array<[string, string, string | undefined]> = [
  ['input', 'facts', 'inputs'], ['facts', 'facts', 'facts'], ['patterns', 'physics', 'patterns'],
  ['calc', 'physics', 'calculator'], ['options', 'decision', 'options'], ['cockpit', 'decision', 'cockpit'],
  ['verification', 'verification', 'loop'], ['review', 'verification', 'review'], ['safety', 'safety', undefined],
  ['recommendation', 'delivery', 'raci'], ['docs', 'delivery', 'docs'], ['workflow', 'overview', undefined],
];
for (const [id, main, sub] of DEEP_LINKS) {
  const t = resolveNav(id);
  ok(t.main === main && t.sub === sub, `深链接 ${id} 应落到 ${main}/${sub}，实际 ${t.main}/${t.sub}`);
}
const workflowTarget = resolveNav('workflow');
ok(workflowTarget.helpDrawer === 'workflow', 'workflow 深链接必须打开 workflow 帮助抽屉');
ok(SUB_TABS.overview.length === 1 && SUB_TABS.overview[0] === 'first', '总览不应再把工程工作流作为正式二级页');
ok(workbench.includes('EngineeringWorkflowHelpDrawer'), '工作台头部/主体未挂载工程工作流帮助抽屉');
ok(workflowHelp.includes('<EngineeringWorkflowView'), '帮助抽屉未承载原工程工作流内容');
for (const bad of ['constructor', 'toString', '__proto__', '不存在']) {
  ok(toMainTab(bad) === 'overview', `原型链/未知键 ${bad} 应回落到总览`);
}
// store：写入后即使"组件重挂载"（这里等价于重新读取）也不丢；非法二级页回落默认
resetSubTabsForTest();
ok(getSubTab('delivery') === 'raci', '默认二级页应为第一个');
setSubTab('delivery', 'docs');
ok(getSubTab('delivery') === 'docs', '二级页选择没有被记住（深链接会落到第一个二级页）');
setSubTab('physics', 'docs' as any);
ok(getSubTab('physics') === 'patterns', '不属于该工作台的二级页应被忽略并回落默认页');
ok(getSubTab('safety') === null, 'safety 无二级页应返回 null');
resetSubTabsForTest();
// 源码锚点：工作台必须用外部 store，不能退回组件内 useState / 第二份手写映射
ok(workbench.includes('subscribeSubTabs') && workbench.includes('useSyncExternalStore'), '工作台未使用外部二级页 store（深链接会再次丢失）');
ok(!/useState<SubTab>/.test(workbench), '工作台又把 subTab 放回了组件内 useState（主工作台切换重挂载会丢失）');
ok(!/case 'input':/.test(workbench), '工作台里又出现一份手写的旧 id 映射（应只用 workbenchNavigation.LEGACY_NAV）');
ok(workbench.includes('PageErrorBoundary'), '二级页缺少错误边界（单个二级页崩溃会拖垮整个工作台）');

// 10) 全局提示唯一化：横幅只允许在工作台里渲染一次，视图内不得再自行渲染
{
  const dir = path.join(ROOT, 'src/components');
  const offenders: string[] = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.tsx') || f === 'SeniorEngineeringWorkbenchView.tsx' || f === 'ResultProvenanceBanner.tsx' || f === 'TemplateContentNotice.tsx') continue;
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    if (/<ResultProvenanceBanner\b|<TemplateContentNotice\b/.test(src)) offenders.push(f);
  }
  ok(offenders.length === 0, `提示横幅只能在 SeniorEngineeringWorkbenchView 渲染一次，以下视图仍在重复渲染: ${offenders.join(', ')}`);
  ok((workbench.match(/<ResultProvenanceBanner\b/g) || []).length === 1, '工作台应恰好渲染 1 次 ResultProvenanceBanner');
  ok((workbench.match(/<TemplateContentNotice\b/g) || []).length === 1, '工作台应恰好渲染 1 次 TemplateContentNotice');
}

// 11) Trace 双入口不得被"收敛"掉 —— 两者数据来源不同：
//     Pattern 页的抽屉显示**本地调参(what-if)后**的 Trace（params 为组件内状态，改动会把字段标 USER_INPUT）；
//     全局审计按**已保存工况**重算，且有"输入是否足够"门槛。若把抽屉改成"摘要 + 跳转全局"，
//     用户调参后看到的数字会与 Pattern 页不一致，调参 Trace 也会丢失。
{
  const pattern = read('src/components/BldcPatternEngineView.tsx');
  ok(/<TraceDrawer[\s/>]/.test(pattern), 'Pattern 页不再使用 TraceDrawer：本地调参后的 Trace 会丢失（见本节注释）');
  ok(traceAudit.includes('已保存的工况输入'), 'Trace 审计缺少数据口径说明（用户会误以为它包含 Pattern 页的本地调参）');
}

console.log(`7-workbench-architecture: PASS（${checks} 项检查，原 14 项能力全部可达；workflow 通过帮助抽屉）`);
