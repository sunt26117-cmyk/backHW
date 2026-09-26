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
