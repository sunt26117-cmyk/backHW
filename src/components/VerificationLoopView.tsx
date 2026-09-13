/**
 * Next Best Action + 验证闭环 + VOI 实验优先级引擎 (Section 8)
 * 严格按照 V4 规范：
 * 1. NOW / WHY / EXPECTED / PASS / FAIL / OWNER / DUE
 * 2. VOI 实验性价比引擎
 * 3. 字段化验证计划
 * 4. 实测数据驱动闭环更新 (Test Result → Evidence → Confidence → Risk → Decision)
 * 5. 决策履历与历史案例库
 */

import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  User,
  Activity,
  ArrowRight,
  TrendingUp,
  Cpu,
  Zap,
  RotateCcw,
  FileCheck,
  Search,
} from 'lucide-react';
import {
  generateNextBestAction,
  calculateVoiTestPriorities,
  generateStructuredVerificationPlan,
  executeTestFeedbackLoop,
} from '../data/verificationLoopEngine';
import {
  TestResultEntry,
  TransparentRiskScore,
  DecisionRecord,
  EvidenceItem,
  ProjectContext,
  IssueInput,
  CopilotAnalysisResult,
} from '../types';
import { deriveVerificationRisk } from '../utils/scenarioDerived';

interface VerificationLoopViewProps {
  daysRemaining: number;
  context: ProjectContext;
  issue: IssueInput;
  result: CopilotAnalysisResult | null;
}

export const VerificationLoopView: React.FC<VerificationLoopViewProps> = ({
  daysRemaining,
  context,
  issue,
  result,
}) => {
  const derivedRisk = useMemo(() => deriveVerificationRisk(context, issue, result), [context, issue, result]);
  const nextBestAction = generateNextBestAction(daysRemaining, context, issue, result);
  const voiTests = calculateVoiTestPriorities(context, issue, result);
  const verificationPlan = generateStructuredVerificationPlan(context, issue, result);

  // 当前透明风险状态
  const [currentRisk, setCurrentRisk] = useState<TransparentRiskScore>({
    ...derivedRisk,
  } as TransparentRiskScore);

  React.useEffect(() => {
    setCurrentRisk({ ...derivedRisk } as TransparentRiskScore);
  }, [derivedRisk]);

  // 实测数据回填表单
  const [testForm, setTestForm] = useState<TestResultEntry>({
    testId: `TEST-${new Date().getFullYear()}-${context.projectPhase}`,
    condition: issue.testCondition || issue.failurePhenomenon || '当前典型工况验证条件待补充',
    instrument: '示波器/数据采集系统 + 关键节点差分探头（按当前问题选择）',
    measurement: issue.actualMeasurement || issue.requirement || '关键参数实测值',
    result: '待实测回填（当前页面不再沿用其他典型工况的固定实测值）',
    passFail: 'PASS',
    evidence: '示波器截图 CH1/CH2 Raw Data 存档至 /data/dvt_run_04.csv',
    engineer: '张工 (主任硬件工程师)',
  });

  // 闭环结果通知
  const [loopResult, setLoopResult] = useState<{
    message: string;
    evidence: EvidenceItem | null;
  } | null>(null);

  // 决策履历记录
  const [decisionHistory, setDecisionHistory] = useState<DecisionRecord[]>([
    {
      id: 'REC-001',
      timestamp: '2026-09-01 10:15',
      problemSummary: `${issue.failurePhenomenon || issue.engineeringConcern || '当前工况问题'}｜${context.projectName}`,
      optionsConsidered: ['方案 A: TVS 硬件钳位', '方案 B: 软件全下桥短接能耗制动', '方案 C: 改板换 60V MOS'],
      chosenOption: result?.finalRecommendation.recommendedOptionName || '待分析结果生成后确定',
      justification: result?.finalRecommendation.reasonSummary || issue.engineeringConcern || '等待当前工况的分析理由',
      rejectedOptionsReason: {
        '方案 A': `当前${issue.issueCategories?.[0] || '场景'}下需先验证吸收/钳位网络的热与裕量，不能直接假设有效。`,
        '方案 C': `当前里程碑为 ${context.nextMilestone}，剩余 ${context.daysRemaining} 天；改版周期必须与该窗口重新核算。`,
      },
      verificationPlan: result?.finalRecommendation.immediateSteps?.[0]?.action || `针对当前工况验证：${issue.requirement}`,
      owner: '张工 & 李工',
      status: 'OPEN',
    },
  ]);

  const handleApplyTestFeedback = () => {
    const feedback = executeTestFeedbackLoop(currentRisk, testForm);
    setCurrentRisk(feedback.updatedRisk);
    setLoopResult({
      message: feedback.decisionUpdateMessage,
      evidence: feedback.evidenceUpdate,
    });

    // 更新履历状态
    setDecisionHistory((prev) =>
      prev.map((rec) => ({
        ...rec,
        status: testForm.passFail === 'PASS' ? 'CLOSED' : 'ESCALATED',
      }))
    );
  };

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 border border-cyan-500/30 rounded-xl p-3 text-xs">
        <span className="text-cyan-300 font-semibold">当前验证工况：</span>
        <span className="text-white ml-2">{context.projectName} / {context.projectPhase} / {context.asilLevel}</span>
        <span className="text-slate-400 ml-2">剩余 {context.daysRemaining} 天 · {issue.issueCategories?.join(' / ') || 'Other'}</span>
      </div>
      {/* 1. Next Best Action 固定格式卡片 (NOW / WHY / EXPECTED / PASS / FAIL / OWNER / DUE) */}
      <div className="bg-gradient-to-r from-slate-900 to-blue-950/50 border border-blue-500/40 rounded-xl p-5 shadow-lg">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded bg-blue-500/20 text-blue-300 border border-blue-500/40 text-xs font-mono font-bold">
              NEXT BEST ACTION (行动指南)
            </span>
            <span className="text-xs text-slate-400">
              固定 7 项要素闭环定义 (Section 8)
            </span>
          </div>
          <span className="text-xs px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono">
            {nextBestAction.due}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="space-y-3">
            <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800">
              <div className="font-bold text-blue-400 mb-1 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                NOW (现在立即执行)
              </div>
              <p className="text-slate-200 leading-relaxed">{nextBestAction.now}</p>
            </div>

            <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800">
              <div className="font-bold text-amber-400 mb-1 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                WHY (为什么现在做这一项？)
              </div>
              <p className="text-slate-300 leading-relaxed">{nextBestAction.why}</p>
            </div>

            <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800">
              <div className="font-bold text-purple-400 mb-1 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                EXPECTED (预期物理现象与波形)
              </div>
              <p className="text-slate-300 leading-relaxed">{nextBestAction.expected}</p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="bg-slate-950/80 p-3 rounded-lg border border-emerald-500/30">
              <div className="font-bold text-emerald-400 mb-1 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                PASS (放行门禁与量化判定准则)
              </div>
              <p className="text-emerald-200 leading-relaxed">{nextBestAction.passCriteria}</p>
            </div>

            <div className="bg-slate-950/80 p-3 rounded-lg border border-red-500/30">
              <div className="font-bold text-red-400 mb-1 flex items-center gap-1.5">
                <XCircle className="w-3.5 h-3.5 text-red-400" />
                FAIL (熔断红线与回滚触发器)
              </div>
              <p className="text-red-200 leading-relaxed">{nextBestAction.failCriteria}</p>
            </div>

            <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800 flex items-center justify-between">
              <div>
                <div className="font-bold text-slate-400 mb-0.5">OWNER (责任人)</div>
                <div className="text-slate-200">{nextBestAction.owner}</div>
              </div>
              <div>
                <div className="font-bold text-slate-400 mb-0.5">DUE (交付时限)</div>
                <div className="text-amber-400 font-mono font-bold">{nextBestAction.due}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Value of Information (VOI) 实验优先级引擎 */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              <span>Value of Information (VOI) 实验优先级排序引擎</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              公式: VOI = (决策影响度 + 风险削减量 + 不确定性消除) / (实验成本 + 实验耗时) —— 寻找改变当前决策性价比最高的实验
            </p>
          </div>
          <span className="text-xs px-2 py-1 rounded bg-slate-800 text-slate-300 font-mono">
            动态最优排期
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {voiTests.map((t, idx) => (
            <div
              key={idx}
              className={`p-4 rounded-xl border transition ${
                t.isTopPriority
                  ? 'bg-blue-950/30 border-blue-500/60 shadow-md'
                  : 'bg-slate-950 border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-white">{t.testName}</span>
                  {t.isTopPriority && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                      TOP VOI 推荐首选
                    </span>
                  )}
                </div>
                <div className="text-right">
                  <span className="text-xs text-slate-400">VOI 综合得分: </span>
                  <span className="font-mono font-bold text-emerald-400 text-sm">{t.voiScore}</span>
                </div>
              </div>

              <p className="text-xs text-slate-300 mb-3">{t.objective}</p>

              {/* 拆分打分明细 */}
              <div className="grid grid-cols-5 gap-1 text-[11px] font-mono text-center bg-slate-900/80 p-2 rounded border border-slate-800">
                <div>
                  <div className="text-slate-500 text-[9px]">决策影响</div>
                  <div className="text-cyan-300 font-bold">{t.decisionImpactScore}</div>
                </div>
                <div>
                  <div className="text-slate-500 text-[9px]">风险削减</div>
                  <div className="text-emerald-300 font-bold">{t.riskReductionScore}</div>
                </div>
                <div>
                  <div className="text-slate-500 text-[9px]">不确定消除</div>
                  <div className="text-purple-300 font-bold">{t.uncertaintyReductionScore}</div>
                </div>
                <div>
                  <div className="text-slate-500 text-[9px]">成本分</div>
                  <div className="text-amber-300 font-bold">{t.costScore}</div>
                </div>
                <div>
                  <div className="text-slate-500 text-[9px]">工时(h)</div>
                  <div className="text-slate-300 font-bold">{t.timeHoursScore}</div>
                </div>
              </div>

              <div className="mt-2 text-[11px] text-slate-400 italic">
                {t.rationale}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 3. 实测数据回填与闭环重算交互区 (Test Result → Risk Recalculation) */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div>
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <RotateCcw className="w-4 h-4 text-cyan-400" />
              <span>实验结果回填驱动闭环风险与决策重算 (Live Feedback Loop)</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              实测数据录入后，自动将 UNKNOWN/ASSUMPTION 升级为 MEASURED，提升置信度并重算残余风险。
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400">当前风险:</span>
            <span className={`text-xs px-2 py-0.5 rounded font-mono font-bold ${
              currentRisk.overallRiskLevel === 'Low' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'
            }`}>
              {currentRisk.overallRiskLevel} ({currentRisk.overallScore}分)
            </span>
            <span className="text-xs text-slate-400">置信度:</span>
            <span className="text-xs px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 font-mono font-bold">
              {currentRisk.confidence}
            </span>
          </div>
        </div>

        {/* 录入表单 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div className="bg-slate-950 p-2.5 rounded border border-slate-800">
            <label className="text-[10px] text-slate-400 block mb-1">测试编号与工况</label>
            <input
              type="text"
              value={testForm.testId}
              onChange={(e) => setTestForm({ ...testForm, testId: e.target.value })}
              className="w-full bg-slate-900 text-white font-mono px-2 py-1 rounded border border-slate-700"
            />
          </div>
          <div className="bg-slate-950 p-2.5 rounded border border-slate-800">
            <label className="text-[10px] text-slate-400 block mb-1">仪器与测量对象</label>
            <input
              type="text"
              value={testForm.measurement}
              onChange={(e) => setTestForm({ ...testForm, measurement: e.target.value })}
              className="w-full bg-slate-900 text-white font-mono px-2 py-1 rounded border border-slate-700"
            />
          </div>
          <div className="bg-slate-950 p-2.5 rounded border border-slate-800">
            <label className="text-[10px] text-slate-400 block mb-1">实测读数 (数值证据)</label>
            <input
              type="text"
              value={testForm.result}
              onChange={(e) => setTestForm({ ...testForm, result: e.target.value })}
              className="w-full bg-slate-900 text-cyan-300 font-mono px-2 py-1 rounded border border-slate-700 font-bold"
            />
          </div>
          <div className="bg-slate-950 p-2.5 rounded border border-slate-800">
            <label className="text-[10px] text-slate-400 block mb-1">判定结果 (Pass / Fail)</label>
            <select
              value={testForm.passFail}
              onChange={(e) => setTestForm({ ...testForm, passFail: e.target.value as any })}
              className="w-full bg-slate-900 text-white font-bold px-2 py-1 rounded border border-slate-700 cursor-pointer"
            >
              <option value="PASS" className="text-emerald-400">PASS (完全达标放行)</option>
              <option value="FAIL" className="text-red-400">FAIL (超出限值触发熔断)</option>
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          <div className="text-xs text-slate-400">
            测试责任人: <strong className="text-slate-200">{testForm.engineer}</strong>
          </div>
          <button
            onClick={handleApplyTestFeedback}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition shadow cursor-pointer"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>提交实测数据并执行闭环重算</span>
          </button>
        </div>

        {/* 闭环反馈结果弹窗/条目 */}
        {loopResult && (
          <div className="bg-slate-950 border border-emerald-500/50 rounded-xl p-4 space-y-2 mt-3 animate-in fade-in duration-300">
            <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold">
              <CheckCircle2 className="w-4 h-4" />
              <span>决策闭环与置信度重算成功！</span>
            </div>
            <p className="text-xs text-slate-200 leading-relaxed">
              {loopResult.message}
            </p>
            {loopResult.evidence && (
              <div className="text-[11px] text-slate-400 bg-slate-900 p-2.5 rounded border border-slate-800 font-mono">
                [新增实测证据]: {loopResult.evidence.claim} · 数据源: {loopResult.evidence.source} · 置信度: HIGH
              </div>
            )}
          </div>
        )}
      </div>

      {/* 4. 决策履历记录 (Decision Record) */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
        <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
          <FileCheck className="w-4 h-4 text-purple-400" />
          <span>受控工程决策履历归档 (Engineering Decision Records)</span>
        </h2>

        <div className="space-y-3">
          {decisionHistory.map((rec) => (
            <div
              key={rec.id}
              className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs space-y-2"
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-cyan-400">{rec.id}</span>
                  <span className="text-slate-400 font-mono">{rec.timestamp}</span>
                </div>
                <span className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold ${
                  rec.status === 'CLOSED'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : rec.status === 'ESCALATED'
                    ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                }`}>
                  STATUS: {rec.status}
                </span>
              </div>

              <div className="text-white font-medium">问题: {rec.problemSummary}</div>
              <div className="text-emerald-300">选定决策: <strong>{rec.chosenOption}</strong></div>
              <div className="text-slate-400">采纳理由: {rec.justification}</div>
              <div className="text-[11px] text-slate-500 font-mono">
                未采纳方案原因: 方案 A ({rec.rejectedOptionsReason['方案 A']}) | 方案 C ({rec.rejectedOptionsReason['方案 C']})
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
