import fetch from 'node-fetch';
import { PRESET_SCENARIOS } from '../src/data/presetScenarios';

async function testCase(scenarioId: string, caseName: string) {
  console.log(`\n================================================================`);
  console.log(`🚀 开始测试跨域 Case: ${caseName} (ID: ${scenarioId})`);
  console.log(`================================================================`);

  const scenario = PRESET_SCENARIOS.find((s) => s.id === scenarioId);
  if (!scenario) {
    throw new Error(`Scenario ${scenarioId} not found`);
  }

  const startTime = Date.now();
  const response = await fetch('http://localhost:3000/api/copilot/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      context: scenario.context,
      issue: scenario.issue,
      modelConfig: {
        enabled: true,
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        temperature: 0.2,
      },
    }),
  });

  const durationMs = Date.now() - startTime;
  console.log(`📡 请求完成，HTTP 状态码: ${response.status} (耗时: ${durationMs}ms)`);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API 报错: ${response.status} - ${errorText}`);
  }

  const rawJson: any = await response.json();
  const result: any = rawJson.data || rawJson.result || rawJson;

  // 1. 检查输出给 AI 的 Prompt 与溯源快照
  console.log(`\n【1. 软件输入给 AI 的 Prompt 与预计算数据透视】`);
  const prov = result.resultProvenance;
  console.log(`- 推理引擎类型: ${prov?.isAiInferred ? '🟣 大模型实时推理 (AI-Inferred)' : '🟢 确定性专家基准 (Deterministic)'}`);
  console.log(`- 真实模型标识: ${prov?.modelIdentifier || '默认'}`);
  console.log(`- 实际响应延迟: ${prov?.debugSnapshot?.latencyMs ?? prov?.latencyMs ?? durationMs} ms`);

  const debug = prov?.debugSnapshot;
  if (debug) {
    console.log(`- 软件组装 Prompt 总字符量: ${debug.promptLength} 字符`);
    console.log(`- 注入确定性物理预计算事实条数: ${debug.precomputedFactsCount}`);
    console.log(`- 审计自动纠偏项数: ${debug.autoFixesCount}`);
    console.log(`- 命中的车规审计规则数: ${debug.auditedRuleHits}`);
    console.log(`- JSON 修复与重试次数: ${debug.retryCount}`);
    console.log(`- Prompt 定锚片段摘要:\n--------------------\n${debug.promptSnippet}\n--------------------`);
  }

  const integrity = prov?.inputIntegrity;
  if (integrity) {
    console.log(`- 输入完整度评级: ${integrity.gradeLabel} (${integrity.completenessScore}/100)`);
    console.log(`- 缺失必填字段: ${integrity.missingRequiredFields?.join(', ') || '无'}`);
  }

  // 2. 检查 AI 生成的核心内容
  console.log(`\n【2. AI 生成的核心工程结论与机理】`);
  console.log(`- 问题定性: ${result.coreConclusion?.problemSummary}`);
  console.log(`- 推荐措施: ${result.coreConclusion?.recommendedMeasure}`);
  console.log(`- 推荐理由: ${result.coreConclusion?.reasonSummary}`);
  console.log(`- 物理根因分析: ${result.physicalMechanism?.rootCauseAnalysis}`);
  console.log(`- 关键物理影响因子 (${result.physicalMechanism?.keyPhysicalFactors?.length || 0} 个):`);
  (result.physicalMechanism?.keyPhysicalFactors || []).slice(0, 3).forEach((f: any, idx: number) => {
    console.log(`  [${idx + 1}] ${f.factor}: ${f.description}`);
  });

  // 3. 检查多工程域关联与跨域物理耦合
  console.log(`\n【3. 多工程域分析与跨域耦合】`);
  console.log(`- 主导领域: ${result.multiDomainAnalysis?.primaryDomain}`);
  console.log(`- 关联领域: ${result.multiDomainAnalysis?.relatedDomains?.join(', ')}`);
  console.log(`- 跨域链路数量: ${result.multiDomainAnalysis?.crossDomainLinks?.length || 0}`);
  (result.multiDomainAnalysis?.crossDomainLinks || []).slice(0, 2).forEach((link: any, idx: number) => {
    console.log(`  [Link ${idx + 1}] ${link.fromDomain} ➔ ${link.toDomain}: ${link.mechanism} (依据: ${link.evidenceBasis})`);
  });
  console.log(`- 跨域否决条件数: ${result.multiDomainAnalysis?.crossDomainVetoes?.length || 0}`);
  (result.multiDomainAnalysis?.crossDomainVetoes || []).forEach((v: any, idx: number) => {
    console.log(`  [Veto ${idx + 1}] 触发条件: ${v.condition} | 阻断: ${v.blocks?.join(',')} | 依据: ${v.rationale}`);
  });

  // 4. 检查措施对比（OptionsComparisonView 所需）
  console.log(`\n【4. 候选工程方案对比 (OptionsComparisonView)】`);
  console.log(`- 候选方案总数: ${result.candidateActions?.length || 0}`);
  (result.candidateActions || []).forEach((opt: any, idx: number) => {
    console.log(`\n  --- 方案 [${opt.id}] ${opt.name} (${opt.categoryLabel}) ---`);
    console.log(`  - 推荐状态: ${opt.id === result.finalRecommendation?.recommendedOptionId ? '★ 被系统采纳为最佳推荐' : '候选备选'}`);
    console.log(`  - 实施周期: ${opt.timeCost} | 验证成本: ${opt.verificationCost}`);
    console.log(`  - 预期收益: ${opt.expectedBenefit}`);
    console.log(`  - 残余风险: [${opt.residualRisk}] ${opt.residualRiskDetail}`);
    console.log(`  - 风险净变化 (riskDelta): ${opt.riskDelta || '未标注'}`);
    console.log(`  - 退路 Plan B: ${opt.planB}`);
    if (opt.veto?.rejection_veto) {
      console.log(`  - 🚨 一票否决 (VETO): ${opt.veto.veto_reason}`);
    }
    if (opt.customerVetoViolations?.length > 0) {
      console.log(`  - ⚠️ 触犯客户特约协议 (CSA): ${opt.customerVetoViolations.join('; ')}`);
    }
    console.log(`  - 跨域耦合复核闭环项数: ${opt.crossDomainCouplingChecks?.length || 0}`);
    (opt.crossDomainCouplingChecks || []).slice(0, 2).forEach((c: any) => {
      console.log(`    * [${c.addressed ? '已闭环' : '待处理'}] ${c.rule}: ${c.note || ''}`);
    });
  });

  // 5. 检查车规自洽性审计器输出
  console.log(`\n【5. 车规防幻觉与自洽性审计核验 (aiAudit)】`);
  const audit = prov?.aiAudit;
  if (audit) {
    console.log(`- 审计状态: ${audit.overallStatus}`);
    console.log(`- 审计得分: ${audit.auditScore} / 100`);
    console.log(`- 审计是否通过: ${audit.passed ? '✅ 通过' : '❌ 未完全通过'}`);
    console.log(`- 自动纠偏项 (${audit.autoFixSummary?.length || 0} 个):`);
    (audit.autoFixSummary || []).forEach((fix: string) => console.log(`  * ${fix}`));
    console.log(`- 命中规则警告/拦截 (${audit.flags?.length || 0} 个):`);
    (audit.flags || []).forEach((flag: any) => console.log(`  * [${flag.level}] ${flag.title}: ${flag.message}`));
  } else {
    console.log(`- 本次由确定性专家引擎直接计算，无需大模型二次审计。`);
  }

  // 6. 各前端页面数据完整性核对
  console.log(`\n【6. 各前端视图 (View) 字段对齐检查】`);
  const viewChecks = {
    FirstScreen10sView: Boolean(result.coreConclusion && result.decisionFrame && result.riskRatings),
    AnalysisFactView: Boolean(result.physicalMechanism && result.dfmeaView && result.knownFacts),
    OptionsComparisonView: Boolean(result.candidateActions && result.candidateActions.length >= 3),
    DecisionCockpitView: Boolean(result.candidateActions?.every((a: any) => a.scores) && result.finalRecommendation),
    VerificationLoopView: Boolean(result.verificationLoops && result.verificationLoops.length > 0),
    RecommendationRaciView: Boolean(result.raciAssignment && result.dualTimeline),
    EngineeringDocsView: Boolean(result.coreConclusion && result.candidateActions),
    ResultProvenanceBanner: Boolean(result.resultProvenance),
  };
  for (const [view, ok] of Object.entries(viewChecks)) {
    console.log(`  - 视图 [${view}]: ${ok ? '✅ 数据源齐备无缺失' : '❌ 缺失关键字段'}`);
  }

  return result;
}

async function main() {
  try {
    // 运行两个典型的跨域测试 Case
    await testCase('bldc-motor-drive', 'Case 1: 车载BLDC电驱急停泵升与门极米勒效应');
    await testCase('robot-joint-backlash-sto', 'Case 2: 协作机器人关节背隙误差与STO双通道硬件切断');
    console.log(`\n================================================================`);
    console.log(`🎉 两个跨域 Case 实际调用与验证全部执行完毕！`);
    console.log(`================================================================\n`);
  } catch (err) {
    console.error(`测试执行失败:`, err);
    process.exit(1);
  }
}

main();
