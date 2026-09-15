/**
 * 车载/机器人 BLDC 电机驱动物理计算引擎 (Motor Physics Engine)
 * 纯确定性数学模型，无第三方依赖，严格对齐车规 ISO 16750-2 / CISPR 25 与功率半导体机理
 */

import {
  BusPumpingResult,
  MillerRiskResult,
  SnubberCalcResult,
} from '../types/motorDrive';

/**
 * 1. 急停与制动时电机机械动能向母线倒灌过压 (Bus Pumping Peak) 计算
 * 物理原理：制动瞬间若无下桥能耗制动或主动吸收，转子动能 Ek = 0.5 * J * w^2 将按转化效率倒灌至母线电容，
 * 电容电压从初始 V_bus_nom 泵升至 V_bus_peak。
 */
export function calculateBusPumping(params: {
  V_bus_nom: number;            // 标称母线电压 (V)，例如 12V / 24V / 48V
  V_bus_max_rating: number;     // 母线电容或 MOS 额定耐压 (V)，例如 40V / 60V / 100V
  C_dc_uF: number;              // 母线有效去耦滤波电容总和 (μF)
  J_kg_m2: number;              // 电机转子与折算负载总转动惯量 (kg·m²)
  n_rpm: number;                // 制动前电机最高转速 (rpm)
  regenEfficiency?: number;     // 动能转化为电能比例 (0~1, 默认 0.75，扣除机械摩擦与铜耗)
  L_harness_uH?: number;        // 线束寄生电感 (μH, 可选)
  I_phase_A?: number;           // 急停前相电流 (A, 可选)
}): BusPumpingResult {
  const {
    V_bus_nom,
    V_bus_max_rating,
    C_dc_uF,
    J_kg_m2,
    n_rpm,
    regenEfficiency = 0.75,
    L_harness_uH = 0,
    I_phase_A = 0,
  } = params;

  // 1. 计算角速度 omega = 2 * pi * n / 60 (rad/s)
  const omega = (2 * Math.PI * Math.max(0, n_rpm)) / 60;

  // 2. 机械转动总动能 Ek = 0.5 * J * omega^2 (Joules)
  const kineticEnergyJoules = 0.5 * Math.max(0, J_kg_m2) * Math.pow(omega, 2);

  // 3. 线束电感释放的电磁能量 EL = 0.5 * L * I^2 (Joules)
  const harnessEnergyJoules =
    0.5 * (Math.max(0, L_harness_uH) * 1e-6) * Math.pow(Math.max(0, I_phase_A), 2);

  // 4. 倒灌到母线电容的总能量
  const regenEnergyJoules =
    kineticEnergyJoules * Math.min(1, Math.max(0, regenEfficiency)) + harnessEnergyJoules;

  // 5. 母线电容初始储能 Ec0 = 0.5 * C * V_nom^2
  const C_farad = Math.max(1, C_dc_uF) * 1e-6;
  const initialCapEnergy = 0.5 * C_farad * Math.pow(V_bus_nom, 2);

  // 6. 最终总能量与泵升电压 V_bus_peak = sqrt(2 * (Ec0 + E_regen) / C)
  const totalEnergy = initialCapEnergy + regenEnergyJoules;
  const V_bus_peak = Math.sqrt((2 * totalEnergy) / C_farad);
  const voltageRise = V_bus_peak - V_bus_nom;
  const voltageMarginV = V_bus_max_rating - V_bus_peak;
  const isOverVoltage = V_bus_peak > V_bus_max_rating;

  let severity: 'SAFE' | 'WARNING' | 'CRITICAL' = 'SAFE';
  let recommendation = '母线电压在安全降额范围内，电容与MOS耐压满足降额规范。';

  if (isOverVoltage) {
    severity = 'CRITICAL';
    recommendation = `【严重超标】泵升电压 (${V_bus_peak.toFixed(1)}V) 突破器件额定耐压 (${V_bus_max_rating}V)！可能瞬间击穿电容或下桥MOS！建议：1. 软件急停改为三相全下桥短接动态能耗制动；2. 母线并联 TVS/大功率双向瞬变二极管；3. 增大母线电容至 ${(C_dc_uF * 2).toFixed(0)}μF 以上。`;
  } else if (voltageMarginV < V_bus_max_rating * 0.15) {
    severity = 'WARNING';
    recommendation = `【裕量偏紧】耐压安全裕量仅剩 ${voltageMarginV.toFixed(1)}V (<15%)。考虑冷车环境电解电容容量衰减与ESR升高，建议加大电容或在控制算法中加入减速斜坡限制。`;
  }

  return {
    kineticEnergyJoules: Number(kineticEnergyJoules.toFixed(3)),
    regenEnergyJoules: Number(regenEnergyJoules.toFixed(3)),
    V_bus_peak: Number(V_bus_peak.toFixed(2)),
    voltageRise: Number(voltageRise.toFixed(2)),
    isOverVoltage,
    voltageMarginV: Number(voltageMarginV.toFixed(2)),
    severity,
    recommendation,
  };
}

/**
 * 2. 米勒感应直通风险评估 (Miller Cross-Conduction Check)
 * 物理原理：桥臂一侧对管高 dv/dt 开通时，处于关断态的管子由于 C_gd 米勒电容耦合位移电流 Im = C_gd * dv/dt，
 * 该电流流经门极关断下拉回路阻抗 Rg_pulldown，在栅极感应出正电压 Vg_induced。
 * 若 Vg_induced >= V_th_min，该关断管将发生假开通，引发母线对地同桥臂瞬时直通 (Shoot-through) 甚至炸管。
 */
export function checkMillerRisk(params: {
  V_th_min: number;              // 门极最小开启阈值电压 (V)，例如 2.0V
  C_gd_pF: number;               // 栅漏电容 / 米勒电容 (pF)，例如 35pF
  C_gs_pF?: number;              // 栅源输入电容 (pF)，当前简化模型不直接参与数值计算
  R_g_pulldown_ohm: number;      // 门极关断回路总有效阻抗 (Ω, 驱动下拉内阻 + 外置阻抗 + MOS内部Rg)
  dv_dt_V_per_ns: number;        // 开关节点反向对管开启导致的电压上升率 (V/ns)，例如 5~15 V/ns
  hasActiveMillerClamp?: boolean;// 是否启用了预驱芯片内置的有源米勒钳位 (Active Miller Clamp)
}): MillerRiskResult {
  const {
    V_th_min,
    C_gd_pF,
    C_gs_pF: _C_gs_pF,
    R_g_pulldown_ohm,
    dv_dt_V_per_ns,
    hasActiveMillerClamp = false,
  } = params;

  // dv/dt: 1 V/ns = 1e9 V/s
  // Im = C_gd * (dv/dt) = (C_gd * 1e-12) * (dv_dt * 1e9) = C_gd * dv_dt * 1e-3 (Amperes)
  const millerCurrentA = (C_gd_pF * dv_dt_V_per_ns) / 1000;

  // 门极感应电压 Vg_induced = Im * Rg_pulldown
  let vGateInducedV = millerCurrentA * R_g_pulldown_ohm;

  // 若启用硬件有源米勒钳位，内部低阻 MOSFET (<0.5Ω) 强行钳位，大幅衰减感应电压 (衰减至约 15%)
  if (hasActiveMillerClamp) {
    vGateInducedV *= 0.15;
  }

  const safetyMarginV = V_th_min - vGateInducedV;
  const isRiskOfShootThrough = vGateInducedV >= V_th_min;

  let riskLevel: 'SAFE' | 'WARNING' | 'CRITICAL_SHOOT_THROUGH' = 'SAFE';
  let recommendation = '门极米勒感应电压低于器件阈值，处于安全裕量范围内。';

  if (isRiskOfShootThrough) {
    riskLevel = 'CRITICAL_SHOOT_THROUGH';
    recommendation = `【极度危险：直通炸管隐患】米勒感应电压 (${vGateInducedV.toFixed(2)}V) 已经跨越门极开启阈值 (${V_th_min}V)！在高温时门极阈值进一步漂移下降，必发生同臂直通！建议：1. 开启驱动器有源米勒钳位；2. 增加门极外置抗拉电阻或关断反向并联二极管；3. 适当调大开通电阻以限制对管 dv/dt；4. 选用 C_gd/C_gs 比值更小的车规级 MOSFET。`;
  } else if (safetyMarginV < 0.6) {
    riskLevel = 'WARNING';
    recommendation = `【临界预警】门极开启安全裕量仅 ${safetyMarginV.toFixed(2)}V (<0.6V)。汽车环境在 125℃~150℃ 时 V_th 会衰减 20%~30%，存在偶发微导通发热风险，建议优化门极关断回路。`;
  }

  return {
    millerCurrentA: Number(millerCurrentA.toFixed(3)),
    vGateInducedV: Number(vGateInducedV.toFixed(2)),
    vThMinV: Number(V_th_min.toFixed(2)),
    safetyMarginV: Number(safetyMarginV.toFixed(2)),
    isRiskOfShootThrough,
    riskLevel,
    recommendation,
  };
}

/**
 * 3. 开关节点 RC Snubber 缓冲器最佳阻尼计算 (Snubber Calculator)
 * 物理原理：开关节点高频振铃由功率回路寄生杂散电感 L_loop 与 MOSFET 输出电容 C_oss 谐振引起：
 * f_ring = 1 / (2 * pi * sqrt(L_loop * C_oss))
 * 推荐吸收电容 C_snub = 2 ~ 3 * C_oss
 * 推荐吸收电阻（特征阻抗临界阻尼） R_snub = sqrt(L_loop / C_snub)
 */
export function calculateSnubberParams(params: {
  f_ring_MHz: number;    // 示波器实测振铃频率 (MHz)，例如 30~80MHz
  C_oss_pF: number;      // MOSFET 输出电容 (pF)，例如 500~1500pF
  V_bus_V?: number;      // 母线供电电压 (V)，例如 13.5V / 24V / 48V
  f_sw_kHz?: number;     // PWM 开关频率 (kHz)，例如 20kHz
}): SnubberCalcResult {
  const {
    f_ring_MHz,
    C_oss_pF,
    V_bus_V = 13.5,
    f_sw_kHz = 20,
  } = params;

  const f_ring_hz = Math.max(1, f_ring_MHz) * 1e6;
  const C_oss_farad = Math.max(10, C_oss_pF) * 1e-12;

  // 1. 反推环路寄生电感 L_loop = 1 / ( (2*pi*f)^2 * C_oss )
  const loopInductanceH = 1 / (Math.pow(2 * Math.PI * f_ring_hz, 2) * C_oss_farad);
  const loopInductanceNh = loopInductanceH * 1e9;

  // 2. 推荐 C_snub 取 2 倍 C_oss
  const recommendedCsnubPf = Math.round(C_oss_pF * 2);
  const C_snub_farad = recommendedCsnubPf * 1e-12;

  // 3. 推荐 R_snub 取特征阻抗阻尼 R = sqrt(L / C_snub)
  const recommendedRsnubOhm = Math.round(Math.sqrt(loopInductanceH / C_snub_farad) * 10) / 10;

  // 4. 单相 RC 吸收电阻功率损耗 P_snub = C_snub * V_bus^2 * f_sw
  const f_sw_hz = f_sw_kHz * 1e3;
  const snubberPowerDissipationW = C_snub_farad * Math.pow(V_bus_V, 2) * f_sw_hz;

  // 5. 预期 EMI 尖峰衰减 (典型可削减 6~14 dB 的高频谐波尖峰)
  const attenuationDbe = Math.min(16, Math.max(6, Math.round(8 + Math.log10(recommendedCsnubPf / 100) * 3)));

  return {
    loopInductanceNh: Number(loopInductanceNh.toFixed(1)),
    recommendedCsnubPf,
    recommendedRsnubOhm: Math.max(1, recommendedRsnubOhm),
    snubberPowerDissipationW: Number(snubberPowerDissipationW.toFixed(3)),
    dampingRatio: 0.707, // 临界阻尼设计
    attenuationDbe,
  };
}

/**
 * 4. 换相误差与失步风险物理评估 (Commutation Error & Stall-out Risk)
 * 物理原理：
 * - 换相角偏移 delta_theta 会引起转矩输出投影削弱 T = T_max * cos(delta_theta)，产生转矩纹波；
 * - 当换相提前或滞后超过阈值 (方波 >= 30°电角度, FOC >= 45°)，极易引发反电势相位翻转导致失步 (Step-out / Stall-out)；
 * - 无感 BEMF 在极低速 (<300rpm) 时信噪比极低，反电动势幅值过小无法可靠提取过零点。
 */
export function calculateCommutationRisk(params: {
  controlMode: 'sensorless_bemf' | 'hall_six_step' | 'foc_vector';
  speedMinRpm: number;
  speedMaxRpm: number;
  angleOffsetDeg: number;       // 电角度换相误差 (度, 如 3° ~ 15°)
  torqueFluctuationPct?: number;// 负载扭矩瞬态波动百分比 (如 10% ~ 40%)
}): {
  torqueRipplePct: number;
  stallOutProbability: 'low' | 'medium' | 'high';
  stallOutReason: string;
  degradationAction: string;
} {
  const { controlMode, speedMinRpm, speedMaxRpm, angleOffsetDeg, torqueFluctuationPct = 15 } = params;

  // 1. 转矩纹波估算:
  // 六步方波基础纹波约为 13.4%，外加角度偏差引起的波动;
  // FOC 基础纹波约 2%~5%，随角度偏移成正比放大;
  // 无感方波在低速时因过零点抖动纹波急剧放大。
  let baseRipple = controlMode === 'foc_vector' ? 3.5 : controlMode === 'hall_six_step' ? 14.0 : 18.0;
  let angleImpact = Math.abs(angleOffsetDeg) * (controlMode === 'foc_vector' ? 1.8 : 2.5);
  let torqueRipplePct = Number((baseRipple + angleImpact + torqueFluctuationPct * 0.35).toFixed(1));

  let stallOutProbability: 'low' | 'medium' | 'high' = 'low';
  let stallOutReason = '换相角偏差在安全裕量内 (±5°电角度以内)，转矩输出平稳，无失步风险。';
  let degradationAction = '维持正常闭环运行，继续监测相电流波形对称度与电流零漂。';

  // 评估失步风险
  if (controlMode === 'sensorless_bemf' && speedMinRpm < 400) {
    stallOutProbability = 'high';
    stallOutReason = `无感 BEMF 在低速区 (${speedMinRpm} rpm) 反电势信噪比恶化，过零点捕获抖动已超 ±25° 电角度，极易在重载或急加减速时发生反转失步！`;
    degradationAction = '实施 I-F / V-F 开环强拖启动，转速跨过 450rpm 后平滑切换至反电势滑模观测器 (SMO) 闭环；若启动超时触发 DTC B1024-71 并安全锁死 PWM。';
  } else if (Math.abs(angleOffsetDeg) >= 20 || (torqueRipplePct > 35 && speedMaxRpm > 3000)) {
    stallOutProbability = 'high';
    stallOutReason = `换相角偏差 (${angleOffsetDeg}°) 叠加高速大纹波 (${torqueRipplePct}%)，功角超出稳定极值边界 (45°)，制动或变载瞬间存在突发失步！`;
    degradationAction = '立刻触发转速降速 50% 保护运行，限制最大输出扭矩至 40%，切入故障降级运行模式 (Limp-Home)，并在仪表台点亮故障提示灯。';
  } else if (Math.abs(angleOffsetDeg) >= 8 || torqueRipplePct > 20) {
    stallOutProbability = 'medium';
    stallOutReason = `换相角偏差 (${angleOffsetDeg}°) 引起中度转矩纹波 (${torqueRipplePct}%)，座舱可感知轻微 NVH 嗡鸣与机械振动。`;
    degradationAction = '通过微控制器在线前馈角度补偿表 (LUT) 动态校正霍尔安装误差，开启相电流硬件高频平滑滤波。';
  }

  return {
    torqueRipplePct,
    stallOutProbability,
    stallOutReason,
    degradationAction,
  };
}

/**
 * 5. 位置传感器失效降级与功能安全判定 (Position Sensor Failure Degradation)
 */
export function evaluatePositionSensorDegradation(sensorType: 'hall_triple' | 'hall_single' | 'optical_encoder' | 'sensorless'): {
  redundancyAvailable: boolean;
  switchingLogic: string;
  performanceLoss: string;
  dtcTriggered: string;
  powerLimitMode: string;
  dfmeaSeverity: number;
  dfmeaOccurrence: number;
  dfmeaDetection: number;
} {
  switch (sensorType) {
    case 'hall_triple':
      return {
        redundancyAvailable: true,
        switchingLogic: '三路霍尔中若单路断线/卡高/卡低，由 MCU 状态机通过捕获另外两路正交跳变沿并结合反电势/积分重构丢失相信号 (2-Hall 容错算法)。',
        performanceLoss: '转矩纹波增加约 15%，低速平稳性下降，峰值转速限幅至额定 70%。',
        dtcTriggered: 'DTC P0A3F-14 (Motor Rotor Position Sensor Circuit Low / Component Failure)',
        powerLimitMode: '激活限扭矩 50% Limp-Home 降级模式，禁用高动态响应操作。',
        dfmeaSeverity: 8, // 涉及座舱动作失效
        dfmeaOccurrence: 4, // 车规霍尔成熟
        dfmeaDetection: 3,  // 状态机实时奇偶校验
      };
    case 'hall_single':
      return {
        redundancyAvailable: false,
        switchingLogic: '单路霍尔一旦失效失去全部正交相位基准，无法通过硬件重构转子绝对位置。',
        performanceLoss: '无法维持矢量闭环控制，电机发生停转震颤。',
        dtcTriggered: 'DTC P0A38-00 (Motor Rotor Position Sensor Signal Missing)',
        powerLimitMode: '立即切入安全状态 (Safe State)：全关断 6-MOSFET 或根据急停需求实施三相全下桥动态制动。',
        dfmeaSeverity: 9,
        dfmeaOccurrence: 5,
        dfmeaDetection: 4,
      };
    case 'optical_encoder':
      return {
        redundancyAvailable: true,
        switchingLogic: 'ABZ 增量式编码器若 Z 相丢失，使用 AB 正交脉冲计数维持相对位置；若 A/B 任一相丢失，平滑切入反电势磁链观测器闭环。',
        performanceLoss: '角度分辨率由 12-bit 降为估算精度，稳态转速波动增加 ±30rpm。',
        dtcTriggered: 'DTC P0A40-1C (Rotor Position Sensor Optical Channel Voltage Out of Range)',
        powerLimitMode: '限制加速度斜坡上限，转速上限钳制 2500rpm。',
        dfmeaSeverity: 8,
        dfmeaOccurrence: 4,
        dfmeaDetection: 2,
      };
    case 'sensorless':
    default:
      return {
        redundancyAvailable: false,
        switchingLogic: '采用高频注入法 (HFI) 与滑模观测器 (SMO) 组合估算，当注入高频电流响应畸变时无法提取凸极率。',
        performanceLoss: '零速启动可能产生反冲反转，堵转状态无法建立磁场反电势。',
        dtcTriggered: 'DTC P0A44-77 (Sensorless Commutation Estimator Loss of Synchronization)',
        powerLimitMode: '重试 3 次启动失败后强制封锁驱动输出，报失步故障并锁止执行器。',
        dfmeaSeverity: 8,
        dfmeaOccurrence: 6,
        dfmeaDetection: 4,
      };
  }
}

/**
 * 6. 功能安全链路时间预算与采样双通道核验 (Functional Safety Chain Timing)
 * ISO 26262-5 要求：故障检测时间 + 故障处理时间 <= 故障容许时间间隔 (FHTI)
 */
export function evaluateSafetyChainTiming(params: {
  fhtiBudgetMs?: number;
  wdgTimeoutWindowMs?: number;
  safeStateTransitionMs?: number;
  currentSenseDeviationPct?: number;
}): {
  currentSenseStatus: 'COMPLIANT' | 'WARNING' | 'CRITICAL';
  currentSenseDiagnosis: string;
  timingCompliance: 'PASS' | 'CRITICAL';
  marginMs: number;
  detail: string;
} {
  const {
    fhtiBudgetMs = 10.0,
    wdgTimeoutWindowMs = 4.0,
    safeStateTransitionMs = 2.2,
    currentSenseDeviationPct = 3.2,
  } = params;

  // 总反应时间 = 看门狗超时检测 + 安全状态切换执行
  const totalResponseTimeMs = wdgTimeoutWindowMs + safeStateTransitionMs;
  const marginMs = Number((fhtiBudgetMs - totalResponseTimeMs).toFixed(2));
  const timingCompliance = marginMs >= 0 ? 'PASS' : 'CRITICAL';

  let currentSenseStatus: 'COMPLIANT' | 'WARNING' | 'CRITICAL' = 'COMPLIANT';
  let currentSenseDiagnosis = '双通道采样偏差 < 5%，满足主监控通道冗余比对标准。';

  if (currentSenseDeviationPct >= 10.0) {
    currentSenseStatus = 'CRITICAL';
    currentSenseDiagnosis = `双通道采样偏差达 ${currentSenseDeviationPct}% (>=10%)！超出安全门限，可能因偏置温漂或运放失调导致误判。`;
  } else if (currentSenseDeviationPct >= 5.0) {
    currentSenseStatus = 'WARNING';
    currentSenseDiagnosis = `双通道采样偏差为 ${currentSenseDeviationPct}% (5%~10% 预警区)，需在软件滤波中追加容差消抖。`;
  }

  const detail =
    timingCompliance === 'PASS'
      ? `看门狗窗口 (${wdgTimeoutWindowMs}ms) + 安全状态转换 (${safeStateTransitionMs}ms) = ${totalResponseTimeMs.toFixed(1)}ms <= FHTI (${fhtiBudgetMs}ms)，裕量 ${marginMs}ms 充裕。`
      : `【严重违背安全准则】总故障切换时间 (${totalResponseTimeMs.toFixed(1)}ms) 击穿 FHTI 时间预算 (${fhtiBudgetMs}ms)！`;

  return {
    currentSenseStatus,
    currentSenseDiagnosis,
    timingCompliance,
    marginMs,
    detail,
  };
}
