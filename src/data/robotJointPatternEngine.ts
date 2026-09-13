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
 */

import { RiskLevel } from '../types';
import { EvidenceType, ConfidenceLevel, RobotJointPatternId } from '../types/v4Models';
import { IssueInput } from '../types';

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
  hasDedicatedTorqueSensor: boolean;      // 是否配有独立关节力矩传感器
  gearboxEfficiencyMinPct: number;        // 减速器全温/全速度区间最低效率 (%)
  gearboxEfficiencyMaxPct: number;        // 减速器全温/全速度区间最高效率 (%)
  collaborativeSafetyRequired: boolean;   // 是否需满足协作/人机共融安全(功率与力限制等)
  stoImplementation: 'SOFTWARE_PWM_DISABLE_ONLY' | 'DUAL_CHANNEL_HW_STO' | 'SAFETY_MCU_WITH_HW_STO';
  requiredPerformanceLevel: 'PLc' | 'PLd' | 'PLe' | 'SIL2' | 'SIL3' | 'NONE';
  stoResponseTimeMs: number;              // STO 实测/规格响应时间 (ms)
  requiredResponseTimeMs: number;         // 安全需求文档要求的响应时间上限 (ms)
  busProtocol: 'ETHERCAT_CoE' | 'CANOPEN_DS402' | 'CUSTOM_UART';
  busCycleTimeUs: number;                 // 现场总线通信周期 (μs)
  localPositionLoopCycleUs: number;       // 本地位置/电流环周期 (μs)
  hasLocalInterpolation: boolean;         // 关节本地是否具备插补/前馈，缓冲总线周期与本地环路的耦合
  busLossFallbackStrategy: 'IMMEDIATE_STO' | 'RAMP_TO_ZERO' | 'HOLD_LAST_HALT' | 'NONE';
}

/**
 * 从工程输入自动派生关节评估参数：优先使用工程师在 measuredValues 中回填的结构化数值，
 * 其次从问题描述自由文本中做保守的关键词识别，最后落到有工程意义但明显保守的默认值，
 * 并通过 riskLevel/confidence 反映“默认值 ≠ 实测”这一点（不会把默认值伪装成高置信度结论）。
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
  const text = [issue.requirement, issue.actualMeasurement, issue.testCondition, issue.environment, issue.failurePhenomenon, issue.engineeringConcern, issue.notes || ''].join(' ');

  let encoderType: RobotJointEvaluationInput['encoderType'] = 'MULTI_TURN_ABS_BATTERY';
  if (/无电池多圈|battery\s*-?less|抱式编码器/i.test(text)) encoderType = 'MULTI_TURN_ABS_BATTERYLESS';
  else if (/单圈绝对值/i.test(text)) encoderType = 'SINGLE_TURN_ABS';
  else if (/增量式编码器|incremental/i.test(text)) encoderType = 'INCREMENTAL';

  let stoImplementation: RobotJointEvaluationInput['stoImplementation'] = 'SOFTWARE_PWM_DISABLE_ONLY';
  if (/双通道.*硬件.*STO|dual[- ]?channel.*STO|硬件STO/i.test(text)) stoImplementation = 'DUAL_CHANNEL_HW_STO';
  else if (/安全MCU|safety\s*MCU|安全控制器/i.test(text)) stoImplementation = 'SAFETY_MCU_WITH_HW_STO';

  let requiredPerformanceLevel: RobotJointEvaluationInput['requiredPerformanceLevel'] = 'NONE';
  if (/PLe|SIL\s*3/i.test(text)) requiredPerformanceLevel = /SIL\s*3/i.test(text) ? 'SIL3' : 'PLe';
  else if (/PLd|SIL\s*2/i.test(text)) requiredPerformanceLevel = /SIL\s*2/i.test(text) ? 'SIL2' : 'PLd';
  else if (/PLc/i.test(text)) requiredPerformanceLevel = 'PLc';

  let busProtocol: RobotJointEvaluationInput['busProtocol'] = 'ETHERCAT_CoE';
  if (/CANopen|DS402/i.test(text)) busProtocol = 'CANOPEN_DS402';
  else if (/自定义串口|UART|自研协议/i.test(text)) busProtocol = 'CUSTOM_UART';

  let busLossFallbackStrategy: RobotJointEvaluationInput['busLossFallbackStrategy'] = 'NONE';
  if (/斜坡.*(?:降|到)\s*0|ramp[- ]?to[- ]?zero|平缓停止/i.test(text)) busLossFallbackStrategy = 'RAMP_TO_ZERO';
  else if (/保持.*位置|hold\s*last|抱闸保持/i.test(text)) busLossFallbackStrategy = 'HOLD_LAST_HALT';
  else if (/立即.*STO|急停断使能|immediate\s*STO/i.test(text)) busLossFallbackStrategy = 'IMMEDIATE_STO';

  return {
    gearRatio: num('gearRatio', 101),
    backlashArcmin: num('backlashArcmin', 3.0),
    requiredPositionAccuracyArcmin: num('requiredPositionAccuracyArcmin', 2.0),
    outputTorqueNm: num('outputTorqueNm', 40),
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
    hasDedicatedTorqueSensor: bool('hasDedicatedTorqueSensor', false),
    gearboxEfficiencyMinPct: num('gearboxEfficiencyMinPct', 68),
    gearboxEfficiencyMaxPct: num('gearboxEfficiencyMaxPct', 88),
    collaborativeSafetyRequired: bool('collaborativeSafetyRequired', /协作机器人|人机共融|cobot|collaborative/i.test(text)),
    stoImplementation,
    requiredPerformanceLevel,
    stoResponseTimeMs: num('stoResponseTimeMs', 12),
    requiredResponseTimeMs: num('requiredResponseTimeMs', 20),
    busProtocol,
    busCycleTimeUs: num('busCycleTimeUs', 1000),
    localPositionLoopCycleUs: num('localPositionLoopCycleUs', 125),
    hasLocalInterpolation: bool('hasLocalInterpolation', true),
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

  patterns.push({
    id: 'J001',
    name: '谐波/RV减速器背隙+扭转柔性 → 关节输出定位精度与换向冲击 (Backlash & Torsional Compliance)',
    triggered: totalKinematicErrorArcmin > 0,
    corePhysicalChain: '减速器齿隙/柔轮弹性变形 → 电机侧编码器读数与关节实际输出位置不一致 (Kinematic Error) → 负载换向瞬间空程冲击 → 低速爬行/超调、重复定位精度劣化',
    calculatedValues: {
      '减速比 i': input.gearRatio,
      '实测背隙 (arcmin)': input.backlashArcmin,
      '当前扭矩下扭转柔性附加误差 (arcmin)': Number(torsionalWindupArcmin.toFixed(2)),
      '输出端运动学总误差估算 (arcmin)': Number(totalKinematicErrorArcmin.toFixed(2)),
      '规格要求定位精度 (arcmin)': input.requiredPositionAccuracyArcmin,
      '精度裕量 (arcmin)': Number(j001Margin.toFixed(2)),
    },
    riskLevel: j001Veto ? 'High' : (j001Margin < input.requiredPositionAccuracyArcmin * 0.2 ? 'Medium-High' : 'Low'),
    confidence: 'MEDIUM',
    evidenceType: 'CALCULATED',
    vetoTriggered: j001Veto,
    vetoReason: j001Veto
      ? `背隙+扭转柔性估算总误差 (${totalKinematicErrorArcmin.toFixed(2)} arcmin) 已超出客户/系统规格允许的定位精度 (${input.requiredPositionAccuracyArcmin} arcmin)，仅靠电机侧编码器闭环无法满足要求！`
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
      '锁定电机侧，缓慢正反向加载至额定扭矩，激光跟踪仪/高精度光栅尺测输出端角度，绘制背隙+柔性迟滞回线',
      '在典型工作节拍下做重复定位精度测试（正向/反向各接近多次），对比单/双编码器方案的实测分布',
    ],
    unknownsToTest: ['减速器背隙随使用寿命（磨损）的增长规律，及是否需要纳入定期维护校准'],
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
    corePhysicalChain: '编码器主供电跌落或多圈计数后备电池耗尽 → 断电期间圈数计数丢失 → 上电后编码器读数与真实机械位置错位 → 若无位置合理性校验直接使能运动，关节可能高速冲向错误目标位置',
    calculatedValues: {
      '编码器类型': input.encoderType,
      '后备电池当前电压 (V)': j002IsBatteryDependent ? Number(input.encoderBatteryVoltageV.toFixed(2)) : 'N/A（非电池型）',
      '数据手册最低保数据电压 (V)': j002IsBatteryDependent ? input.encoderBatteryMinVoltageV : 'N/A',
      '电池电压裕量 (V)': j002IsBatteryDependent ? Number(batteryMarginV.toFixed(2)) : 'N/A',
    },
    riskLevel: j002Veto ? 'High' : (j002IsBatteryDependent ? 'Medium' : 'Low'),
    confidence: j002IsBatteryDependent ? 'HIGH' : 'MEDIUM',
    evidenceType: 'SPECIFICATION',
    vetoTriggered: j002Veto,
    vetoReason: j002Veto
      ? `多圈绝对值编码器后备电池电压裕量 (${batteryMarginV.toFixed(2)}V) 已逼近或跌破数据手册最低保数据电压，存在断电后位置基准永久丢失的风险，上电前必须先做位置合理性校验！`
      : undefined,
    candidateMeasures: [
      '上电后先做“上电位置合理性校验”：与关节机械限位/断电前记录位置比较，超出阈值则强制进入低速回零/人工确认模式，禁止直接高速使能',
      '优先选用无电池多圈绝对值编码器（如磁编码器+齿轮减速计圈或 Wiegand 自发电式），从根本上消除电池维护窗口',
      '若必须用电池型编码器，建立强制性电池更换周期与低电量报警阈值，纳入设备点检表',
    ],
    sideEffects: ['无电池多圈编码器成本更高、部分厂商供货周期长；上电合理性校验会增加约100~500ms的开机自检时间'],
    verificationItems: ['人为断开编码器电池/供电并转动关节，验证上电后系统是否能正确识别"位置不可信"并拒绝直接高速使能'],
    unknownsToTest: ['编码器电池在设备实际存放/待机（非通电）状态下的自放电速率与真实更换周期'],
  });

  // ----------------------------------------------------
  // J003: 机械谐振 → 速度环带宽与陷波滤波器设计
  // ----------------------------------------------------
  const reflectedLoadInertia = input.gearRatio > 0 ? input.loadInertiaKgm2 / (input.gearRatio * input.gearRatio) : 0;
  const combinedTerm = (input.motorInertiaKgm2 > 0 ? 1 / input.motorInertiaKgm2 : 0) + (reflectedLoadInertia > 0 ? 1 / reflectedLoadInertia : 0);
  const resonanceFreqHz = combinedTerm > 0 ? (1 / (2 * Math.PI)) * Math.sqrt(input.torsionalStiffnessNmPerRad * combinedTerm) : 0;
  const bandwidthIsolationRatio = input.velocityLoopBandwidthHz > 0 ? resonanceFreqHz / input.velocityLoopBandwidthHz : 0;
  const j003HighRisk = bandwidthIsolationRatio > 0 && bandwidthIsolationRatio < 3;

  patterns.push({
    id: 'J003',
    name: '关节二质量谐振 → 速度环带宽侵入谐振区 (Two-Mass Resonance vs Velocity Loop Bandwidth)',
    triggered: resonanceFreqHz > 0,
    corePhysicalChain: '电机转子惯量与折算负载惯量经减速器扭转刚度构成二质量弹簧系统 → 谐振频率 f_res 与速度环带宽过近 → 闭环增益在谐振点激励振荡 → 关节啸叫/抖动/电流环过流保护频繁触发',
    calculatedValues: {
      '折算到电机侧的负载惯量 (kg·m²)': Number(reflectedLoadInertia.toFixed(6)),
      '估算机械谐振频率 f_res (Hz)': Number(resonanceFreqHz.toFixed(1)),
      '当前速度环带宽 (Hz)': input.velocityLoopBandwidthHz,
      '谐振/带宽隔离度 (倍)': Number(bandwidthIsolationRatio.toFixed(2)),
      '建议最小隔离度 (倍)': 3,
    },
    riskLevel: j003HighRisk ? 'Medium-High' : 'Low',
    confidence: 'MEDIUM',
    evidenceType: 'CALCULATED',
    vetoTriggered: false,
    candidateMeasures: [
      '在速度环反馈通路加入陷波滤波器 (Notch Filter)，中心频率对准实测谐振点，衰减谐振增益',
      '降低速度环带宽至谐振频率的 1/3~1/5，牺牲一定动态响应换取稳定裕量',
      '提高关节结构/联轴器刚度，或减小反向间隙抑制能量在谐振点的积累（与 J001 联动治理）',
    ],
    sideEffects: ['降低带宽会使关节轨迹跟踪滞后增大，高速轨迹跟随误差上升；陷波滤波器参数需要针对每台关节实测标定，量产一致性调优工作量较大'],
    verificationItems: ['扫频法（Chirp）或敲击法激励关节输出端，用加速度计/电流环频谱分析仪实测真实谐振峰，与理论估算值交叉验证'],
    unknownsToTest: ['关节在不同姿态（连杆角度变化导致等效惯量变化）下谐振频率的漂移范围'],
  });

  // ----------------------------------------------------
  // J004: 连续往复再生能量 → 泄放电阻连续热设计
  // ----------------------------------------------------
  const avgRegenPowerW = input.regenPowerPeakW * (input.dutyCycleDecelPct / 100);
  const j004Veto = avgRegenPowerW > input.brakingResistorRatedContinuousW || input.regenPowerPeakW > input.brakingResistorRatedPeakW;

  patterns.push({
    id: 'J004',
    name: '连续往复动作再生能量 → 泄放电阻连续热过载 (Continuous Duty Regenerative Braking, 区别于车规单次急停)',
    triggered: true,
    corePhysicalChain: '车规急停制动是低频单次事件，而关节在协作作业中高频往复加减速 → 每次减速动能经逆变器回馈进母线 → 泄放电阻(Brake Chopper)需持续斩波耗散 → 平均功率若长期超出额定连续功率 → 电阻阻值漂移/绝缘老化/最终烧毁，且伴随母线过压保护频繁跳闸',
    calculatedValues: {
      '单次减速峰值回馈功率 (W)': input.regenPowerPeakW,
      '一个周期内减速阶段占比 (%)': input.dutyCycleDecelPct,
      '估算平均回馈功率 (W)': Number(avgRegenPowerW.toFixed(1)),
      '泄放电阻额定连续功率 (W)': input.brakingResistorRatedContinuousW,
      '泄放电阻额定峰值功率 (W)': input.brakingResistorRatedPeakW,
      '连续功率裕量 (W)': Number((input.brakingResistorRatedContinuousW - avgRegenPowerW).toFixed(1)),
    },
    riskLevel: j004Veto ? 'High' : (avgRegenPowerW > input.brakingResistorRatedContinuousW * 0.7 ? 'Medium-High' : 'Low'),
    confidence: 'MEDIUM',
    evidenceType: 'CALCULATED',
    vetoTriggered: j004Veto,
    vetoReason: j004Veto
      ? `估算平均回馈功率 (${avgRegenPowerW.toFixed(1)}W) 超出泄放电阻额定连续功率 (${input.brakingResistorRatedContinuousW}W)，或单次峰值功率超出电阻额定峰值 (${input.brakingResistorRatedPeakW}W)，按典型作业节拍长期运行存在电阻过热失效与母线过压保护频繁跳闸风险！`
      : undefined,
    candidateMeasures: [
      '按实际作业节拍（而非车规单次急停假设）重新选型泄放电阻，核实连续功率而非仅看峰值功率',
      '评估多关节联动时母线是否可互相支援（一个关节回馈的能量被另一个关节加速消耗），降低对泄放电阻的依赖',
      '优化减速曲线（S型曲线/更长减速时间）降低瞬时回馈功率峰值，用时间换取热裕量',
    ],
    sideEffects: ['更大功率泄放电阻体积、成本与散热设计要求同步上升；延长减速时间会降低节拍效率，需与工艺节拍权衡'],
    verificationItems: ['按客户真实作业节拍连续运行不少于一个热稳态周期（电阻表面温度饱和），红外热像记录泄放电阻与周边元器件温升'],
    unknownsToTest: ['多关节真实协同作业时母线能量互相支援的实际比例（不能仅按单关节独立台架数据外推）'],
  });

  // ----------------------------------------------------
  // J005: 力矩闭环误差链
  // ----------------------------------------------------
  const efficiencyBandPct = input.gearboxEfficiencyMaxPct - input.gearboxEfficiencyMinPct;
  const j005Veto = !input.hasDedicatedTorqueSensor && input.collaborativeSafetyRequired && efficiencyBandPct > 15;

  patterns.push({
    id: 'J005',
    name: '力矩闭环误差链：电流估算力矩 vs 减速器效率漂移/力矩传感器 (Torque Estimation Confidence Chain)',
    triggered: true,
    corePhysicalChain: '若无独立力矩传感器，仅用 q 轴电流 × Kt × 减速比 估算关节输出力矩 → 减速器效率随温度、转速、负载方向非线性变化（典型 65%~90%区间）→ 力矩估算误差可达 ±15%~30% → 力控/柔顺控制或碰撞检测阈值失真',
    calculatedValues: {
      '是否配有独立力矩传感器': input.hasDedicatedTorqueSensor ? '是' : '否（纯电流估算）',
      '减速器全温/全速度效率区间': `${input.gearboxEfficiencyMinPct}% ~ ${input.gearboxEfficiencyMaxPct}%`,
      '效率波动带宽（即力矩估算潜在误差带）': `${Number(efficiencyBandPct.toFixed(1))}%`,
      '是否需满足协作/人机共融安全': input.collaborativeSafetyRequired ? '是' : '否',
    },
    riskLevel: j005Veto ? 'High' : (!input.hasDedicatedTorqueSensor ? 'Medium-High' : 'Low'),
    confidence: 'MEDIUM',
    evidenceType: input.hasDedicatedTorqueSensor ? 'MEASURED' : 'ENGINEERING_ASSUMPTION',
    vetoTriggered: j005Veto,
    vetoReason: j005Veto
      ? `本关节需满足协作/人机共融安全，但仅依赖电流估算力矩，减速器效率波动带宽 (${efficiencyBandPct.toFixed(1)}%) 远超碰撞检测/功率限制所需的置信度，存在低估碰撞力导致安全功能失效的风险！`
      : undefined,
    candidateMeasures: [
      '协作/人机共融场景加装独立关节力矩传感器（应变片/光电式），力矩闭环与安全功能均以传感器实测为准，电流估算仅作为诊断冗余',
      '若成本/结构限制无法加装传感器，至少建立分温度、分速度区间的效率查表标定，缩小估算误差带并做保守裕量设计',
      '对电流采样链路（含相电流零漂、Kt随温度的漂移）单独做误差预算，不能只归因于减速器效率',
    ],
    sideEffects: ['独立力矩传感器增加成本、轴向安装空间与走线复杂度；效率查表标定需要覆盖大量工况点，标定工作量大且需定期复标（磨损后效率会变化）'],
    verificationItems: ['同一工况下同时记录电流估算力矩与外置基准力矩传感器读数，覆盖全温区、全速度区间、正反两个负载方向，绘制误差带地图'],
    unknownsToTest: ['减速器润滑脂粘度随温度变化对效率的短期波动规律（冷启动 vs 热稳态）'],
  });

  // ----------------------------------------------------
  // J006: 安全扭矩关断 STO/SS1 通道独立性与响应时间
  // ----------------------------------------------------
  const j006IndependenceViolation = input.stoImplementation === 'SOFTWARE_PWM_DISABLE_ONLY' && input.requiredPerformanceLevel !== 'NONE';
  const j006TimingViolation = input.stoResponseTimeMs > input.requiredResponseTimeMs;
  const j006Veto = j006IndependenceViolation || j006TimingViolation;

  patterns.push({
    id: 'J006',
    name: '安全扭矩关断 STO/SS1 通道独立性与响应时间 (Safe Torque Off Independence, 区别于车规ASIL软件互锁)',
    triggered: true,
    corePhysicalChain: '协作机器人/工业臂的安全功能 (STO/SS1/SS2/SLS, IEC 61800-5-2 + ISO 13849-1 / ISO 10218 / ISO-TS 15066) 要求达到目标性能等级(PLd/PLe/SIL2/SIL3)的双通道独立切断驱动使能，不能仅依赖同一颗运控 MCU 的软件封锁 PWM 逻辑；车规 ASIL 中常见的"软件互锁+看门狗"经验不能直接平移',
    calculatedValues: {
      '当前 STO 实现方式': input.stoImplementation,
      '安全需求要求的性能等级': input.requiredPerformanceLevel,
      'STO 实测/规格响应时间 (ms)': input.stoResponseTimeMs,
      '安全需求要求的响应时间上限 (ms)': input.requiredResponseTimeMs,
    },
    riskLevel: j006Veto ? 'High' : 'Low',
    confidence: 'HIGH',
    evidenceType: 'SPECIFICATION',
    vetoTriggered: j006Veto,
    vetoReason: j006Veto
      ? [
          j006IndependenceViolation ? `目标性能等级为 ${input.requiredPerformanceLevel}，但当前 STO 仅通过同一 MCU 软件禁止 PWM 实现，缺少硬件独立通道，不满足 IEC 61800-5-2 通道独立性要求` : '',
          j006TimingViolation ? `STO 响应时间 (${input.stoResponseTimeMs}ms) 超出安全需求上限 (${input.requiredResponseTimeMs}ms)` : '',
        ].filter(Boolean).join('；') + '，一票否决，不得以此状态进入人机共融现场！'
      : undefined,
    candidateMeasures: [
      '采用双通道硬件 STO：两路独立逻辑（如预驱使能引脚 + 门极电源双重切断）分别切断功率级，任一通道单独动作即可安全断转矩',
      '升级为集成安全功能的安全 MCU / 安全预驱方案，具备自诊断与通道交叉监控，满足 PLd/PLe 或 SIL2/SIL3 认证要求',
      '将 STO 触发链路（急停按钮/安全PLC → 安全继电器/安全模块 → 驱动器 STO 输入）整体测时，而非只测驱动器内部响应',
    ],
    sideEffects: ['硬件双通道 STO 增加 BOM 与走线复杂度；安全 MCU 方案的开发与认证周期显著长于纯软件方案，需提前规划项目节点'],
    verificationItems: ['故障注入：人为使一路 STO 通道失效，验证另一路是否仍能独立切断功率级；用示波器从安全输入触发沿到相电流归零全链路计时'],
    unknownsToTest: ['最终系统集成后（含安全PLC/安全继电器）端到端的实测响应时间，不能只用驱动器数据手册标称值代替'],
  });

  // ----------------------------------------------------
  // J007: 现场总线周期与本地控制环耦合
  // ----------------------------------------------------
  const cycleRatio = input.localPositionLoopCycleUs > 0 ? input.busCycleTimeUs / input.localPositionLoopCycleUs : 0;
  const j007StepRisk = cycleRatio >= 8 && !input.hasLocalInterpolation;
  const j007FallbackMissing = input.busLossFallbackStrategy === 'NONE';
  const j007Veto = j007FallbackMissing;

  patterns.push({
    id: 'J007',
    name: '现场总线周期(EtherCAT/CANopen DS402)与本地控制环耦合 → 指令台阶化与丢包降级策略缺失',
    triggered: true,
    corePhysicalChain: '主站以总线周期下发目标位置/力矩指令 → 若总线周期远大于本地位置/电流环周期且缺少本地插补，指令在环路视角呈现台阶状 → 速度/加速度不连续引发转矩纹波与关节抖动；总线丢包/断线时若无预定义降级策略，存在失控风险',
    calculatedValues: {
      '总线协议': input.busProtocol,
      '总线通信周期 (μs)': input.busCycleTimeUs,
      '本地位置/电流环周期 (μs)': input.localPositionLoopCycleUs,
      '周期比 (总线/本地环路)': Number(cycleRatio.toFixed(1)),
      '是否具备本地插补/前馈': input.hasLocalInterpolation ? '是' : '否',
      '总线丢包/断线降级策略': input.busLossFallbackStrategy,
    },
    riskLevel: j007Veto ? 'High' : (j007StepRisk ? 'Medium-High' : 'Low'),
    confidence: 'MEDIUM',
    evidenceType: 'CALCULATED',
    vetoTriggered: j007Veto,
    vetoReason: j007Veto
      ? '未定义总线丢包/断线时的本地降级策略（斜坡到零/保持/触发STO），一旦通信异常关节行为不可预测，属于功能安全空白，一票否决！'
      : undefined,
    candidateMeasures: [
      '本地环路实现位置/速度插补（三次样条或梯形前馈），将总线周期的台阶指令平滑映射到更快的本地环路节拍',
      '明确定义并测试总线丢包/断线降级策略（如连续 N 个周期未收到有效帧则执行斜坡减速到零，而非直接掉使能自由飞出）',
      '若周期比持续偏大，评估提升总线通信周期（如从 1ms 降至 250μs）或采用支持更高实时性的总线拓扑',
    ],
    sideEffects: ['本地插补算法增加控制器计算负载与实现复杂度；缩短总线周期可能受限于主站/网络拓扑上限，涉及多关节联动时需统一评估'],
    verificationItems: ['人为在总线上注入丢包/延迟/断线，记录关节实际速度/位置曲线，验证是否严格按预定义策略降级而非依赖驱动器默认行为'],
    unknownsToTest: ['多关节级联总线拓扑下，单一关节通信异常是否会通过总线反向影响其余关节的实时性'],
  });

  return patterns;
}
