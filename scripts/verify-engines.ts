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
import { evaluateAllRobotJointPatterns, deriveRobotJointEvaluationInput, type RobotJointEvaluationInput } from '../src/data/robotJointPatternEngine';
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
const quietAllPatterns = evaluateAllBldcPatterns(quietBldcInput);
const quietPatterns = quietAllPatterns.filter((p) => p.triggered).map((p) => p.id);
check('温和工况不得触发 P001~P008', () => {
  for (const id of ['P001', 'P002', 'P003', 'P004', 'P005', 'P006', 'P007', 'P008'] as const) {
    assert.equal(quietPatterns.includes(id), false, id + ' 不应在温和工况触发，实际=' + quietPatterns.join(','));
  }
});

// [本次修复新增] 之前这里只覆盖 P001~P008，P009/P010/P011/P015/P017/P018 被刻意绕开——
// 也正是这批被绕开的模式里，P009/P010/P011/P018 当时是硬编码 triggered:true。现在把覆盖
// 范围扩到 P009~P018（除 P015/P017 外，它们是设计检查清单类型，允许恒定为 true，见下方
// 单独断言），让"这些模式是否真的会随工况变化"重新变得可见、可回归验证。
// 注意：P013/P014 本轮已一并修复——P013 原来因 cbusUf 缺省470μF < 600μF 阈值而几乎总触发，
// P014 原来因"P001理论泵升 × 30%过冲假设"两层假设叠加越过75%降额线而触发。现在二者都加了
// triggered 守卫(缺实测证据不触发)，并重新纳入本断言范围做回归验证。
check('温和工况不得触发 P009~P018 中的检测型模式（P015/P017 checklist 除外）', () => {
  for (const id of ['P009', 'P010', 'P011', 'P012', 'P013', 'P014', 'P016', 'P018'] as const) {
    assert.equal(quietPatterns.includes(id), false, id + ' 不应在温和工况触发，实际=' + quietPatterns.join(','));
  }
});

check('P015/P017 是设计检查清单类型 (patternKind=CHECKLIST)，与检测型模式的 triggered 语义区分开', () => {
  const p015 = quietAllPatterns.find((p) => p.id === 'P015');
  const p017 = quietAllPatterns.find((p) => p.id === 'P017');
  assert.equal(p015?.patternKind, 'CHECKLIST', 'P015 应标记为 CHECKLIST');
  assert.equal(p017?.patternKind, 'CHECKLIST', 'P017 应标记为 CHECKLIST');
});

check('霍尔故障症状文本证据应触发 P009，缺少证据的温和工况不应', () => {
  const hallCase = evaluateAllBldcPatterns({ ...quietBldcInput, hallFaultRiskIndicated: true }).filter((p) => p.triggered).map((p) => p.id);
  assert.equal(hallCase.includes('P009'), true, '有霍尔故障文本证据应触发 P009，实际=' + hallCase.join(','));
  assert.equal(quietPatterns.includes('P009'), false, '温和工况(无证据)不得触发 P009');
});

check('明确指定编码器方案时 P009 不适用，即使给了霍尔故障文本证据也不应触发', () => {
  const encoderCase = evaluateAllBldcPatterns({ ...quietBldcInput, motorSensorType: 'ENCODER', hallFaultRiskIndicated: true }).filter((p) => p.triggered).map((p) => p.id);
  assert.equal(encoderCase.includes('P009'), false, '编码器方案下不应触发霍尔故障模式，实际=' + encoderCase.join(','));
});

check('缺母线电容实测值(cbusUf=NaN)时 P013 不得触发——修复默认470μF越阈值问题', () => {
  const noCbus = evaluateAllBldcPatterns({ ...quietBldcInput, cbusUf: NaN }).filter((p) => p.triggered).map((p) => p.id);
  assert.equal(noCbus.includes('P013'), false, '缺母线电容实测值时不应触发 P013，实际=' + noCbus.join(','));
});

check('缺线束长度输入(harnessLengthM=NaN)时 P008 不得触发——修复默认1.8m越阈值问题', () => {
  const noHarness = evaluateAllBldcPatterns({ ...quietBldcInput, harnessLengthM: NaN }).filter((p) => p.triggered).map((p) => p.id);
  assert.equal(noHarness.includes('P008'), false, '缺线束长度输入时不应触发 P008，实际=' + noHarness.join(','));
});

check('缺母线实测峰值(vbusMeasuredPeak 未提供)时 P014 不得触发——修复双层假设叠加问题', () => {
  const noVbusMeasured = evaluateAllBldcPatterns({ ...quietBldcInput }).filter((p) => p.triggered).map((p) => p.id);
  assert.equal(noVbusMeasured.includes('P014'), false, '缺母线实测峰值时不应触发 P014，实际=' + noVbusMeasured.join(','));
});

check('堵转文本证据应触发 P018，缺少证据的温和工况不应', () => {
  const stallCase = evaluateAllBldcPatterns({ ...quietBldcInput, stallRiskIndicated: true }).filter((p) => p.triggered).map((p) => p.id);
  assert.equal(stallCase.includes('P018'), true, '有堵转文本证据应触发 P018，实际=' + stallCase.join(','));
  assert.equal(quietPatterns.includes('P018'), false, '温和工况(无证据)不得触发 P018');
});

check('gateSpikeV(示波器实测门极尖峰)必须真正接入引擎，不能只是导入展示而不影响任何判据', () => {
  const withoutMeasured = evaluateAllBldcPatterns(quietBldcInput).find((p) => p.id === 'P003')!;
  const withMeasured = evaluateAllBldcPatterns({ ...quietBldcInput, gateSpikeMeasuredV: 5.5 }).find((p) => p.id === 'P003')!;
  assert.equal(withoutMeasured.triggered, false, '温和工况无实测门极尖峰时 P003 不应触发');
  assert.equal(withMeasured.triggered, true, '门极尖峰实测值(5.5V)超过Vth(2.0V)时应触发 P003，实际未触发说明 gateSpikeV 没有真正接入');
  assert.equal(withMeasured.evidenceType, 'MEASURED', 'gateSpikeV 生效时 evidenceType 应为 MEASURED');
});

check('急停高速工况应触发 P001，温和工况不应', () => {
  const fast = evaluateAllBldcPatterns({ vbusNominal: 12, vdsRating: 40, rpm: 3800, jInertia: 0.00015, cbusUf: 470, tAmbientC: 25, currentPeakA: 25, harnessLengthM: 0.5, deadTimeNs: 120, rgOffOhm: 4.7, cgdPf: 45, dvDtVns: 6.0, vthMinV: 2.0 }).filter((p) => p.triggered).map((p) => p.id);
  assert.equal(fast.includes('P001'), true, '急停工况应触发 P001，实际=' + fast.join(','));
  assert.equal(quietPatterns.includes('P001'), false, '温和工况不得触发 P001');
});

console.log(`\n${failures === 0 ? '全部通过' : `共 ${failures} 项失败`}`);

console.log('\n=== 机器人关节模式 J001~J007：健康工况不得一票否决 + 关键失效闭锁 ===');

const quietJointInput: RobotJointEvaluationInput = {
  gearRatio: 100,
  backlashArcmin: 0.5,
  requiredPositionAccuracyArcmin: 10,
  outputTorqueNm: 20,
  torsionalStiffnessNmPerRad: 18000,
  velocityLoopBandwidthHz: 40,
  motorInertiaKgm2: 0.00012,
  loadInertiaKgm2: 0.05,
  encoderType: 'MULTI_TURN_ABS_BATTERYLESS',
  encoderBatteryVoltageV: 3.0,
  encoderBatteryMinVoltageV: 2.6,
  regenPowerPeakW: 100,
  dutyCycleDecelPct: 10,
  brakingResistorRatedContinuousW: 50,
  brakingResistorRatedPeakW: 400,
  hasDedicatedTorqueSensor: true,
  gearboxEfficiencyMinPct: 70,
  gearboxEfficiencyMaxPct: 90,
  collaborativeSafetyRequired: false,
  stoImplementation: 'DUAL_CHANNEL_HW_STO',
  requiredPerformanceLevel: 'PLd',
  stoCategory: '3',
  mttfdYears: 50,
  dcAvgPct: 90,
  ccfScorePoints: 70,
  stoResponseTimeMs: 5,
  requiredResponseTimeMs: 20,
  busProtocol: 'ETHERCAT_CoE',
  busCycleTimeUs: 250,
  localPositionLoopCycleUs: 125,
  hasLocalInterpolation: true,
  busLossFallbackStrategy: 'RAMP_TO_ZERO',
};

function jointVetoIds(input: RobotJointEvaluationInput): string[] {
  return evaluateAllRobotJointPatterns(input).filter((p) => p.vetoTriggered).map((p) => p.id);
}

check('健康关节工况 J001~J007 全部不得一票否决（vetoTriggered 全 false）', () => {
  assert.deepEqual(jointVetoIds(quietJointInput), [], '健康工况不应有任何 J 模式一票否决，实际=' + jointVetoIds(quietJointInput).join(','));
});

check('J006 未声明性能等级(UNDECLARED)必须一票否决——不能默认当作不需要安全等级放行', () => {
  const veto = jointVetoIds({ ...quietJointInput, requiredPerformanceLevel: 'UNDECLARED' });
  assert.equal(veto.includes('J006'), true, 'UNDECLARED 应触发 J006 否决，实际=' + veto.join(','));
});

check('J006 声明 PLd 但仅软件禁止 PWM -> 通道独立性违规，一票否决', () => {
  const veto = jointVetoIds({ ...quietJointInput, stoImplementation: 'SOFTWARE_PWM_DISABLE_ONLY' });
  assert.equal(veto.includes('J006'), true, '软件STO+PLd 应触发 J006 否决，实际=' + veto.join(','));
});

check('J004 泄放电阻连续功率不足 -> 一票否决', () => {
  const veto = jointVetoIds({ ...quietJointInput, brakingResistorRatedContinuousW: 5 });
  assert.equal(veto.includes('J004'), true, '连续功率 5W < 平均回馈 10W 应触发 J004 否决，实际=' + veto.join(','));
});

check('J007 未定义总线丢包降级策略 -> 一票否决', () => {
  const veto = jointVetoIds({ ...quietJointInput, busLossFallbackStrategy: 'NONE' });
  assert.equal(veto.includes('J007'), true, '无降级策略应触发 J007 否决，实际=' + veto.join(','));
});

check('J002 电池型多圈编码器电压裕量跌破阈值 -> 一票否决', () => {
  const veto = jointVetoIds({ ...quietJointInput, encoderType: 'MULTI_TURN_ABS_BATTERY', encoderBatteryVoltageV: 2.6, encoderBatteryMinVoltageV: 2.6 });
  assert.equal(veto.includes('J002'), true, '电压裕量 0V 应触发 J002 否决，实际=' + veto.join(','));
});

check('J001 背隙+柔性误差超出规格 -> 一票否决', () => {
  const veto = jointVetoIds({ ...quietJointInput, requiredPositionAccuracyArcmin: 1 });
  assert.equal(veto.includes('J001'), true, '总误差约4.3arcmin > 规格1arcmin 应触发 J001 否决，实际=' + veto.join(','));
});

check('J003 健康工况应触发(有谐振频率)但不否决，且频率在合理区间', () => {
  const j3 = evaluateAllRobotJointPatterns(quietJointInput).find((p) => p.id === 'J003')!;
  assert.equal(j3.triggered, true, 'J003 应给出谐振频率');
  assert.equal(j3.vetoTriggered, false, '健康工况 J003 不应否决');
  const freqRaw = j3.calculatedValues['估算机械谐振频率 f_res (Hz)'];
  assert.equal(typeof freqRaw, 'number', 'J003 应给出数值频率');
  assert.equal((freqRaw as number) > 3 && (freqRaw as number) < 300, true, '谐振频率应落在合理区间(3~300Hz)，实际=' + freqRaw);
});

check('deriveRobotJointEvaluationInput 缺省时 PL=UNDECLARED -> J006 fail-closed（不能默认 NONE）', () => {
  const derived = deriveRobotJointEvaluationInput(issue({ issueCategories: ['Robot Joint Drive'] }));
  assert.equal(derived.requiredPerformanceLevel, 'UNDECLARED');
  const veto = evaluateAllRobotJointPatterns(derived).filter((p) => p.vetoTriggered).map((p) => p.id);
  assert.equal(veto.includes('J006'), true, '缺省输入应触发 J006 否决，实际=' + veto.join(','));
});

process.exit(failures === 0 ? 0 : 1);
