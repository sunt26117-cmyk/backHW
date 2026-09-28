/**
 * System Regression Center
 *
 * 这里不是 BLDC 工程案例库。
 * 这里验证的是“代码修改以后，关键系统行为有没有悄悄变坏”：
 * 输入传递、确定性计算门禁、来源/假设治理、VETO、AI Grounding 等系统级契约。
 *
 * 工程案例（Case01~16）继续由 engineeringGoldCases.ts 管理；
 * BLDC P001~P018 继续由各 Pattern + BLDC engine 管理。
 */

import type { CopilotAnalysisResult, IssueInput, ProjectContext } from '../types';
import { deriveBldcEvaluationInput } from '../utils/scenarioDerived';
import { evaluateAllBldcPatterns } from '../domains/bldc';
import { resolveEngineeringDomain } from '../utils/scenarioDomainEngine';
import { runDeterministicPrecomputations } from '../utils/deterministicPrecomputation';
import { assessInputIntegrity } from '../utils/inputIntegrityEngine';
import { buildGroundingText } from '../utils/aiGrounding';

function equal<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) throw new Error(`${message}；actual=${String(actual)} expected=${String(expected)}`);
}
function notEqual<T>(actual: T, expected: T, message: string): void {
  if (actual === expected) throw new Error(message);
}
function ok(value: unknown, message: string): void {
  if (!value) throw new Error(message);
}
function notDeepEqual(a: unknown, b: unknown, message: string): void {
  if (JSON.stringify(a) === JSON.stringify(b)) throw new Error(message);
}
function match(value: string, pattern: RegExp, message: string): void {
  if (!pattern.test(value)) throw new Error(message);
}

export type SystemRegressionStatus = 'PASS' | 'FAIL';

export interface SystemRegressionCase {
  id: string;
  title: string;
  purpose: string;
  category: 'DATA_FLOW' | 'INPUT_GATE' | 'SCENARIO' | 'SAFETY' | 'AI_GROUNDING';
  run: () => SystemRegressionResult;
}

export interface SystemRegressionResult {
  caseId: string;
  status: SystemRegressionStatus;
  summary: string;
  details: string[];
}

const BASE_CONTEXT: ProjectContext = {
  projectName: '系统回归测试项目',
  projectPhase: 'DVT',
  customer: '内部',
  ecuType: 'BLDC ECU',
  asilLevel: 'QM',
  sopDate: '',
  nextMilestone: '',
  daysRemaining: 30,
} as ProjectContext;

function baseIssue(overrides: Partial<IssueInput> = {}): IssueInput {
  return {
    issueCategories: ['BLDC Motor Drive'],
    failurePhenomenon: 'BLDC 功率级测试异常',
    requirement: '满足设计安全裕量要求',
    actualMeasurement: '台架实测',
    testCondition: 'DVT 台架',
    engineeringConcern: '确认物理计算与安全门禁',
    notes: '',
    measuredValues: {},
    ...overrides,
  } as IssueInput;
}

function pass(caseId: string, summary: string, details: string[] = []): SystemRegressionResult {
  return { caseId, status: 'PASS', summary, details };
}

function fail(caseId: string, err: unknown): SystemRegressionResult {
  return {
    caseId,
    status: 'FAIL',
    summary: err instanceof Error ? err.message : String(err),
    details: [],
  };
}

function run(caseId: string, fn: () => SystemRegressionResult): SystemRegressionResult {
  try {
    return fn();
  } catch (err) {
    return fail(caseId, err);
  }
}

/**
 * R01 输入传递：结构化工程输入必须真实进入 BLDC 引擎边界。
 * 防止 UI 有数值、但 adapter/mapper 丢字段后仍然“看起来能分析”。
 */
const R01: SystemRegressionCase = {
  id: 'R01',
  title: '结构化输入 → 引擎真实传递',
  purpose: '验证关键 measuredValues 不会在场景适配层被吞掉或替换成旧默认值。',
  category: 'DATA_FLOW',
  run: () => run('R01', () => {
    const issue = baseIssue({
      measuredValues: {
        busVoltageNominalV: 13.5,
        rpm: 3800,
        rotorInertiaKgm2: 5.33e-6,
        cBusUf: 470,
        vdsRatingV: 40,
      },
    });
    const input = deriveBldcEvaluationInput(BASE_CONTEXT, issue);
    equal(input.rpm, 3800, 'rpm 未真实传递');
    equal(input.vbusNominal, 13.5, 'vbusNominal 未真实传递');
    equal(input.jInertia, 5.33e-6, 'jInertia 未真实传递');
    equal(input.cbusUf, 470, 'cbusUf 未真实传递');
    equal(input.vdsRating, 40, 'vdsRating 未真实传递');
    return pass('R01', '关键结构化输入全部穿透到 BldcEvaluationInput。');
  }),
};

/**
 * R02 缺参门禁：没有足够输入时，确定性预计算必须明确 INSUFFICIENT_INPUT。
 */
const R02: SystemRegressionCase = {
  id: 'R02',
  title: '缺失参数 → 禁止假算',
  purpose: '验证物理预计算在缺少必要证据时不会生成看似真实的数值。',
  category: 'INPUT_GATE',
  run: () => run('R02', () => {
    const issue = baseIssue({
      failurePhenomenon: '急停后母线异常，需要评估泵升',
      measuredValues: {
        rpm: 3800,
        busVoltageNominalV: 13.5,
        vdsRatingV: 40,
        // 故意不提供 rotorInertiaKgm2 / cBusUf
      },
    });
    const facts = runDeterministicPrecomputations(BASE_CONTEXT, issue);
    const bus = facts.find((f) => f.category === 'BUS_PUMPING');
    ok(bus, '没有生成 BUS_PUMPING 证据条目');
    equal(bus?.status, 'INSUFFICIENT_INPUT', '缺参状态错误');
    equal(bus?.calculatedValue, 'INSUFFICIENT_INPUT', '缺参仍生成了计算值');
    return pass('R02', '缺少关键输入时明确进入 INSUFFICIENT_INPUT，未产生伪造计算值。');
  }),
};

/**
 * R03 参数变化必须影响真实引擎结果。
 * 用 P001 的母线实测峰值做最小可重复验证，避免“页面改了、引擎仍吃旧值”。
 */
const R03: SystemRegressionCase = {
  id: 'R03',
  title: '参数变化 → 真实结果随之变化',
  purpose: '验证同一场景修改关键工程参数后，计算/判定链路确实重新计算。',
  category: 'DATA_FLOW',
  run: () => run('R03', () => {
    const common = {
      failurePhenomenon: 'BLDC 急停母线泵升',
      measuredValues: {
        rotorInertiaKgm2: 5.33e-6,
        busVoltageNominalV: 13.5,
        rpm: 3800,
        cBusUf: 470,
        vdsRatingV: 40,
      },
    };
    const a = evaluateAllBldcPatterns(deriveBldcEvaluationInput(BASE_CONTEXT, baseIssue({
      ...common,
      measuredValues: { ...common.measuredValues, busVoltagePeakV: 30 },
    })));
    const b = evaluateAllBldcPatterns(deriveBldcEvaluationInput(BASE_CONTEXT, baseIssue({
      ...common,
      measuredValues: { ...common.measuredValues, busVoltagePeakV: 37.8 },
    })));
    const pa = a.find((x) => x.id === 'P001');
    const pb = b.find((x) => x.id === 'P001');
    ok(pa && pb, 'P001 未返回');
    notDeepEqual(pa?.calculatedValues, pb?.calculatedValues, '修改输入后 P001 计算输出没有变化');
    return pass('R03', '关键输入变化能够穿透到同一 Pattern 的实际计算输出。');
  }),
};

/**
 * R04 场景/域切换：系统不能继续沿用上一域的解释路径。
 */
const R04: SystemRegressionCase = {
  id: 'R04',
  title: '场景切换 → 分析域重新解析',
  purpose: '验证 BLDC 与机器人关节等场景切换不会继续复用错误工程域。',
  category: 'SCENARIO',
  run: () => run('R04', () => {
    const bldc = baseIssue({
      issueCategories: ['BLDC Motor Drive'],
      failurePhenomenon: '急停母线泵升',
    });
    const joint = baseIssue({
      issueCategories: ['Robot Joint Drive'],
      failurePhenomenon: '肩关节背隙超差',
    });
    equal(resolveEngineeringDomain(bldc), 'BLDC', 'BLDC 域解析错误');
    equal(resolveEngineeringDomain(joint), 'ROBOT_JOINT', 'ROBOT_JOINT 域解析错误');
    notEqual(resolveEngineeringDomain(bldc), resolveEngineeringDomain(joint), '不同场景错误复用同一工程域');
    return pass('R04', '不同场景的工程域解析彼此隔离。');
  }),
};

/**
 * R05 Datasheet/规格来源：required SPEC 字段不能因为“有个数”就被误认为实测。
 * 这里直接验证 input integrity 的证据治理，而不是测试 UI 标签。
 */
const R05: SystemRegressionCase = {
  id: 'R05',
  title: '参数来源 → SPEC / MEASURED 证据等级不混淆',
  purpose: '验证同一个数值不会因为存在于 measuredValues 就自动升级成可信实测证据。',
  category: 'INPUT_GATE',
  run: () => run('R05', () => {
    const issue = baseIssue({
      measuredValues: {
        vdsRatingV: 40,
      },
      measurementProvenance: {
        vdsRatingV: { source: 'ASSUMPTION', note: '临时估计' },
      },
    } as Partial<IssueInput>);
    const assessment = assessInputIntegrity(BASE_CONTEXT, issue);
    ok(
      assessment.missingRequiredFields.some((x) => x.includes('vdsRatingV')) ||
      assessment.requiredAssumptions.some((x) => x.includes('vdsRatingV')),
      'ASSUMPTION 来源的关键参数没有被证据门禁识别',
    );
    return pass('R05', '参数数值与参数证据来源被分别治理，假设值不会伪装成实测证据。');
  }),
};

/**
 * R06 假设输入：模式可以分析，但安全 VETO 不能因为未经证实的假设而直接放行。
 * 这里验证系统当前的安全策略，而不是某一个工程案例。
 */
const R06: SystemRegressionCase = {
  id: 'R06',
  title: '假设输入 → 安全结论受控',
  purpose: '验证含关键假设时不会把未经证实的计算直接升级为确定性 VETO/放行。',
  category: 'SAFETY',
  run: () => run('R06', () => {
    const issue = baseIssue({
      failurePhenomenon: '高 dv/dt 门极可能误导通',
      measuredValues: {
        dvdtVns: 8.5,
        cgdPf: 115,
        cgsPf: 800,
        rgOffOhm: 2.2,
        vthMinV: 2,
        busVoltageNominalV: 13.5,
      },
      measurementProvenance: {
        dvdtVns: { source: 'USER_MEASURED' },
        cgdPf: { source: 'DATASHEET' },
        cgsPf: { source: 'DATASHEET' },
        rgOffOhm: { source: 'DATASHEET' },
        vthMinV: { source: 'DATASHEET' },
        busVoltageNominalV: { source: 'ASSUMPTION', note: '临时母线值' },
      },
    } as Partial<IssueInput>);
    const results = evaluateAllBldcPatterns(deriveBldcEvaluationInput(BASE_CONTEXT, issue));
    const p003 = results.find((x) => x.id === 'P003');
    ok(p003, 'P003 未返回');
    // 当前 pattern policy 的核心契约：含关键假设时不得给出 ROBUST/VETO 型确定安全结论。
    ok(!String(p003?.calculatedValues?.['分析状态'] || '').includes('ROBUST'), '含假设输入却生成 ROBUST 状态');
    return pass('R06', '含假设证据时，安全结论保持受控，不把假设升级为确定性安全结论。');
  }),
};

/**
 * R07 VETO：安全门禁必须来自实际 Pattern 输出，而不是静态 case 字段。
 */
const R07: SystemRegressionCase = {
  id: 'R07',
  title: '真实 VETO → 安全门禁一致',
  purpose: '验证危险输入确实穿过 Pattern → Policy → VETO 链路。',
  category: 'SAFETY',
  run: () => run('R07', () => {
    const issue = baseIssue({
      failurePhenomenon: '高 dv/dt 门极米勒误导通',
      measuredValues: {
        dvdtVns: 8.5,
        cgdPf: 115,
        cgsPf: 800,
        rgOffOhm: 2.2,
        vthMinV: 2.0,
        sourceInductanceNh: 2,
        diDtANs: 5,
        busVoltageNominalV: 13.5,
      },
    });
    const results = evaluateAllBldcPatterns(deriveBldcEvaluationInput(BASE_CONTEXT, issue));
    const p003 = results.find((x) => x.id === 'P003');
    ok(p003?.triggered, 'P003 没有真实触发');
    equal(p003?.vetoTriggered, true, 'P003 VETO 没有从真实引擎产生');
    return pass('R07', 'P003 实际触发并产生 VETO；门禁来自实时引擎输出。');
  }),
};

/**
 * R08 AI Grounding：只允许使用当前实时 baseline / precomputed / live gold output。
 * 特别防止旧 goldenOracle 再次进入 AI prompt。
 */
const R08: SystemRegressionCase = {
  id: 'R08',
  title: 'AI Grounding → 只引用当前真实引擎结果',
  purpose: '验证 AI Grounding 不把旧的 Golden Oracle 当成当前计算事实。',
  category: 'AI_GROUNDING',
  run: () => run('R08', () => {
    const issue = baseIssue({
      failurePhenomenon: '高 dv/dt 门极米勒误导通',
      measuredValues: {
        dvdtVns: 8.5,
        cgdPf: 115,
        cgsPf: 800,
        rgOffOhm: 2.2,
        vthMinV: 2.0,
        busVoltageNominalV: 13.5,
      },
    });
    const result = evaluateAllBldcPatterns(deriveBldcEvaluationInput(BASE_CONTEXT, issue));
    const live = result.find((x) => x.id === 'P003')?.calculatedValues || {};
    const baseline = {
      analysisBasis: {
        calculatedOutputs: [`P003 live=${JSON.stringify(live)}`],
        calculatedOutputEvidence: [],
      },
    } as unknown as CopilotAnalysisResult;
    const grounding = buildGroundingText(baseline, [], []);
    match(grounding.baselineText, /P003 live=/, 'Grounding 没有使用当前 live baseline');
    ok(!grounding.baselineText.includes('goldenOracle'), 'Grounding 泄漏 Golden Oracle 标记');
    ok(!grounding.goldCaseText.includes('undefined'), 'Grounding 出现 undefined');
    return pass('R08', 'AI Grounding 的物理事实来自当前 baseline/live engine output；没有旧 Oracle fallback。');
  }),
};

export const SYSTEM_REGRESSION_CASES: readonly SystemRegressionCase[] = [
  R01, R02, R03, R04, R05, R06, R07, R08,
];

export function runSystemRegressionCase(caseId: string): SystemRegressionResult {
  const c = SYSTEM_REGRESSION_CASES.find((item) => item.id === caseId);
  if (!c) {
    return fail(caseId, new Error(`未知系统回归用例: ${caseId}`));
  }
  return c.run();
}

export function runAllSystemRegressions(): Record<string, SystemRegressionResult> {
  return Object.fromEntries(
    SYSTEM_REGRESSION_CASES.map((c) => [c.id, runSystemRegressionCase(c.id)]),
  );
}
