import React, { useState, useEffect } from 'react';
import {
  Calculator,
  Play,
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  Cpu,
  Thermometer,
  Zap,
  Activity,
  Flame,
  Layers,
  ShieldAlert,
} from 'lucide-react';
import { WccaCalcParams, ThermalCalcParams, VoltageMarginParams, ProjectContext, IssueInput } from '../types';
import { MotorDriveToolbox } from './MotorDriveToolbox';
import {
  runMonteCarloEngine,
  MonteCarloStats,
  calculateTransientThermal,
  TransientThermalParams,
  TransientThermalResult,
  AUTOMOTIVE_PACKAGE_PRESETS,
} from '../utils/mathPhysicsEngine';

/**
 * 1.1 原生 SVG 蒙特卡洛抽样直方图与高斯正态拟合曲线组件
 */
interface DistributionChartProps {
  stats: MonteCarloStats;
}

const DistributionChart: React.FC<DistributionChartProps> = ({ stats }) => {
  const { histogram, lsl, usl, mean, sigma, cpk, cpkEvaluation, ppm, passRatePercent } = stats;
  const width = 720;
  const height = 280;
  const padding = { top: 30, right: 35, bottom: 45, left: 50 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  const bins = histogram.bins;
  const minX = bins[0].x0;
  const maxX = bins[bins.length - 1].x1;
  const maxCount = Math.max(...bins.map((b) => b.count), 1);

  // 坐标映射工具
  const scaleX = (val: number) => {
    return padding.left + ((val - minX) / (maxX - minX)) * innerWidth;
  };

  const scaleY = (count: number) => {
    return padding.top + innerHeight - (count / maxCount) * innerHeight;
  };

  // 生成高斯拟合曲线路径
  const maxCurveDensity = Math.max(...histogram.curvePoints.map((p) => p.y), 0.001);
  const curvePath = histogram.curvePoints
    .map((pt, idx) => {
      const cx = scaleX(pt.x);
      // 曲线高度缩放对应到直方图峰值
      const cy = padding.top + innerHeight - (pt.y / maxCurveDensity) * (innerHeight * 0.95);
      return `${idx === 0 ? 'M' : 'L'} ${cx.toFixed(1)} ${cy.toFixed(1)}`;
    })
    .join(' ');

  const lslX = scaleX(lsl);
  const uslX = scaleX(usl);
  const meanX = scaleX(mean);

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 sm:p-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
        <div className="flex items-center space-x-2">
          <Activity className="w-4 h-4 text-blue-400" />
          <span className="text-xs font-bold text-slate-200">
            蒙特卡洛钟形分布拟合直方图 (10,000次抽样 / 40 Bins)
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[11px]">
          <span className="flex items-center text-slate-400">
            <span className="w-2.5 h-2.5 bg-blue-500/70 inline-block rounded-xs mr-1.5" />
            在轨合格抽样
          </span>
          <span className="flex items-center text-red-400 font-semibold">
            <span className="w-2.5 h-2.5 bg-red-500 inline-block rounded-xs mr-1.5" />
            超差不良抽样 (PPM: {ppm.toLocaleString()})
          </span>
          <span className="flex items-center text-amber-300">
            <span className="w-4 h-0.5 bg-amber-400 inline-block mr-1.5" />
            高斯正态拟合曲线
          </span>
        </div>
      </div>

      {/* 原生 SVG 图表渲染 */}
      <div className="w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto max-h-[300px] select-none font-mono"
        >
          {/* 背景网格线 */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const y = padding.top + innerHeight * (1 - ratio);
            const countLabel = Math.round(maxCount * ratio);
            return (
              <g key={ratio}>
                <line
                  x1={padding.left}
                  y1={y}
                  x2={width - padding.right}
                  y2={y}
                  stroke="#334155"
                  strokeWidth="0.8"
                  strokeDasharray="4 4"
                />
                <text
                  x={padding.left - 8}
                  y={y + 3}
                  textAnchor="end"
                  fill="#64748b"
                  fontSize="10"
                >
                  {countLabel}
                </text>
              </g>
            );
          })}

          {/* 直方图柱体 */}
          {bins.map((bin, i) => {
            const bx = scaleX(bin.x0);
            const bWidth = Math.max(1, scaleX(bin.x1) - bx - 0.8);
            const by = scaleY(bin.count);
            const bHeight = padding.top + innerHeight - by;

            return (
              <rect
                key={i}
                x={bx}
                y={by}
                width={bWidth}
                height={bHeight}
                fill={bin.isOutOfSpec ? '#ef4444' : '#3b82f6'}
                fillOpacity={bin.isOutOfSpec ? 0.9 : 0.65}
                stroke={bin.isOutOfSpec ? '#dc2626' : '#2563eb'}
                strokeWidth="0.5"
                rx="1"
              >
                <title>
                  范围: [{bin.x0.toFixed(2)}%, {bin.x1.toFixed(2)}%] | 频次: {bin.count} | {bin.isOutOfSpec ? '超出公差上限/下限' : '合格'}
                </title>
              </rect>
            );
          })}

          {/* 高斯理论拟合曲线 */}
          <path
            d={curvePath}
            fill="none"
            stroke="#facc15"
            strokeWidth="2.4"
            strokeLinecap="round"
          />

          {/* 均值 Mean 线 */}
          <line
            x1={meanX}
            y1={padding.top}
            x2={meanX}
            y2={padding.top + innerHeight}
            stroke="#38bdf8"
            strokeWidth="1.5"
            strokeDasharray="3 3"
          />
          <text
            x={meanX}
            y={padding.top - 8}
            textAnchor="middle"
            fill="#38bdf8"
            fontSize="10"
            fontWeight="bold"
          >
            μ = {mean > 0 ? `+${mean}%` : `${mean}%`}
          </text>

          {/* 规格下限 LSL 线 */}
          <line
            x1={lslX}
            y1={padding.top - 5}
            x2={lslX}
            y2={padding.top + innerHeight}
            stroke="#ef4444"
            strokeWidth="2"
            strokeDasharray="5 3"
          />
          <rect
            x={lslX - 32}
            y={padding.top + 8}
            width="64"
            height="18"
            rx="3"
            fill="#7f1d1d"
            stroke="#ef4444"
            strokeWidth="1"
          />
          <text
            x={lslX}
            y={padding.top + 20}
            textAnchor="middle"
            fill="#fecaca"
            fontSize="9"
            fontWeight="bold"
          >
            LSL {lsl}%
          </text>

          {/* 规格上限 USL 线 */}
          <line
            x1={uslX}
            y1={padding.top - 5}
            x2={uslX}
            y2={padding.top + innerHeight}
            stroke="#ef4444"
            strokeWidth="2"
            strokeDasharray="5 3"
          />
          <rect
            x={uslX - 32}
            y={padding.top + 8}
            width="64"
            height="18"
            rx="3"
            fill="#7f1d1d"
            stroke="#ef4444"
            strokeWidth="1"
          />
          <text
            x={uslX}
            y={padding.top + 20}
            textAnchor="middle"
            fill="#fecaca"
            fontSize="9"
            fontWeight="bold"
          >
            USL +{usl}%
          </text>

          {/* X 轴刻度线与标签 */}
          <line
            x1={padding.left}
            y1={padding.top + innerHeight}
            x2={width - padding.right}
            y2={padding.top + innerHeight}
            stroke="#475569"
            strokeWidth="1.2"
          />

          {[-usl * 1.5, lsl, lsl / 2, 0, usl / 2, usl, usl * 1.5].map(
            (val, idx) => {
              if (val < minX || val > maxX) return null;
              const xPos = scaleX(val);
              return (
                <g key={idx}>
                  <line
                    x1={xPos}
                    y1={padding.top + innerHeight}
                    x2={xPos}
                    y2={padding.top + innerHeight + 5}
                    stroke="#64748b"
                    strokeWidth="1"
                  />
                  <text
                    x={xPos}
                    y={padding.top + innerHeight + 17}
                    textAnchor="middle"
                    fill="#94a3b8"
                    fontSize="9.5"
                  >
                    {val > 0 ? `+${val.toFixed(1)}%` : `${val.toFixed(1)}%`}
                  </text>
                </g>
              );
            }
          )}
        </svg>
      </div>

      {/* AIAG 标准 CPK 与制程能力告警看板 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-3 border-t border-slate-800">
        <div className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-800">
          <span className="text-[10px] text-slate-400 block">AIAG 制程能力指数 Cpk</span>
          <div className="flex items-center space-x-2 mt-0.5">
            <span
              className={`text-lg font-bold font-mono ${
                cpk >= 1.33 ? 'text-emerald-400' : cpk >= 1.0 ? 'text-amber-400' : 'text-red-400'
              }`}
            >
              {cpk}
            </span>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                cpk >= 1.33
                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                  : cpk >= 1.0
                  ? 'bg-amber-950 text-amber-300 border border-amber-700'
                  : 'bg-red-950 text-red-300 border border-red-700 animate-pulse'
              }`}
            >
              {cpk >= 1.67 ? '极优' : cpk >= 1.33 ? '达标' : cpk >= 1.0 ? '临界' : '标红告警'}
            </span>
          </div>
        </div>

        <div className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-800">
          <span className="text-[10px] text-slate-400 block">不合格缺陷率 PPM</span>
          <div className="text-lg font-bold font-mono text-red-400 mt-0.5">
            {ppm.toLocaleString()} <span className="text-xs font-normal text-slate-500">PPM</span>
          </div>
        </div>

        <div className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-800">
          <span className="text-[10px] text-slate-400 block">统计合格率 (Pass Rate)</span>
          <div className="text-lg font-bold font-mono text-blue-400 mt-0.5">
            {passRatePercent}%
          </div>
        </div>

        <div className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-800">
          <span className="text-[10px] text-slate-400 block">分布统计标准差 σ</span>
          <div className="text-lg font-bold font-mono text-slate-200 mt-0.5">
            ±{sigma}%
          </div>
        </div>
      </div>

      {cpk < 1.0 && (
        <div className="mt-3 p-2.5 bg-red-950/40 border border-red-500/50 rounded-lg flex items-start space-x-2 text-xs text-red-300">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <strong>【车规 AIAG 严重超差告警】：</strong> 当前制程能力指数 Cpk ({cpk}) &lt; 1.0，
            极端与温漂老化叠加导致大量抽样溢出规格限值 (不良率估算达到 {ppm} PPM)。
            <strong>禁止直接量产放行！</strong> 必须进行 PCB 改版更换更低温漂精密元器件，或申请
            《主机厂客户工程让步特批》并在产线导入 100% EOL 常温/高温双点校准！
          </div>
        </div>
      )}
    </div>
  );
};

interface EngineeringCalculatorViewProps {
  context?: ProjectContext;
  issue?: IssueInput;
  setIssue?: (issue: IssueInput) => void;
}

export const EngineeringCalculatorView: React.FC<EngineeringCalculatorViewProps> = ({ context, issue, setIssue }) => {
  const [activeCalc, setActiveCalc] = useState<'wcca' | 'foster_thermal' | 'steady_thermal' | 'voltage' | 'motor_drive'>('motor_drive');

  // WCCA States
  const [wccaParams, setWccaParams] = useState<WccaCalcParams>({
    components: [
      { name: 'R_shunt (分流采样精密电阻)', nominal: 10, initTolPercent: 0.5, tempDriftPercent: 0.8, agingPercent: 0.5, distribution: 'gaussian' },
      { name: 'OpAmp Vos (运放失调电压温漂)', nominal: 5, initTolPercent: 1.0, tempDriftPercent: 1.2, agingPercent: 0.3, distribution: 'gaussian' },
      { name: 'V_ref (基准电压基准芯片)', nominal: 2500, initTolPercent: 0.2, tempDriftPercent: 0.4, agingPercent: 0.2, distribution: 'gaussian' },
      { name: 'ADC Gain (MCU采样增益与积分误差)', nominal: 1, initTolPercent: 0.3, tempDriftPercent: 0.5, agingPercent: 0.2, distribution: 'gaussian' },
    ],
    targetErrorLimitPercent: 1.2,
    iterations: 10000,
  });
  const [monteCarloStats, setMonteCarloStats] = useState<MonteCarloStats | null>(null);
  const [isWccaRunning, setIsWccaRunning] = useState(false);

  // 1.2 瞬态多阶 Foster 4-RC Thermal States
  const [selectedPackage, setSelectedPackage] = useState<string>('d2pak');
  const [transientParams, setTransientParams] = useState<TransientThermalParams>({
    ambientTempC: 85,
    biasPowerWatt: 1.2,
    pulsePowerWatt: 85,
    pulseWidthMs: 40,
    tjMaxC: AUTOMOTIVE_PACKAGE_PRESETS.d2pak.defaultTjMax,
    deratingMarginC: AUTOMOTIVE_PACKAGE_PRESETS.d2pak.defaultDerating,
    fosterStages: [...AUTOMOTIVE_PACKAGE_PRESETS.d2pak.stages],
  });
  const [transientResult, setTransientResult] = useState<TransientThermalResult | null>(null);

  // 稳态 Thermal States
  const [thermalParams, setThermalParams] = useState<ThermalCalcParams>({
    powerLossWatt: 1.85,
    ambientTempC: 85,
    rthJA: 24,
    rthJC: 1.8,
    tjMaxC: 150,
    deratingMarginC: 25,
  });
  const [thermalResult, setThermalResult] = useState<any>(null);

  // Voltage Margin States
  const [voltageParams, setVoltageParams] = useState<VoltageMarginParams>({
    nominalVoltage: 3.3,
    regulatorTolerancePercent: 1.5,
    lineAndSwitchDropMv: 45,
    transientDipMv: 95,
    minAllowedVoltage: 3.0,
  });
  const [voltageResult, setVoltageResult] = useState<any>(null);

  // 当前工程场景回填：计算器默认值只作为示例，进入具体工程时优先用当前输入。
  useEffect(() => {
    const text = `${issue?.requirement || ''} ${issue?.actualMeasurement || ''} ${issue?.testCondition || ''} ${issue?.failurePhenomenon || ''}`;
    const m = issue?.measuredValues || {};
    const num = (k: string) => { const v = Number(m[k]); return Number.isFinite(v) ? v : undefined; };
    const limitMatch = text.match(/(?:±|<=|≤|\+\/-)\s*(\d+(?:\.\d+)?)\s*%/);
    const target = limitMatch ? Number(limitMatch[1]) : undefined;
    if (target && target > 0 && target < 20) setWccaParams(prev => ({ ...prev, targetErrorLimitPercent: target }));
    const shuntTol = num('shuntTolerancePct');
    if (shuntTol !== undefined) setWccaParams(prev => ({ ...prev, components: prev.components.map((c, i) => i === 0 ? { ...c, initTolPercent: shuntTol } : c) }));
    const hot = num('ambientTempC') ?? num('junctionTempC');
    if (hot !== undefined) setThermalParams(prev => ({ ...prev, ambientTempC: hot }));
    const power = num('powerLossW');
    if (power !== undefined) setThermalParams(prev => ({ ...prev, powerLossWatt: power }));
  }, [issue?.requirement, issue?.actualMeasurement, issue?.testCondition, issue?.failurePhenomenon, issue?.measuredValues]);

  // 初始化时自动运行一次 WCCA 与瞬态热阻
  useEffect(() => {
    handleRunWcca();
    handleRunTransientThermal();
  }, []);

  // 运行 WCCA 蒙特卡洛
  const handleRunWcca = () => {
    setIsWccaRunning(true);
    setTimeout(() => {
      const stats = runMonteCarloEngine(wccaParams, 40);
      setMonteCarloStats(stats);
      setIsWccaRunning(false);
    }, 40);
  };

  // 切换封装预设
  const handleSelectPackage = (pkgKey: string) => {
    setSelectedPackage(pkgKey);
    const preset = AUTOMOTIVE_PACKAGE_PRESETS[pkgKey];
    if (preset) {
      const updated: TransientThermalParams = {
        ...transientParams,
        tjMaxC: preset.defaultTjMax,
        deratingMarginC: preset.defaultDerating,
        fosterStages: preset.stages.map((s) => ({ ...s })),
      };
      setTransientParams(updated);
      const res = calculateTransientThermal(updated);
      setTransientResult(res);
    }
  };

  // 运行瞬态 Foster RC 热阻计算
  const handleRunTransientThermal = () => {
    const res = calculateTransientThermal(transientParams);
    setTransientResult(res);
  };

  // 稳态热阻计算
  const handleRunThermal = () => {
    const { powerLossWatt, ambientTempC, rthJA, tjMaxC, deratingMarginC } = thermalParams;
    const tempRise = powerLossWatt * rthJA;
    const junctionTemp = ambientTempC + tempRise;
    const deratedMax = tjMaxC - deratingMarginC;
    const margin = deratedMax - junctionTemp;

    setThermalResult({
      tempRiseC: Number(tempRise.toFixed(1)),
      junctionTempC: Number(junctionTemp.toFixed(1)),
      deratedLimitC: deratedMax,
      actualMarginC: Number(margin.toFixed(1)),
      isDeratingMet: margin >= 0,
      riskLevel: margin < 0 ? 'High' : margin < 5 ? 'Medium' : 'Low',
    });
  };

  // 电压动态跌落裕量计算
  const handleRunVoltage = () => {
    const { nominalVoltage, regulatorTolerancePercent, lineAndSwitchDropMv, transientDipMv, minAllowedVoltage } = voltageParams;
    const minRegulator = nominalVoltage * (1 - regulatorTolerancePercent / 100);
    const worstCaseMin = minRegulator - lineAndSwitchDropMv / 1000 - transientDipMv / 1000;
    const marginMv = (worstCaseMin - minAllowedVoltage) * 1000;

    setVoltageResult({
      nominalVoltage,
      minRegulatorVoltage: Number(minRegulator.toFixed(3)),
      worstCaseMinVoltage: Number(worstCaseMin.toFixed(3)),
      minAllowedVoltage,
      safetyMarginMv: Number(marginMv.toFixed(1)),
      isSafe: marginMv >= 0,
    });
  };

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-base font-bold text-white flex items-center">
              <Calculator className="w-5 h-5 mr-2 text-blue-400" />
              车规确定性工程计算引擎与物理图表引擎
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              遵循 AIAG 与 ISO 26262 车规准则。集成 10,000 次蒙特卡洛直方图与 Cpk 计算、Foster 4 阶 RC 瞬态脉冲热阻网络以及动态电压轨跌落评估。
            </p>
            {context && issue && <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px]"><span className="px-2 py-1 rounded bg-blue-950/50 border border-blue-900/50 text-blue-300">当前工程：{context.projectName}</span><span className="px-2 py-1 rounded bg-emerald-950/50 border border-emerald-900/50 text-emerald-300">数值优先来源：{issue.measuredValueSource === 'BENCHMARK' ? '系统基准样例（可覆盖）' : issue.measuredValueSource === 'IMPORTED' ? '导入文件' : '工程师实测回填'}</span><span className="px-2 py-1 rounded bg-slate-950 border border-slate-800 text-slate-400">缺失参数不会自动冒充实测</span></div>}
          </div>
        </div>

        {/* 顶部标签切换器 */}
        <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-4 mb-6 text-xs">
          <button
            onClick={() => setActiveCalc('wcca')}
            className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg font-medium transition cursor-pointer ${
              activeCalc === 'wcca'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            <span>1. WCCA 极端法 / RSS / 蒙特卡洛直方图 (Cpk)</span>
          </button>

          <button
            onClick={() => {
              setActiveCalc('foster_thermal');
              if (!transientResult) handleRunTransientThermal();
            }}
            className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg font-medium transition cursor-pointer ${
              activeCalc === 'foster_thermal'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <Flame className="w-4 h-4 text-amber-400" />
            <span>2. 瞬态 4 阶 Foster RC 热阻与脉冲结温 (ISO 7637-2/堵转)</span>
          </button>

          <button
            onClick={() => {
              setActiveCalc('steady_thermal');
              if (!thermalResult) handleRunThermal();
            }}
            className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg font-medium transition cursor-pointer ${
              activeCalc === 'steady_thermal'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <Thermometer className="w-4 h-4" />
            <span>3. 稳态结温与车规降额裕量 (Steady-state)</span>
          </button>

          <button
            onClick={() => {
              setActiveCalc('voltage');
              if (!voltageResult) handleRunVoltage();
            }}
            className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg font-medium transition cursor-pointer ${
              activeCalc === 'voltage'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <Zap className="w-4 h-4" />
            <span>4. 电源轨动态瞬态跌落与复位安全裕量</span>
          </button>

          <button
            onClick={() => setActiveCalc('motor_drive')}
            className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg font-medium transition cursor-pointer ${
              activeCalc === 'motor_drive'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <Cpu className="w-4 h-4 text-emerald-400" />
            <span className="flex items-center gap-1.5">
              5. BLDC 电机驱动专项物理核算工具箱
              <span className="px-1.5 py-0.2 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded text-[10px]">
                车载/机器人
              </span>
            </span>
          </button>
        </div>

        {/* ===================== 计算器 1: WCCA & 蒙特卡洛直方图 ===================== */}
        {activeCalc === 'wcca' && (
          <div className="space-y-6 text-xs">
            <div className="bg-slate-850 p-4 rounded-xl border border-slate-700/60">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                <div>
                  <span className="font-semibold text-slate-200 block">
                    回路误差元器件容差链表 (Error Tolerance Chain)
                  </span>
                  <span className="text-[11px] text-slate-400">
                    车规三因子分析法：初始制造公差 (Initial) + 全温区温漂 (Temp Drift) + 15年寿命老化 (Aging)
                  </span>
                </div>
                <div className="text-[11px] text-blue-300 font-mono">
                  高斯 3σ 独立正态叠加
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs divide-y divide-slate-800">
                  <thead className="text-slate-400">
                    <tr>
                      <th className="pb-2">回路元器件</th>
                      <th className="pb-2">标称名义值</th>
                      <th className="pb-2">初始公差 (±%)</th>
                      <th className="pb-2">全温区温漂 (±%)</th>
                      <th className="pb-2">15年老化 (±%)</th>
                      <th className="pb-2">单项极端最差和</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-300">
                    {wccaParams.components.map((c, i) => {
                      const totalComp = c.initTolPercent + c.tempDriftPercent + c.agingPercent;
                      return (
                        <tr key={i} className="hover:bg-slate-800/40 transition">
                          <td className="py-2.5 text-white font-medium">{c.name}</td>
                          <td className="py-2.5 font-mono">{c.nominal}</td>
                          <td className="py-2.5 font-mono">±{c.initTolPercent}%</td>
                          <td className="py-2.5 font-mono">±{c.tempDriftPercent}%</td>
                          <td className="py-2.5 font-mono">±{c.agingPercent}%</td>
                          <td className="py-2.5 font-mono text-amber-400 font-semibold">
                            ±{totalComp.toFixed(2)}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-4 pt-4 border-t border-slate-700/60">
                <div className="flex items-center space-x-3">
                  <span className="text-slate-300 font-medium">规格指标上下限 (LSL / USL):</span>
                  <div className="flex items-center space-x-1">
                    <span className="text-slate-400 font-mono">±</span>
                    <input
                      type="number"
                      step="0.1"
                      value={wccaParams.targetErrorLimitPercent}
                      onChange={(e) =>
                        setWccaParams({
                          ...wccaParams,
                          targetErrorLimitPercent: parseFloat(e.target.value) || 1.0,
                        })
                      }
                      className="w-20 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white text-center font-mono font-bold"
                    />
                    <span className="text-slate-400">%</span>
                  </div>
                </div>

                <button
                  onClick={handleRunWcca}
                  disabled={isWccaRunning}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-medium rounded-lg flex items-center space-x-2 transition cursor-pointer disabled:opacity-50 shadow-sm"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>{isWccaRunning ? '10,000次抽样计算中...' : '重新执行 10,000次 蒙特卡洛与 Cpk 分析'}</span>
                </button>
              </div>
            </div>

            {/* 原生 SVG 直方图与三法对比结果 */}
            {monteCarloStats && (
              <div className="space-y-4">
                <DistributionChart stats={monteCarloStats} />

                {/* 极限法 vs RSS vs 蒙特卡洛核心对比 */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Extreme Worst-case */}
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
                    <span className="text-slate-400 text-[11px] block">理论极限最坏情况 (Extreme Worst-Case)</span>
                    <div className="text-2xl font-bold font-mono text-red-400 mt-1">
                      ±{monteCarloStats.extremeWorstCasePercent}%
                    </div>
                    <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
                      假设所有器件同方向同时出现最大公差+最大温漂+最大老化。用于安全气囊等极端失控红线校核，常规量产以此为基准会造成过度设计。
                    </p>
                  </div>

                  {/* RSS */}
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
                    <span className="text-slate-400 text-[11px] block">均方根统计法 (Root-Sum-Square, RSS)</span>
                    <div className="text-2xl font-bold font-mono text-blue-400 mt-1">
                      ±{monteCarloStats.rssPercent}%
                    </div>
                    <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
                      假设器件公差相互正交独立，以正态分布均方根合成误差。汽车工业主流认可的稳健性评价方法。
                    </p>
                  </div>

                  {/* Monte Carlo 99% Percentile */}
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
                    <span className="text-slate-400 text-[11px] block">10,000次抽样 P99 分位数</span>
                    <div className="text-2xl font-bold font-mono text-emerald-400 mt-1">
                      ±{Math.abs(monteCarloStats.percentiles.p99)}%
                    </div>
                    <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
                      真实考虑随机扰动后的 99% 车载置信区间。P50中位数为 {monteCarloStats.percentiles.p50}%，
                      合格率达到 {monteCarloStats.passRatePercent}%。
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===================== 计算器 2: 瞬态 4 阶 Foster RC 热阻网络 ===================== */}
        {activeCalc === 'foster_thermal' && (
          <div className="space-y-6 text-xs">
            <div className="bg-slate-850 p-4 rounded-xl border border-slate-700/60 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-700/60 pb-3">
                <div>
                  <span className="font-semibold text-slate-200 block">
                    瞬态多阶 Foster RC 热阻网络参数 (ISO 7637-2 抛负载 / 电机堵转脉冲)
                  </span>
                  <span className="text-[11px] text-slate-400">
                    打破“稳态必超温，但毫秒脉冲其实安全”的盲区。依据芯片原厂瞬态阻抗模型 Zth(t) 精确推算毫秒级结温温升。
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-slate-400 text-[11px]">车规典型封装预设:</span>
                  <select
                    value={selectedPackage}
                    onChange={(e) => handleSelectPackage(e.target.value)}
                    className="bg-slate-900 border border-slate-700 text-white rounded px-2.5 py-1 text-xs font-mono"
                  >
                    {Object.entries(AUTOMOTIVE_PACKAGE_PRESETS).map(([key, item]) => (
                      <option key={key} value={key}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 功耗与工况输入 */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div>
                  <label className="block text-slate-400 mb-1">环境温度 Ta (℃)</label>
                  <input
                    type="number"
                    value={transientParams.ambientTempC}
                    onChange={(e) =>
                      setTransientParams({
                        ...transientParams,
                        ambientTempC: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">静态偏置功耗 P_bias (W)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={transientParams.biasPowerWatt}
                    onChange={(e) =>
                      setTransientParams({
                        ...transientParams,
                        biasPowerWatt: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-amber-400 font-semibold mb-1">
                    脉冲峰值功率 P_pulse (W)
                  </label>
                  <input
                    type="number"
                    step="1"
                    value={transientParams.pulsePowerWatt}
                    onChange={(e) =>
                      setTransientParams({
                        ...transientParams,
                        pulsePowerWatt: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-full bg-slate-900 border border-amber-500/50 rounded px-3 py-1.5 text-amber-300 font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block text-amber-400 font-semibold mb-1">
                    脉冲持续时间 t_pulse (ms)
                  </label>
                  <input
                    type="number"
                    step="1"
                    value={transientParams.pulseWidthMs}
                    onChange={(e) =>
                      setTransientParams({
                        ...transientParams,
                        pulseWidthMs: parseFloat(e.target.value) || 1,
                      })
                    }
                    className="w-full bg-slate-900 border border-amber-500/50 rounded px-3 py-1.5 text-amber-300 font-mono font-bold"
                  />
                </div>
              </div>

              {/* 4 阶 Foster RC 参数表格 */}
              <div>
                <span className="text-[11px] font-semibold text-slate-300 block mb-2">
                  Foster 4-Stage RC 等效模型参数矩阵 [Zth(t) = Σ Ri * (1 - e^(-t / τi))]：
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {transientParams.fosterStages.map((stage, idx) => {
                    const tau = stage.r * stage.c * 1000; // ms
                    return (
                      <div
                        key={idx}
                        className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800 space-y-1.5"
                      >
                        <div className="flex justify-between text-[11px] font-bold text-blue-400">
                          <span>第 {idx + 1} 阶 (Stage {idx + 1})</span>
                          <span className="font-mono text-slate-400">τ: {tau >= 1000 ? `${(tau / 1000).toFixed(2)}s` : `${tau.toFixed(1)}ms`}</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <span className="text-[10px] text-slate-400 w-12">R{idx + 1} (K/W):</span>
                          <input
                            type="number"
                            step="0.05"
                            value={stage.r}
                            onChange={(e) => {
                              const newStages = [...transientParams.fosterStages];
                              newStages[idx].r = parseFloat(e.target.value) || 0;
                              setTransientParams({ ...transientParams, fosterStages: newStages });
                            }}
                            className="w-full bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-white font-mono text-[11px]"
                          />
                        </div>
                        <div className="flex items-center space-x-1">
                          <span className="text-[10px] text-slate-400 w-12">C{idx + 1} (J/K):</span>
                          <input
                            type="number"
                            step="0.001"
                            value={stage.c}
                            onChange={(e) => {
                              const newStages = [...transientParams.fosterStages];
                              newStages[idx].c = parseFloat(e.target.value) || 0;
                              setTransientParams({ ...transientParams, fosterStages: newStages });
                            }}
                            className="w-full bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-white font-mono text-[11px]"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 降额与芯片极限 */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                <div>
                  <label className="block text-slate-400 mb-1">器件绝对结温极限 Tj_max (℃)</label>
                  <input
                    type="number"
                    value={transientParams.tjMaxC}
                    onChange={(e) =>
                      setTransientParams({
                        ...transientParams,
                        tjMaxC: parseFloat(e.target.value) || 150,
                      })
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">车规降额安全裕量要求 (℃)</label>
                  <input
                    type="number"
                    value={transientParams.deratingMarginC}
                    onChange={(e) =>
                      setTransientParams({
                        ...transientParams,
                        deratingMarginC: parseFloat(e.target.value) || 20,
                      })
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-white font-mono"
                  />
                </div>

                <div className="flex items-end">
                  <button
                    onClick={handleRunTransientThermal}
                    className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg transition cursor-pointer flex items-center justify-center space-x-1.5 shadow-sm"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>执行 Foster 瞬态温升推算</span>
                  </button>
                </div>
              </div>
            </div>

            {/* 瞬态计算结果展示与判定 */}
            {transientResult && (
              <div className="bg-slate-950 border border-blue-500/40 rounded-xl p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <span className="font-bold text-sm text-white block">
                      瞬态热阻与脉冲结温判定报告 (Transient Pulse Thermal Evaluation)
                    </span>
                    <span className="text-[11px] text-slate-400">
                      脉宽: {transientParams.pulseWidthMs}ms | 脉冲峰值功率: {transientParams.pulsePowerWatt}W | 对应瞬态热阻 Zth: {transientResult.zthPulse} K/W (远低于稳态 RthJA {transientResult.steadyRthJA} K/W)
                    </span>
                  </div>

                  <span
                    className={`px-3 py-1 rounded text-xs font-bold border self-start sm:self-auto ${
                      transientResult.vetoTriggered
                        ? 'bg-red-500/20 text-red-400 border-red-500/50 animate-pulse'
                        : transientResult.isDeratingMet
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                        : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                    }`}
                  >
                    {transientResult.vetoTriggered
                      ? '⚠️ VETO 一票否决 (超结温极限)'
                      : transientResult.isDeratingMet
                      ? '✓ 降额达标 (Derating Pass)'
                      : '⚠️ 降额欠缺 (Need Concession)'}
                  </span>
                </div>

                {/* 4 维核心数值卡片 */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                    <span className="text-slate-400 text-[10px] block">偏置温升 + 脉冲温升</span>
                    <div className="text-lg font-bold font-mono text-white mt-1">
                      +{transientResult.tempRiseBiasC}℃ <span className="text-amber-400">+{transientResult.tempRisePulseC}℃</span>
                    </div>
                  </div>

                  <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                    <span className="text-slate-400 text-[10px] block">瞬态峰值结温 Tj_peak</span>
                    <div
                      className={`text-xl font-bold font-mono mt-1 ${
                        transientResult.isAbsoluteTjExceeded ? 'text-red-400' : 'text-amber-400'
                      }`}
                    >
                      {transientResult.peakJunctionTempC} ℃
                    </div>
                  </div>

                  <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                    <span className="text-slate-400 text-[10px] block">车规降额上限 (Tj_derated)</span>
                    <div className="text-xl font-bold font-mono text-blue-400 mt-1">
                      {transientResult.deratedLimitC} ℃
                    </div>
                  </div>

                  <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                    <span className="text-slate-400 text-[10px] block">当前结温净安全裕量</span>
                    <div
                      className={`text-xl font-bold font-mono mt-1 ${
                        transientResult.marginC < 0 ? 'text-red-400' : 'text-emerald-400'
                      }`}
                    >
                      {transientResult.marginC > 0 ? `+${transientResult.marginC}` : transientResult.marginC} ℃
                    </div>
                  </div>
                </div>

                {/* VETO 熔断警告条 */}
                {transientResult.vetoTriggered && (
                  <div className="p-3 bg-red-950/50 border border-red-500 rounded-lg text-xs text-red-200 flex items-start space-x-2">
                    <ShieldAlert className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                    <div>
                      <strong className="block font-bold text-red-300">
                        {transientResult.vetoReason}
                      </strong>
                      <p className="mt-1 text-slate-300 text-[11px] leading-relaxed">
                        在抛负载 ISO 7637-2 Pulse 5b（典型 40~400ms）或电机堵转脉冲工况下，器件瞬间峰值结温已击穿半导体硅片载流子禁带物理极限。此时任何“依赖稳态平均功耗很低”的辩解均无效，极易引发不可逆雪崩击穿烧毁！
                      </p>
                    </div>
                  </div>
                )}

                {/* 简易对数时间响应阶跃指示 */}
                <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800">
                  <span className="text-[11px] font-semibold text-slate-300 block mb-1">
                    物理机理解析：为什么不能用稳态 RthJA 误杀瞬态设计？
                  </span>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    对于封装内部硅片（Die），热量传递到引线框架及 PCB 铜皮需要热时间常数 τ。在 <strong>{transientParams.pulseWidthMs}ms</strong> 的极短时间窗口内，热量主要被第 1、2 阶硅片自身热容吸收，有效热阻仅为 <strong>{transientResult.zthPulse} K/W</strong>（不到稳态 {transientResult.steadyRthJA} K/W 的 {( (transientResult.zthPulse / transientResult.steadyRthJA) * 100 ).toFixed(1)}%）。因此，只要结温净裕量保持正值 ({transientResult.marginC}℃)，无需盲目大幅加大散热铝挤或在硬件上堆叠额外并联管。
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===================== 计算器 3: 稳态结温与降额 ===================== */}
        {activeCalc === 'steady_thermal' && (
          <div className="space-y-6 text-xs">
            <div className="bg-slate-850 p-4 rounded-xl border border-slate-700/60 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-slate-400 mb-1">稳态总损耗功耗 P_loss (W)</label>
                <input
                  type="number"
                  step="0.05"
                  value={thermalParams.powerLossWatt}
                  onChange={(e) => setThermalParams({ ...thermalParams, powerLossWatt: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">最严苛工作环境温度 Ta (℃)</label>
                <input
                  type="number"
                  value={thermalParams.ambientTempC}
                  onChange={(e) => setThermalParams({ ...thermalParams, ambientTempC: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">结到环境总热阻 RthJA (℃/W)</label>
                <input
                  type="number"
                  step="0.5"
                  value={thermalParams.rthJA}
                  onChange={(e) => setThermalParams({ ...thermalParams, rthJA: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">器件标称最大结温 Tj_max (℃)</label>
                <input
                  type="number"
                  value={thermalParams.tjMaxC}
                  onChange={(e) => setThermalParams({ ...thermalParams, tjMaxC: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">整车降额安全要求 (℃)</label>
                <input
                  type="number"
                  value={thermalParams.deratingMarginC}
                  onChange={(e) => setThermalParams({ ...thermalParams, deratingMarginC: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-white font-mono"
                />
              </div>

              <div className="flex items-end">
                <button
                  onClick={handleRunThermal}
                  className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg transition cursor-pointer"
                >
                  计算稳态结温与裕量
                </button>
              </div>
            </div>

            {thermalResult && (
              <div className="bg-slate-950 border border-blue-500/40 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-white">稳态热阻与降额裕量核算结果</span>
                  <span className={`px-2.5 py-0.5 rounded text-xs font-bold border ${
                    thermalResult.isDeratingMet
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                      : 'bg-red-500/20 text-red-300 border-red-500/30'
                  }`}>
                    {thermalResult.isDeratingMet ? '降额达标 (Pass)' : '降额超标违背 (Fail)'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                  <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                    <span className="text-slate-400 text-[11px] block">器件实测温升 ΔT</span>
                    <div className="text-xl font-bold font-mono text-white mt-1">+{thermalResult.tempRiseC} ℃</div>
                  </div>
                  <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                    <span className="text-slate-400 text-[11px] block">稳态结温 Tj</span>
                    <div className="text-xl font-bold font-mono text-amber-400 mt-1">{thermalResult.junctionTempC} ℃</div>
                  </div>
                  <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                    <span className="text-slate-400 text-[11px] block">降额允许上限 Tj_derated</span>
                    <div className="text-xl font-bold font-mono text-blue-400 mt-1">{thermalResult.deratedLimitC} ℃</div>
                  </div>
                  <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                    <span className="text-slate-400 text-[11px] block">当前结温净裕量 (Margin)</span>
                    <div className={`text-xl font-bold font-mono mt-1 ${thermalResult.actualMarginC < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                      {thermalResult.actualMarginC} ℃
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===================== 计算器 4: 电压轨瞬态跌落 ===================== */}
        {activeCalc === 'voltage' && (
          <div className="space-y-6 text-xs">
            <div className="bg-slate-850 p-4 rounded-xl border border-slate-700/60 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-slate-400 mb-1">标称供电电压 V_nom (V)</label>
                <input
                  type="number"
                  step="0.1"
                  value={voltageParams.nominalVoltage}
                  onChange={(e) => setVoltageParams({ ...voltageParams, nominalVoltage: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">LDO/稳压芯片精度公差 (±%)</label>
                <input
                  type="number"
                  step="0.1"
                  value={voltageParams.regulatorTolerancePercent}
                  onChange={(e) => setVoltageParams({ ...voltageParams, regulatorTolerancePercent: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">走线与开关管内阻压降 (mV)</label>
                <input
                  type="number"
                  value={voltageParams.lineAndSwitchDropMv}
                  onChange={(e) => setVoltageParams({ ...voltageParams, lineAndSwitchDropMv: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">瞬态负载阶跃跌落 Dip (mV)</label>
                <input
                  type="number"
                  value={voltageParams.transientDipMv}
                  onChange={(e) => setVoltageParams({ ...voltageParams, transientDipMv: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">MCU/SOC 允许最低工作电压 V_min (V)</label>
                <input
                  type="number"
                  step="0.05"
                  value={voltageParams.minAllowedVoltage}
                  onChange={(e) => setVoltageParams({ ...voltageParams, minAllowedVoltage: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-white font-mono"
                />
              </div>

              <div className="flex items-end">
                <button
                  onClick={handleRunVoltage}
                  className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg transition cursor-pointer"
                >
                  核算极限电压跌落与裕量
                </button>
              </div>
            </div>

            {voltageResult && (
              <div className="bg-slate-950 border border-blue-500/40 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-white">电源轨动态裕量核算</span>
                  <span className={`px-2.5 py-0.5 rounded text-xs font-bold border ${
                    voltageResult.isSafe
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                      : 'bg-red-500/20 text-red-300 border-red-500/30'
                  }`}>
                    {voltageResult.isSafe ? '供电裕量充足 (Safe)' : '存在复位跌落风险 (Risk)'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                    <span className="text-slate-400 text-[11px] block">稳压器极限下限</span>
                    <div className="text-xl font-bold font-mono text-white mt-1">{voltageResult.minRegulatorVoltage} V</div>
                  </div>
                  <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                    <span className="text-slate-400 text-[11px] block">负载端极限跌落谷值</span>
                    <div className="text-xl font-bold font-mono text-amber-400 mt-1">{voltageResult.worstCaseMinVoltage} V</div>
                  </div>
                  <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                    <span className="text-slate-400 text-[11px] block">距离 V_min 净安全裕量</span>
                    <div className={`text-xl font-bold font-mono mt-1 ${voltageResult.safetyMarginMv < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                      {voltageResult.safetyMarginMv} mV
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===================== 计算器 5: BLDC 电机驱动专项物理核算工具箱 ===================== */}
        {activeCalc === 'motor_drive' && (
          <MotorDriveToolbox issue={issue} onIssueChange={setIssue} />
        )}
      </div>
    </div>
  );
};
