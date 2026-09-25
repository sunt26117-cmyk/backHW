import assert from 'node:assert/strict';
import { evaluateAllBldcPatterns, BldcEvaluationInput } from '../src/data/bldcPatternEngine';
import { filterTraceNodes } from '../src/utils/trace';

const complete: BldcEvaluationInput = {
  tAmbientC: 85,
  rpm: 3800,
  vbusNominal: 13.5,
  vdsRating: 40,
  cbusUf: 470,
  jInertia: 0.00018,
  currentPeakA: 20,
  harnessLengthM: 1.8,
  deadTimeNs: 120,
  rgOffOhm: 1.5,
  cgdPf: 45,
  cgsPf: 800,
  dvDtVns: 4,
  vthMinV: 2,
  keVkrpm: 4.2,
  keConvention: 'PHASE_RMS_SINUSOIDAL',
  rthJc: 1.8,
  rdsOnMilliOhm: 3.5,
  loopInductanceNh: 10,
  diDtANs: 0.1,
  sourceInductanceNh: 4,
  gateSpikeMeasuredV: 1,
  vbusMeasuredPeak: 30,
  magnetLowTempFluxUpliftPct: 8,
  senseDelayNsOverride: 80,
  compDelayNsOverride: 120,
  digitalFilterDelayNsOverride: 150,
  driverPropDelayNsOverride: 100,
  gateTurnOffDelayNsOverride: 220,
  currentFallDelayNsOverride: 180,
  soaShortCircuitTimeUsOverride: 3,
  easEnergyMj: 200,
};

const incomplete: BldcEvaluationInput = {
  ...complete,
  vbusNominal: NaN,
  cbusUf: NaN,
  jInertia: NaN,
  currentPeakA: NaN,
  loopInductanceNh: undefined,
  cgsPf: undefined,
  sourceInductanceNh: undefined,
  diDtANs: undefined,
  gateSpikeMeasuredV: undefined,
  vbusMeasuredPeak: undefined,
  senseDelayNsOverride: undefined,
  compDelayNsOverride: undefined,
  digitalFilterDelayNsOverride: undefined,
  driverPropDelayNsOverride: undefined,
  gateTurnOffDelayNsOverride: undefined,
  currentFallDelayNsOverride: undefined,
  soaShortCircuitTimeUsOverride: undefined,
  easEnergyMj: undefined,
};

const completeResults = evaluateAllBldcPatterns(complete);
const incompleteResults = evaluateAllBldcPatterns(incomplete);
const p001Complete = completeResults.find((p) => p.id === 'P001');
const p002Complete = completeResults.find((p) => p.id === 'P002');
const p003Complete = completeResults.find((p) => p.id === 'P003');
const p012Complete = completeResults.find((p) => p.id === 'P012');
const p014Complete = completeResults.find((p) => p.id === 'P014');
const p016Complete = completeResults.find((p) => p.id === 'P016');

assert.ok(p001Complete?.trace?.[0], 'P001 must emit TraceNode');
assert.ok(p002Complete?.trace?.[0], 'P002 must emit TraceNode');
assert.ok(p003Complete?.trace?.[0], 'P003 must emit TraceNode');
assert.ok(p014Complete?.trace?.[0], 'P014 must emit TraceNode');
assert.ok(p016Complete?.trace?.[0], 'P016 must emit TraceNode');
assert.equal(p012Complete!.trace![0].value, '无法计算', 'P012 missing R_boot should explicitly remain uncomputable');
assert.equal(p012Complete!.trace![0].verdict, 'INFO', 'P012 uncomputable trace must not report PASS');
assert.equal(p014Complete!.trace![0].degraded, false, 'complete P014 trace should not be degraded');
assert.equal(p014Complete!.trace![0].value, 31, 'P014 trace peak should use measured Vbus + L·di/dt');
assert.equal(p014Complete!.trace![0].threshold?.value, 32, 'P014 threshold should be 80% of 40V Vds');
assert.equal(p014Complete!.trace![0].verdict, 'MARGINAL', '31V against 32V boundary should be marginal');

const completeNodes = completeResults.flatMap((p) => p.trace || []);
assert.ok(completeNodes.length >= 4, 'expected trace coverage on priority BLDC patterns');
const priorityPatternIds = ['P001', 'P002', 'P003', 'P014', 'P016'] as const;
for (const id of priorityPatternIds) {
  const pattern = completeResults.find((p) => p.id === id);
  assert.ok(pattern?.trace?.length, `${id} must emit at least one TraceNode`);
  const degraded = filterTraceNodes(pattern?.trace ?? [], { degradedOnly: true });
  assert.equal(degraded.length, 0, `complete priority ${id} trace should not be degraded`);
}

const degradedCompleteNodes = filterTraceNodes(completeNodes, { degradedOnly: true });
for (const node of degradedCompleteNodes) {
  const assumedInputs = node.inputs.filter((input) => input.source === 'ASSUMED_DEFAULT' || input.source === 'SPEC_CONSTANT');
  assert.ok(assumedInputs.length > 0, `${node.id} degraded without an explicit assumption/spec input`);
  assert.ok(
    assumedInputs.every((input) => Boolean(input.label.trim())),
    `${node.id} degraded input must identify its source field`,
  );
}

console.log(
  `TRACE ASSUMPTION AUDIT PASS: ${degradedCompleteNodes.length} degraded complete-case nodes are explicitly attributable to assumption/spec inputs`,
);

const incompleteNodes = incompleteResults.flatMap((p) => p.trace || []);
const incompleteDegraded = filterTraceNodes(incompleteNodes, { degradedOnly: true });
assert.ok(incompleteDegraded.length >= 3, 'missing inputs must surface as degraded Trace nodes');
assert.ok(incompleteDegraded.every((n) => n.degraded), 'degraded filter must return only degraded nodes');
assert.ok(incompleteDegraded.some((n) => n.inputs.some((i) => i.source === 'ASSUMED_DEFAULT')), 'assumed defaults must be visible at input level');

console.log(`TRACE VERIFY PASS: complete=${completeNodes.length}, incomplete=${incompleteNodes.length}, degraded=${incompleteDegraded.length}`);
