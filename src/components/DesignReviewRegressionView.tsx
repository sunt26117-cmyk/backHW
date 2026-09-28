/**
 * Design Review Mode / Worst Case Engine / Component Change Impact / Gold Standard Cases (Section 10, 13, 14)
 * 严格遵照 V4 规范：
 * 1. 阶段性设计评审检查清单 (Concept / EVT / DVT / PVT / SOP)
 * 2. 最坏情况引擎 (Worst Case Candidate 标注)
 * 3. 器件变更影响分析 (涵盖电气/热/EMC/安全/可靠性/必须重做的测试)
 * 4. 自动化回归测试用例 (Case01 ~ Case14) 与 Section 14 验收场景专项演练
 */

import React, { useState } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  Layers,
  Activity,
  Cpu,
  FileCheck,
  Search,
  Sparkles,
  Sliders,
  Play,
  RotateCcw,
  ShieldAlert,
  ArrowRight,
} from 'lucide-react';
import {
  SYSTEM_REGRESSION_CASES,
  runSystemRegressionCase,
} from '../data/systemRegressionCases';
import { PhaseCheckItem, ComponentChangeImpactItem, ProjectContext, IssueInput, CopilotAnalysisResult } from '../types';
import { derivePhaseChecklist, deriveWorstCases, deriveComponentChangeImpact } from '../utils/scenarioDerived';

interface DesignReviewRegressionViewProps {
  context: ProjectContext;
  issue: IssueInput;
  result: CopilotAnalysisResult | null;
  onLoadScenarioSection14?: () => void;
}

export const DesignReviewRegressionView: React.FC<DesignReviewRegressionViewProps> = ({
  context,
  issue,
  result,
  onLoadScenarioSection14,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<
    'DESIGN_REVIEW' | 'WORST_CASE' | 'COMPONENT_CHANGE' | 'GOLD_CASES'
  >('DESIGN_REVIEW');

  // 评审阶段：优先跟随当前典型工况对应阶段。
  const normalizedPhase: 'Concept' | 'EVT' | 'DVT' | 'PVT' | 'SOP' =
    ['Concept', 'EVT', 'DVT', 'PVT', 'SOP'].includes(context.projectPhase)
      ? (context.projectPhase as 'Concept' | 'EVT' | 'DVT' | 'PVT' | 'SOP')
      : 'DVT';
  const [selectedPhase, setSelectedPhase] = useState<'Concept' | 'EVT' | 'DVT' | 'PVT' | 'SOP'>(normalizedPhase);
  React.useEffect(() => {
    setSelectedPhase(normalizedPhase);
  }, [normalizedPhase]);
  const reviewChecklist = derivePhaseChecklist(selectedPhase, context, issue, result);

  // 最坏情况候选：以当前工况重新生成上下文，不再固定显示 Section 14 基准
  const worstCases = deriveWorstCases(context, issue, result);

  // 器件变更分析
  const derivedComponent: ComponentChangeImpactItem['componentCategory'] = issue.issueCategories?.includes('Component Alternative')
    ? 'MOSFET'
    : issue.issueCategories?.includes('EMC')
    ? 'SNUBBER'
    : issue.issueCategories?.includes('WCCA')
    ? 'CURRENT_SENSOR'
    : 'MCU';
  const [selectedComponent, setSelectedComponent] = useState<ComponentChangeImpactItem['componentCategory']>(derivedComponent);
  React.useEffect(() => {
    setSelectedComponent(derivedComponent);
  }, [derivedComponent]);
  const changeImpact = deriveComponentChangeImpact(context, issue, result, selectedComponent);

  // 系统回归：只验证“代码修改后系统行为是否保持”，不再把 BLDC 工程案例复制一套到这里。
  const [regressionResults, setRegressionResults] = useState<Record<string, 'PASS' | 'FAIL'>>({});
  const [regressionDetails, setRegressionDetails] = useState<Record<string, { summary: string; details: string[] }>>({});
  const [activeCaseId, setActiveCaseId] = useState<string>('R01');

  const handleRunAllRegressions = () => {
    const results: Record<string, 'PASS' | 'FAIL'> = {};
    const details: Record<string, { summary: string; details: string[] }> = {};
    SYSTEM_REGRESSION_CASES.forEach((c) => {
      const res = runSystemRegressionCase(c.id);
      results[c.id] = res.status;
      details[c.id] = { summary: res.summary, details: res.details };
    });
    setRegressionResults(results);
    setRegressionDetails(details);
  };

  const selectedCase = SYSTEM_REGRESSION_CASES.find((c) => c.id === activeCaseId) || SYSTEM_REGRESSION_CASES[0];
  const selectedResult = regressionDetails[activeCaseId];

  return (
    <div className="space-y-6">
      {/* 顶部 Section 14 验收场景快捷触发横幅 */}
      <div className="bg-gradient-to-r from-blue-950/60 via-slate-900 to-slate-900 border border-blue-500/40 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
              SECTION 14 验收场景基准
            </span>
            <span className="text-xs text-slate-300 font-semibold">
              {context.projectName} ｜ {context.projectPhase} ｜ {context.asilLevel} ｜ 距节点 {context.daysRemaining} 天
            </span>
          </div>
          <p className="text-xs text-slate-400">
            当前问题：{issue.failurePhenomenon || issue.engineeringConcern}；评审数据按当前典型工况重新映射。
          </p>
        </div>
        {onLoadScenarioSection14 && (
          <button
            onClick={onLoadScenarioSection14}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition shadow cursor-pointer shrink-0"
          >
            <Sparkles className="w-4 h-4" />
            <span>载入并演练验收场景</span>
          </button>
        )}
      </div>

      {/* 子导航 */}
      <div className="flex border-b border-slate-800 space-x-2 text-xs overflow-x-auto pb-2 scrollbar-none">
        {[
          { id: 'DESIGN_REVIEW', label: '1. 阶段性设计评审 (Concept~SOP)' },
          { id: 'WORST_CASE', label: '2. 最坏情况引擎 (Worst Case Engine)' },
          { id: 'COMPONENT_CHANGE', label: '3. 器件变更影响分析 (Change Impact)' },
          { id: 'GOLD_CASES', label: '4. 系统回归中心 (R01~R08)' },
        ].map((sub) => (
          <button
            key={sub.id}
            onClick={() => setActiveSubTab(sub.id as any)}
            className={`px-3 py-2 rounded-lg font-medium whitespace-nowrap transition cursor-pointer ${
              activeSubTab === sub.id
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            {sub.label}
          </button>
        ))}
      </div>

      {/* 1. 阶段性设计评审 */}
      {activeSubTab === 'DESIGN_REVIEW' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-blue-400" />
                <span>阶段性设计评审检查清单 (Phase Review Checklist)</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                按 Concept / EVT / DVT / PVT / SOP 生命全周期严格核查，杜绝未关闭缺陷流转至下一阶段。
              </p>
            </div>

            {/* 阶段切换按钮 */}
            <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800 gap-1">
              {(['Concept', 'EVT', 'DVT', 'PVT', 'SOP'] as const).map((ph) => (
                <button
                  key={ph}
                  onClick={() => setSelectedPhase(ph)}
                  className={`px-3 py-1 rounded text-xs font-medium transition cursor-pointer ${
                    selectedPhase === ph
                      ? 'bg-blue-600 text-white font-bold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {ph}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            {reviewChecklist.map((item, idx) => (
              <div
                key={idx}
                className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded font-mono text-[10px] bg-slate-800 text-slate-300 font-bold">
                      {item.category}
                    </span>
                    <span className="text-white font-semibold">{item.checkpoint}</span>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold ${
                      item.status === 'COMPLIANT'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : item.status === 'CRITICAL_RISK'
                        ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    }`}
                  >
                    {item.status}
                  </span>
                </div>

                <div className="text-slate-400 font-mono text-[11px]">
                  参考车规标准条款: <span className="text-slate-300">{item.standardClause}</span>
                </div>
                <div className="bg-slate-900/70 p-2.5 rounded border border-slate-800 text-slate-300">
                  评审工程纪要: {item.notes}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2. 最坏情况引擎 */}
      {activeSubTab === 'WORST_CASE' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <span>最坏情况引擎 (Worst Case Engine)</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                组合 VBUS最高 / 环温最高 / 电流最高 / RPM最高 / J最高 / 器件负公差，推演极端应力。
              </p>
            </div>
            <span className="text-xs px-2.5 py-1 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono font-bold">
              CANDIDATE_UNVERIFIED
            </span>
          </div>

          <div className="space-y-4">
            {worstCases.map((wc) => (
              <div
                key={wc.id}
                className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs space-y-3"
              >
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="font-bold text-white text-xs">{wc.name}</span>
                  <span className="text-[10px] text-amber-400 font-mono px-2 py-0.5 rounded bg-amber-500/20 border border-amber-500/30">
                    {wc.tag} (需实验验证闭环)
                  </span>
                </div>

                {/* 条件组合 */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-[11px] bg-slate-900/60 p-3 rounded border border-slate-800">
                  <div>母线条件: <span className="text-cyan-300">{wc.vbusCondition}</span></div>
                  <div>环境温度: <span className="text-amber-300">{wc.ambientTempCondition}</span></div>
                  <div>负载转速: <span className="text-purple-300">{wc.rpmCondition}</span></div>
                  <div>器件容差: <span className="text-slate-300">{wc.componentToleranceCondition}</span></div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div className="bg-red-950/30 border border-red-500/30 p-2.5 rounded">
                    <div className="font-bold text-red-300 mb-1">组合峰值应力推演</div>
                    <div className="text-red-200">{wc.combinedPeakStress}</div>
                    <div className="text-[11px] text-red-400 mt-1">{wc.marginToAbsoluteMax}</div>
                  </div>

                  <div className="bg-blue-950/30 border border-blue-500/30 p-2.5 rounded">
                    <div className="font-bold text-blue-300 mb-1">闭环验证要求 (转入实测)</div>
                    <div className="text-blue-200">{wc.verificationRequired}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. 器件变更影响分析 */}
      {activeSubTab === 'COMPONENT_CHANGE' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Cpu className="w-4 h-4 text-purple-400" />
                <span>器件变更影响与必须重做测试分析 (Component Change Impact)</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                任何核心物料变更，自动分析电气/热/EMC/安全/控制多维影响，回答“哪些测试必须重做”。
              </p>
            </div>

            {/* 器件类型切换 */}
            <select
              value={selectedComponent}
              onChange={(e) => setSelectedComponent(e.target.value as any)}
              className="bg-slate-950 text-white text-xs px-3 py-1.5 rounded-lg border border-slate-700 cursor-pointer font-medium"
            >
              <option value="MOSFET">功率 MOSFET (分立管)</option>
              <option value="GATE_DRIVER">Gate Driver (栅极预驱芯片)</option>
              <option value="SHUNT_RESISTOR">Current Shunt (低阻分流电阻)</option>
              <option value="TVS_DIODE">TVS Diode (瞬态抑制二极管)</option>
              <option value="DC_LINK_CAP">DC-Link (母线储能去耦电容)</option>
              <option value="MCU">MCU (主控微处理器)</option>
            </select>
          </div>

          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs space-y-3">
            <div className="font-bold text-white text-sm">{changeImpact.changeDescription}</div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="bg-slate-900/80 p-3 rounded border border-slate-800">
                <div className="font-bold text-cyan-400 mb-1">电气与热影响</div>
                <div className="text-slate-300 mb-1.5">{changeImpact.electricalImpact}</div>
                <div className="text-slate-400">{changeImpact.thermalImpact}</div>
              </div>

              <div className="bg-slate-900/80 p-3 rounded border border-slate-800">
                <div className="font-bold text-amber-400 mb-1">EMC 与控制算法影响</div>
                <div className="text-slate-300 mb-1.5">{changeImpact.emcImpact}</div>
                <div className="text-slate-400">{changeImpact.controlImpact}</div>
              </div>

              <div className="bg-slate-900/80 p-3 rounded border border-slate-800">
                <div className="font-bold text-purple-400 mb-1">功能安全与寿命影响</div>
                <div className="text-slate-300 mb-1.5">{changeImpact.safetyImpact}</div>
                <div className="text-slate-400">{changeImpact.reliabilityImpact}</div>
              </div>
            </div>

            {/* 必须重做的测试清单 */}
            <div className="bg-red-950/20 border border-red-500/40 p-3.5 rounded-lg">
              <div className="font-bold text-red-300 mb-2 flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-red-400" />
                <span>强制重做测试清单 (Mandatory Retests - 不可豁免):</span>
              </div>
              <ul className="space-y-1.5 text-xs text-red-200 list-disc list-inside">
                {changeImpact.mandatoryRetests.map((t, idx) => (
                  <li key={idx} className="font-mono">{t}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      <div className="bg-slate-950 border border-cyan-500/20 rounded-xl p-4">
        <div className="text-xs text-cyan-300 font-semibold">当前典型工况回归主线</div>
        <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
          <div className="bg-slate-900 p-3 rounded border border-slate-800"><span className="text-slate-500">工程</span><div className="text-white mt-1">{context.projectName}</div></div>
          <div className="bg-slate-900 p-3 rounded border border-slate-800"><span className="text-slate-500">当前失效</span><div className="text-white mt-1">{(issue.failurePhenomenon || issue.engineeringConcern || '待确认').slice(0, 120)}</div></div>
          <div className="bg-slate-900 p-3 rounded border border-slate-800"><span className="text-slate-500">回归门禁</span><div className="text-white mt-1">{context.nextMilestone} · {context.daysRemaining} 天</div></div>
        </div>
      </div>

      {/* 4. 系统回归中心 */}
      {activeSubTab === 'GOLD_CASES' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-cyan-400" />
                <span>系统回归中心 (System Regression Center)</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                不再重复维护 BLDC 工程案例。这里验证代码修改后：输入传递、缺参门禁、场景切换、VETO 与 AI Grounding 是否保持正确。
              </p>
            </div>
            <button
              onClick={handleRunAllRegressions}
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition shadow cursor-pointer shrink-0"
            >
              <Play className="w-3.5 h-3.5" />
              运行 R01~R08
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
            <div className="space-y-2">
              {SYSTEM_REGRESSION_CASES.map((c) => {
                const status = regressionResults[c.id];
                return (
                  <button
                    key={c.id}
                    onClick={() => setActiveCaseId(c.id)}
                    className={`w-full text-left p-3 rounded-lg border transition cursor-pointer ${
                      activeCaseId === c.id
                        ? 'bg-blue-950/40 border-blue-500/50'
                        : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px] font-bold text-cyan-300">{c.id}</span>
                      <span className={`text-[10px] font-bold ${
                        status === 'PASS' ? 'text-emerald-400' : status === 'FAIL' ? 'text-red-400' : 'text-slate-500'
                      }`}>
                        {status || '未运行'}
                      </span>
                    </div>
                    <div className="text-xs text-slate-200 mt-1">{c.title}</div>
                    <div className="text-[10px] text-slate-500 mt-1">{c.category}</div>
                  </button>
                );
              })}
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-cyan-300">{selectedCase.id}</span>
                  <span className="text-sm font-bold text-white">{selectedCase.title}</span>
                </div>
                <p className="text-xs text-slate-400 mt-2">{selectedCase.purpose}</p>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
                <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">本次回归实际执行结果</div>
                {selectedResult ? (
                  <>
                    <div className={`text-sm font-bold ${regressionResults[selectedCase.id] === 'PASS' ? 'text-emerald-400' : 'text-red-400'}`}>
                      {regressionResults[selectedCase.id]}
                    </div>
                    <div className="text-xs text-slate-300 mt-2 font-mono leading-relaxed">{selectedResult.summary}</div>
                    {selectedResult.details.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {selectedResult.details.map((d, i) => (
                          <div key={i} className="text-[11px] text-slate-400">• {d}</div>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-xs text-slate-500">尚未运行。点击“运行 R01~R08”执行真实回归。</div>
                )}
              </div>

              <div className="bg-blue-950/20 border border-blue-500/20 rounded-lg p-3 text-xs text-slate-300">
                <div className="font-bold text-blue-300 mb-2">职责边界</div>
                <div>BLDC P001~P018：验证“会不会做工程分析”。</div>
                <div>工程 Gold Case：验证真实工程场景/案例基准。</div>
                <div>R01~R08：验证“改代码以后有没有把系统行为改坏”。</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
