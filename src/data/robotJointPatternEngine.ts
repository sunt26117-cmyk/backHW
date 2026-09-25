/**
 * Robot Joint Mechatronics Pattern Engine (确定性物理与工程规则引擎，不靠关键词匹配)
 * 与 bldcPatternEngine.ts (P001~P018, 车规逆变桥电气物理) 互补而非替代：
 * 关节的三相逆变桥本体问题（母线泵升、米勒、死区、热、EMI、堵转等）仍应勾选
 * 'BLDC Motor Drive' 走 P001~P018；本引擎专注于减速器/编码器/控制环/力矩闭环/
 * 功能安全/总线实时性这一层，是车规 BLDC 工程师转岗机器人关节时最容易缺失的知识。
 *
 * J001 谐波/RV减速器背隙+扭转柔性 → 输出定位精度
 * J002 绝对值编码器供电/电池丢失 → 位置基准丢失
 * J003 机械谐振 → 速度环带宽与陷波滤波器设计
 * J004 连续往复再生能量 → 泄放电阻连续热设计
 * J005 力矩闭环误差链：电流估算力矩 vs 力矩传感器
 * J006 安全扭矩关断 STO/SS1 通道独立性与响应时间
 * J007 现场总线周期(EtherCAT/CANopen DS402) 与本地控制环耦合
 *
 * ------------------------------------------------------------------
 * 变更记录（本次修复，详见配套审计报告）：
 * [FIX-1] J003：修正惯量/刚度参考系不一致的量纲错误（原代码把负载惯量折算到电机侧，
 *         却用输出端刚度直接相乘，导致谐振频率被高估约 i 倍）。现统一折算到输出侧，
 *         并新增反谐振频率、惯量比、结果合理性区间校验（3~300Hz 之外提示复核）。
 * [FIX-2] J006：requiredPerformanceLevel 不再从自由文本正则推断，也不再默认视为
 *         'NONE'（原逻辑是"未声明=视为不需要安全等级"的失效开路默认值）。未声明时
 *         设为 'UNDECLARED' 并直接一票否决——安全等级必须来自书面风险评估文档，不能
 *         靠猜测放行。新增 Category/MTTFd/DC/CCF 证据项与重力轴+抱闸校验。
 * [FIX-3] J002：电压裕量对锂亚硫酰氯一次电池（多圈编码器后备电池的常见选型）是很差
 *         的预测指标——其放电曲线在寿命 90%+ 区间几乎平坦，电压快跌破阈值时可能已
 *         经没有预警窗口。新增基于累计通电时间的库仑计数估算作为主判据（若提供相应
 *         输入），电压判据保留但标注局限性。
 * [FIX-4] J004/J005/J007：新增若干可选输入，用于把此前"写死在公式里的经验假设"
 *         变成显式、可核实的参数（梯形减速功率因子、母线电容吸收能量、Kt温度系数、
 *         反向驱动效率、总线抖动/负载率），并把 J007 与 J003 的谐振频率做了联动检查
 *         （总线台阶指令的谐波是否正好落在关节谐振点附近）。
 * 未列出的其余问题（如效率查表标定、谐波减速器分段刚度曲线的完整实现等）请参考
 * 审计报告，视工作量单独排期。
 * ------------------------------------------------------------------
 */

import { RiskLevel } from '../types';
import { EvidenceType, ConfidenceLevel, RobotJointPatternId } from '../types/v4Models';
import { IssueInput } from '../types';
import { calculateTwoMassResonance } from '../utils/robotJointResonance';
import { sanitizePatternOutput } from '../utils/nanGuard';
import { readMeasuredNumber } from '../utils/unifiedStateExtractor';

export type { RobotJointPatternId };


export interface JointPatternOutputItem {
  id: RobotJointPatternId;
  name: string;
  triggered: boolean;
  corePhysicalChain: string;
  calculatedValues: Record<string, string | number>;
  riskLevel: RiskLevel;
  confidence: ConfidenceLevel;
  evidenceType: EvidenceType;
  vetoTriggered: boolean;
  vetoReason?: string;
  candidateMeasures: string[];
  sideEffects: string[];
  verificationItems: string[];
  unknownsToTest: string[];
}

export interface RobotJointEvaluationInput {
  gearRatio: number;                     // 减速比 i
  backlashArcmin: number;                // 减速器输出端实测背隙 (arcmin)
  requiredPositionAccuracyArcmin: number;// 客户/系统规格允许的关节输出定位误差 (arcmin)
  requiredRepeatabilityArcmin?: number;  // [NEW] 规格要求的重复定位精度 (arcmin)，与"准确度"分开判据
  transmissionErrorArcsec?: number;      // [NEW] 减速器传动误差/角传动误差 (arcsec，谐波减速器零背隙时常是主导项)
  outputTorqueNm: number;                // 当前工况关节输出扭矩 (Nm)
  torsionalStiffnessNmPerRad: number;    // 减速器/关节输出扭转刚度 (Nm/rad)，高扭矩段/额定刚度
  torsionalStiffnessLowTorqueNmPerRad?: number; // [NEW] 低扭矩段刚度 K1，谐波减速器刚度曲线通常分段
  torsionalStiffnessBreakpointNm?: number;      // [NEW] K1→K(额定) 的扭矩拐点
  velocityLoopBandwidthHz: number;       // 控制器速度环设定带宽 (Hz)
  motorInertiaKgm2: number;              // 电机转子惯量 (kg·m²)
  loadInertiaKgm2: number;               // 关节输出端连杆/负载惯量，折算前 (kg·m²)
  encoderType: 'SINGLE_TURN_ABS' | 'MULTI_TURN_ABS_BATTERY' | 'MULTI_TURN_ABS_BATTERYLESS' | 'INCREMENTAL';
  encoderBatteryVoltageV: number;        // 编码器后备电池当前电压
  encoderBatteryMinVoltageV: number;     // 编码器后备电池数据手册最低保数据电压
  encoderStandbyCurrentUa?: number;      // [NEW] 编码器断电保持模式下的静态电流 (μA)
  batteryRatedCapacityMah?: number;      // [NEW] 后备电池额定容量 (mAh)
  accumulatedPowerOffHours?: number;     // [NEW] 累计断电保持时长 (h)，用于库仑计数法估算剩余寿命
  regenPowerPeakW: number;               // 单次减速动能回馈母线峰值功率 (W)
  dutyCycleDecelPct: number;             // 一个工作周期内减速回馈阶段占比 (%)
  decelProfile?: 'RECTANGULAR' | 'TRAPEZOIDAL'; // [NEW] 减速功率曲线形状，影响峰值→均值折算系数
  busCapacitanceUf?: number;             // [NEW] 母线去耦/储能电容容量 (μF)
  busChopperOnVoltageV?: number;         // [NEW] 泄放斩波器开启电压阈值 (V)
  busVoltageNominalV?: number;           // [NEW] 母线标称电压 (V)，与上者一起估算电容单次可吸收能量
  brakingResistorRatedContinuousW: number;// 泄放电阻数据手册额定连续功率 (W)
  brakingResistorRatedPeakW: number;      // 泄放电阻数据手册额定峰值功率 (W)
  resistorThermalTauS?: number;          // [NEW] 泄放电阻热时间常数 (s)
  cycleTimeS?: number;                   // [NEW] 工作节拍周期 (s)，与热时间常数比较判断能否只看平均功率
  hasDedicatedTorqueSensor: boolean;      // 是否配有独立关节力矩传感器
  gearboxEfficiencyMinPct: number;        // 减速器全温/全速度区间最低效率 (%)（正向驱动）
  gearboxEfficiencyMaxPct: number;        // 减速器全温/全速度区间最高效率 (%)（正向驱动）
  gearboxBackdriveEfficiencyMinPct?: number; // [NEW] 反向驱动（负载拖动电机）最低效率 (%)，通常显著低于正驱
  breakawayFrictionTorqueNm?: number;    // [NEW] 冷态启动摩擦/油封阻力矩估计 (Nm)
  ktTempCoPctPer100C?: number;           // [NEW] 电机转矩常数 Kt 温度系数 (%/100℃)
  collaborativeSafetyRequired: boolean;   // 是否需满足协作/人机共融安全(功率与力限制等)
  stoImplementation: 'SOFTWARE_PWM_DISABLE_ONLY' | 'DUAL_CHANNEL_HW_STO' | 'SAFETY_MCU_WITH_HW_STO';
  requiredPerformanceLevel: 'PLc' | 'PLd' | 'PLe' | 'SIL2' | 'SIL3' | 'NONE' | 'UNDECLARED'; // [FIX] 新增 'UNDECLARED'
  stoCategory?: 'B' | '1' | '2' | '3' | '4';   // [NEW] ISO 13849-1 Category
  mttfdYears?: number;                    // [NEW] 单通道 MTTFd (年)
  dcAvgPct?: number;                      // [NEW] 平均诊断覆盖率 DCavg (%)
  ccfScorePoints?: number;                // [NEW] ISO 13849-1 Annex F 共因失效评分 (满分100，要求≥65)
  isGravityLoaded?: boolean;              // [NEW] 是否为重力/摆动负载轴（STO后负载会因重力运动）
  hasSafetyBrake?: boolean;               // [NEW] 是否配有安全抱闸(SBC)
  brakeEngageTimeMs?: number;             // [NEW] 抱闸动作时间 (ms)
  stoResponseTimeMs: number;              // STO 实测/规格响应时间 (ms)（注意与"运动停止时间"口径不同，见 J006 说明）
  requiredResponseTimeMs: number;         // 安全需求文档要求的响应时间上限 (ms)
  busProtocol: 'ETHERCAT_CoE' | 'CANOPEN_DS402' | 'CUSTOM_UART';
  busCycleTimeUs: number;                 // 现场总线通信周期 (μs)
  busJitterUs?: number;                   // [NEW] 总线周期抖动 (μs)
  busLoadPct?: number;                    // [NEW] 总线负载率 (%)，CANopen 等非确定性总线尤其重要
  localPositionLoopCycleUs: number;       // 本地位置/电流环周期 (μs)
  hasLocalInterpolation: boolean;         // 关节本地是否具备插补/前馈，缓冲总线周期与本地环路的耦合
  busLossFallbackStrategy: 'IMMEDIATE_STO' | 'RAMP_TO_ZERO' | 'HOLD_LAST_HALT' | 'NONE';
}

/**
 * 从工程输入自动派生关节评估参数：优先使用工程师在 measuredValues 中回填的结构化数值，
 * 其次从问题描述自由文本中做保守的关键词识别，最后落到有工程意义但明显保守的默认值，
 * 并通过 riskLevel/confidence 反映"默认值 ≠ 实测"这一点（不会把默认值伪装成高置信度结论）。
 *
 * [FIX-2] requiredPerformanceLevel 不再从自由文本正则推断：目标性能等级(PL/SIL)必须
 * 来自书面风险评估文档的结构化字段，而不是问题描述里出现了"PLd"这几个字符就断定。
 * 未在 measuredValues 中显式给出时，一律返回 'UNDECLARED'，由 J006 直接一票否决，
 * 而不是静默当作 'NONE'（不需要安全等级）放行。
 */
export function deriveRobotJointEvaluationInput(issue: IssueInput): RobotJointEvaluationInput {
  const mv = issue.measuredValues || {};
  // 统一读数原语：以前 Number('') === 0，会把「没填」读成「量到 0」。
  // 而 J004 判据是 avgRegenPowerW > brakingResistorRatedContinuousW，于是未填写会
  // 凭空造出一条「泄放电阻功率不足」的一票否决；J002 的电池裕量同理（0-0 <= 0.15）。
  // ''/null/空白 必须回落到 fallback(NaN)，不能变成 0。
  const num = (key: string, fallback: number): number => {
    const value = readMeasuredNumber(mv, key);
    return value === undefined ? fallback : value;
  };
  const numOpt = (key: string): number | undefined => {
    const raw = mv[key];
    if (raw === undefined || raw === null || raw === '') return undefined;
    const value = Number(raw);
    return Number.isFinite(value) ? value : undefined;
  };
  const bool = (key: string, fallback: boolean): boolean => {
    const raw = mv[key];
    if (raw === undefined || raw === null || raw === '') return fallback;
    const value = Number(raw);
    if (Number.isFinite(value)) return value !== 0;
    return /^(true|yes|是|有)$/i.test(String(raw));
  };
  const boolOpt = (key: string): boolean | undefined => {
    const raw = mv[key];
    if (raw === undefined || raw === null || raw === '') return undefined;
    const value = Number(raw);
    if (Number.isFinite(value)) return value !== 0;
    if (/^(true|yes|是|有)$/i.test(String(raw))) return true;
    if (/^(false|no|否|无)$/i.test(String(raw))) return false;
    return undefined;
  };
  const strOpt = <T extends string>(key: string): T | undefined => {
    const raw = mv[key];
    if (raw === undefined || raw === null || raw === '') return undefined;
    return String(raw) as T;
  };
  const text = [issue.requirement, issue.actualMeasurement, issue.testCondition, issue.environment, issue.failurePhenomenon, issue.engineeringConcern, issue.notes || ''].join(' ');

  let encoderType: RobotJointEvaluationInput['encoderType'] = 'MULTI_TURN_ABS_BATTERY';
  if (/无电池多圈|battery\s*-?less|抱式编码器/i.test(text)) encoderType = 'MULTI_TURN_ABS_BATTERYLESS';
  else if (/单圈绝对值/i.test(text)) encoderType = 'SINGLE_TURN_ABS';
  else if (/增量式编码器|incremental/i.test(text)) encoderType = 'INCREMENTAL';

  let stoImplementation: RobotJointEvaluationInput['stoImplementation'] = 'SOFTWARE_PWM_DISABLE_ONLY';
  if (/双通道.*硬件.*STO|dual[- ]?channel.*STO|硬件STO/i.test(text)) stoImplementation = 'DUAL_CHANNEL_HW_STO';
  else if (/安全MCU|safety\s*MCU|安全控制器/i.test(text)) stoImplementation = 'SAFETY_MCU_WITH_HW_STO';

  // [FIX-2] 不再从自由文本正则推断 PL/SIL。只认 measuredValues 里显式给出的结构化字段；
  // 缺失时明确标为 'UNDECLARED'，交给 J006 处理为一票否决，而不是默默当作 'NONE'。
  const requiredPerformanceLevel =
    strOpt<RobotJointEvaluationInput['requiredPerformanceLevel']>('requiredPerformanceLevel') || 'UNDECLARED';

  let busProtocol: RobotJointEvaluationInput['busProtocol'] = 'ETHERCAT_CoE';
  if (/CANopen|DS402/i.test(text)) busProtocol = 'CANOPEN_DS402';
  else if (/自定义串口|UART|自研协议/i.test(text)) busProtocol = 'CUSTOM_UART';

  let busLossFallbackStrategy: RobotJointEvaluationInput['busLossFallbackStrategy'] = 'NONE';
  if (/斜坡.*(?:降|到)\s*0|ramp[- ]?to[- ]?zero|平缓停止/i.test(text)) busLossFallbackStrategy = 'RAMP_TO_ZERO';
  else if (/保持.*位置|hold\s*last|抱闸保持/i.test(text)) busLossFallbackStrategy = 'HOLD_LAST_HALT';
  else if (/立即.*STO|急停断使能|immediate\s*STO/i.test(text)) busLossFallbackStrategy = 'IMMEDIATE_STO';

  return {
    gearRatio: num('gearRatio', NaN),
    backlashArcmin: num('backlashArcmin', NaN),
    requiredPositionAccuracyArcmin: num('requiredPositionAccuracyArcmin', NaN),
    requiredRepeatabilityArcmin: numOpt('requiredRepeatabilityArcmin'),
    transmissionErrorArcsec: numOpt('transmissionErrorArcsec'),
    outputTorqueNm: num('outputTorqueNm', NaN),
    torsionalStiffnessNmPerRad: num('torsionalStiffnessNmPerRad', NaN),
    torsionalStiffnessLowTorqueNmPerRad: numOpt('torsionalStiffnessLowTorqueNmPerRad'),
    torsionalStiffnessBreakpointNm: numOpt('torsionalStiffnessBreakpointNm'),
    velocityLoopBandwidthHz: num('velocityLoopBandwidthHz', NaN),
    motorInertiaKgm2: num('motorInertiaKgm2', NaN),
    loadInertiaKgm2: num('loadInertiaKgm2', NaN),
    encoderType,
    encoderBatteryVoltageV: num('encoderBatteryVoltageV', NaN),
    encoderBatteryMinVoltageV: num('encoderBatteryMinVoltageV', NaN),
    encoderStandbyCurrentUa: numOpt('encoderStandbyCurrentUa'),
    batteryRatedCapacityMah: numOpt('batteryRatedCapacityMah'),
    accumulatedPowerOffHours: numOpt('accumulatedPowerOffHours'),
    regenPowerPeakW: num('regenPowerPeakW', NaN),
    dutyCycleDecelPct: num('dutyCycleDecelPct', NaN),
    decelProfile: strOpt('decelProfile'),
    busCapacitanceUf: numOpt('busCapacitanceUf'),
    busChopperOnVoltageV: numOpt('busChopperOnVoltageV'),
    busVoltageNominalV: numOpt('busVoltageNominalV'),
    brakingResistorRatedContinuousW: num('brakingResistorRatedContinuousW', NaN),
    brakingResistorRatedPeakW: num('brakingResistorRatedPeakW', NaN),
    resistorThermalTauS: numOpt('resistorThermalTauS'),
    cycleTimeS: numOpt('cycleTimeS'),
    hasDedicatedTorqueSensor: bool('hasDedicatedTorqueSensor', false),
    gearboxEfficiencyMinPct: num('gearboxEfficiencyMinPct', NaN),
    gearboxEfficiencyMaxPct: num('gearboxEfficiencyMaxPct', NaN),
    gearboxBackdriveEfficiencyMinPct: numOpt('gearboxBackdriveEfficiencyMinPct'),
    breakawayFrictionTorqueNm: numOpt('breakawayFrictionTorqueNm'),
    ktTempCoPctPer100C: numOpt('ktTempCoPctPer100C'),
    collaborativeSafetyRequired: bool('collaborativeSafetyRequired', /协作机器人|人机共融|cobot|collaborative/i.test(text)),
    stoImplementation,
    requiredPerformanceLevel,
    stoCategory: strOpt('stoCategory'),
    mttfdYears: numOpt('mttfdYears'),
    dcAvgPct: numOpt('dcAvgPct'),
    ccfScorePoints: numOpt('ccfScorePoints'),
    isGravityLoaded: boolOpt('isGravityLoaded'),
    hasSafetyBrake: boolOpt('hasSafetyBrake'),
    brakeEngageTimeMs: numOpt('brakeEngageTimeMs'),
    stoResponseTimeMs: num('stoResponseTimeMs', NaN),
    requiredResponseTimeMs: num('requiredResponseTimeMs', NaN),
    busProtocol,
    busCycleTimeUs: num('busCycleTimeUs', NaN),
    busJitterUs: numOpt('busJitterUs'),
    busLoadPct: numOpt('busLoadPct'),
    localPositionLoopCycleUs: num('localPositionLoopCycleUs', NaN),
    hasLocalInterpolation: bool('hasLocalInterpolation', true),
    busLossFallbackStrategy,
  };
}

export function evaluateAllRobotJointPatterns(input: RobotJointEvaluationInput): JointPatternOutputItem[] {
  const patterns: JointPatternOutputItem[] = [];

  // ----------------------------------------------------
  // J001: 谐波/RV减速器背隙 + 扭转柔性 → 输出定位精度
  // ----------------------------------------------------
  // [FIX] 支持两段式刚度曲线（谐波减速器在低扭矩段刚度显著低于额定段），未提供分段
  // 参数时退化为原来的单一刚度假设。
  const useSegmentedStiffness =
    input.torsionalStiffnessLowTorqueNmPerRad !== undefined &&
    input.torsionalStiffnessBreakpointNm !== undefined &&
    input.torsionalStiffnessBreakpointNm > 0;
  let torsionalWindupRad = 0;
  if (useSegmentedStiffness && input.outputTorqueNm <= input.torsionalStiffnessBreakpointNm!) {
    torsionalWindupRad = input.torsionalStiffnessLowTorqueNmPerRad! > 0
      ? input.outputTorqueNm / input.torsionalStiffnessLowTorqueNmPerRad!
      : 0;
  } else if (useSegmentedStiffness) {
    // 拐点前按 K1 变形，拐点后的增量按额定 K 变形，两段相加
    const windupAtBreakpoint = input.torsionalStiffnessLowTorqueNmPerRad! > 0
      ? input.torsionalStiffnessBreakpointNm! / input.torsionalStiffnessLowTorqueNmPerRad!
      : 0;
    const extraTorque = input.outputTorqueNm - input.torsionalStiffnessBreakpointNm!;
    const extraWindup = input.torsionalStiffnessNmPerRad > 0 ? extraTorque / input.torsionalStiffnessNmPerRad : 0;
    torsionalWindupRad = windupAtBreakpoint + extraWindup;
  } else {
    torsionalWindupRad = input.torsionalStiffnessNmPerRad > 0 ? input.outputTorqueNm / input.torsionalStiffnessNmPerRad : 0;
  }
  const torsionalWindupArcmin = torsionalWindupRad * (180 / Math.PI) * 60;
  // 传动误差（谐波减速器每输入转两个周期的角度波动）与背隙、扭转柔性物理机制不同、
  // 但都是确定性/可重复的运动学误差，工程上通常线性叠加而非做统计合成。
  const transmissionErrorArcmin = (input.transmissionErrorArcsec || 0) / 60;
  const totalKinematicErrorArcmin = input.backlashArcmin + torsionalWindupArcmin + transmissionErrorArcmin;
  const j001Margin = input.requiredPositionAccuracyArcmin - totalKinematicErrorArcmin;
  const j001Veto = input.requiredPositionAccuracyArcmin > 0 && totalKinematicErrorArcmin > input.requiredPositionAccuracyArcmin;
  // 重复定位精度主要由背隙（迟滞/死区特性）决定，扭转柔性在同一负载方向下是可重复的确定性偏转，
  // 严格来说不计入重复性误差；这里给出一个单独的、更贴近 ISO 9283 RP 定义的估算供参考。
  const repeatabilityRelevantArcmin = input.backlashArcmin + transmissionErrorArcmin;
  const j001RepeatabilityMargin = input.requiredRepeatabilityArcmin !== undefined
    ? input.requiredRepeatabilityArcmin - repeatabilityRelevantArcmin
    : undefined;

  const j001CalculatedValues: Record<string, string | number> = {
    '减速比 i': input.gearRatio,
    '实测背隙 (arcmin)': input.backlashArcmin,
    '当前扭矩下扭转柔性附加误差 (arcmin)': Number(torsionalWindupArcmin.toFixed(2)),
    '传动误差附加项 (arcmin)': Number(transmissionErrorArcmin.toFixed(2)),
    '输出端运动学总误差估算 (arcmin，准确度口径)': Number(totalKinematicErrorArcmin.toFixed(2)),
    '规格要求定位精度 (arcmin)': input.requiredPositionAccuracyArcmin,
    '精度裕量 (arcmin)': Number(j001Margin.toFixed(2)),
  };
  if (useSegmentedStiffness) {
    j001CalculatedValues['刚度模型'] = `分段：K1=${input.torsionalStiffnessLowTorqueNmPerRad} Nm/rad (≤${input.torsionalStiffnessBreakpointNm} Nm)，K=${input.torsionalStiffnessNmPerRad} Nm/rad (以上)`;
  } else {
    j001CalculatedValues['刚度模型'] = `单一刚度假设 K=${input.torsionalStiffnessNmPerRad} Nm/rad（未提供分段刚度曲线，谐波减速器低扭矩段实际刚度通常更低）`;
  }
  if (j001RepeatabilityMargin !== undefined) {
    j001CalculatedValues['重复定位相关误差估算 (arcmin，背隙+传动误差口径)'] = Number(repeatabilityRelevantArcmin.toFixed(2));
    j001CalculatedValues['重复定位精度裕量 (arcmin)'] = Number(j001RepeatabilityMargin.toFixed(2));
  }

  patterns.push({
    id: 'J001',
    name: '谐波/RV减速器背隙+扭转柔性 → 关节输出定位精度与换向冲击 (Backlash & Torsional Compliance)',
    triggered: totalKinematicErrorArcmin > 0,
    corePhysicalChain: '减速器齿隙/柔轮弹性变形/传动误差 → 电机侧编码器读数与关节实际输出位置不一致 (Kinematic Error) → 负载换向瞬间空程冲击 → 低速爬行/超调、重复定位精度劣化。注意：背隙+传动误差主要影响重复性(RP)，扭转柔性是可重复的确定性偏转、主要影响准确度(AP)，ISO 9283 中两者是分开的指标',
    calculatedValues: j001CalculatedValues,
    riskLevel: j001Veto ? 'High' : (j001Margin < input.requiredPositionAccuracyArcmin * 0.2 ? 'Medium-High' : 'Low'),
    confidence: 'MEDIUM',
    evidenceType: 'CALCULATED',
    vetoTriggered: j001Veto,
    vetoReason: j001Veto
      ? `背隙+扭转柔性+传动误差估算总误差 (${totalKinematicErrorArcmin.toFixed(2)} arcmin) 已超出客户/系统规格允许的定位精度 (${input.requiredPositionAccuracyArcmin} arcmin)，仅靠电机侧编码器闭环无法满足要求！`
      : undefined,
    candidateMeasures: [
      '关节输出端加装第二编码器（Full-Closed-Loop 双编码器），直接闭环消除背隙与柔性引入的运动学误差',
      '选用更高等级（更小背隙）的谐波/RV减速器，或对现有减速器做预加载/研配降低背隙',
      '在控制算法中加入背隙补偿（换向死区补偿）与扭转柔性前馈模型，仅用单编码器时作为过渡方案',
    ],
    sideEffects: [
      '双编码器全闭环若安装同心度/联轴器刚性不足，反而会引入新的机械谐振与噪声',
      '更高精度减速器成本与交期通常显著上升，且并非所有型号都有现货备选',
      '纯软件背隙补偿在负载/温度变化时补偿量会漂移，需要定期在线辨识',
    ],
    verificationItems: [
      '锁定电机侧，缓慢正反向加载至额定扭矩，激光跟踪仪/高精度光栅尺测输出端角度，绘制背隙+柔性迟滞回线，同时可反推分段刚度曲线的两个斜率与拐点',
      '在典型工作节拍下做重复定位精度测试（正向/反向各接近多次），对比单/双编码器方案的实测分布，与本模型的"重复定位相关误差"分开核对',
    ],
    unknownsToTest: ['减速器背隙随使用寿命（磨损）的增长规律，及是否需要纳入定期维护校准'],
  });

  // ----------------------------------------------------
  // J002: 绝对值编码器供电/电池丢失 → 位置基准丢失
  // ----------------------------------------------------
  const j002IsBatteryDependent = input.encoderType === 'MULTI_TURN_ABS_BATTERY';
  const batteryMarginV = input.encoderBatteryVoltageV - input.encoderBatteryMinVoltageV;
  // [FIX-3] Li-SOCl2 一次电池放电曲线在寿命 90%+ 区间接近平坦，电压判据只能在寿命
  // 末期给出很短的预警窗口，且低温下内阻升高会让负载电压假性跌落造成误报。
  // 有条件时改用累计通电时长的库仑计数估算作为主判据。
  const hasCoulombData = j002IsBatteryDependent
    && input.encoderStandbyCurrentUa !== undefined && input.encoderStandbyCurrentUa > 0
    && input.batteryRatedCapacityMah !== undefined && input.batteryRatedCapacityMah > 0
    && input.accumulatedPowerOffHours !== undefined && input.accumulatedPowerOffHours >= 0;
  let remainingLifeHours: number | undefined;
  if (hasCoulombData) {
    // 0.7：无实测容量退化曲线时，对低温+老化的保守降额假设（非精确值，仅用于给出数量级判断）
    const usableCapacityUah = input.batteryRatedCapacityMah! * 1000 * 0.7;
    const consumedUah = input.accumulatedPowerOffHours! * input.encoderStandbyCurrentUa!;
    remainingLifeHours = Math.max(0, (usableCapacityUah - consumedUah) / input.encoderStandbyCurrentUa!);
  }
  const j002LowRemainingLife = remainingLifeHours !== undefined && remainingLifeHours < 720; // 少于约30天维保窗口
  const j002Veto = j002IsBatteryDependent && (hasCoulombData ? j002LowRemainingLife : batteryMarginV <= 0.15);

  const j002CalculatedValues: Record<string, string | number> = {
    '编码器类型': input.encoderType,
    '后备电池当前电压 (V)': j002IsBatteryDependent ? Number(input.encoderBatteryVoltageV.toFixed(2)) : 'N/A（非电池型）',
    '数据手册最低保数据电压 (V)': j002IsBatteryDependent ? input.encoderBatteryMinVoltageV : 'N/A',
    '电池电压裕量 (V，注意：对一次锂电池是滞后指标)': j002IsBatteryDependent ? Number(batteryMarginV.toFixed(2)) : 'N/A',
  };
  if (hasCoulombData) {
    j002CalculatedValues['库仑计数估算剩余寿命 (小时)'] = Number(remainingLifeHours!.toFixed(0));
    j002CalculatedValues['库仑计数估算剩余寿命 (天)'] = Number((remainingLifeHours! / 24).toFixed(1));
  } else if (j002IsBatteryDependent) {
    j002CalculatedValues['⚠ 数据缺口'] = '未提供编码器待机电流/电池容量/累计断电时长，当前仅能用电压裕量判据，对锂亚硫酰氯一次电池而言预警窗口可能很短甚至已经过晚';
  }

  patterns.push({
    id: 'J002',
    name: '多圈绝对值编码器供电/后备电池丢失 → 位置基准丢失与上电冲位风险 (Multi-Turn Absolute Position Loss)',
    triggered: j002IsBatteryDependent,
    corePhysicalChain: '编码器主供电跌落或多圈计数后备电池耗尽 → 断电期间圈数计数丢失 → 上电后编码器读数与真实机械位置错位 → 若无位置合理性校验直接使能运动，关节可能高速冲向错误目标位置。多圈编码器后备电池通常是锂亚硫酰氯一次电池，其放电曲线在寿命 90%+ 区间接近平坦后断崖式跌落，电压判据本质上是滞后指标',
    calculatedValues: j002CalculatedValues,
    riskLevel: j002Veto ? 'High' : (j002IsBatteryDependent ? 'Medium' : 'Low'),
    confidence: hasCoulombData ? 'HIGH' : (j002IsBatteryDependent ? 'MEDIUM' : 'MEDIUM'),
    evidenceType: hasCoulombData ? 'CALCULATED' : 'SPECIFICATION',
    vetoTriggered: j002Veto,
    vetoReason: j002Veto
      ? (hasCoulombData
        ? `按累计通电时长库仑计数估算，编码器后备电池剩余寿命 (${remainingLifeHours!.toFixed(0)}小时) 已低于安全维保窗口，存在断电后位置基准永久丢失的风险，上电前必须先做位置合理性校验！`
        : `多圈绝对值编码器后备电池电压裕量 (${batteryMarginV.toFixed(2)}V) 已逼近或跌破数据手册最低保数据电压，存在断电后位置基准永久丢失的风险，上电前必须先做位置合理性校验！`)
      : undefined,
    candidateMeasures: [
      '上电后先做"上电位置合理性校验"：与关节机械限位/断电前记录位置比较，超出阈值则强制进入低速回零/人工确认模式，禁止直接高速使能',
      '优先选用无电池多圈绝对值编码器（如磁编码器+齿轮减速计圈或 Wiegand 自发电式），从根本上消除电池维护窗口',
      '若必须用电池型编码器，建立基于累计通电时长（而非仅电压）的强制更换周期与低电量报警阈值，纳入设备点检表',
    ],
    sideEffects: ['无电池多圈编码器成本更高、部分厂商供货周期长；上电合理性校验会增加约100~500ms的开机自检时间'],
    verificationItems: [
      '人为断开编码器电池/供电并转动关节，验证上电后系统是否能正确识别"位置不可信"并拒绝直接高速使能',
      '在低温环境箱中对电池施加实际待机电流负载，实测电压曲线是否会出现假性跌落，标定真实的电压-剩余容量关系',
    ],
    unknownsToTest: ['编码器电池在设备实际存放/待机（非通电）状态下的自放电速率与真实更换周期；低温下电池内阻升高导致负载电压假性跌落的幅度'],
  });

  // ----------------------------------------------------
  // J003: 机械谐振 → 速度环带宽与陷波滤波器设计
  // ----------------------------------------------------
  // [FIX-1] 原代码把负载惯量折算到电机侧 (loadInertia / i²)，却直接乘以未折算的
  // 输出端刚度 torsionalStiffnessNmPerRad，两者不在同一参考系，导致谐振频率被
  // 高估约 i 倍（默认参数下：4134Hz vs 正确值 40.9Hz）。
  // 这条公式跟 scenarioDomainEngine.ts 的 ROBOT_JOINT 域是同一个物理量，之前两个
  // 文件各自独立实现过一次、各错一次；现在统一调用共享的 robotJointResonance.ts，
  // 避免"两处分别修一次、下次又分叉"。
  const resonanceCalc = calculateTwoMassResonance({
    torsionalStiffnessNmPerRad: input.torsionalStiffnessNmPerRad,
    motorInertiaKgm2: input.motorInertiaKgm2,
    loadInertiaKgm2: input.loadInertiaKgm2,
    gearRatio: input.gearRatio,
    velocityLoopBandwidthHz: input.velocityLoopBandwidthHz,
  });
  const motorInertiaReflectedKgm2 = resonanceCalc.motorInertiaReflectedToOutputKgm2;
  const resonanceFreqHz = resonanceCalc.resonanceFreqHz;
  const antiResonanceFreqHz = resonanceCalc.antiResonanceFreqHz;
  const inertiaRatio = resonanceCalc.inertiaRatio;
  const bandwidthIsolationRatio = resonanceCalc.bandwidthIsolationRatio;
  const j003HighRisk = resonanceCalc.isBandwidthInvadingResonance;
  // 合理性区间校验：真实关节谐振频率一般落在几赫兹到几百赫兹之间，超出此区间大概率
  // 是输入量纲/参考系错误（正是本次修复的那类 bug），而不是真实的物理结果。
  const j003OutOfPlausibleRange = resonanceFreqHz > 0 && !resonanceCalc.isPlausible;

  patterns.push({
    id: 'J003',
    name: '关节二质量谐振 → 速度环带宽侵入谐振区 (Two-Mass Resonance vs Velocity Loop Bandwidth)',
    triggered: resonanceFreqHz > 0,
    corePhysicalChain: '电机转子惯量与折算负载惯量经减速器扭转刚度构成二质量弹簧系统 → 谐振频率 f_res 与速度环带宽过近 → 闭环增益在谐振点激励振荡 → 关节啸叫/抖动/电流环过流保护频繁触发',
    calculatedValues: {
      '折算到输出侧的电机惯量 (kg·m²)': Number(motorInertiaReflectedKgm2.toFixed(6)),
      '输出侧负载惯量 (kg·m²)': Number(input.loadInertiaKgm2.toFixed(6)),
      '惯量比 J_load / J_motor_折算': Number(inertiaRatio.toFixed(2)),
      '估算机械谐振频率 f_res (Hz)': Number(resonanceFreqHz.toFixed(1)),
      '估算反谐振(陷波)频率 f_anti (Hz)': Number(antiResonanceFreqHz.toFixed(1)),
      '当前速度环带宽 (Hz)': input.velocityLoopBandwidthHz,
      '谐振/带宽隔离度 (倍)': Number(bandwidthIsolationRatio.toFixed(2)),
      '建议最小隔离度 (倍，无陷波滤波器时)': 3,
      ...(j003OutOfPlausibleRange
        ? { '⚠ 合理性提示': 'f_res 超出典型关节谐振频率范围(约3~300Hz)，请优先检查惯量/刚度的参考系与单位是否一致，而非直接采信该数值' }
        : {}),
    },
    riskLevel: j003OutOfPlausibleRange ? 'Medium-High' : (j003HighRisk ? 'Medium-High' : 'Low'),
    confidence: j003OutOfPlausibleRange ? 'MEDIUM' : 'MEDIUM',
    evidenceType: 'CALCULATED',
    vetoTriggered: false,
    candidateMeasures: [
      '在速度环反馈通路加入陷波滤波器 (Notch Filter)，中心频率对准实测谐振点，衰减谐振增益',
      '降低速度环带宽至谐振频率的 1/3~1/5（经验法则，非严格定理），牺牲一定动态响应换取稳定裕量；加陷波后可适当放宽',
      '提高关节结构/联轴器刚度，或减小反向间隙抑制能量在谐振点的积累（与 J001 联动治理）',
    ],
    sideEffects: ['降低带宽会使关节轨迹跟踪滞后增大，高速轨迹跟随误差上升；陷波滤波器参数需要针对每台关节实测标定，量产一致性调优工作量较大'],
    verificationItems: ['扫频法（Chirp）或敲击法激励关节输出端，用加速度计/电流环频谱分析仪实测真实谐振峰与反谐振谷，与理论估算值交叉验证'],
    unknownsToTest: ['关节在不同姿态（连杆角度变化导致等效惯量变化）下谐振频率的漂移范围'],
  });

  // ----------------------------------------------------
  // J004: 连续往复再生能量 → 泄放电阻连续热设计
  // ----------------------------------------------------
  // [FIX] 减速功率曲线形状会显著影响峰值→均值折算：矩形假设（原代码）在梯形/S型
  // 曲线下会明显高估平均功率约2倍，这里显式区分并要求调用方声明，而不是隐含假设矩形。
  const decelProfile = input.decelProfile || 'RECTANGULAR';
  const profileFactor = decelProfile === 'TRAPEZOIDAL' ? 0.5 : 1.0;
  const avgRegenPowerW = input.regenPowerPeakW * (input.dutyCycleDecelPct / 100) * profileFactor;
  const j004Veto = avgRegenPowerW > input.brakingResistorRatedContinuousW || input.regenPowerPeakW > input.brakingResistorRatedPeakW;

  // 母线电容能独立吸收多少能量（在斩波器动作之前），仅在给出真实的斩波阈值电压与
  // 标称母线电压时才计算，不用编造的比例系数去近似标称电压。
  let capAbsorbedEnergyJ: number | undefined;
  if (
    input.busCapacitanceUf !== undefined &&
    input.busChopperOnVoltageV !== undefined &&
    input.busVoltageNominalV !== undefined &&
    input.busChopperOnVoltageV > input.busVoltageNominalV
  ) {
    capAbsorbedEnergyJ =
      0.5 * (input.busCapacitanceUf * 1e-6) *
      (Math.pow(input.busChopperOnVoltageV, 2) - Math.pow(input.busVoltageNominalV, 2));
  }

  const j004CalculatedValues: Record<string, string | number> = {
    '单次减速峰值回馈功率 (W)': input.regenPowerPeakW,
    '一个周期内减速阶段占比 (%)': input.dutyCycleDecelPct,
    '减速功率曲线假设': decelProfile === 'TRAPEZOIDAL' ? '梯形/S型（均值≈峰值×占空比×0.5）' : '矩形（均值≈峰值×占空比，未声明曲线形状时的保守假设）',
    '估算平均回馈功率 (W)': Number(avgRegenPowerW.toFixed(1)),
    '泄放电阻额定连续功率 (W)': input.brakingResistorRatedContinuousW,
    '泄放电阻额定峰值功率 (W)': input.brakingResistorRatedPeakW,
    '连续功率裕量 (W)': Number((input.brakingResistorRatedContinuousW - avgRegenPowerW).toFixed(1)),
  };
  if (capAbsorbedEnergyJ !== undefined) {
    j004CalculatedValues['母线电容单次可吸收能量估算 (J，仅供参考)'] = Number(capAbsorbedEnergyJ.toFixed(2));
  }
  if (input.resistorThermalTauS !== undefined && input.cycleTimeS !== undefined) {
    j004CalculatedValues['泄放电阻热时间常数 τ (s) vs 节拍周期 (s)'] =
      `τ=${input.resistorThermalTauS}s, T_cycle=${input.cycleTimeS}s → ${
        input.cycleTimeS < input.resistorThermalTauS / 5
          ? '节拍远快于热时间常数，看平均功率合理'
          : '节拍与热时间常数接近，仅看平均功率可能不够，建议核算瞬时温升'
      }`;
  }

  patterns.push({
    id: 'J004',
    name: '连续往复动作再生能量 → 泄放电阻连续热过载 (Continuous Duty Regenerative Braking, 区别于车规单次急停)',
    triggered: Number.isFinite(input.regenPowerPeakW) && input.regenPowerPeakW > 0,
    corePhysicalChain: '车规急停制动是低频单次事件，而关节在协作作业中高频往复加减速 → 每次减速动能经逆变器回馈进母线 → 母线电容先吸收一部分，超出斩波阈值后泄放电阻(Brake Chopper)持续斩波耗散 → 平均功率若长期超出额定连续功率 → 电阻阻值漂移/绝缘老化/最终烧毁，且伴随母线过压保护频繁跳闸',
    calculatedValues: j004CalculatedValues,
    riskLevel: j004Veto ? 'High' : (avgRegenPowerW > input.brakingResistorRatedContinuousW * 0.7 ? 'Medium-High' : 'Low'),
    confidence: 'MEDIUM',
    evidenceType: 'CALCULATED',
    vetoTriggered: j004Veto,
    vetoReason: j004Veto
      ? `估算平均回馈功率 (${avgRegenPowerW.toFixed(1)}W) 超出泄放电阻额定连续功率 (${input.brakingResistorRatedContinuousW}W)，或单次峰值功率超出电阻额定峰值 (${input.brakingResistorRatedPeakW}W)，按典型作业节拍长期运行存在电阻过热失效与母线过压保护频繁跳闸风险！`
      : undefined,
    candidateMeasures: [
      '按实际作业节拍与真实减速曲线形状（而非车规单次急停假设的矩形功率）重新选型泄放电阻，核实连续功率而非仅看峰值功率',
      '评估多关节联动时母线是否可互相支援（一个关节回馈的能量被另一个关节加速消耗），降低对泄放电阻的依赖',
      '优化减速曲线（S型曲线/更长减速时间）降低瞬时回馈功率峰值，用时间换取热裕量',
    ],
    sideEffects: ['更大功率泄放电阻体积、成本与散热设计要求同步上升；延长减速时间会降低节拍效率，需与工艺节拍权衡'],
    verificationItems: ['按客户真实作业节拍连续运行不少于一个热稳态周期（电阻表面温度饱和），红外热像记录泄放电阻与周边元器件温升，并用示波器实测减速期间母线功率曲线形状，校核矩形/梯形假设是否成立'],
    unknownsToTest: ['多关节真实协同作业时母线能量互相支援的实际比例（不能仅按单关节独立台架数据外推）'],
  });

  // ----------------------------------------------------
  // J005: 力矩闭环误差链
  // ----------------------------------------------------
  const efficiencyBandPct = input.gearboxEfficiencyMaxPct - input.gearboxEfficiencyMinPct;
  const j005Veto = !input.hasDedicatedTorqueSensor && input.collaborativeSafetyRequired && efficiencyBandPct > 15;

  const j005CalculatedValues: Record<string, string | number> = {
    '是否配有独立力矩传感器': input.hasDedicatedTorqueSensor ? '是' : '否（纯电流估算）',
    '减速器正向驱动全温/全速度效率区间': `${input.gearboxEfficiencyMinPct}% ~ ${input.gearboxEfficiencyMaxPct}%`,
    '效率波动带宽（即力矩估算潜在误差带，仅正驱）': `${Number(efficiencyBandPct.toFixed(1))}%`,
    '是否需满足协作/人机共融安全': input.collaborativeSafetyRequired ? '是' : '否',
  };
  if (input.gearboxBackdriveEfficiencyMinPct !== undefined) {
    j005CalculatedValues['反向驱动(负载拖动电机)最低效率 (%)'] = input.gearboxBackdriveEfficiencyMinPct;
    j005CalculatedValues['⚠ 方向性提示'] = '反向驱动效率通常显著低于正驱，且误差方向相反，不能用同一个区间描述两个方向';
  } else {
    j005CalculatedValues['⚠ 数据缺口'] = '未提供反向驱动效率，碰撞/外力導入(负载拖动电机)工况下的力矩估算误差可能被低估';
  }
  if (input.breakawayFrictionTorqueNm !== undefined) {
    j005CalculatedValues['冷态启动摩擦/油封阻力矩估计 (Nm)'] = input.breakawayFrictionTorqueNm;
  }
  if (input.ktTempCoPctPer100C !== undefined) {
    j005CalculatedValues['电机 Kt 温度系数 (%/100℃)'] = input.ktTempCoPctPer100C;
  }

  patterns.push({
    id: 'J005',
    name: '力矩闭环误差链：电流估算力矩 vs 减速器效率漂移/力矩传感器 (Torque Estimation Confidence Chain)',
    triggered: input.hasDedicatedTorqueSensor === false || input.collaborativeSafetyRequired === true,
    corePhysicalChain: '若无独立力矩传感器，仅用 q 轴电流 × Kt × 减速比 估算关节输出力矩 → 误差链至少包含：电流采样零漂/增益误差、Kt随温度漂移、减速器效率随温度/转速/负载方向非线性变化（典型 65%~90%区间，且正驱/反驱不对称）、冷态摩擦与齿槽转矩 → 综合估算误差可达 ±15%~30%（未计入摩擦与Kt温漂时可能更保守） → 力控/柔顺控制或碰撞检测阈值失真。注意：本模块只覆盖到"关节输出力矩"这一层，ISO/TS 15066 约束的是末端接触力/压强，还需经雅可比与等效质量换算，力矩估算准确不等于接触力安全论证已完成',
    calculatedValues: j005CalculatedValues,
    riskLevel: j005Veto ? 'High' : (!input.hasDedicatedTorqueSensor ? 'Medium-High' : 'Low'),
    confidence: 'MEDIUM',
    evidenceType: input.hasDedicatedTorqueSensor ? 'MEASURED' : 'ENGINEERING_ASSUMPTION',
    vetoTriggered: j005Veto,
    vetoReason: j005Veto
      ? `本关节需满足协作/人机共融安全，但仅依赖电流估算力矩，减速器效率波动带宽 (${efficiencyBandPct.toFixed(1)}%) 远超碰撞检测/功率限制所需的置信度，存在低估碰撞力导致安全功能失效的风险！`
      : undefined,
    candidateMeasures: [
      '协作/人机共融场景加装独立关节力矩传感器（应变片/光电式），力矩闭环与安全功能均以传感器实测为准，电流估算仅作为诊断冗余',
      '若成本/结构限制无法加装传感器，至少建立分温度、分速度、分方向（正驱/反驱）的效率查表标定，缩小估算误差带并做保守裕量设计',
      '对电流采样链路（含相电流零漂、Kt随温度的漂移）与冷态摩擦单独做误差预算，不能只归因于减速器效率',
    ],
    sideEffects: ['独立力矩传感器增加成本、轴向安装空间与走线复杂度；效率查表标定需要覆盖大量工况点，标定工作量大且需定期复标（磨损后效率会变化）'],
    verificationItems: ['同一工况下同时记录电流估算力矩与外置基准力矩传感器读数，覆盖全温区、全速度区间、正反两个负载方向（含反向驱动），绘制误差带地图'],
    unknownsToTest: ['减速器润滑脂粘度随温度变化对效率的短期波动规律（冷启动 vs 热稳态），尤其是低温下冷态摩擦对小负载工况碰撞检测阈值的影响'],
  });

  // ----------------------------------------------------
  // J006: 安全扭矩关断 STO/SS1 通道独立性与响应时间
  // ----------------------------------------------------
  // [FIX-2] 三处关键的失效开路(fail-open)默认值改为失效闭锁(fail-closed)：
  //   1) requiredPerformanceLevel 未声明('UNDECLARED')时直接一票否决，而不是当作'NONE'放行；
  //   2) 声明了目标等级但没有 Category/MTTFd/DC/CCF 任一证据项时，同样一票否决——
  //      一个"双通道硬件STO"的实现方式名称本身不足以确立 PLd/PLe，ISO 13849-1 要
  //      Category + MTTFd + DCavg + CCF(≥65分) 四件事同时成立；
  //   3) 重力/摆动负载轴若声明了 isGravityLoaded=true 却没有安全抱闸，STO/SS1 后
  //      负载会在重力下运动，单纯切断转矩不等于安全停止。
  const j006PlUndeclared = input.requiredPerformanceLevel === 'UNDECLARED';
  const j006IndependenceViolation =
    !j006PlUndeclared &&
    input.stoImplementation === 'SOFTWARE_PWM_DISABLE_ONLY' &&
    input.requiredPerformanceLevel !== 'NONE';
  const j006RequiresRealPl = !j006PlUndeclared && input.requiredPerformanceLevel !== 'NONE';
  const j006CategoryEvidenceMissing =
    j006RequiresRealPl &&
    (input.stoCategory === undefined || input.mttfdYears === undefined || input.dcAvgPct === undefined || input.ccfScorePoints === undefined);
  const j006CcfInsufficient =
    j006RequiresRealPl && input.ccfScorePoints !== undefined && input.ccfScorePoints < 65;
  const j006TimingViolation = input.stoResponseTimeMs > input.requiredResponseTimeMs;
  const j006GravityNoBrake = input.isGravityLoaded === true && input.hasSafetyBrake !== true;
  const j006Veto =
    j006PlUndeclared ||
    j006IndependenceViolation ||
    j006CategoryEvidenceMissing ||
    j006CcfInsufficient ||
    j006TimingViolation ||
    j006GravityNoBrake;

  const j006CalculatedValues: Record<string, string | number> = {
    '当前 STO 实现方式': input.stoImplementation,
    '安全需求要求的性能等级': input.requiredPerformanceLevel === 'UNDECLARED' ? '未声明（视为不满足，需书面风险评估结论）' : input.requiredPerformanceLevel,
    'STO 响应时间口径说明': '本项通常指"力矩撤除"或"预驱禁止"响应时间，与"电流归零"、"运动完全停止"是三个不同的量；风险评估/安全距离(ISO 13855)约束的是最后一个，请确认下方数值的实际口径',
    'STO 实测/规格响应时间 (ms)': input.stoResponseTimeMs,
    '安全需求要求的响应时间上限 (ms)': input.requiredResponseTimeMs,
  };
  if (input.stoCategory !== undefined) j006CalculatedValues['ISO 13849-1 Category'] = input.stoCategory;
  if (input.mttfdYears !== undefined) j006CalculatedValues['单通道 MTTFd (年)'] = input.mttfdYears;
  if (input.dcAvgPct !== undefined) j006CalculatedValues['平均诊断覆盖率 DCavg (%)'] = input.dcAvgPct;
  if (input.ccfScorePoints !== undefined) j006CalculatedValues['共因失效评分 CCF (满分100，要求≥65)'] = input.ccfScorePoints;
  if (input.isGravityLoaded !== undefined) {
    j006CalculatedValues['是否为重力/摆动负载轴'] = input.isGravityLoaded ? '是' : '否';
    j006CalculatedValues['是否配有安全抱闸 SBC'] = input.hasSafetyBrake ? '是' : '否';
  } else {
    j006CalculatedValues['⚠ 数据缺口'] = '未声明该轴是否为重力/摆动负载轴；若是且无安全抱闸，STO/SS1 切断转矩后负载会在重力下运动，请补充声明';
  }

  const j006VetoReasons: string[] = [];
  if (j006PlUndeclared) j006VetoReasons.push('未声明目标性能等级(PL/SIL)——该值必须来自书面风险评估文档，不能默认视为"不需要安全等级"');
  if (j006IndependenceViolation) j006VetoReasons.push(`目标性能等级为 ${input.requiredPerformanceLevel}，但当前 STO 仅通过同一 MCU 软件禁止 PWM 实现，缺少硬件独立通道，不满足 IEC 61800-5-2 通道独立性要求`);
  if (j006CategoryEvidenceMissing) j006VetoReasons.push('声明了目标性能等级，但缺少 Category/MTTFd/DCavg/CCF 证据中的一项或多项——STO 实现方式的名称（如"双通道硬件STO"）本身不足以确立 PLd/PLe，需要完整的 ISO 13849-1 证据链');
  if (j006CcfInsufficient) j006VetoReasons.push(`共因失效评分 (${input.ccfScorePoints}) 低于 ISO 13849-1 Annex F 要求的 65 分，两个"独立"通道在共因失效意义上可能并不独立`);
  if (j006TimingViolation) j006VetoReasons.push(`STO 响应时间 (${input.stoResponseTimeMs}ms) 超出安全需求上限 (${input.requiredResponseTimeMs}ms)`);
  if (j006GravityNoBrake) j006VetoReasons.push('该轴为重力/摆动负载轴但未配备安全抱闸(SBC)，STO/SS1 切断转矩后负载会在重力作用下继续运动，不构成安全停止');

  patterns.push({
    id: 'J006',
    name: '安全扭矩关断 STO/SS1 通道独立性与响应时间 (Safe Torque Off Independence, 区别于车规ASIL软件互锁)',
    triggered: true,
    corePhysicalChain: '协作机器人/工业臂的安全功能 (STO/SS1/SS2/SLS, IEC 61800-5-2 + ISO 13849-1 / ISO 10218 / ISO-TS 15066) 要求达到目标性能等级(PLd/PLe/SIL2/SIL3)的双通道独立切断驱动使能，且性能等级本身由 Category + MTTFd + DCavg + CCF 共同决定，不能仅凭实现方式的名称判定；车规 ASIL 中常见的"软件互锁+看门狗"经验不能直接平移。垂直/摆动轴还需额外考虑：STO 只撤除转矩，不主动停止运动，重力负载会继续下坠/摆动，必须配合安全抱闸',
    calculatedValues: j006CalculatedValues,
    riskLevel: j006Veto ? 'High' : 'Low',
    confidence: 'HIGH',
    evidenceType: 'SPECIFICATION',
    vetoTriggered: j006Veto,
    vetoReason: j006Veto ? j006VetoReasons.join('；') + '，一票否决，不得以此状态进入人机共融现场！' : undefined,
    candidateMeasures: [
      '先取得书面风险评估结论，明确目标性能等级(PL/SIL)，再谈是否满足——不能反过来用"现在的实现方式"倒推等级',
      '采用双通道硬件 STO：两路独立逻辑（如预驱使能引脚 + 门极电源双重切断）分别切断功率级，任一通道单独动作即可安全断转矩，并提供 Category/MTTFd/DCavg/CCF 完整证据',
      '升级为集成安全功能的安全 MCU / 安全预驱方案，具备自诊断与通道交叉监控，满足 PLd/PLe 或 SIL2/SIL3 认证要求',
      '重力/摆动轴加装安全抱闸(SBC)，并明确定义 STO 与抱闸的动作时序',
      '将 STO 触发链路（急停按钮/安全PLC → 安全继电器/安全模块 → 驱动器 STO 输入）整体测时，并明确该时间对应"力矩撤除"还是"运动停止"',
    ],
    sideEffects: ['硬件双通道 STO 增加 BOM 与走线复杂度；安全 MCU 方案的开发与认证周期显著长于纯软件方案，需提前规划项目节点；加装安全抱闸增加成本与轴向空间'],
    verificationItems: [
      '故障注入：人为使一路 STO 通道失效，验证另一路是否仍能独立切断功率级；用示波器从安全输入触发沿到相电流归零、再到运动完全停止分别计时，明确区分三个不同口径',
      '共因失效审查：核对两个"独立"通道是否共用同一颗预驱IC、同一路栅极电源或同一时钟源',
    ],
    unknownsToTest: ['最终系统集成后（含安全PLC/安全继电器/抱闸机械动作时间）端到端的实测响应时间，不能只用驱动器数据手册标称值代替'],
  });

  // ----------------------------------------------------
  // J007: 现场总线周期与本地控制环耦合
  // ----------------------------------------------------
  const cycleRatio = input.localPositionLoopCycleUs > 0 ? input.busCycleTimeUs / input.localPositionLoopCycleUs : 0;
  const j007StepRisk = cycleRatio >= 8 && !input.hasLocalInterpolation;
  const j007FallbackMissing = input.busLossFallbackStrategy === 'NONE';
  // [FIX] 与 J003 的机械谐振频率联动：若总线台阶指令频率（或其低次谐波）恰好落在
  // 关节谐振点附近且本地又没有插补平滑，台阶指令本身就可能激起谐振，这是此前两个
  // pattern 各算各的、互不知情的一个真实耦合点。
  const busStepFreqHz = input.busCycleTimeUs > 0 ? 1e6 / input.busCycleTimeUs : 0;
  const j007ExcitesResonance =
    !input.hasLocalInterpolation && resonanceFreqHz > 0 && busStepFreqHz > 0 &&
    [1, 2, 3].some((h) => Math.abs(busStepFreqHz * h - resonanceFreqHz) / resonanceFreqHz < 0.2);
  const j007CanopenNonDeterministic =
    input.busProtocol === 'CANOPEN_DS402' && input.busLoadPct !== undefined && input.busLoadPct > 30;
  const j007Veto = j007FallbackMissing;

  const j007CalculatedValues: Record<string, string | number> = {
    '总线协议': input.busProtocol,
    '总线通信周期 (μs)': input.busCycleTimeUs,
    '本地位置/电流环周期 (μs)': input.localPositionLoopCycleUs,
    '周期比 (总线/本地环路)': Number(cycleRatio.toFixed(1)),
    '是否具备本地插补/前馈': input.hasLocalInterpolation ? '是' : '否',
    '总线丢包/断线降级策略': input.busLossFallbackStrategy,
  };
  if (input.busJitterUs !== undefined) {
    j007CalculatedValues['总线周期抖动 (μs)'] = input.busJitterUs;
    if (input.busJitterUs > input.busCycleTimeUs * 0.1) {
      j007CalculatedValues['⚠ 抖动提示'] = '抖动超过总线周期的10%，实践中往往比周期本身更影响控制稳定性，尤其在未做分布式时钟同步时';
    }
  }
  if (j007CanopenNonDeterministic) {
    j007CalculatedValues['⚠ CANopen 总线负载'] = `${input.busLoadPct}%，高负载下 CAN 总线仲裁延迟显著，"周期"本质上不再是确定性的`;
  }
  if (resonanceFreqHz > 0) {
    j007CalculatedValues['总线台阶基频 (Hz)'] = Number(busStepFreqHz.toFixed(1));
    j007CalculatedValues['与 J003 关节谐振频率的联动检查'] = j007ExcitesResonance
      ? `⚠ 总线台阶基频或其低次谐波落在关节谐振频率 (${resonanceFreqHz.toFixed(1)}Hz) 附近，且无本地插补，台阶指令本身可能激起谐振`
      : `未发现总线台阶基频/低次谐波与关节谐振频率 (${resonanceFreqHz.toFixed(1)}Hz) 显著重合`;
  }

  patterns.push({
    id: 'J007',
    name: '现场总线周期(EtherCAT/CANopen DS402)与本地控制环耦合 → 指令台阶化与丢包降级策略缺失',
    triggered: input.busCycleTimeUs > 0 || input.busLossFallbackStrategy === 'NONE',
    corePhysicalChain: '主站以总线周期下发目标位置/力矩指令 → 若总线周期远大于本地位置/电流环周期且缺少本地插补，指令在环路视角呈现台阶状 → 速度/加速度不连续引发转矩纹波与关节抖动，若台阶基频恰好靠近机械谐振点（见J003）则风险叠加；总线丢包/断线时若无预定义降级策略，存在失控风险；CANopen 等基于仲裁的总线在高负载下本身就不是严格确定性的',
    calculatedValues: j007CalculatedValues,
    riskLevel: j006Veto || j007Veto ? 'High' : (j007ExcitesResonance || j007CanopenNonDeterministic ? 'Medium-High' : (j007StepRisk ? 'Medium-High' : 'Low')),
    confidence: 'MEDIUM',
    evidenceType: 'CALCULATED',
    vetoTriggered: j007Veto,
    vetoReason: j007Veto
      ? '未定义总线丢包/断线时的本地降级策略（斜坡到零/保持/触发STO），一旦通信异常关节行为不可预测，属于功能安全空白，一票否决！降级策略还必须是系统级定义（单关节降级不能破坏其余关节的协调运动），而不能是每个关节各自的本地行为'
      : undefined,
    candidateMeasures: [
      '本地环路实现位置/速度插补（三次样条或梯形前馈），将总线周期的台阶指令平滑映射到更快的本地环路节拍，尤其当台阶基频靠近机械谐振点时',
      '明确定义并测试系统级的总线丢包/断线降级策略（如连续 N 个周期未收到有效帧则全系统统一执行斜坡减速到零，而非单关节各自处理，且 N 对应的降级动作耗时需落在 J006 的响应时间预算内）',
      '若周期比持续偏大，评估提升总线通信周期（如从 1ms 降至 250μs），CANopen 场景下同时评估总线负载率是否需要拆分网段',
    ],
    sideEffects: ['本地插补算法增加控制器计算负载与实现复杂度；缩短总线周期可能受限于主站/网络拓扑上限，涉及多关节联动时需统一评估'],
    verificationItems: ['人为在总线上注入丢包/延迟/断线，记录关节实际速度/位置曲线，验证是否严格按预定义的系统级策略降级而非依赖驱动器默认行为；扫描不同总线周期下关节电流环频谱，确认台阶激励与谐振的相关性'],
    unknownsToTest: ['多关节级联总线拓扑下，单一关节通信异常是否会通过总线反向影响其余关节的实时性'],
  });

  return patterns.map((p) => sanitizePatternOutput(p));
}
