/**
 * 车载电机驱动瞬态脉冲热阻与堵转结温计算器 (Foster 4-Stage RC Network)
 * 专门用于评估座椅电机硬限位堵转、滑移屏卡滞、机器人瞬间大扭矩过载下的 MOSFET 结温峰值
 */

export interface FosterStage {
  r: number; // 热阻 R_i (K/W)
  c: number; // 热容 C_i (J/K)
}

export interface StallThermalParams {
  ambientTempC: number;          // 环境温度 (℃)，例如座椅发泡棉内 85℃ 或发动机舱 105℃
  biasPowerW: number;            // 堵转前的静态/正常待机功耗 (W)
  stallCurrentA: number;         // 堵转相电流 (A)，例如 25A
  rdson25mOhm: number;           // MOSFET 25℃ 标称导通内阻 (mΩ)，例如 2.5mΩ
  stallDurationMs: number;       // 机械堵转持续时间 (ms)，例如 1000ms (1s) 或 3000ms
  tjMaxC?: number;               // 芯片最大允许结温 (℃)，车规典型 150℃ 或 175℃
  tjDeratedLimitC?: number;      // 车规降额结温红线 (℃)，典型 125℃ 或 140℃
  fosterStages?: FosterStage[];  // 自定义 4 阶 Foster 参数
  packageType?: 'POWERPAK56' | 'D2PAK' | 'POWERSSO36'; // 典型车规封装预设
}

export interface ThermalTimePoint {
  timeMs: number;
  zth: number;       // 瞬态热阻 (K/W)
  deltaT: number;    // 温升 (K)
  tj: number;        // 实时结温 (℃)
}

export interface StallThermalResult {
  initialTj: number;             // 初始稳态结温 (℃)
  peakTj: number;                // 堵转结束瞬间峰值结温 (℃)
  maxDeltaT: number;             // 最大脉冲温升 (K)
  stallPowerW: number;           // 堵转平均耗散电功率 (W, 计入高温Rdson温漂)
  effectiveZth: number;          // 堵转脉宽对应的有效瞬态热阻 Z_th (K/W)
  isExceedingTjMax: boolean;     // 是否超出额定极限结温 Tj_max
  isExceedingDerating: boolean;  // 是否突破车规降额红线 Tj_derated
  status: 'PASS' | 'WARNING_DERATING' | 'FAILED_BURNOUT';
  thermalCurve: ThermalTimePoint[]; // 瞬态温升曲线数据点 (用于绘制图表)
  recommendation: string;        // 工程建议 (如缩短软件保护阈值、换更低内阻MOS、优化散热)
}

// 常见车规电机驱动封装的 4 阶 Foster 典型热参数 (Junction-to-Ambient / PCB)
export const FOSTER_PRESETS: Record<'POWERPAK56' | 'D2PAK' | 'POWERSSO36', FosterStage[]> = {
  POWERPAK56: [
    // 典型 5x6mm 紧凑封装，用于座椅模块或灵巧关节
    { r: 0.55, c: 0.0006 }, // tau ~ 0.33ms
    { r: 2.20, c: 0.0070 }, // tau ~ 15.4ms
    { r: 7.80, c: 0.0750 }, // tau ~ 585ms
    { r: 32.0, c: 0.7200 }, // tau ~ 23s
  ],
  D2PAK: [
    // 大尺寸 TO-263，大铜皮焊盘，高热容
    { r: 0.22, c: 0.0015 }, // tau ~ 0.33ms
    { r: 0.80, c: 0.0180 }, // tau ~ 14.4ms
    { r: 3.10, c: 0.2100 }, // tau ~ 651ms
    { r: 16.5, c: 1.6000 }, // tau ~ 26.4s
  ],
  POWERSSO36: [
    // 多路集成桥驱动芯片
    { r: 0.38, c: 0.0009 },
    { r: 1.35, c: 0.0100 },
    { r: 5.20, c: 0.1100 },
    { r: 22.5, c: 0.9000 },
  ],
};

/**
 * 计算 Foster 4 阶网络在时间 t (秒) 时的瞬态热阻 Z_th(t)
 * Z_th(t) = sum( R_i * (1 - exp(-t / (R_i * C_i))) )
 */
export function calculateFosterZth(stages: FosterStage[], timeSec: number): number {
  if (timeSec <= 0) return 0;
  let zth = 0;
  for (const stage of stages) {
    const tau = Math.max(1e-6, stage.r * stage.c);
    const stageZth = stage.r * (1 - Math.exp(-timeSec / tau));
    zth += stageZth;
  }
  return zth;
}

/**
 * 堵转结温脉冲模拟核心计算器
 */
export function calculateStallTransientThermal(
  params: StallThermalParams
): StallThermalResult {
  const {
    ambientTempC,
    biasPowerW,
    stallCurrentA,
    rdson25mOhm,
    stallDurationMs,
    tjMaxC = 175,
    tjDeratedLimitC = 140,
    packageType = 'POWERPAK56',
  } = params;

  const stages = params.fosterStages || FOSTER_PRESETS[packageType] || FOSTER_PRESETS.POWERPAK56;

  // 1. 稳态总热阻 R_th_total = sum(R_i)
  const rthTotal = stages.reduce((acc, cur) => acc + cur.r, 0);

  // 2. 堵转前初始稳态结温 (各 RC 阶初始温度降 T_i(0) = biasPowerW * R_i)
  const initialTj = ambientTempC + biasPowerW * rthTotal;
  
  // 3. 维护各阶 RC 网络当前时刻的温升 (状态变量矩阵)
  const T_nodes = stages.map(stage => biasPowerW * stage.r);

  const durationSec = Math.max(0.1, stallDurationMs) / 1000;
  // 为了保证平滑曲线并捕捉极细微的动态反弹，使用 500 步
  const steps = 500;
  const dt = durationSec / steps;
  
  let currentTj = initialTj;
  let stallPowerW = 0;
  let isRunaway = false;
  const thermalCurve: ThermalTimePoint[] = [];
  
  for (let i = 0; i <= steps; i++) {
    const tSec = dt * i;
    const tMs = tSec * 1000;
    
    // 基于上一步的结温计算当前的 Rds(on) 和 功耗
    const tempRiseAbove25 = Math.max(0, currentTj - 25);
    const rdsonHotOhm = (rdson25mOhm * 1e-3) * (1 + 0.004 * tempRiseAbove25);
    stallPowerW = Math.pow(stallCurrentA, 2) * rdsonHotOhm;

    // 记录当次计算点 (如果是指定的步数节点，用于 UI 渲染)
    if (i % Math.ceil(steps / 40) === 0 || i === steps) {
      thermalCurve.push({
        timeMs: Math.round(tMs),
        zth: Number(((currentTj - ambientTempC) / (stallPowerW || 1)).toFixed(3)),
        deltaT: Number((currentTj - initialTj).toFixed(1)),
        tj: Number(currentTj.toFixed(1)),
      });
    }

    if (currentTj > 300) {
      isRunaway = true;
      break;
    }
    
    // RC 状态矩阵差分步进 (Exact Exponential Update)
    let newTj = ambientTempC;
    for (let j = 0; j < stages.length; j++) {
      const stage = stages[j];
      const tau = stage.r * stage.c;
      // 离散化状态空间更新：T_i[k+1] = T_i[k] * exp(-dt/tau) + P[k] * R_i * (1 - exp(-dt/tau))
      const exp_decay = Math.exp(-dt / tau);
      T_nodes[j] = T_nodes[j] * exp_decay + stallPowerW * stage.r * (1 - exp_decay);
      newTj += T_nodes[j];
    }
    
    currentTj = newTj;
  }

  const peakTj = thermalCurve[thermalCurve.length - 1].tj;
  const maxDeltaT = peakTj - initialTj;
  const isExceedingTjMax = peakTj > tjMaxC;
  const isExceedingDerating = peakTj > tjDeratedLimitC;
  
  // 等效末态 Zth (作为辅助指标返回)
  const effectiveZth = calculateFosterZth(stages, durationSec);

  let status: 'PASS' | 'WARNING_DERATING' | 'FAILED_BURNOUT' = 'PASS';
  let recommendation = '堵转温升在车规降额线以内，且无热失控趋势，热设计安全可靠。';

  if (isRunaway || isExceedingTjMax) {
    status = 'FAILED_BURNOUT';
    recommendation = `【严重热击穿/热失控风险】检测到雪崩热失控正反馈(温度↑ -> Rds_on↑ -> 损耗↑ -> 温度↑↑)！堵转 ${stallDurationMs}ms 结温飙升至 ${peakTj.toFixed(1)}℃，突破绝对极限 (${tjMaxC}℃)！必然引起焊点熔出或管芯烧毁。建议：1. 缩短软件过流保护时间至 ${Math.floor(stallDurationMs * 0.3)}ms 以内；2. 更换导通内阻更低的MOSFET；3. 改用高热容 D2PAK 封装。`;
  } else if (isExceedingDerating) {
    status = 'WARNING_DERATING';
    recommendation = `【突破降额红线】峰值结温 ${peakTj.toFixed(1)}℃，虽暂未引发雪崩热失控，但突破了车规工程降额门限 (${tjDeratedLimitC}℃)。长期老化将加速封装应力退化，建议优化电流检测去饱和保护时间。`;
  }

  return {
    initialTj: Number(initialTj.toFixed(1)),
    peakTj: Number(peakTj.toFixed(1)),
    maxDeltaT: Number(maxDeltaT.toFixed(1)),
    stallPowerW: Number(stallPowerW.toFixed(1)),
    effectiveZth: Number(effectiveZth.toFixed(3)),
    isExceedingTjMax,
    isExceedingDerating,
    status,
    thermalCurve,
    recommendation,
  };
}
