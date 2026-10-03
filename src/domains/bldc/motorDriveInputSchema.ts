import type { IssueInput, MeasurementSource } from '../../types';

/**
 * WP5c-2: MotorDriveToolbox 的正式输入归属表。
 *
 * 规则：
 * - CURRENT_ISSUE：存在明确 IssueInput.measuredValues 键，且该字段已经被 BLDC/物理链路消费。
 * - WHAT_IF_ONLY：只服务专项计算器，不得自动进入当前工程事实。
 * - writeSource：该 canonical 字段在工程事实层的预期来源提示；本地 What-if 显式写回若没有既有 provenance，统一落为 ASSUMPTION，不直接冒充 CONTEXT/SPEC。
 *
 * 注意：这里不是第二套 BLDC 业务 schema。最终确定性输入仍由 BldcEvaluationInput / scenarioDerived 负责。
 */
export type MotorDriveFieldBinding = 'CURRENT_ISSUE' | 'WHAT_IF_ONLY';
export type MotorDriveSourceType =
  | 'CONTEXT'
  | 'MEASURED'
  | 'IMPORTED_EVIDENCE'
  | 'SPECIFICATION'
  | 'DATASHEET'
  | 'DERIVED'
  | 'ASSUMPTION'
  | 'WHAT_IF';
export type MotorDriveProvenancePolicy = 'PRESERVE_STRONGER' | 'WRITE_AS_ASSUMPTION' | 'NEVER_WRITE';
export type MotorDriveValueType = 'number' | 'enum';
export type MotorDriveInputGroup = keyof typeof MOTOR_DRIVE_DOMAIN_SCHEMA;

export interface MotorDriveDomainField {
  key: string;
  label: string;
  unit?: string;
  description: string;
  binding: MotorDriveFieldBinding;
  issueKey?: string;
  writeSource?: MeasurementSource;
  /** 统一来源类别：区别于旧 MeasurementSource，专门描述此字段在专项工具中的语义角色。 */
  sourceType: MotorDriveSourceType;
  provenancePolicy: MotorDriveProvenancePolicy;
  valueType: MotorDriveValueType;
  /** 读取本地 What-if 草稿后写入 IssueInput 前的单位/值转换。 */
  toIssueValue?: (value: unknown) => number | string | undefined;
}

const numeric = (value: unknown): number | undefined => {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};

const direct = (value: unknown): number | undefined => numeric(value);

export const MOTOR_DRIVE_DOMAIN_SCHEMA = Object.freeze({
  busPumping: [
    { key: 'V_bus_nom', label: '标称母线', unit: 'V', issueKey: 'busVoltageNominalV', binding: 'CURRENT_ISSUE', writeSource: 'CONTEXT', sourceType: 'CONTEXT', provenancePolicy: 'PRESERVE_STRONGER', valueType: 'number', description: '当前工程母线标称电压。' },
    { key: 'V_bus_max_rating', label: '器件耐压上限', unit: 'V', issueKey: 'vdsRatingV', binding: 'CURRENT_ISSUE', writeSource: 'SPEC', sourceType: 'SPECIFICATION', provenancePolicy: 'PRESERVE_STRONGER', valueType: 'number', description: '当前绑定器件 Vds 额定值。' },
    { key: 'C_dc_uF', label: '母线电容', unit: 'μF', issueKey: 'cBusUf', binding: 'CURRENT_ISSUE', writeSource: 'ASSUMPTION', sourceType: 'ASSUMPTION', provenancePolicy: 'WRITE_AS_ASSUMPTION', valueType: 'number', description: '当前工程 DC-Link 电容；专项工具显式回填时按假设处理，已有更强 provenance 时保留原来源。' },
    { key: 'J_kg_m2', label: '转动惯量', unit: 'kg·m²', issueKey: 'rotorInertiaKgm2', binding: 'CURRENT_ISSUE', writeSource: 'ASSUMPTION', sourceType: 'ASSUMPTION', provenancePolicy: 'WRITE_AS_ASSUMPTION', valueType: 'number', description: '当前工程机械惯量；没有证据时不能自动冒充实测。' },
    { key: 'n_rpm', label: '电机转速', unit: 'rpm', issueKey: 'rpm', binding: 'CURRENT_ISSUE', writeSource: 'ASSUMPTION', sourceType: 'ASSUMPTION', provenancePolicy: 'WRITE_AS_ASSUMPTION', valueType: 'number', description: '当前工程急停前转速输入。' },
    { key: 'I_phase_A', label: '急停相电流', unit: 'A', issueKey: 'currentPeakA', binding: 'CURRENT_ISSUE', writeSource: 'ASSUMPTION', sourceType: 'ASSUMPTION', provenancePolicy: 'WRITE_AS_ASSUMPTION', valueType: 'number', description: '当前工程峰值/急停电流。' },
    { key: 'L_harness_uH', label: '线束电感', unit: 'μH', binding: 'WHAT_IF_ONLY', sourceType: 'WHAT_IF', provenancePolicy: 'NEVER_WRITE', valueType: 'number', description: '专项回路 What-if；当前 Issue 未建立明确的一对一消费边界。' },
    { key: 'regenEfficiency', label: '回馈效率', unit: '0~1', binding: 'WHAT_IF_ONLY', sourceType: 'WHAT_IF', provenancePolicy: 'NEVER_WRITE', valueType: 'number', description: '专项 What-if；不是当前工程的默认事实。' },
  ],
  miller: [
    { key: 'V_th_min', label: 'Vth 最小值', unit: 'V', issueKey: 'vthMinV', binding: 'CURRENT_ISSUE', writeSource: 'SPEC', sourceType: 'SPECIFICATION', provenancePolicy: 'PRESERVE_STRONGER', valueType: 'number', description: '当前器件阈值下限；已有器件库/实测 provenance 优先。' },
    { key: 'C_gd_pF', label: 'Cgd', unit: 'pF', issueKey: 'cgdPf', binding: 'CURRENT_ISSUE', writeSource: 'ASSUMPTION', sourceType: 'ASSUMPTION', provenancePolicy: 'WRITE_AS_ASSUMPTION', valueType: 'number', description: '当前 Cgd 输入；已有 DATASHEET/DERIVED provenance 时保留原来源。' },
    { key: 'R_g_pulldown_ohm', label: 'Rg_off', unit: 'Ω', issueKey: 'rgOffOhm', binding: 'CURRENT_ISSUE', writeSource: 'ASSUMPTION', sourceType: 'ASSUMPTION', provenancePolicy: 'WRITE_AS_ASSUMPTION', valueType: 'number', description: '当前关断栅回路有效阻抗。' },
    { key: 'dv_dt_V_per_ns', label: 'dv/dt', unit: 'V/ns', issueKey: 'dvdtVns', binding: 'CURRENT_ISSUE', writeSource: 'ASSUMPTION', sourceType: 'ASSUMPTION', provenancePolicy: 'WRITE_AS_ASSUMPTION', valueType: 'number', description: '当前开关节点边沿输入；优先采用实测/导入证据。' },
    { key: 'C_gs_pF', label: 'Cgs', unit: 'pF', issueKey: 'cgsPf', binding: 'CURRENT_ISSUE', writeSource: 'ASSUMPTION', sourceType: 'ASSUMPTION', provenancePolicy: 'WRITE_AS_ASSUMPTION', valueType: 'number', description: '当前 Cgs 可以进入 IssueInput，但最终确定性链路仍由器件库/同点派生治理。' },
    { key: 'hasActiveMillerClamp', label: '有源 Miller Clamp', binding: 'WHAT_IF_ONLY', sourceType: 'WHAT_IF', provenancePolicy: 'NEVER_WRITE', valueType: 'enum', description: '专项架构 What-if；IssueInput 当前没有对应明确结构化键。' },
  ],
  snubber: [
    { key: 'f_ring_MHz', label: '振铃频率', unit: 'MHz', binding: 'WHAT_IF_ONLY', sourceType: 'WHAT_IF', provenancePolicy: 'NEVER_WRITE', valueType: 'number', description: '由波形/寄生参数验证后再进入工程事实；当前工具不直接回写。' },
    { key: 'C_oss_pF', label: 'Coss', unit: 'pF', binding: 'WHAT_IF_ONLY', sourceType: 'WHAT_IF', provenancePolicy: 'NEVER_WRITE', valueType: 'number', description: '专项计算输入；器件库已存在独立规格路径，不在此处自动写回。' },
    { key: 'V_bus_V', label: 'Snubber 母线电压', unit: 'V', binding: 'WHAT_IF_ONLY', sourceType: 'WHAT_IF', provenancePolicy: 'NEVER_WRITE', valueType: 'number', description: '独立 Snubber what-if；不得把计算器局部工作点冒充当前工程母线事实。' },
    { key: 'f_sw_kHz', label: '开关频率', unit: 'kHz', binding: 'WHAT_IF_ONLY', sourceType: 'WHAT_IF', provenancePolicy: 'NEVER_WRITE', valueType: 'number', description: '专项计算器输入；当前字段存在单位/来源双重路径，不在此处自动写回。' },
  ],
  stallThermal: [
    { key: 'ambientTempC', label: '环境温度', unit: '℃', issueKey: 'ambientTempC', binding: 'CURRENT_ISSUE', writeSource: 'ASSUMPTION', sourceType: 'ASSUMPTION', provenancePolicy: 'WRITE_AS_ASSUMPTION', valueType: 'number', description: '当前热环境；显式写入时按工程假设保存，实测/试验来源需另行赋予 provenance。' },
    { key: 'stallCurrentA', label: '堵转电流', unit: 'A', issueKey: 'currentPeakA', binding: 'CURRENT_ISSUE', writeSource: 'ASSUMPTION', sourceType: 'ASSUMPTION', provenancePolicy: 'WRITE_AS_ASSUMPTION', valueType: 'number', description: '堵转电流与当前峰值电流共用 IssueInput 数值入口。' },
    { key: 'stallDurationMs', label: '堵转持续时间', unit: 'ms', binding: 'WHAT_IF_ONLY', sourceType: 'WHAT_IF', provenancePolicy: 'NEVER_WRITE', valueType: 'number', description: 'P018 目前拆成 level1/2/3 多个工程输入，单一持续时间不能安全映射。' },
    { key: 'biasPowerW', label: '基准损耗', unit: 'W', binding: 'WHAT_IF_ONLY', sourceType: 'WHAT_IF', provenancePolicy: 'NEVER_WRITE', valueType: 'number', description: 'Foster 堵转瞬态计算的局部基准损耗；当前 Issue 没有唯一 canonical key。' },
    { key: 'tjMaxC', label: '结温上限', unit: '℃', binding: 'WHAT_IF_ONLY', sourceType: 'WHAT_IF', provenancePolicy: 'NEVER_WRITE', valueType: 'number', description: '专项热计算边界，不把计算器设定值冒充器件规格。正式规格应来自器件数据/工程输入。' },
    { key: 'tjDeratedLimitC', label: '降额结温限值', unit: '℃', binding: 'WHAT_IF_ONLY', sourceType: 'WHAT_IF', provenancePolicy: 'NEVER_WRITE', valueType: 'number', description: '专项热设计降额边界；没有唯一当前工程 canonical key。' },
    { key: 'packageType', label: '封装 Foster 模型', binding: 'WHAT_IF_ONLY', sourceType: 'WHAT_IF', provenancePolicy: 'NEVER_WRITE', valueType: 'enum', description: '仅决定工具内部 Foster 参数组，不代表当前器件封装事实；器件规格应由器件输入/候选器件路径提供。' },
    { key: 'rdson25mOhm', label: 'MOS 内阻', unit: 'mΩ', issueKey: 'rdsOnMilliOhm', binding: 'CURRENT_ISSUE', writeSource: 'ASSUMPTION', sourceType: 'ASSUMPTION', provenancePolicy: 'WRITE_AS_ASSUMPTION', valueType: 'number', description: '当前 Rds(on) 输入；器件 Datasheet/Curve provenance 优先。' },
  ],
  commutation: [
    { key: 'controlMode', label: '控制算法模式', binding: 'WHAT_IF_ONLY', sourceType: 'WHAT_IF', provenancePolicy: 'NEVER_WRITE', valueType: 'enum', description: '当前工具内部架构 What-if。' },
    { key: 'angleOffsetDeg', label: '换相角偏差', unit: '°', binding: 'WHAT_IF_ONLY', sourceType: 'WHAT_IF', provenancePolicy: 'NEVER_WRITE', valueType: 'number', description: '当前工具内部 What-if；尚无统一 IssueInput canonical key。' },
    { key: 'speedMinRpm', label: '最低转速', unit: 'rpm', binding: 'WHAT_IF_ONLY', sourceType: 'WHAT_IF', provenancePolicy: 'NEVER_WRITE', valueType: 'number', description: '运行区间是专项计算假设，不等价于单一当前 rpm 事实。' },
    { key: 'speedMaxRpm', label: '最高转速', unit: 'rpm', binding: 'WHAT_IF_ONLY', sourceType: 'WHAT_IF', provenancePolicy: 'NEVER_WRITE', valueType: 'number', description: '运行区间是专项计算假设。' },
    { key: 'torqueFluctuationPct', label: '扭矩波动', unit: '%', binding: 'WHAT_IF_ONLY', sourceType: 'WHAT_IF', provenancePolicy: 'NEVER_WRITE', valueType: 'number', description: '专项 What-if；当前没有统一结构化 IssueInput 键。' },
  ],
  sensorDegradation: [
    { key: 'sensorType', label: '位置传感器架构', binding: 'WHAT_IF_ONLY', sourceType: 'WHAT_IF', provenancePolicy: 'NEVER_WRITE', valueType: 'enum', description: '专项架构 What-if；当前 P009 使用的是 motorSensorType，不直接自动写回。' },
  ],
  safetyChain: [
    { key: 'fhtiBudgetMs', label: 'FHTI 时间预算', unit: 'ms', binding: 'WHAT_IF_ONLY', sourceType: 'WHAT_IF', provenancePolicy: 'NEVER_WRITE', valueType: 'number', description: '专项功能安全链 What-if；当前链路主要由结果/专家层描述，未建立单一 IssueInput 键。' },
    { key: 'wdgTimeoutWindowMs', label: '看门狗窗口', unit: 'ms', binding: 'WHAT_IF_ONLY', sourceType: 'WHAT_IF', provenancePolicy: 'NEVER_WRITE', valueType: 'number', description: '专项安全时序 What-if。' },
    { key: 'safeStateTransitionMs', label: '安全状态切换延时', unit: 'ms', binding: 'WHAT_IF_ONLY', sourceType: 'WHAT_IF', provenancePolicy: 'NEVER_WRITE', valueType: 'number', description: '专项安全时序 What-if。' },
    { key: 'currentSenseDeviationPct', label: '双通道采样偏差', unit: '%', binding: 'WHAT_IF_ONLY', sourceType: 'WHAT_IF', provenancePolicy: 'NEVER_WRITE', valueType: 'number', description: '专项安全时序 What-if；当前 Issue 没有统一 canonical key。' },
  ],
} as const);

export function getMotorDriveField(group: MotorDriveInputGroup, key: string): MotorDriveDomainField | undefined {
  return MOTOR_DRIVE_DOMAIN_SCHEMA[group].find((field) => field.key === key);
}

export function getCurrentIssueFields(group: MotorDriveInputGroup): readonly MotorDriveDomainField[] {
  return MOTOR_DRIVE_DOMAIN_SCHEMA[group].filter((field) => field.binding === 'CURRENT_ISSUE' && field.issueKey);
}

export function getWhatIfOnlyFields(group: MotorDriveInputGroup): readonly MotorDriveDomainField[] {
  return MOTOR_DRIVE_DOMAIN_SCHEMA[group].filter((field) => field.binding === 'WHAT_IF_ONLY');
}

export interface MotorDriveFieldState {
  group: MotorDriveInputGroup;
  key: string;
  binding: MotorDriveFieldBinding;
  unit?: string;
  sourceType: MotorDriveSourceType;
  provenancePolicy: MotorDriveProvenancePolicy;
  issueKey?: string;
  issueValue?: number | string;
  issueSource?: MeasurementSource;
  valueOrigin: 'CURRENT_ISSUE' | 'WHAT_IF_DEFAULT' | 'UNSET';
}

function mapMeasurementSourceToMotorDriveSourceType(source: MeasurementSource | undefined, fallback: MotorDriveSourceType): MotorDriveSourceType {
  switch (source) {
    case 'USER_MEASURED': return 'MEASURED';
    case 'IMPORTED': return 'IMPORTED_EVIDENCE';
    case 'SPEC': return 'SPECIFICATION';
    case 'DATASHEET': return 'DATASHEET';
    case 'DERIVED':
    case 'CALCULATED': return 'DERIVED';
    case 'CONTEXT': return 'CONTEXT';
    case 'ASSUMPTION': return 'ASSUMPTION';
    default: return fallback;
  }
}

export function getMotorDriveFieldState(
  issue: IssueInput | undefined,
  group: MotorDriveInputGroup,
  key: string,
): MotorDriveFieldState | undefined {
  const descriptor = getMotorDriveField(group, key);
  if (!descriptor) return undefined;
  const issueValue = descriptor.issueKey ? issue?.measuredValues?.[descriptor.issueKey] : undefined;
  const provenance = descriptor.issueKey ? issue?.measurementProvenance?.[descriptor.issueKey] : undefined;
  return {
    group, key, binding: descriptor.binding, unit: descriptor.unit,
    sourceType: mapMeasurementSourceToMotorDriveSourceType(provenance?.source, descriptor.sourceType),
    provenancePolicy: descriptor.provenancePolicy, issueKey: descriptor.issueKey, issueValue,
    issueSource: provenance?.source, valueOrigin: issueValue !== undefined && issueValue !== '' ? 'CURRENT_ISSUE' : 'UNSET',
  };
}

export function writeMotorDriveWhatIfToIssue(
  issue: IssueInput,
  group: MotorDriveInputGroup,
  values: Record<string, unknown>,
  dirtyKeys: readonly string[],
): { issue: IssueInput; writtenKeys: string[] } {
  const nextValues = { ...(issue.measuredValues || {}) };
  const nextProvenance = { ...(issue.measurementProvenance || {}) };
  const writtenKeys: string[] = [];

  for (const key of dirtyKeys) {
    const descriptor = getMotorDriveField(group, key);
    if (!descriptor || descriptor.binding !== 'CURRENT_ISSUE' || !descriptor.issueKey) continue;
    const converted = descriptor.toIssueValue ? descriptor.toIssueValue(values[key]) : direct(values[key]);
    if (converted === undefined) continue;
    const previous = nextProvenance[descriptor.issueKey];
    nextValues[descriptor.issueKey] = converted;
    nextProvenance[descriptor.issueKey] = {
      ...(previous || {}),
      // Local What-if -> 当前工程属于工程师显式确认输入，不能借 descriptor 的
      // CONTEXT/SPEC 语义冒充原始来源；已有 provenance 时才保留原来源。
      source: previous?.source || 'ASSUMPTION',
      sourceLabel: previous?.sourceLabel || `MotorDriveToolbox 显式写入 · ${descriptor.label}`,
      enteredAt: new Date().toISOString(),
      note: 'WP5d：专项工具 What-if 值经工程师显式确认后进入当前 IssueInput；无既有 provenance 时按 ASSUMPTION 留痕。',
    };
    writtenKeys.push(descriptor.issueKey);
  }

  return {
    issue: { ...issue, measuredValues: nextValues, measurementProvenance: nextProvenance },
    writtenKeys,
  };
}

export type MotorDriveSchemaGroup = typeof MOTOR_DRIVE_DOMAIN_SCHEMA;
