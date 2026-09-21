/**
 * 确定性引擎 + 金标准案例 回归验证脚本
 *
 * 不依赖 vitest/jest 等测试框架 —— 项目 devDependencies 里已经有 tsx，直接用它跑 TS 源码，
 * 不需要新增依赖（新增未经验证的依赖在这个环境里没法真正装包测试，宁可先用最小可行的方式
 * 把"有没有跑测试"这件事从0做到1）。
 *
 * 用法：npm test （见 package.json）
 * 任何一条断言失败，进程以非零码退出，可以直接接 CI 门禁。
 */
import assert from 'node:assert/strict';
import { runDeterministicPrecomputations } from '../src/utils/deterministicPrecomputation';
import { recalculateStandardWeightedScore } from '../src/utils/scoringWeights';
import { assessDomainClassificationAmbiguity } from '../src/utils/scenarioDomainEngine';
import { GOLD_STANDARD_CASES, runGoldStandardCaseRegression } from '../src/data/goldStandardCases';
import { evaluateAllBldcPatterns } from '../src/data/bldcPatternEngine';
import type { IssueInput, ProjectContext } from '../src/types';

let failures = 0;
function check(label: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${label}`);
  } catch (err) {
    failures++;
    console.log(`  ✗ ${label}`);
    console.log(`    ${(err as Error).message}`);
  }
}

const CONTEXT: ProjectContext = {
  projectName: 'test', projectPhase: 'EVT', customer: 'x', ecuType: 'x',
  asilLevel: 'QM', sopDate: '', nextMilestone: '',
} as ProjectContext;

function issue(partial: Partial<IssueInput>): IssueInput {
  return {
    issueCategories: [], failurePhenomenon: '', requirement: '', testCondition: '',
    actualMeasurement: '', engineeringConcern: '', notes: '', measuredValues: {},
    ...partial,
  } as IssueInput;
}

function factOf(issueInput: IssueInput, id: string) {
  return runDeterministicPrecomputations(CONTEXT, issueInput).find((f) => f.id === id);
}

console.log('=== 确定性引擎：缺输入必须返回 INSUFFICIENT_INPUT，不能静默用默认值 ===');

check('BLDC Bus Pumping 缺 J(rotorInertiaKgm2) -> INSUFFICIENT_INPUT', () => {
  const f = factOf(
    issue({ issueCategories: ['BLDC Motor Drive'], measuredValues: { busVoltageNominalV: 48, cBusUf: 470, rpm: 3800, vdsRatingV: 60 } }),
    'BLDC_BUS_PUMPING'
  );
  assert.equal(f?.status, 'INSUFFICIENT_INPUT');
  assert.equal(f?.missingInputs?.some((m) => m.includes('rotorInertiaKgm2')), true);
});

check('BLDC Bus Pumping 结构化输入齐全 -> CALCULATED 且给出具体数值', () => {
  const f = factOf(
    issue({
      issueCategories: ['BLDC Motor Drive'],
      measuredValues: { busVoltageNominalV: 12, cBusUf: 470, rotorInertiaKgm2: 0.00018, rpm: 3800, vdsRatingV: 40 },
    }),
    'BLDC_BUS_PUMPING'
  );
  assert.equal(f?.status, 'CALCULATED');
  assert.equal(typeof f?.calculatedValue, 'number');
});

check('自由文本提到具体数字但 measuredValues 为空 -> 三个引擎都不得给出确定性数值', () => {
  const facts = runDeterministicPrecomputations(
    CONTEXT,
    issue({
      issueCategories: ['BLDC Motor Drive'],
      failurePhenomenon: '母线电压 12V，母线电容 470uF，转速 3800rpm，Vds耐压 40V 时出现过压告警',
      measuredValues: {},
    })
  );
  for (const f of facts) {
    if (f.category === 'BUS_PUMPING' || f.category === 'MILLER_TRANSIENT' || f.category === 'THERMAL_TJ') {
      assert.equal(f.status, 'INSUFFICIENT_INPUT', `${f.id} 不应在纯自由文本下给出确定性结果`);
    }
  }
});

check('机器人关节谐振 缺 gearRatio -> INSUFFICIENT_INPUT', () => {
  const f = factOf(
    issue({
      issueCategories: ['Robot Joint Drive'],
      measuredValues: { torsionalStiffnessNmPerRad: 8000, rotorInertiaKgm2: 0.0002, loadInertiaKgm2: 0.05 },
    }),
    'ROBOT_JOINT_RESONANCE'
  );
  assert.equal(f?.status, 'INSUFFICIENT_INPUT');
  assert.equal(f?.missingInputs?.some((m) => m.includes('gearRatio')), true);
});

check('机器人关节谐振 输入齐全 -> CALCULATED', () => {
  const f = factOf(
    issue({
      issueCategories: ['Robot Joint Drive'],
      measuredValues: { torsionalStiffnessNmPerRad: 8000, rotorInertiaKgm2: 0.0002, loadInertiaKgm2: 0.05, gearRatio: 100 },
    }),
    'ROBOT_JOINT_RESONANCE'
  );
  assert.equal(f?.status, 'CALCULATED');
});

check('结温级联 无任何输入 -> INSUFFICIENT_INPUT', () => {
  const f = factOf(issue({ issueCategories: ['BLDC Motor Drive'] }), 'PRE_THERMAL_TJ');
  assert.equal(f?.status, 'INSUFFICIENT_INPUT');
});

check('结温级联 正常工况输入齐全 -> CALCULATED 且收敛（不是发散/热失控）', () => {
  const f = factOf(
    issue({
      issueCategories: ['BLDC Motor Drive'],
      measuredValues: { tCaseC: 95, currentNominalA: 8, rdsOnMilliOhm: 3.2, busVoltageNominalV: 48, pwmFreqKhz: 20, qgdNc: 12, tjMaxC: 150 },
    }),
    'PRE_THERMAL_TJ'
  );
  assert.equal(f?.status, 'CALCULATED');
  assert.notEqual(f?.calculatedValue, 'THERMAL_RUNAWAY');
});

check('结温级联 极端工况（大电流+高频+大Rds标称）-> 判定为 THERMAL_RUNAWAY 而不是硬算出一个虚高数字', () => {
  const f = factOf(
    issue({
      issueCategories: ['BLDC Motor Drive'],
      measuredValues: { tCaseC: 120, currentNominalA: 400, rdsOnMilliOhm: 50, busVoltageNominalV: 400, pwmFreqKhz: 200, qgdNc: 300, tjMaxC: 150 },
    }),
    'PRE_THERMAL_TJ'
  );
  assert.equal(f?.calculatedValue, 'THERMAL_RUNAWAY');
});

console.log('\n=== 共享权重公式 ===');
check('T=100 单项权重 -> 25.0', () => {
  assert.equal(recalculateStandardWeightedScore({ T: 100, S: 0, C: 0, Q: 0, L: 0 }), 25.0);
});
check('全部拉满 -> 100.0', () => {
  assert.equal(recalculateStandardWeightedScore({ T: 100, S: 100, C: 100, Q: 100, L: 100 }), 100.0);
});

console.log('\n=== 域分类歧义检测 ===');
check('无显式分类 + 文本同时命中BLDC和WCCA关键词 -> isAmbiguous', () => {
  const r = assessDomainClassificationAmbiguity(
    issue({ issueCategories: [], failurePhenomenon: 'BLDC电机泵升问题，同时存在公差链Cpk不足的WCCA担忧' })
  );
  assert.equal(r.isAmbiguous, true);
});
check('有显式分类 -> 永远不判定为歧义（显式分类是权威判定）', () => {
  const r = assessDomainClassificationAmbiguity(
    issue({ issueCategories: ['BLDC Motor Drive'], failurePhenomenon: '同时提到WCCA公差链Cpk' })
  );
  assert.equal(r.isAmbiguous, false);
});

console.log('\n=== 金标准案例回归（真实调用模式引擎，不是照抄 expectedPattern） ===');
let goldPass = 0;
for (const c of GOLD_STANDARD_CASES) {
  const r = runGoldStandardCaseRegression(c.caseId);
  const mark = r.status === 'PASS' ? '✓' : '✗';
  console.log(`  ${mark} ${c.caseId} [预期 ${c.expectedPattern}] 实际触发: ${r.matchedPattern}`);
  if (r.status === 'PASS') goldPass++; else failures++;
}
console.log('  金标准案例：' + goldPass + '/' + GOLD_STANDARD_CASES.length + ' 通过');

console.log('\n=== 负例断言：检测型模式必须在输入不具备时不触发，防止总是触发回潮 ===');
const quietBldcInput = { vbusNominal: 12, vdsRating: 40, rpm: 500, jInertia: 0.00015, cbusUf: 1000, tAmbientC: 25, currentPeakA: 5, harnessLengthM: 0.5, deadTimeNs: 400, rgOffOhm: 1.0, cgdPf: 45, dvDtVns: 2.0, vthMinV: 2.0 };
const quietPatterns = evaluateAllBldcPatterns(quietBldcInput).filter((p) => p.triggered).map((p) => p.id);
check('温和工况不得触发 P001~P008', () => {
  for (const id of ['P001', 'P002', 'P003', 'P004', 'P005', 'P006', 'P007', 'P008'] as const) {
    assert.equal(quietPatterns.includes(id), false, id + ' 不应在温和工况触发，实际=' + quietPatterns.join(','));
  }
});

check('急停高速工况应触发 P001，温和工况不应', () => {
  const fast = evaluateAllBldcPatterns({ vbusNominal: 12, vdsRating: 40, rpm: 3800, jInertia: 0.00015, cbusUf: 470, tAmbientC: 25, currentPeakA: 25, harnessLengthM: 0.5, deadTimeNs: 120, rgOffOhm: 4.7, cgdPf: 45, dvDtVns: 6.0, vthMinV: 2.0 }).filter((p) => p.triggered).map((p) => p.id);
  assert.equal(fast.includes('P001'), true, '急停工况应触发 P001，实际=' + fast.join(','));
  assert.equal(quietPatterns.includes('P001'), false, '温和工况不得触发 P001');
});

console.log(`\n${failures === 0 ? '全部通过' : `共 ${failures} 项失败`}`);
process.exit(failures === 0 ? 0 : 1);
