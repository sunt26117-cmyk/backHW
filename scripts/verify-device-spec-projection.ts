import { importDeviceFromJson, saveDevice } from '../src/utils/deviceLibrary';
import { deriveBldcEvaluationInput } from '../src/utils/scenarioDerived';

const memory = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => memory.set(key, value),
  removeItem: (key: string) => memory.delete(key),
};

const result = importDeviceFromJson(JSON.stringify({
  deviceType: 'MOSFET', partNumber: 'PROJECTION-TEST', manufacturer: 'T', package: 'QFN',
  maxRatings: { vds: { value: 40 }, tjMax: { value: 175 }, easPulse: { value: 120 } },
  staticParams: { rdsOn: { value: 4.9 }, vbrDss: { value: 40 } },
  switchingParams: { tdOff: { value: 15 }, tf: { value: 12 } },
  gateCharge: { qg: { value: 26 } },
  thermalParams: { rthJc: { value: 2.14 }, rthJa: { value: 30 } },
  capacitanceParams: { ciss: { value: 1764, conditions: { vds: '15 V' } }, crss: { points: [{ x: 10, y: 45 }, { x: 20, y: 35 }] } },
  bodyDiode: { vf: { value: 0.85 }, qrr: { value: 17 }, trr: { value: 23 } },
}));
if (!result.device) throw new Error(result.error || 'device import failed');
saveDevice(result.device);
const issue = {
  issueCategories: ['BLDC Motor Drive'], requirement: '', actualMeasurement: '', testCondition: '', environment: '',
  failurePhenomenon: '', engineeringConcern: '', notes: '', measuredValues: { busVoltageNominalV: 13.5 }, measurementProvenance: {}, measuredValueSource: 'USER_MEASURED',
} as any;
const context = { selectedDeviceId: result.device.id, productType: '12V BLDC', projectPhase: 'DV' } as any;
const effective = deriveBldcEvaluationInput(context, issue);
const assertions: Array<[string, unknown, unknown]> = [
  ['vdsRating', effective.vdsRating, 40],
  ['tjMaxC', effective.tjMaxC, 175],
  ['rthJc', effective.rthJc, 2.14],
  ['rthJaTotal', effective.rthJaTotal, 30],
  ['turnOffDelayNs', effective.turnOffDelayNs, 15],
  ['fallTimeNs', effective.fallTimeNs, 12],
  ['gateChargeQgNc', effective.gateChargeQgNc, 26],
  ['qrrNc', effective.qrrNc, 17],
  ['diodeForwardVoltageV', effective.diodeForwardVoltageV, 0.85],
  ['easEnergyMj', effective.easEnergyMj, 120],
  // 同点相减（此前是 Ciss@标注点 − Crss@工况Vbus 的混点算法，得到 1722.5）：
  // Ciss 标注 15 V -> Crss@15V = 45 + (35-45)*(15-10)/(20-10) = 40 -> 1764 - 40 = 1724
  ['cgsPf (Ciss@15V - Crss@15V)', effective.cgsPf, 1724],
];
for (const [name, got, expected] of assertions) {
  if (got !== expected) throw new Error(`${name}: got ${String(got)}, expected ${String(expected)}`);
}
// 规格未标注 Ciss 的测试 Vds 时，禁止跨电压点相减：宁可没有值，也不混点
const noCond = importDeviceFromJson(JSON.stringify({
  deviceType: 'MOSFET', partNumber: 'PROJECTION-NO-COND', manufacturer: 'T', package: 'QFN',
  maxRatings: { vds: { value: 40 } },
  capacitanceParams: { ciss: { value: 1764 }, crss: { points: [{ x: 10, y: 45 }, { x: 20, y: 35 }] } },
}));
if (!noCond.device) throw new Error(noCond.error || 'no-cond device import failed');
saveDevice(noCond.device);
const noCondEffective = deriveBldcEvaluationInput({ selectedDeviceId: noCond.device.id } as any, issue);
if (noCondEffective.cgsPf !== undefined) {
  throw new Error('Ciss 未标注测试 Vds 时不得跨点相减，实际得到 cgsPf=' + String(noCondEffective.cgsPf));
}

console.log('device-spec-projection: PASS');
