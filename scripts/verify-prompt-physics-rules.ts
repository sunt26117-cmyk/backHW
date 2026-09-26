/**
 * 治理断言：AI Prompt 必须与本地确定性引擎**同一批数、同一套取点规则**。
 *
 * 三个此前真实存在的问题（都由绑定真实器件复核发现）：
 *  1. 【硬冲突】bldcMotorExpert 的 Prompt 文本只看 measuredValues 的手工输入：绑定器件后引擎用
 *     Crss 曲线算出 Cgd=41.5pF，Prompt 却写「Cgd=UNKNOWN」，而锚定事实就在旁边 —— 模型只能二选一：
 *     要么不信锚点，要么自己编一个数。
 *  2. 风险评分用的裕量也用「手工输入」各减一遍：绑定器件不手填时裕量恒为 undefined，评分永远停在
 *     基线分，看不出一票否决级别的泵升/米勒风险。
 *  3. 逐字段来源（DATASHEET / DERIVED / ASSUMPTION）没进 baseline 证据行（precomputed 行早就有），
 *     模型无法区分「台架实测」与「规格曲线派生」与「假设值」。
 *  4. 器件提取 Prompt 里没有任何取点规则：同点 Ciss−Crss、Crss 曲线按工况 Vbus 取 Cgd、
 *     Vth 取最坏高温点、Qg 两个 key 是同一物理量。
 */
import { importDeviceFromJson, saveDevice } from '../src/utils/deviceLibrary';
import { buildGroundingText } from '../src/utils/aiGrounding';
import { DEVICE_PARAM_PROMPT } from '../src/data/deviceTemplate';
import { generateBldcMotorAnalysis } from '../src/data/bldcMotorExpert';

const memory = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => memory.set(key, value),
  removeItem: (key: string) => memory.delete(key),
};

const assert = (cond: boolean, message: string) => {
  if (!cond) throw new Error(message);
};

// ---------------------------------------------- 1) 器件提取 Prompt 的取点规则
for (const rule of [
  '【引擎取点规则',
  '同一个 VDS 点',
  'Crss 曲线在工况 Vbus 处插值',
  '最坏情况（结温最高 → Vth 最低）',
  '同一个物理量',
  'conditions.vds',
  'maxRatings.tjMax',
]) {
  assert(DEVICE_PARAM_PROMPT.includes(rule), `器件提取 Prompt 缺少取点规则：${rule}`);
}

// ---------------------------------------------- 2) grounding 证据行必须带逐字段来源
const fact = {
  id: 'BLDC_MILLER_RISK', category: 'MILLER_TRANSIENT' as const, title: 'BLDC Miller 感应门极峰值',
  parameter: 'bldc.miller.vGateInducedV', calculatedValue: 0.32, unit: 'V',
  formulaOrBasis: 'Vgs_induced ≈ Cgd·dv/dt·Rg', complianceVerdict: 'PASS' as const,
  directiveForAi: '不得自行重算', status: 'CALCULATED' as const, specThreshold: 0.7, safetyMargin: 0.38,
  inputs: ['state.cgdPf'], inputSources: { cgdPf: 'DATASHEET', cgsPf: 'DERIVED' },
};
const grounding = buildGroundingText(
  {
    analysisBasis: {
      calculatedOutputs: ['bldc.miller.vGateInducedV=0.32 V'],
      calculatedOutputEvidence: [{
        key: 'bldc.miller.vGateInducedV', title: 'BLDC Miller 感应门极峰值', status: 'CALCULATED',
        value: 0.32, unit: 'V', engine: 'motorPhysicsEngine', calculation: 'millerRisk',
        inputs: ['state.cgdPf', 'state.cgsPf'],
        inputSources: { cgdPf: 'DATASHEET', cgsPf: 'DERIVED', busVoltageNominalV: 'ASSUMPTION' },
        missingInputs: [],
      }],
    },
  } as any,
  [fact],
  [],
);
assert(grounding.baselineText.includes('输入来源: cgdPf:DATASHEET'), 'baseline 证据行未带来源：' + grounding.baselineText.slice(0, 300));
assert(grounding.baselineText.includes('busVoltageNominalV:ASSUMPTION'), 'baseline 证据行未带假设来源标注');
assert(grounding.precomputedText.includes('输入来源'), 'precomputed 行未带输入来源');

// ---------------------------------------------- 3) 端到端：绑定器件的 Prompt 不得再写 Cgd=UNKNOWN
const imported = importDeviceFromJson(JSON.stringify({
  deviceType: 'MOSFET', partNumber: 'PROMPT-RULE-MOSFET', manufacturer: 'T', package: 'QFN',
  maxRatings: { vds: { value: 40 }, tjMax: { value: 175 } },
  staticParams: { rdsOn: { value: 4.9 }, vth: { points: [{ x: 25, y: 1.45 }, { x: 175, y: 0.7 }] } },
  capacitanceParams: {
    ciss: { value: 1764, conditions: { vds: '15 V' } },
    crss: { points: [{ x: 10, y: 45 }, { x: 20, y: 35 }] },
  },
  gateCharge: { qg: { value: 26 } },
  thermalParams: { rthJc: { value: 2.14 } },
  bodyDiode: { qrr: { value: 17 } },
}));
assert(!!imported.device, imported.error || 'device import failed');
saveDevice(imported.device!);

const context = {
  projectName: 'BLDC-12V', projectPhase: 'DV', customer: 'OEM', ecuType: 'BLDC', asilLevel: 'QM',
  sopDate: '2026-06-30', nextMilestone: 'DV', daysRemaining: 21, selectedDeviceId: imported.device!.id,
} as any;
const issue = {
  issueCategories: ['BLDC Motor Drive'], requirement: '', actualMeasurement: '', testCondition: '',
  environment: '', failurePhenomenon: '急停时母线电压泵升', engineeringConcern: '米勒误导通',
  notes: '', measuredValues: { busVoltageNominalV: 13.5, dvdtVns: 8.0, rgOffOhm: 2.2, vthMinV: 1.45 },
  measurementProvenance: {}, measuredValueSource: 'USER_MEASURED',
} as any;

// 注意：这里**故意不手工填 cgdPf/vthMinV 之外的任何器件参数**，复现真实用法（绑定器件 + 只填工况）。
const analysis = generateBldcMotorAnalysis(context, issue);
const dump = JSON.stringify(analysis);

assert(!dump.includes('Cgd=UNKNOWN'), 'Prompt 仍写 Cgd=UNKNOWN（引擎已按器件 Crss 曲线取到值）');
assert(dump.includes('Cgd=41.5pF[DATASHEET]'), 'Prompt 未按引擎同源值 + 来源标注 Cgd：' + (dump.match(/Cgd=[^，]{0,40}/) || ['(找不到)'])[0]);
assert(dump.includes('Vth_min=0.7V[DATASHEET]'), 'Prompt 的 Vth 未取最坏高温点并标注来源：' + (dump.match(/Vth_min=[^，]{0,40}/) || ['(找不到)'])[0]);
assert(dump.includes('Cgs=1724pF'), 'Prompt 未带上同点派生的 Cgs：' + (dump.match(/Cgs=[^，]{0,30}/) || ['(找不到)'])[0]);
assert(dump.includes('dv/dt=8V/ns['), 'Prompt 的 dv/dt 未带来源标注');
assert(dump.includes('VdsRating=40V'), 'Prompt 的 Vds 未用器件规格（实测缺失时必须回落规格）：' + (dump.match(/VdsRating=[^，]{0,20}/) || ['(找不到)'])[0]);
assert(!dump.includes('VdsRating=0V'), 'Prompt 把缺输入哨兵 0 当成了真实的 0V（比 UNKNOWN 更误导）');
// 裕量必须取引擎的 safetyMargin（0.7-0.32=0.38）：此前用「手工输入 Vth」减，绑定器件不手填时恒为 undefined
assert(dump.includes('0.38V'), 'Prompt 未展示引擎算出的 Miller 阈值裕量 0.38V');
assert(analysis.riskRatings.overallRisk === 'High', 'Miller 裕量 0.38V(<0.5) 未反映到风险评分：' + analysis.riskRatings.overallRisk);

console.log('prompt-physics-rules: PASS');
