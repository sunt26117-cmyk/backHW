/**
 * 车载与机器人 BLDC 电机驱动专用类型定义
 * 涵盖：座椅调节、气动按摩泵、滑移屏机构、灵巧关节
 */

export type ActuatorArchetype =
  | 'SEAT_HEAVY_TILT'     // 座椅水平/倾角大扭矩调节 (重载、频繁硬限位堵转、发泡海绵密闭高温)
  | 'SEAT_MASSAGE_PUMP'   // 座椅气动/气袋按摩泵 (高频微型BLDC、高频PWM、长寿命、严苛CISPR 25 CE)
  | 'DISPLAY_SLIDER'      // 中控悬浮滑屏/升降机构 (长线束寄生电感、座舱近耳严苛NVH、急停高压倒灌)
  | 'ROBOT_JOINT';        // 机器人灵巧关节驱动器 (24V/48V四象限高速正反转、高频制动能量回馈、极高功率密度)

export type PowerStageTopology =
  | 'DISCRETE_6MOS'       // 分立 6-MOSFET 三相逆变桥 (灵活性高，选型成本可控，寄生电感较显著)
  | 'SMART_POWER_STAGE'   // 智能功率级 / 集成半桥 (SPS / IPM，集成驱动与高精度电流采样，紧凑但成本较高)
  | 'PREDRIVER_WITH_MOS'; // 专用车规预驱 (Gate Driver) + 外置车规 6-MOS (典型主流方案，带丰富诊断与自举保护)

export interface ActuatorPresetProfile {
  id: ActuatorArchetype;
  name: string;
  category: 'AUTOMOTIVE_BODY' | 'CABIN_MECHATRONICS' | 'ROBOTICS';
  description: string;
  typicalVoltage: number;       // V (e.g. 12V, 24V, 48V)
  stallCurrentA: number;        // 典型堵转电流 A
  harnessInductanceUh: number;  // 典型线束电感 μH
  ambientTempC: number;         // 环境温度 ℃
  nvhRequirementDba: number;    // NVH 噪音上限 dB(A)
  defaultTopology: PowerStageTopology;
  thermalEnvironment: string;   // 散热边界
}

export interface MotorPhysicsParams {
  // 电气与线束参数
  V_bus_nom: number;             // 标称母线电压 (V), 如 12V / 24V / 48V
  V_bus_max_rating: number;      // 母线电容或MOS额定耐压上限 (V), 如 40V / 60V / 80V
  C_dc: number;                  // 母线去耦电容总容量 (μF), 如 470μF
  L_harness: number;             // 供电与相线线束杂散电感 (μH), 如 1.5μH
  I_stall: number;               // 堵转/峰值相电流 (A), 如 25A
  
  // 机械转动与动能参数
  J: number;                     // 电机转子及负载折算总转动惯量 (kg·m² 或 10^-4 kg·m²)
  n: number;                     // 急停前电机转速 (rpm), 如 3500 rpm
  regenEfficiency?: number;      // 动能回馈电气转化效率 (0~1, 典型 0.7~0.85)

  // 门极与米勒效应参数
  V_th_min: number;              // MOSFET 门极阈值开启电压下限 (V), 如 2.0V
  C_gd: number;                  // 栅漏米勒电容 (pF), 如 45pF
  C_gs: number;                  // 栅源输入电容 (pF), 如 1800pF
  R_g_pulldown: number;          // 门极关断回路总有效阻抗 (Ω, 驱动内阻 + 外置Rg_off + MOS内部Rg), 如 3.5Ω
  dv_dt: number;                 // 开关节点反向对管开启导致的电压上升率 (V/ns), 如 8.0 V/ns
  hasActiveMillerClamp?: boolean;// 是否具备硬件有源米勒钳位功能

  // 吸收回路与高频寄生参数
  C_oss: number;                 // MOSFET 输出等效电容 (pF), 如 680pF
  f_ring: number;                // 示波器实测开关节点振铃频率 (MHz), 如 45MHz
  f_sw: number;                  // PWM 载波频率 (kHz), 如 20kHz
}

export interface BusPumpingResult {
  kineticEnergyJoules: number;   // 机械总动能 (J)
  regenEnergyJoules: number;     // 转化为母线电能的能量 (J)
  V_bus_peak: number;            // 泵升后母线过压峰值 (V)
  voltageRise: number;           // 电压抬升值 ΔV (V)
  isOverVoltage: boolean;        // 是否超出器件额定安全耐压
  voltageMarginV: number;        // 耐压安全裕量 (V)
  severity: 'SAFE' | 'WARNING' | 'CRITICAL';
  recommendation: string;        // 工程改进建议
}

export interface MillerRiskResult {
  millerCurrentA: number;        // 米勒感应耦合电荷电流 (A)
  vGateInducedV: number;         // 门极感应脉冲电压 (V)
  vThMinV: number;               // 门极最小阈值电压 (V)
  safetyMarginV: number;         // 门极安全裕量 (V)
  isRiskOfShootThrough: boolean; // 是否存在同桥臂直通击穿风险
  riskLevel: 'SAFE' | 'WARNING' | 'CRITICAL_SHOOT_THROUGH';
  recommendation: string;        // 对策（如外加米勒钳位、减小Rg_off、调整死区等）
}

export interface SnubberCalcResult {
  loopInductanceNh: number;      // 推算出的功率环路杂散电感 (nH)
  recommendedCsnubPf: number;    // 推荐 RC 吸收电容值 (pF)
  recommendedRsnubOhm: number;   // 推荐 RC 吸收电阻值 (Ω)
  snubberPowerDissipationW: number; // 单相 RC 吸收电阻额定耗散功率 (W)
  dampingRatio: number;          // 阻尼比估计
  attenuationDbe: number;        // 预期高频振铃与EMI衰减 (dB)
}
