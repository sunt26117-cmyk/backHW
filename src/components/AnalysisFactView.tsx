import React from 'react';
import { CopilotAnalysisResult, InformationTag } from '../types';
import { ResultProvenanceBanner } from './ResultProvenanceBanner';
import {
  CheckCircle2,
  HelpCircle,
  AlertTriangle,
  ShieldCheck,
  Flame,
  Cpu,
  Compass,
  Activity,
  ArrowRight,
  ShieldAlert,
  Search,
  BookOpen,
  Calculator,
} from 'lucide-react';

interface AnalysisFactViewProps {
  result: CopilotAnalysisResult | null;
  onGoToOptions: () => void;
}

export const AnalysisFactView: React.FC<AnalysisFactViewProps> = ({ result, onGoToOptions }) => {
  if (!result) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center text-slate-400">
        <Cpu className="w-12 h-12 mx-auto mb-3 text-slate-600 animate-pulse" />
        <p className="text-sm font-medium">尚未执行风险与决策分析</p>
        <p className="text-xs text-slate-500 mt-1">请在第一步确认项目与工程问题，点击顶部的“执行风险与决策分析”</p>
      </div>
    );
  }

  const {
    coreConclusion,
    knownFacts,
    assumptions,
    unknowns,
    physicalMechanism,
    dfmeaView,
    riskRatings,
    classifiedInfo,
    redTeamChallenge,
  } = result;

  const getRiskBadgeColor = (risk: string) => {
    switch (risk) {
      case 'Low':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
      case 'Medium':
        return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30';
      case 'Medium-High':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
      case 'High':
      case 'Critical':
        return 'bg-red-500/20 text-red-300 border-red-500/30';
      default:
        return 'bg-slate-700 text-slate-300 border-slate-600';
    }
  };

  const getTagBadge = (tag: InformationTag) => {
    switch (tag) {
      case 'MEASURED':
        return {
          label: 'MEASURED · 实测数据',
          color: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
          icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mr-1" />,
          desc: '示波器/频谱仪/热电偶等实际仪器读数，客观物理证据',
        };
      case 'SPEC':
        return {
          label: 'SPEC · 规范要求',
          color: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/40',
          icon: <BookOpen className="w-3.5 h-3.5 text-indigo-400 mr-1" />,
          desc: '车规标准/客户协议/降额规范等绝对红线，不可突破',
        };
      case 'CALCULATED':
        return {
          label: 'CALCULATED · 物理计算',
          color: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40',
          icon: <Calculator className="w-3.5 h-3.5 text-cyan-400 mr-1" />,
          desc: '基于物理公式/热网络/微积分推导的理论值',
        };
      case 'ASSUMPTION':
        return {
          label: 'ASSUMPTION · 工程假设',
          color: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
          icon: <AlertTriangle className="w-3.5 h-3.5 text-amber-400 mr-1" />,
          desc: '经验设定或未在极端台架全量验证的边界假定',
        };
      case 'UNKNOWN':
        return {
          label: 'UNKNOWN · 未知项',
          color: 'bg-rose-500/15 text-rose-300 border-rose-500/40',
          icon: <HelpCircle className="w-3.5 h-3.5 text-rose-400 mr-1" />,
          desc: '当前案卷缺失的关键参数或尚未摸底的变量',
        };
      default:
        return {
          label: tag,
          color: 'bg-slate-700 text-slate-300 border-slate-600',
          icon: null,
          desc: '',
        };
    }
  };

  return (
    <div className="space-y-6">
      {/* 0. 结果来源透明度标注 (明确区分 AI 推演 vs 车规确定性模版/物理公式) */}
      <ResultProvenanceBanner provenance={result.provenance} />

      {/* 1. Core Conclusion Hero Card (固定结构 1: 核心结论) */}
      <div className="bg-gradient-to-r from-blue-950/70 via-slate-900 to-indigo-950/60 border border-blue-500/30 rounded-xl p-6 shadow-lg">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div className="space-y-3 max-w-4xl">
            <div className="flex items-center space-x-2">
              <span className="px-2.5 py-0.5 rounded text-xs font-semibold bg-blue-600 text-white tracking-wide uppercase">
                Core Conclusion (核心结论)
              </span>
              <span className="text-xs text-slate-400">严守汽车硬件工程决策铁律 · 拒绝模棱两可</span>
            </div>

            <div>
              <h3 className="text-base sm:text-lg font-bold text-white flex items-start">
                <Compass className="w-5 h-5 mr-2 text-blue-400 shrink-0 mt-0.5" />
                推荐措施：{coreConclusion.recommendedMeasure}
              </h3>
              <p className="text-xs sm:text-sm text-slate-300 mt-2 leading-relaxed bg-slate-800/60 p-3 rounded-lg border border-slate-700/50">
                <span className="font-semibold text-blue-300">核心理由：</span>
                {coreConclusion.reasonSummary}
              </p>
            </div>

            <div className="text-xs text-slate-400">
              <span className="text-slate-500">工程问题简述：</span>
              {coreConclusion.problemSummary}
            </div>
          </div>

          {/* Quick Risk Score Card */}
          <div className="shrink-0 bg-slate-900/90 border border-slate-700 rounded-xl p-4 text-center min-w-[170px] shadow-sm">
            <span className="text-[11px] text-slate-400 font-medium uppercase tracking-wider block">综合风险指数</span>
            <div className="text-3xl font-extrabold text-white mt-1 font-mono">
              {riskRatings.overallRiskScore}
              <span className="text-xs text-slate-400 font-normal"> / 100</span>
            </div>
            <span className={`inline-block mt-2 px-2.5 py-0.5 rounded text-xs font-semibold border ${getRiskBadgeColor(riskRatings.overallRisk)}`}>
              {riskRatings.overallRisk} Risk
            </span>
            <div className="mt-3 text-[11px] text-slate-400 text-left border-t border-slate-800 pt-2 space-y-1 font-mono">
              <div className="flex justify-between">
                <span>技术风险:</span>
                <span className="text-slate-200">{riskRatings.technicalRisk}</span>
              </div>
              <div className="flex justify-between">
                <span>进度风险:</span>
                <span className="text-slate-200">{riskRatings.scheduleRisk}</span>
              </div>
              <div className="flex justify-between">
                <span>质量安全:</span>
                <span className="text-slate-200">{riskRatings.qualityRisk}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Fact Classification: Strict 5-Type Labeling (P0-1: 绝不把假设当事实，强制五类标签) */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300 flex items-center">
              <ShieldCheck className="w-4 h-4 mr-2 text-blue-400" />
              严谨信息类型分类审查 (P0 级第一原则：绝不把假设当事实)
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              强制标识实测值、规范限值、物理计算、工程假设与未知盲区，杜绝“没有证据假装确定”。
            </p>
          </div>
          <div className="flex items-center space-x-1.5 text-[11px] text-slate-400 font-mono">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span>评审会签数据溯源</span>
          </div>
        </div>

        {classifiedInfo && classifiedInfo.length > 0 ? (
          <div className="space-y-3">
            {classifiedInfo.map((item) => {
              const badge = getTagBadge(item.tag);
              return (
                <div
                  key={item.id}
                  className="bg-slate-850/80 border border-slate-700/60 rounded-lg p-3.5 hover:border-slate-600/80 transition"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                    <div className="flex items-center space-x-2">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold border ${badge.color}`}
                      >
                        {badge.icon}
                        {badge.label}
                      </span>
                      <span className="text-xs font-semibold text-slate-200">{item.title}</span>
                    </div>

                    <div className="flex items-center space-x-3 text-[11px] font-mono shrink-0">
                      <span className="text-slate-400">置信度:</span>
                      <div className="w-20 bg-slate-800 rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`h-full ${
                            item.confidenceLevel >= 90
                              ? 'bg-emerald-500'
                              : item.confidenceLevel >= 60
                              ? 'bg-amber-500'
                              : 'bg-rose-500'
                          }`}
                          style={{ width: `${item.confidenceLevel}%` }}
                        ></div>
                      </div>
                      <span
                        className={`font-bold ${
                          item.confidenceLevel >= 90
                            ? 'text-emerald-400'
                            : item.confidenceLevel >= 60
                            ? 'text-amber-400'
                            : 'text-rose-400'
                        }`}
                      >
                        {item.confidenceLevel}%
                      </span>
                    </div>
                  </div>

                  <p className="text-xs text-slate-300 leading-relaxed pl-1">{item.content}</p>

                  <div className="mt-2.5 pt-2 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-400">
                    <div className="flex items-start space-x-1.5">
                      <Search className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
                      <span>
                        <strong className="text-slate-300 font-medium">数据来源/依据: </strong>
                        {item.sourceOrBasis}
                      </span>
                    </div>
                    {item.verificationMethod && (
                      <div className="flex items-start space-x-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                        <span>
                          <strong className="text-slate-300 font-medium">核验方法: </strong>
                          {item.verificationMethod}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Fallback to original 3-box if classifiedInfo not populated */}
            <div className="bg-slate-850 border border-emerald-500/30 rounded-lg p-4 bg-emerald-950/10">
              <div className="flex items-center space-x-2 text-emerald-400 font-semibold text-xs uppercase tracking-wide mb-3">
                <CheckCircle2 className="w-4 h-4" />
                <span>实测事实 (Measured Facts)</span>
              </div>
              <ul className="space-y-2 text-xs text-slate-300">
                {knownFacts.map((fact, i) => (
                  <li key={i} className="flex items-start">
                    <span className="text-emerald-400 mr-2 shrink-0 font-bold">•</span>
                    <span>{fact}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-slate-850 border border-blue-500/30 rounded-lg p-4 bg-blue-950/10">
              <div className="flex items-center space-x-2 text-blue-400 font-semibold text-xs uppercase tracking-wide mb-3">
                <AlertTriangle className="w-4 h-4" />
                <span>工程假设 (Assumptions)</span>
              </div>
              <ul className="space-y-2 text-xs text-slate-300">
                {assumptions.map((assump, i) => (
                  <li key={i} className="flex items-start">
                    <span className="text-blue-400 mr-2 shrink-0 font-bold">•</span>
                    <span>{assump}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-slate-850 border border-amber-500/30 rounded-lg p-4 bg-amber-950/10">
              <div className="flex items-center space-x-2 text-amber-400 font-semibold text-xs uppercase tracking-wide mb-3">
                <HelpCircle className="w-4 h-4" />
                <span>未知盲区 (Unknowns)</span>
              </div>
              <ul className="space-y-2 text-xs text-slate-300">
                {unknowns.map((unk, i) => (
                  <li key={i} className="flex items-start">
                    <span className="text-amber-400 mr-2 shrink-0 font-bold">•</span>
                    <span>{unk}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* Red Team Audit & Challenge: 逆向质疑与盲区挑战 */}
      {redTeamChallenge && (
        <div className="bg-gradient-to-r from-rose-950/30 via-slate-900 to-amber-950/20 border border-rose-500/30 rounded-xl p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
            <div className="flex items-center space-x-2">
              <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0" />
              <h4 className="text-sm font-bold text-white tracking-wide">
                红队逆向质疑与盲区审计 (Red Team Audit Challenge)
              </h4>
            </div>
            <div className="flex items-center space-x-2 text-xs font-mono">
              <span className="text-slate-400">证据链完整度:</span>
              <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 font-bold">
                {redTeamChallenge.confidenceScorePct}%
              </span>
            </div>
          </div>

          <div className="p-3 bg-rose-950/30 border border-rose-800/40 rounded-lg mb-3 text-xs text-rose-200 font-medium leading-relaxed">
            {redTeamChallenge.auditVerdict}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div className="bg-slate-850/80 border border-slate-700/60 rounded-lg p-3">
              <span className="font-semibold text-amber-300 block mb-2 flex items-center">
                <AlertTriangle className="w-3.5 h-3.5 mr-1 text-amber-400" />
                潜在工程盲区与反例推演 (Risk Gaps):
              </span>
              <ul className="space-y-1.5 text-slate-300 text-[11px]">
                {redTeamChallenge.riskGaps.map((gap, i) => (
                  <li key={i} className="flex items-start">
                    <span className="text-amber-400 mr-1.5 shrink-0">•</span>
                    <span>{gap}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-slate-850/80 border border-slate-700/60 rounded-lg p-3">
              <span className="font-semibold text-rose-300 block mb-2 flex items-center">
                <HelpCircle className="w-3.5 h-3.5 mr-1 text-rose-400" />
                目前欠缺的关键客观证据 (Missing Evidence):
              </span>
              <ul className="space-y-1.5 text-slate-300 text-[11px]">
                {redTeamChallenge.missingEvidenceList.map((ev, i) => (
                  <li key={i} className="flex items-start">
                    <span className="text-rose-400 mr-1.5 shrink-0">•</span>
                    <span>{ev}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* 3. Physical Mechanism & Root Cause (固定结构 2: 失效机理与物理根因) */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300 mb-3 flex items-center">
          <Flame className="w-4 h-4 mr-2 text-orange-400" />
          物理本质与失效机理 (Physical Mechanism Analysis)
        </h3>

        <div className="bg-slate-800/60 border border-slate-700/60 rounded-lg p-4 mb-4">
          <span className="text-xs font-semibold text-orange-400 uppercase tracking-wide block mb-1">
            底层物理与电路机理深剖 (Root Cause Physics):
          </span>
          <p className="text-xs text-slate-200 leading-relaxed">
            {physicalMechanism.rootCauseAnalysis}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {physicalMechanism.keyPhysicalFactors.map((item, idx) => (
            <div key={idx} className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-3 text-xs">
              <span className="font-semibold text-blue-300 block mb-1">{item.factor}</span>
              <p className="text-slate-400 leading-normal text-[11px]">{item.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 4. DFMEA Table View (DFMEA 视角失效链条与严重度) */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300 flex items-center">
            <Activity className="w-4 h-4 mr-2 text-emerald-400" />
            DFMEA 失效链条分析 (Failure Chain & Impact)
          </h3>
          <span className="text-xs text-slate-400">IATF 16949 / ISO 26262 严谨工程留痕</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border border-slate-800 rounded-lg overflow-hidden">
            <thead className="bg-slate-800 text-slate-300 font-semibold border-b border-slate-700">
              <tr>
                <th className="p-3">失效模式 (Failure Mode)</th>
                <th className="p-3">直接起因 (Failure Cause)</th>
                <th className="p-3">局部影响 (Local Effect)</th>
                <th className="p-3">系统影响 (System Effect)</th>
                <th className="p-3">整车/用户影响 (Vehicle Effect)</th>
                <th className="p-3 text-center">S / O / D</th>
                <th className="p-3 text-center">合规与安全</th>
                <th className="p-3">容错/降级闭环要求</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-200">
              {(result.dfmeaItems && result.dfmeaItems.length > 0 ? result.dfmeaItems : [dfmeaView]).map((item, idx) => (
                <tr key={idx} className="hover:bg-slate-850/50">
                  <td className="p-3 font-medium text-amber-300">
                    <div className="font-semibold">{item.failureMode}</div>
                  </td>
                  <td className="p-3 text-slate-300">{item.failureCause}</td>
                  <td className="p-3 text-slate-300">{item.localEffect}</td>
                  <td className="p-3 text-slate-300">{item.systemEffect}</td>
                  <td className="p-3 text-slate-300">{item.vehicleEffect}</td>
                  <td className="p-3 text-center font-mono whitespace-nowrap">
                    <span className="px-1.5 py-0.5 bg-red-950 text-red-300 rounded border border-red-800/50 mr-1">
                      S:{item.severity}
                    </span>
                    <span className="px-1.5 py-0.5 bg-amber-950 text-amber-300 rounded border border-amber-800/50 mr-1">
                      O:{item.occurrence}
                    </span>
                    <span className="px-1.5 py-0.5 bg-blue-950 text-blue-300 rounded border border-blue-800/50">
                      D:{item.detection}
                    </span>
                  </td>
                  <td className="p-3 text-center space-y-1 whitespace-nowrap">
                    {item.safetyImpact && (
                      <span className="inline-block px-2 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30 text-[10px] font-semibold">
                        安全相关
                      </span>
                    )}
                    {item.regulatoryImpact && (
                      <span className="inline-block px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[10px] font-semibold ml-1">
                        法规认证
                      </span>
                    )}
                    {item.massProductionImpact && (
                      <span className="inline-block px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30 text-[10px] font-semibold ml-1">
                        量产门禁
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-[11px] text-emerald-300/90 leading-tight">
                    {item.degradationAction || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* BLDC Extended Safety Chain & Commutation Analysis */}
        {result.bldcExtendedAnalysis && (
          <div className="mt-6 border-t border-slate-800 pt-5 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-cyan-300 flex items-center space-x-1.5 uppercase tracking-wider">
                <ShieldCheck className="w-4 h-4 text-cyan-400" />
                <span>BLDC 电机换相失步、传感器降级与功能安全链路闭环时序</span>
              </span>
              <span className="text-[11px] text-slate-400 font-mono">ISO 26262-5 Clause 7.4 / ASIL B</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              {/* 1. Commutation Risk */}
              <div className="bg-slate-850/80 border border-slate-700/60 rounded-xl p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-amber-300">换相角误差与转矩纹波</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                    result.bldcExtendedAnalysis.commutationRisk.stallOutProbability === 'high'
                      ? 'bg-red-950 text-red-300 border border-red-800'
                      : 'bg-amber-950 text-amber-300 border border-amber-800'
                  }`}>
                    失步风险: {result.bldcExtendedAnalysis.commutationRisk.stallOutProbability.toUpperCase()}
                  </span>
                </div>
                <div className="text-slate-300 space-y-1 text-[11px]">
                  <div>控制拓扑: <span className="text-white font-medium">{result.bldcExtendedAnalysis.commutationRisk.controlModeLabel}</span></div>
                  <div>工作转速区间: <span className="font-mono text-cyan-300">{result.bldcExtendedAnalysis.commutationRisk.speedRangeRpm[0]} ~ {result.bldcExtendedAnalysis.commutationRisk.speedRangeRpm[1]} rpm</span></div>
                  <div>观测提前角偏差: <span className="font-mono text-amber-300">+{result.bldcExtendedAnalysis.commutationRisk.speedOffsetDeg}°</span> | 纹波估计: <span className="font-mono text-red-300">{result.bldcExtendedAnalysis.commutationRisk.torqueRippleEstimatePct}%</span></div>
                  <div className="bg-slate-900/60 p-2 rounded text-[11px] text-slate-400 leading-normal">
                    {result.bldcExtendedAnalysis.commutationRisk.stallOutReason}
                  </div>
                </div>
              </div>

              {/* 2. Position Sensor Degradation */}
              <div className="bg-slate-850/80 border border-slate-700/60 rounded-xl p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-blue-300">位置传感器失效容错</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-950 text-blue-300 border border-blue-800">
                    {result.bldcExtendedAnalysis.positionSensorDegradation.redundancyAvailable ? '具备冗余' : '单点无冗余'}
                  </span>
                </div>
                <div className="text-slate-300 space-y-1 text-[11px]">
                  <div>传感器类型: <span className="text-white font-medium">{result.bldcExtendedAnalysis.positionSensorDegradation.sensorTypeLabel}</span></div>
                  <div>故障诊断码: <span className="font-mono text-amber-300">{result.bldcExtendedAnalysis.positionSensorDegradation.dtcTriggered}</span></div>
                  <div>降级模式: <span className="text-slate-200">{result.bldcExtendedAnalysis.positionSensorDegradation.powerLimitMode}</span></div>
                  <div className="bg-slate-900/60 p-2 rounded text-[11px] text-slate-400 leading-normal">
                    {result.bldcExtendedAnalysis.positionSensorDegradation.switchingLogic}
                  </div>
                </div>
              </div>

              {/* 3. Safety Chain & Timing */}
              <div className="bg-slate-850/80 border border-slate-700/60 rounded-xl p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-emerald-300">功能安全链与看门狗</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
                    FHTI: {result.bldcExtendedAnalysis.functionalSafetyChain.watchdogTiming.timingCompliance}
                  </span>
                </div>
                <div className="text-slate-300 space-y-1 text-[11px]">
                  <div>双采样交叉互检: <span className="font-medium text-emerald-300">{result.bldcExtendedAnalysis.functionalSafetyChain.currentSenseDualChannel.crossCheckStatus}</span> (阈值 &plusmn;{result.bldcExtendedAnalysis.functionalSafetyChain.currentSenseDualChannel.toleranceThresholdPct}%)</div>
                  <div>时序预算: <span className="font-mono text-slate-200">总容错 {result.bldcExtendedAnalysis.functionalSafetyChain.watchdogTiming.fhtiBudgetMs}ms</span> (切换 {result.bldcExtendedAnalysis.functionalSafetyChain.watchdogTiming.safeStateTransitionMs}ms + 裕量 <span className="text-emerald-300 font-bold">{result.bldcExtendedAnalysis.functionalSafetyChain.watchdogTiming.marginMs}ms</span>)</div>
                  <div>ASIL分解证明: <span className="text-cyan-300 font-mono">{result.bldcExtendedAnalysis.functionalSafetyChain.asilDecomposition.mcuSubsystem}</span> + <span className="text-cyan-300 font-mono">{result.bldcExtendedAnalysis.functionalSafetyChain.asilDecomposition.gateDriverSubsystem}</span></div>
                  <div className="bg-slate-900/60 p-2 rounded text-[11px] text-slate-400 leading-normal">
                    {result.bldcExtendedAnalysis.functionalSafetyChain.currentSenseDualChannel.diagnosisMechanism}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="mt-6 flex justify-end">
          <button
            onClick={onGoToOptions}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs font-medium rounded-lg transition flex items-center cursor-pointer shadow-sm"
          >
            下一步：审查候选措施与残余风险 (Step 3)
            <ArrowRight className="w-4 h-4 ml-1.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
