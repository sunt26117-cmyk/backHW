import React, { useState } from 'react';
import { CopilotAnalysisResult, CandidateAction, HwLeadStyle } from '../types';
import { evaluateLeadershipFit, applyRecurrencePenaltyToQ } from '../utils/leadershipEngine';
import { evaluateLeadershipEconomicRisk } from '../data/safetyReliabilityEngine';
import { STANDARD_TSCQL_WEIGHTS } from '../utils/scoringWeights';
import type { TscqlWeights } from '../utils/scoringWeights';
import { ResultProvenanceBanner } from './ResultProvenanceBanner';
import { TemplateContentNotice } from './TemplateContentNotice';
import {
  Sliders,
  ShieldAlert,
  Award,
  AlertOctagon,
  RotateCcw,
  ArrowRight,
  BarChart2,
  Clock,
  Flame,
  AlertTriangle,
  Info,
  UserCheck,
  Zap,
  Scale,
  Sparkles,
  BookOpen,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  Timer,
  Calendar,
  ListChecks,
  DollarSign,
  Wrench,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface DecisionCockpitViewProps {
  result: CopilotAnalysisResult | null;
  onGoToRecommendation: () => void;
  hwLeadStyle?: HwLeadStyle;
  onLeadStyleChange?: (style: HwLeadStyle) => void;
  recurrenceCount?: number;
  daysRemaining?: number;
}

export const DecisionCockpitView: React.FC<DecisionCockpitViewProps> = ({
  result,
  onGoToRecommendation,
  hwLeadStyle = 'AGILE_DELIVERY',
  onLeadStyleChange,
  recurrenceCount = 0,
  daysRemaining = 14,
}) => {
  // C-T-S-Q-L 标准权重定义已统一到 scoringWeights.ts（跟 aiResultAuditor.ts 核对AI总分用的是同一份），
  // 这里的 useState 只是把它当作交互滑块的初始值——用户仍然可以拖动调整做 what-if 探索。
  const [weights, setWeights] = useState<TscqlWeights>({ ...STANDARD_TSCQL_WEIGHTS });

  // 直属领导态度风格状态
  const [currentLeadStyle, setCurrentLeadStyle] = useState<HwLeadStyle>(hwLeadStyle);

  // 4.1 SOP 倒计时 / 节点剩余天数状态 (默认 14 天激活临界模式)
  const [remainingDays, setRemainingDays] = useState<number>(daysRemaining);

  // 5大重型辅助分析模块默认折叠状态（降低视觉复杂度，按需点开）
  const [isLeadStyleOpen, setIsLeadStyleOpen] = useState<boolean>(false);
  const [isRiskBreakdownOpen, setIsRiskBreakdownOpen] = useState<boolean>(false);
  const [isWhyNotOpen, setIsWhyNotOpen] = useState<boolean>(false);
  const [isEconRiskOpen, setIsEconRiskOpen] = useState<boolean>(false);
  const [is24HourPlanOpen, setIs24HourPlanOpen] = useState<boolean>(false);

  // 响应父组件工况切换与属性变化
  React.useEffect(() => {
    if (typeof daysRemaining === 'number') {
      setRemainingDays(daysRemaining);
    }
  }, [daysRemaining]);

  React.useEffect(() => {
    if (hwLeadStyle) {
      setCurrentLeadStyle(hwLeadStyle);
    }
  }, [hwLeadStyle]);

  if (!result) {
    return <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-sm text-slate-400">当前典型工况分析结果尚未生成，请稍候。</div>;
  }

  const handleStyleSelect = (style: HwLeadStyle) => {
    setCurrentLeadStyle(style);
    if (onLeadStyleChange) {
      onLeadStyleChange(style);
    }
  };

  const resetWeights = () => {
    setWeights({ ...STANDARD_TSCQL_WEIGHTS });
  };

  const totalWeight = weights.T + weights.S + weights.C + weights.Q + weights.L;
  const isCriticalCrunchMode = remainingDays <= 21;

  // 判断方案是否涉及硬件改版打板 (PCB Re-spin)
  const isReSpinOption = (opt: CandidateAction) => {
    const text = `${opt.name} ${opt.description} ${opt.timeCost} ${opt.sideEffects}`.toLowerCase();
    return (
      text.includes('改版') ||
      text.includes('打板') ||
      text.includes('开模') ||
      text.includes('re-spin') ||
      text.includes('respin') ||
      text.includes('重新布线')
    );
  };

  // 4.1 非线性时间衰减惩罚函数
  const getEffectiveScheduleScore = (opt: CandidateAction) => {
    const rawS = opt.scores.S;
    if (!isReSpinOption(opt) || !isCriticalCrunchMode) {
      return rawS;
    }
    // S_effective = S * Math.max(0.2, remaining_days / 21)
    const decayFactor = Math.max(0.2, remainingDays / 21);
    return Number((rawS * decayFactor).toFixed(1));
  };

  // P1-2: 获取考虑历史复发次数非线性惩罚后的有效 Q 分
  const getEffectiveQScore = (opt: CandidateAction) => {
    return applyRecurrencePenaltyToQ(opt.scores.Q, recurrenceCount).effectiveQ;
  };

  // 计算综合基准得分 (带时间衰减惩罚与历史复发质量衰减)
  const computeBaseScore = (opt: CandidateAction) => {
    if (opt.veto.rejection_veto) return 0;
    const { T, C, L } = opt.scores;
    const effectiveS = getEffectiveScheduleScore(opt);
    const effectiveQ = getEffectiveQScore(opt);
    const factor = totalWeight > 0 ? totalWeight : 100;
    const weighted =
      (T * weights.T + effectiveS * weights.S + C * weights.C + effectiveQ * weights.Q + L * weights.L) /
      factor;
    return Number(weighted.toFixed(1));
  };

  // 综合得分: Score_final = Score_base * M_lead (包含动态生态漂移判断)
  const computeFinalScore = (opt: CandidateAction) => {
    if (opt.veto.rejection_veto) return 0;
    const base = computeBaseScore(opt);
    const leadEval = evaluateLeadershipFit(opt, currentLeadStyle, recurrenceCount);
    return Number((base * leadEval.multiplier).toFixed(1));
  };

  // 依据最终得分重新排序
  const safeCandidateActions = Array.isArray(result.candidateActions) ? result.candidateActions : [];
  const sortedActions = [...safeCandidateActions].sort((a, b) => {
    if (a.veto.rejection_veto && !b.veto.rejection_veto) return 1;
    if (!a.veto.rejection_veto && b.veto.rejection_veto) return -1;
    return computeFinalScore(b) - computeFinalScore(a);
  });

  return (
    <div className="space-y-6">
      {/* 0. 结果来源透明度标注 */}
      <ResultProvenanceBanner provenance={result.provenance} />

      {/* 1. Header & 节点倒计时衰减控制器 */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="text-base font-bold text-white flex items-center">
              <Award className="w-5 h-5 mr-2 text-blue-400" />
              C-T-S-Q-L 决策驾驶舱与非线性时间惩罚
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              综合平衡技术可行性 (T)、进度风险 (S)、BOM 与验证成本 (C)、质量与可靠性 (Q)、责任闭环与工程留痕 (L)。
            </p>
          </div>
          <button
            onClick={onGoToRecommendation}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs font-medium rounded-lg transition flex items-center cursor-pointer shadow-sm self-start sm:self-auto"
          >
            查看最终工程实施方案与 RACI
            <ArrowRight className="w-4 h-4 ml-1.5" />
          </button>
        </div>

        {/* 4.2 直属领导处理风格注入控制卡 (M_lead Multiplier) */}
        <div className="mb-4 bg-slate-850 border border-slate-700/80 rounded-xl p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
            <div className="flex items-center space-x-2">
              <UserCheck className="w-5 h-5 text-amber-400" />
              <div>
                <span className="text-xs font-bold text-slate-200 block">
                  直属领导态度倾向注入引擎 (M_lead 加权乘数与领导通关指数)
                </span>
                <span className="text-[11px] text-slate-400">
                  真实职场中，方案能否推行取决于直属领导能否签字。此处切换领导风格可实时联动综合得分与通关指数。
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 self-start sm:self-auto">
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-blue-950 border border-blue-800 text-blue-300">
                当前: {currentLeadStyle === 'CONSERVATIVE' ? '技术求稳 (严禁低裕量)' : currentLeadStyle === 'AGILE_DELIVERY' ? '敏捷交付 (抗拒改版)' : '流程免责 (外部会签)'}
              </span>
              <button
                type="button"
                onClick={() => setIsLeadStyleOpen(!isLeadStyleOpen)}
                className="flex items-center gap-1 text-xs px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-750 text-slate-300 border border-slate-700 transition cursor-pointer"
              >
                {isLeadStyleOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                <span>{isLeadStyleOpen ? '收起配置' : '切换风格'}</span>
              </button>
            </div>
          </div>

          {isLeadStyleOpen && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs mt-3 pt-3 border-t border-slate-800">
              {/* 1. 技术求稳型 */}
              <button
                type="button"
                onClick={() => handleStyleSelect('CONSERVATIVE')}
                className={`p-3 rounded-lg border text-left cursor-pointer transition flex flex-col justify-between ${
                  currentLeadStyle === 'CONSERVATIVE'
                    ? 'bg-blue-950/50 border-blue-500 text-white ring-1 ring-blue-500/50'
                    : 'bg-slate-900/60 border-slate-700/60 text-slate-400 hover:border-slate-600'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold flex items-center text-xs">
                    <ShieldAlert className="w-3.5 h-3.5 mr-1.5 text-blue-400" />
                    🛡️ 技术求稳型 (Quality First)
                  </span>
                  {currentLeadStyle === 'CONSERVATIVE' && (
                    <span className="text-[10px] text-blue-400 font-bold">● 已激活</span>
                  )}
                </div>
                <p className="text-[11px] text-slate-300 leading-snug">
                  极度在乎裕量与部门声誉。宁可让项目稍微推迟 2 周，也绝不接受降额贴线或带病特采。
                </p>
                <div className="mt-2 pt-1.5 border-t border-slate-700/40 text-[10px] text-blue-300">
                  <span>乘数: 彻底根治方案 ×1.15 | 带病特采 ×0.7</span>
                </div>
              </button>

              {/* 2. 敏捷交付型 */}
              <button
                type="button"
                onClick={() => handleStyleSelect('AGILE_DELIVERY')}
                className={`p-3 rounded-lg border text-left cursor-pointer transition flex flex-col justify-between ${
                  currentLeadStyle === 'AGILE_DELIVERY'
                    ? 'bg-emerald-950/50 border-emerald-500 text-white ring-1 ring-emerald-500/50'
                    : 'bg-slate-900/60 border-slate-700/60 text-slate-400 hover:border-slate-600'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold flex items-center text-xs">
                    <Zap className="w-3.5 h-3.5 mr-1.5 text-emerald-400" />
                    🚀 敏捷交付型 (Delivery First)
                  </span>
                  {currentLeadStyle === 'AGILE_DELIVERY' && (
                    <span className="text-[10px] text-emerald-400 font-bold">● 已激活</span>
                  )}
                </div>
                <p className="text-[11px] text-slate-300 leading-snug">
                  以保交付为第一要务。只要台架测过，优先在内部用软件或原位贴片消化，极力抗拒改版。
                </p>
                <div className="mt-2 pt-1.5 border-t border-slate-700/40 text-[10px] text-emerald-300">
                  <span>乘数: 原位吸收/软件 ×1.2 | PCB 改版 ×0.65</span>
                </div>
              </button>

              {/* 3. 流程免责型 */}
              <button
                type="button"
                onClick={() => handleStyleSelect('PROCESS_DEFENSIVE')}
                className={`p-3 rounded-lg border text-left cursor-pointer transition flex flex-col justify-between ${
                  currentLeadStyle === 'PROCESS_DEFENSIVE'
                    ? 'bg-amber-950/50 border-amber-500 text-white ring-1 ring-amber-500/50'
                    : 'bg-slate-900/60 border-slate-700/60 text-slate-400 hover:border-slate-600'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold flex items-center text-xs">
                    <Scale className="w-3.5 h-3.5 mr-1.5 text-amber-400" />
                    ⚖️ 流程免责型 (Boundary First)
                  </span>
                  {currentLeadStyle === 'PROCESS_DEFENSIVE' && (
                    <span className="text-[10px] text-amber-400 font-bold">● 已激活</span>
                  )}
                </div>
                <p className="text-[11px] text-slate-300 leading-snug">
                  极度注重权责划分。外部诱因坚决踢球发起外部 ECR 要资源，绝不让硬件单方面背锅。
                </p>
                <div className="mt-2 pt-1.5 border-t border-slate-700/40 text-[10px] text-amber-300">
                  <span>乘数: 外部会签/ECR ×1.25 | 硬件单方背锅 ×0.5</span>
                </div>
              </button>
            </div>
          )}
        </div>

        {/* 4.1 SOP 倒计时临界模式动态指示卡 */}
        <div className="mb-4 bg-slate-850 border border-slate-700/80 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <Clock className="w-5 h-5 text-amber-400 shrink-0" />
            <div>
              <span className="text-xs font-bold text-slate-200 block">
                项目节点/SOP 倒计时时间衰减因子 (Time Decay Penalty)
              </span>
              <span className="text-[11px] text-slate-400">
                离 SOP 还有 300 天时改版是好方案；离节点只有 15 天时，提改版就是找死。
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-3 shrink-0">
            <span className="text-xs text-slate-300">距离节点剩余:</span>
            <div className="flex items-center space-x-1.5">
              <input
                type="number"
                min="1"
                max="180"
                value={remainingDays}
                onChange={(e) => setRemainingDays(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-16 bg-slate-900 border border-slate-700 text-white font-mono font-bold text-center rounded px-2 py-1 text-xs"
              />
              <span className="text-xs text-slate-400 font-mono">天 (Days)</span>
            </div>
          </div>
        </div>

        {isCriticalCrunchMode && (
          <div className="mb-4 p-3 bg-amber-950/40 border border-amber-500/50 rounded-xl flex items-center space-x-2 text-xs text-amber-300 animate-pulse">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              <strong>⚠️ 临界封板节点模式 (Critical Crunch Mode 激活)：</strong>
              当前距离节点剩余 <strong>{remainingDays} 天 (≤ 21天)</strong>。
              改版打样代价已处于<strong>非线性高危区</strong>，所有标记为【PCB 改版打板 / Re-spin】方案的 S (进度得分) 强制乘上衰减系数
              [{(Math.max(0.2, remainingDays / 21) * 100).toFixed(0)}%]。
            </span>
          </div>
        )}

        {/* Dynamic Weight Sliders */}
        <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-2">
              <Sliders className="w-4 h-4 text-blue-400" />
              <span className="text-xs font-semibold text-slate-200">
                权重灵敏度微调 (Interactive Sensitivity Adjuster)
              </span>
              <span className="text-[11px] text-slate-400">总权重: {totalWeight}%</span>
            </div>
            <button
              onClick={resetWeights}
              className="flex items-center space-x-1 text-xs text-slate-400 hover:text-blue-300 transition cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>恢复标准权重 (25/25/15/20/15)</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-5 gap-4 text-xs">
            {/* T */}
            <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-700/50">
              <div className="flex justify-between items-center mb-1">
                <span className="text-slate-300 font-medium">T: 技术可行性</span>
                <span className="text-blue-400 font-bold font-mono">{weights.T}%</span>
              </div>
              <input
                type="range"
                min="5"
                max="50"
                value={weights.T}
                onChange={(e) => setWeights({ ...weights, T: parseInt(e.target.value) })}
                className="w-full accent-blue-500 cursor-pointer"
              />
              <span className="text-[10px] text-slate-500 block mt-1">电路机理/裕量/复杂度</span>
            </div>

            {/* S */}
            <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-700/50">
              <div className="flex justify-between items-center mb-1">
                <span className="text-slate-300 font-medium">S: 进度风险</span>
                <span className="text-emerald-400 font-bold font-mono">{weights.S}%</span>
              </div>
              <input
                type="range"
                min="5"
                max="50"
                value={weights.S}
                onChange={(e) => setWeights({ ...weights, S: parseInt(e.target.value) })}
                className="w-full accent-emerald-500 cursor-pointer"
              />
              <span className="text-[10px] text-slate-500 block mt-1">改版打样/试验周期</span>
            </div>

            {/* C */}
            <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-700/50">
              <div className="flex justify-between items-center mb-1">
                <span className="text-slate-300 font-medium">C: 成本与物料</span>
                <span className="text-yellow-400 font-bold font-mono">{weights.C}%</span>
              </div>
              <input
                type="range"
                min="5"
                max="50"
                value={weights.C}
                onChange={(e) => setWeights({ ...weights, C: parseInt(e.target.value) })}
                className="w-full accent-yellow-500 cursor-pointer"
              />
              <span className="text-[10px] text-slate-500 block mt-1">单板BOM/模具/机时费</span>
            </div>

            {/* Q */}
            <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-700/50">
              <div className="flex justify-between items-center mb-1">
                <span className="text-slate-300 font-medium">Q: 质量与可靠性</span>
                <span className="text-purple-400 font-bold font-mono">{weights.Q}%</span>
              </div>
              <input
                type="range"
                min="5"
                max="50"
                value={weights.Q}
                onChange={(e) => setWeights({ ...weights, Q: parseInt(e.target.value) })}
                className="w-full accent-purple-500 cursor-pointer"
              />
              <span className="text-[10px] text-slate-500 block mt-1">降额/AEC-Q/DFMEA</span>
            </div>

            {/* L */}
            <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-700/50">
              <div className="flex justify-between items-center mb-1">
                <span className="text-slate-300 font-medium">L: 责任与留痕</span>
                <span className="text-indigo-400 font-bold font-mono">{weights.L}%</span>
              </div>
              <input
                type="range"
                min="5"
                max="50"
                value={weights.L}
                onChange={(e) => setWeights({ ...weights, L: parseInt(e.target.value) })}
                className="w-full accent-indigo-500 cursor-pointer"
              />
              <span className="text-[10px] text-slate-500 block mt-1">特批让步/客户认可/留痕</span>
            </div>
          </div>
        </div>
      </div>

      {result.templateContentNotice && (
        <TemplateContentNotice blocks={result.templateContentNotice.blocks} message={result.templateContentNotice.message} />
      )}

      {/* P0-2: 去黑箱化多维工程风险解构 (Multi-Dimensional Risk Breakdown) */}
      {result.multiRiskBreakdown && (() => {
        const mb = result.multiRiskBreakdown as any;
        const tech = mb.techMargin || mb.technicalRisk || { level: 'Medium', score: 65, description: '技术裕量在可控范围内', limitMetric: '设计规格要求' };
        const reli = mb.reliabilityStress || mb.reliabilityRisk || { level: 'Medium', score: 60, description: '应力负载在安全工作区内', soaStatus: 'SOA 边界内' };
        const sched = mb.scheduleDelay || mb.scheduleRisk || { level: 'Medium', score: 55, description: '节点周期仍有缓冲余量', slipWeeks: 1 };
        const cost = mb.redesignCost || mb.costRisk || { level: 'Low', score: 30, description: '无改版开模开销', toolingCostUsd: 0 };
        const veri = mb.verificationGap || mb.verificationRisk || { level: 'Low', score: 35, description: '台架验证覆盖度良好', unverifiedPoints: ['温升与瞬态复测'] };

        return (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300 flex items-center flex-wrap gap-2">
                  <span className="flex items-center">
                    <ShieldAlert className="w-4 h-4 mr-2 text-rose-400" />
                    去黑箱化多维工程风险解构 (5维风险穿透)
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700 font-normal">
                    规则引擎 · 工程域通用模板 (非本case专属)
                  </span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  严防“平均分 65”蒙混过关。芯片 SOA 越界、耐压击穿等致命硬伤坚决独立亮红，绝不与低成本相抵消。
                </p>
              </div>
              <div className="flex items-center gap-2 self-start sm:self-auto">
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-rose-950 border border-rose-800 text-rose-300">
                  裕量:{tech.score} | 应力:{reli.score} | 周期:{sched.score}
                </span>
                <button
                  type="button"
                  onClick={() => setIsRiskBreakdownOpen(!isRiskBreakdownOpen)}
                  className="flex items-center gap-1 text-xs px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-750 text-slate-300 border border-slate-700 transition cursor-pointer"
                >
                  {isRiskBreakdownOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  <span>{isRiskBreakdownOpen ? '收起详情' : '展开5维风险'}</span>
                </button>
              </div>
            </div>

            {isRiskBreakdownOpen && (
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3 text-xs mt-4 pt-4 border-t border-slate-800">
              {/* 1. 技术裕量 */}
              <div className="bg-slate-850 border border-slate-700/70 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-200">1. 技术裕量风险</span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      tech.level === 'Critical' || tech.level === 'High' || tech.level === 'CRITICAL' || tech.level === 'HIGH'
                        ? 'bg-red-950 text-red-300 border border-red-800'
                        : tech.level === 'Medium' || tech.level === 'MEDIUM'
                        ? 'bg-amber-950 text-amber-300 border border-amber-800'
                        : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                    }`}
                  >
                    {tech.level} ({tech.score ?? 50})
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 leading-normal">
                  {tech.description || tech.evidence || '技术裕量评估'}
                </p>
                <div className="text-[10px] font-mono bg-slate-900/80 px-2 py-1 rounded text-blue-300 border border-slate-800 truncate">
                  依据: {tech.limitMetric || tech.evidence || '设计标准'}
                </div>
              </div>

              {/* 2. 可靠性与 SOA */}
              <div className="bg-slate-850 border border-slate-700/70 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-200">2. 可靠性应力/SOA</span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      reli.level === 'Critical' || reli.level === 'High' || reli.level === 'CRITICAL' || reli.level === 'HIGH'
                        ? 'bg-red-950 text-red-300 border border-red-800'
                        : reli.level === 'Medium' || reli.level === 'MEDIUM'
                        ? 'bg-amber-950 text-amber-300 border border-amber-800'
                        : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                    }`}
                  >
                    {reli.level} ({reli.score ?? 50})
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 leading-normal">
                  {reli.description || reli.evidence || '应力可靠性核算'}
                </p>
                <div className="text-[10px] font-mono bg-slate-900/80 px-2 py-1 rounded text-rose-300 border border-slate-800 truncate">
                  SOA 判定: {reli.soaStatus || reli.evidence || '核算中'}
                </div>
              </div>

              {/* 3. 节点延期 */}
              <div className="bg-slate-850 border border-slate-700/70 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-200">3. 节点延期风险</span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      sched.level === 'Critical' || sched.level === 'High' || sched.level === 'CRITICAL' || sched.level === 'HIGH'
                        ? 'bg-red-950 text-red-300 border border-red-800'
                        : sched.level === 'Medium' || sched.level === 'MEDIUM'
                        ? 'bg-amber-950 text-amber-300 border border-amber-800'
                        : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                    }`}
                  >
                    {sched.level} ({sched.score ?? 50})
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 leading-normal">
                  {sched.description || sched.evidence || '进度交付评估'}
                </p>
                <div className="text-[10px] font-mono bg-slate-900/80 px-2 py-1 rounded text-amber-300 border border-slate-800 truncate">
                  预期滑期: {sched.slipWeeks !== undefined ? `+${sched.slipWeeks} 周` : sched.evidence || '按期'}
                </div>
              </div>

              {/* 4. 改版开模成本 */}
              <div className="bg-slate-850 border border-slate-700/70 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-200">4. 改版模具成本</span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      cost.level === 'Critical' || cost.level === 'High' || cost.level === 'CRITICAL' || cost.level === 'HIGH'
                        ? 'bg-red-950 text-red-300 border border-red-800'
                        : cost.level === 'Medium' || cost.level === 'MEDIUM'
                        ? 'bg-amber-950 text-amber-300 border border-amber-800'
                        : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                    }`}
                  >
                    {cost.level} ({cost.score ?? 30})
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 leading-normal">
                  {cost.description || cost.evidence || '改版开模成本评估'}
                </p>
                <div className="text-[10px] font-mono bg-slate-900/80 px-2 py-1 rounded text-yellow-300 border border-slate-800 truncate">
                  增补开销: {typeof cost.toolingCostUsd === 'number' ? `$${cost.toolingCostUsd.toLocaleString()}` : cost.evidence || '¥0'}
                </div>
              </div>

              {/* 5. 验证盲区 */}
              <div className="bg-slate-850 border border-slate-700/70 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-200">5. 验证盲区/未知</span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      veri.level === 'Critical' || veri.level === 'High' || veri.level === 'CRITICAL' || veri.level === 'HIGH'
                        ? 'bg-red-950 text-red-300 border border-red-800'
                        : veri.level === 'Medium' || veri.level === 'MEDIUM'
                        ? 'bg-amber-950 text-amber-300 border border-amber-800'
                        : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                    }`}
                  >
                    {veri.level} ({veri.score ?? 40})
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 leading-normal">
                  {veri.description || veri.evidence || '台架实测覆盖度'}
                </p>
                <div className="text-[10px] text-slate-400 truncate" title={Array.isArray(veri.unverifiedPoints) ? veri.unverifiedPoints.join('; ') : veri.evidence}>
                  待测盲区: {Array.isArray(veri.unverifiedPoints) ? veri.unverifiedPoints.join('; ') : veri.evidence || '全部实测闭环'}
                </div>
              </div>
            </div>
          )}
        </div>
      );
    })()}

      {/* 2. C-T-S-Q-L Score Table & Ranking */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300 mb-4 flex items-center">
          <BarChart2 className="w-4 h-4 mr-2 text-blue-400" />
          多方案综合打分与排名矩阵 (动态时间衰减实时联动)
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border border-slate-800 rounded-lg overflow-hidden">
            <thead className="bg-slate-800 text-slate-300 font-semibold border-b border-slate-700">
              <tr>
                <th className="p-3">排名</th>
                <th className="p-3">方案代码 / 类别</th>
                <th className="p-3">方案名称与领导通关指数</th>
                <th className="p-3 text-center">T ({weights.T}%)</th>
                <th className="p-3 text-center">S ({weights.S}%)</th>
                <th className="p-3 text-center">C ({weights.C}%)</th>
                <th className="p-3 text-center">Q ({weights.Q}%)</th>
                <th className="p-3 text-center">L ({weights.L}%)</th>
                <th className="p-3 text-center">综合基准得分</th>
                <th className="p-3 text-center">
                  <div className="flex flex-col items-center">
                    <span>最终加权得分</span>
                    <span className="text-[9px] text-amber-300 font-mono">(× M_lead)</span>
                  </div>
                </th>
                <th className="p-3 text-center">领导通关率</th>
                <th className="p-3 text-center">推荐状态</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-200">
              {sortedActions.map((opt, rank) => {
                const isVetoed = opt.veto.rejection_veto;
                const baseScore = computeBaseScore(opt);
                const finalScore = computeFinalScore(opt);
                const isTop = rank === 0 && !isVetoed;
                const hasReSpin = isReSpinOption(opt);
                const effectiveS = getEffectiveScheduleScore(opt);
                const effectiveQ = getEffectiveQScore(opt);
                const leadEval = evaluateLeadershipFit(opt, currentLeadStyle, recurrenceCount);

                return (
                  <tr
                    key={opt.id}
                    className={`hover:bg-slate-850/60 transition ${
                      isTop ? 'bg-blue-950/20' : isVetoed ? 'bg-red-950/20 text-slate-400' : ''
                    }`}
                  >
                    <td className="p-3 font-mono font-bold">
                      {isVetoed ? (
                        <span className="text-red-400">VETO</span>
                      ) : (
                        <span className={isTop ? 'text-blue-400 text-sm' : 'text-slate-400'}>
                          #{rank + 1}
                        </span>
                      )}
                    </td>
                    <td className="p-3 font-mono">
                      <span className="font-bold text-slate-200 mr-2">{opt.id}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300">
                        {opt.categoryLabel}
                      </span>
                    </td>
                    <td className="p-3 font-medium max-w-sm text-slate-200" title={opt.name}>
                      <div className="space-y-1">
                        <div className="flex items-center space-x-1.5">
                          <span className="font-semibold text-white">{opt.name}</span>
                          {hasReSpin && isCriticalCrunchMode && (
                            <span className="px-1.5 py-0.2 rounded bg-red-950 text-red-300 border border-red-700 text-[9px] shrink-0">
                              Re-spin 衰减
                            </span>
                          )}
                        </div>

                        {/* 领导态度标签与预警 */}
                        {leadEval.warningTag && (
                          <div className="text-[10px] text-amber-300 bg-amber-950/40 border border-amber-800/60 rounded px-1.5 py-0.5 leading-tight">
                            {leadEval.warningTag}
                          </div>
                        )}
                        {leadEval.positiveTag && (
                          <div className="text-[10px] text-emerald-300 bg-emerald-950/40 border border-emerald-800/60 rounded px-1.5 py-0.5 leading-tight">
                            {leadEval.positiveTag}
                          </div>
                        )}
                        {leadEval.driftPrompt && (
                          <div className="text-[10px] text-purple-300 bg-purple-950/50 border border-purple-800/60 rounded px-1.5 py-0.5 leading-tight flex items-center space-x-1">
                            <span>🔄 {leadEval.driftPrompt}</span>
                          </div>
                        )}

                        {/* 涉及行业标准依据 */}
                        {opt.referenced_standards && opt.referenced_standards.length > 0 && (
                          <div className="flex flex-wrap gap-1 pt-0.5">
                            {(Array.isArray(opt.referenced_standards) ? opt.referenced_standards : []).map((std, sIdx) => (
                              <span
                                key={sIdx}
                                className="text-[9px] font-mono px-1 py-0.2 rounded bg-slate-800/80 border border-slate-700 text-slate-400"
                              >
                                {typeof std === 'string' ? std : `${std?.standard ?? ''} ${std?.clause ?? ''}`.trim() || String((std as any)?.relevance ?? '标准条款')}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="p-3 text-center font-mono">{opt.scores.T}</td>
                    <td className="p-3 text-center font-mono">
                      {hasReSpin && isCriticalCrunchMode ? (
                        <span className="text-red-400 font-bold" title={`原始得分: ${opt.scores.S}，衰减为: ${effectiveS}`}>
                          {effectiveS} <span className="text-[10px] line-through text-slate-500">{opt.scores.S}</span>
                        </span>
                      ) : (
                        opt.scores.S
                      )}
                    </td>
                    <td className="p-3 text-center font-mono">{opt.scores.C}</td>
                    <td className="p-3 text-center font-mono">
                      {recurrenceCount > 0 && effectiveQ !== opt.scores.Q ? (
                        <span className="text-amber-400 font-bold" title={`历史复发 ${recurrenceCount} 次非线性加速惩罚：原始 Q=${opt.scores.Q} -> 有效 Q=${effectiveQ}`}>
                          {effectiveQ} <span className="text-[10px] line-through text-slate-500">{opt.scores.Q}</span>
                        </span>
                      ) : (
                        opt.scores.Q
                      )}
                    </td>
                    <td className="p-3 text-center font-mono">{opt.scores.L}</td>
                    
                    {/* 基准得分 */}
                    <td className="p-3 text-center font-mono text-slate-400">
                      {isVetoed ? '0.0' : baseScore}
                    </td>

                    {/* 最终得分 (带 M_lead 乘数) */}
                    <td className="p-3 text-center font-mono">
                      {isVetoed ? (
                        <span className="text-red-400 font-bold">0.0 (一票否决)</span>
                      ) : (
                        <div className="flex flex-col items-center">
                          <span className={`text-sm font-bold ${isTop ? 'text-blue-400' : 'text-slate-100'}`}>
                            {finalScore}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            (×{leadEval.multiplier})
                          </span>
                        </div>
                      )}
                    </td>

                    {/* 领导通关指数 Badge */}
                    <td className="p-3 text-center">
                      <div className="flex flex-col items-center space-y-1">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold font-mono border ${
                          leadEval.acceptanceRatePercent >= 80
                            ? 'bg-emerald-950/70 border-emerald-500/60 text-emerald-300'
                            : leadEval.acceptanceRatePercent >= 50
                            ? 'bg-amber-950/70 border-amber-500/60 text-amber-300'
                            : 'bg-red-950/70 border-red-500/60 text-red-300'
                        }`}>
                          {leadEval.acceptanceRatePercent}%
                        </span>
                        <span className="text-[9px] text-slate-500">
                          {leadEval.acceptanceRatePercent >= 80 ? '高通关率' : leadEval.acceptanceRatePercent >= 50 ? '需拉扯辩护' : '初审极危'}
                        </span>
                      </div>
                    </td>

                    <td className="p-3 text-center">
                      {isVetoed ? (
                        <span className="px-2 py-0.5 rounded bg-red-900/40 text-red-300 border border-red-500/50 text-[10px] font-bold">
                          一票否决
                        </span>
                      ) : isTop ? (
                        <span className="px-2 py-0.5 rounded bg-emerald-900/40 text-emerald-300 border border-emerald-500/50 text-[10px] font-bold">
                          综合首选
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700 text-[10px]">
                          备选考量
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* VETO Inspector Card (P0-2 一票否决硬约束) */}
        <div className="mt-6 border border-red-500/30 bg-red-950/15 rounded-xl p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
            <div className="flex items-center space-x-2 text-red-400 font-bold text-xs uppercase tracking-wide">
              <AlertOctagon className="w-4 h-4" />
              <span>VETO 一票否决硬约束审计 (SOA/耐压/安全目标突破熔断机制)</span>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-red-950 border border-red-700 text-red-300">
              硬约束优先级 &gt; 成本/进度综合分
            </span>
          </div>
          <p className="text-xs text-slate-300 mb-3 leading-relaxed">
            任何方案一旦触碰芯片安全工作区（SOA）、绝对耐压击穿、ISO 26262 功能安全目标违约或车规强制法规，无论其成本节省多少或进度多快，<strong>综合得分直接归零并强制一票否决</strong>，严防用进度诱惑在评审中带病放行。
          </p>

          <div className="space-y-3 text-xs">
            {result.candidateActions
              .filter((a) => a.veto.rejection_veto)
              .map((vetoed) => (
                <div key={vetoed.id} className="bg-red-900/20 border border-red-800/40 rounded-lg p-3 text-slate-300 space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-red-300 font-mono">[{vetoed.id}] {vetoed.name}</span>
                      {vetoed.veto.veto_type && (
                        <span className="px-2 py-0.5 rounded bg-red-950 text-red-300 border border-red-700 text-[10px] font-mono font-bold">
                          {vetoed.veto.veto_type}
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-red-400 font-bold font-mono">
                      综合得分: 0.0 (强制否决)
                    </span>
                  </div>

                  <div className="text-red-200 pl-1 border-l-2 border-red-600/60 py-0.5">
                    <strong>否决红线：</strong> {vetoed.veto.veto_reason}
                  </div>

                  {/* Change Impact summary if available */}
                  {vetoed.changeImpact && (
                    <div className="bg-slate-900/80 border border-slate-800 rounded p-2 text-[11px] text-slate-400 grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div>模具延期: <span className="text-slate-200 font-mono">+{vetoed.changeImpact.toolingLeadTimeWeeks} 周</span></div>
                      <div>BOM Delta: <span className="text-slate-200 font-mono">+${vetoed.changeImpact.bomCostDeltaUsd}</span></div>
                      <div>DV 重测: <span className="text-slate-200 font-mono">{vetoed.changeImpact.dvRequalificationRequired ? '必须全测' : '免全测'}</span></div>
                      <div>固件标定: <span className="text-slate-200 font-mono">{vetoed.changeImpact.softwareCalibrationRequired ? '需重新标定' : '无需改动'}</span></div>
                    </div>
                  )}

                  {vetoed.customerVetoViolations && vetoed.customerVetoViolations.length > 0 && (
                    <div className="bg-red-950/80 border border-red-700/60 rounded px-2.5 py-1.5 text-[11px] text-red-300 space-y-1">
                      <div className="font-semibold flex items-center space-x-1">
                        <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                        <span>触犯客户特殊协议 (CSA) 条款：</span>
                      </div>
                      <ul className="list-disc list-inside space-y-0.5 text-red-200 text-[10px]">
                        {(Array.isArray(vetoed.customerVetoViolations) ? vetoed.customerVetoViolations : []).map((csaViol, cIdx) => (
                          <li key={cIdx}>{csaViol}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* P0-3: 措施决策理由显性化：为什么推荐 B 而不选 A / C 三栏对比 */}
      {result.whyNotComparison && (() => {
        const raw = result.whyNotComparison as any;
        const asStringArray = (value: unknown, fallback: string[] = []): string[] => {
          if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
          if (typeof value === 'string' && value.trim()) return [value];
          return fallback;
        };
        const whyNotList = Array.isArray(raw)
          ? raw.map((item: any) => ({
              ...item,
              keyRiskOrPenalty: asStringArray(item?.keyRiskOrPenalty ?? item?.closingEvidence ?? item?.keyPenalties),
            }))
          : [
              {
                optionId: raw.recommendedOption?.optionId || 'B',
                optionName: raw.recommendedOption?.name || '推荐方案 (方案B)',
                isRecommended: true,
                verdictTitle: '为什么选推荐方案',
                coreTradeoffReason: raw.recommendedOption?.tradeoffRationale || '达成性能、周期与责任平衡的最优工程解',
                keyRiskOrPenalty: asStringArray(raw.recommendedOption?.closingEvidence, ['台架实测波形具备充足工程裕量']),
                reActivationCondition: '基准推荐',
              },
              {
                optionId: raw.whyNotOptionA?.optionId || 'A',
                optionName: raw.whyNotOptionA?.name || '重型保守方案 (方案A)',
                isRecommended: false,
                verdictTitle: '为什么不选保守方案',
                coreTradeoffReason: raw.whyNotOptionA?.whyNotChosenReason || '进度严重滑期且改版模具成本高昂',
                keyRiskOrPenalty: asStringArray(raw.whyNotOptionA?.keyPenalties, ['节点延期违约风险敞口高']),
                reActivationCondition: raw.whyNotOptionA?.reActivationCondition || '当实测方案不可行时重启改版',
              },
              {
                optionId: raw.whyNotOptionC?.optionId || 'C',
                optionName: raw.whyNotOptionC?.name || '激进/特采方案 (方案C)',
                isRecommended: false,
                verdictTitle: '为什么坚决否决激进/特采方案',
                coreTradeoffReason: raw.whyNotOptionC?.whyNotChosenReason || '触碰车规可靠性红线，存在批量售后召回风险',
                keyRiskOrPenalty: asStringArray(raw.whyNotOptionC?.keyPenalties, ['触碰设计规范红线']),
                reActivationCondition: raw.whyNotOptionC?.reActivationCondition || '仅限台架临时摸底，严禁量产装车',
              },
            ];

        return (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300 flex items-center flex-wrap gap-2">
                  <span className="flex items-center">
                    <Scale className="w-4 h-4 mr-2 text-indigo-400" />
                    措施决策理由显性化 (为什么推荐 B 而不选 A/C 三栏对比)
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700 font-normal">
                    规则引擎 · 工程域通用模板 (非本case专属)
                  </span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  向管理层与主机厂评审答辩时的“护身符”：清晰呈现权衡代价、否决硬因与备选方案重启条件。
                </p>
              </div>
              <div className="flex items-center gap-2 self-start sm:self-auto">
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-indigo-950 border border-indigo-800 text-indigo-300">
                  三栏反证法
                </span>
                <button
                  type="button"
                  onClick={() => setIsWhyNotOpen(!isWhyNotOpen)}
                  className="flex items-center gap-1 text-xs px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-750 text-slate-300 border border-slate-700 transition cursor-pointer"
                >
                  {isWhyNotOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  <span>{isWhyNotOpen ? '收起对比' : '展开三栏对比'}</span>
                </button>
              </div>
            </div>

            {isWhyNotOpen && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs mt-4 pt-4 border-t border-slate-800">
              {whyNotList.map((item: any, idx: number) => {
                const isRec = item.isRecommended;
                const isVeto = item.vetoTriggered || (!isRec && idx === 2);
                return (
                  <div
                    key={idx}
                    className={`rounded-xl p-4 space-y-3 flex flex-col justify-between border ${
                      isRec
                        ? 'bg-emerald-950/20 border-emerald-500/40'
                        : isVeto
                        ? 'bg-rose-950/20 border-rose-500/40'
                        : 'bg-amber-950/15 border-amber-500/40'
                    }`}
                  >
                    <div>
                      <div
                        className={`flex items-center space-x-2 font-bold mb-1 ${
                          isRec ? 'text-emerald-400' : isVeto ? 'text-rose-400' : 'text-amber-400'
                        }`}
                      >
                        {isRec ? <CheckCircle2 className="w-4 h-4" /> : isVeto ? <XCircle className="w-4 h-4" /> : <Info className="w-4 h-4" />}
                        <span>{item.verdictTitle || (isRec ? '为什么选推荐方案' : '为什么不选此方案')} ({item.optionId})</span>
                      </div>
                      <div className="text-xs font-semibold text-white mb-2">{item.optionName}</div>
                      <p className="text-[11px] text-slate-300 leading-relaxed bg-slate-900/60 p-2.5 rounded border border-slate-800 mb-3">
                        {item.coreTradeoffReason || item.tradeoffRationale || item.whyNotChosenReason}
                      </p>

                      <div className="space-y-1.5">
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider block ${
                            isRec ? 'text-emerald-400' : isVeto ? 'text-rose-400' : 'text-amber-400'
                          }`}
                        >
                          {isRec ? '闭环支撑证据链:' : '不选主要代价/工程红线:'}
                        </span>
                        <ul className="space-y-1 text-[11px] text-slate-300">
                          {asStringArray(item?.keyRiskOrPenalty ?? item?.closingEvidence ?? item?.keyPenalties).map((ev: string, i: number) => (
                            <li key={i} className="flex items-start">
                              <span className={`mr-1.5 font-bold ${isRec ? 'text-emerald-400' : isVeto ? 'text-rose-400' : 'text-amber-400'}`}>•</span>
                              <span>{ev}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    <div
                      className={`pt-2 border-t text-[10px] ${
                        isRec
                          ? 'border-emerald-800/40 text-emerald-300 font-mono'
                          : isVeto
                          ? 'border-rose-800/40 text-rose-300'
                          : 'border-amber-800/40 text-amber-300'
                      }`}
                    >
                      {isRec ? (
                        '✓ 达成性能、周期与责任平衡的最优解'
                      ) : (
                        <span><strong>{isVeto ? '解禁前提：' : '重启条件：'}</strong> {item.reActivationCondition || '经评审签署特采备忘录'}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      );
    })()}

      {/* Section 11: 领导视角：项目经济风险 (Technical Risk x Business Impact) */}
      {(() => {
        const candidateList = result.candidateActions || (result as any).options || [];
        const hasVeto = candidateList.some((o: any) => o?.veto?.rejection_veto);
        const econRisk = evaluateLeadershipEconomicRisk(hasVeto, remainingDays);

        return (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300 flex items-center">
                  <DollarSign className="w-4 h-4 mr-2 text-amber-400" />
                  领导视角：项目经济风险评估 (Technical Risk × Business Impact)
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  将底层技术风险直接映射至质保索赔、召回曝光、停线违约与改板研发成本，助力高层决策。
                </p>
              </div>
              <div className="flex items-center gap-2 self-start sm:self-auto">
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-amber-300 font-bold">
                  {econRisk.financialDataNotice}
                </span>
                <button
                  type="button"
                  onClick={() => setIsEconRiskOpen(!isEconRiskOpen)}
                  className="flex items-center gap-1 text-xs px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-750 text-slate-300 border border-slate-700 transition cursor-pointer"
                >
                  {isEconRiskOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  <span>{isEconRiskOpen ? '收起指标' : '展开经济风险'}</span>
                </button>
              </div>
            </div>

            {isEconRiskOpen && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs mt-4 pt-4 border-t border-slate-800">
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                <div className="text-slate-400 text-[11px] mb-1">质保返修敞口 (Warranty Risk)</div>
                <div className="text-amber-300 font-medium">{econRisk.warrantyCost}</div>
              </div>

              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                <div className="text-slate-400 text-[11px] mb-1">召回通报风险 (Recall Exposure)</div>
                <div className="text-red-300 font-medium">{econRisk.recallExposure}</div>
              </div>

              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                <div className="text-slate-400 text-[11px] mb-1">主机厂停线损失 (Production Stop)</div>
                <div className="text-white font-mono">{econRisk.productionStopCost}</div>
              </div>

              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                <div className="text-slate-400 text-[11px] mb-1">节点延误滞纳金 (Delay Cost)</div>
                <div className="text-cyan-300 font-medium">{econRisk.delayCost}</div>
              </div>

              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                <div className="text-slate-400 text-[11px] mb-1">改模打板投入 (Rework Cost)</div>
                <div className="text-slate-200 font-mono">{econRisk.reworkCost}</div>
              </div>

              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                <div className="text-slate-400 text-[11px] mb-1">攻关人力消耗 (Engineering Hours)</div>
                <div className="text-slate-200 font-mono">{econRisk.engineeringHours}</div>
              </div>
            </div>
          )}
        </div>
      );
    })()}

      {/* P0-4: 未来 24 小时执行时刻表与三色量化放行标准 (Next 24-Hour Plan & Pass/Fail Criteria) */}
      {result.next24HourPlan && (() => {
        const plan = result.next24HourPlan as any;
        const timelineList = Array.isArray(plan.timeline) ? plan.timeline : [];
        const greenPass = plan.passCriteria?.greenPass || plan.passFailCriteria?.[0]?.greenCriteria || '实测关键电气波形与温升满足车规降额要求，具备工艺窗口。';
        const yellowConditional = plan.passCriteria?.yellowConditional || plan.passFailCriteria?.[0]?.yellowCriteria || '增加局部吸收滤波或限额受控放行，由系统与质量负责人签字。';
        const redHardStop = plan.passCriteria?.redHardStop || plan.passFailCriteria?.[0]?.redCriteria || '坚决熔断，禁止出货，启动保守方案 PCB 打板改版。';

        return (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300 flex items-center flex-wrap gap-2">
                  <span className="flex items-center">
                    <Clock className="w-4 h-4 mr-2 text-cyan-400" />
                    未来 24 小时攻关行动时刻表 (量化执行与三色门禁)
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700 font-normal">
                    规则引擎 · 工程域通用模板 (非本case专属)
                  </span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  拒绝空泛建议，按小时级节奏推进物理台架测试、交叉复核与量化门禁决策。
                </p>
              </div>
              <div className="flex items-center gap-2 self-start sm:self-auto">
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-cyan-950 border border-cyan-800 text-cyan-300">
                  {timelineList.length} 阶段节点
                </span>
                <button
                  type="button"
                  onClick={() => setIs24HourPlanOpen(!is24HourPlanOpen)}
                  className="flex items-center gap-1 text-xs px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-750 text-slate-300 border border-slate-700 transition cursor-pointer"
                >
                  {is24HourPlanOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  <span>{is24HourPlanOpen ? '收起计划' : '展开24h计划'}</span>
                </button>
              </div>
            </div>

            {is24HourPlanOpen && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-4 pt-4 border-t border-slate-800">
              {/* Left: Hour-by-Hour Timeline */}
              <div className="lg:col-span-2 space-y-3">
                <span className="text-xs font-bold text-slate-300 block uppercase tracking-wider">
                  阶段执行时刻表 (Timeline Milestones):
                </span>
                <div className="space-y-2.5">
                  {timelineList.map((item: any, idx: number) => (
                    <div
                      key={idx}
                      className="bg-slate-850/80 border border-slate-700/60 rounded-lg p-3 flex flex-col sm:flex-row sm:items-start gap-3"
                    >
                      <div className="shrink-0">
                        <span className="inline-block px-2.5 py-1 rounded bg-cyan-950 text-cyan-300 border border-cyan-700 text-xs font-mono font-bold">
                          {item.timeWindow || item.phase || `阶段 ${idx + 1}`}
                        </span>
                      </div>

                      <div className="space-y-1 flex-1 text-xs">
                        <div className="flex flex-wrap items-center justify-between gap-1">
                          <span className="font-bold text-white">{item.taskTitle || item.task || '攻关验证任务'}</span>
                          <div className="flex items-center space-x-2 text-[10px] text-slate-400 font-mono">
                            <span>负责: <strong className="text-slate-200">{item.owner || '硬件工程师'}</strong></span>
                            <span>工装: <strong className="text-slate-200">{item.toolingOrEquip || item.phase || '测试台架'}</strong></span>
                          </div>
                        </div>

                        <p className="text-[11px] text-slate-300 leading-normal">{item.actionDetails || item.task}</p>

                        <div className="text-[11px] text-emerald-300 font-mono pt-1">
                          交付物: {item.deliverable || '实测数据报告与波形记录'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right: Pass / Fail Thresholds (三色门禁判定) */}
              <div className="space-y-3">
                <span className="text-xs font-bold text-slate-300 block uppercase tracking-wider">
                  三色量化门禁标准 (Pass / Fail Thresholds):
                </span>

                <div className="space-y-2.5 text-xs">
                  {/* Green Pass */}
                  <div className="bg-emerald-950/30 border border-emerald-500/50 rounded-lg p-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-emerald-300 flex items-center">
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1.5 text-emerald-400" />
                        🟢 达标放行 (Pass)
                      </span>
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-900/60 text-emerald-200">
                        无条件推进
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-200 font-mono font-medium">
                      {greenPass}
                    </div>
                    <p className="text-[10px] text-slate-400">
                      实测波形与温升满足车规降额要求，具备批量制造工艺窗口。
                    </p>
                  </div>

                  {/* Yellow Conditional */}
                  <div className="bg-amber-950/30 border border-amber-500/50 rounded-lg p-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-amber-300 flex items-center">
                        <AlertTriangle className="w-3.5 h-3.5 mr-1.5 text-amber-400" />
                        🟡 条件受控放行 (Conditional)
                      </span>
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-900/60 text-amber-200">
                        限额受限放行
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-200 font-mono font-medium">
                      {yellowConditional}
                    </div>
                    <p className="text-[10px] text-slate-400">
                      触发增补受控措施（如追加局部灌封吸波或下调极端工况占空比）。
                    </p>
                  </div>

                  {/* Red Fail */}
                  <div className="bg-rose-950/30 border border-rose-500/50 rounded-lg p-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-rose-300 flex items-center">
                        <XCircle className="w-3.5 h-3.5 mr-1.5 text-rose-400" />
                        🔴 熔断中止 (Hard Stop)
                      </span>
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-rose-900/60 text-rose-200">
                        立即熔断
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-200 font-mono font-medium">
                      {redHardStop}
                    </div>
                    <p className="text-[10px] text-slate-400">
                      坚决熔断，启动保守方案 PCB Re-spin 或升级高压/高耐热规格，拒绝侥幸。
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      );
    })()}
    </div>
  );
};
