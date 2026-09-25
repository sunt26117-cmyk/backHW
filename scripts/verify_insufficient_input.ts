/**
 * 缺输入纪律验证（已接入 npm test）
 *
 * 验的是「缺输入不得静默算出一个数字」这条底线，四组：
 *   1) 缺转子惯量 J + 母线电容 Cbus      -> busPumping 必须 INSUFFICIENT_INPUT
 *   2) 关节缺扭转刚度/负载惯量/减速比     -> resonance 必须 INSUFFICIENT_INPUT
 *   3) 缺热参数                          -> PRE_THERMAL_TJ 必须 INSUFFICIENT_INPUT
 *   4) 参数齐全                          -> busPumping 必须真的 CALCULATED 出数值
 *
 * 约定说明（别把这条读成 bug）：
 *   unifiedStateExtractor.getNum() 用 0 作为「未提供」哨兵，而不是 undefined；
 *   「到底缺没缺」一律由 isMeasuredValuePresent(issue, key) 按原始 measuredValues 判定，
 *   消费端再用 `state.motor.j || undefined` 把哨兵中和掉。
 *   所以本脚本断言的是「存在性判定 + 引擎状态」，不是 state 的内部表示。
 *   （若将来把哨兵统一迁成 undefined，那是另一次有爆炸半径的约定迁移。）
 *
 * 手动运行：npx tsx scripts/verify_insufficient_input.ts
 */
import { extractUnifiedEngineeringModel, isMeasuredValuePresent } from '../src/utils/unifiedStateExtractor';
import { calculateBldcDeterministicCalculations } from '../src/utils/bldcDeterministicEngine';
import { calculateRobotJointDeterministicCalculations } from '../src/utils/robotJointDeterministicEngine';
import { runDeterministicPrecomputations } from '../src/utils/deterministicPrecomputation';
import { IssueInput, ProjectContext } from '../src/types';

console.log('=== RUNNING DETERMINISTIC PIPELINE INSUFFICIENT_INPUT VERIFICATION ===\n');

const dummyContext: ProjectContext = {
  projectName: 'BLDC Inverter Test',
  productType: 'Motor Controller',
  ecuType: 'Inverter',
  projectPhase: 'DV',
  asilLevel: 'ASIL D',
  customer: 'Tier1',
  sopDate: '2026-12',
  nextMilestone: 'DV Signoff',
  daysRemaining: 14,
  costConstraint: 'Strict',
  sampleStatus: 'Working',
};

// Test 1: Issue completely missing motor inertia J and bus capacitance
const issueMissingJ: IssueInput = {
  issueCategories: ['BLDC Motor Drive'],
  requirement: 'BLDC motor operating at 48V, running at 3000 RPM. MOSFET Vds rating 60V.',
  actualMeasurement: '',
  testCondition: '48V bus, 3000 RPM',
  environment: '25C',
  failurePhenomenon: 'Bus overvoltage spike on deceleration',
  engineeringConcern: 'BLDC_BUS_PUMPING',
  measuredValues: {
    busVoltageNominalV: '48',
    rpm: '3000',
    vdsRatingV: '60',
    // rotorInertiaKgm2 / J is completely omitted!
    // cBusUf is omitted!
  },
};

const state1 = extractUnifiedEngineeringModel(dummyContext, issueMissingJ);
console.log('Test 1 State Motor J:', state1.motor.j);
console.log('Test 1 State Bus Capacitance:', state1.powerStage.cbusUf);

// 真正的契约：未提供时「存在性判定」必须为 false。
// （state.motor.j 本身是 0 哨兵，由消费端 `|| undefined` 中和，不作为断言对象。）
if (isMeasuredValuePresent(issueMissingJ, 'rotorInertiaKgm2')) {
  console.error('FAIL: rotorInertiaKgm2 未提供时 isMeasuredValuePresent 必须为 false');
  process.exit(1);
}
if (isMeasuredValuePresent(issueMissingJ, 'cBusUf')) {
  console.error('FAIL: cBusUf 未提供时 isMeasuredValuePresent 必须为 false');
  process.exit(1);
}

const bldcResults1 = calculateBldcDeterministicCalculations(issueMissingJ, state1);
const busPumping1 = bldcResults1.find(r => r.calculation === 'busPumping');
console.log('Test 1 Bus Pumping Status:', busPumping1?.status);
console.log('Test 1 Missing Inputs:', busPumping1?.missingInputs);

if (busPumping1?.status !== 'INSUFFICIENT_INPUT') {
  console.error('FAIL: busPumping must return INSUFFICIENT_INPUT when J is missing! Got:', busPumping1?.status);
  process.exit(1);
}

// Test 2: Robot Joint missing torsional stiffness & load inertia
const issueMissingMechanical: IssueInput = {
  issueCategories: ['Robot Joint Drive'],
  requirement: 'Harmonic drive joint',
  actualMeasurement: 'Resonance detected',
  testCondition: 'Harmonic drive J=0.0002, peak torque 20Nm, velocity bandwidth 40Hz.',
  environment: 'Room temp',
  failurePhenomenon: 'Joint oscillation',
  engineeringConcern: 'ROBOT_JOINT_RESONANCE',
  measuredValues: {
    motorInertiaKgm2: '0.0002',
    peakTorqueNm: '20',
    velocityLoopBandwidthHz: '40',
    // torsionalStiffnessNmPerRad is missing!
    // loadInertiaKgm2 is missing!
    // gearRatio is missing!
  }
};

const state2 = extractUnifiedEngineeringModel(dummyContext, issueMissingMechanical);
console.log('\nTest 2 State Torsional Stiffness:', state2.mechanical.torsionalStiffnessNmPerRad);
console.log('Test 2 State Gear Ratio:', state2.mechanical.gearRatio);

const robotResults2 = calculateRobotJointDeterministicCalculations(issueMissingMechanical, state2);
const resonance2 = robotResults2.find(r => r.calculation === 'resonance');
console.log('Test 2 Resonance Status:', resonance2?.status);
console.log('Test 2 Missing Inputs:', resonance2?.missingInputs);

if (resonance2?.status !== 'INSUFFICIENT_INPUT') {
  console.error('FAIL: resonance must return INSUFFICIENT_INPUT when stiffness/gearRatio are missing! Got:', resonance2?.status);
  process.exit(1);
}

// Test 3: Precomputation thermal missing inputs
const precomputationFacts = runDeterministicPrecomputations(dummyContext, issueMissingJ);
const thermalFact = precomputationFacts.find(f => f.id === 'PRE_THERMAL_TJ');
console.log('\nTest 3 Thermal Fact Status:', thermalFact?.status);
console.log('Test 3 Thermal Calculated Value:', thermalFact?.calculatedValue);

if (thermalFact?.status !== 'INSUFFICIENT_INPUT') {
  console.error('FAIL: thermalFact must return INSUFFICIENT_INPUT when thermal inputs are missing! Got:', thermalFact?.status);
  process.exit(1);
}

// Test 4: Issue with complete inputs -> verifies normal calculation works
const issueComplete: IssueInput = {
  issueCategories: ['BLDC Motor Drive'],
  requirement: 'BLDC motor operating at 48V, running at 3000 RPM.',
  actualMeasurement: 'MOSFET Vds 60V, Cbus 470uF, J=0.00035 kg·m².',
  testCondition: 'Regen brake from 3000 RPM',
  environment: '25C',
  failurePhenomenon: 'Pumping peak check',
  engineeringConcern: 'BLDC_BUS_PUMPING',
  measuredValues: {
    busVoltageNominalV: '48',
    rpm: '3000',
    vdsRatingV: '60',
    cBusUf: '470',
    rotorInertiaKgm2: '0.00035',
  }
};

const state4 = extractUnifiedEngineeringModel(dummyContext, issueComplete);
const bldcResults4 = calculateBldcDeterministicCalculations(issueComplete, state4);
const busPumping4 = bldcResults4.find(r => r.calculation === 'busPumping');
console.log('\nTest 4 Bus Pumping Status (complete):', busPumping4?.status);
console.log('Test 4 Bus Pumping Calculated Value:', busPumping4?.value, busPumping4?.unit);

if (busPumping4?.status !== 'CALCULATED' || typeof busPumping4?.value !== 'number') {
  console.error('FAIL: busPumping must calculate properly when inputs are complete! Got:', busPumping4);
  process.exit(1);
}

console.log('\n>>> ALL 4 INSUFFICIENT_INPUT AND DETERMINISTIC PHYSICS VERIFICATION TESTS PASSED! <<<');
