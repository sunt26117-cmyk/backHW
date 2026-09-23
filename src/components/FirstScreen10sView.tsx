/**
 * 第一屏 10 秒快速回答 4 大核心问题 (Section 9 UI 结构)
 * 1. What is wrong?
 * 2. Why（物理机制）?
 * 3. What should we do now?
 * 4. What would prove it（什么测试结果能证明判断对错）?
 * 包含从 Issue 到 Closed Loop 的完整闭环履历导航
 */

import React from 'react';
import {
  AlertOctagon,
  HelpCircle,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Zap,
  Activity,
  Calendar,
  Flame,
  Clock,
  Compass,
  FileCheck,
  ChevronRight,
  TrendingDown,
} from 'lucide-react';
import { CopilotAnalysisResult, ProjectContext, IssueInput } from '../types';
import { TemplateContentNotice } from './TemplateContentNotice';
import { calculateDomainMetrics, resolveEngineeringDomain } from '../utils/scenarioDomainEngine';

interface FirstScreen10sProps {
  context: ProjectContext;
  issue: IssueInput;
  result: CopilotAnalysisResult | null;
  onNavigateTab: (tabId: string) => void;
}

export const FirstScreen10sView: React.FC<FirstScreen10sProps> = ({
  context,
  issue,
  result,
  onNavigateTab,
}) => {
  if (!result) {
    return (
      <div className="min-h-[420px] flex items-center justify-center">
        <div className="max-w-xl w-full bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center shadow-lg">
          <div className="text-cyan-300 text-sm font-semibold">当前工况正在生成工程分析</div>
          <div className="text-slate-400 text-xs mt-2 leading-relaxed">
            分析结果尚未生成时不会使用历史案例结果补位。请等待当前工况完成计算，或先进入“统一工程输入”补齐关键实测数据。
          </div>
          <div className="mt-5 flex items-center justify-center gap-2 text-[11px] text-slate-500">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            CURRENT SCENARIO ONLY · NO BENCHMARK FALLBACK
          </div>
        </div>
      </div>
    );
  }

  const { coreConclusion, physicalMechanism, finalRecommendation, riskRatings } = result;

  // 10秒第一屏 4 核心要素提取
  const extractNumber = (text: string, pattern: RegExp, fallback = '—') => { const m = text.match(pattern); return m?.[1] || fallback; };
  const domain = resolveEngineeringDomain(issue);
  const measurementText = issue.actualMeasurement || issue.failurePhenomenon || '';
  const domainMetrics = calculateDomainMetrics(issue, context);
  const primaryMetric = domainMetrics.find(m => m.tag !== 'SPEC') || domainMetrics[0];
  const primaryMetricText = primaryMetric ? `${primaryMetric.label}: ${primaryMetric.value}` : (measurementText || '暂无结构化实测值');
  const busV = extractNumber(measurementText, /(\d+(?:\.\d+)?)\s*V/i);
  const rpm = extractNumber(`${issue.testCondition} ${issue.actualMeasurement}`, /(\d{3,5})\s*rpm/i);
  const days = context.daysRemaining;
  const whatIsWrong = issue.failurePhenomenon || '当前典型工况存在关键参数超限/裕量不足，请以“事实与证据”页为准。';
  const whyPhysical = `${physicalMechanism.rootCauseAnalysis.slice(0, 220)}${physicalMechanism.rootCauseAnalysis.length > 220 ? '…' : ''}`;
  const whatToDoNow = `【首选推荐方案】${finalRecommendation.recommendedOptionName}。${(Array.isArray(finalRecommendation.whyReason) ? finalRecommendation.whyReason : [String(finalRecommendation.whyReason || '')])[0] || '按当前工况验证关键风险后推进。'}`;
  const gate = result.next24HourPlan?.passFailCriteria?.[0];
  const scenarioGate = gate?.parameter || issue.requirement || issue.engineeringConcern || '当前工况关键工程指标';
  const gateDetail = gate ? `绿色：${gate.greenCriteria}；黄色：${gate.yellowCriteria}；红色：${gate.redCriteria}` : '必须以实测证据判定 Pass / Fail，不能用模型计算值替代实测。';
  const categoryText = Array.isArray(issue.issueCategories) ? issue.issueCategories.join(' / ') : 'Other';
  const whatWouldProveIt = `【${context.projectName} / ${categoryText}】在 ${issue.environment || '当前环境'}、${issue.testCondition || '当前测试条件'} 下验证：${scenarioGate}。${gateDetail}`;

  return (
    <div className="space-y-6">
      {result.templateContentNotice && (
        <TemplateContentNotice blocks={result.templateContentNotice.blocks} message={result.templateContentNotice.message} />
      )}
      {/* 顶部醒目标题与项目工况快照 */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-blue-950/40 border border-slate-800 rounded-xl p-5 shadow-lg">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                {context.projectPhase} 阶段
              </span>
              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                {context.asilLevel}
              </span>
              <span className="text-xs text-slate-400 font-mono">
                {context.projectName} · {context.customer}
              </span>
            </div>
            <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
              <span>第一屏核心决策看板</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-normal">
                10秒快速决策定位 (V4规范)
              </span>
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-[11px] text-slate-400">交付倒计时</div>
              <div className="text-lg font-bold font-mono text-amber-400">{context.daysRemaining} 天</div>
            </div>
            <div className="h-8 w-px bg-slate-800" />
            <div className="text-right">
              <div className="text-[11px] text-slate-400">综合风险等级</div>
              <div className="text-lg font-bold font-mono text-red-400">{riskRatings.overallRisk} ({riskRatings.overallRiskScore}分)</div>
            </div>
          </div>
        </div>
      </div>

      {result.decisionFrame && (
        <div className="bg-slate-900/90 border border-cyan-500/30 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <div className="text-sm font-bold text-cyan-300 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4" /> 当前决策闸门
              </div>
              <div className="text-[11px] text-slate-400 mt-1">不是“写报告”，而是明确当前能否继续推进，以及缺什么证据。</div>
            </div>
            <span className="text-[10px] px-2 py-1 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 font-mono">{result.decisionFrame.decisionWindow}</span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="bg-slate-950/50 border border-slate-800 rounded-lg p-3">
              <div className="text-[10px] text-slate-500 mb-1">当前要回答的问题</div>
              <div className="text-xs text-slate-200 leading-relaxed">{result.decisionFrame.decisionQuestion}</div>
            </div>
            <div className="bg-slate-950/50 border border-slate-800 rounded-lg p-3">
              <div className="text-[10px] text-slate-500 mb-1">未来 24 小时最优先动作</div>
              <div className="text-xs text-emerald-300 leading-relaxed">{result.decisionFrame.bestNextAction}</div>
            </div>
            <div className="bg-slate-950/50 border border-slate-800 rounded-lg p-3">
              <div className="text-[10px] text-slate-500 mb-1">什么证据会推翻当前方案</div>
              <div className="text-xs text-amber-300 leading-relaxed">{result.decisionFrame.reversalCriteria.slice(0, 2).join('；') || '暂未定义，需补充验证触发条件。'}</div>
            </div>
          </div>
          {result.decisionFrame.unknownsBlockingDecision.length > 0 && (
            <div className="mt-3 text-[11px] text-slate-400">
              <span className="text-rose-300 font-semibold">当前阻塞未知量：</span> {result.decisionFrame.unknownsBlockingDecision.slice(0, 4).join('；')}
            </div>
          )}
        </div>
      )}

      {/* 4 大核心问题卡片 (第一屏 10 秒即时回答) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Q1: What is wrong? */}
        <div className="bg-slate-900/90 border border-red-500/40 rounded-xl p-4 shadow-sm hover:border-red-500/60 transition">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-red-500/20 flex items-center justify-center text-red-400 font-bold text-sm">
                1
              </div>
              <h2 className="text-sm font-bold text-red-300">What is wrong? (发生了什么问题？)</h2>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded bg-red-500/20 text-red-300 font-mono">CRITICAL PHENOMENON</span>
          </div>
          <p className="text-xs text-slate-200 leading-relaxed bg-slate-950/60 p-3 rounded-lg border border-slate-800/80">
            {whatIsWrong}
          </p>
          <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400">
            <span>当前工况关键证据: <strong className="text-red-400 font-mono">{primaryMetricText}</strong> · Domain <strong className="text-cyan-300 font-mono">{domain}</strong></span>
            <button
              onClick={() => onNavigateTab('facts')}
              className="text-blue-400 hover:text-blue-300 flex items-center gap-1 font-medium cursor-pointer"
            >
              查看事实与追溯 <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Q2: Why (物理机制)? */}
        <div className="bg-slate-900/90 border border-blue-500/40 rounded-xl p-4 shadow-sm hover:border-blue-500/60 transition">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-400 font-bold text-sm">
                2
              </div>
              <h2 className="text-sm font-bold text-blue-300">Why? (深层物理与失效机理是什么？)</h2>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 font-mono">PHYSICAL MECHANISM</span>
          </div>
          <p className="text-xs text-slate-200 leading-relaxed bg-slate-950/60 p-3 rounded-lg border border-slate-800/80">
            {whyPhysical}
          </p>
          <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400">
            <span>核心类别: <span className="text-cyan-300 font-mono">{categoryText}</span></span>
            <button
              onClick={() => onNavigateTab('patterns')}
              className="text-blue-400 hover:text-blue-300 flex items-center gap-1 font-medium cursor-pointer"
            >
              进入当前工况物理机理 <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Q3: What should we do now? */}
        <div className="bg-slate-900/90 border border-emerald-500/40 rounded-xl p-4 shadow-sm hover:border-emerald-500/60 transition">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-400 font-bold text-sm">
                3
              </div>
              <h2 className="text-sm font-bold text-emerald-300">What should we do now? (当前首选对策)</h2>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono">CURRENT BEST ACTION</span>
          </div>
          <p className="text-xs text-slate-200 leading-relaxed bg-slate-950/60 p-3 rounded-lg border border-slate-800/80">
            {whatToDoNow}
          </p>
          <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400">
            <span>剩余交付窗口: <strong className="text-emerald-400 font-mono">{days} 天</strong></span>
            <button
              onClick={() => onNavigateTab('cockpit')}
              className="text-blue-400 hover:text-blue-300 flex items-center gap-1 font-medium cursor-pointer"
            >
              查看 C-T-S-Q-L 决策与 Why-Not <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Q4: What would prove it? */}
        <div className="bg-slate-900/90 border border-purple-500/40 rounded-xl p-4 shadow-sm hover:border-purple-500/60 transition">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-purple-500/20 flex items-center justify-center text-purple-400 font-bold text-sm">
                4
              </div>
              <h2 className="text-sm font-bold text-purple-300">What would prove it? (什么测试能证明对错？)</h2>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 font-mono">QUANTIFIED GATE</span>
          </div>
          <p className="text-xs text-slate-200 leading-relaxed bg-slate-950/60 p-3 rounded-lg border border-slate-800/80">
            {whatWouldProveIt}
          </p>
          <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400">
            <span>门禁判据: <span className="text-purple-300">{issue.requirement || '当前工况验证计划'}</span></span>
            <button
              onClick={() => onNavigateTab('verification')}
              className="text-blue-400 hover:text-blue-300 flex items-center gap-1 font-medium cursor-pointer"
            >
              进入验证闭环与回填 <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* 团队担忧点透视与多方推演博弈直通卡 */}
      <div className="bg-gradient-to-r from-indigo-950/40 via-slate-900 to-blue-950/40 border border-indigo-500/30 rounded-xl p-5 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                STAKEHOLDER WARGAME
              </span>
              <span className="text-sm font-bold text-white">
                团队成员真实担忧点透视与领导多方推演博弈
              </span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed max-w-3xl">
              集成<strong>硬件主管 (怕爆雷背锅)</strong>、<strong>项目经理 PM (怕节点延期)</strong>、<strong>底层软件 (怕改环路)</strong>、<strong>系统整车 (怕线束重定)</strong>、<strong>测试 DVT</strong>、<strong>品质 SQE</strong>、<strong>采购</strong> 与 <strong>产品安全官 PSCR</strong> 的核心隐秘担忧。支持多轮交锋质疑与免责纳什均衡推演。
            </p>
          </div>

          <button
            id="quick-goto-wargame-btn"
            onClick={() => onNavigateTab('recommendation')}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition shadow-md shadow-indigo-900/30 flex items-center gap-2 cursor-pointer whitespace-nowrap self-start md:self-auto shrink-0"
          >
            <span>进入团队推演博弈台</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 完整工程决策闭环链路导览 (Section 0 & 9 规范) */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
          <Activity className="w-4 h-4 text-blue-400" />
          <span>车规工程决策完整端到端推进链 (Engineering Decision Trace Pipeline)</span>
        </h3>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
          {[
            { step: '1', title: '工程工况输入', subtitle: '统一输入模型', tab: 'input' },
            { step: '2', title: '事实与证据', subtitle: '9类强制标签', tab: 'facts' },
            { step: '3', title: '物理机理&Pattern', subtitle: `${domain} 领域确定性链`, tab: 'patterns' },
            { step: '4', title: '决策与C-T-S-Q-L', subtitle: 'VETO & Why-Not', tab: 'cockpit' },
            { step: '5', title: '验证闭环&VOI', subtitle: '回填重算风险', tab: 'verification' },
            { step: '6', title: '功能安全&可靠性', subtitle: 'FMEDA/FTA/寿命', tab: 'safety' },
            { step: '7', title: '团队博弈推演&RACI', subtitle: '8方心理与攻防', tab: 'recommendation' },
            { step: '8', title: '受控文档&EDR', subtitle: '防篡改决策单', tab: 'docs' },
          ].map((item, idx) => (
            <button
              key={idx}
              onClick={() => onNavigateTab(item.tab)}
              className="p-2.5 rounded-lg border bg-slate-950/70 border-slate-800 hover:border-blue-500/50 hover:bg-slate-800/50 transition text-left cursor-pointer group"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-mono text-slate-500 group-hover:text-blue-400">STEP 0{item.step}</span>
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
              </div>
              <div className="text-xs font-semibold text-slate-200 group-hover:text-blue-300 truncate">{item.title}</div>
              <div className="text-[10px] text-slate-500 mt-0.5 truncate">{item.subtitle}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
