/**
 * BLDC Problem Pattern Engine View (Section 4 & 4.1)
 * 涵盖 P001 ~ P018 全部 18 个确定性失效模式与物理链条
 * 包含 P016 (保护时序 vs SOA)、P017 (电流采样三架构对比)、P018 (四级堵转状态机)
 */

import React, { useState, useMemo } from 'react';
import {
  Zap,
  Activity,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Cpu,
  Layers,
  Sliders,
  ShieldAlert,
  ArrowRight,
  Info,
  Check,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  evaluateAllBldcPatterns,
  BldcEvaluationInput,
} from '../data/bldcPatternEngine';
import { BldcPatternId, ProjectContext, IssueInput, CopilotAnalysisResult } from '../types';
import { deriveBldcEvaluationInput } from '../utils/scenarioDerived';
import { calculateDomainMetrics, getDomainDataQuality, getDomainPhysics, resolveEngineeringDomain } from '../utils/scenarioDomainEngine';

interface BldcPatternEngineViewProps {
  context: ProjectContext;
  issue: IssueInput;
  result: CopilotAnalysisResult | null;
  onGoToDecisions: () => void;
}

export const BldcPatternEngineView: React.FC<BldcPatternEngineViewProps> = ({
  context,
  issue,
  result,
  onGoToDecisions,
}) => {
  // 由当前典型工况自动映射初始物理参数；用户仍可手工微调。
  const scenarioDomainKey = resolveEngineeringDomain(issue);
  const isBldcScenario = scenarioDomainKey === 'BLDC';
  const hasUsableBldcInputs = issue.measuredValueSource === 'BENCHMARK' || ['rpm','busVoltagePeakV','vdsRatingV','currentPeakA'].every((key) => Number.isFinite(Number(issue.measuredValues?.[key]))) || /\b\d+(?:\.\d+)?\s*rpm/i.test(`${issue.testCondition} ${issue.actualMeasurement}`);
  const derivedParams = useMemo(() => deriveBldcEvaluationInput(context, issue), [context, issue]);
  const [params, setParams] = useState<BldcEvaluationInput>(derivedParams);

  React.useEffect(() => {
    setParams(derivedParams);
  }, [derivedParams]);

  const [selectedPatternId, setSelectedPatternId] = useState<BldcPatternId>('P001');
  const [filterMode, setFilterMode] = useState<'ALL' | 'TRIGGERED' | 'VETO'>('ALL');

  const patternResults = useMemo(() => {
    if (!isBldcScenario) return [];
    if (!hasUsableBldcInputs) return [];
    return evaluateAllBldcPatterns(params);
  }, [params, isBldcScenario, hasUsableBldcInputs]);

  const filteredPatterns = useMemo(() => {
    if (filterMode === 'TRIGGERED') {
      return patternResults.filter((p) => p.triggered);
    }
    if (filterMode === 'VETO') {
      return patternResults.filter((p) => p.vetoTriggered);
    }
    return patternResults;
  }, [patternResults, filterMode]);

  const activePattern = useMemo(() => {
    return patternResults.find((p) => p.id === selectedPatternId) || patternResults[0];
  }, [patternResults, selectedPatternId]);

  const scenarioCategory = issue.issueCategories?.[0] || 'Other';
  const scenarioDomain = useMemo(() => getDomainPhysics(issue), [issue]);
  const domainMetrics = useMemo(() => calculateDomainMetrics(issue, context), [issue, context]);

  if (!isBldcScenario) {
    return (
      <div className="space-y-6">
        <div className="bg-blue-950/30 border border-blue-500/30 rounded-xl p-5">
          <div className="flex items-center justify-between gap-4">
            <div><div className="text-xs text-blue-300 font-semibold">当前典型工况 · {context.projectName}</div><h1 className="text-lg font-bold text-white mt-1">{scenarioDomain.title}</h1><div className="text-xs text-slate-400 mt-1">{scenarioDomainKey} · {context.projectPhase} · {context.asilLevel} · 结果来源：专家规则 + 当前工况输入 + 实测回填</div></div>
            <div className="text-right"><div className="text-[11px] text-slate-500">风险</div><div className="font-mono font-bold text-amber-300">{result?.riskRatings.overallRisk || '—'} / {result?.riskRatings.overallRiskScore ?? '—'}</div></div>
          </div>
          <div className="mt-3 bg-slate-950/70 border border-slate-800 rounded-lg p-3 text-xs text-slate-200">{scenarioDomain.chain}</div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4"><div className="text-[10px] text-slate-500 mb-2">MEASURED · 当前输入</div><div className="flex flex-wrap gap-1.5">{Object.entries(issue.measuredValues || {}).filter(([,v]) => v !== '' && v !== null && v !== undefined).map(([k,v]) => <span key={k} className="px-2 py-1 rounded bg-emerald-950/60 border border-emerald-800/40 text-[10px] text-emerald-300 font-mono">{k}={String(v)}</span>)}{!Object.keys(issue.measuredValues || {}).length && <span className="text-xs text-amber-300">暂无结构化实测值</span>}</div></div>
          <div className="bg-slate-900 border border-cyan-800/30 rounded-xl p-4"><div className="text-[10px] text-slate-500 mb-2">计算结果 / EVIDENCE</div><div className="text-xs text-slate-300">{(Array.isArray(result?.analysisBasis?.calculatedOutputs) ? result?.analysisBasis?.calculatedOutputs : result?.analysisBasis?.calculatedOutputs ? [String(result.analysisBasis.calculatedOutputs)] : []).join(' · ') || '基于当前输入运行确定性规则'}</div></div>
          <div className="bg-slate-900 border border-amber-800/30 rounded-xl p-4"><div className="text-[10px] text-slate-500 mb-2">ASSUMPTION / UNKNOWN</div><div className="text-xs text-slate-300">{(Array.isArray(result?.unknowns) ? result.unknowns.slice(0,2).map(String) : result?.unknowns ? [String(result.unknowns)] : []).join('；') || '当前暂无高优先级未知项'}</div></div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h2 className="text-sm font-bold text-white mb-3">当前工况关键计算结果（由输入值驱动）</h2>
          {domainMetrics.length ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
              {domainMetrics.slice(0, 8).map((m) => (
                <div key={`${m.label}-${m.value}`} className="bg-slate-950 border border-slate-800 rounded-lg p-3">
                  <div className="flex items-center justify-between gap-2"><div className="text-[10px] text-slate-500">{m.label}</div><span className={`text-[9px] px-1.5 py-0.5 rounded border ${m.tag === 'MEASURED' ? 'text-emerald-300 border-emerald-800 bg-emerald-950/30' : m.tag === 'BENCHMARK' ? 'text-violet-300 border-violet-800 bg-violet-950/30' : m.tag === 'SPEC' ? 'text-amber-300 border-amber-800 bg-amber-950/30' : 'text-cyan-300 border-cyan-800 bg-cyan-950/30'}`}>{m.tag}</span></div>
                  <div className="text-sm font-mono font-semibold text-cyan-300 mt-1">{m.value}</div>
                  <div className="text-[10px] text-slate-500 mt-1 leading-relaxed">{m.note}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-amber-800/50 bg-amber-950/20 p-4 text-xs text-amber-200">当前工况尚无足够结构化数据；先在“1.统一工程输入”补充该场景的实测/规格数据，再运行确定性计算。</div>
          )}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5"><h2 className="text-sm font-bold text-white mb-3">当前工况确定性计算框架</h2><div className="space-y-2">{scenarioDomain.formulas.map((x,i)=><div key={i} className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs text-slate-300"><span className="text-cyan-300 font-mono mr-2">{i+1}</span>{x}</div>)}</div>{(result?.physicalMechanism.keyPhysicalFactors || []).length>0 && <div className="mt-4"><div className="text-xs font-semibold text-slate-400 mb-2">当前工况关键物理因子</div>{(result?.physicalMechanism.keyPhysicalFactors || []).slice(0,6).map((f,i)=><div key={i} className="text-xs text-slate-300 border-l-2 border-cyan-500/40 pl-3 mb-2"><b>{f.factor}</b>：{f.description}</div>)}</div>}<div className="mt-4 bg-cyan-950/20 border border-cyan-900/50 rounded-lg p-3 text-xs text-cyan-100"><b>工程输出：</b>{scenarioDomain.outputs.join(' · ')}</div></div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5"><h2 className="text-sm font-bold text-white mb-3">当前工况验证闭环</h2><div className="space-y-2">{scenarioDomain.tests.map((x,i)=><div key={i} className="text-xs text-slate-300 bg-slate-950 rounded-lg p-3 border border-slate-800"><span className="text-emerald-400 mr-2">✓</span>{x}</div>)}</div><div className="mt-4 text-xs text-slate-300 bg-slate-950/60 border border-slate-800 rounded-lg p-3">根因：{result?.physicalMechanism.rootCauseAnalysis || issue.engineeringConcern}</div><div className="mt-3"><div className="text-[10px] text-slate-500 mb-1">当前已录入结构化实测值</div><div className="flex flex-wrap gap-1.5">{Object.entries(issue.measuredValues || {}).filter(([,v]) => v !== '' && v !== null && v !== undefined).map(([k,v]) => <span key={k} className="px-2 py-1 rounded bg-slate-950 border border-slate-800 text-[10px] font-mono text-emerald-300">MEASURED · {k}={String(v)}</span>)}{!Object.entries(issue.measuredValues || {}).some(([,v]) => v !== '' && v !== null && v !== undefined) && <span className="text-[10px] text-slate-500">暂无结构化实测值，请在 1.统一工程输入 回填</span>}</div></div></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 顶部标题与原则 */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                确定性物理计算引擎
              </span>
              <span className="text-xs text-slate-400 font-mono">18 BLDC Problem Patterns · 输入驱动</span>
            </div>
            <h1 className="text-lg font-bold text-white flex items-center gap-2">
              <span>BLDC 硬件问题模式引擎 (P001 ~ P018)</span>
              <span className="text-xs font-normal text-slate-400">
                — 严格物理机制推导，绝不依赖关键词匹配
              </span>
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setFilterMode('ALL')}
              className={`px-3 py-1 rounded text-xs font-medium cursor-pointer transition ${
                filterMode === 'ALL'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              全部模式 ({patternResults.length})
            </button>
            <button
              onClick={() => setFilterMode('TRIGGERED')}
              className={`px-3 py-1 rounded text-xs font-medium cursor-pointer transition ${
                filterMode === 'TRIGGERED'
                  ? 'bg-amber-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              已触发风险 ({patternResults.filter((p) => p.triggered).length})
            </button>
            <button
              onClick={() => setFilterMode('VETO')}
              className={`px-3 py-1 rounded text-xs font-medium cursor-pointer transition ${
                filterMode === 'VETO'
                  ? 'bg-red-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              一票否决 VETO ({patternResults.filter((p) => p.vetoTriggered).length})
            </button>
          </div>
        </div>
      </div>

      <div className="bg-blue-950/30 border border-blue-500/30 rounded-xl p-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-blue-300 font-semibold">当前典型工况</span>
          <span className="text-white font-medium">{context.projectName}</span>
          <span className="text-slate-400">{context.projectPhase} · {context.asilLevel} · 剩余 {context.daysRemaining} 天</span>
        </div>
        <div className="mt-1 text-slate-400 line-clamp-2">{issue.failurePhenomenon || issue.engineeringConcern}</div>
        {result?.riskRatings && (
          <div className="mt-1 text-slate-500">分析风险：{result.riskRatings.overallRisk} / {result.riskRatings.overallRiskScore}</div>
        )}
      </div>
      {(() => {
        const q = getDomainDataQuality(issue);
        const pct = q.requiredCount ? Math.round(q.requiredDone / q.requiredCount * 100) : 100;
        return <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 text-xs">
          <div className="flex items-center justify-between gap-3"><span className="text-slate-300 font-semibold">输入证据完整度</span><span className="font-mono text-cyan-300">{q.requiredDone}/{q.requiredCount} 必填 · {pct}%</span></div>
          <div className="mt-2 h-1.5 bg-slate-800 rounded overflow-hidden"><div className="h-full bg-cyan-500" style={{width:`${pct}%`}} /></div>
          <div className="mt-2 text-[10px] text-slate-500">MEASURED 来自工程师回填/导入；SPEC 来自要求；CALCULATED 由规则引擎计算，三者不会互相冒充。</div>
          {q.missingRequired.length > 0 && <div className="mt-1 text-[10px] text-amber-300">待补：{q.missingRequired.join('、')}</div>}
        </div>;
      })()}

      {!hasUsableBldcInputs && (
        <div className="bg-amber-950/30 border border-amber-700/40 rounded-xl p-4 text-xs text-amber-100">
          <div className="font-semibold text-amber-300">当前证据源提示：P001~P018 只使用当前结构化输入/基准演示数据</div>
          <div className="mt-1 leading-relaxed">请在 1. 统一工程输入提供至少：转速、母线/供电边界、Vds 额定值、峰值电流；其余 Rg、Cgd、dv/dt、Tj 等参数可继续补充。BENCHMARK 仅用于演示，正式项目请覆盖为 USER_MEASURED / IMPORTED。系统不会把缺失项目凭空算成实测值。</div>
        </div>
      )}

      {/* 实时参数调谐面板 */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
          <Sliders className="w-4 h-4 text-blue-400" />
          <span>核心电气与电机驱动变量实时调谐 (输入驱动确定性公式)</span>
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
          <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
            <label className="text-[11px] text-slate-400 block mb-1">电机转速 RPM</label>
            <input
              type="number"
              value={params.rpm}
              onChange={(e) => setParams({ ...params, rpm: Number(e.target.value) })}
              className="w-full bg-slate-900 text-white font-mono px-2 py-1 rounded border border-slate-700"
            />
          </div>
          <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
            <label className="text-[11px] text-slate-400 block mb-1">标称母线电压 (V)</label>
            <input
              type="number"
              step="0.1"
              value={params.vbusNominal}
              onChange={(e) => setParams({ ...params, vbusNominal: Number(e.target.value) })}
              className="w-full bg-slate-900 text-white font-mono px-2 py-1 rounded border border-slate-700"
            />
          </div>
          <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
            <label className="text-[11px] text-slate-400 block mb-1">MOS 耐压 Vds_rating (V)</label>
            <input
              type="number"
              value={params.vdsRating}
              onChange={(e) => setParams({ ...params, vdsRating: Number(e.target.value) })}
              className="w-full bg-slate-900 text-white font-mono px-2 py-1 rounded border border-slate-700"
            />
          </div>
          <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
            <label className="text-[11px] text-slate-400 block mb-1">母线去耦 Cbus (μF)</label>
            <input
              type="number"
              value={params.cbusUf}
              onChange={(e) => setParams({ ...params, cbusUf: Number(e.target.value) })}
              className="w-full bg-slate-900 text-white font-mono px-2 py-1 rounded border border-slate-700"
            />
          </div>
          <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
            <label className="text-[11px] text-slate-400 block mb-1">开关节点 dv/dt (V/ns)</label>
            <input
              type="number"
              step="0.5"
              value={params.dvDtVns}
              onChange={(e) => setParams({ ...params, dvDtVns: Number(e.target.value) })}
              className="w-full bg-slate-900 text-white font-mono px-2 py-1 rounded border border-slate-700"
            />
          </div>
          <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
            <label className="text-[11px] text-slate-400 block mb-1">死区时间 DeadTime (ns)</label>
            <input
              type="number"
              value={params.deadTimeNs}
              onChange={(e) => setParams({ ...params, deadTimeNs: Number(e.target.value) })}
              className="w-full bg-slate-900 text-white font-mono px-2 py-1 rounded border border-slate-700"
            />
          </div>
        </div>
      </div>

      {/* 主布局：左侧模式列表 + 右侧详情 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* 左侧列表 (5列) */}
        <div className="lg:col-span-5 space-y-2">
          <div className="text-xs font-semibold text-slate-400 mb-2 px-1">
            模式清单 (点击查看物理公式与对策)
          </div>
          <div className="space-y-1.5 max-h-[600px] overflow-y-auto pr-1">
            {filteredPatterns.map((pattern) => {
              const isSelected = pattern.id === selectedPatternId;
              return (
                <button
                  key={pattern.id}
                  onClick={() => setSelectedPatternId(pattern.id)}
                  className={`w-full p-3 rounded-lg border text-left transition cursor-pointer flex items-start justify-between gap-2 ${
                    isSelected
                      ? 'bg-blue-600/20 border-blue-500 text-white'
                      : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800/60'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-cyan-400">{pattern.id}</span>
                      <span className="text-xs font-medium">{pattern.name}</span>
                    </div>
                    <div className="text-[11px] text-slate-400 line-clamp-1">
                      {pattern.corePhysicalChain}
                    </div>
                  </div>

                  <div className="shrink-0 flex flex-col items-end gap-1">
                    {pattern.vetoTriggered ? (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-300 border border-red-500/40">
                        VETO
                      </span>
                    ) : pattern.triggered ? (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        TRIGGERED
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-400">
                        SAFE
                      </span>
                    )}
                    <span className="text-[10px] font-mono text-slate-500">
                      {pattern.evidenceType}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 右侧详情 (7列) */}
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-5">
          {/* 模式标题区 */}
          <div className="border-b border-slate-800 pb-4">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded font-mono font-bold text-sm bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                  {activePattern.id}
                </span>
                <h2 className="text-base font-bold text-white">{activePattern.name}</h2>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 font-mono">
                  证据: {activePattern.evidenceType}
                </span>
                <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 font-mono">
                  置信度: {activePattern.confidence}
                </span>
              </div>
            </div>

            {/* VETO 警戒条 */}
            {activePattern.vetoTriggered && (
              <div className="bg-red-950/60 border border-red-500/60 rounded-lg p-3 text-xs text-red-200 flex items-start gap-2.5 mt-3">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-red-300 font-semibold">触发一票否决 (CRITICAL VETO)：</strong>
                  <span className="mt-0.5 block">{activePattern.vetoReason}</span>
                </div>
              </div>
            )}
          </div>

          {/* 核心物理链条 */}
          <div>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-blue-400" />
              <span>核心物理链条 (Physical Mechanism Chain)</span>
            </h3>
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-xs text-slate-200 leading-relaxed font-mono">
              {activePattern.corePhysicalChain}
            </div>
          </div>

          {/* 物理计算输出表格 (严禁交由 LLM 直接给出，由确定性引擎计算) */}
          <div>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>确定性物理计算输出 (Deterministic Engine Computed)</span>
            </h3>
            <div className="bg-slate-950 rounded-lg border border-slate-800 overflow-hidden text-xs">
              <table className="w-full text-left">
                <tbody>
                  {Object.entries(activePattern.calculatedValues).map(([key, value], idx) => (
                    <tr
                      key={idx}
                      className={`border-b border-slate-800/80 ${idx % 2 === 0 ? 'bg-slate-950' : 'bg-slate-900/40'}`}
                    >
                      <td className="px-3 py-2 text-slate-400 font-medium">{key}</td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-cyan-300">{String(value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 典型候选对策与副作用矩阵 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800">
              <div className="text-xs font-bold text-emerald-400 mb-2 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> 推荐候选对策
              </div>
              <ul className="space-y-1.5 text-xs text-slate-300 list-disc list-inside">
                {activePattern.candidateMeasures.map((m, i) => (
                  <li key={i} className="leading-snug">{m}</li>
                ))}
              </ul>
            </div>

            <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800">
              <div className="text-xs font-bold text-amber-400 mb-2 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" /> 潜在副作用 (Side Effects)
              </div>
              <ul className="space-y-1.5 text-xs text-slate-300 list-disc list-inside">
                {activePattern.sideEffects.map((s, i) => (
                  <li key={i} className="leading-snug">{s}</li>
                ))}
              </ul>
            </div>
          </div>

          {/* 验证项与 Unknown 转入 Test */}
          <div className="bg-slate-950/80 p-3.5 rounded-lg border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-blue-300 flex items-center gap-1">
                <ShieldAlert className="w-3.5 h-3.5 text-blue-400" />
                闭环验证项与未知盲区 (Unknown → Test)
              </span>
              <span className="text-[10px] text-slate-500">严禁将模型估算作为实测依据</span>
            </div>
            <div className="space-y-1 text-xs text-slate-300">
              {activePattern.verificationItems.map((v, i) => (
                <div key={i} className="flex items-start gap-1.5">
                  <span className="text-blue-400 font-mono">▸</span>
                  <span>{v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 底部导航 */}
          <div className="pt-2 flex items-center justify-between border-t border-slate-800">
            <span className="text-xs text-slate-500">
              P001 ~ P018 物理引擎已实时与统一工程输入模型联锁
            </span>
            <button
              onClick={onGoToDecisions}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 transition cursor-pointer"
            >
              <span>进入方案权衡与决策驾驶舱</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
