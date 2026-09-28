/**
 * 母线电压是"假设值"时，P003（path A）与确定性引擎（path B）必须**一致地不使用**容性分压界。
 *
 * 背景：共享核心 checkMillerRisk 已按 V_bus_is_assumed 把容性界降为"仅展示"
 * （见 verify-p003-veto-robustness.ts 的核心层断言）。但那只是核心能力，两条调用路径都必须
 * 把这个标志真的传进去，否则洞还在：
 *   - path A：P003 传 ctx.vbusNominalWasAssumed（外部补丁已做）；
 *   - path B：bldcDeterministicEngine.buildMiller 传 !vbusProvided —— 外部补丁漏了，本脚本守住。
 * 一旦漏传：缺省 13.5V 假设母线会把 0.73V 的阻性上界压成 0.32V，把结论悄悄推向"更安全"，
 * 甚至压掉本应触发的一票否决。
 */
import { importDeviceFromJson, saveDevice } from '../src/utils/deviceLibrary';
import { deriveBldcEvaluationInput } from '../src/utils/scenarioDerived';
import { extractUnifiedEngineeringModel } from '../src/utils/unifiedStateExtractor';
import { calculateBldcDeterministicCalculations } from '../src/utils/bldcDeterministicEngine';
import { evaluateP003 } from '../src/domains/bldc/patterns/P003';
import { createBldcPatternContext } from '../src/domains/bldc/context';

const memory = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => memory.set(key, value),
  removeItem: (key: string) => memory.delete(key),
};

const eq = (name: string, got: unknown, expected: unknown) => {
  if (got !== expected) throw new Error(`${name}: got ${String(got)}, expected ${String(expected)}`);
};
const near = (name: string, got: unknown, expected: number, tol = 0.005) => {
  if (typeof got !== 'number' || !Number.isFinite(got) || Math.abs(got - expected) > tol) {
    throw new Error(`${name}: got ${String(got)}, expected ≈${expected}`);
  }
};
const pick = (cv: Record<string, string | number>, needle: string): number => {
  const key = Object.keys(cv).find((k) => k.includes(needle));
  if (!key) throw new Error('找不到 calculatedValues 键：' + needle);
  const v = cv[key];
  if (typeof v !== 'number') throw new Error(`${key} 不是数字：${String(v)}`);
  return v;
};

const imported = importDeviceFromJson(JSON.stringify({
  deviceType: 'MOSFET', partNumber: 'ASSUMED-VBUS-TEST', manufacturer: 'T', package: 'QFN',
  maxRatings: { vds: { value: 40 }, tjMax: { value: 175 } },
  capacitanceParams: {
    ciss: { value: 1764, conditions: { vds: '15 V' } },
    crss: { points: [{ x: 10, y: 45 }, { x: 20, y: 35 }] },
  },
  gateCharge: { qg: { value: 26 }, qgd: { value: 6 } },
}));
if (!imported.device) throw new Error(imported.error || 'device import failed');
saveDevice(imported.device);
const context = { selectedDeviceId: imported.device.id, productType: '12V BLDC', projectPhase: 'DV' } as any;
const makeIssue = (measuredValues: Record<string, unknown>) => ({
  issueCategories: ['BLDC Motor Drive'], requirement: '', actualMeasurement: '', testCondition: '',
  environment: '', failurePhenomenon: '', engineeringConcern: '', notes: '',
  measuredValues, measurementProvenance: {}, measuredValueSource: 'USER_MEASURED',
}) as any;

const runBoth = (issue: any) => {
  const derived = deriveBldcEvaluationInput(context, issue);
  const p003 = evaluateP003(derived, createBldcPatternContext(derived));
  const miller = calculateBldcDeterministicCalculations(
    issue, extractUnifiedEngineeringModel(context, issue), context,
  ).find((item) => item.id === 'BLDC_MILLER_RISK')!;
  return { p003Total: pick(p003.calculatedValues, '判据取用值'), miller };
};

// ---- 情形 1：母线电压未提供（假设 13.5V）----
// Cgd = Crss@13.5V = 41.5pF；Cgs = Ciss@15V − Crss@15V = 1724pF；dv/dt=8；Rg=2.2
// 阻性上界 = 41.5·8·2.2/1000 = 0.73V；容性界 = 41.5/(41.5+1724)·13.5 = 0.32V
const assumed = runBoth(makeIssue({ dvdtVns: 8, rgOffOhm: 2.2, vthMinV: 1.45 }));
eq('pathB·Vbus 来源必须是 ASSUMPTION', assumed.miller.inputSources.busVoltageNominalV, 'ASSUMPTION');
near('pathB·假设 Vbus 时只取阻性上界（不得被压低到 0.32）', assumed.miller.value, 0.73);
near('pathA·P003 同样只取阻性上界', assumed.p003Total, 0.73);
near('PATH_A_VS_PATH_B·假设 Vbus 下两条路必须一致', assumed.miller.value, assumed.p003Total);

// ---- 情形 2（反证）：提供实测 Vbus 后，容性界必须恢复参与 ----
// 否则"情形 1 的 0.73"可能只是因为容性界被永久关掉了，而不是因为它是假设值。
const measured = runBoth(makeIssue({ busVoltageNominalV: 13.5, dvdtVns: 8, rgOffOhm: 2.2, vthMinV: 1.45 }));
eq('pathB·提供实测 Vbus 后来源不再是 ASSUMPTION', measured.miller.inputSources.busVoltageNominalV !== 'ASSUMPTION', true);
near('反证·实测 Vbus 时容性界恢复参与（0.32）', measured.miller.value, 0.32);
near('反证·pathA 同步恢复', measured.p003Total, 0.32);
near('PATH_A_VS_PATH_B·实测 Vbus 下仍一致', measured.miller.value, measured.p003Total);

console.log('miller-assumed-vbus-paths: PASS');
