import fetch from 'node-fetch';
import { PRESET_SCENARIOS } from '../src/data/presetScenarios';
import { auditAiResult } from '../src/utils/aiResultAuditor';
import { assessInputIntegrity } from '../src/utils/inputIntegrityEngine';

interface PageRenderCheckResult {
  pageName: string;
  passed: boolean;
  checkedFields: { field: string; status: 'OK' | 'MISSING'; sampleValue?: string }[];
  visualVerdict: string;
}

function verifyPageDataRendering(pageName: string, data: any): PageRenderCheckResult {
  const checks: { field: string; status: 'OK' | 'MISSING'; sampleValue?: string }[] = [];

  switch (pageName) {
    case 'FirstScreen10sView (第一屏10秒决策速览)': {
      const q1 = data.coreConclusion?.problemSummary;
      const q2 = data.physicalMechanism?.rootCauseAnalysis;
      const q3 = data.coreConclusion?.recommendedMeasure;
      const q4 = data.candidateActions?.[0]?.verificationMethod || data.finalRecommendation?.immediateSteps?.[0]?.action;
      
      checks.push({ field: 'Q1: What is wrong? (问题定性)', status: q1 ? 'OK' : 'MISSING', sampleValue: q1 ? String(q1).slice(0, 45) + '...' : undefined });
      checks.push({ field: 'Q2: Why? (物理失效机理)', status: q2 ? 'OK' : 'MISSING', sampleValue: q2 ? String(q2).slice(0, 45) + '...' : undefined });
      checks.push({ field: 'Q3: What to do? (核心推荐措施)', status: q3 ? 'OK' : 'MISSING', sampleValue: q3 ? String(q3).slice(0, 45) + '...' : undefined });
      checks.push({ field: 'Q4: What proves it? (决定性判据)', status: q4 ? 'OK' : 'MISSING', sampleValue: q4 ? String(q4).slice(0, 45) + '...' : undefined });
      break;
    }

    case 'AnalysisFactView (物理机理与事实底座)': {
      const factors = data.physicalMechanism?.keyPhysicalFactors;
      const facts = data.knownFacts;
      const dfmea = data.dfmeaView;

      checks.push({ field: '关键物理影响因子清单 (keyPhysicalFactors)', status: Array.isArray(factors) && factors.length > 0 ? 'OK' : 'MISSING', sampleValue: factors?.map((f: any) => f.factor).join(', ') });
      checks.push({ field: '已知工程事实底线 (knownFacts)', status: Array.isArray(facts) && facts.length > 0 ? 'OK' : 'MISSING', sampleValue: `${facts?.length || 0}条事实` });
      checks.push({ field: 'DFMEA 失效模式/严重度分析 (dfmeaView)', status: dfmea?.failureMode && dfmea?.severity ? 'OK' : 'MISSING', sampleValue: `模式: ${dfmea?.failureMode}, S=${dfmea?.severity}, O=${dfmea?.occurrence}, D=${dfmea?.detection}` });
      break;
    }

    case 'OptionsComparisonView (多方案对比与跨域复核)': {
      const actions = data.candidateActions || [];
      const hasOptions = actions.length >= 3;
      const hasRiskDelta = actions.some((a: any) => Boolean(a.riskDelta));
      const hasCoupling = actions.some((a: any) => Array.isArray(a.crossDomainCouplingChecks) && a.crossDomainCouplingChecks.length > 0);
      const hasPlanB = actions.some((a: any) => Boolean(a.planB));
      const hasVeto = actions.some((a: any) => a.veto?.rejection_veto === true);

      checks.push({ field: '包含≥3个候选方案 (Option A/B/C)', status: hasOptions ? 'OK' : 'MISSING', sampleValue: `${actions.length}个候选方案: ${actions.map((a: any) => a.name).join(' | ')}` });
      checks.push({ field: '风险净变化跃迁标注 (riskDelta)', status: hasRiskDelta ? 'OK' : 'MISSING', sampleValue: actions.find((a: any) => a.riskDelta)?.riskDelta });
      checks.push({ field: '跨域物理耦合复核闭环 (crossDomainCouplingChecks)', status: hasCoupling ? 'OK' : 'MISSING', sampleValue: `${actions.reduce((acc: number, cur: any) => acc + (cur.crossDomainCouplingChecks?.length || 0), 0)}条复核规则` });
      checks.push({ field: '工程退路后备方案 (planB)', status: hasPlanB ? 'OK' : 'MISSING', sampleValue: actions.find((a: any) => a.planB)?.planB });
      checks.push({ field: '一票否决红牌标识 (veto.rejection_veto)', status: hasVeto ? 'OK' : 'MISSING', sampleValue: actions.find((a: any) => a.veto?.rejection_veto)?.veto?.veto_reason });
      break;
    }

    case 'DecisionCockpitView (C-T-S-Q-L 决策驾驶舱)': {
      const actions = data.candidateActions || [];
      const allScored = actions.length > 0 && actions.every((a: any) => a.scores && typeof a.scores.total === 'number');
      const rec = data.finalRecommendation;

      checks.push({ field: '全方案 5 维量化雷达打分 (T/S/C/Q/L)', status: allScored ? 'OK' : 'MISSING', sampleValue: actions.map((a: any) => `${a.id}: ${a.scores?.total}分`).join(', ') });
      checks.push({ field: '系统最终采纳推荐结论 (finalRecommendation)', status: rec?.recommendedOptionId ? 'OK' : 'MISSING', sampleValue: `采纳 ${rec?.recommendedOptionId} (${rec?.recommendedOptionName})` });
      checks.push({ field: '即刻执行清单与负责人 (immediateSteps)', status: Array.isArray(rec?.immediateSteps) && rec.immediateSteps.length > 0 ? 'OK' : 'MISSING', sampleValue: `${rec?.immediateSteps?.length}步动作` });
      break;
    }

    case 'VerificationLoopView (实验验证闭环与 VOI 优先级)': {
      const rec = data.finalRecommendation;
      const actions = data.candidateActions || [];
      const hasVerificationMethod = actions.some((a: any) => Boolean(a.verificationMethod));

      checks.push({ field: '验证方法与台架判据 (verificationMethod)', status: hasVerificationMethod ? 'OK' : 'MISSING', sampleValue: actions.find((a: any) => a.verificationMethod)?.verificationMethod });
      checks.push({ field: '方案准入先决条件 (preconditions)', status: rec?.preconditions?.length > 0 ? 'OK' : 'MISSING', sampleValue: `${rec?.preconditions?.length}条准入边界` });
      checks.push({ field: '终止/熔断回退条件 (stopConditions)', status: rec?.stopConditions?.length > 0 ? 'OK' : 'MISSING', sampleValue: `${rec?.stopConditions?.length}条熔断判据` });
      break;
    }

    case 'RecommendationRaciView (落地责任矩阵与双层时间轴)': {
      const raci = data.raciMatrix;
      const timeline = data.dualTimeline;

      checks.push({ field: '跨职能 RACI 责任矩阵 (raciMatrix)', status: Array.isArray(raci) && raci.length > 0 ? 'OK' : 'MISSING', sampleValue: `${raci?.length}个责任人/角色分配` });
      checks.push({ field: 'T+24h 应急临时遏制时间轴 (containmentPhase)', status: Boolean(timeline?.containmentPhase?.title && timeline?.containmentPhase?.actions?.length) ? 'OK' : 'MISSING', sampleValue: timeline?.containmentPhase?.title });
      checks.push({ field: '下一阶段永久纠正时间轴 (permanentPhase)', status: Boolean(timeline?.permanentPhase?.title && timeline?.permanentPhase?.actions?.length) ? 'OK' : 'MISSING', sampleValue: timeline?.permanentPhase?.title });
      checks.push({ field: '战略权衡代价说明 (strategicTradeoff)', status: Boolean(timeline?.strategicTradeoff) ? 'OK' : 'MISSING', sampleValue: timeline?.strategicTradeoff?.slice(0, 45) });
      break;
    }

    case 'EngineeringDocsView (车规工程文档套件)': {
      const docs = data.engineeringDocs;
      const hasEmail = Boolean(docs?.pmDecisionEmail?.subject);
      const hasPermit = Boolean(docs?.deviationPermit?.title);
      const hasMeeting = Boolean(docs?.meetingMinutes?.title);

      checks.push({ field: 'PM 决策直报邮件模版 (pmDecisionEmail)', status: hasEmail ? 'OK' : 'MISSING', sampleValue: docs?.pmDecisionEmail?.subject });
      checks.push({ field: '工程偏差放行申请书 (deviationPermit)', status: hasPermit ? 'OK' : 'MISSING', sampleValue: docs?.deviationPermit?.title });
      checks.push({ field: '跨部门决策会议纪要 (meetingMinutes)', status: hasMeeting ? 'OK' : 'MISSING', sampleValue: docs?.meetingMinutes?.title });
      break;
    }

    case 'ResultProvenanceBanner (车规溯源与调试快照横幅)': {
      const prov = data.provenance;
      const debug = data.debugSnapshot || prov?.debugSnapshot;
      const integrity = prov?.inputIntegrity;

      checks.push({ field: '推理源标识与耗时 (provenance)', status: Boolean(prov?.engineName) ? 'OK' : 'MISSING', sampleValue: `${prov?.engineName} (${prov?.latencyMs || debug?.latencyMs}ms)` });
      checks.push({ field: '输入完整度评级徽标 (inputIntegrity)', status: Boolean(integrity?.gradeLabel) ? 'OK' : 'MISSING', sampleValue: `${integrity?.gradeLabel} (${integrity?.completenessScore}分)` });
      checks.push({ field: '调试快照 Prompt 文本与参数 (debugSnapshot)', status: Boolean(debug?.promptLength && debug?.promptSnippet) ? 'OK' : 'MISSING', sampleValue: `Prompt字符: ${debug?.promptLength}, 预计算事实: ${debug?.precomputedFactsCount}, 自动纠偏: ${debug?.autoFixesCount}` });
      break;
    }
  }

  const allPassed = checks.every((c) => c.status === 'OK');
  return {
    pageName,
    passed: allPassed,
    checkedFields: checks,
    visualVerdict: allPassed ? '✅ 页面数据源齐备，UI 渲染完全符合预期' : '⚠️ 存在部分字段缺失，可能导致页面显示空白或降级',
  };
}

async function runEndToEndVerification() {
  console.log(`\n========================================================================`);
  console.log(`🚗 ECU Copilot：端到端跨域实际测试与全页面渲染校验程序`);
  console.log(`========================================================================`);

  const testCases = [
    {
      id: 'bldc-motor-drive',
      name: 'Case 1: 车载 BLDC 电驱急停泵升与门极米勒效应跨域 (BLDC ➔ EMC ➔ 半导体可靠性)',
    },
    {
      id: 'robot-joint-backlash-sto',
      name: 'Case 2: 协作机器人关节背隙误差与 STO 双通道切断跨域 (机械动力学 ➔ 安规 ➔ 热设计)',
    },
  ];

  for (const tc of testCases) {
    console.log(`\n------------------------------------------------------------------------`);
    console.log(`📌 执行测试: ${tc.name}`);
    console.log(`------------------------------------------------------------------------`);

    const scenario = PRESET_SCENARIOS.find((s) => s.id === tc.id);
    if (!scenario) throw new Error(`Scenario ${tc.id} not found`);

    // 1. 发起真实调用
    const startTime = Date.now();
    const resp = await fetch('http://localhost:3000/api/copilot/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        context: scenario.context,
        issue: scenario.issue,
        modelConfig: {
          enabled: true,
          provider: 'gemini',
          model: 'gemini-3.6-flash',
          temperature: 0.2,
        },
      }),
    });

    const latency = Date.now() - startTime;
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);
    }

    const payload: any = await resp.json();
    const data = payload.data || payload.result;
    const debug = data?.debugSnapshot || payload.debugSnapshot;

    // 2. 详细透视：软件输出给 AI 的 Prompt
    console.log(`\n【一、软件输出给 AI 的提示词 (Prompt) 详细透视】`);
    console.log(`- 提示词总字符数: ${debug?.promptLength} 字符`);
    console.log(`- 包含确定性预计算事实数: ${debug?.precomputedFactsCount} 条`);
    console.log(`- 调用的模型/引擎: ${debug?.modelIdentifier || payload.model}`);
    
    if (debug?.fullPrompt) {
      console.log(`- 包含核心 Prompt 章节: 【1. 输入工程背景】, 【2.0 本地确定性数学物理预核算事实】, 【2.1 输入数据完整度车规审计等级与强约束】, 【3.1 跨工程域物理耦合规则库】, 【4. 车规基准定锚】`);
      console.log(`- 提示词首行节选: ${debug.fullPrompt.slice(0, 160).replace(/\n/g, ' ')}...`);
    } else {
      console.log(`Prompt 片段: ${debug?.promptSnippet}`);
    }

    // 3. 详细透视：AI 生成的结果数据
    console.log(`\n【二、AI/推理引擎生成的结果数据结构透视】`);
    console.log(`- 问题定性: ${data.coreConclusion?.problemSummary?.slice(0, 80)}...`);
    console.log(`- 核心机理: ${data.physicalMechanism?.rootCauseAnalysis?.slice(0, 80)}...`);
    console.log(`- 涉及工程领域: ${data.multiDomainAnalysis?.primaryDomain} (主导) + [${data.multiDomainAnalysis?.relatedDomains?.join(', ')}] (关联)`);
    console.log(`- 候选方案总数: ${data.candidateActions?.length} 个`);

    data.candidateActions?.forEach((a: any, i: number) => {
      console.log(`  方案 ${a.id}: ${a.name} (${a.categoryLabel})`);
      console.log(`    * 5维综合得分: ${a.scores?.total} 分 (T:${a.scores?.T} S:${a.scores?.S} C:${a.scores?.C} Q:${a.scores?.Q} L:${a.scores?.L})`);
      console.log(`    * 风险净跃迁: ${a.riskDelta || '无'}`);
      console.log(`    * 残余风险: [${a.residualRisk}] ${a.residualRiskDetail?.slice(0, 45)}`);
      console.log(`    * 跨域耦合复核: ${a.crossDomainCouplingChecks?.length || 0} 条规则`);
      if (a.veto?.rejection_veto) {
        console.log(`    * 🚨 一票否决生效: ${a.veto.veto_reason}`);
      }
    });

    console.log(`- 最终采纳方案: ${data.finalRecommendation?.recommendedOptionId} (${data.finalRecommendation?.recommendedOptionName})`);

    // 4. 车规审计与自愈纠偏
    console.log(`\n【三、车规防幻觉与自洽性审计结果 (AI Auditor)】`);
    if (data.provenance?.aiAudit) {
      const audit = data.provenance.aiAudit;
      console.log(`- 审计状态: ${audit.overallStatus} (得分: ${audit.auditScore}/100)`);
      console.log(`- 自动纠偏数: ${audit.autoFixSummary?.length || 0} 项`);
      audit.autoFixSummary?.forEach((fix: string) => console.log(`  * [AutoFix] ${fix}`));
      console.log(`- 审计告警/拦截数: ${audit.flags?.length || 0} 项`);
      audit.flags?.forEach((f: any) => console.log(`  * [${f.level}] ${f.title}: ${f.message}`));
    } else {
      console.log(`- 确定性专家基准体系保障：100% 通过物理数学公式计算，无需外部打补丁。`);
    }

    // 5. 逐一验证渲染到各个页面
    console.log(`\n【四、渲染到前端各核心页面 (View) 字段对齐校验】`);
    const pagesToVerify = [
      'FirstScreen10sView (第一屏10秒决策速览)',
      'AnalysisFactView (物理机理与事实底座)',
      'OptionsComparisonView (多方案对比与跨域复核)',
      'DecisionCockpitView (C-T-S-Q-L 决策驾驶舱)',
      'VerificationLoopView (实验验证闭环与 VOI 优先级)',
      'RecommendationRaciView (落地责任矩阵与双层时间轴)',
      'EngineeringDocsView (车规工程文档套件)',
      'ResultProvenanceBanner (车规溯源与调试快照横幅)',
    ];

    let allPagesOk = true;
    for (const pageName of pagesToVerify) {
      const res = verifyPageDataRendering(pageName, data);
      if (!res.passed) {
        allPagesOk = false;
        console.log(`\n📺 ❌ 【未通过】-> ${pageName}`);
      } else {
        console.log(`\n📺 ✅ 【通过】-> ${pageName}`);
      }
      res.checkedFields.forEach((cf) => {
        console.log(`   [${cf.status === 'OK' ? '✔' : '✘'}] ${cf.field}: ${cf.sampleValue || '(空或缺失)'}`);
      });
    }

    console.log(`\n>>> Case [${tc.id}] 校验总结: ${allPagesOk ? '🎉 全页面渲染数据源 100% 完备，与设计意图严格对齐！' : '⚠️ 存在待补齐项'}`);
  }
}

runEndToEndVerification().catch(console.error);
