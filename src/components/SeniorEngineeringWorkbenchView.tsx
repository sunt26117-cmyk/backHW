import React, { useEffect, useState } from 'react';
import { Database, Layers3, ChevronRight, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { ProjectContext, IssueInput, CopilotAnalysisResult, HwLeadStyle } from '../types';
import { FirstScreen10sView } from './FirstScreen10sView';
import { EngineeringWorkflowView } from './EngineeringWorkflowView';
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
import { resolveEngineeringDomain } from '../utils/scenarioDomainEngine';

import type { MainWorkbenchTab } from './workbenchNavigation';
export type { MainWorkbenchTab };
type SubTab = 'first' | 'workflow' | 'inputs' | 'facts' | 'patterns' | 'calculator' | 'options' | 'cockpit' | 'loop' | 'review' | 'raci' | 'docs';

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

const SUB_META: Record<MainWorkbenchTab, Array<{ id: SubTab; label: string }>> = {
  overview: [
    { id: 'first', label: '10 秒第一屏' },
    { id: 'workflow', label: '工程工作流' },
  ],
  facts: [
    { id: 'inputs', label: '工程输入' },
    { id: 'facts', label: '事实审计' },
  ],
  physics: [
    { id: 'patterns', label: '主导机理 / Pattern' },
    { id: 'calculator', label: '高级计算工具' },
  ],
  decision: [
    { id: 'options', label: '候选方案' },
    { id: 'cockpit', label: 'C-T-S-Q-L 决策' },
  ],
  verification: [
    { id: 'loop', label: '验证闭环 / VOI' },
    { id: 'review', label: '评审与回归' },
  ],
  safety: [],
  delivery: [
    { id: 'raci', label: 'RACI / 协同' },
    { id: 'docs', label: '受控文档' },
  ],
};

function WorkbenchHeader({ activeTab, context, issue, result }: Pick<Props, 'activeTab' | 'context' | 'issue' | 'result'>) {
  const domain = resolveEngineeringDomain(issue);
  const scenarioLabel = (result as any)?.__scenarioLabel || context.projectName || '当前工程';
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
          <span className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-slate-400">域：<b className="text-cyan-300">{domain}</b></span>
          <span className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-slate-400">阶段：<b className="text-slate-200">{context.projectPhase || 'DVT'}</b></span>
          <span className="rounded-md border border-emerald-700/40 bg-emerald-950/20 px-2 py-1 text-emerald-300">单一事实源</span>
        </div>
      </div>
      {activeTab !== 'overview' && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-800 pt-2 text-[10px] text-slate-500">
          <span className="font-semibold text-slate-400">信息归属：</span>
          <span>当前工作台负责本类工程事实/结论</span>
          <span className="text-slate-700">•</span>
          <span>其它工作台只引用，不重新生成同一主结论</span>
        </div>
      )}
    </div>
  );
}

function SubTabs({ active, tabs, onChange }: { active: SubTab; tabs: Array<{ id: SubTab; label: string }>; onChange: (tab: SubTab) => void }) {
  if (!tabs.length) return null;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-1 rounded-lg border border-slate-800 bg-slate-950/70 p-1.5">
      {tabs.map((tab) => (
        <button key={tab.id} type="button" onClick={() => onChange(tab.id)} className={`rounded-md px-3 py-1.5 text-[11px] font-medium transition cursor-pointer ${active === tab.id ? 'bg-blue-600/25 text-blue-300 border border-blue-500/40 shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/70'}`}>
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function mapNavigation(tabId: string, onNavigateMain: (tab: MainWorkbenchTab) => void, setSubTab: React.Dispatch<React.SetStateAction<SubTab>>) {
  switch (tabId) {
    case 'input': onNavigateMain('facts'); setSubTab('inputs'); break;
    case 'facts': onNavigateMain('facts'); setSubTab('facts'); break;
    case 'patterns': onNavigateMain('physics'); setSubTab('patterns'); break;
    case 'calc': onNavigateMain('physics'); setSubTab('calculator'); break;
    case 'options': onNavigateMain('decision'); setSubTab('options'); break;
    case 'cockpit': onNavigateMain('decision'); setSubTab('cockpit'); break;
    case 'verification': onNavigateMain('verification'); setSubTab('loop'); break;
    case 'review': onNavigateMain('verification'); setSubTab('review'); break;
    case 'safety': onNavigateMain('safety'); break;
    case 'recommendation': onNavigateMain('delivery'); setSubTab('raci'); break;
    case 'docs': onNavigateMain('delivery'); setSubTab('docs'); break;
    case 'overview': onNavigateMain('overview'); setSubTab('first'); break;
    // 旧「0. 工程工作流」页必须在 7 工作台里仍然可达：它是原 14 个一级页之一，
    // 包自己声称"不删除原有业务能力"，所以这里保留它的入口（见 verify-7-workbench-architecture）。
    case 'workflow': onNavigateMain('overview'); setSubTab('workflow'); break;
    default: onNavigateMain('overview'); break;
  }
}

export const SeniorEngineeringWorkbenchView: React.FC<Props> = (props) => {
  const {
    activeTab, context, setContext, issue, setIssue, result, currentScenarioId,
    currentScenarioTitle, isCustomScenario, isAnalyzing, lastSavedAt,
    hwLeadStyle, onLeadStyleChange, recurrenceCount, daysRemaining,
    onRunAnalysis, onOpenScenarioManage, onSaveCustomScenario, onDeleteCustomScenario,
    onLoadScenarioSection14, onNavigateMain,
  } = props;

  const [subTab, setSubTab] = useState<SubTab>(() => {
    switch (activeTab) {
      case 'overview': return 'first';
      case 'facts': return 'inputs';
      case 'physics': return 'patterns';
      case 'decision': return 'options';
      case 'verification': return 'loop';
      case 'delivery': return 'raci';
      default: return 'inputs';
    }
  });

  useEffect(() => {
    if (activeTab === 'overview' && !['first', 'workflow'].includes(subTab)) setSubTab('first');
    if (activeTab === 'facts' && !['inputs', 'facts'].includes(subTab)) setSubTab('inputs');
    if (activeTab === 'physics' && !['patterns', 'calculator'].includes(subTab)) setSubTab('patterns');
    if (activeTab === 'decision' && !['options', 'cockpit'].includes(subTab)) setSubTab('options');
    if (activeTab === 'verification' && !['loop', 'review'].includes(subTab)) setSubTab('loop');
    if (activeTab === 'delivery' && !['raci', 'docs'].includes(subTab)) setSubTab('raci');
  }, [activeTab, subTab]);

  const navigate = (tabId: string) => mapNavigation(tabId, onNavigateMain, setSubTab);

  return (
    <div className="space-y-4">
      <WorkbenchHeader activeTab={activeTab} context={context} issue={issue} result={result} />

      {activeTab === 'overview' && <>
        <SubTabs active={subTab} tabs={SUB_META.overview} onChange={setSubTab} />
        {subTab === 'workflow'
          ? <EngineeringWorkflowView context={context} issue={issue} result={result} onNavigateTab={navigate} />
          : <FirstScreen10sView context={context} issue={issue} result={result} onNavigateTab={navigate} />}
      </>}

      {activeTab === 'facts' && <>
        <SubTabs active={subTab} tabs={SUB_META.facts} onChange={setSubTab} />
        {subTab === 'inputs' && <ProjectContextView context={context} setContext={setContext} issue={issue} setIssue={setIssue} onAnalyze={onRunAnalysis} isAnalyzing={isAnalyzing} currentScenarioTitle={currentScenarioTitle} isCustomScenario={isCustomScenario} onOpenScenarioManage={onOpenScenarioManage} onSaveCustomScenario={onSaveCustomScenario} onDeleteCustomScenario={onDeleteCustomScenario} lastSavedAt={lastSavedAt} />}
        {subTab === 'facts' && <AnalysisFactView result={result} onGoToOptions={() => { onNavigateMain('decision'); setSubTab('options'); }} />}
      </>}

      {activeTab === 'physics' && <>
        <SubTabs active={subTab} tabs={SUB_META.physics} onChange={setSubTab} />
        {subTab === 'patterns' && <BldcPatternEngineView key={`patterns-${currentScenarioId}`} context={context} issue={issue} result={result} onGoToDecisions={() => { onNavigateMain('decision'); setSubTab('cockpit'); }} />}
        {subTab === 'calculator' && <>
          <div className="rounded-xl border border-cyan-800/40 bg-cyan-950/10 p-3 mb-2 text-[10px] text-cyan-200">
            <div className="flex items-center gap-2 font-semibold"><SlidersHorizontal className="w-3.5 h-3.5" /> 高级计算工具属于物理分析二级工具，不创建第二套工程事实。</div>
            <div className="mt-1 text-slate-400">主导机制、Verdict、Margin 与 Trace 仍以“主导机理 / Pattern”为唯一归属。</div>
          </div>
          <EngineeringCalculatorView context={context} issue={issue} setIssue={setIssue} />
        </>}
      </>}

      {activeTab === 'decision' && <>
        <SubTabs active={subTab} tabs={SUB_META.decision} onChange={setSubTab} />
        {subTab === 'options' && <OptionsComparisonView result={result} onGoToCockpit={() => setSubTab('cockpit')} />}
        {subTab === 'cockpit' && <DecisionCockpitView key={`cockpit-${currentScenarioId}`} result={result} onGoToRecommendation={() => onNavigateMain('delivery')} hwLeadStyle={hwLeadStyle || 'AGILE_DELIVERY'} onLeadStyleChange={onLeadStyleChange} recurrenceCount={recurrenceCount || 0} daysRemaining={daysRemaining} />}
      </>}

      {activeTab === 'verification' && <>
        <SubTabs active={subTab} tabs={SUB_META.verification} onChange={setSubTab} />
        {subTab === 'loop' && <VerificationLoopView key={`verification-${currentScenarioId}`} context={context} issue={issue} result={result} daysRemaining={daysRemaining || 14} />}
        {subTab === 'review' && <DesignReviewRegressionView key={`review-${currentScenarioId}`} context={context} issue={issue} result={result} onLoadScenarioSection14={onLoadScenarioSection14} />}
      </>}

      {activeTab === 'safety' && <FunctionalSafetyReliabilityView key={`safety-${currentScenarioId}`} context={context} issue={issue} result={result} onApplyMeasuredValues={(values, sourceLabel) => {
        const measuredValues = { ...(issue.measuredValues || {}) };
        const measurementProvenance = { ...(issue.measurementProvenance || {}) };
        for (const [key, value] of Object.entries(values)) {
          measuredValues[key] = value;
          measurementProvenance[key] = { ...(measurementProvenance[key] || {}), source: 'DATASHEET', sourceLabel, enteredAt: new Date().toISOString() };
        }
        setIssue({ ...issue, measuredValues, measurementProvenance });
      }} />}

      {activeTab === 'delivery' && <>
        <SubTabs active={subTab} tabs={SUB_META.delivery} onChange={setSubTab} />
        {subTab === 'raci' && <RecommendationRaciView context={context} issue={issue} result={result} onGoToDocs={() => setSubTab('docs')} />}
        {subTab === 'docs' && <EngineeringDocsView result={result} context={context} issue={issue} />}
      </>}

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-[10px] text-slate-500">
        <div className="flex items-center gap-2"><Database className="h-3.5 w-3.5 text-cyan-500" /><span>同一 context / issue / result 驱动所有工作台，跨页只引用，不复制主结论。</span></div>
        <div className="flex items-center gap-1.5 text-slate-600"><Layers3 className="h-3.5 w-3.5" /><span>7 个主工作台 · 二级工具收纳</span><ChevronRight className="h-3.5 w-3.5" /><ShieldCheck className="h-3.5 w-3.5 text-emerald-500" /><span>事实 / 证据 / 计算 / 决策分层</span></div>
      </div>
    </div>
  );
};

export default SeniorEngineeringWorkbenchView;
