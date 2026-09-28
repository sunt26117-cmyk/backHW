/**
 * 治理断言：7 工作台重构后「原有一级页面的能力一个都不能少」。
 *
 * 这类"页面被顶掉"的回归已经真实发生过两次：
 *   1) 黄金用例页的子页 id 'GOLD_CASES' 被"系统回归中心"挪用 -> Engineering Gold Cases 从 UI 消失；
 *   2) 7 工作台包把 EngineeringWorkflowView（原「0. 工程工作流」）漏掉 -> 该页无处可达，
 *      而包自己声称"不删除原有业务能力"。
 * 因此这里把"原 14 个视图必须仍被 import 且被渲染"钉死，并顺带守住几处最容易被静默改坏的锚点：
 *   - App.tsx 的浮层挂载（该步在安装脚本里是无守卫的 str.replace，失效不会报错，只会静默不挂载）；
 *   - UIContext 的 traceAuditOpen；
 *   - 我给 FSR 加的一供/二供写回接线（onApplyMeasuredValues）。
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { MAIN_TABS, LEGACY_TO_MAIN, toMainTab } from '../src/components/workbenchNavigation';

const ROOT = process.cwd();
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf8');

assert(fs.existsSync(path.join(ROOT, 'src/components/Navbar.tsx')), '请在仓库根目录运行（npm test 会自动满足）');

const navbar = read('src/components/Navbar.tsx');
const ui = read('src/contexts/UIContext.tsx');
const app = read('src/App.tsx');
const workbench = read('src/components/SeniorEngineeringWorkbenchView.tsx');
const appRouter = read('src/components/AppTabRouter.tsx');
const overlay = read('src/components/GlobalTraceAuditOverlay.tsx');

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
const surface = workbench + '\n' + overlay;
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

console.log(`7-workbench-architecture: PASS（${checks} 项检查，原 14 个视图全部可达）`);
