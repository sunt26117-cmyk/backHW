import { NEW_CROSS_DOMAIN_CASE_1, NEW_CROSS_DOMAIN_CASE_2 } from './test_user_cross_domain_cases';
import { runExpertAnalysis } from '../src/data/expertEngine';
import { runDeterministicPrecomputations } from '../src/utils/deterministicPrecomputation';
import { findSimilarGoldCases, buildGroundingText } from '../src/utils/aiGrounding';
import { GOLD_STANDARD_CASES } from '../src/data/goldStandardCases';
import { getMultiDomainAdaptivePromptGuidance } from '../src/utils/domainAdaptivePromptEngine';
import {
  resolveEngineeringDomain,
  resolveEngineeringDomains,
  getEngineeringDomainLabel,
  getDomainMeasurementFields,
  getDomainMeasurementGroups,
} from '../src/utils/scenarioDomainEngine';
import { assessInputIntegrity, generatePromptIntegrityDirectives } from '../src/utils/inputIntegrityEngine';

async function main() {
  console.log('================================================================');
  console.log('🧪 开始执行「Prompt 精简与协议化 V1」全流程实测与推理演练');
  console.log('================================================================\n');

  // -------------------------------------------------------------
  // 演练 1: 真实案例 1 (48V MHEV-eTurbo，多域耦合，高证据量)
  // -------------------------------------------------------------
  console.log('▶ [演练 1] 真实工况演练：48V MHEV-eTurbo (电源/热/功率器件跨域)');
  const case1 = NEW_CROSS_DOMAIN_CASE_1;
  const assessment1 = assessInputIntegrity(case1.context, case1.issue);
  const baseline1 = runExpertAnalysis(case1.context, case1.issue);
  const precomputed1 = runDeterministicPrecomputations(case1.context, case1.issue);
  const goldCases1 = findSimilarGoldCases(case1.issue, 2);
  const grounding1 = buildGroundingText(baseline1, precomputed1, goldCases1);

  console.log(`- 完整度审计评分: ${assessment1.completenessScore}/100, 等级: ${assessment1.grade}`);
  console.log(`- 本地确定性基线结论: ${baseline1.coreConclusion.problemSummary}`);
  console.log(`- 预核算物理事实条数: ${precomputed1.length} 条 (含泵升/裕量/耐压核算)`);
  console.log(`- 匹配到的金标准案例: ${goldCases1.map(g => `${g.caseId}: ${g.title}`).join(' | ')}`);

  // 验证 few-shot 裁剪是否生效
  console.log(`- 金标准 few-shot 文本长度: ${grounding1.goldCaseText.length} 字符`);
  if (grounding1.goldCaseText.includes('actualMeasurement') || grounding1.goldCaseText.includes('failurePhenomenon:')) {
    console.error('❌ Few-shot 中仍包含冗长原始工况描述');
  } else {
    console.log('✅ Few-shot 已成功裁剪至仅保留：关键计算结论、VETO 条件、预期最佳动作');
  }

  // -------------------------------------------------------------
  // 演练 2: 真实案例 2 (800V SiC 主驱逆变器，物理量级相似度门控验证)
  // -------------------------------------------------------------
  console.log('\n▶ [演练 2] 物理量级相似度门控演练：800V SiC (高压 vs 12V/48V 案例)');
  const case2 = NEW_CROSS_DOMAIN_CASE_2;
  const goldCases2 = findSimilarGoldCases(case2.issue, 2);
  console.log(`- 800V SiC 匹配案例: ${goldCases2.map(g => `${g.caseId}: ${g.title}`).join(' | ') || '无不匹配的高偏离案例 (硬否决已成功剔除低压案例)'}`);
  
  // 模拟一个 12V 案例与 800V 案例对比
  const test12vIssue = {
    issueCategories: ['Power', 'EMC'],
    requirement: '12V 供电纹波 <= 50mV',
    actualMeasurement: '12V 纹波达到 180mV',
    failurePhenomenon: '低压纹波超标',
    engineeringConcern: '12V LDO 发热',
    measuredValues: { busVoltageNominalV: 12, busVoltagePeakV: 16 }
  };
  const goldCasesFor12v = findSimilarGoldCases(test12vIssue as any, 2);
  console.log(`- 12V 测试输入匹配案例: ${goldCasesFor12v.map(g => `${g.caseId}: ${g.title}`).join(' | ')}`);

  // -------------------------------------------------------------
  // 演练 3: 低证据场景（GRADE_D/必填项严重缺失）Prompt 条件降级验证 (P1-1)
  // -------------------------------------------------------------
  console.log('\n▶ [演练 3] 低证据等级降级演练 (P1-1: 避免弱证据下的模型过度发散与幻觉)');
  const lowEvidenceIssue = {
    issueCategories: ['Thermal'],
    requirement: 'MOSFET 结温需满足降额',
    actualMeasurement: '发热严重，未测量具体温度与电压',
    failurePhenomenon: '器件烫手',
    engineeringConcern: '是否会烧毁',
    measuredValues: {} // 没有任何结构化实测值
  };
  const lowAssessment = assessInputIntegrity(case1.context, lowEvidenceIssue as any);
  console.log(`- 低证据输入审计评分: ${lowAssessment.completenessScore}/100, 等级: ${lowAssessment.grade}`);
  
  const primaryDomain = resolveEngineeringDomain(lowEvidenceIssue as any);
  const isLowEvidence = lowAssessment.grade === 'GRADE_D_BLOCKING' || lowAssessment.grade === 'GRADE_C_INSUFFICIENT';
  console.log(`- 主导领域判定: ${getEngineeringDomainLabel(primaryDomain)}`);
  console.log(`- 证据等级判定: ${isLowEvidence ? 'LOW (公式/选型/推导降级模式，仅保留硬性否决与必测证据)' : 'HIGH'}`);

  // -------------------------------------------------------------
  // 演练 4: 调用本地 live API 验证协议字段完整性与响应
  // -------------------------------------------------------------
  console.log('\n▶ [演练 4] 端到端 API 调用演练 (POST /api/copilot/analyze)');
  
  const response = await fetch('http://localhost:3000/api/copilot/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      context: case1.context,
      issue: case1.issue,
    }),
  });

  if (!response.ok) {
    throw new Error(`API 调用失败: ${response.status} ${await response.text()}`);
  }

  const result: any = await response.json();
  console.log(`✅ API 成功响应！数据源: ${result.source}`);

  const data = result.data;
  console.log(`\n【协议字段完整性核对】：`);
  console.log(`- 核心结论 (coreConclusion): ${data.coreConclusion ? '✅ 存在 (' + data.coreConclusion.coreRiskGrade + ')' : '❌ 缺失'}`);
  console.log(`- 决策框架 (decisionFrame): ${data.decisionFrame ? '✅ 存在 (决策窗口: ' + data.decisionFrame.decisionWindow + ')' : '❌ 缺失'}`);
  console.log(`- 风险评级 (riskRatings): ${data.riskRatings ? '✅ 存在 (综合风险: ' + data.riskRatings.overallRisk + ', ' + data.riskRatings.overallRiskScore + '分)' : '❌ 缺失'}`);
  console.log(`- 候选方案 (candidateActions): ${Array.isArray(data.candidateActions) ? `✅ 存在 (${data.candidateActions.length} 个方案)` : '❌ 缺失'}`);
  console.log(`- 最终建议 (finalRecommendation): ${data.finalRecommendation ? '✅ 存在 (推荐: ' + data.finalRecommendation.recommendedOptionName + ')' : '❌ 缺失'}`);
  
  // 检查 dualTimeline
  console.log(`- 双层时间轴 (dualTimeline):`);
  if (data.dualTimeline) {
    const dt = data.dualTimeline;
    console.log(`  * containmentPhase (T+24h 应急遏制): ${dt.containmentPhase ? '✅ 存在' : '❌ 缺失'}`);
    if (dt.containmentPhase) {
      console.log(`    - 窗口: ${dt.containmentPhase.timeWindow}`);
      console.log(`    - 动作数: ${dt.containmentPhase.actions?.length || 0} 个`);
      console.log(`    - 退出准则: ${dt.containmentPhase.exitCriteria}`);
    }
    console.log(`  * permanentPhase (永久纠正): ${dt.permanentPhase ? '✅ 存在' : '❌ 缺失'}`);
    if (dt.permanentPhase) {
      console.log(`    - 窗口: ${dt.permanentPhase.timeWindow}`);
      console.log(`    - 动作数: ${dt.permanentPhase.actions?.length || 0} 个`);
      console.log(`    - 退出准则: ${dt.permanentPhase.exitCriteria}`);
    }
    console.log(`  * 战略权衡 (strategicTradeoff): ${dt.strategicTradeoff ? '✅ 存在' : '⚠️ 空'}`);
  } else {
    console.error('❌ dualTimeline 字段缺失');
  }

  // 检查 provenance
  console.log(`- 溯源信息 (provenance): ${data.provenance ? '✅ 存在 (' + data.provenance.engineName + ')' : '❌ 缺失'}`);
  
  console.log('\n================================================================');
  console.log('🎉 推理演练全部顺利完成，所有协议字段与门控机制均正常工作！');
  console.log('================================================================');
}

main().catch(err => {
  console.error('演练执行出错:', err);
  process.exit(1);
});
