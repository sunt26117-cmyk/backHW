import React from 'react';
import { CopilotAnalysisResult, CandidateAction } from '../types';
import { ShieldCheck, AlertOctagon, CheckCircle2, ArrowRight, Clock, DollarSign, AlertTriangle, ShieldAlert, Sparkles, HelpCircle, Layers, Activity } from 'lucide-react';

interface OptionsComparisonViewProps {
  result: CopilotAnalysisResult | null;
  onGoToCockpit: () => void;
}

export const OptionsComparisonView: React.FC<OptionsComparisonViewProps> = ({ result, onGoToCockpit }) => {
  if (!result) return null;

  const candidateActions = Array.isArray(result.candidateActions) ? result.candidateActions : [];
  const safeRecommendedId = result.finalRecommendation?.recommendedOptionId || '';

  const getResidualBadge = (risk: string) => {
    switch (risk) {
      case 'Low':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
      case 'Medium':
        return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30';
      case 'High':
      case 'Critical':
        return 'bg-red-500/20 text-red-300 border-red-500/30';
      default:
        return 'bg-slate-700 text-slate-300 border-slate-600';
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-blue-950/30 border border-blue-500/30 rounded-xl p-3 text-xs">
        <span className="text-blue-300 font-semibold">当前典型工况：</span>{' '}
        <span className="text-white">{(result as any).__scenarioLabel || '当前工程工况'}</span>
      </div>
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-base font-bold text-white flex items-center">
              <Sparkles className="w-5 h-5 mr-2 text-blue-400" />
              候选工程措施深剖与残余风险评估 (固定结构 3: 措施对比)
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              涵盖保守方案、平衡方案、节点优先方案；每个措施均量化时间/成本、跨域物理耦合核对、前置条件、次生风险、验证手段及失败退路 Plan B。
            </p>
          </div>
          <button
            onClick={onGoToCockpit}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs font-medium rounded-lg transition flex items-center cursor-pointer shadow-sm self-start sm:self-auto"
          >
            进入 C-T-S-Q-L 决策驾驶舱
            <ArrowRight className="w-4 h-4 ml-1.5" />
          </button>
        </div>

        {/* Action Cards Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {candidateActions.map((opt) => {
            const isVetoed = opt.veto?.rejection_veto;
            const isRecommended = opt.id === safeRecommendedId;

            return (
              <div
                key={opt.id}
                className={`relative rounded-xl border p-5 flex flex-col justify-between transition ${
                  isVetoed
                    ? 'bg-red-950/20 border-red-500/40 shadow-inner'
                    : isRecommended
                    ? 'bg-slate-850 border-blue-500/70 ring-1 ring-blue-500/40 shadow-lg'
                    : 'bg-slate-900 border-slate-800'
                }`}
              >
                {/* Header Tag */}
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-xs font-bold text-blue-400 font-mono tracking-wider">
                      {opt.id}
                    </span>
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded font-medium border ${
                        opt.category === 'conservative'
                          ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                          : opt.category === 'balanced'
                          ? 'bg-blue-500/15 text-blue-300 border-blue-500/30'
                          : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                      }`}
                    >
                      {opt.categoryLabel}
                    </span>
                  </div>

                  {/* Recommendation / VETO Badges */}
                  {isVetoed && (
                    <div className="mb-3 p-2.5 rounded-lg bg-red-900/30 border border-red-500/50 text-red-300 text-xs flex flex-col space-y-1.5">
                      <div className="flex items-start space-x-2">
                        <AlertOctagon className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
                        <div>
                          <span className="font-bold block">一票否决 (VETO 拦截)</span>
                          <span className="text-[11px] leading-tight text-red-200">{opt.veto.veto_reason}</span>
                        </div>
                      </div>
                      {opt.customerVetoViolations && opt.customerVetoViolations.length > 0 && (
                        <div className="bg-red-950/80 border border-red-700/60 rounded px-2 py-1 text-[10px] text-red-300">
                          <span className="font-bold block text-red-400">触犯客户特殊协议 (CSA) 条款：</span>
                          <ul className="list-disc list-inside mt-0.5 space-y-0.5">
                            {(Array.isArray(opt.customerVetoViolations) ? opt.customerVetoViolations : []).map((v, idx) => (
                              <li key={idx}>{v}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  {isRecommended && (
                    <div className="mb-3 p-2 rounded-lg bg-blue-600/20 border border-blue-500/40 text-blue-300 text-xs flex items-center space-x-2">
                      <CheckCircle2 className="w-4 h-4 text-blue-400 shrink-0" />
                      <span className="font-semibold">AI 最佳工程决策推荐</span>
                    </div>
                  )}

                  <h3 className="text-sm font-bold text-white mb-2 leading-snug">
                    {opt.name}
                  </h3>

                  {opt.referenced_standards && opt.referenced_standards.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {(Array.isArray(opt.referenced_standards) ? opt.referenced_standards : []).map((std, sIdx) => (
                        <span
                          key={sIdx}
                          className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-cyan-300 border border-cyan-800/40 font-mono"
                          title={std.relevance}
                        >
                          {typeof std === 'string' ? std : `${std?.standard ?? ''} ${std?.clause ?? ''}`.trim() || String((std as any)?.relevance ?? '标准条款')}
                        </span>
                      ))}
                    </div>
                  )}

                  <p className="text-xs text-slate-300 mb-3 leading-relaxed">
                    {opt.description}
                  </p>

                  {/* 预期收益 */}
                  <div className="bg-slate-800/60 p-2.5 rounded-lg border border-slate-700/60 mb-3 text-xs">
                    <span className="text-slate-400 block text-[11px] font-medium">预期收益 (Expected Benefit):</span>
                    <span className="text-slate-200 font-medium">{opt.expectedBenefit}</span>
                  </div>

                  {/* 风险净变化 (Risk Delta - 待办 3) */}
                  {(opt.riskDelta || (opt.riskBefore && opt.riskAfter)) && (
                    <div className="bg-slate-800/50 p-2 rounded-lg border border-slate-700/50 mb-3 text-xs flex items-center justify-between">
                      <span className="text-slate-400 text-[11px] flex items-center">
                        <Activity className="w-3 h-3 mr-1 text-cyan-400" />
                        风险跃迁 (Delta):
                      </span>
                      <span className="text-cyan-300 font-mono text-[11px] font-medium">
                        {opt.riskDelta || `${opt.riskBefore} ➔ ${opt.riskAfter}`}
                      </span>
                    </div>
                  )}

                  {/* 跨域物理耦合复核闭环 (待办 1.3) */}
                  {opt.crossDomainCouplingChecks && opt.crossDomainCouplingChecks.length > 0 && (
                    <div className="bg-indigo-950/30 p-2.5 rounded-lg border border-indigo-800/40 mb-3 text-xs space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-indigo-300 text-[10px] font-bold flex items-center">
                          <Layers className="w-3 h-3 mr-1 text-indigo-400" />
                          跨域物理耦合复核 ({opt.crossDomainCouplingChecks.filter((c) => c.addressed).length}/{opt.crossDomainCouplingChecks.length} 项闭环)
                        </span>
                      </div>
                      <div className="space-y-1 max-h-24 overflow-y-auto pr-0.5">
                        {opt.crossDomainCouplingChecks.map((chk, cIdx) => (
                          <div key={cIdx} className="flex items-start space-x-1.5 text-[10px] bg-slate-900/60 p-1 rounded border border-indigo-900/30">
                            {chk.addressed ? (
                              <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0 mt-0.5" />
                            ) : (
                              <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" />
                            )}
                            <div className="min-w-0 flex-1">
                              <span className="text-slate-200 font-mono">{chk.rule}</span>
                              {chk.note && <span className="text-slate-400 block truncate">{chk.note}</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Time & Cost metrics */}
                  <div className="grid grid-cols-2 gap-2 text-xs mb-3 font-mono">
                    <div className="bg-slate-800/40 p-2 rounded border border-slate-700/40">
                      <div className="flex items-center text-slate-400 text-[10px]">
                        <Clock className="w-3 h-3 mr-1 text-slate-400" />
                        实施周期
                      </div>
                      <span className="text-slate-200 font-semibold">{opt.timeCost}</span>
                    </div>
                    <div className="bg-slate-800/40 p-2 rounded border border-slate-700/40">
                      <div className="flex items-center text-slate-400 text-[10px]">
                        <DollarSign className="w-3 h-3 mr-1 text-slate-400" />
                        验证与物料费
                      </div>
                      <span className="text-slate-200 font-semibold">{opt.verificationCost}</span>
                    </div>
                  </div>

                  {/* Decision fit */}
                  {(opt.decisionFit || opt.fastestValidation || opt.latestDecisionPoint || opt.rejectionReason) && (
                    <div className="bg-cyan-500/5 p-2.5 rounded-lg border border-cyan-500/20 mb-3 text-xs space-y-1.5">
                      {opt.decisionFit && (
                        <div>
                          <span className="text-cyan-400 font-semibold">当前工况适配：</span>
                          <span className="text-slate-300">{opt.decisionFit}</span>
                        </div>
                      )}
                      {opt.fastestValidation && (
                        <div>
                          <span className="text-emerald-400 font-semibold">最快验证：</span>
                          <span className="text-slate-300">{opt.fastestValidation}</span>
                        </div>
                      )}
                      {opt.latestDecisionPoint && (
                        <div>
                          <span className="text-amber-400 font-semibold">最晚切换点：</span>
                          <span className="text-slate-300">{opt.latestDecisionPoint}</span>
                        </div>
                      )}
                      {opt.rejectionReason && (
                        <div>
                          <span className="text-red-400 font-semibold">主要否决理由：</span>
                          <span className="text-slate-300">{opt.rejectionReason}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Residual Risk */}
                  <div className="bg-slate-800/40 p-2.5 rounded-lg border border-slate-700/40 mb-3 text-xs">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-slate-400 text-[11px] font-medium">残余风险 (Residual Risk):</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getResidualBadge(opt.residualRisk)}`}>
                        {opt.residualRisk}
                      </span>
                    </div>
                    <p className="text-slate-300 text-[11px] leading-relaxed">{opt.residualRiskDetail}</p>
                  </div>

                  {/* Failure Consequence & Side effects */}
                  <div className="space-y-2 text-xs text-slate-300 mb-3">
                    <div className="text-[11px]">
                      <span className="text-amber-400/90 font-medium">次生影响：</span>
                      <span className="text-slate-300">{opt.sideEffects}</span>
                    </div>
                    <div className="text-[11px]">
                      <span className="text-red-400/90 font-medium">失败后果：</span>
                      <span className="text-slate-300">{opt.failureConsequence}</span>
                    </div>
                    <div className="text-[11px]">
                      <span className="text-blue-400/90 font-medium">前置条件：</span>
                      <span className="text-slate-300">{opt.preconditions}</span>
                    </div>
                  </div>
                </div>

                {/* Plan B Footer */}
                <div className="pt-3 border-t border-slate-800/80 text-xs">
                  <div className="bg-slate-950/40 p-2 rounded border border-slate-800 text-[11px]">
                    <span className="text-slate-400 font-medium">退路 Plan B：</span>
                    <span className="text-slate-300 ml-1">{opt.planB}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
