import type { CandidateSourceType, CandidateValueType, DeviceParameterCategory, FieldSpec } from './deviceParameterCandidates';
import { DEVICE_SPEC_FIELDS } from './deviceSpecificationSchema';

export const MOSFET_TARGET_CATEGORY_BY_KEY: Record<string, DeviceParameterCategory> = {
  vdsRatingV: '功率级', easEnergyMj: '功率级', rdsOnMilliOhm: '静态', vthMinV: '静态', vthMaxV: '静态',
  cgdPf: '电容', cgsPf: '电容', gateChargeQgNc: '栅极驱动', qgdNc: '栅极驱动',
  turnOffDelayNs: '动态', fallTimeNs: '动态', thermalResistanceCPerW: '热', rthCaOrJa: '热',
  diodeForwardVoltageV: '二极管', qrrNc: '二极管', soaShortCircuitTimeUs: '保护/可靠性',
  ...Object.fromEntries(DEVICE_SPEC_FIELDS.map((field) => [field.key, field.category])),
};

export const MOSFET_FIELD_TABLE: FieldSpec[] = [
  { rawPath: 'maxRatings.vds', label: 'Vds 额定耐压', unit: 'V', targetKey: 'vdsRatingV', category: '功率级', defaultSourceType: 'DATASHEET_DIRECT', defaultConfidence: 0.98, valueType: 'MAX', evidence: 'MaxRatings.VDS' },
  { rawPath: 'maxRatings.id', label: '连续漏极电流 ID', unit: 'A', targetKey: 'idRatingA', category: '功率级', defaultSourceType: 'DATASHEET_DIRECT', defaultConfidence: 0.95, valueType: 'MAX', evidence: 'MaxRatings.ID' },
  { rawPath: 'maxRatings.idPulse', label: '脉冲漏极电流 ID(pulse)', unit: 'A', targetKey: 'idPulseRatingA', category: '功率级', defaultSourceType: 'DATASHEET_DIRECT', defaultConfidence: 0.95, valueType: 'MAX', evidence: 'MaxRatings.ID(pulse)' },
  { rawPath: 'maxRatings.tjMax', label: '最大结温 Tjmax', unit: '℃', targetKey: 'tjMaxC', category: '热', defaultSourceType: 'DATASHEET_DIRECT', defaultConfidence: 0.98, valueType: 'MAX', evidence: 'MaxRatings.TJmax', note: '不得映射为当前工况 junctionTempC；它是器件能力边界。' },
  { rawPath: 'maxRatings.tstg', label: '存储温度 Tstg', unit: '℃', targetKey: null, category: '热', defaultSourceType: 'DATASHEET_DIRECT', defaultConfidence: 0.95, valueType: 'MAX', valueKind: 'collection', evidence: 'MaxRatings.Tstg', note: '保留绝对存储温度边界，不映射当前工况温度。' },
  { rawPath: 'maxRatings.powerDissipation', label: '最大耗散功率 PD', unit: 'W', targetKey: 'pdMaxW', category: '热', defaultSourceType: 'DATASHEET_DIRECT', defaultConfidence: 0.95, valueType: 'MAX', evidence: 'MaxRatings.PD' },
  { rawPath: 'maxRatings.easPulse', label: '单脉冲雪崩能量 EAS', unit: 'mJ', targetKey: 'easEnergyMj', category: '功率级', defaultSourceType: 'DATASHEET_DIRECT', defaultConfidence: 0.96, valueType: 'MAX', evidence: 'MaxRatings.EAS' },
  { rawPath: 'maxRatings.easCurrent', label: '雪崩电流 EAS current', unit: 'A', targetKey: 'easCurrentA', category: '功率级', defaultSourceType: 'DATASHEET_DIRECT', defaultConfidence: 0.92, valueType: 'MAX', evidence: 'MaxRatings.EAS current' },
  { rawPath: 'soaCurve', label: 'SOA 安全工作区曲线', targetKey: null, category: 'SOA', defaultSourceType: 'DATASHEET_GRAPH_ESTIMATE', defaultConfidence: 0.80, valueType: 'ESTIMATE', valueKind: 'collection', evidence: 'SOA curves', note: '完整 SOA 曲线保留在器件库；当前工程没有单值字段可直接承载。' },

  { rawPath: 'staticParams.rdsOn', label: 'Rds(on)（曲线选点）', unit: 'mΩ', targetKey: 'rdsOnMilliOhm', category: '静态', defaultSourceType: 'DATASHEET_GRAPH_ESTIMATE', defaultConfidence: 0.82, valueType: 'TYP', valueKind: 'curve', evidence: 'Rds(on) vs Tj 曲线选点', note: '当前工程字段是单值，完整曲线继续保留在器件库。' },
  { rawPath: 'staticParams.vth', label: 'Vgs 阈值 Vth（曲线选点）', unit: 'V', targetKey: 'vthMinV', category: '静态', defaultSourceType: 'DATASHEET_GRAPH_ESTIMATE', defaultConfidence: 0.82, valueType: 'MIN', valueKind: 'curve', evidence: 'Vth vs Tj 曲线选点', note: '曲线估读不得冒充保证值。' },
  { rawPath: 'staticParams.vthMax', label: 'Vgs 阈值 Vth 最大值', unit: 'V', targetKey: 'vthMaxV', category: '静态', defaultSourceType: 'DATASHEET_DIRECT', defaultConfidence: 0.9, valueType: 'MAX', evidence: 'VGS(th) 最大值（datasheet 表格）', note: '与最小值分开保留。' },
  { rawPath: 'staticParams.bodyChannelCurrent', label: '体沟道电流能力', unit: 'A', targetKey: null, category: '静态', defaultSourceType: 'DATASHEET_DIRECT', defaultConfidence: 0.90, valueType: 'TYP', evidence: 'Static body-channel current' },
  { rawPath: 'staticParams.vbrDss', label: 'V(BR)DSS 最小击穿电压', unit: 'V', targetKey: 'vbrDssMinV', category: '功率级', defaultSourceType: 'DATASHEET_DIRECT', defaultConfidence: 0.95, valueType: 'MIN', evidence: 'Drain-source breakdown voltage' },
  { rawPath: 'staticParams.idss', label: '漏极漏电 IDSS', unit: 'μA', targetKey: 'idssUa', category: '静态', defaultSourceType: 'DATASHEET_DIRECT', defaultConfidence: 0.95, valueType: 'MAX', evidence: 'Drain leakage IDSS' },
  { rawPath: 'staticParams.igss', label: '栅极漏电 IGSS', unit: 'nA', targetKey: 'igssNa', category: '静态', defaultSourceType: 'DATASHEET_DIRECT', defaultConfidence: 0.95, valueType: 'MAX', evidence: 'Gate leakage IGSS' },
  { rawPath: 'staticParams.gateResistance', label: '内部栅极电阻 RG(int)', unit: 'Ω', targetKey: 'gateResistanceOhm', category: '栅极驱动', defaultSourceType: 'DATASHEET_DIRECT', defaultConfidence: 0.95, valueType: 'TYP', evidence: 'Internal gate resistance' },

  { rawPath: 'capacitanceParams.ciss', label: '输入电容 Ciss', unit: 'pF', targetKey: 'cissPf', category: '电容', defaultSourceType: 'DATASHEET_DIRECT', defaultConfidence: 0.95, valueType: 'TYP', evidence: 'Capacitance Ciss' },
  { rawPath: 'capacitanceParams.coss', label: '输出电容 Coss', unit: 'pF', targetKey: 'cossPf', category: '电容', defaultSourceType: 'DATASHEET_DIRECT', defaultConfidence: 0.95, valueType: 'TYP', evidence: 'Capacitance Coss' },
  { rawPath: 'capacitanceParams.crss', label: '反向传输电容 Crss（曲线）', unit: 'pF', targetKey: null, category: '电容', defaultSourceType: 'DATASHEET_GRAPH_ESTIMATE', defaultConfidence: 0.80, valueType: 'TYP', valueKind: 'curve', evidence: 'Capacitance Crss curve', note: '保留原始 Crss 名称，不自动伪装成 Cgd。' },
  { rawPath: 'capacitanceParams.cgdDirect', label: '直接给出的 Cgd', unit: 'pF', targetKey: 'cgdPf', category: '电容', defaultSourceType: 'DATASHEET_DIRECT', defaultConfidence: 0.95, valueType: 'TYP', evidence: 'Capacitance Cgd' },

  { rawPath: 'gateCharge.qg', label: '总栅电荷 Qg', unit: 'nC', targetKey: 'gateChargeQgNc', category: '栅极驱动', defaultSourceType: 'DATASHEET_DIRECT', defaultConfidence: 0.96, valueType: 'TYP', evidence: 'Gate charge Qg' },
  { rawPath: 'gateCharge.qgs', label: '栅源电荷 Qgs', unit: 'nC', targetKey: 'qgsNc', category: '栅极驱动', defaultSourceType: 'DATASHEET_DIRECT', defaultConfidence: 0.95, valueType: 'TYP', evidence: 'Gate charge Qgs' },
  { rawPath: 'gateCharge.qgd', label: '米勒电荷 Qgd', unit: 'nC', targetKey: 'qgdNc', category: '栅极驱动', defaultSourceType: 'DATASHEET_DIRECT', defaultConfidence: 0.95, valueType: 'TYP', evidence: 'Gate charge Qgd' },
  { rawPath: 'gateCharge.qsw', label: '开关电荷 Qsw', unit: 'nC', targetKey: 'qswNc', category: '栅极驱动', defaultSourceType: 'DATASHEET_DIRECT', defaultConfidence: 0.92, valueType: 'TYP', evidence: 'Gate charge Qsw' },
  { rawPath: 'gateCharge.gatePlateauV', label: '栅极平台电压', unit: 'V', targetKey: 'gatePlateauV', category: '栅极驱动', defaultSourceType: 'DATASHEET_DIRECT', defaultConfidence: 0.92, valueType: 'TYP', evidence: 'Gate plateau voltage' },
  { rawPath: 'gateCharge.gateChargeCurve', label: '栅极电荷曲线', targetKey: null, category: '栅极驱动', defaultSourceType: 'DATASHEET_GRAPH_ESTIMATE', defaultConfidence: 0.80, valueType: 'ESTIMATE', valueKind: 'curve', evidence: 'Gate charge curve', note: '完整曲线保留在器件库。' },

  { rawPath: 'switchingParams.tr', label: '上升时间 tr', unit: 'ns', targetKey: 'riseTimeNs', category: '动态', defaultSourceType: 'DATASHEET_DIRECT', defaultConfidence: 0.92, valueType: 'TYP', evidence: 'Switching characteristics' },
  { rawPath: 'switchingParams.tdOn', label: '开通延迟 td(on)', unit: 'ns', targetKey: 'turnOnDelayNs', category: '动态', defaultSourceType: 'DATASHEET_DIRECT', defaultConfidence: 0.92, valueType: 'TYP', evidence: 'Switching characteristics' },
  { rawPath: 'switchingParams.tdOff', label: '关断延迟 td(off)', unit: 'ns', targetKey: 'turnOffDelayNs', category: '动态', defaultSourceType: 'DATASHEET_DIRECT', defaultConfidence: 0.92, valueType: 'TYP', evidence: 'Switching characteristics' },
  { rawPath: 'switchingParams.tf', label: '下降时间 tf', unit: 'ns', targetKey: 'fallTimeNs', category: '动态', defaultSourceType: 'DATASHEET_DIRECT', defaultConfidence: 0.92, valueType: 'TYP', evidence: 'Switching characteristics' },
  { rawPath: 'switchingParams.dvdtCapability', label: 'dv/dt 能力', unit: 'V/ns', targetKey: 'dvdtCapabilityVns', category: '动态', defaultSourceType: 'DATASHEET_DIRECT', defaultConfidence: 0.92, valueType: 'MAX', evidence: 'dv/dt capability' },
  { rawPath: 'switchingParams.didtCapability', label: 'di/dt 能力', unit: 'A/ns', targetKey: 'didtCapabilityANs', category: '动态', defaultSourceType: 'DATASHEET_DIRECT', defaultConfidence: 0.92, valueType: 'MAX', evidence: 'di/dt capability' },

  { rawPath: 'thermalParams.rthJc', label: 'RθJC', unit: '℃/W', targetKey: 'rthJcCPerW', category: '热', defaultSourceType: 'DATASHEET_DIRECT', defaultConfidence: 0.90, valueType: 'MAX', evidence: 'Thermal resistance junction-to-case' },
  { rawPath: 'thermalParams.rthJa', label: 'RθJA', unit: '℃/W', targetKey: 'rthJaCPerW', category: '热', defaultSourceType: 'DATASHEET_DIRECT', defaultConfidence: 0.80, valueType: 'TYP', evidence: 'Thermal resistance junction-to-ambient', note: '强依赖 PCB/铜箔/散热条件，不能直接等同任意 ECU 装配状态。' },
  { rawPath: 'thermalParams.zthJc', label: 'ZθJC(t) 瞬态热阻曲线', unit: '℃/W', targetKey: null, category: '热', defaultSourceType: 'DATASHEET_GRAPH_ESTIMATE', defaultConfidence: 0.80, valueType: 'ESTIMATE', valueKind: 'curve', evidence: 'Transient thermal impedance curve', note: '完整瞬态热阻曲线保留在器件库。' },

  { rawPath: 'bodyDiode.vf', label: '体二极管 Vf', unit: 'V', targetKey: 'diodeForwardVoltageV', category: '二极管', defaultSourceType: 'DATASHEET_DIRECT', defaultConfidence: 0.95, valueType: 'TYP', evidence: 'Body diode forward voltage' },
  { rawPath: 'bodyDiode.qrr', label: '反向恢复电荷 Qrr', unit: 'nC', targetKey: 'qrrNc', category: '二极管', defaultSourceType: 'DATASHEET_DIRECT', defaultConfidence: 0.95, valueType: 'TYP', evidence: 'Body diode reverse recovery charge' },
  { rawPath: 'bodyDiode.trr', label: '反向恢复时间 trr', unit: 'ns', targetKey: 'trrNs', category: '二极管', defaultSourceType: 'DATASHEET_DIRECT', defaultConfidence: 0.95, valueType: 'TYP', evidence: 'Body diode reverse recovery time' },
  { rawPath: 'bodyDiode.irrM', label: '反向恢复峰值电流 IrrM', unit: 'A', targetKey: 'irrPeakA', category: '二极管', defaultSourceType: 'DATASHEET_DIRECT', defaultConfidence: 0.92, valueType: 'TYP', evidence: 'Body diode reverse recovery current' },

  { rawPath: 'protectionAndRobustness.shortCircuitTime', label: '短路耐受时间', unit: 'μs', targetKey: 'soaShortCircuitTimeUs', category: '保护/可靠性', defaultSourceType: 'DATASHEET_DIRECT', defaultConfidence: 0.95, valueType: 'MAX', evidence: 'Short-circuit withstand', note: '可映射到 P016 的 SOA/短路耐受时间；仍须核对 datasheet 测试 VDS/VGS/Tj 条件。' },
  { rawPath: 'protectionAndRobustness.gateVoltageMax', label: 'Gate 电压上限', unit: 'V', targetKey: 'gateVoltageMaxV', category: '保护/可靠性', defaultSourceType: 'DATASHEET_DIRECT', defaultConfidence: 0.98, valueType: 'MAX', evidence: 'Gate voltage maximum' },
  { rawPath: 'protectionAndRobustness.esdRating', label: 'ESD 等级', unit: 'kV', targetKey: 'esdRatingKv', category: '保护/可靠性', defaultSourceType: 'DATASHEET_DIRECT', defaultConfidence: 0.92, valueType: 'MAX', evidence: 'ESD rating' },
];
