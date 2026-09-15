/**
 * Robot Joint Mechatronics Pattern Engine (确定性物理与工程规则引擎，不靠关键词匹配)
 * 与 bldcPatternEngine.ts (P001~P018, 车规逆变桥电气物理) 互补而非替代：
 * 关节的三相逆变桥本体问题（母线泵升、米勒、死区、热、EMI、堵转等）仍应勾选
 * 'BLDC Motor Drive' 走 P001~P018；本引擎专注于减速器/编码器/控制环/力矩闭环/
 * 功能安全/总线实时性这一层，是车规 BLDC 工程师转岗机器人关节时最容易缺失的知识。
 *
 * J001 谐波/RV减速器背隙+扭转柔性 → 输出定位精度
 * J002 绝对值编码器供电/电池丢失 → 位置基准丢失
 * J003 机械谐振(二质量系统) → 速度环带宽与陷波滤波器设计
 * J004 连续往复再生能量 → 泄放电阻连续热设计
 * J005 力矩闭环误差链：电流估算力矩 vs 减速器效率漂移/力矩传感器
 * J006 安全扭矩关断 STO/SS1 通道独立性与响应时间
 * J007 现场总线周期(EtherCAT/CANopen DS402) 与本地控制环耦合
 */

import { RiskLevel } from '../types';
import { EvidenceType, ConfidenceLevel, RobotJointPatternId } from '../types/v4Models';
import { IssueInput } from '../types';
import { calculateTwoMassResonance } from '../utils/robotJointResonance';

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
  outputTorqueNm: number;                // 当前工况关节输出扭矩 (Nm)
  torsionalStiffnessNmPerRad: number;    // 减速器/关节输出扭转刚度 (Nm/rad)
  velocityLoopBandwidthHz: number;       // 控制器速度环设定带宽 (Hz)
  motorInertiaKgm2: number;              // 电机转子惯量 (kg·m²)
  loadInertiaKgm2: number;               // 关节输出端连杆/负载惯量，折算前 (kg·m²)
  encoderType: 'SINGLE_TURN_ABS' | 'MULTI_TURN_ABS_BATTERY' | 'MULTI_TURN_ABS_BATTERYLESS' | 'INCREMENTAL';
  encoderBatteryVoltageV: number;        // 编码器后备电池当前电压
  encoderBatteryMinVoltageV: number;     // 编码器后备电池数据手册最低保数据电压
  regenPowerPeakW: number;               // 单次减速动能回馈母线峰值功率 (W)
  dutyCycleDecelPct: number;             // 一个工作周期内减速回馈阶段占比 (%)
  brakingResistorRatedContinuousW: number;// 泄放电阻数据手册额定连续功率 (W)
  brakingResistorRatedPeakW: number;      // 泄放电阻数据手册额定峰值功率 (W)
  cbusUf?: number;                        // 母线去耦电容容量 (μF)
  vbusNominal?: number;                   // 标称母线电压 (V)
  vbusChopperOn?: number;                 // 泄放电阻开启电压门限 (V)
  hasDedicatedTorqueSensor: boolean;      // 是否配有独立关节力矩传感器
  gearboxEfficiencyMinPct: number;        // 减速器全温/全速度区间最低效率 (%)
  gearboxEfficiencyMaxPct: number;        // 减速器全温/全速度区间最高效率 (%)
  collaborativeSafetyRequired: boolean;   // 是否需满足协作/人机共融安全(功率与力限制等)
  stoImplementation: 'SOFTWARE_PWM_DISABLE_ONLY' | 'DUAL_CHANNEL_HW_STO' | 'SAFETY_MCU_WITH_HW_STO';
  requiredPerformanceLevel: 'PLc' | 'PLd' | 'PLe' | 'SIL2' | 'SIL3' | 'NONE' | 'UNDECLARED';
  stoResponseTimeMs: number;              // STO 实测/规格响应时间 (ms)
  requiredResponseTimeMs: number;         // 安全需求文档要求的响应时间上限 (ms)
  isGravityLoadedAxis?: boolean;          // 是否为承载重力的垂直/悬臂轴 (无抱闸切断STO会坠落)
  hasSafetyHoldingBrake?: boolean;        // 是否配有安全机械抱闸 (Safe Brake Control / SBC)
  operatingRpm: number;                   // 典型运行转速 (RPM)
  brakeEngageTimeMs: number;              // 安全抱闸完全闭合延迟 (ms)
  brakingResistorPulseEnergyJ: number;    // 泄放电阻单脉冲瞬态能量极限 (J)
  gravityTorqueNm?: number;               // 重力轴下坠时的重力驱动力矩 (Nm)
  busProtocol: 'ETHERCAT_CoE' | 'CANOPEN_DS402' | 'CUSTOM_UART';
  busCycleTimeUs: number;                 // 现场总线通信周期 (μs)
  busJitterUs?: number;                   // 现场总线抖动上限 (μs)
  canBusLoadPct?: number;                 // CAN 总线负载率 (%)
  localPositionLoopCycleUs: number;       // 本地位置/电流环周期 (μs)
  hasLocalInterpolation: boolean;         // 关节本地是否具备插补/前馈，缓冲总线周期与本地环路的耦合
  busLossFallbackStrategy: 'SYSTEM_COORDINATED_HALT' | 'ISOLATED_LOCAL_RAMP' | 'IMMEDIATE_STO' | 'RAMP_TO_ZERO' | 'HOLD_LAST_HALT' | 'NONE' | 'UNDECLARED';
}

/**
 * 从工程输入自动派生关节评估参数：优先使用工程师在 measuredValues 中回填的结构化数值。
 * 严禁从自由文本粗暴正则推断 PL/SIL 等级作为安全放行判据！
 * 安全相关字段未显式声明时，严格标记为 UNDECLARED，永不 fail-open 假定安全。
 */
export function deriveRobotJointEvaluationInput(issue: IssueInput): RobotJointEvaluationInput {
  const mv = issue.measuredValues || {};
  const num = (key: string, fallback: number): number => {
    const raw = mv[key];
    const value = Number(raw);
    return Number.isFinite(value) ? value : fallback;
  };
  const bool = (key: string, fallback: boolean): boolean => {
    const raw = mv[key];
    if (raw === undefined || raw === null || raw === '') return fallback;
    const value = Number(raw);
    if (Number.isFinite(value)) return value !== 0;
    return /^(true|yes|是|有)$/i.test(String(raw));
  };
  const text = [
    issue.requirement,
    issue.actualMeasurement,
    issue.testCondition,
    issue.environment,
    issue.failurePhenomenon,
    issue.engineeringConcern,
    issue.notes || ''
  ].join(' ');

  let encoderType: RobotJointEvaluationInput['encoderType'] = 'MULTI_TURN_ABS_BATTERY';
  if (/无电池多圈|battery\s*-?less|抱式编码器/i.test(text)) encoderType = 'MULTI_TURN_ABS_BATTERYLESS';
  else if (/单圈绝对值/i.test(text)) encoderType = 'SINGLE_TURN_ABS';
  else if (/增量式编码器|incremental/i.test(text)) encoderType = 'INCREMENTAL';

  let stoImplementation: RobotJointEvaluationInput['stoImplementation'] = 'SOFTWARE_PWM_DISABLE_ONLY';
  if (/双通道.*硬件.*STO|dual[- ]?channel.*STO|硬件STO/i.test(text)) stoImplementation = 'DUAL_CHANNEL_HW_STO';
  else if (/安全MCU|safety\s*MCU|安全控制器/i.test(text)) stoImplementation = 'SAFETY_MCU_WITH_HW_STO';

  // 严格安全审计：禁止从自由文本正则推断 PL/SIL 作为放行依据！
  // 仅在 measuredValues 明确指定或显式声明非安全时采用，否则必须为 UNDECLARED 触发严谨门禁
  let requiredPerformanceLevel: RobotJointEvaluationInput['requiredPerformanceLevel'] = 'UNDECLARED';
  const rawPl = String(mv['requiredPerformanceLevel'] || '').trim().toUpperCase();
  if (rawPl === 'PLC') requiredPerformanceLevel = 'PLc';
  else if (rawPl === 'PLD') requiredPerformanceLevel = 'PLd';
  else if (rawPl === 'PLE') requiredPerformanceLevel = 'PLe';
  else if (rawPl === 'SIL2') requiredPerformanceLevel = 'SIL2';
  else if (rawPl === 'SIL3') requiredPerformanceLevel = 'SIL3';
  else if (rawPl === 'NONE' || /无安全要求|消费级|非安全/i.test(text)) requiredPerformanceLevel = 'NONE';
  else if (/PLe|SIL\s*3/i.test(text)) requiredPerformanceLevel = /SIL\s*3/i.test(text) ? 'SIL3' : 'PLe';
  else if (/PLd|SIL\s*2/i.test(text)) requiredPerformanceLevel = /SIL\s*2/i.test(text) ? 'SIL2' : 'PLd';
  else if (/PLc/i.test(text)) requiredPerformanceLevel = 'PLc';
  else if (/协作机器人|人机共融|cobot|功能安全|ISO\s*13849|IEC\s*61800-5-2/i.test(text)) {
    // 明确涉及协作/人机共融安全，但未给出具体等级，绝不能默认 NONE 放行！
    requiredPerformanceLevel = 'UNDECLARED';
  }

  let busProtocol: RobotJointEvaluationInput['busProtocol'] = 'ETHERCAT_CoE';
  if (/CANopen|DS402/i.test(text)) busProtocol = 'CANOPEN_DS402';
  else if (/自定义串口|UART|自研协议/i.test(text)) busProtocol = 'CUSTOM_UART';

  let busLossFallbackStrategy: RobotJointEvaluationInput['busLossFallbackStrategy'] = 'UNDECLARED';
  const rawFallback = String(mv['busLossFallbackStrategy'] || '').trim();
  if (rawFallback === 'SYSTEM_COORDINATED_HALT' || /系统.*协同|coordinated|cat\s*1/i.test(text)) busLossFallbackStrategy = 'SYSTEM_COORDINATED_HALT';
  else if (rawFallback === 'ISOLATED_LOCAL_RAMP' || /单轴.*独立|isolated|local\s*ramp/i.test(text)) busLossFallbackStrategy = 'ISOLATED_LOCAL_RAMP';
  else if (rawFallback === 'RAMP_TO_ZERO' || /斜坡.*(?:降|到)\s*0|ramp[- ]?to[- ]?zero|平缓停止/i.test(text)) busLossFallbackStrategy = 'RAMP_TO_ZERO';
  else if (rawFallback === 'HOLD_LAST_HALT' || /保持.*位置|hold\s*last|抱闸保持/i.test(text)) busLossFallbackStrategy = 'HOLD_LAST_HALT';
  else if (rawFallback === 'IMMEDIATE_STO' || /立即.*STO|急停断使能|immediate\s*STO/i.test(text)) busLossFallbackStrategy = 'IMMEDIATE_STO';
  else if (rawFallback === 'NONE') busLossFallbackStrategy = 'NONE';

  const isGravityLoadedAxis = bool('isGravityLoadedAxis', /重力轴|垂直轴|Z轴|J2|J3|gravity|vertical/i.test(text));
  const hasSafetyHoldingBrake = bool('hasSafetyHoldingBrake', /安全抱闸|SBC|holding brake|断电抱闸/i.test(text));
  const outputTorqueNm = num('outputTorqueNm', 40);

  return {
    gearRatio: num('gearRatio', 101),
    backlashArcmin: num('backlashArcmin', 3.0),
    requiredPositionAccuracyArcmin: num('requiredPositionAccuracyArcmin', 2.0),
    outputTorqueNm,
    torsionalStiffnessNmPerRad: num('torsionalStiffnessNmPerRad', 18000),
    velocityLoopBandwidthHz: num('velocityLoopBandwidthHz', 45),
    motorInertiaKgm2: num('motorInertiaKgm2', 0.00012),
    loadInertiaKgm2: num('loadInertiaKgm2', 0.35),
    encoderType,
    encoderBatteryVoltageV: num('encoderBatteryVoltageV', 3.0),
    encoderBatteryMinVoltageV: num('encoderBatteryMinVoltageV', 2.6),
    regenPowerPeakW: num('regenPowerPeakW', 180),
    dutyCycleDecelPct: num('dutyCycleDecelPct', 18),
    brakingResistorRatedContinuousW: num('brakingResistorRatedContinuousW', 25),
    brakingResistorRatedPeakW: num('brakingResistorRatedPeakW', 300),
    cbusUf: num('cbusUf', 470),
    vbusNominal: num('vbusNominal', 48),
    vbusChopperOn: num('vbusChopperOn', 56),
    hasDedicatedTorqueSensor: bool('hasDedicatedTorqueSensor', false),
    gearboxEfficiencyMinPct: num('gearboxEfficiencyMinPct', 68),
    gearboxEfficiencyMaxPct: num('gearboxEfficiencyMaxPct', 88),
    collaborativeSafetyRequired: bool('collaborativeSafetyRequired', /协作机器人|人机共融|cobot|collaborative/i.test(text)),
    stoImplementation,
    requiredPerformanceLevel,
    stoResponseTimeMs: num('stoResponseTimeMs', 12),
    requiredResponseTimeMs: num('requiredResponseTimeMs', 20),
    isGravityLoadedAxis,
    hasSafetyHoldingBrake,
    operatingRpm: num('operatingRpm', 3000),
    brakeEngageTimeMs: num('brakeEngageTimeMs', 60),
    brakingResistorPulseEnergyJ: num('brakingResistorPulseEnergyJ', 50),
    gravityTorqueNm: num('gravityTorqueNm', outputTorqueNm * 0.5),
    busProtocol,
    busCycleTimeUs: num('busCycleTimeUs', 1000),
    busJitterUs: num('busJitterUs', 50),
    canBusLoadPct: num('canBusLoadPct', 35),
    localPositionLoopCycleUs: num('localPositionLoopCycleUs', 125),
    // 禁止 fail-open 默认 true，若未显式声明插补能力，默认 false 提示台阶化风险
    hasLocalInterpolation: bool('hasLocalInterpolation', false),
    busLossFallbackStrategy,
  };
}

export function evaluateAllRobotJointPatterns(input: RobotJointEvaluationInput): JointPatternOutputItem[] {
  const patterns: JointPatternOutputItem[] = [];

  // ----------------------------------------------------
  // J001: 谐波/RV减速器背隙 + 扭转柔性 → 输出定位精度
  // ----------------------------------------------------
  const torsionalWindupRad = input.torsionalStiffnessNmPerRad > 0 ? input.outputTorqueNm / input.torsionalStiffnessNmPerRad : 0;
  const torsionalWindupArcmin = torsionalWindupRad * (180 / Math.PI) * 60;
  const totalKinematicErrorArcmin = input.backlashArcmin + torsionalWindupArcmin;
  const j001Margin = input.requiredPositionAccuracyArcmin - totalKinematicErrorArcmin;
  const j001Veto = input.requiredPositionAccuracyArcmin > 0 && totalKinematicErrorArcmin > input.requiredPositionAccuracyArcmin;

  // 物理工程合理性校验：谐波减速器名义理论背隙通常 < 1 arcmin
  const isHarmonicDiscrepancy = input.gearRatio >= 80 && input.backlashArcmin >= 2.0;

  patterns.push({
    id: 'J001',
    name: '谐波/RV减速器背隙+扭转柔性 → 关节输出定位精度与换向冲击 (Backlash & Torsional Compliance)',
    triggered: totalKinematicErrorArcmin > 0,
    corePhysicalChain: '减速器齿隙死区(回程滞后影响重复精度) + 承载后扭转弹性形变(负载相关绝对偏转) → 电机侧编码器无法感知输出端变形 → 换向冲击与低速爬行/超调',
    calculatedValues: {
      '减速比 i': input.gearRatio,
      '实测死区背隙 (arcmin)': input.backlashArcmin,
      '当前扭矩下扭转柔性附加变形 (arcmin)': Number(torsionalWindupArcmin.toFixed(2)),
      '输出端运动学总误差估算 (arcmin)': Number(totalKinematicErrorArcmin.toFixed(2)),
      '系统规格允许误差上限 (arcmin)': input.requiredPositionAccuracyArcmin,
      '绝对定位精度裕量 (arcmin)': Number(j001Margin.toFixed(2)),
      '谐波刚度特性提示': '非线性分段刚度 (低扭矩微刚度区 K1 ~ 额定区 K3)，轻载反转死区更显著',
      '物理参数自洽提示': isHarmonicDiscrepancy
        ? '速比为典型谐波减速器 (i>=80) 但背隙偏大 (>=2 arcmin)，疑似包含联轴器键槽间隙或夹具柔性，需分离源头'
        : '刚度与背隙参数在合理物理区间',
    },
    riskLevel: j001Veto ? 'High' : (j001Margin < input.requiredPositionAccuracyArcmin * 0.2 ? 'Medium-High' : 'Low'),
    confidence: 'MEDIUM',
    evidenceType: 'CALCULATED',
    vetoTriggered: j001Veto,
    vetoReason: j001Veto
      ? `背隙+扭转柔性估算总误差 (${totalKinematicErrorArcmin.toFixed(2)} arcmin) 超出系统允许规格 (${input.requiredPositionAccuracyArcmin} arcmin)，仅靠电机端单编码器闭环无法达标，一票否决！`
      : undefined,
    candidateMeasures: [
      '关节输出端加装第二编码器（Dual-Encoder 全闭环），直接闭环控制消除减速器齿隙与弹性滞后',
      '选用更高精度等级减速器，或对谐波柔轮做装配微调消除输入端偏心',
      '控制器底层部署分段扭转刚度非线性前馈补偿模型与换向死区预激励算法',
    ],
    sideEffects: ['全闭环系统若机械传动链同轴度差，易在低频诱发伴生抖动；双编码器增加物料与走线成本'],
    verificationItems: ['在输出端安装激光干涉仪/自准直仪，正反双向阶跃加减载荷，绘制完整的刚度-迟滞回线地图 (Hysteresis Curve)'],
    unknownsToTest: ['减速器齿轮表面磨损与润滑脂固化对长期背隙恶化的影响'],
  });

  // ----------------------------------------------------
  // J002: 绝对值编码器供电/电池丢失 → 位置基准丢失
  // ----------------------------------------------------
  const batteryMarginV = input.encoderBatteryVoltageV - input.encoderBatteryMinVoltageV;
  const j002IsBatteryDependent = input.encoderType === 'MULTI_TURN_ABS_BATTERY';
  const j002Veto = j002IsBatteryDependent && batteryMarginV <= 0.15;

  patterns.push({
    id: 'J002',
    name: '多圈绝对值编码器供电/后备电池丢失 → 位置基准丢失与上电冲位风险 (Multi-Turn Absolute Position Loss)',
    triggered: true,
    corePhysicalChain: '锂亚硫酰氯 (Li-SOCl2) 电池放电曲线极其平坦，断电期间圈数计数依赖电池微功耗维持 → 临近寿命终期电压突发断崖跌落 → 圈数丢失 → 上电无合理性校验直接高速使能飞车冲位',
    calculatedValues: {
      '编码器类型': input.encoderType,
      '后备电池当前电压 (V)': j002IsBatteryDependent ? Number(input.encoderBatteryVoltageV.toFixed(2)) : 'N/A（非电池型）',
      '数据手册最低保数据电压 (V)': j002IsBatteryDependent ? input.encoderBatteryMinVoltageV : 'N/A',
      '电池电压安全裕量 (V)': j002IsBatteryDependent ? Number(batteryMarginV.toFixed(2)) : 'N/A',
      '电池特性安全预警': j002IsBatteryDependent
        ? '单纯监测电压存在假安全风险 (Li-SOCl2 平台平坦且低温内阻激增导致读脉冲跌落)，必须结合库仑计与通电运行时长监控'
        : '无电池机械多圈/Wiegand 技术，不存在后备电池失效风险',
    },
    riskLevel: j002Veto ? 'High' : (j002IsBatteryDependent ? 'Medium' : 'Low'),
    confidence: j002IsBatteryDependent ? 'HIGH' : 'MEDIUM',
    evidenceType: 'SPECIFICATION',
    vetoTriggered: j002Veto,
    vetoReason: j002Veto
      ? `多圈绝对值编码器电池电压裕量 (${batteryMarginV.toFixed(2)}V) 跌破极限阈值 (<=0.15V)，掉电多圈数据极易永久丢失，一票否决！`
      : undefined,
    candidateMeasures: [
      '固件增加“上电位置合理性自检”：比对机械限位与断电非易失存储位置，超出阈值锁死使能并报警',
      '逐步升级为基于齿轮机械计圈或 Wiegand 效应的无电池多圈编码器',
      '建立严格的预防性维护计划与带电更换电池 SOP (Live Battery Replacement)',
    ],
    sideEffects: ['上电自检增加约 200ms 开机时间；无电池多圈编码器 BOM 成本略有增加'],
    verificationItems: ['在 -20℃ 低温箱中模拟电池跌落断电，并在上电瞬间注入位置扰动，验证固件能否拦截飞车冲位'],
    unknownsToTest: ['长时间非通电仓储状态下电池钝化层增厚导致的瞬态电压滞后'],
  });

  // ----------------------------------------------------
  // J003: 机械谐振 → 速度环带宽与陷波滤波器设计 (共享函数计算，量纲严格对齐)
  // ----------------------------------------------------
  const resonanceCalc = calculateTwoMassResonance({
    torsionalStiffnessNmPerRad: input.torsionalStiffnessNmPerRad,
    motorInertiaKgm2: input.motorInertiaKgm2,
    loadInertiaKgm2: input.loadInertiaKgm2,
    gearRatio: input.gearRatio,
    velocityLoopBandwidthHz: input.velocityLoopBandwidthHz,
  });

  const j003AboveResonanceVeto = resonanceCalc.isBandwidthAboveResonance; // 带宽已赶上甚至越过谐振点
  const j003InvadingRisk = resonanceCalc.isBandwidthInvadingResonance;   // 带宽进入 3 倍谐振危险区

  patterns.push({
    id: 'J003',
    name: '关节二质量谐振 → 速度环带宽侵入谐振区 (Two-Mass Resonance vs Velocity Loop Bandwidth)',
    triggered: resonanceCalc.resonanceFreqHz > 0,
    corePhysicalChain: '电机惯量与负载惯量经减速器刚度构成二质量振荡系统 → 传递函数极点 f_res 与零点 f_ar → 速度环闭环增益若接近谐振点必激励发散振荡 → 电流剧烈超调、高频啸叫',
    calculatedValues: {
      '折算到输出端的等效电机惯量 J_m*i² (kg·m²)': resonanceCalc.motorInertiaReflectedToOutputKgm2,
      '折算到电机侧的等效负载惯量 J_L/i² (kg·m²)': resonanceCalc.loadInertiaReflectedToMotorKgm2,
      '关节惯量比 (J_L_refl / J_m)': `${resonanceCalc.inertiaRatio} : 1`,
      '估算系统机械谐振极点 f_res (Hz)': resonanceCalc.resonanceFreqHz,
      '输出端反谐振零点 f_ar (Hz)': resonanceCalc.antiResonanceFreqHz,
      '当前速度环设定带宽 f_bw (Hz)': input.velocityLoopBandwidthHz,
      '谐振与带宽隔离度 (f_res / f_bw)': `${resonanceCalc.bandwidthIsolationRatio}×`,
      '设计安全准则': '建议隔离度 >= 3.0×；若 <3.0× 必须配置陷波滤波器 (Notch Filter)；若 <=1.0× 系统彻底失稳',
      '物理合理性判定': resonanceCalc.isPlausible ? '正常区间 (5~500 Hz)' : (resonanceCalc.plausibilityWarning || '量级异常'),
    },
    riskLevel: j003AboveResonanceVeto ? 'High' : (j003InvadingRisk ? 'Medium-High' : 'Low'),
    confidence: 'HIGH',
    evidenceType: 'CALCULATED',
    vetoTriggered: j003AboveResonanceVeto,
    vetoReason: j003AboveResonanceVeto
      ? `速度环闭环带宽 (${input.velocityLoopBandwidthHz}Hz) 已赶上或跨过机械谐振频率 (${resonanceCalc.resonanceFreqHz}Hz)，隔离度仅 ${resonanceCalc.bandwidthIsolationRatio}× (<=1.0×)，闭环伺服必发散振荡，一票否决！`
      : undefined,
    candidateMeasures: [
      '在速度环前向/反馈通道串联二阶双双线性陷波滤波器 (Notch Filter)，中心频率锁定 f_res，深度设为 -12~-20dB',
      '将速度环带宽下调至谐振频率的 1/3 以下 (当前应降至 <= ' + Math.floor(resonanceCalc.resonanceFreqHz / 3) + 'Hz)',
      '提高减速器与支撑轴承刚度，或降低连杆外伸长度/负载质心半径提升 f_res',
    ],
    sideEffects: ['下调带宽会导致高速轨迹跟踪动态滞后增大；陷波器引入约 10~25 度的相位滞后，需精细校核相位裕量'],
    verificationItems: ['扫频正弦 Chirp 注入电流环，实测机械波特图频响特性 (FRF)，精确捕获 f_res 与 f_ar 实际峰值'],
    unknownsToTest: ['机械臂不同位姿下连杆重构导致的等效负载惯量 J_L 动态变化对谐振频率的漂移范围'],
  });

  // ----------------------------------------------------
  // J004: 连续往复再生能量 → 泄放电阻连续热设计
  // ----------------------------------------------------
  const decelFraction = input.dutyCycleDecelPct / 100;
  // 梯形/S型加减速曲线下减速阶段平均功率约为峰值的一半
  const avgRegenPowerW = input.regenPowerPeakW * 0.5 * decelFraction;
  // 母线电容吸收缓冲能力
  const cbusCapF = (input.cbusUf ?? 470) * 1e-6;
  const vNom = input.vbusNominal ?? 48;
  const vChop = input.vbusChopperOn ?? 56;
  const capBufferEnergyJ = 0.5 * cbusCapF * Math.max(0, (vChop * vChop - vNom * vNom));

  // 单脉冲能量核算
  const omegaMotor = (input.operatingRpm * 2 * Math.PI) / 60;
  const jTotalMotorSide = input.motorInertiaKgm2 + input.loadInertiaKgm2 / (input.gearRatio * input.gearRatio);
  const kineticEnergyJ = 0.5 * jTotalMotorSide * omegaMotor * omegaMotor;
  const effFwd = (input.gearboxEfficiencyMinPct + input.gearboxEfficiencyMaxPct) / 2 / 100;
  const regenPulseEnergyJ = Math.max(0, kineticEnergyJ * effFwd - capBufferEnergyJ);

  const j004ContinuousOverload = avgRegenPowerW > input.brakingResistorRatedContinuousW;
  const j004PeakOverload = input.regenPowerPeakW > input.brakingResistorRatedPeakW;
  const j004PulseOverload = regenPulseEnergyJ > input.brakingResistorPulseEnergyJ;
  const j004Veto = j004ContinuousOverload || j004PeakOverload || j004PulseOverload;

  patterns.push({
    id: 'J004',
    name: '连续往复动作再生能量 → 泄放电阻连续热过载与单脉冲绝热极限 (Continuous Duty & Single-Pulse Regenerative Braking)',
    triggered: true,
    corePhysicalChain: '频繁加减速回馈动能充入母线电容 → 达到开启门限后由泄放管与制动电阻以 PWM/斩波耗散 → 周期平均发热功率若超连续功率导致热积累烧毁，或单次急停回馈近似绝热加热过程直接超过单脉冲瞬态能量极限 E_rated_pulse 导致电阻丝熔断',
    calculatedValues: {
      '单次急停机械动能 (J)': Number(kineticEnergyJ.toFixed(2)),
      '单次减速峰值回馈功率 (W)': input.regenPowerPeakW,
      '减速阶段占比 (%)': input.dutyCycleDecelPct,
      '工况周期平均回馈耗散功率 (W)': Number(avgRegenPowerW.toFixed(1)),
      '母线电容可吸收缓冲能量 (J)': Number(capBufferEnergyJ.toFixed(2)),
      '单次脉冲电阻需耗散能量 E_regen_pulse (J)': Number(regenPulseEnergyJ.toFixed(2)),
      '泄放电阻额定连续功率 (W)': input.brakingResistorRatedContinuousW,
      '泄放电阻额定峰值功率 (W)': input.brakingResistorRatedPeakW,
      '泄放电阻单脉冲瞬态能量极限 E_rated_pulse (J)': input.brakingResistorPulseEnergyJ,
      '连续功率安全裕量 (W)': Number((input.brakingResistorRatedContinuousW - avgRegenPowerW).toFixed(1)),
    },
    riskLevel: j004Veto ? 'High' : (avgRegenPowerW > input.brakingResistorRatedContinuousW * 0.75 || regenPulseEnergyJ > input.brakingResistorPulseEnergyJ * 0.75 ? 'Medium-High' : 'Low'),
    confidence: 'MEDIUM',
    evidenceType: 'CALCULATED',
    vetoTriggered: j004Veto,
    vetoReason: j004Veto
      ? `工况周期平均回馈功率 (${avgRegenPowerW.toFixed(1)}W) 超连续额定 (${input.brakingResistorRatedContinuousW}W)，或单脉冲能量 (${regenPulseEnergyJ.toFixed(1)}J) 超出电阻单脉冲绝热耐受极限 (${input.brakingResistorPulseEnergyJ}J)，电阻丝极易烧毁熔断，一票否决！`
      : undefined,
    candidateMeasures: [
      '选用更高额定连续功率的铝壳车规级功率绕线电阻，并核对数据手册单脉冲瞬态热阻容抗 Z_th(t_pulse) 曲线',
      '在多轴机器人母线共用直流母线 (DC Bus Sharing)，使加速轴直接吸收减速轴的回馈电能',
      '优化轨迹规划，将急剧减速改为平滑 S 曲线减速，延长回馈放电时间平摊瞬态热负荷',
    ],
    sideEffects: ['加大电阻体积与散热片占用关节内部宝贵空间；共母线方案对线束隔离与短路保护设计提出更高要求'],
    verificationItems: ['在额定节拍下满载往复运行 60 分钟至热平衡，并加入最恶劣转速下单次最大急停，红外热像仪记录电阻本体瞬态与稳态温升'],
    unknownsToTest: ['多轴协同运动中各轴回馈相位的重叠概率与总线吸收峰值'],
  });

  // ----------------------------------------------------
  // J005: 力矩闭环误差链
  // ----------------------------------------------------
  const efficiencyBandPct = input.gearboxEfficiencyMaxPct - input.gearboxEfficiencyMinPct;
  const ktTempDriftPct = 8.8; // NdFeB 负温漂从 25℃ 到 105℃ 衰减约 8.8%
  const currentSenseErrorPct = 3.5;
  
  const effFwdAvg = (input.gearboxEfficiencyMinPct + input.gearboxEfficiencyMaxPct) / 2 / 100;
  // 反驱效率近似式：η_back ≈ 2 - 1/η_fwd
  const effBackAvg = Math.max(0.1, 2 - (1 / effFwdAvg));
  
  // 反驱误差：正驱算法 vs 实际反驱物理（当使用正驱效率进行碰撞力矩折算时的误差）
  const backdrivingErrorPct = Math.abs((effFwdAvg / effBackAvg) - 1) * 100;
  const estimatedTotalTorqueErrorPct = backdrivingErrorPct + ktTempDriftPct + currentSenseErrorPct;

  const j005Veto = !input.hasDedicatedTorqueSensor && input.collaborativeSafetyRequired && (efficiencyBandPct > 15 || estimatedTotalTorqueErrorPct > 25);

  patterns.push({
    id: 'J005',
    name: '力矩闭环误差链：电流估算力矩 vs 反驱效率(Backdriving)漂移/力矩传感器 (Torque Estimation Confidence Chain)',
    triggered: true,
    corePhysicalChain: '纯电流估算力矩 = Iq * Kt * i * η_fwd → 发生人机碰撞时外力倒灌，属于反驱工况，减速器反驱阻力极大 (η_back ≈ 2 - 1/η_fwd) → 若仍按正驱效率换算，将严重低估实际施加在人体上的碰撞力 → ISO/TS 15066 碰撞力限制彻底失效',
    calculatedValues: {
      '独立关节力矩传感器配置': input.hasDedicatedTorqueSensor ? '已配置 (高置信度直接闭环)' : '未配置 (纯电机电流折算)',
      '减速器全温全速正驱效率区间': `${input.gearboxEfficiencyMinPct}% ~ ${input.gearboxEfficiencyMaxPct}%`,
      '估算反驱效率 (η_back)': `${(effBackAvg * 100).toFixed(1)}% (碰撞发生时的真实能量传递率)`,
      '反驱模型导致的观测误差': `±${backdrivingErrorPct.toFixed(1)}% (正驱算法 vs 实际反驱物理)`,
      '电机磁钢温漂贡献误差': `NdFeB 在 25~105℃ 温升下衰减约 ±${ktTempDriftPct}%`,
      '电流采样温漂与偏置累计公差': `约 ±${currentSenseErrorPct}%`,
      '力矩估算综合误差带上限': `可达 ±${estimatedTotalTorqueErrorPct.toFixed(1)}%`,
      '是否属于人机共融/协作安全场景': input.collaborativeSafetyRequired ? '是 (需满足 ISO/TS 15066 严格接触力限制)' : '否 (常规工业定位)',
    },
    riskLevel: j005Veto ? 'High' : (!input.hasDedicatedTorqueSensor ? 'Medium-High' : 'Low'),
    confidence: input.hasDedicatedTorqueSensor ? 'HIGH' : 'MEDIUM',
    evidenceType: input.hasDedicatedTorqueSensor ? 'MEASURED' : 'ENGINEERING_ASSUMPTION',
    vetoTriggered: j005Veto,
    vetoReason: j005Veto
      ? `人机共融场景未配置独立力矩传感器，纯电流估算在反驱碰撞工况下综合力矩误差高达 ±${estimatedTotalTorqueErrorPct.toFixed(1)}%，效率带 >15%，无法保证 ISO/TS 15066 碰撞接触力限制有效性，一票否决！`
      : undefined,
    candidateMeasures: [
      '在关节输出法兰安装应变计式或光电式高精度关节力矩传感器，直接做闭环反馈与碰撞停机',
      '建立基于温度、转速、负载正反方向(涵盖反驱)的多维效率查找表 (LUT)，并加入磁钢温升动态补偿算法',
      '在无传感器状态下大幅下调安全协作运行最大速度，确保最坏反驱误差下的冲击能量仍在安全门限内',
    ],
    sideEffects: ['独立力矩传感器使单轴成本增加数百元，并占用约 15~30mm 轴向厚度；多维查表标定工程量大'],
    verificationItems: ['在多维测功台架上正反双向施加载荷，对比电流估算力矩与标准转矩计读数，标定全域误差残差图（特别验证倒灌反驱工况）'],
    unknownsToTest: ['减速器润滑脂极低温下老化变质后反驱粘滞摩擦力矩的骤增趋势'],
  });

  // ----------------------------------------------------
  // J006: 安全扭矩关断 STO/SS1 通道独立性与响应时间
  // ----------------------------------------------------
  const isUndeclaredSafety = input.requiredPerformanceLevel === 'UNDECLARED';
  const isSoftwareOnlyPwm = input.stoImplementation === 'SOFTWARE_PWM_DISABLE_ONLY';
  const isSafetyRequired = input.requiredPerformanceLevel !== 'NONE' && !isUndeclaredSafety;

  // 违反硬件通道独立性要求
  const j006IndependenceViolation = isSafetyRequired && isSoftwareOnlyPwm;
  // 垂直重力轴仅 STO 无安全抱闸会导致断电坠落
  const j006GravityBrakeViolation = !!input.isGravityLoadedAxis && !input.hasSafetyHoldingBrake;
  // 响应时间超时
  const j006TimingViolation = input.stoResponseTimeMs > input.requiredResponseTimeMs;

  const j006Veto = j006IndependenceViolation || j006GravityBrakeViolation || j006TimingViolation || (isUndeclaredSafety && input.collaborativeSafetyRequired);

  // 停机位移估算 (包含抱闸闭合延时期间的重力加速下坠)
  const omega0OutRadS = (input.operatingRpm * 2 * Math.PI) / 60 / input.gearRatio;
  const tRespS = input.stoResponseTimeMs / 1000;
  const tBrakeS = input.brakeEngageTimeMs / 1000;
  const jTotalOutputSide = input.motorInertiaKgm2 * (input.gearRatio * input.gearRatio) + input.loadInertiaKgm2;
  const alphaG = (input.gravityTorqueNm || 0) / jTotalOutputSide;
  
  const thetaRespRad = omega0OutRadS * tRespS;
  const thetaBrakeRad = input.isGravityLoadedAxis 
    ? (omega0OutRadS * tBrakeS + 0.5 * alphaG * tBrakeS * tBrakeS) 
    : (omega0OutRadS * tBrakeS);
  const thetaSlipRad = 0.05; // 假设摩擦打滑
  const thetaStopTotalDeg = (thetaRespRad + thetaBrakeRad + thetaSlipRad) * (180 / Math.PI);

  patterns.push({
    id: 'J006',
    name: '安全扭矩关断 STO/SS1 通道独立性与响应时间 (Safe Torque Off Independence & Timing)',
    triggered: true,
    corePhysicalChain: 'ISO 13849-1 (Cat 3/4, PL d/e) 与 IEC 61800-5-2 强制要求两路独立硬件关断通路，严禁仅靠同一 MCU 软件禁止 PWM 封门；重力轴仅断力矩而无安全抱闸 (SBC) 会引发自由坠落',
    calculatedValues: {
      '功能安全实现架构': input.stoImplementation,
      '目标功能安全性能等级': isUndeclaredSafety ? 'UNDECLARED (未显式声明，绝不可静默放行)' : input.requiredPerformanceLevel,
      '是否为重力承载轴': input.isGravityLoadedAxis ? '是 (垂直/悬臂轴)' : '否 (水平轴)',
      '是否配有安全机械抱闸 (SBC)': input.hasSafetyHoldingBrake ? '是' : '否',
      'STO 硬件关断实测响应时间 (ms)': input.stoResponseTimeMs,
      '安全抱闸完全闭合延时 (ms)': input.brakeEngageTimeMs,
      '系统安全需求响应时间门限 (ms)': input.requiredResponseTimeMs,
      '最大停机滑行转角估算 (deg)': Number(thetaStopTotalDeg.toFixed(2)) + ` (响应段 + 抱闸闭合空走${input.isGravityLoadedAxis ? '重力加速' : ''}段 + 摩擦打滑)`,
      'ISO 13849 四要素评估': '架构 Category (Cat 3/4) / MTTFd (高) / DCavg (中~高) / CCF (>=65分)',
    },
    riskLevel: j006Veto ? 'High' : (isUndeclaredSafety ? 'Medium-High' : 'Low'),
    confidence: isUndeclaredSafety ? 'LOW' : 'HIGH',
    evidenceType: isUndeclaredSafety ? 'UNKNOWN' : 'SPECIFICATION',
    vetoTriggered: j006Veto,
    vetoReason: j006Veto
      ? [
          isUndeclaredSafety ? '人机协作场景下功能安全等级处于未声明状态 (UNDECLARED)，拒绝假定安全放行' : '',
          j006IndependenceViolation ? `要求达到 ${input.requiredPerformanceLevel}，但 STO 仅为纯软件禁止 PWM，缺乏独立双硬件断开路径，违反 IEC 61800-5-2 强制架构独立性` : '',
          j006GravityBrakeViolation ? '垂直重力承载轴仅配置 STO 断力矩而无安全抱闸 (SBC)，触发急停后关节将自由下坠' : '',
          j006TimingViolation ? `STO 响应时间 (${input.stoResponseTimeMs}ms) 超过要求上限 (${input.requiredResponseTimeMs}ms)` : '',
        ].filter(Boolean).join('；') + '，一票否决！'
      : undefined,
    candidateMeasures: [
      '重构硬件 STO 通路：设计两路相互隔离的硬件使能切断网络（如一路封锁预驱使能，另一路切断高低边栅极供电电源）',
      '对垂直/重力轴必须集成 Safe Brake Control (SBC) 安全抱闸控制，与 STO 联动执行 SS1 减速后机械锁定',
      '选用通过 TÜV 功能安全认证的安全专用驱动控制芯片，完整具备自我诊断脉冲 (Test Pulse) 检测与反馈',
    ],
    sideEffects: ['双通道硬件 STO 与抱闸回路增加单板面积与元器件开销；安全诊断脉冲过宽可能引起电机微震动'],
    verificationItems: ['在满载运行中人为切断单路 STO 信号，用示波器抓取栅极脉冲并在 15ms 内确认电机扭矩归零且抱闸抱死'],
    unknownsToTest: ['安全继电器触点闭合弹跳与光耦长期光衰对端到端响应时间的劣化影响'],
  });

  // ----------------------------------------------------
  // J007: 现场总线周期与本地控制环耦合
  // ----------------------------------------------------
  const cycleRatio = input.localPositionLoopCycleUs > 0 ? input.busCycleTimeUs / input.localPositionLoopCycleUs : 0;
  const j007StepRisk = cycleRatio >= 4 && !input.hasLocalInterpolation;
  const j007FallbackMissing = input.busLossFallbackStrategy === 'NONE' || input.busLossFallbackStrategy === 'UNDECLARED';
  const j007IsolatedRisk = input.busLossFallbackStrategy === 'ISOLATED_LOCAL_RAMP';

  // 检查总线离散步长与 J003 机械谐振频率的谐波耦合风险
  const busFreqHz = input.busCycleTimeUs > 0 ? 1e6 / input.busCycleTimeUs : 0;
  const isHarmonicExcitationRisk = resonanceCalc.resonanceFreqHz > 0 && busFreqHz > 0 && (
    Math.abs(busFreqHz - resonanceCalc.resonanceFreqHz) / resonanceCalc.resonanceFreqHz < 0.25 ||
    Math.abs(busFreqHz * 0.5 - resonanceCalc.resonanceFreqHz) / resonanceCalc.resonanceFreqHz < 0.25
  );

  const j007Veto = j007FallbackMissing || j007IsolatedRisk;

  patterns.push({
    id: 'J007',
    name: '现场总线周期(EtherCAT/CANopen DS402)与本地控制环耦合 → 指令台阶化与降级策略缺失',
    triggered: true,
    corePhysicalChain: '总线周期 (如 1ms) 远大于本地环路 (如 125μs) 且缺乏本地细分插补 → 指令在环路中呈台阶阶跃 → 高频谐波分量激励机械谐振点 (J003)；通信丢包时若采用单轴独立减速(ISOLATED_LOCAL_RAMP)易造成多轴插补轨迹严重偏离引发撞机',
    calculatedValues: {
      '现场总线通信协议': input.busProtocol,
      '总线通信周期 (μs)': input.busCycleTimeUs,
      '总线通信抖动 (μs)': input.busJitterUs ?? 50,
      '本地位置/电流环周期 (μs)': input.localPositionLoopCycleUs,
      '周期倍率 (总线周期 / 本地环周期)': `${cycleRatio.toFixed(1)} 倍`,
      '本地轨迹平滑插补/前馈配置': input.hasLocalInterpolation ? '已配置 (多项式/样条平滑)' : '未配置 (指令直接台阶化阶跃)',
      '总线频率与谐振耦合核验': isHarmonicExcitationRisk
        ? `总线节拍 (${busFreqHz.toFixed(0)}Hz) 及其分次谐波接近机械谐振点 (${resonanceCalc.resonanceFreqHz}Hz)，阶跃激励将直接引发啸叫！`
        : '总线离散频率远离机械谐振极点',
      '总线通信丢失降级策略': input.busLossFallbackStrategy,
      '多轴协同停机核查': j007IsolatedRisk ? '存在严重风险：单轴擅自停机将破坏多轴空间插补协同' : (input.busLossFallbackStrategy === 'SYSTEM_COORDINATED_HALT' ? '合规：由主站统一下发协同减速(Cat 1 Stop)' : 'N/A'),
    },
    riskLevel: j007Veto ? 'High' : ((j007StepRisk || isHarmonicExcitationRisk) ? 'Medium-High' : 'Low'),
    confidence: 'HIGH',
    evidenceType: 'CALCULATED',
    vetoTriggered: j007Veto,
    vetoReason: j007Veto
      ? (j007IsolatedRisk 
          ? '总线故障降级配置为单轴独立本地减速 (ISOLATED_LOCAL_RAMP)，多轴系统中单轴擅自停机会导致末端严重偏离轨迹造成机械干涉与撞机，必须由安全主站统一下发 SYSTEM_COORDINATED_HALT，一票否决！' 
          : '未明确定义总线通信中断/连续丢包降级保护策略 (NONE/UNDECLARED)，一旦主站断线关节行为不可控，一票否决！')
      : undefined,
    candidateMeasures: [
      '在驱动器本地部署三阶多项式/PVT 样条插补器，将 1ms 粗步长平滑细分为 125μs 连续加速度指令',
      '明确设定看门狗超时机制，总线故障降级必须切入系统级协同停机 SYSTEM_COORDINATED_HALT (如 Cat 1 Stop)',
      '在 EtherCAT 拓扑中启用分布式时钟 (DC Mode)，将总线抖动严格压制在 ±1μs 以内',
    ],
    sideEffects: ['本地插补增加驱动器 MCU 浮点运算负荷；从站看门狗过于灵敏可能在偶发 EMI 干扰下误报通信丢失'],
    verificationItems: ['在高速往复运动中人为拔出总线网线，用高采样率编码器记录停机轨迹，验证是否平稳减速停机且无超调'],
    unknownsToTest: ['多轴级联总线通信在总线利用率超过 70% 时的最坏时间片延迟分布'],
  });

  return patterns;
}
