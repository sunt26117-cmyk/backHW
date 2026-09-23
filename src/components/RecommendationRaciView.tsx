import React, { useState } from 'react';
import { CopilotAnalysisResult, RaciItem, IssueInput, ProjectContext } from '../types';
import { resolveEngineeringDomain } from '../utils/scenarioDomainEngine';
import { toStringArray } from '../utils/decisionFrame';
import {
  CheckCircle2,
  ShieldAlert,
  AlertTriangle,
  ArrowRight,
  Clock,
  Users,
  Flame,
  FileCheck,
  Slash,
  ShieldX,
  CornerDownRight,
  ShieldCheck,
  Lock,
  UserCheck,
  Zap,
  Scale,
  BrainCircuit,
  Eye,
  Briefcase,
  Code2,
  Cpu,
  Target,
  Package,
  Microscope,
  Play,
  RotateCcw,
  Sparkles,
  MessagesSquare,
  XCircle,
  Send,
  ChevronDown,
  ChevronUp,
  Layers,
  Copy,
  Check,
  CalendarClock,
  Milestone,
  ExternalLink,
} from 'lucide-react';
import { buildDualTimelinePlan } from '../utils/dualTimelineEngine';

interface RecommendationRaciViewProps {
  result: CopilotAnalysisResult | null;
  context?: ProjectContext;
  issue: IssueInput; // 必填：组件起始处即调用 resolveEngineeringDomain(issue)，缺了会直接崩
  onGoToDocs: () => void;
}

export const RecommendationRaciView: React.FC<RecommendationRaciViewProps> = ({
  result,
  context,
  issue,
  onGoToDocs,
}) => {
  // 动态多方推演博弈工作台状态
  const [wargameOption, setWargameOption] = useState<'RECOMMENDED' | 'RE_SPIN' | 'CONCESSION'>('RECOMMENDED');
  const [wargameLeadStyle, setWargameLeadStyle] = useState<'CONSERVATIVE' | 'AGILE_DELIVERY' | 'PROCESS_DEFENSIVE'>('AGILE_DELIVERY');
  const [timelineFilter, setTimelineFilter] = useState<'ALL' | 'CONTAINMENT' | 'PERMANENT'>('ALL');
  const [hasCopiedTimeline, setHasCopiedTimeline] = useState<boolean>(false);
  const domain = resolveEngineeringDomain(issue);
  const problem = issue.failurePhenomenon || issue.engineeringConcern || '当前工程问题';
  const measurement = issue.actualMeasurement || '暂无实测数据';
  const dynamicDialogue = {
    recommended: `“当前 ${domain} 问题不能只看一个结果。需要围绕 ${problem.slice(0, 72)} 建立可重复边界，再决定是否改板/改参数。”`,
    respin: `“如果需要改硬件，必须先明确 ${domain} 的根因证据、变更影响和回归矩阵，不能只凭经验扩大改动范围。”`,
    concession: `“即使节点很紧，也不能把未验证的 ${domain} 边界直接写成 PASS；特采必须有期限、风险负责人和关闭条件。”`,
    proof: `当前输入证据：${measurement}。系统建议先用 ${domain} 领域验证链缩小未知项，再做跨专业会签。`,
  };
  const [currentRound, setCurrentRound] = useState<number>(1);
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>('ALL');
  
  // 复杂深层剖析默认收起（降低首屏视觉压力，按需展开）
  const [isWargameOpen, setIsWargameOpen] = useState<boolean>(false);
  const [isRolePsychologyOpen, setIsRolePsychologyOpen] = useState<boolean>(false);
  const [isRaciOpen, setIsRaciOpen] = useState<boolean>(false);
  const [isDualTimelineOpen, setIsDualTimelineOpen] = useState<boolean>(false);

  if (!result) {
    return <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-sm text-slate-400">当前典型工况分析结果尚未生成，请稍候。</div>;
  }

  const { finalRecommendation, raciMatrix, containment, capa, riskRatings } = result;
  // [健壮性] 这几个字段可能被 AI / 离线导入 JSON 写成字符串或对象，直接 .filter/.map 会崩，先收口成数组
  const rawCalculatedEvidence = result.analysisBasis?.calculatedOutputEvidence;
  const calculatedEvidence = Array.isArray(rawCalculatedEvidence) ? rawCalculatedEvidence : [];
  const unknownsBlockingDecision = toStringArray(result.decisionFrame?.unknownsBlockingDecision);
  const rawDomainAssessments = result.multiDomainAnalysis?.domainAssessments;
  const domainAssessments = Array.isArray(rawDomainAssessments) ? rawDomainAssessments : [];
  const insufficientEvidenceCount = calculatedEvidence.filter((e) => e.status === 'INSUFFICIENT_INPUT').length;
  const lowEvidenceDomains = domainAssessments.filter((d) => /LOW|低|不足/i.test(d.evidenceLevel || ''));
  const safeWhyReason = Array.isArray(finalRecommendation?.whyReason) ? finalRecommendation.whyReason : finalRecommendation?.whyReason ? [String(finalRecommendation.whyReason)] : [];
  const safeImmediateSteps = Array.isArray(finalRecommendation?.immediateSteps) ? finalRecommendation.immediateSteps : [];
  const safeUnacceptableActions = Array.isArray(finalRecommendation?.unacceptableActions) ? finalRecommendation.unacceptableActions : [];
  const safeStopConditions = Array.isArray(finalRecommendation?.stopConditions) ? finalRecommendation.stopConditions : [];
  const optionByCategory = { RECOMMENDED: finalRecommendation.recommendedOptionId, RE_SPIN: 'Option A', CONCESSION: 'Option C' } as const;
  const getWargameAction = () => result.candidateActions?.find(a => a.id === optionByCategory[wargameOption]) || result.candidateActions?.[0];
  const wargameAction = getWargameAction();
  const wargameSummary = wargameAction ? `${wargameAction.name}｜${wargameAction.timeCost}｜${wargameAction.verificationCost}` : '当前工况候选方案';

  // 判定所选方案是否涉及降额违规、临界或高风险
  const isSafetyOrDeratingCritical =
    riskRatings.overallRisk === 'High' ||
    riskRatings.functionalSafetyRisk === 'High' ||
    riskRatings.reliabilityRisk === 'High' ||
    safeWhyReason.some(
      (r) => r.includes('降额') || r.includes('安全') || r.includes('特批') || r.includes('临界')
    ) ||
    finalRecommendation.recommendedOptionName.includes('特采') ||
    finalRecommendation.recommendedOptionName.includes('让步');

  // 4.2 PSCR (产品安全代表) 专项行处理
  const hasExistingPscr = raciMatrix.some(
    (r) => r.role === 'PSCR' || r.role.includes('产品安全')
  );

  const enhancedRaciMatrix: RaciItem[] = [...raciMatrix];

  if (!hasExistingPscr) {
    enhancedRaciMatrix.push({
      role: 'PSCR (产品安全代表)',
      raciType: isSafetyOrDeratingCritical ? 'A' : 'C',
      owner: 'PSCR 独立代表',
      action: isSafetyOrDeratingCritical
        ? '【门禁卡点】全流程独立评估设计降额击穿与功能安全风险，签署出库门禁。'
        : '参与安全与法规符合性评审，审核安全机制与产品符合性。',
      output: '《产品安全性独立评估意见书》',
      dueDate: '出厂前 48h',
      decisionGate: '样件出库 / SOP 质量放行门禁 (Mandatory Gate)',
    });
  } else if (isSafetyOrDeratingCritical) {
    // 强制将现有 PSCR 标为 A (Accountable)
    enhancedRaciMatrix.forEach((item) => {
      if (item.role === 'PSCR' || item.role.includes('产品安全')) {
        item.raciType = 'A';
        item.action =
          '【门禁卡点】全流程独立评估设计降额击穿与功能安全风险，签署出库门禁。';
        item.output = '《产品安全性独立评估意见书》';
      }
    });
  }

  const getRaciBadge = (type: string) => {
    switch (type) {
      case 'R':
        return 'bg-blue-600/30 text-blue-300 border-blue-500/50 font-bold';
      case 'A':
        return 'bg-purple-600/30 text-purple-300 border-purple-500/50 font-bold';
      case 'C':
        return 'bg-amber-600/30 text-amber-300 border-amber-500/50 font-medium';
      case 'I':
        return 'bg-slate-700 text-slate-300 border-slate-600 font-normal';
      case 'Approval':
        return 'bg-emerald-600/30 text-emerald-300 border-emerald-500/50 font-bold';
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  return (
    <div className="space-y-6">
      {/* 0. 证据基础与未闭合缺口 —— 让最终推荐带着"这个结论建立在哪些真实计算/哪些还没闭合"一起给出，
          不额外发明新的置信度算法，只是把 analysisBasis.calculatedOutputEvidence / decisionFrame.unknownsBlockingDecision /
          multiDomainAnalysis.domainAssessments 这几个已经算好、但之前这个视图从未读取过的字段展示出来。 */}
      {(calculatedEvidence.length > 0 || unknownsBlockingDecision.length > 0 || lowEvidenceDomains.length > 0) && (
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-4">
          <div className="flex items-center space-x-2 mb-3">
            <Microscope className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-bold text-slate-200 uppercase tracking-wide">证据基础与未闭合缺口</span>
            {insufficientEvidenceCount > 0 && (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950/60 text-amber-300 border border-amber-600/40">
                {insufficientEvidenceCount} 项计算因输入不足未闭合
              </span>
            )}
          </div>

          {calculatedEvidence.length > 0 && (
            <div className="grid sm:grid-cols-2 gap-2 mb-3">
              {calculatedEvidence.map((ev) => (
                <div
                  key={ev.id}
                  className={`p-2.5 rounded-lg border text-[11px] ${
                    ev.status === 'INSUFFICIENT_INPUT'
                      ? 'bg-amber-950/30 border-amber-700/40'
                      : ev.complianceVerdict === 'CRITICAL' || ev.complianceVerdict === 'FAIL'
                      ? 'bg-red-950/30 border-red-700/40'
                      : 'bg-slate-800/60 border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-200">{ev.title}</span>
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                        ev.status === 'INSUFFICIENT_INPUT' ? 'bg-amber-800/60 text-amber-200' : 'bg-emerald-900/60 text-emerald-300'
                      }`}
                    >
                      {ev.status === 'INSUFFICIENT_INPUT' ? '输入不足' : `已核算 · ${ev.complianceVerdict || '—'}`}
                    </span>
                  </div>
                  {ev.status === 'INSUFFICIENT_INPUT' ? (
                    <div className="text-amber-300/90 mt-1">缺失：{ev.missingInputs?.join('、') || '—'}</div>
                  ) : (
                    <div className="text-slate-400 mt-1">
                      {ev.value !== undefined ? `${ev.value}${ev.unit || ''}` : '—'}
                      {ev.safetyMargin !== undefined ? ` · 裕量 ${ev.safetyMargin}${ev.unit || ''}` : ''}
                      {' · '}引擎：{ev.engine}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {lowEvidenceDomains.length > 0 && (
            <div className="mb-2 text-[11px] text-slate-400">
              <span className="text-slate-300 font-semibold">证据浓度偏低的领域：</span>
              {lowEvidenceDomains.map((d) => `${d.domain}（${d.evidenceLevel}）`).join('、')}
            </div>
          )}

          {unknownsBlockingDecision.length > 0 && (
            <div className="text-[11px] text-slate-400">
              <span className="text-slate-300 font-semibold">阻塞决策的未闭合项：</span>
              {unknownsBlockingDecision.join('；')}
            </div>
          )}
        </div>
      )}

      {/* 1. Final Recommendation Hero Header */}
      <div className="bg-slate-900 border border-blue-500/40 rounded-xl p-6 shadow-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center space-x-2 mb-1">
              <span className="px-2.5 py-0.5 rounded text-xs font-bold bg-blue-600 text-white tracking-wide uppercase">
                Final Recommended Decision
              </span>
              <span className="text-xs text-emerald-400 font-semibold font-mono">
                [Grade: {finalRecommendation.recommendationGrade}]
              </span>
            </div>
            <h2 className="text-lg font-bold text-white">
              {finalRecommendation.recommendedOptionName}
            </h2>
          </div>

          <button
            onClick={onGoToDocs}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs font-medium rounded-lg transition flex items-center cursor-pointer shadow-sm self-start sm:self-auto"
          >
            生成全套工程留痕文档 (邮件/特批/纪要)
            <ArrowRight className="w-4 h-4 ml-1.5" />
          </button>
        </div>

        {/* 4.2 PSCR 门禁卡点注入警示框 */}
        {isSafetyOrDeratingCritical && (
          <div className="mb-4 p-3.5 bg-red-950/40 border border-red-500/60 rounded-xl flex items-start space-x-3 text-xs text-red-200">
            <Lock className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold text-red-300 block text-sm">
                [PSCR 门禁卡点激活]：依据车规功能安全与降额违约准则，PSCR 已升级为 A (Accountable)
              </span>
              <p className="leading-relaxed text-[11px] text-red-200">
                <strong>【一票否决卡点】：</strong> 在当前工程样件出厂前，必须取得 PSCR (产品安全与符合性代表) 签发的
                <span className="underline font-bold text-white ml-1 mr-1">《产品安全性独立评估意见书》</span>
                ，否则仓库严禁调拨放行，工厂制造产线严禁出库！
              </p>
            </div>
          </div>
        )}

        {/* Why this measure has lowest overall risk */}
        <div className="bg-slate-850 p-4 rounded-lg border border-slate-700/60 mb-6">
          <span className="text-xs font-semibold text-blue-300 block mb-2 uppercase tracking-wide">
            核心推荐依据 (Why Reason: 为什么该方案整体风险最小):
          </span>
          <ul className="space-y-2 text-xs text-slate-200">
            {safeWhyReason.map((reason, idx) => (
              <li key={idx} className="flex items-start">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 mr-2 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{reason}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Immediate Steps */}
        <div className="mb-6">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300 mb-3 flex items-center">
            <Clock className="w-4 h-4 mr-2 text-blue-400" />
            现在立刻做什么 (Immediate Action Roadmap - 明确责任人与截止时间)
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {safeImmediateSteps.map((step) => (
              <div
                key={step.step}
                className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-3.5 flex flex-col justify-between text-xs"
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-bold text-blue-400 font-mono">
                      Step {step.step}: {step.title}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-slate-900 text-amber-300 font-mono text-[10px] border border-slate-700">
                      {step.deadline}
                    </span>
                  </div>
                  <p className="text-slate-300 leading-relaxed text-[11px] mb-2">{step.action}</p>
                </div>
                <div className="text-[11px] text-slate-400 border-t border-slate-700/50 pt-2 flex justify-between">
                  <span>执行负责人:</span>
                  <span className="text-slate-200 font-semibold">{step.owner}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Boundary Rules: Unacceptable Actions & Stop Conditions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          {/* Unacceptable Actions */}
          <div className="bg-red-950/20 border border-red-500/30 rounded-lg p-4">
            <div className="flex items-center space-x-1.5 text-red-400 font-bold uppercase tracking-wide mb-2">
              <ShieldX className="w-4 h-4" />
              <span>暂时不要做 / 不可接受的做法</span>
            </div>
            <ul className="space-y-2 text-slate-300">
              {safeUnacceptableActions.map((item, idx) => (
                <li key={idx} className="flex items-start">
                  <span className="text-red-400 font-bold mr-1.5 shrink-0">✕</span>
                  <span className="text-[11px]">{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Stop Conditions */}
          <div className="bg-amber-950/20 border border-amber-500/30 rounded-lg p-4">
            <div className="flex items-center space-x-1.5 text-amber-400 font-bold uppercase tracking-wide mb-2">
              <AlertTriangle className="w-4 h-4" />
              <span>停止条件 (Stop Conditions)</span>
            </div>
            <ul className="space-y-2 text-slate-300">
              {safeStopConditions.map((item, idx) => (
                <li key={idx} className="flex items-start">
                  <span className="text-amber-400 font-bold mr-1.5 shrink-0">■</span>
                  <span className="text-[11px]">{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Plan B & Triggers */}
          <div className="bg-blue-950/20 border border-blue-500/30 rounded-lg p-4">
            <div className="flex items-center space-x-1.5 text-blue-400 font-bold uppercase tracking-wide mb-2">
              <CornerDownRight className="w-4 h-4" />
              <span>备选退路 (Plan B)</span>
            </div>
            <p className="text-slate-300 text-[11px] leading-relaxed mb-3">
              {finalRecommendation.planB}
            </p>
            <div className="border-t border-slate-800 pt-2 text-[10px] text-slate-400">
              <span className="font-semibold text-slate-300">重评触发器：</span>
              {(Array.isArray(finalRecommendation.reEvaluationTriggers) ? finalRecommendation.reEvaluationTriggers : typeof finalRecommendation.reEvaluationTriggers === 'string' ? [finalRecommendation.reEvaluationTriggers] : []).join('；') || '暂无重评触发器'}
            </div>
          </div>
        </div>
      </div>

      {/* 2. 团队成员与领导多方推演博弈工作台 (Interactive Multi-Stakeholder Wargame Simulator) */}
      <div className="bg-slate-900 border border-indigo-500/40 rounded-xl p-6 shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 font-mono">
                INTERACTIVE WARGAME SIMULATOR
              </span>
              <span className="text-[11px] text-emerald-400 font-semibold font-mono">
                ● 8方博弈实时推演引擎就绪
              </span>
            </div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <BrainCircuit className="w-5 h-5 text-indigo-400" />
              <span>团队成员隐秘担忧点透视与跨职能推演博弈台</span>
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              模拟“想解决问题，但绝不想多干活、绝不替别人背锅”的汽车研发真实政治生态。选择候选方案与领导风格，推演各方发难、甩锅推诿与免责闭环。
            </p>
          </div>

          <button
            onClick={() => setIsWargameOpen(!isWargameOpen)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-lg border border-slate-700 transition cursor-pointer self-start sm:self-auto"
          >
            {isWargameOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            <span>{isWargameOpen ? '收起推演台' : '展开动态推演'}</span>
          </button>
        </div>

        {isWargameOpen && (
          <div className="space-y-5">
            {/* 方案与领导风格控制器 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-xl bg-slate-950/70 border border-slate-800">
              {/* 1. 拟推演的候选工程方案 */}
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-2 flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-blue-400" />
                  <span>选择用于推演博弈的候选方案：</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => {
                      setWargameOption('RECOMMENDED');
                      setCurrentRound(1);
                    }}
                    className={`p-2.5 rounded-lg border text-left cursor-pointer transition text-xs ${
                      wargameOption === 'RECOMMENDED'
                        ? 'bg-blue-950/60 border-blue-500 text-white shadow-xs'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="font-bold text-blue-300">首选推荐 ({finalRecommendation.recommendedOptionId})</div>
                    <div className="text-[10px] text-slate-400 mt-0.5 leading-snug">{finalRecommendation.recommendedOptionName}</div>
                    <div className="text-[9px] text-emerald-400 mt-1 font-mono">{result.candidateActions?.find(a => a.id === finalRecommendation.recommendedOptionId)?.timeCost || '按当前工况计算'} · {result.candidateActions?.find(a => a.id === finalRecommendation.recommendedOptionId)?.verificationCost || '按验证计划核算'}</div>
                  </button>

                  <button
                    onClick={() => {
                      setWargameOption('RE_SPIN');
                      setCurrentRound(1);
                    }}
                    className={`p-2.5 rounded-lg border text-left cursor-pointer transition text-xs ${
                      wargameOption === 'RE_SPIN'
                        ? 'bg-purple-950/60 border-purple-500 text-white shadow-xs'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="font-bold text-purple-300">保守候选 (Option A)</div>
                    <div className="text-[10px] text-slate-400 mt-0.5 leading-snug">{result.candidateActions?.find(a => a.id === 'Option A')?.name || 'Option A'}</div>
                    <div className="text-[9px] text-amber-400 mt-1 font-mono">{result.candidateActions?.find(a => a.id === 'Option A')?.timeCost || '按当前工况计算'} · {result.candidateActions?.find(a => a.id === 'Option A')?.verificationCost || '按验证计划核算'}</div>
                  </button>

                  <button
                    onClick={() => {
                      setWargameOption('CONCESSION');
                      setCurrentRound(1);
                    }}
                    className={`p-2.5 rounded-lg border text-left cursor-pointer transition text-xs ${
                      wargameOption === 'CONCESSION'
                        ? 'bg-rose-950/60 border-rose-500 text-white shadow-xs'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="font-bold text-rose-300">方案 C (特采放行)</div>
                    <div className="text-[10px] text-slate-400 mt-0.5 leading-snug">降额贴线让步强行出库</div>
                    <div className="text-[9px] text-red-400 mt-1 font-mono">耗时: 0天 · 法律高危</div>
                  </button>
                </div>
              </div>

              {/* 2. 硬件直属领导当前态度倾向 */}
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-2 flex items-center gap-1.5">
                  <UserCheck className="w-4 h-4 text-amber-400" />
                  <span>设定硬件直属领导的态度倾向：</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setWargameLeadStyle('AGILE_DELIVERY')}
                    className={`p-2.5 rounded-lg border text-left cursor-pointer transition text-xs ${
                      wargameLeadStyle === 'AGILE_DELIVERY'
                        ? 'bg-emerald-950/60 border-emerald-500 text-white'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="font-bold text-emerald-300">🚀 敏捷交付优先</div>
                    <div className="text-[10px] text-slate-400 mt-0.5 leading-snug">保当前节点，内部消化</div>
                  </button>

                  <button
                    onClick={() => setWargameLeadStyle('CONSERVATIVE')}
                    className={`p-2.5 rounded-lg border text-left cursor-pointer transition text-xs ${
                      wargameLeadStyle === 'CONSERVATIVE'
                        ? 'bg-blue-950/60 border-blue-500 text-white'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="font-bold text-blue-300">🛡️ 技术求稳型</div>
                    <div className="text-[10px] text-slate-400 mt-0.5 leading-snug">极重降额，宁可稍推迟</div>
                  </button>

                  <button
                    onClick={() => setWargameLeadStyle('PROCESS_DEFENSIVE')}
                    className={`p-2.5 rounded-lg border text-left cursor-pointer transition text-xs ${
                      wargameLeadStyle === 'PROCESS_DEFENSIVE'
                        ? 'bg-amber-950/60 border-amber-500 text-white'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="font-bold text-amber-300">⚖️ 流程免责型</div>
                    <div className="text-[10px] text-slate-400 mt-0.5 leading-snug">权责划清，绝不单方背锅</div>
                  </button>
                </div>
              </div>
            </div>

            {/* 回合演进控制器 (Round 1 -> 4) */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-950/40 p-3 rounded-xl border border-slate-800">
              <div className="flex items-center space-x-2 text-xs">
                <span className="text-slate-400 font-medium">推演博弈推进阶段:</span>
                <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-bold font-mono">
                  ROUND {currentRound} / 4
                </span>
              </div>

              <div className="flex items-center space-x-1.5 overflow-x-auto">
                {[
                  { r: 1, title: '回合 1: 提案提出' },
                  { r: 2, title: '回合 2: 团队发难与甩锅' },
                  { r: 3, title: '回合 3: 证据反击与免责' },
                  { r: 4, title: '回合 4: 纳什均衡共识' },
                ].map((item) => (
                  <button
                    key={item.r}
                    onClick={() => setCurrentRound(item.r)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer whitespace-nowrap ${
                      currentRound === item.r
                        ? 'bg-indigo-600 text-white shadow-xs font-semibold'
                        : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {item.title}
                  </button>
                ))}
              </div>
            </div>

            {/* 当前回合推演剧本对话与各方心理碰撞呈现 */}
            <div className="bg-slate-950/80 rounded-xl p-4 border border-slate-800/90">
              {/* 回合 1: 提案提出 */}
              {currentRound === 1 && (
                <div className="space-y-3">
                  <div className="flex items-start gap-3 bg-blue-950/30 border border-blue-800/40 p-3.5 rounded-xl">
                    <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-xs shrink-0">
                      HW
                    </div>
                    <div className="space-y-1 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-blue-300">硬件工程师 (提案发起方)</span>
                        <span className="text-[10px] text-slate-400">正在跨职能对齐会议上汇报方案...</span>
                      </div>
                      <p className="text-slate-200 leading-relaxed">
                        {wargameOption === 'RECOMMENDED' && (
                          <>
                            “当前典型工况为【${wargameAction?.name || '候选方案'}】。工程问题：${result.coreConclusion.problemSummary}；实施周期：${wargameAction?.timeCost || '待核算'}；验证成本：${wargameAction?.verificationCost || '待核算'}。请按当前门禁与客户红线评审。”
                          </>
                        )}
                        {wargameOption === 'RE_SPIN' && (
                          <>
                            “当前工况下保守候选为【${wargameAction?.name || 'Option A'}】。其技术收益：${wargameAction?.expectedBenefit || '按当前工况计算'}；周期：${wargameAction?.timeCost || '待核算'}；请确认是否触发节点熔断或客户审批。”
                          </>
                        )}
                        {wargameOption === 'CONCESSION' && (
                          <>
                            “当前工况下节点优先候选为【${wargameAction?.name || 'Option C'}】。时间窗口剩余 ${result?.context?.daysRemaining ?? '—'} 天；但必须同时审查其 VETO、残余风险与验证缺口，不能用节点压力替代工程证据。”
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="text-right text-[11px] text-slate-400">
                    💡 提示：点击上方的【回合 2: 团队发难与甩锅】，查看各核心角色听完此提案后的第一心理反应与推诿质疑！
                  </div>
                </div>
              )}

              {/* 回合 2: 团队发难与甩锅推演 */}
              {currentRound === 2 && (
                <div className="space-y-3">
                  <div className="text-xs font-semibold text-rose-400 flex items-center gap-1.5 mb-2">
                    <ShieldAlert className="w-4 h-4" />
                    <span>各专业核心角色的核心担忧发难与阻力透视：</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    {/* PM 发难 */}
                    <div className="bg-emerald-950/20 border border-emerald-500/30 p-3 rounded-lg">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-bold text-emerald-300 flex items-center gap-1.5">
                          <Briefcase className="w-3.5 h-3.5" /> 项目经理 (PM)
                        </span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                          {wargameOption === 'RE_SPIN' ? '⚡ 暴跳如雷' : wargameOption === 'RECOMMENDED' ? '⚠️ 高度戒备' : '🤔 犹豫默许'}
                        </span>
                      </div>
                      <p className="text-slate-300 text-[11px] leading-relaxed">
                        {wargameOption === 'RE_SPIN' &&
                          '“推迟 4 周？！你知道车厂对 DV 延期的索赔是按天计算的吗？向高层汇报时亮红灯，整个项目的年终奖全部泡汤！改版坚决不同意！”'}
                        {wargameOption === 'RECOMMENDED' &&
                          '“3 天真能搞定？如果 3 天后台架测出来还是超标怎么办？必须立下军令状，绝不能出现二次返工！”'}
                        {wargameOption === 'CONCESSION' &&
                          '“只要能保住本周五送检，我没意见。但质量和领导必须在特批单签字，责任不能落在项目组头上。”'}
                      </p>
                    </div>

                    {/* 软件负责人发难 */}
                    <div className="bg-purple-950/20 border border-purple-500/30 p-3 rounded-lg">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-bold text-purple-300 flex items-center gap-1.5">
                          <Code2 className="w-3.5 h-3.5" /> 底层软件 (SW Lead)
                        </span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-purple-950 text-purple-300 border border-purple-800">
                          {wargameOption === 'RECOMMENDED' ? '⚡ 坚决甩锅/推诿' : '☕ 旁观吃瓜'}
                        </span>
                      </div>
                      <p className="text-slate-300 text-[11px] leading-relaxed">
                        {wargameOption === 'RECOMMENDED' &&
                          '“凭什么硬件搞不定噪声就让软件擦屁股？底层固件已经冻结！三相全开下桥会多占用 PWM 中断，万一引入 ASIL D 中断重入死锁，这锅我们软件绝对不背！”'}
                        {wargameOption === 'RE_SPIN' &&
                          '“硬件改版换管子不涉及底层软件控制架构，只要管脚兼容，我们全力支持硬件重新改版。”'}
                        {wargameOption === 'CONCESSION' &&
                          '“软件不改动，我们没意见，谁提特采谁背锅。”'}
                      </p>
                    </div>

                    {/* 测试负责人发难 */}
                    <div className="bg-cyan-950/20 border border-cyan-500/30 p-3 rounded-lg">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-bold text-cyan-300 flex items-center gap-1.5">
                          <Microscope className="w-3.5 h-3.5" /> 测试验证 (DVT Lead)
                        </span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
                          ⚠️ 严防测试漏判
                        </span>
                      </div>
                      <p className="text-slate-300 text-[11px] leading-relaxed">
                        {wargameOption === 'RECOMMENDED' &&
                          dynamicDialogue.recommended}
                        {wargameOption === 'RE_SPIN' &&
                          dynamicDialogue.respin}
                        {wargameOption === 'CONCESSION' &&
                          dynamicDialogue.concession}
                      </p>
                    </div>

                    {/* 产品安全代表 (PSCR) 与 硬件直属领导 */}
                    <div className="bg-red-950/20 border border-red-500/30 p-3 rounded-lg">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-bold text-red-300 flex items-center gap-1.5">
                          <Lock className="w-3.5 h-3.5" /> 安全官 (PSCR) & 硬件主管
                        </span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-red-950 text-red-300 border border-red-800">
                          {wargameOption === 'CONCESSION' ? '🛑 一票否决卡死' : '🔍 关注免责证明'}
                        </span>
                      </div>
                      <p className="text-slate-300 text-[11px] leading-relaxed">
                        {wargameOption === 'CONCESSION' &&
                          `“【一票否决】当前 ${domain} 工况仍存在未关闭的关键门禁。${riskRatings.overallRisk === 'High' ? '当前综合风险为 High，不能用节点压力替代工程证据。' : '仍需完成当前工况的关键实测与门禁复核。'} PSCR / 质量代表在证据未闭环前不得签署正式放行。”`}
                        {wargameOption === 'RECOMMENDED' &&
                          (wargameLeadStyle === 'CONSERVATIVE'
                            ? '“必须给出严格的数学机理推导和原厂书面保证，确认 RC 吸收不影响正常 PWM 开关效率，否则我不能签字。”'
                            : wargameLeadStyle === 'PROCESS_DEFENSIVE'
                            ? '“软件要改标定参数？必须先让软件负责人提变更申请，把责任划分清楚。”'
                            : '“只要 3 天内能拿出示波器压降实测报告，且结温在 SOA 裕量内，我同意按此方案推进！”')}
                        {wargameOption === 'RE_SPIN' &&
                          '“虽然稳妥，但改版时间太长，大老板会直接找我问责。必须评估有没有原位救急的 Plan B。”'}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* 回合 3: 证据反击与免责防御 */}
              {currentRound === 3 && (
                <div className="space-y-3">
                  <div className="text-xs font-semibold text-blue-400 flex items-center gap-1.5 mb-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span>系统赋能的【确定性物理证据链反击与免责防御盾牌】：</span>
                  </div>

                  <div className="bg-slate-900/90 border border-blue-500/30 p-4 rounded-xl space-y-2 text-xs">
                    {wargameOption === 'RECOMMENDED' && (
                      <>
                        <div className="flex items-start gap-2">
                          <span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 font-mono text-[10px] shrink-0">
                            防御 1: 能量与结温数学做实
                          </span>
                          <p className="text-slate-200">
                            {dynamicDialogue.proof}
                          </p>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 font-mono text-[10px] shrink-0">
                            防御 2: 软件零风险标定打消推诿
                          </span>
                          <p className="text-slate-200">
                            反驳软件中断风险：无需修改核心控制环路算法，仅需配置驱动芯片寄存器 <code>0x04 = 0x03</code>（急停刹车自动切入全下桥模式），硬件工程师已在台架打桩验证通过，无代码冻结风险。
                          </p>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono text-[10px] shrink-0">
                            防御 3: 现货供应链与原厂公函
                          </span>
                          <p className="text-slate-200">
                            当前物料/供应链证据应以实际库存、供应商文件和变更单为准；本回合不允许系统虚构库存数量或原厂确认函。
                          </p>
                        </div>
                      </>
                    )}

                    {wargameOption === 'RE_SPIN' && (
                      <p className="text-amber-300">
                        当前候选方案需基于实际成本、采购周期和节点数据重新计算；未录入的罚款/交期不得被当成事实。
                      </p>
                    )}

                    {wargameOption === 'CONCESSION' && (
                      <p className="text-red-300">
                        特采只能在当前规格适用性、风险授权、期限和关闭条件均明确时受控推进；没有这些证据时进入 STOP，不以假设替代审批。
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* 回合 4: 纳什均衡共识达成 */}
              {currentRound === 4 && (
                <div className="space-y-3">
                  <div className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5 mb-2">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>最终博弈平衡点 (Nash Equilibrium) 与跨专业会签共识：</span>
                  </div>

                  {wargameOption === 'RECOMMENDED' ? (
                    <div className="bg-emerald-950/30 border border-emerald-500/50 p-4 rounded-xl space-y-3 text-xs">
                      <div className="flex items-center justify-between border-b border-emerald-900/60 pb-2">
                        <span className="font-bold text-emerald-300 text-sm">
                          🎉 全员达成会签共识：方案 B 获批准进入实施闭环！
                        </span>
                        <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono font-bold text-[10px]">
                          通关指数: 96%
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                        <div className="p-2 rounded bg-slate-900/80 border border-slate-800">
                          <span className="text-blue-300 font-semibold block">👔 硬件主管 (A)</span>
                          <span className="text-emerald-400 font-bold">✔ 签字批准</span>
                          <p className="text-slate-400 text-[10px] mt-0.5">有原厂函+数学做实，免责无忧</p>
                        </div>
                        <div className="p-2 rounded bg-slate-900/80 border border-slate-800">
                          <span className="text-emerald-300 font-semibold block">⏱️ 项目经理 (A/C)</span>
                          <span className="text-emerald-400 font-bold">✔ 窗口放行</span>
                          <p className="text-slate-400 text-[10px] mt-0.5">3天完成，15天节点绿灯保住</p>
                        </div>
                        <div className="p-2 rounded bg-slate-900/80 border border-slate-800">
                          <span className="text-purple-300 font-semibold block">💻 底层软件 (R)</span>
                          <span className="text-emerald-400 font-bold">✔ 配合标定</span>
                          <p className="text-slate-400 text-[10px] mt-0.5">仅配置寄存器，不动核心环路</p>
                        </div>
                        <div className="p-2 rounded bg-slate-900/80 border border-slate-800">
                          <span className="text-red-300 font-semibold block">⚖️ PSCR / 质量 (C)</span>
                          <span className="text-emerald-400 font-bold">✔ 解除卡点</span>
                          <p className="text-slate-400 text-[10px] mt-0.5">降额回至42%，安全机制达标</p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-red-950/30 border border-red-500/50 p-4 rounded-xl text-xs space-y-2">
                      <div className="font-bold text-red-300 text-sm">
                        ⚠️ 博弈未能达成共识：该方案存在无法调和的利益冲突或一票否决！
                      </div>
                      <p className="text-slate-300 text-[11px] leading-relaxed">
                        {wargameOption === 'RE_SPIN' &&
                          '因 28 天工期导致 15 天 DV 节点严重击穿，PM 与直属领导坚决拒签。请切换至【方案 B】推演最优均衡解。'}
                        {wargameOption === 'CONCESSION' &&
                          '因 94.5% 极端降额违约，PSCR 与质量部行使一票否决权，出库通道被锁死。请切换至【方案 B】推演最优均衡解。'}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 3. 汽车开发链条 8 大核心角色深度心理透视与攻心策略卡片 */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300 flex items-center">
              <Users className="w-4 h-4 mr-2 text-indigo-400" />
              汽车开发链条 8 大核心角色心理透视与攻心策略全矩阵
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              深度剖析每一位利益攸关方的真实 KPI、隐秘担忧点、下一步甩锅动作与精准攻心通关策略。
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setIsRolePsychologyOpen(!isRolePsychologyOpen)}
              className="flex items-center gap-1 text-xs px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-750 text-slate-300 border border-slate-700 transition cursor-pointer"
            >
              {isRolePsychologyOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              <span>{isRolePsychologyOpen ? '收起角色剖析' : '展开8角色透视'}</span>
            </button>
          </div>
        </div>

        {isRolePsychologyOpen && (
          <div className="mt-4 pt-4 border-t border-slate-800">
            {/* 角色筛选器 */}
            <div className="flex items-center space-x-1 overflow-x-auto text-[11px] mb-4 pb-1">
              {[
                { id: 'ALL', label: '全部 8 角色' },
                { id: 'HW', label: '硬件主管' },
                { id: 'PM', label: '项目经理' },
                { id: 'SW', label: '底层软件' },
                { id: 'SYS', label: '系统整车' },
                { id: 'DVT', label: '测试验证' },
                { id: 'QA', label: '品质质量' },
                { id: 'SCM', label: '采购供应' },
                { id: 'PSCR', label: '安全PSCR' },
              ].map((f) => (
                <button
                  key={f.id}
                  onClick={() => setSelectedRoleFilter(f.id)}
                  className={`px-2.5 py-1 rounded-md transition cursor-pointer whitespace-nowrap ${
                    selectedRoleFilter === f.id
                      ? 'bg-indigo-600 text-white font-semibold'
                      : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
          {/* 1. 硬件负责人 / 直属领导 */}
          {(selectedRoleFilter === 'ALL' || selectedRoleFilter === 'HW') && (
            <div className="bg-slate-850/80 border border-blue-500/30 rounded-xl p-4 flex flex-col justify-between hover:border-blue-500/50 transition">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <Cpu className="w-4 h-4 text-blue-400" />
                    <span className="font-bold text-white text-xs">硬件负责人 / 直属主管 (HW Lead)</span>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-950 text-blue-300 border border-blue-800">
                    审批签字人 (A)
                  </span>
                </div>

                <div className="space-y-2 mt-2">
                  <div className="bg-slate-900/60 p-2 rounded border border-slate-800">
                    <span className="text-blue-400 font-semibold block text-[11px] mb-0.5">🔍 真实关注点：</span>
                    <p className="text-slate-300 leading-relaxed text-[11px]">
                      别把事情搞大到大老板那里；量产后别在我管辖模块爆雷；绝对别让团队再通宵盲目改版擦屁股。
                    </p>
                  </div>

                  <div className="bg-slate-900/60 p-2 rounded border border-slate-800">
                    <span className="text-amber-400 font-semibold block text-[11px] mb-0.5">⚠️ 最怕的事情 (隐秘担忧)：</span>
                    <p className="text-slate-300 leading-relaxed text-[11px]">
                      同意了让步特采，结果后续 DV/客户路试复现甚至烧管，在管理层复盘会上被公开点名处刑。
                    </p>
                  </div>

                  <div className="bg-slate-900/60 p-2 rounded border border-slate-800">
                    <span className="text-rose-400 font-semibold block text-[11px] mb-0.5">🎯 下一步大概率动作预测：</span>
                    <p className="text-slate-300 leading-relaxed text-[11px]">
                      把方案打回，要求硬件工程师“再多做几组极限环境摸底”、“找原厂FAE出保证函”，以此拖延并转嫁签字责任。
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-3 pt-2.5 border-t border-slate-700/60 bg-blue-950/20 -mx-4 -mb-4 p-3 rounded-b-xl">
                <span className="text-[11px] font-bold text-blue-300 flex items-center mb-1">
                  <ShieldCheck className="w-3.5 h-3.5 mr-1 text-emerald-400" />
                  系统提供的【攻心/过关应对策略】：
                </span>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  递交由专业计算引擎生成的<strong>确定性机理闭环报告与原厂公函留痕</strong>。明确告知：“这是当前满足 SOP 且经数学推导唯一能过审计的方案，免责链条已做实”，彻底卸下其个人签字心理包袱。
                </p>
              </div>
            </div>
          )}

          {/* 2. 项目经理 (PM) */}
          {(selectedRoleFilter === 'ALL' || selectedRoleFilter === 'PM') && (
            <div className="bg-slate-850/80 border border-emerald-500/30 rounded-xl p-4 flex flex-col justify-between hover:border-emerald-500/50 transition">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <Briefcase className="w-4 h-4 text-emerald-400" />
                    <span className="font-bold text-white text-xs">项目经理 (Project Manager - PM)</span>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
                    进度控制人 (A/C)
                  </span>
                </div>

                <div className="space-y-2 mt-2">
                  <div className="bg-slate-900/60 p-2 rounded border border-slate-800">
                    <span className="text-emerald-400 font-semibold block text-[11px] mb-0.5">🔍 真实关注点：</span>
                    <p className="text-slate-300 leading-relaxed text-[11px]">
                      关键里程碑（如 DV 送检、装车节点）绝对不能挂红灯；项目台账里决不能出现不可控延期。
                    </p>
                  </div>

                  <div className="bg-slate-900/60 p-2 rounded border border-slate-800">
                    <span className="text-amber-400 font-semibold block text-[11px] mb-0.5">⚠️ 最怕的事情 (隐秘担忧)：</span>
                    <p className="text-slate-300 leading-relaxed text-[11px]">
                      硬件人员轻描淡写一句“我们要重新改版投板，要推迟4周”，导致向高层/车厂汇报时节点全盘崩溃。
                    </p>
                  </div>

                  <div className="bg-slate-900/60 p-2 rounded border border-slate-800">
                    <span className="text-rose-400 font-semibold block text-[11px] mb-0.5">🎯 下一步大概率动作预测：</span>
                    <p className="text-slate-300 leading-relaxed text-[11px]">
                      疯狂催促“能不能先发临时版本让客户先跑起来”、“能不能只飞线跳过测试”。极力施压硬件吞下延期。
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-3 pt-2.5 border-t border-slate-700/60 bg-emerald-950/20 -mx-4 -mb-4 p-3 rounded-b-xl">
                <span className="text-[11px] font-bold text-emerald-300 flex items-center mb-1">
                  <ShieldCheck className="w-3.5 h-3.5 mr-1 text-emerald-400" />
                  系统提供的【攻心/过关应对策略】：
                </span>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  绝不只给单一延期方案。直接提供<strong>“双轨推进机制 (Track A/B) + 零工期原位补丁”</strong>，用现成可抄送的决策邮件模板把球踢向各方联合确认，让 PM 获得对上汇报的安全抓手。
                </p>
              </div>
            </div>
          )}

          {/* 3. 软件负责人 (SW Lead) */}
          {(selectedRoleFilter === 'ALL' || selectedRoleFilter === 'SW') && (
            <div className="bg-slate-850/80 border border-purple-500/30 rounded-xl p-4 flex flex-col justify-between hover:border-purple-500/50 transition">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <Code2 className="w-4 h-4 text-purple-400" />
                    <span className="font-bold text-white text-xs">底层软件 / 控制算法负责人 (SW Lead)</span>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-950 text-purple-300 border border-purple-800">
                    协同执行人 (R)
                  </span>
                </div>

                <div className="space-y-2 mt-2">
                  <div className="bg-slate-900/60 p-2 rounded border border-slate-800">
                    <span className="text-purple-400 font-semibold block text-[11px] mb-0.5">🔍 真实关注点：</span>
                    <p className="text-slate-300 leading-relaxed text-[11px]">
                      别动我的核心控制环路；别让我改已经冻结的底层驱动和寄存器配置；别增加 CPU 负载。
                    </p>
                  </div>

                  <div className="bg-slate-900/60 p-2 rounded border border-slate-800">
                    <span className="text-amber-400 font-semibold block text-[11px] mb-0.5">⚠️ 最怕的事情 (隐秘担忧)：</span>
                    <p className="text-slate-300 leading-relaxed text-[11px]">
                      硬件搞不定噪声或泵升，就甩锅要求软件“加算法滤波”、“改死区配置”、“做下桥制动”，结果软件引入新 Bug 替硬件背锅。
                    </p>
                  </div>

                  <div className="bg-slate-900/60 p-2 rounded border border-slate-800">
                    <span className="text-rose-400 font-semibold block text-[11px] mb-0.5">🎯 下一步大概率动作预测：</span>
                    <p className="text-slate-300 leading-relaxed text-[11px]">
                      以“当前处于发版代码冻结期”、“增加PWM中断会导致ASIL D超频跑飞”为由，直接在需求评审会上无情驳回。
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-3 pt-2.5 border-t border-slate-700/60 bg-purple-950/20 -mx-4 -mb-4 p-3 rounded-b-xl">
                <span className="text-[11px] font-bold text-purple-300 flex items-center mb-1">
                  <ShieldCheck className="w-3.5 h-3.5 mr-1 text-emerald-400" />
                  系统提供的【攻心/过关应对策略】：
                </span>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  硬件<strong>自行消化吸收（原位并阻容/换高耐压管/贴磁珠）</strong>。若确需软件配合，仅需一次性修改标定参数（如寄存器下发 2 字节），且硬件提前给出详细台架测试与安全边界实测数据，绝不碰核心算法架构。
                </p>
              </div>
            </div>
          )}

          {/* 4. 系统 / 整车匹配负责人 (System Lead) */}
          {(selectedRoleFilter === 'ALL' || selectedRoleFilter === 'SYS') && (
            <div className="bg-slate-850/80 border border-amber-500/30 rounded-xl p-4 flex flex-col justify-between hover:border-amber-500/50 transition">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <Target className="w-4 h-4 text-amber-400" />
                    <span className="font-bold text-white text-xs">系统与整车匹配负责人 (System Lead)</span>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-800">
                    联合会签人 (C/A)
                  </span>
                </div>

                <div className="space-y-2 mt-2">
                  <div className="bg-slate-900/60 p-2 rounded border border-slate-800">
                    <span className="text-amber-400 font-semibold block text-[11px] mb-0.5">🔍 真实关注点：</span>
                    <p className="text-slate-300 leading-relaxed text-[11px]">
                      整车功能别降级；别因为 ECU 内部问题修改整车线束定义或整车通讯协议。
                    </p>
                  </div>

                  <div className="bg-slate-900/60 p-2 rounded border border-slate-800">
                    <span className="text-amber-400 font-semibold block text-[11px] mb-0.5">⚠️ 最怕的事情 (隐秘担忧)：</span>
                    <p className="text-slate-300 leading-relaxed text-[11px]">
                      车厂客户在整车联调中发现功能故障，向上汇报导致系统工程团队被牵连问责。
                    </p>
                  </div>

                  <div className="bg-slate-900/60 p-2 rounded border border-slate-800">
                    <span className="text-rose-400 font-semibold block text-[11px] mb-0.5">🎯 下一步大概率动作预测：</span>
                    <p className="text-slate-300 leading-relaxed text-[11px]">
                      强调“原系统规范就是这么定义的”，拒绝任何放宽或特批，要求 ECU 硬件在控制器内部独立达标。
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-3 pt-2.5 border-t border-slate-700/60 bg-amber-950/20 -mx-4 -mb-4 p-3 rounded-b-xl">
                <span className="text-[11px] font-bold text-amber-300 flex items-center mb-1">
                  <ShieldCheck className="w-3.5 h-3.5 mr-1 text-emerald-400" />
                  系统提供的【攻心/过关应对策略】：
                </span>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  用严密测试事实（如金属外壳屏蔽衰减、寄生线束电感解耦分析）证明问题边界。若线束引发超标，以<strong>详实数据提交整车线束改善建议（外部ECR）</strong>，权责分明，促成跨专业协同联合签字。
                </p>
              </div>
            </div>
          )}

          {/* 5. 测试与验证负责人 (DVT / Test Lead) */}
          {(selectedRoleFilter === 'ALL' || selectedRoleFilter === 'DVT') && (
            <div className="bg-slate-850/80 border border-cyan-500/30 rounded-xl p-4 flex flex-col justify-between hover:border-cyan-500/50 transition">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <Microscope className="w-4 h-4 text-cyan-400" />
                    <span className="font-bold text-white text-xs">测试与验证负责人 (DVT / Test Lead)</span>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-950 text-cyan-300 border border-cyan-800">
                    质量把关人 (C)
                  </span>
                </div>

                <div className="space-y-2 mt-2">
                  <div className="bg-slate-900/60 p-2 rounded border border-slate-800">
                    <span className="text-cyan-400 font-semibold block text-[11px] mb-0.5">🔍 真实关注点：</span>
                    <p className="text-slate-300 leading-relaxed text-[11px]">
                      测试规范覆盖度与测试排期；台架设备安全性；是否有明确的红黄绿判定阈值限值。
                    </p>
                  </div>

                  <div className="bg-slate-900/60 p-2 rounded border border-slate-800">
                    <span className="text-amber-400 font-semibold block text-[11px] mb-0.5">⚠️ 最怕的事情 (隐秘担忧)：</span>
                    <p className="text-slate-300 leading-relaxed text-[11px]">
                      极端工况下样件爆毁甚至烧坏测试台架测功机；或者测试误判放行后，路试烧管倒查测试失职。
                    </p>
                  </div>

                  <div className="bg-slate-900/60 p-2 rounded border border-slate-800">
                    <span className="text-rose-400 font-semibold block text-[11px] mb-0.5">🎯 下一步大概率动作预测：</span>
                    <p className="text-slate-300 leading-relaxed text-[11px]">
                      要求将测试循环次数翻倍（如加测 2000 次急停），或以环境试验箱排期满为由推迟测试进场。
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-3 pt-2.5 border-t border-slate-700/60 bg-cyan-950/20 -mx-4 -mb-4 p-3 rounded-b-xl">
                <span className="text-[11px] font-bold text-cyan-300 flex items-center mb-1">
                  <ShieldCheck className="w-3.5 h-3.5 mr-1 text-emerald-400" />
                  系统提供的【攻心/过关应对策略】：
                </span>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  提供明确的<strong>量化红黄绿三色波形判定标准</strong>（如 Vds ≤ 32V 判定放行，≥ 35V 判定熔断），并由硬件工程师驻场台架跟班测试，承担样机首拆责任。
                </p>
              </div>
            </div>
          )}

          {/* 6. 品质与质量经理 (Quality / PQE / SQE) */}
          {(selectedRoleFilter === 'ALL' || selectedRoleFilter === 'QA') && (
            <div className="bg-slate-850/80 border border-teal-500/30 rounded-xl p-4 flex flex-col justify-between hover:border-teal-500/50 transition">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <FileCheck className="w-4 h-4 text-teal-400" />
                    <span className="font-bold text-white text-xs">品质与质量经理 (Quality / PQE / SQE)</span>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-950 text-teal-300 border border-teal-800">
                    门禁审核人 (C/A)
                  </span>
                </div>

                <div className="space-y-2 mt-2">
                  <div className="bg-slate-900/60 p-2 rounded border border-slate-800">
                    <span className="text-teal-400 font-semibold block text-[11px] mb-0.5">🔍 真实关注点：</span>
                    <p className="text-slate-300 leading-relaxed text-[11px]">
                      IATF 16949 / 8D 闭环报告完整性，过程一致性与可追溯性，严防 0km 与批量质量索赔。
                    </p>
                  </div>

                  <div className="bg-slate-900/60 p-2 rounded border border-slate-800">
                    <span className="text-amber-400 font-semibold block text-[11px] mb-0.5">⚠️ 最怕的事情 (隐秘担忧)：</span>
                    <p className="text-slate-300 leading-relaxed text-[11px]">
                      客户驻厂审核时查出未经审批的飞线或临时补丁，导致整个工厂质量评级降级。
                    </p>
                  </div>

                  <div className="bg-slate-900/60 p-2 rounded border border-slate-800">
                    <span className="text-rose-400 font-semibold block text-[11px] mb-0.5">🎯 下一步大概率动作预测：</span>
                    <p className="text-slate-300 leading-relaxed text-[11px]">
                      卡住样件出库变更单，要求补充 3 批次 30 台的 CPK 过程能力分析与 1000h 双 85 高温高湿试验。
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-3 pt-2.5 border-t border-slate-700/60 bg-teal-950/20 -mx-4 -mb-4 p-3 rounded-b-xl">
                <span className="text-[11px] font-bold text-teal-300 flex items-center mb-1">
                  <ShieldCheck className="w-3.5 h-3.5 mr-1 text-emerald-400" />
                  系统提供的【攻心/过关应对策略】：
                </span>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  提供标准格式<strong>8D 根本机理闭环报告</strong>与 AEC-Q101 认证证明，清晰定义受控批次范围与返工 SOP 作业指导书，保证每一道返工均受控可溯。
                </p>
              </div>
            </div>
          )}

          {/* 7. 采购与供应链 (Procurement / SCM) */}
          {(selectedRoleFilter === 'ALL' || selectedRoleFilter === 'SCM') && (
            <div className="bg-slate-850/80 border border-orange-500/30 rounded-xl p-4 flex flex-col justify-between hover:border-orange-500/50 transition">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <Package className="w-4 h-4 text-orange-400" />
                    <span className="font-bold text-white text-xs">采购与供应链经理 (Procurement / SCM)</span>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-orange-950 text-orange-300 border border-orange-800">
                    资源保障人 (C)
                  </span>
                </div>

                <div className="space-y-2 mt-2">
                  <div className="bg-slate-900/60 p-2 rounded border border-slate-800">
                    <span className="text-orange-400 font-semibold block text-[11px] mb-0.5">🔍 真实关注点：</span>
                    <p className="text-slate-300 leading-relaxed text-[11px]">
                      物料交期 (Lead Time)、BOM 成本增幅、最小起订量 (MOQ) 与合格供应商名录 (AVL) 兼容性。
                    </p>
                  </div>

                  <div className="bg-slate-900/60 p-2 rounded border border-slate-800">
                    <span className="text-amber-400 font-semibold block text-[11px] mb-0.5">⚠️ 最怕的事情 (隐秘担忧)：</span>
                    <p className="text-slate-300 leading-relaxed text-[11px]">
                      工程师随意选定特规独家器件，原厂交期 26 周甚至断货停产，导致总装停线每天面临巨额罚款。
                    </p>
                  </div>

                  <div className="bg-slate-900/60 p-2 rounded border border-slate-800">
                    <span className="text-rose-400 font-semibold block text-[11px] mb-0.5">🎯 下一步大概率动作预测：</span>
                    <p className="text-slate-300 leading-relaxed text-[11px]">
                      直接打回物料新增申请：“该型号非公司 AVL 库内料号，交期超 16 周，请优先使用现有库存物料”。
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-3 pt-2.5 border-t border-slate-700/60 bg-orange-950/20 -mx-4 -mb-4 p-3 rounded-b-xl">
                <span className="text-[11px] font-bold text-orange-300 flex items-center mb-1">
                  <ShieldCheck className="w-3.5 h-3.5 mr-1 text-emerald-400" />
                  系统提供的【攻心/过关应对策略】：
                </span>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  优先选用<strong>现有库存中已有的通用 0805 车规阻容料号</strong>；若需更换 MOS，优先筛选已有二供 Pin-to-Pin 替代型号，并提供原厂代理商现货 Buffer 协议。
                </p>
              </div>
            </div>
          )}

          {/* 8. 产品安全独立代表 (PSCR) */}
          {(selectedRoleFilter === 'ALL' || selectedRoleFilter === 'PSCR') && (
            <div className="bg-slate-850/80 border border-red-500/30 rounded-xl p-4 flex flex-col justify-between hover:border-red-500/50 transition">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <Lock className="w-4 h-4 text-red-400" />
                    <span className="font-bold text-white text-xs">产品安全独立代表 (PSCR)</span>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-950 text-red-300 border border-red-800">
                    安全一票否决人 (A/Approval)
                  </span>
                </div>

                <div className="space-y-2 mt-2">
                  <div className="bg-slate-900/60 p-2 rounded border border-slate-800">
                    <span className="text-red-400 font-semibold block text-[11px] mb-0.5">🔍 真实关注点：</span>
                    <p className="text-slate-300 leading-relaxed text-[11px]">
                      ISO 26262 功能安全符合性、ASIL 降额标准合规、第三方认证审计与产品全生命周期法律责任。
                    </p>
                  </div>

                  <div className="bg-slate-900/60 p-2 rounded border border-slate-800">
                    <span className="text-amber-400 font-semibold block text-[11px] mb-0.5">⚠️ 最怕的事情 (隐秘担忧)：</span>
                    <p className="text-slate-300 leading-relaxed text-[11px]">
                      在存在严重降额违规或未经验证的安全机制下签字，整车发生安全事故或召回时承担个人连带责任。
                    </p>
                  </div>

                  <div className="bg-slate-900/60 p-2 rounded border border-slate-800">
                    <span className="text-rose-400 font-semibold block text-[11px] mb-0.5">🎯 下一步大概率动作预测：</span>
                    <p className="text-slate-300 leading-relaxed text-[11px]">
                      直接行使 PSCR 独立否决权，冻结样件发货权限，要求召开全体跨部门安全裁决委员会并向管理层发红牌。
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-3 pt-2.5 border-t border-slate-700/60 bg-red-950/20 -mx-4 -mb-4 p-3 rounded-b-xl">
                <span className="text-[11px] font-bold text-red-300 flex items-center mb-1">
                  <ShieldCheck className="w-3.5 h-3.5 mr-1 text-emerald-400" />
                  系统提供的【攻心/过关应对策略】：
                </span>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  严格执行<strong>安全机制（SM）有效性核查与降额裕量计算</strong>。提供实测与仿真双闭环证据，证明降额裕量从超标恢复至合规（如电压峰值降至额定值 70% 以下），正式签发《产品安全性独立评估意见书》。
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    )}
  </div>

      {/* 3. RACI Matrix (含 PSCR 独立卡点行) */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300 flex items-center">
              <Users className="w-4 h-4 mr-2 text-blue-400" />
              RACI 跨专业职责与决策门禁矩阵 (含 PSCR 产品安全代表卡点)
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              R (执行负责人) · A (最终追责与审批人) · C (咨询顾问) · I (抄送知情) · PSCR (产品安全与符合性独立代表)
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-blue-950 border border-blue-800 text-blue-300">
              {enhancedRaciMatrix.length} 个跨专业矩阵项
            </span>
            <button
              type="button"
              onClick={() => setIsRaciOpen(!isRaciOpen)}
              className="flex items-center gap-1 text-xs px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-750 text-slate-300 border border-slate-700 transition cursor-pointer"
            >
              {isRaciOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              <span>{isRaciOpen ? '收起矩阵' : '展开 RACI 矩阵'}</span>
            </button>
          </div>
        </div>

        {isRaciOpen && (
          <div className="overflow-x-auto mt-4 pt-4 border-t border-slate-800">
            <table className="w-full text-left text-xs border border-slate-800 rounded-lg overflow-hidden">
            <thead className="bg-slate-800 text-slate-300 font-semibold border-b border-slate-700">
              <tr>
                <th className="p-3">专业角色</th>
                <th className="p-3 text-center">RACI 类型</th>
                <th className="p-3">具体负责人员</th>
                <th className="p-3">关键行动职责 (Action)</th>
                <th className="p-3">输出交付物 (Deliverable)</th>
                <th className="p-3 text-center">截止日期</th>
                <th className="p-3">关联决策门禁</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-200">
              {enhancedRaciMatrix.map((item, idx) => {
                const isPscrRow = item.role.includes('PSCR') || item.role.includes('产品安全');
                return (
                  <tr
                    key={idx}
                    className={`hover:bg-slate-850/60 transition ${
                      isPscrRow && isSafetyOrDeratingCritical ? 'bg-red-950/25 border-l-2 border-l-red-500' : ''
                    }`}
                  >
                    <td className="p-3 font-bold text-slate-200">
                      <div className="flex items-center space-x-1.5">
                        <span>{item.role}</span>
                        {isPscrRow && isSafetyOrDeratingCritical && (
                          <span className="px-1.5 py-0.2 rounded bg-red-900 text-red-200 text-[9px] font-bold">
                            门禁卡点
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-3 text-center">
                      <span className={`px-2 py-0.5 rounded text-[11px] border ${getRaciBadge(item.raciType)}`}>
                        {item.raciType}
                      </span>
                    </td>
                    <td className="p-3 font-medium text-slate-300">{item.owner}</td>
                    <td className="p-3 max-w-sm text-slate-300 leading-normal">{item.action}</td>
                    <td className="p-3 font-mono text-slate-300">{item.output}</td>
                    <td className="p-3 text-center font-mono text-amber-300">{item.dueDate}</td>
                    <td className="p-3 text-slate-400 text-[11px]">{item.decisionGate}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>

      {/* 3. 双层工程时间轴机制：T+24h 应急临时遏制 vs 下一阶段永久纠正 (Upgrade 2) */}
      {(() => {
        const effectiveContext: ProjectContext = context || (result?.context as ProjectContext) || {
          projectName: '车载ECU项目',
          productType: '车载域控制器',
          ecuType: 'ECU',
          projectPhase: 'DV',
          asilLevel: 'ASIL B',
          customer: '主机厂',
          sopDate: '2026-12-31',
          nextMilestone: 'DV 准入',
          daysRemaining: 14,
          costConstraint: '中等敏感',
          sampleStatus: 'B样件',
        };

        const effectiveIssue: IssueInput = issue || {
          issueCategories: ['EMC'],
          requirement: '',
          actualMeasurement: '',
          testCondition: '',
          environment: '',
          failurePhenomenon: '',
          engineeringConcern: '',
          notes: '',
          attachments: [],
        };

        const dualTimeline = result.dualTimeline || buildDualTimelinePlan(result, effectiveContext, effectiveIssue);

        const handleCopyTimeline = () => {
          if (!dualTimeline) return;
          const text = `【车规硬件双层工程时间轴行动方案】
=========================================
项目：${effectiveContext.projectName} (阶段：${effectiveContext.projectPhase}，交付倒计时：${effectiveContext.daysRemaining}天)

【第一轨：T+24h 应急临时遏制 (Containment Phase)】
- 时间窗口：${dualTimeline.containmentPhase.timeWindow}
- 措施定位：${dualTimeline.containmentPhase.title}
- 核心目标：${dualTimeline.containmentPhase.objective}
- 硬件影响：${dualTimeline.containmentPhase.hardwareImpact}
- 责任主体：${dualTimeline.containmentPhase.responsibilityRole}
- 行动清单：
${dualTimeline.containmentPhase.actions.map((a, i) => `  ${i + 1}. [${a.duration}] ${a.step} (负责人: ${a.owner} | ${a.hardwareImpact}) -> 交付物: ${a.deliverable}\n     详情: ${a.detail}`).join('\n')}
- 现场验证指标：${dualTimeline.containmentPhase.verificationCriteria}
- 临时放行门禁：${dualTimeline.containmentPhase.exitCriteria}

-----------------------------------------
【第二轨：下一阶段永久纠正措施 (Permanent Action / CAPA)】
- 时间窗口：${dualTimeline.permanentPhase.timeWindow}
- 措施定位：${dualTimeline.permanentPhase.title}
- 核心目标：${dualTimeline.permanentPhase.objective}
- 硬件影响：${dualTimeline.permanentPhase.hardwareImpact}
- 责任主体：${dualTimeline.permanentPhase.responsibilityRole}
- 行动清单：
${dualTimeline.permanentPhase.actions.map((a, i) => `  ${i + 1}. [${a.duration}] ${a.step} (负责人: ${a.owner} | ${a.hardwareImpact}) -> 交付物: ${a.deliverable}\n     详情: ${a.detail}`).join('\n')}
- 终极验收标准：${dualTimeline.permanentPhase.verificationCriteria}
- 正式结案门禁：${dualTimeline.permanentPhase.exitCriteria}

=========================================
【战略协同权衡】：
${dualTimeline.strategicTradeoff}`;

          navigator.clipboard.writeText(text);
          setHasCopiedTimeline(true);
          setTimeout(() => setHasCopiedTimeline(false), 2500);
        };

        return (
          <div className="space-y-6">
            {/* 顶栏控制台与说明 */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-md">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="px-2.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono">
                      DUAL-TIMELINE ARCHITECTURE
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono">
                      车规交付双轨闭环规范 (Containment vs CAPA)
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <CalendarClock className="w-5 h-5 text-amber-400" />
                    <span>双层工程时间轴：T+24h 应急临时遏制 vs 下一阶段永久纠正</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 max-w-3xl leading-relaxed">
                    硬件工程决策绝非单选。当前倒计时仅剩 <span className="text-amber-400 font-bold font-mono">{effectiveContext.daysRemaining} 天</span>，必须实行<strong>「T+24h 0天板卡工期快速围堵保交付装车」</strong>与<strong>「下一阶段投板消除物理根因保量产防错」</strong>双轨协同推进。
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                  {/* 视图切换 */}
                  <div className="inline-flex rounded-lg bg-slate-800/80 p-1 border border-slate-700/60 text-xs">
                    <button
                      onClick={() => setTimelineFilter('ALL')}
                      className={`px-3 py-1 rounded-md transition font-medium cursor-pointer ${
                        timelineFilter === 'ALL'
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      双轨并行视图
                    </button>
                    <button
                      onClick={() => setTimelineFilter('CONTAINMENT')}
                      className={`px-3 py-1 rounded-md transition font-medium cursor-pointer flex items-center gap-1 ${
                        timelineFilter === 'CONTAINMENT'
                          ? 'bg-amber-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-amber-300'
                      }`}
                    >
                      <span>⚡ T+24h 应急</span>
                    </button>
                    <button
                      onClick={() => setTimelineFilter('PERMANENT')}
                      className={`px-3 py-1 rounded-md transition font-medium cursor-pointer flex items-center gap-1 ${
                        timelineFilter === 'PERMANENT'
                          ? 'bg-emerald-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-emerald-300'
                      }`}
                    >
                      <span>🛡️ 下版永久根治</span>
                    </button>
                  </div>

                  {/* 复制行动清单按钮 */}
                  <button
                    onClick={handleCopyTimeline}
                    className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 active:bg-slate-850 text-slate-200 text-xs font-medium rounded-lg border border-slate-700 flex items-center gap-1.5 transition cursor-pointer"
                    title="复制双层时间轴完整执行清单，便于发送至邮件、Jira 或汇报纪要"
                  >
                    {hasCopiedTimeline ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-300">已复制清单</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-slate-400" />
                        <span>复制行动清单</span>
                      </>
                    )}
                  </button>

                  {/* 收起/展开双轨详情 */}
                  <button
                    type="button"
                    onClick={() => setIsDualTimelineOpen(!isDualTimelineOpen)}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-750 text-slate-200 text-xs font-medium rounded-lg border border-slate-700 flex items-center gap-1 transition cursor-pointer"
                  >
                    {isDualTimelineOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    <span>{isDualTimelineOpen ? '收起双轨详情' : '展开双轨详情'}</span>
                  </button>
                </div>
              </div>

              {isDualTimelineOpen && (
                <>
                  {/* 战略权衡 Callout: 为什么不能只选其一？ */}
                  <div className="mt-4 bg-gradient-to-r from-amber-950/30 via-slate-900 to-emerald-950/30 border border-slate-700/70 rounded-lg p-4 text-xs">
                    <div className="flex items-start gap-2.5">
                      <Scale className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                      <div className="space-y-1.5 text-slate-300">
                        <div className="font-semibold text-slate-200 flex items-center gap-2">
                          <span>双层时间轴协同逻辑与工程权衡 (Strategic Trade-off)</span>
                          <span className="text-[10px] px-2 py-0.2 rounded bg-blue-500/20 text-blue-300 font-mono">
                            车规质量与进度博弈平衡
                          </span>
                        </div>
                        <p className="leading-relaxed text-slate-300 whitespace-pre-line text-[11px]">
                          {dualTimeline.strategicTradeoff}
                        </p>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* 双轨时间轴对比卡片 */}
            {isDualTimelineOpen && (
              <div className={`grid gap-6 ${timelineFilter === 'ALL' ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'}`}>
              {/* Track 1: T+24h 应急临时遏制 (Containment Phase) */}
              {(timelineFilter === 'ALL' || timelineFilter === 'CONTAINMENT') && (
                <div className="bg-slate-900 border-2 border-amber-500/40 rounded-xl p-5 shadow-lg flex flex-col justify-between">
                  <div className="space-y-4">
                    {/* Header */}
                    <div className="border-b border-slate-800 pb-3">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="px-2.5 py-1 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono text-xs font-bold flex items-center gap-1.5">
                          <Zap className="w-3.5 h-3.5" />
                          <span>{dualTimeline.containmentPhase.timeWindow}</span>
                        </span>
                        <span className="px-2 py-0.5 rounded bg-amber-950/60 text-amber-200 border border-amber-600/30 text-[10px] font-semibold">
                          0天改版工期 · 快速闭环
                        </span>
                      </div>
                      <h4 className="text-sm font-bold text-white leading-snug">
                        {dualTimeline.containmentPhase.title}
                      </h4>
                      <p className="text-xs text-amber-200/80 mt-1.5 leading-relaxed bg-amber-950/20 p-2.5 rounded border border-amber-500/20">
                        <strong>核心目标：</strong>{dualTimeline.containmentPhase.objective}
                      </p>
                    </div>

                    {/* Meta info */}
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div className="bg-slate-850 p-2.5 rounded border border-slate-700/60">
                        <span className="text-slate-400 block text-[10px]">硬件改动工期影响:</span>
                        <span className="text-amber-300 font-semibold mt-0.5 block">
                          {dualTimeline.containmentPhase.hardwareImpact}
                        </span>
                      </div>
                      <div className="bg-slate-850 p-2.5 rounded border border-slate-700/60">
                        <span className="text-slate-400 block text-[10px]">牵头责任主体:</span>
                        <span className="text-slate-200 font-semibold mt-0.5 block">
                          {dualTimeline.containmentPhase.responsibilityRole}
                        </span>
                      </div>
                    </div>

                    {/* Step-by-step checklist */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-amber-400" />
                          <span>T+24h 应急实操步骤清单 (Step-by-Step Actions)</span>
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {dualTimeline.containmentPhase.actions.length} 项工步
                        </span>
                      </div>

                      <div className="space-y-2.5">
                        {dualTimeline.containmentPhase.actions.map((act, idx) => (
                          <div
                            key={idx}
                            className="bg-slate-850/90 border border-slate-700/80 rounded-lg p-3 text-xs space-y-1.5 hover:border-amber-500/40 transition"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <span className="font-semibold text-amber-300 leading-snug">
                                {act.step}
                              </span>
                              <span className="px-2 py-0.5 rounded bg-slate-900 text-amber-400 font-mono text-[10px] border border-slate-700 shrink-0">
                                {act.duration}
                              </span>
                            </div>
                            <p className="text-slate-300 text-[11px] leading-relaxed">
                              {act.detail}
                            </p>
                            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-800 text-[10px]">
                              <span className="text-slate-400">
                                负责人: <strong className="text-slate-200">{act.owner}</strong>
                              </span>
                              <span className="text-amber-200/90 bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-500/20 font-mono">
                                交付: {act.deliverable}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Verification criteria */}
                    <div className="bg-slate-850/80 p-3 rounded-lg border border-amber-500/30 text-xs">
                      <span className="text-amber-400 font-semibold block mb-1 text-[11px] flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>现场快速验证判据 (Verification Criteria):</span>
                      </span>
                      <p className="text-slate-200 leading-relaxed text-[11px]">
                        {dualTimeline.containmentPhase.verificationCriteria}
                      </p>
                    </div>

                    {/* Original containment reference if present */}
                    {containment?.validityScope && (
                      <div className="bg-slate-950/60 p-2.5 rounded border border-slate-800 text-[11px] space-y-1">
                        <div className="flex justify-between text-slate-400">
                          <span>受控范围:</span>
                          <span className="text-slate-300 font-medium">{containment.validityScope}</span>
                        </div>
                        <div className="flex justify-between text-slate-400">
                          <span>原方案时限:</span>
                          <span className="text-amber-300 font-mono">{containment.timeline}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Exit gate */}
                  <div className="mt-4 pt-3 border-t border-slate-800">
                    <div className="flex items-center gap-2 text-xs">
                      <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
                      <div>
                        <span className="text-slate-400 text-[10px] block">临时放行门禁 (Temporary Exit Gate):</span>
                        <span className="text-amber-300 font-semibold text-[11px]">
                          {dualTimeline.containmentPhase.exitCriteria}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Track 2: 下一阶段永久纠正 (Permanent Action / CAPA) */}
              {(timelineFilter === 'ALL' || timelineFilter === 'PERMANENT') && (
                <div className="bg-slate-900 border-2 border-emerald-500/40 rounded-xl p-5 shadow-lg flex flex-col justify-between">
                  <div className="space-y-4">
                    {/* Header */}
                    <div className="border-b border-slate-800 pb-3">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-mono text-xs font-bold flex items-center gap-1.5">
                          <Milestone className="w-3.5 h-3.5" />
                          <span>{dualTimeline.permanentPhase.timeWindow}</span>
                        </span>
                        <span className="px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-200 border border-emerald-600/30 text-[10px] font-semibold">
                          18~25天投板 · 物理根治
                        </span>
                      </div>
                      <h4 className="text-sm font-bold text-white leading-snug">
                        {dualTimeline.permanentPhase.title}
                      </h4>
                      <p className="text-xs text-emerald-200/80 mt-1.5 leading-relaxed bg-emerald-950/20 p-2.5 rounded border border-emerald-500/20">
                        <strong>核心目标：</strong>{dualTimeline.permanentPhase.objective}
                      </p>
                    </div>

                    {/* Meta info */}
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div className="bg-slate-850 p-2.5 rounded border border-slate-700/60">
                        <span className="text-slate-400 block text-[10px]">硬件改动周期影响:</span>
                        <span className="text-emerald-300 font-semibold mt-0.5 block">
                          {dualTimeline.permanentPhase.hardwareImpact}
                        </span>
                      </div>
                      <div className="bg-slate-850 p-2.5 rounded border border-slate-700/60">
                        <span className="text-slate-400 block text-[10px]">牵头责任主体:</span>
                        <span className="text-slate-200 font-semibold mt-0.5 block">
                          {dualTimeline.permanentPhase.responsibilityRole}
                        </span>
                      </div>
                    </div>

                    {/* Step-by-step checklist */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5 text-emerald-400" />
                          <span>下阶段永久纠正工步清单 (SOP Action Items)</span>
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {dualTimeline.permanentPhase.actions.length} 项工步
                        </span>
                      </div>

                      <div className="space-y-2.5">
                        {dualTimeline.permanentPhase.actions.map((act, idx) => (
                          <div
                            key={idx}
                            className="bg-slate-850/90 border border-slate-700/80 rounded-lg p-3 text-xs space-y-1.5 hover:border-emerald-500/40 transition"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <span className="font-semibold text-emerald-300 leading-snug">
                                {act.step}
                              </span>
                              <span className="px-2 py-0.5 rounded bg-slate-900 text-emerald-400 font-mono text-[10px] border border-slate-700 shrink-0">
                                {act.duration}
                              </span>
                            </div>
                            <p className="text-slate-300 text-[11px] leading-relaxed">
                              {act.detail}
                            </p>
                            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-800 text-[10px]">
                              <span className="text-slate-400">
                                负责人: <strong className="text-slate-200">{act.owner}</strong>
                              </span>
                              <span className="text-emerald-200/90 bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-500/20 font-mono">
                                交付: {act.deliverable}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Verification criteria */}
                    <div className="bg-slate-850/80 p-3 rounded-lg border border-emerald-500/30 text-xs">
                      <span className="text-emerald-400 font-semibold block mb-1 text-[11px] flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>终极合规验证标准 (Permanent Verification):</span>
                      </span>
                      <p className="text-slate-200 leading-relaxed text-[11px]">
                        {dualTimeline.permanentPhase.verificationCriteria}
                      </p>
                    </div>

                    {/* Original CAPA reference if present */}
                    {capa?.lessonsLearned && (
                      <div className="bg-slate-950/60 p-2.5 rounded border border-slate-800 text-[11px] space-y-1">
                        <span className="text-slate-400 block text-[10px]">经验教训 (Lessons Learned):</span>
                        <p className="text-slate-300 text-[11px] leading-relaxed">
                          {capa.lessonsLearned}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Exit gate */}
                  <div className="mt-4 pt-3 border-t border-slate-800">
                    <div className="flex items-center gap-2 text-xs">
                      <FileCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                      <div>
                        <span className="text-slate-400 text-[10px] block">终极放行门禁 (SOP Sign-Off Gate):</span>
                        <span className="text-emerald-300 font-semibold text-[11px]">
                          {dualTimeline.permanentPhase.exitCriteria}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      );
      })()}
    </div>
  );
};
