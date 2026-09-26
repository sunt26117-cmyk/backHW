/**
 * 缺输入护栏：黑盒验证「少任何一个必需实测输入，确定性引擎就必须判 INSUFFICIENT_INPUT，
 * 并且不得给出任何数值」，而不是偷偷拿 state 里的哨兵值/经验默认值算出一个数字。
 *
 * 为什么这样测（背景）：
 *   unifiedStateExtractor.getNum() 用 0 当「未提供」哨兵，所以 state.xxx 永远是数字；
 *   「到底缺没缺」由 isMeasuredValuePresent(issue, key) 查**原始 measuredValues** 决定。
 *   因此断言对象必须是「引擎的公开产出（status / value / missingInputs）」，
 *   而不是 state 内部长什么样——后者是内部表示，将来换哨兵也不该让测试跟着改。
 *
 * 覆盖（每个引擎逐个字段摘掉，逐一验证）：
 *   - BLDC  busPumping   5 个必需字段
 *   - BLDC  millerRisk   4 个必需字段（cgdPf 可用 qgdNc 换算，双 key 规则）
 *   - 关节  kinematicError 3 个闸门字段
 *   - 关节  resonance     4 个闸门字段
 *   - 热    结温级联       6 个核心字段 + 温度基准（焊盘/环境二选一）
 *
 * 用法：npm test（已并入测试链）
 */
import assert from 'node:assert/strict';
import type { IssueInput, ProjectContext } from '../src/types';
import { extractUnifiedEngineeringModel, readMeasuredNumber } from '../src/utils/unifiedStateExtractor';
import { calculateBldcDeterministicCalculations } from '../src/utils/bldcDeterministicEngine';
import { calculateRobotJointDeterministicCalculations } from '../src/utils/robotJointDeterministicEngine';
import { calculateThermalCascade } from '../src/utils/thermalCascadeEngine';
import { deriveBldcEvaluationInput } from '../src/utils/scenarioDerived';
import { deriveRobotJointEvaluationInput, evaluateAllRobotJointPatterns } from '../src/data/robotJointPatternEngine';

const CONTEXT = {
  projectName: 'guard', projectPhase: 'DV', customer: 'x', ecuType: 'x',
  asilLevel: 'QM', sopDate: '', nextMilestone: '',
} as ProjectContext;

type MV = Record<string, number>;

const makeIssue = (mv: MV, category: string): IssueInput => ({
  issueCategories: [category], failurePhenomenon: '', requirement: '', testCondition: '',
  actualMeasurement: '', engineeringConcern: '', notes: '', measuredValues: mv,
} as unknown as IssueInput);

/** 同 makeIssue，但给指定字段打上非「决策就绪」来源（如 TEXT_INFERRED），其余字段视为正常实测。 */
const makeIssueWithLowEvidence = (mv: MV, category: string, lowEvidenceKeys: string[]): IssueInput => ({
  issueCategories: [category], failurePhenomenon: '', requirement: '', testCondition: '',
  actualMeasurement: '', engineeringConcern: '', notes: '', measuredValues: mv,
  measurementProvenance: Object.fromEntries(
    lowEvidenceKeys.map((k) => [k, { source: 'TEXT_INFERRED', sourceLabel: '自由文本推断，请工程师核实', enteredAt: '', confidencePct: 65 }]),
  ),
} as unknown as IssueInput);

interface EngineOutcome {
  status?: string;
  /** 引擎公开的缺失输入标签（thermal 走 label 字符串） */
  missingLabel: string;
  /** 缺输入时必须为 undefined —— 这是「不得静默算出数字」的断言对象 */
  numericValue: unknown;
}

interface Guard {
  name: string;
  category: string;
  baseline: MV;
  gated: { canonical: string; rawKeys: string[] }[];
  run: (mv: MV) => EngineOutcome;
}

const bldcRun = (calc: 'busPumping' | 'millerRisk') => (mv: MV): EngineOutcome => {
  const i = makeIssue(mv, 'BLDC Motor Drive');
  const s = extractUnifiedEngineeringModel(CONTEXT, i);
  const r = calculateBldcDeterministicCalculations(i, s).find((x) => x.calculation === calc) as
    { status?: string; missingInputs?: string[]; value?: unknown } | undefined;
  return { status: r?.status, missingLabel: (r?.missingInputs || []).join(', '), numericValue: r?.value };
};

const jointRun = (calc: 'kinematicError' | 'resonance') => (mv: MV): EngineOutcome => {
  const i = makeIssue(mv, 'Robot Joint Drive');
  const s = extractUnifiedEngineeringModel(CONTEXT, i);
  const r = calculateRobotJointDeterministicCalculations(i, s).find((x) => x.calculation === calc) as
    { status?: string; missingInputs?: string[]; value?: unknown } | undefined;
  return { status: r?.status, missingLabel: (r?.missingInputs || []).join(', '), numericValue: r?.value };
};

const thermalRun = (mv: MV): EngineOutcome => {
  const i = makeIssue(mv, 'Thermal');
  const s = extractUnifiedEngineeringModel(CONTEXT, i);
  const r = calculateThermalCascade(i, s);
  return {
    status: r?.status,
    missingLabel: String(r?.fact?.safetyMargin || ''),
    numericValue: r?.tjEst,
  };
};

const GUARDS: Guard[] = [
  {
    name: 'BLDC 母线泵升 busPumping',
    category: 'BLDC Motor Drive',
    baseline: { busVoltageNominalV: 48, cBusUf: 470, rotorInertiaKgm2: 3.5e-4, rpm: 3000, vdsRatingV: 60 },
    gated: [
      { canonical: 'busVoltageNominalV', rawKeys: ['busVoltageNominalV'] },
      { canonical: 'cBusUf', rawKeys: ['cBusUf'] },
      { canonical: 'rotorInertiaKgm2', rawKeys: ['rotorInertiaKgm2'] },
      { canonical: 'rpm', rawKeys: ['rpm'] },
      { canonical: 'vdsRatingV', rawKeys: ['vdsRatingV'] },
    ],
    run: bldcRun('busPumping'),
  },
  {
    name: 'BLDC 米勒误导通 millerRisk',
    category: 'BLDC Motor Drive',
    baseline: { dvdtVns: 30, cgdPf: 0.5, qgdNc: 15, rgOffOhm: 2.2, vthMinV: 2.1 },
    gated: [
      { canonical: 'dvdtVns', rawKeys: ['dvdtVns'] },
      // Cgd 允许用 Qgd 换算，两个 key 都不填才算缺失
      { canonical: 'cgdPf', rawKeys: ['cgdPf', 'qgdNc'] },
      { canonical: 'rgOffOhm', rawKeys: ['rgOffOhm'] },
      { canonical: 'vthMinV', rawKeys: ['vthMinV'] },
    ],
    run: bldcRun('millerRisk'),
  },
  {
    name: '关节运动学误差 kinematicError',
    category: 'Robot Joint Drive',
    baseline: { backlashArcmin: 4.5, torsionalStiffnessNmPerRad: 15000, peakTorqueNm: 35, requiredPositionAccuracyArcmin: 3 },
    gated: [
      { canonical: 'backlashArcmin', rawKeys: ['backlashArcmin'] },
      { canonical: 'torsionalStiffnessNmPerRad', rawKeys: ['torsionalStiffnessNmPerRad'] },
      // 引擎语义名 outputTorqueNm 实际对应表单原始字段 peakTorqueNm
      { canonical: 'outputTorqueNm', rawKeys: ['peakTorqueNm'] },
    ],
    run: jointRun('kinematicError'),
  },
  {
    name: '关节谐振 resonance',
    category: 'Robot Joint Drive',
    baseline: { torsionalStiffnessNmPerRad: 15000, rotorInertiaKgm2: 2.0e-4, loadInertiaKgm2: 0.1, gearRatio: 100, velocityLoopBandwidthHz: 40 },
    gated: [
      { canonical: 'torsionalStiffnessNmPerRad', rawKeys: ['torsionalStiffnessNmPerRad'] },
      { canonical: 'motorInertiaKgm2', rawKeys: ['rotorInertiaKgm2'] },
      { canonical: 'loadInertiaKgm2', rawKeys: ['loadInertiaKgm2'] },
      { canonical: 'gearRatio', rawKeys: ['gearRatio'] },
    ],
    run: jointRun('resonance'),
  },
  {
    name: '结温级联 thermal',
    category: 'Thermal',
    baseline: { currentNominalA: 10, rdsOnMilliOhm: 2.5, busVoltageNominalV: 48, pwmFreqKhz: 20, qgdNc: 15, tjMaxC: 150, tAmbientC: 25 },
    gated: [
      { canonical: 'currentNominal', rawKeys: ['currentNominalA'] },
      { canonical: 'rdsOnMilliOhm', rawKeys: ['rdsOnMilliOhm'] },
      { canonical: 'vbusNominal', rawKeys: ['busVoltageNominalV'] },
      { canonical: 'pwmFrequencyKhz', rawKeys: ['pwmFreqKhz'] },
      { canonical: 'qgdNc', rawKeys: ['qgdNc'] },
      { canonical: 'tjMaxC', rawKeys: ['tjMaxC'] },
      { canonical: '温度基准', rawKeys: ['tCaseC', 'tAmbientC'] },
    ],
    run: thermalRun,
  },
];

let failures = 0;
function check(label: string, fn: () => void) {
  try { fn(); console.log('  ✓ ' + label); }
  catch (err) { failures++; console.log('  ✗ ' + label); console.log('    ' + (err as Error).message); }
}

console.log('\n=== 证据等级闸门：TEXT_INFERRED 猜测不能顶替实测（数字在，但来源不够格）===');
// 背景：ProjectContextView 的「自由文本推断」对任意领域的空白字段都会写入 TEXT_INFERRED 来源的猜测值
// （见 scenarioDomainEngine.extractMeasurementsFromText，它按 resolveEngineeringDomain() 的字段表逐个正则匹配，
// 不区分 BLDC/关节/热）。三个确定性引擎都必须能拒绝只有 TEXT_INFERRED 证据的字段，而不是只看「有没有数字」。
// bldcDeterministicEngine 一直是对的；robotJointDeterministicEngine / thermalCascadeEngine 曾经只调 isMeasuredValuePresent()，
// 对来源可信度视而不见——用户在自由文本里写「减速比100」就会被两个引擎当成已验证输入直接算出谐振/结温。

const LOW_EVIDENCE_GUARDS: { name: string; run: () => EngineOutcome; rawKey: string; mv: MV; category: string }[] = [
  {
    name: '关节谐振 resonance：gearRatio 仅 TEXT_INFERRED',
    category: 'Robot Joint Drive', rawKey: 'gearRatio',
    mv: { torsionalStiffnessNmPerRad: 15000, rotorInertiaKgm2: 2.0e-4, loadInertiaKgm2: 0.1, gearRatio: 100, velocityLoopBandwidthHz: 40 },
    run: () => {
      const i = makeIssueWithLowEvidence({ torsionalStiffnessNmPerRad: 15000, rotorInertiaKgm2: 2.0e-4, loadInertiaKgm2: 0.1, gearRatio: 100, velocityLoopBandwidthHz: 40 }, 'Robot Joint Drive', ['gearRatio']);
      const s = extractUnifiedEngineeringModel(CONTEXT, i);
      const r = calculateRobotJointDeterministicCalculations(i, s).find((x) => x.calculation === 'resonance') as { status?: string; missingInputs?: string[]; value?: unknown } | undefined;
      return { status: r?.status, missingLabel: (r?.missingInputs || []).join(', '), numericValue: r?.value };
    },
  },
  {
    name: '结温级联 thermal：温度基准(tAmbientC) 仅 TEXT_INFERRED',
    category: 'Thermal', rawKey: 'tAmbientC',
    mv: { currentNominalA: 10, rdsOnMilliOhm: 2.5, busVoltageNominalV: 48, pwmFreqKhz: 20, qgdNc: 15, tjMaxC: 150, tAmbientC: 25 },
    run: () => {
      const i = makeIssueWithLowEvidence({ currentNominalA: 10, rdsOnMilliOhm: 2.5, busVoltageNominalV: 48, pwmFreqKhz: 20, qgdNc: 15, tjMaxC: 150, tAmbientC: 25 }, 'Thermal', ['tAmbientC']);
      const s = extractUnifiedEngineeringModel(CONTEXT, i);
      const r = calculateThermalCascade(i, s) as { status?: string; tjEst?: unknown } | undefined;
      return { status: r?.status, missingLabel: '', numericValue: r?.tjEst };
    },
  },
];

for (const g of LOW_EVIDENCE_GUARDS) {
  check(`${g.name}：全部字段"有数字"，但 ${g.rawKey} 来源只是自由文本猜测 -> 必须仍是 INSUFFICIENT_INPUT，不得算出数值`, () => {
    const out = g.run();
    assert.equal(out.status, 'INSUFFICIENT_INPUT', `期望 INSUFFICIENT_INPUT，实际 status=${out.status}（说明 TEXT_INFERRED 被当成了已验证输入）`);
    assert.equal(out.numericValue, undefined, `INSUFFICIENT_INPUT 时不得给出数值，实际 numericValue=${out.numericValue}`);
  });
}

check('对照组：同一字段若来源是真实实测（不打 TEXT_INFERRED 标签），必须正常算出数值（确认上面不是把闸门焊死了）', () => {
  const i = makeIssue({ torsionalStiffnessNmPerRad: 15000, rotorInertiaKgm2: 2.0e-4, loadInertiaKgm2: 0.1, gearRatio: 100, velocityLoopBandwidthHz: 40 }, 'Robot Joint Drive');
  const s = extractUnifiedEngineeringModel(CONTEXT, i);
  const r = calculateRobotJointDeterministicCalculations(i, s).find((x) => x.calculation === 'resonance') as { status?: string; value?: unknown } | undefined;
  assert.equal(r?.status, 'CALCULATED', `期望正常算出结果，实际 status=${r?.status}`);
  assert.notEqual(r?.value, undefined);
});


console.log('\n=== 缺输入护栏：逐个摘掉必需输入，引擎必须判 INSUFFICIENT_INPUT 且不给数值 ===');

// 防止护栏自己被"过滤空了"却仍然全绿
check('护栏清单本身非空且每个目标都有闸门字段（防止测试范围被悄悄清空）', () => {
  assert.ok(GUARDS.length >= 5, '护栏目标数 ' + GUARDS.length);
  for (const g of GUARDS) {
    assert.ok(g.gated.length > 0, g.name + ' 的闸门字段为空');
    assert.ok(Object.keys(g.baseline).length > 0, g.name + ' 的完整输入为空');
  }
});

console.log('\n=== 读数原语语义：0 是合法值；空/空白/null/非数字 才是「缺输入」 ===');

const MV_SEMANTICS: Record<string, unknown> = {
  zero: 0, zeroStr: '0', num48: 48, str48: '48', spaced: '  48  ',
  empty: '', blank: '   ', nullish: null, text: 'abc', inf: 'Infinity',
};

check('真实 0 必须被保留（0A / 0℃ 是合法实测值，不是「没填」）', () => {
  assert.equal(readMeasuredNumber(MV_SEMANTICS, 'zero'), 0);
  assert.equal(readMeasuredNumber(MV_SEMANTICS, 'zeroStr'), 0);
});

check('数字与数字字符串都能读出，前后空白被裁掉', () => {
  assert.equal(readMeasuredNumber(MV_SEMANTICS, 'num48'), 48);
  assert.equal(readMeasuredNumber(MV_SEMANTICS, 'str48'), 48);
  assert.equal(readMeasuredNumber(MV_SEMANTICS, 'spaced'), 48);
});

check('空串/纯空白/null/非数字/非有限值/缺键 -> undefined（不再被当成 0）', () => {
  for (const k of ['empty', 'blank', 'nullish', 'text', 'inf', 'notExists']) {
    assert.equal(readMeasuredNumber(MV_SEMANTICS, k), undefined, k + ' 应为 undefined');
  }
  assert.equal(readMeasuredNumber(undefined, 'anything'), undefined, 'measuredValues 整体缺失应安全');
  assert.equal(readMeasuredNumber(null, 'anything'), undefined);
});

check('bldcMotorExpert.n() 已委托该原语：n(\'\') / n(null) 不再造出 0', () => {
  // n() 现为 readMeasuredNumber(mv, key) 的直接委托，因此钉住原语即钉住 n()。
  // 旧实现 Number(mv[key]) 对 '' 与 null 都返回 0，而 vds 参与 vds - bus.value 裕量比较，
  // 等于凭空造出一个假裕量；这条断言就是关闭那条路径的回归锁。
  assert.equal(readMeasuredNumber({ vdsRatingV: '' }, 'vdsRatingV'), undefined);
  assert.equal(readMeasuredNumber({ vdsRatingV: null }, 'vdsRatingV'), undefined);
  assert.equal(readMeasuredNumber({ vdsRatingV: 60 }, 'vdsRatingV'), 60);
});

check('path A 读数：实测字段为空串时必须视为「缺失」(NaN)，绝不能被当成 0', () => {
  const mk = (v: unknown) => ({
    issueCategories: ['BLDC Motor Drive'], failurePhenomenon: '', requirement: '',
    testCondition: '', actualMeasurement: '48V 母线供电', engineeringConcern: '', notes: '',
    measuredValues: { busVoltageNominalV: v },
  } as unknown as IssueInput);
  const blank = deriveBldcEvaluationInput(CONTEXT, mk(''));
  // 新契约（比旧版更严）：空串 = 缺失 -> NaN。旧实现 Number('') === 0 会把它当成 0；
  // 同时本模式已不再从自由文本猜数值（文本推断改为显式带 TEXT_INFERRED 标注的回填步骤），
  // 所以这里即便文本里写着 48V，也不允许补成 48。
  assert.equal(Number.isNaN(blank.vbusNominal), true, '空串必须视为缺失(NaN)，实际=' + blank.vbusNominal);
  assert.notEqual(blank.vbusNominal, 0, '空串绝不能变成 0');
});

check('path A 读数：真的填了 0 时必须保留为 0（0 是合法值，不得当成缺失）', () => {
  const zeroIssue = {
    issueCategories: ['BLDC Motor Drive'], failurePhenomenon: '', requirement: '',
    testCondition: '', actualMeasurement: '48V 母线供电', engineeringConcern: '', notes: '',
    measuredValues: { busVoltageNominalV: 0 },
  } as unknown as IssueInput;
  const zero = deriveBldcEvaluationInput(CONTEXT, zeroIssue);
  assert.equal(zero.vbusNominal, 0, '实测 0 必须保留为 0，实际=' + zero.vbusNominal);
});

console.log('\n=== 缺字段不得凭空造出「一票否决」（同时确认真值仍能触发） ===');

const jointIssue = (measuredValues: Record<string, unknown>) => ({
  issueCategories: ['Robot Joint Drive'], failurePhenomenon: '', requirement: '', testCondition: '',
  actualMeasurement: '', engineeringConcern: '', notes: '', measuredValues,
} as unknown as IssueInput);

const jointVetoes = (measuredValues: Record<string, unknown>) =>
  evaluateAllRobotJointPatterns(deriveRobotJointEvaluationInput(jointIssue(measuredValues)))
    .filter((p) => p.vetoTriggered).map((p) => p.id);

check('J004：泄放电阻连续额定未填写（空串）时，不得凭空造出否决', () => {
  const withRating = (cont: unknown) => ({
    regenPowerPeakW: 10, dutyCycleDecelPct: 100,
    brakingResistorRatedContinuousW: cont,
    brakingResistorRatedPeakW: 1000, // 峰值那一条永远不成立，只隔离连续档
  });
  assert.equal(jointVetoes(withRating('')).includes('J004'), false, '空串=未填写，不得触发 J004（旧实现 Number("")===0 -> 10>0 -> 假否决）');
  assert.equal(jointVetoes(withRating(1000)).includes('J004'), false, '额定 1000W 足够，不应触发');
  assert.equal(jointVetoes(withRating(5)).includes('J004'), true, '额定 5W 真的不够，必须仍能触发 —— 真值不能被削弱');
});

check('J002：编码器电池电压未填写（空串）时，不得凭空造出否决', () => {
  const withBattery = (v: unknown) => ({
    encoderType: 'MULTI_TURN_ABS_BATTERY',
    encoderBatteryVoltageV: v,
    encoderBatteryMinVoltageV: v,
  });
  assert.equal(jointVetoes(withBattery('')).includes('J002'), false, '电压空串=未填写，不得触发 J002（旧实现 0-0<=0.15 -> 假否决）');
  assert.equal(jointVetoes(withBattery(2.6)).includes('J002'), true, '实测 2.6V 触及裕量下限，必须仍能触发');
});

for (const g of GUARDS) {
  const prefix = g.name + '：';

  check(prefix + '参数齐全时必须真的算出数值（否则下面的缺输入断言是空转）', () => {
    const out = g.run({ ...g.baseline });
    assert.equal(out.status, 'CALCULATED', '完整输入应 CALCULATED，实际=' + out.status + ' / 缺失=' + out.missingLabel);
    assert.equal(Number.isFinite(Number(out.numericValue)), true, '完整输入应给出有限数值，实际=' + String(out.numericValue));
  });

  for (const field of g.gated) {
    check(prefix + '缺 ' + field.canonical + ' -> INSUFFICIENT_INPUT 且无数值', () => {
      const mv: MV = { ...g.baseline };
      for (const k of field.rawKeys) delete mv[k];
      const out = g.run(mv);
      assert.equal(out.status, 'INSUFFICIENT_INPUT', '缺 ' + field.rawKeys.join('+') + ' 时状态应为 INSUFFICIENT_INPUT，实际=' + out.status);
      assert.equal(out.numericValue, undefined, '缺输入时不得给出数值，实际=' + String(out.numericValue));
      assert.ok(out.missingLabel.length > 0, '缺输入时必须报出缺失字段，实际未报任何字段');
    });
  }
}

if (failures > 0) { console.log('\n缺输入护栏失败 ' + failures + ' 条'); process.exit(1); }
console.log('\n全部通过');
