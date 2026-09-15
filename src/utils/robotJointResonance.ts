/**
 * 机器人关节二质量机械谐振共享物理计算模块 (Two-Mass Resonance Physics Engine)
 * 供 robotJointPatternEngine.ts (J003) 与 scenarioDomainEngine.ts (ROBOT_JOINT) 统一调用，
 * 彻底杜绝减速比 i² 量纲折算分叉与不一致问题。
 */

export interface TwoMassResonanceInput {
  torsionalStiffnessNmPerRad: number; // 输出端扭转刚度 K_output (Nm/rad)
  motorInertiaKgm2: number;           // 电机转子转动惯量 J_m (kg·m²)
  loadInertiaKgm2: number;            // 关节输出端连杆/负载惯量 J_L (kg·m²)
  gearRatio: number;                  // 减速器速比 i (例如 101)
  velocityLoopBandwidthHz?: number;   // 速度环闭环截止带宽 f_bw (Hz)
}

export interface TwoMassResonanceResult {
  resonanceFreqHz: number;                  // 机械谐振频率 (极点) f_res (Hz)
  angularResonanceRadS: number;             // 谐振角频率 ω_res (rad/s)
  antiResonanceFreqHz: number;              // 输出端反谐振频率 (零点) f_ar (Hz)
  angularAntiResonanceRadS: number;         // 反谐振角频率 ω_ar (rad/s)
  motorInertiaReflectedToOutputKgm2: number; // 电机转子惯量折算到输出端: J_m * i² (kg·m²)
  loadInertiaReflectedToMotorKgm2: number;   // 负载惯量折算到电机侧: J_L / i² (kg·m²)
  inertiaRatio: number;                     // 惯量比 J_L_refl / J_m (建议 <= 10)
  bandwidthIsolationRatio: number;          // 谐振与速度环带宽隔离度 f_res / f_bw (建议 >= 3.0×)
  isBandwidthInvadingResonance: boolean;    // 带宽是否侵入谐振区 (隔离度 < 3.0×)
  isBandwidthAboveResonance: boolean;       // 带宽是否骑在谐振点或高于谐振点 (隔离度 <= 1.0×，极度危险)
  isPlausible: boolean;                     // 量级合理性断言 (机器人关节谐振典型处于 5 ~ 500 Hz)
  plausibilityWarning?: string;             // 量级异常警示
}

/**
 * 计算二质量弹簧系统机械谐振与反谐振频率
 * 
 * 物理推导（统一基准在输出端）：
 * - 减速器刚度 K_output 标称在输出端 (Nm/rad)
 * - 负载惯量 J_L 在输出端 (kg·m²)
 * - 电机转子惯量折算到输出端为 J_m_refl = J_m * i² (kg·m²)
 * - 系统传递函数极点（谐振角频率）：
 *     ω_res = sqrt( K_output * (1 / J_m_refl + 1 / J_L) )
 * - 系统输出端传递函数零点（反谐振角频率）：
 *     ω_ar = sqrt( K_output / J_L )
 * 
 * （注：等价折算到电机侧：K_motor = K_output / i², J_L_refl = J_L / i²，
 *  ω_res = sqrt( K_motor * (1/J_m + 1/J_L_refl) )，两者在数学上完全等价）
 */
export function calculateTwoMassResonance(input: TwoMassResonanceInput): TwoMassResonanceResult {
  const { torsionalStiffnessNmPerRad: K, motorInertiaKgm2: Jm, loadInertiaKgm2: JL, gearRatio: i } = input;

  if (K <= 0 || Jm <= 0 || JL <= 0 || i <= 0) {
    return {
      resonanceFreqHz: 0,
      angularResonanceRadS: 0,
      antiResonanceFreqHz: 0,
      angularAntiResonanceRadS: 0,
      motorInertiaReflectedToOutputKgm2: 0,
      loadInertiaReflectedToMotorKgm2: 0,
      inertiaRatio: 0,
      bandwidthIsolationRatio: 0,
      isBandwidthInvadingResonance: false,
      isBandwidthAboveResonance: false,
      isPlausible: false,
      plausibilityWarning: '输入参数非正，无法进行二质量谐振推演',
    };
  }

  // 1. 惯量折算
  const motorInertiaReflectedToOutputKgm2 = Jm * (i * i);
  const loadInertiaReflectedToMotorKgm2 = JL / (i * i);
  const inertiaRatio = loadInertiaReflectedToMotorKgm2 / Jm;

  // 2. 谐振频率 (极点) 计算 - 基准在输出端
  const combinedCompliance = (1 / motorInertiaReflectedToOutputKgm2) + (1 / JL);
  const angularResonanceRadS = Math.sqrt(K * combinedCompliance);
  const resonanceFreqHz = angularResonanceRadS / (2 * Math.PI);

  // 3. 反谐振频率 (零点) 计算 - 输出端零点
  const angularAntiResonanceRadS = Math.sqrt(K / JL);
  const antiResonanceFreqHz = angularAntiResonanceRadS / (2 * Math.PI);

  // 4. 带宽隔离度评估
  const f_bw = input.velocityLoopBandwidthHz || 0;
  const bandwidthIsolationRatio = f_bw > 0 ? resonanceFreqHz / f_bw : 0;
  const isBandwidthInvadingResonance = bandwidthIsolationRatio > 0 && bandwidthIsolationRatio < 3.0;
  const isBandwidthAboveResonance = bandwidthIsolationRatio > 0 && bandwidthIsolationRatio <= 1.0;

  // 5. 量级合理性断言 (Robotic joint f_res typically falls within 5 Hz ~ 500 Hz)
  let isPlausible = true;
  let plausibilityWarning: string | undefined;
  if (resonanceFreqHz < 5 || resonanceFreqHz > 500) {
    isPlausible = false;
    plausibilityWarning = `估算机械谐振频率 (${resonanceFreqHz.toFixed(1)} Hz) 超出机器人关节典型物理范围 (5 ~ 500 Hz)，请检查刚度是否未折算或惯量输入单位是否有误！`;
  }

  return {
    resonanceFreqHz: Number(resonanceFreqHz.toFixed(2)),
    angularResonanceRadS: Number(angularResonanceRadS.toFixed(2)),
    antiResonanceFreqHz: Number(antiResonanceFreqHz.toFixed(2)),
    angularAntiResonanceRadS: Number(angularAntiResonanceRadS.toFixed(2)),
    motorInertiaReflectedToOutputKgm2: Number(motorInertiaReflectedToOutputKgm2.toFixed(6)),
    loadInertiaReflectedToMotorKgm2: Number(loadInertiaReflectedToMotorKgm2.toFixed(6)),
    inertiaRatio: Number(inertiaRatio.toFixed(3)),
    bandwidthIsolationRatio: Number(bandwidthIsolationRatio.toFixed(2)),
    isBandwidthInvadingResonance,
    isBandwidthAboveResonance,
    isPlausible,
    plausibilityWarning,
  };
}
