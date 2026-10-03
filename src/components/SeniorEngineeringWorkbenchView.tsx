import { selectAnalysisResultContract } from '../utils/analysisResultSelectors';
import React, { useCallback, useMemo, useSyncExternalStore } from 'react';
import { Database, Layers3, ChevronRight, ShieldCheck, SlidersHorizontal, HelpCircle } from 'lucide-react';
import { ProjectContext, IssueInput, CopilotAnalysisResult, HwLeadStyle } from '../types';
import { FirstScreen10sView } from './FirstScreen10sView';
import { EngineeringWorkflowHelpDrawer } from './EngineeringWorkflowHelpDrawer';
import { ProjectContextView } from './ProjectContextView';
import { AnalysisFactView } from './AnalysisFactView';
import { BldcPatternEngineView } from './BldcPatternEngineView';
import { EngineeringCalculatorView } from './EngineeringCalculatorView';
import { OptionsComparisonView } from './OptionsComparisonView';
import { DecisionCockpitView } from './DecisionCockpitView';
import { VerificationLoopView } from './VerificationLoopView';
import { FunctionalSafetyReliabilityView } from './FunctionalSafetyReliabilityView';
import { DesignReviewRegressionView } from './DesignReviewRegressionView';
import { RecommendationRaciView } from './RecommendationRaciView';
import { EngineeringDocsView } from './EngineeringDocsView';
import { PageErrorBoundary } from './PageErrorBoundary';
import { ResultProvenanceBanner } from './ResultProvenanceBanner';
import { TemplateContentNotice } from './TemplateContentNotice';
import { resolveEngineeringDomain } from '../utils/scenarioDomainEngine';
import {
  SUB_TABS, resolveNav, getSubTab, setSubTab, subscribeSubTabs,
} from './workbenchNavigation';

import type { MainWorkbenchTab, SubTab } from './workbenchNavigation';
export type { MainWorkbenchTab };

interface Props {
  activeTab: MainWorkbenchTab;
  context: ProjectContext;
  setContext: React.Dispatch<React.SetStateAction<ProjectContext>>;
  issue: IssueInput;
  setIssue: React.Dispatch<React.SetStateAction<IssueInput>>;
  result: CopilotAnalysisResult | null;
  currentScenarioId: string;
  currentScenarioTitle?: string;
  isCustomScenario?: boolean;
  isAnalyzing: boolean;
  resultIsStale?: boolean;
  lastSavedAt?: string | null;
  hwLeadStyle?: HwLeadStyle;
  onLeadStyleChange?: (style: HwLeadStyle) => void;
  recurrenceCount?: number;
  daysRemaining?: number;
  onRunAnalysis: () => void;
  onOpenScenarioManage?: () => void;
  onSaveCustomScenario?: () => void;
  onDeleteCustomScenario?: () => void;
  onLoadScenarioSection14?: () => void;
  onNavigateMain: (tab: MainWorkbenchTab) => void;
  workflowHelpOpen: boolean;
  onWorkflowHelpChange: (open: boolean) => void;
}

const TAB_META: Record<MainWorkbenchTab, { label: string; desc: string }> = {
  overview: { label: '总览', desc: '当前问题、风险边界、下一步与证据门禁' },
  facts: { label: '工程事实', desc: '输入、来源、实测值、假设与缺参的唯一归属' },
  physics: { label: '物理分析', desc: '主导机理、确定性结论、公式与高级计算工具' },
  decision: { label: '方案决策', desc: '候选方案、VETO、残余风险与 C-T-S-Q-L' },
  verification: { label: '验证与回归', desc: '验证闭环、VOI、评审、回归与 Mandatory Retest' },
  safety: { label: '功能安全 / 可靠性', desc: 'ISO 26262、EMC/BCI、寿命与供应链审查' },
  delivery: { label: '决策交付', desc: 'RACI、会签、EDR、ECR、偏差与客户交付物' },
};

/** 二级页标签：只维护"id → 文案"，每个工作台有哪些二级页以 SUB_TABS 为准（不再两处手写） */
const SUB_LABEL: Record<SubTab, string> = {
  first: '10 秒第一屏',
  inputs: '工程输入',
  facts: '事实审计',
  patterns: '主导机理 / Pattern',
  calculator: '高级计算工具',
  options: '候选方案',
  cockpit: 'C-T-S-Q-L 决策',
  loop: '验证闭环 / VOI',
  review: '评审与回归',
  raci: 'RACI / 协同',
  docs: '受控文档',
};

function WorkbenchHeader({ activeTab, context, issue, result, isAnalyzing, onWorkflowHelpChange }: Pick<Props, 'activeTab' | 'context' | 'issue' | 'result' | 'isAnalyzing' | 'onWorkflowHelpChange'>) {
  // 域解析每次渲染都跑一遍没有必要：只在 issue 变化时重算
  const domain = useMemo(() => resolveEngineeringDomain(issue), [issue]);
  const scenarioLabel = (result as any)?.__scenarioLabel || context.projectName || '当前工程';
  // 这里显示的是"真实状态"，而不是无条件宣称"单一事实源"：未分析时不应给出已审计的暗示
  const status = isAnalyzing
    ? { text: '分析中…', cls: 'border-amber-700/40 bg-amber-950/20 text-amber-300' }
    : result
      ? { text: '分析结果已就绪', cls: 'border-emerald-700/40 bg-emerald-950/20 text-emerald-300' }
      : { text: '尚未运行分析', cls: 'border-slate-700 bg-slate-950 text-slate-400' };
  return (
    <div className="mb-4 rounded-xl border border-slate-800 bg-slate-900/80 px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-sm font-bold text-white">
            <span>{TAB_META[activeTab].label}</span>
            <span className="text-slate-600">·</span>
            <span className="truncate text-cyan-300">{scenarioLabel}</span>
          </div>
          <div className="mt-1 text-[11px] text-slate-400">{TAB_META[activeTab].desc}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[10px]">
          <button type="button" onClick={() => onWorkflowHelpChange(true)} className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-slate-300 hover:border-cyan-700 hover:text-cyan-200 transition cursor-pointer flex items-center gap-1.5" title="打开工程工作流帮助">
            <HelpCircle className="w-3.5 h-3.5" /> 工作流帮助
          </button>
          <span className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-slate-400">域：<b className="text-cyan-300">{domain}</b></span>
          <span className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-slate-400">阶段：<b className="text-slate-200">{context.projectPhase || 'DVT'}</b></span>
          <span className={`rounded-md border px-2 py-1 ${status.cls}`}>{status.text}</span>
        </div>
      </div>
    </div>
  );
}

function SubTabs({ main, active, onChange }: { main: MainWorkbenchTab; active: SubTab | null; onChange: (tab: SubTab) => void }) {
  const tabs = SUB_TABS[main];
  if (!tabs.length) return null;
  return (
    <div role="tablist" aria-label={`${TAB_META[main].label}二级页`} className="mb-4 flex flex-wrap items-center gap-1 rounded-lg border border-slate-800 bg-slate-950/70 p-1.5">
      {tabs.map((id) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={active === id}
          onClick={() => onChange(id)}
          className={`rounded-md px-3 py-1.5 text-[11px] font-medium transition cursor-pointer ${active === id ? 'bg-blue-600/25 text-blue-300 border border-blue-500/40 shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/70'}`}
        >
          {SUB_LABEL[id]}
        </button>
      ))}
    </div>
  );
}

export const SeniorEngineeringWorkbenchView: React.FC<Props> = (props) => {
  const {
    activeTab, context, setContext, issue, setIssue, result, currentScenarioId,
    currentScenarioTitle, isCustomScenario, isAnalyzing, lastSavedAt,
    hwLeadStyle, onLeadStyleChange, recurrenceCount, daysRemaining,
    onRunAnalysis, onOpenScenarioManage, onSaveCustomScenario, onDeleteCustomScenario,
    onLoadScenarioSection14, onNavigateMain, workflowHelpOpen, onWorkflowHelpChange,
  } = props;
  const contract = selectAnalysisResultContract(result);
  const templateNotice = contract.templateNotice;
  const traceSummary = contract.trace;

  // 二级页来自外部 store：派生值 → 没有"主工作台已切换但二级页还是旧的"的空白帧，
  // 且主工作台因 App.tsx 的 key 重挂载时选择也不会丢（深链接才能落到目标二级页）。
  const readSub = () => getSubTab(activeTab);
  const subTab = useSyncExternalStore(subscribeSubTabs, readSub, readSub);
  const switchSub = useCallback((sub: SubTab) => setSubTab(activeTab, sub), [activeTab]);

  /**
   * 页面内跳转的唯一入口：先写目标二级页，再切主工作台。
   * 顺序不能反：主工作台一变，App 的 key 会让新实例立刻挂载，那时二级页必须已就位。
   */
  const navigate = useCallback((tabId: string) => {
    const target = resolveNav(tabId);
    if (target.helpDrawer === 'workflow') onWorkflowHelpChange(true);
    if (target.sub) setSubTab(target.main, target.sub);
    onNavigateMain(target.main);
  }, [onNavigateMain]);

  const renderBody = () => {
    switch (activeTab) {
      case 'overview':
        return <FirstScreen10sView context={context} issue={issue} result={result} onNavigateTab={navigate} />;

      case 'facts':
        return subTab === 'facts'
          ? <AnalysisFactView result={result} onGoToOptions={() => navigate('options')} />
          : <ProjectContextView context={context} setContext={setContext} issue={issue} setIssue={setIssue} onAnalyze={onRunAnalysis} isAnalyzing={isAnalyzing} currentScenarioTitle={currentScenarioTitle} isCustomScenario={isCustomScenario} onOpenScenarioManage={onOpenScenarioManage} onSaveCustomScenario={onSaveCustomScenario} onDeleteCustomScenario={onDeleteCustomScenario} lastSavedAt={lastSavedAt} />;

      case 'physics':
        return subTab === 'calculator'
          ? <>
              <div className="rounded-xl border border-cyan-800/40 bg-cyan-950/10 p-3 mb-2 text-[10px] text-cyan-200">
                <div className="flex items-center gap-2 font-semibold"><SlidersHorizontal className="w-3.5 h-3.5" /> 高级计算工具属于物理分析二级工具，不创建第二套工程事实。</div>
                <div className="mt-1 text-slate-400">主导机制、Verdict、Margin 与 Trace 仍以“主导机理 / Pattern”为唯一归属。</div>
              </div>
              <EngineeringCalculatorView context={context} issue={issue} setIssue={setIssue} />
            </>
          : <BldcPatternEngineView key={`patterns-${currentScenarioId}`} context={context} issue={issue} result={result} onGoToDecisions={() => navigate('cockpit')} />;

      case 'decision':
        return subTab === 'cockpit'
          ? <DecisionCockpitView key={`cockpit-${currentScenarioId}`} context={context} result={result} onGoToRecommendation={() => navigate('recommendation')} hwLeadStyle={hwLeadStyle || 'AGILE_DELIVERY'} onLeadStyleChange={onLeadStyleChange} recurrenceCount={recurrenceCount || 0} daysRemaining={daysRemaining} />
          : <OptionsComparisonView result={result} onGoToCockpit={() => navigate('cockpit')} />;

      case 'verification':
        return subTab === 'review'
          ? <DesignReviewRegressionView key={`review-${currentScenarioId}`} context={context} issue={issue} result={result} onLoadScenarioSection14={onLoadScenarioSection14} />
          : <VerificationLoopView key={`verification-${currentScenarioId}`} context={context} issue={issue} result={result} daysRemaining={daysRemaining || 14} />;

      case 'safety':
        return <FunctionalSafetyReliabilityView key={`safety-${currentScenarioId}`} context={context} issue={issue} result={result} onApplyMeasuredValues={(values, sourceLabel) => {
          // 函数式更新：一供/二供可能在同一 tick 连续回填，用闭包里的旧 issue 展开会丢掉前一次写入
          const enteredAt = new Date().toISOString();
          setIssue((prev) => {
            const measuredValues = { ...(prev.measuredValues || {}) };
            const measurementProvenance = { ...(prev.measurementProvenance || {}) };
            for (const [key, value] of Object.entries(values)) {
              measuredValues[key] = value;
              measurementProvenance[key] = { ...(measurementProvenance[key] || {}), source: 'DATASHEET', sourceLabel, enteredAt };
            }
            return { ...prev, measuredValues, measurementProvenance };
          });
        }} />;

      case 'delivery':
        return subTab === 'docs'
          ? <EngineeringDocsView result={result} context={context} issue={issue} />
          : <RecommendationRaciView context={context} issue={issue} result={result} onGoToDocs={() => navigate('docs')} />;

      default:
        return null;
    }
  };

  return (
    <div className="space-y-4">
      <WorkbenchHeader activeTab={activeTab} context={context} issue={issue} result={result} isAnalyzing={isAnalyzing} onWorkflowHelpChange={onWorkflowHelpChange} />
      {/* 全局提示只在这里各渲染一次（原先分散在 6 个视图里，每切一页重复出现）：
          结果来源（AI 推演 vs 确定性引擎）与"模板内容不是当前 case 结论"的提示。 */}
      {result && <ResultProvenanceBanner provenance={traceSummary.provenance} resultIsStale={props.resultIsStale} />}
      {templateNotice && (
        <TemplateContentNotice blocks={templateNotice.blocks} message={templateNotice.message} compact />
      )}
      <SubTabs main={activeTab} active={subTab} onChange={switchSub} />

      <EngineeringWorkflowHelpDrawer
        open={workflowHelpOpen}
        context={context}
        issue={issue}
        result={result}
        onClose={() => onWorkflowHelpChange(false)}
        onNavigateTab={(tab) => { onWorkflowHelpChange(false); navigate(tab); }}
      />

      {/* 以 工作台:二级页 为 key：某个二级页渲染崩溃时，切到别的二级页即可恢复，不必退出整个工作台 */}
      <PageErrorBoundary key={`${activeTab}:${subTab ?? '-'}`}>
        {renderBody()}
      </PageErrorBoundary>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-[10px] text-slate-500">
        <div className="flex items-center gap-2"><Database className="h-3.5 w-3.5 text-cyan-500" /><span>同一 context / issue / result 驱动所有工作台，跨页只引用，不复制主结论。</span></div>
        <div className="flex items-center gap-1.5 text-slate-600"><Layers3 className="h-3.5 w-3.5" /><span>7 个主工作台 · 二级工具收纳</span><ChevronRight className="h-3.5 w-3.5" /><ShieldCheck className="h-3.5 w-3.5 text-emerald-500" /><span>事实 / 证据 / 计算 / 决策分层</span></div>
      </div>
    </div>
  );
};

export default SeniorEngineeringWorkbenchView;
