import { WccaComponent, WccaCalcParams } from '../types';

export interface FosterStage {
  r: number; // K/W
  c: number; // J/K
}

export interface TransientThermalParams {
  ambientTempC: number;
  biasPowerWatt: number;
  pulsePowerWatt: number;
  pulseWidthMs: number;
  tjMaxC: number;
  deratingMarginC: number;
  fosterStages: FosterStage[];
  packagePreset?: string;
}

export interface PackagePreset {
  name: string;
  description: string;
  stages: FosterStage[];
  defaultTjMax: number;
  defaultDerating: number;
}

export const AUTOMOTIVE_PACKAGE_PRESETS: Record<string, PackagePreset> = {
  d2pak: {
    name: 'D2PAK / TO-263 (大功率反接保护/大电流MOSFET)',
    description: '典型车规大尺寸表面贴装功率管，大铜皮与高瞬态热容',
    stages: [
      { r: 0.25, c: 0.0012 }, // tau = 0.3 ms
      { r: 0.85, c: 0.015 },  // tau = 12.75 ms
      { r: 3.20, c: 0.180 },  // tau = 576 ms
      { r: 18.5, c: 1.450 },  // tau = 26.8 s
    ],
    defaultTjMax: 175,
    defaultDerating: 25,
  },
  powersso: {
    name: 'PowerSSO-36 / 16 (智能高边开关 HSD 智能芯片)',
    description: '车载车身与底盘域控驱动智能芯片，带电流检测与保护',
    stages: [
      { r: 0.35, c: 0.0008 },
      { r: 1.20, c: 0.0090 },
      { r: 4.80, c: 0.0950 },
      { r: 24.0, c: 0.8500 },
    ],
    defaultTjMax: 150,
    defaultDerating: 25,
  },
  powerpak: {
    name: 'PowerPAK 5x6 / SO-8 (DC-DC / 中小功率MOSFET)',
    description: '紧凑型车载 ECU 电源管理与执行器驱动',
    stages: [
      { r: 0.60, c: 0.0005 },
      { r: 2.40, c: 0.0060 },
      { r: 8.50, c: 0.0600 },
      { r: 36.0, c: 0.6500 },
    ],
    defaultTjMax: 150,
    defaultDerating: 20,
  },
  to247: {
    name: 'TO-247 (OBC / 逆变器 SiC / 绝缘栅双极型器件)',
    description: '车载充电机与主驱高压大功率器件，配专用铝散热器',
    stages: [
      { r: 0.08, c: 0.0035 },
      { r: 0.32, c: 0.0450 },
      { r: 1.10, c: 0.4500 },
      { r: 4.50, c: 3.8000 },
    ],
    defaultTjMax: 175,
    defaultDerating: 30,
  },
};

export interface MonteCarloStats {
  mean: number;
  sigma: number;
  min: number;
  max: number;
  usl: number;
  lsl: number;
  cp: number;
  cpk: number;
  cpkEvaluation: 'Superior (极优)' | 'Capable (标准车规达标)' | 'Marginal (临界)' | 'Critical Alert (严重告警-必须改版或特采)';
  ppm: number;
  passRatePercent: number;
  iterations: number;
  extremeWorstCasePercent: number;
  rssPercent: number;
  histogram: {
    bins: {
      x0: number;
      x1: number;
      mid: number;
      count: number;
      isOutOfSpec: boolean;
      density: number;
    }[];
    curvePoints: { x: number; y: number }[];
  };
  percentiles: {
    p01: number;
    p05: number;
    p50: number;
    p95: number;
    p99: number;
  };
}

/**
 * 1.1 蒙特卡洛仿真与 CPK / PPK 汽车行业标准计算
 */
export function runMonteCarloEngine(
  params: WccaCalcParams,
  numBins = 40
): MonteCarloStats {
  const iterations = params.iterations || 10000;
  const targetLimit = Math.abs(params.targetErrorLimitPercent);
  const usl = targetLimit;
  const lsl = -targetLimit;

  // 1. 计算理论 Extreme Worst-case 和 RSS
  let extremeSum = 0;
  let sumSq = 0;
  params.components.forEach((c) => {
    const compTotal = Math.abs(c.initTolPercent) + Math.abs(c.tempDriftPercent) + Math.abs(c.agingPercent);
    extremeSum += compTotal;
    sumSq += Math.pow(compTotal, 2);
  });
  const extremeWorstCasePercent = Number(extremeSum.toFixed(3));
  const rssPercent = Number(Math.sqrt(sumSq).toFixed(3));

  // 2. Box-Muller 极坐标变换生成正态独立随机抽样
  const samples: number[] = new Array(iterations);
  let sum = 0;
  let sumSquared = 0;

  for (let i = 0; i < iterations; i++) {
    let currentSampleError = 0;
    for (let j = 0; j < params.components.length; j++) {
      const comp = params.components[j];
      const compTotal = Math.abs(comp.initTolPercent) + Math.abs(comp.tempDriftPercent) + Math.abs(comp.agingPercent);
      // 车规元器件容差一般假定 3-sigma 覆盖
      const sigma_comp = compTotal / 3.0;

      // Box-Muller 生成标准正态分布随机数
      let u1 = Math.random();
      while (u1 === 0) u1 = Math.random();
      const u2 = Math.random();
      const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);

      currentSampleError += z * sigma_comp;
    }

    samples[i] = currentSampleError;
    sum += currentSampleError;
    sumSquared += currentSampleError * currentSampleError;
  }

  // 3. 统计指标计算
  const mean = sum / iterations;
  const variance = Math.max(0, (sumSquared - (sum * sum) / iterations) / (iterations - 1));
  const sigma = Math.sqrt(variance);

  // 排序获取分位数和最值
  samples.sort((a, b) => a - b);
  const min = samples[0];
  const max = samples[iterations - 1];

  const p01 = samples[Math.floor(iterations * 0.01)];
  const p05 = samples[Math.floor(iterations * 0.05)];
  const p50 = samples[Math.floor(iterations * 0.50)];
  const p95 = samples[Math.floor(iterations * 0.95)];
  const p99 = samples[Math.floor(iterations * 0.99)];

  // 4. 车规 AIAG 核心指数 Cp & Cpk
  const safeSigma = sigma > 1e-6 ? sigma : 1e-6;
  const cp = (usl - lsl) / (6 * safeSigma);
  const cpu = (usl - mean) / (3 * safeSigma);
  const cpl = (mean - lsl) / (3 * safeSigma);
  const cpk = Math.min(cpu, cpl);

  // AIAG 达标等级评估
  let cpkEvaluation: MonteCarloStats['cpkEvaluation'] = 'Critical Alert (严重告警-必须改版或特采)';
  if (cpk >= 1.67) {
    cpkEvaluation = 'Superior (极优)';
  } else if (cpk >= 1.33) {
    cpkEvaluation = 'Capable (标准车规达标)';
  } else if (cpk >= 1.0) {
    cpkEvaluation = 'Marginal (临界)';
  } else {
    cpkEvaluation = 'Critical Alert (严重告警-必须改版或特采)';
  }

  // 5. 实际合格率与 PPM 计算
  const outOfSpecCount = samples.filter((s) => s < lsl || s > usl).length;
  const passRatePercent = Number((((iterations - outOfSpecCount) / iterations) * 100).toFixed(2));
  // 结合正态 CDF 与实际采样的 PPM
  const actualPpm = Math.round((outOfSpecCount / iterations) * 1000000);

  // 6. 生成 40 个直方图 Bin
  const binMin = Math.min(min, lsl * 1.3);
  const binMax = Math.max(max, usl * 1.3);
  const binWidth = (binMax - binMin) / numBins;

  const bins: MonteCarloStats['histogram']['bins'] = [];
  for (let b = 0; b < numBins; b++) {
    const x0 = binMin + b * binWidth;
    const x1 = x0 + binWidth;
    const mid = (x0 + x1) / 2;
    bins.push({
      x0,
      x1,
      mid,
      count: 0,
      isOutOfSpec: mid < lsl || mid > usl,
      density: 0,
    });
  }

  samples.forEach((val) => {
    let bIdx = Math.floor((val - binMin) / binWidth);
    if (bIdx < 0) bIdx = 0;
    if (bIdx >= numBins) bIdx = numBins - 1;
    bins[bIdx].count++;
  });

  // 归一化密度
  bins.forEach((b) => {
    b.density = b.count / (iterations * binWidth);
  });

  // 7. 高斯分布理论拟合曲线采样点（用于绘制黄色平滑贝塞尔/多段线）
  const curvePoints: { x: number; y: number }[] = [];
  const curveSamples = 80;
  for (let c = 0; c <= curveSamples; c++) {
    const x = binMin + (c / curveSamples) * (binMax - binMin);
    const exponent = -0.5 * Math.pow((x - mean) / safeSigma, 2);
    const y = (1.0 / (safeSigma * Math.sqrt(2 * Math.PI))) * Math.exp(exponent);
    curvePoints.push({ x, y });
  }

  return {
    mean: Number(mean.toFixed(3)),
    sigma: Number(sigma.toFixed(3)),
    min: Number(min.toFixed(3)),
    max: Number(max.toFixed(3)),
    usl: Number(usl.toFixed(3)),
    lsl: Number(lsl.toFixed(3)),
    cp: Number(cp.toFixed(2)),
    cpk: Number(cpk.toFixed(2)),
    cpkEvaluation,
    ppm: actualPpm,
    passRatePercent,
    iterations,
    extremeWorstCasePercent,
    rssPercent,
    histogram: {
      bins,
      curvePoints,
    },
    percentiles: {
      p01: Number(p01.toFixed(3)),
      p05: Number(p05.toFixed(3)),
      p50: Number(p50.toFixed(3)),
      p95: Number(p95.toFixed(3)),
      p99: Number(p99.toFixed(3)),
    },
  };
}

/**
 * 1.2 瞬态多阶 Foster 4-RC 热阻网络与脉冲结温计算器
 */
export interface TransientThermalResult {
  steadyRthJA: number;
  zthPulse: number;
  tempRiseBiasC: number;
  tempRisePulseC: number;
  totalTempRiseC: number;
  peakJunctionTempC: number;
  deratedLimitC: number;
  marginC: number;
  isDeratingMet: boolean;
  isAbsoluteTjExceeded: boolean;
  vetoTriggered: boolean;
  vetoReason?: string;
  timeSeries: {
    timeMs: number;
    zth: number;
    tj: number;
  }[];
}

export function calculateTransientThermal(
  params: TransientThermalParams
): TransientThermalResult {
  const {
    ambientTempC,
    biasPowerWatt,
    pulsePowerWatt,
    pulseWidthMs,
    tjMaxC,
    deratingMarginC,
    fosterStages,
  } = params;

  // 1. 稳态热阻 RthJA = 4 阶 R 之和
  const steadyRthJA = fosterStages.reduce((sum, s) => sum + s.r, 0);

  // 2. 脉冲宽度对应的瞬态热阻 Zth(tp)
  // tp 转为秒
  const tpSeconds = pulseWidthMs / 1000.0;
  let zthPulse = 0;
  fosterStages.forEach((stage) => {
    const tau = stage.r * stage.c; // 时间常数 tau_i = R_i * C_i (秒)
    if (tau > 0) {
      zthPulse += stage.r * (1 - Math.exp(-tpSeconds / tau));
    } else {
      zthPulse += stage.r;
    }
  });

  // 3. 结温分量推算
  // 稳态偏置静态功耗导致的基础温升
  const tempRiseBiasC = biasPowerWatt * steadyRthJA;
  // 瞬态单次脉冲功耗导致的附加温升
  const tempRisePulseC = pulsePowerWatt * zthPulse;
  const totalTempRiseC = tempRiseBiasC + tempRisePulseC;
  const peakJunctionTempC = ambientTempC + totalTempRiseC;

  // 4. 降额规范判定
  const deratedLimitC = tjMaxC - deratingMarginC;
  const marginC = deratedLimitC - peakJunctionTempC;
  const isDeratingMet = marginC >= 0;
  const isAbsoluteTjExceeded = peakJunctionTempC > tjMaxC;

  let vetoTriggered = false;
  let vetoReason: string | undefined;

  if (isAbsoluteTjExceeded) {
    vetoTriggered = true;
    vetoReason = `【VETO 一票否决：击穿器件绝对极限结温】脉冲峰值结温已达 ${peakJunctionTempC.toFixed(1)}℃，突破芯片硅片物理极限 Tj_max (${tjMaxC}℃)，极易在抛负载或电机堵转中发生热失控起火！`;
  } else if (!isDeratingMet) {
    vetoReason = `【降额违规告警】脉冲峰值结温达到 ${peakJunctionTempC.toFixed(1)}℃，击穿车规降额规范阈值 (${deratedLimitC}℃)，欠缺裕量 ${Math.abs(marginC).toFixed(1)}℃。必须进行散热优化、缩短脉宽或走主机厂特批！`;
  }

  // 5. 生成对数时间轴的 Zth(t) 瞬态响应曲线 (0.01ms ~ 100,000ms = 100s)
  const timeSeries: TransientThermalResult['timeSeries'] = [];
  const minTimeLog = -2; // 10^-2 ms = 0.01 ms
  const maxTimeLog = 5;  // 10^5 ms = 100,000 ms = 100 s
  const steps = 60;

  for (let i = 0; i <= steps; i++) {
    const logT = minTimeLog + (i / steps) * (maxTimeLog - minTimeLog);
    const tMs = Math.pow(10, logT);
    const tSec = tMs / 1000.0;

    let zthCurrent = 0;
    fosterStages.forEach((s) => {
      const tau = s.r * s.c;
      if (tau > 0) {
        zthCurrent += s.r * (1 - Math.exp(-tSec / tau));
      } else {
        zthCurrent += s.r;
      }
    });

    const tjCurrent = ambientTempC + biasPowerWatt * steadyRthJA + pulsePowerWatt * zthCurrent;

    timeSeries.push({
      timeMs: Number(tMs.toFixed(3)),
      zth: Number(zthCurrent.toFixed(4)),
      tj: Number(tjCurrent.toFixed(2)),
    });
  }

  return {
    steadyRthJA: Number(steadyRthJA.toFixed(2)),
    zthPulse: Number(zthPulse.toFixed(4)),
    tempRiseBiasC: Number(tempRiseBiasC.toFixed(1)),
    tempRisePulseC: Number(tempRisePulseC.toFixed(1)),
    totalTempRiseC: Number(totalTempRiseC.toFixed(1)),
    peakJunctionTempC: Number(peakJunctionTempC.toFixed(1)),
    deratedLimitC: Number(deratedLimitC.toFixed(1)),
    marginC: Number(marginC.toFixed(1)),
    isDeratingMet,
    isAbsoluteTjExceeded,
    vetoTriggered,
    vetoReason,
    timeSeries,
  };
}
