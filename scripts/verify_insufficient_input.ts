import { extractUnifiedEngineeringModel } from '../src/utils/unifiedStateExtractor';
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
console.log('Test 1 State Bus Capacitance:', state1.powerStage.cbusUf?.value);

if (state1.motor.j !== undefined) {
  console.error('FAIL: state.motor.j should be undefined when not provided, but got:', state1.motor.j);
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
