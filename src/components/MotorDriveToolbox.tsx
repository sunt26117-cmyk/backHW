import React, { useState, useEffect } from 'react';
import {
  Zap,
  Activity,
  AlertTriangle,
  CheckCircle2,
  Sliders,
  ShieldAlert,
  ArrowDownCircle,
  HelpCircle,
} from 'lucide-react';
import {
  calculateBusPumping,
  checkMillerRisk,
  calculateSnubberParams,
  calculateCommutationRisk,
  evaluatePositionSensorDegradation,
  evaluateSafetyChainTiming,
} from '../physics/motorPhysicsEngine';
import {
  calculateStallTransientThermal,
  FOSTER_PRESETS,
  StallThermalResult,
} from '../utils/transientThermal';
import {
  BusPumpingResult,
  MillerRiskResult,
  SnubberCalcResult,
  ActuatorArchetype,
} from '../types/motorDrive';
import { IssueInput } from '../types';
import { readMeasuredNumber } from '../utils/unifiedStateExtractor';

interface MotorDriveToolboxProps {
  issue?: IssueInput;
  onIssueChange?: (issue: IssueInput) => void;
}

export const MotorDriveToolbox: React.FC<MotorDriveToolboxProps> = ({ issue, onIssueChange }) => {
  // 1. 急停母线泵升能量计算状态
  const [pumpingParams, setPumpingParams] = useState({
    V_bus_nom: 13.5,
    V_bus_max_rating: 40.0,
    C_dc_uF: 470,
    J_kg_m2: 0.00015,
    n_rpm: 3800,
    regenEfficiency: 0.8,
    L_harness_uH: 2.0,
    I_phase_A: 22.0,
  });
  const [pumpingResult, setPumpingResult] = useState<BusPumpingResult | null>(null);

  // 2. 米勒感应直通风险核算状态
  const [millerParams, setMillerParams] = useState({
    V_th_min: 2.0,
    C_gd_pF: 45,
    C_gs_pF: 1800,
    R_g_pulldown_ohm: 4.5,
    dv_dt_V_per_ns: 8.5,
    hasActiveMillerClamp: false,
  });
  const [millerResult, setMillerResult] = useState<MillerRiskResult | null>(null);

  // 3. RC Snubber 最佳阻尼自动推荐计算器状态
  const [snubberParams, setSnubberParams] = useState({
    f_ring_MHz: 48.0,
    C_oss_pF: 680,
    V_bus_V: 13.5,
    f_sw_kHz: 20,
  });
  const [snubberResult, setSnubberResult] = useState<SnubberCalcResult | null>(null);

  // 4. 堵转瞬态脉冲结温计算状态 (集成 Foster 4阶)
  const [stallParams, setStallParams] = useState({
    ambientTempC: 85,
    biasPowerW: 0.8,
    stallCurrentA: 28,
    rdson25mOhm: 3.2,
    stallDurationMs: 1500,
    tjMaxC: 175,
    tjDeratedLimitC: 140,
    packageType: 'POWERPAK56' as 'POWERPAK56' | 'D2PAK' | 'POWERSSO36',
  });
  const [stallResult, setStallResult] = useState<StallThermalResult | null>(null);

  // 5. 换相角误差与失步转矩纹波评估状态
  const [commutationParams, setCommutationParams] = useState({
    controlMode: 'hall_six_step' as 'sensorless_bemf' | 'hall_six_step' | 'foc_vector',
    speedMinRpm: 800,
    speedMaxRpm: 3800,
    angleOffsetDeg: 6.5,
    torqueFluctuationPct: 15,
  });
  const [commutationResult, setCommutationResult] = useState<ReturnType<typeof calculateCommutationRisk> | null>(null);

  // 6. 转子位置传感器失效降级与 2-Hall 容错评估状态
  const [sensorParams, setSensorParams] = useState({
    sensorType: 'hall_triple' as 'hall_triple' | 'hall_single' | 'optical_encoder' | 'sensorless',
  });
  const [sensorResult, setSensorResult] = useState<ReturnType<typeof evaluatePositionSensorDegradation> | null>(null);

  // 7. 功能安全链 FHTI 与看门狗/双通道电流核验时序
  const [safetyChainParams, setSafetyChainParams] = useState({
    fhtiBudgetMs: 10.0,
    wdgTimeoutWindowMs: 4.0,
    safeStateTransitionMs: 2.2,
    currentSenseDeviationPct: 3.2,
  });
  const [safetyChainResult, setSafetyChainResult] = useState<ReturnType<typeof evaluateSafetyChainTiming> | null>(null);

  // 统一读数：''/null 不再被当成 0，否则工具会拿 0 参与计算并给出一个假的结论。
  const issueNumber = (key: string): number | undefined => readMeasuredNumber(issue?.measuredValues, key);

  const updateIssueMeasuredValue = (key: string, rawValue: string) => {
    if (!issue || !onIssueChange) return;
    const value = Number(rawValue);
    if (!Number.isFinite(value)) return;
    const source = new Set(['vdsRatingV', 'cBusUf', 'rotorInertiaKgm2', 'rgOffOhm', 'cgdPf', 'vthMinV']).has(key)
      ? 'SPEC'
      : key === 'busVoltageNominalV'
      ? 'CONTEXT'
      : 'USER_MEASURED';
    onIssueChange({
      ...issue,
      measuredValues: { ...(issue.measuredValues || {}), [key]: value },
      measurementProvenance: {
        ...(issue.measurementProvenance || {}),
        [key]: {
          ...(issue.measurementProvenance?.[key] || {}),
          source,
          sourceLabel: `MotorDriveToolbox 手动输入 · ${source}`,
          enteredAt: new Date().toISOString(),
        },
      },
    });
  };

  // issue 切换后回填工具箱输入；缺失字段保留本地编辑值，但不会被写回 issue，更不会作为确定性 Grounding 输入。
  useEffect(() => {
    if (!issue) return;
    const vbus = issueNumber('busVoltageNominalV');
    const vds = issueNumber('vdsRatingV');
    const cbus = issueNumber('cBusUf');
    const rpm = issueNumber('rpm');
    const j = issueNumber('rotorInertiaKgm2');
    const l = issueNumber('harnessInductanceUh');
    const current = issueNumber('currentPeakA');
    const vth = issueNumber('vthMinV');
    const cgd = issueNumber('cgdPf');
    const rg = issueNumber('rgOffOhm');
    const dvdt = issueNumber('dvdtVns');

    setPumpingParams((prev) => ({
      ...prev,
      ...(vbus !== undefined ? { V_bus_nom: vbus } : {}),
      ...(vds !== undefined ? { V_bus_max_rating: vds } : {}),
      ...(cbus !== undefined ? { C_dc_uF: cbus } : {}),
      ...(rpm !== undefined ? { n_rpm: rpm } : {}),
      ...(j !== undefined ? { J_kg_m2: j } : {}),
      ...(l !== undefined ? { L_harness_uH: l } : {}),
      ...(current !== undefined ? { I_phase_A: current } : {}),
    }));
    setMillerParams((prev) => ({
      ...prev,
      ...(vth !== undefined ? { V_th_min: vth } : {}),
      ...(cgd !== undefined ? { C_gd_pF: cgd } : {}),
      ...(rg !== undefined ? { R_g_pulldown_ohm: rg } : {}),
      ...(dvdt !== undefined ? { dv_dt_V_per_ns: dvdt } : {}),
    }));
  }, [issue]);

  // 与工程 issue 绑定时，只有结构化关键输入齐全才运行确定性 BLDC 计算。
  const linkedPumpingReady = !issue || ['busVoltageNominalV', 'vdsRatingV', 'cBusUf', 'rotorInertiaKgm2', 'rpm'].every((key) => issueNumber(key) !== undefined);
  const linkedMillerReady = !issue || ['dvdtVns', 'cgdPf', 'rgOffOhm', 'vthMinV'].every((key) => issueNumber(key) !== undefined);

  // 一键加载典型电机应用场景预设
  const applyPreset = (preset: ActuatorArchetype) => {
    if (preset === 'SEAT_HEAVY_TILT') {
      setPumpingParams({
        V_bus_nom: 13.5,
        V_bus_max_rating: 40.0,
        C_dc_uF: 470,
        J_kg_m2: 0.00035, // 大扭矩重载
        n_rpm: 3200,
        regenEfficiency: 0.82,
        L_harness_uH: 1.5,
        I_phase_A: 28.0,
      });
      setStallParams((prev) => ({
        ...prev,
        ambientTempC: 85, // 座椅密闭发泡海绵内
        stallCurrentA: 32,
        stallDurationMs: 2000,
        rdson25mOhm: 2.8,
      }));
    } else if (preset === 'DISPLAY_SLIDER') {
      setPumpingParams({
        V_bus_nom: 13.5,
        V_bus_max_rating: 40.0,
        C_dc_uF: 330,
        J_kg_m2: 0.00012,
        n_rpm: 4500,
        regenEfficiency: 0.85,
        L_harness_uH: 4.5, // 贯穿滑轨的长线束寄生电感大
        I_phase_A: 16.0,
      });
      setMillerParams((prev) => ({
        ...prev,
        dv_dt_V_per_ns: 12.0, // 高 dv/dt
        R_g_pulldown_ohm: 5.5,
      }));
      setSnubberParams((prev) => ({
        ...prev,
        f_ring_MHz: 62.0,
      }));
    } else if (preset === 'SEAT_MASSAGE_PUMP') {
      setPumpingParams({
        V_bus_nom: 13.5,
        V_bus_max_rating: 40.0,
        C_dc_uF: 220,
        J_kg_m2: 0.00004,
        n_rpm: 6000,
        regenEfficiency: 0.7,
        L_harness_uH: 1.0,
        I_phase_A: 8.5,
      });
      setSnubberParams((prev) => ({
        ...prev,
        f_sw_kHz: 25, // 高频PWM
        f_ring_MHz: 45.0,
      }));
    } else if (preset === 'ROBOT_JOINT') {
      setPumpingParams({
        V_bus_nom: 48.0, // 48V 机器人总线
        V_bus_max_rating: 80.0,
        C_dc_uF: 680,
        J_kg_m2: 0.0005,
        n_rpm: 5500,
        regenEfficiency: 0.9,
        L_harness_uH: 0.8,
        I_phase_A: 35.0,
      });
      setMillerParams((prev) => ({
        ...prev,
        dv_dt_V_per_ns: 15.0,
        R_g_pulldown_ohm: 2.5,
        hasActiveMillerClamp: true,
      }));
      setStallParams((prev) => ({
        ...prev,
        ambientTempC: 65,
        stallCurrentA: 40,
        stallDurationMs: 800,
        rdson25mOhm: 1.5,
        packageType: 'POWERPAK56',
      }));
    }
  };

  // 运行计算
  useEffect(() => {
    if (!linkedPumpingReady) {
      setPumpingResult(null);
      return;
    }
    const p = issue ? {
      ...pumpingParams,
      V_bus_nom: issueNumber('busVoltageNominalV')!,
      V_bus_max_rating: issueNumber('vdsRatingV')!,
      C_dc_uF: issueNumber('cBusUf')!,
      J_kg_m2: issueNumber('rotorInertiaKgm2')!,
      n_rpm: issueNumber('rpm')!,
      I_phase_A: issueNumber('currentPeakA') ?? pumpingParams.I_phase_A,
    } : pumpingParams;
    setPumpingResult(calculateBusPumping(p));
  }, [pumpingParams, issue, linkedPumpingReady]);

  useEffect(() => {
    if (!linkedMillerReady) {
      setMillerResult(null);
      return;
    }
    const p = issue ? {
      ...millerParams,
      V_th_min: issueNumber('vthMinV')!,
      C_gd_pF: issueNumber('cgdPf')!,
      R_g_pulldown_ohm: issueNumber('rgOffOhm')!,
      dv_dt_V_per_ns: issueNumber('dvdtVns')!,
    } : millerParams;
    const mRes = checkMillerRisk({
      V_th_min: p.V_th_min,
      C_gd_pF: p.C_gd_pF,
      R_g_pulldown_ohm: p.R_g_pulldown_ohm,
      dv_dt_V_per_ns: p.dv_dt_V_per_ns,
      hasActiveMillerClamp: p.hasActiveMillerClamp,
    });
    setMillerResult(mRes);
  }, [millerParams, issue, linkedMillerReady]);

  useEffect(() => {
    const sRes = calculateSnubberParams({
      f_ring_MHz: snubberParams.f_ring_MHz,
      C_oss_pF: snubberParams.C_oss_pF,
      V_bus_V: snubberParams.V_bus_V,
      f_sw_kHz: snubberParams.f_sw_kHz,
    });
    setSnubberResult(sRes);
  }, [snubberParams]);

  useEffect(() => {
    const stRes = calculateStallTransientThermal({
      ambientTempC: stallParams.ambientTempC,
      biasPowerW: stallParams.biasPowerW,
      stallCurrentA: stallParams.stallCurrentA,
      rdson25mOhm: stallParams.rdson25mOhm,
      stallDurationMs: stallParams.stallDurationMs,
      tjMaxC: stallParams.tjMaxC,
      tjDeratedLimitC: stallParams.tjDeratedLimitC,
      packageType: stallParams.packageType,
      fosterStages: FOSTER_PRESETS[stallParams.packageType],
    });
    setStallResult(stRes);
  }, [stallParams]);

  useEffect(() => {
    const cRes = calculateCommutationRisk(commutationParams);
    setCommutationResult(cRes);
  }, [commutationParams]);

  useEffect(() => {
    const snRes = evaluatePositionSensorDegradation(sensorParams.sensorType);
    setSensorResult(snRes);
  }, [sensorParams]);

  useEffect(() => {
    const scRes = evaluateSafetyChainTiming(safetyChainParams);
    setSafetyChainResult(scRes);
  }, [safetyChainParams]);

  return (
    <div className="space-y-6">
      {/* 顶部典型应用快捷预设切换 */}
      <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center space-x-2">
          <Sliders className="w-4 h-4 text-blue-400" />
          <span className="text-xs font-bold text-slate-200">
            BLDC 执行机构一键工况预设：
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => applyPreset('SEAT_HEAVY_TILT')}
            className="px-2.5 py-1 text-xs rounded bg-slate-850 hover:bg-slate-800 text-slate-300 border border-slate-700 transition cursor-pointer"
          >
            座椅水平/倾角大扭矩 (13.5V/重载堵转)
          </button>
          <button
            onClick={() => applyPreset('DISPLAY_SLIDER')}
            className="px-2.5 py-1 text-xs rounded bg-slate-850 hover:bg-slate-800 text-slate-300 border border-slate-700 transition cursor-pointer"
          >
            中控滑屏机构 (长线束/急停高回馈)
          </button>
          <button
            onClick={() => applyPreset('SEAT_MASSAGE_PUMP')}
            className="px-2.5 py-1 text-xs rounded bg-slate-850 hover:bg-slate-800 text-slate-300 border border-slate-700 transition cursor-pointer"
          >
            座椅气动脉冲泵 (高频PWM/发热)
          </button>
          <button
            onClick={() => applyPreset('ROBOT_JOINT')}
            className="px-2.5 py-1 text-xs rounded bg-blue-950/40 hover:bg-blue-900/50 text-blue-300 border border-blue-700/60 transition cursor-pointer"
          >
            机器人灵巧关节 (48V/高频双向制动)
          </button>
        </div>
      </div>

      {/* 核心三列/两列网格布局：各物理模块 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 模块 1：急停母线泵升能量与电容耐压核算 */}
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center space-x-2">
              <Zap className="w-4 h-4 text-amber-400" />
              <h3 className="font-bold text-sm text-slate-100">
                1. 急停母线泵升过压核算 (Bus Pumping Peak)
              </h3>
            </div>
            {pumpingResult && (
              <span
                className={`text-[11px] px-2 py-0.5 rounded font-bold border ${
                  pumpingResult.severity === 'SAFE'
                    ? 'bg-emerald-950 text-emerald-300 border-emerald-700'
                    : pumpingResult.severity === 'WARNING'
                    ? 'bg-amber-950 text-amber-300 border-amber-700'
                    : 'bg-red-950 text-red-300 border-red-700 animate-pulse'
                }`}
              >
                {pumpingResult.severity === 'SAFE'
                  ? '耐压合格 (Pass)'
                  : pumpingResult.severity === 'WARNING'
                  ? '裕量临界 (Warning)'
                  : '过压击穿风险 (OVP Hazard)'}
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <label className="text-slate-400 block mb-1">标称母线 (V)</label>
              <input
                type="number"
                value={pumpingParams.V_bus_nom}
                onChange={(e) => {
                  setPumpingParams({ ...pumpingParams, V_bus_nom: parseFloat(e.target.value) || 0 });
                  updateIssueMeasuredValue('busVoltageNominalV', e.target.value);
                }}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100 font-mono"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">器件耐压上限 (V)</label>
              <input
                type="number"
                value={pumpingParams.V_bus_max_rating}
                onChange={(e) => {
                  setPumpingParams({ ...pumpingParams, V_bus_max_rating: parseFloat(e.target.value) || 0 });
                  updateIssueMeasuredValue('vdsRatingV', e.target.value);
                }}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100 font-mono"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">母线电容 (μF)</label>
              <input
                type="number"
                value={pumpingParams.C_dc_uF}
                onChange={(e) => {
                  setPumpingParams({ ...pumpingParams, C_dc_uF: parseFloat(e.target.value) || 1 });
                  updateIssueMeasuredValue('cBusUf', e.target.value);
                }}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100 font-mono"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">电机转速 (rpm)</label>
              <input
                type="number"
                value={pumpingParams.n_rpm}
                onChange={(e) => {
                  setPumpingParams({ ...pumpingParams, n_rpm: parseFloat(e.target.value) || 0 });
                  updateIssueMeasuredValue('rpm', e.target.value);
                }}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100 font-mono"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">转动惯量 J (kg·m²)</label>
              <input
                type="number"
                step="0.00005"
                value={pumpingParams.J_kg_m2}
                onChange={(e) => {
                  setPumpingParams({ ...pumpingParams, J_kg_m2: parseFloat(e.target.value) || 0 });
                  updateIssueMeasuredValue('rotorInertiaKgm2', e.target.value);
                }}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100 font-mono"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">线束电感 (μH)</label>
              <input
                type="number"
                step="0.5"
                value={pumpingParams.L_harness_uH}
                onChange={(e) =>
                  setPumpingParams({ ...pumpingParams, L_harness_uH: parseFloat(e.target.value) || 0 })
                }
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100 font-mono"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">急停相电流 (A)</label>
              <input
                type="number"
                value={pumpingParams.I_phase_A}
                onChange={(e) => {
                  setPumpingParams({ ...pumpingParams, I_phase_A: parseFloat(e.target.value) || 0 });
                  updateIssueMeasuredValue('currentPeakA', e.target.value);
                }}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100 font-mono"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">回馈效率 (0~1)</label>
              <input
                type="number"
                step="0.05"
                min="0.1"
                max="1.0"
                value={pumpingParams.regenEfficiency}
                onChange={(e) =>
                  setPumpingParams({ ...pumpingParams, regenEfficiency: parseFloat(e.target.value) || 0.8 })
                }
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100 font-mono"
              />
            </div>
          </div>

          {/* 计算结果指标看板 */}
          {pumpingResult && (
            <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800 space-y-2.5 text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div>
                  <span className="text-slate-400 text-[10px] block">反电动势过压峰值</span>
                  <span
                    className={`text-base font-bold font-mono ${
                      pumpingResult.isOverVoltage ? 'text-red-400' : 'text-amber-400'
                    }`}
                  >
                    {pumpingResult.V_bus_peak} V
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">电压抬升 ΔV</span>
                  <span className="text-base font-bold font-mono text-slate-200">
                    +{pumpingResult.voltageRise} V
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">耐压安全裕量</span>
                  <span
                    className={`text-base font-bold font-mono ${
                      pumpingResult.voltageMarginV <= 0 ? 'text-red-400' : 'text-emerald-400'
                    }`}
                  >
                    {pumpingResult.voltageMarginV} V
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">倒灌电能 E_regen</span>
                  <span className="text-base font-bold font-mono text-blue-400">
                    {pumpingResult.regenEnergyJoules} J
                  </span>
                </div>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed border-t border-slate-800/80 pt-2">
                💡 <strong>对策提示：</strong> {pumpingResult.recommendation}
              </p>
            </div>
          )}
        </div>

        {/* 模块 2：米勒感应直通风险核算 */}
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center space-x-2">
              <ShieldAlert className="w-4 h-4 text-blue-400" />
              <h3 className="font-bold text-sm text-slate-100">
                2. 米勒感应直通风险核算 (Miller Cross-Conduction)
              </h3>
            </div>
            {millerResult && (
              <span
                className={`text-[11px] px-2 py-0.5 rounded font-bold border ${
                  millerResult.riskLevel === 'SAFE'
                    ? 'bg-emerald-950 text-emerald-300 border-emerald-700'
                    : millerResult.riskLevel === 'WARNING'
                    ? 'bg-amber-950 text-amber-300 border-amber-700'
                    : 'bg-red-950 text-red-300 border-red-700 animate-pulse'
                }`}
              >
                {millerResult.riskLevel === 'SAFE'
                  ? '无直通风险 (Safe)'
                  : millerResult.riskLevel === 'WARNING'
                  ? '临界微导通 (Warning)'
                  : '直通炸管危险 (Shoot-Through)'}
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
            <div>
              <label className="text-slate-400 block mb-1">阈值电压 V_th_min (V)</label>
              <input
                type="number"
                step="0.1"
                value={millerParams.V_th_min}
                onChange={(e) => {
                  setMillerParams({ ...millerParams, V_th_min: parseFloat(e.target.value) || 2.0 });
                  updateIssueMeasuredValue('vthMinV', e.target.value);
                }}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100 font-mono"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">米勒电容 C_gd (pF)</label>
              <input
                type="number"
                value={millerParams.C_gd_pF}
                onChange={(e) => {
                  setMillerParams({ ...millerParams, C_gd_pF: parseFloat(e.target.value) || 10 });
                  updateIssueMeasuredValue('cgdPf', e.target.value);
                }}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100 font-mono"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">门极关断回路阻抗 (Ω)</label>
              <input
                type="number"
                step="0.5"
                value={millerParams.R_g_pulldown_ohm}
                onChange={(e) => {
                  setMillerParams({ ...millerParams, R_g_pulldown_ohm: parseFloat(e.target.value) || 1 });
                  updateIssueMeasuredValue('rgOffOhm', e.target.value);
                }}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100 font-mono"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">对管 dv/dt (V/ns)</label>
              <input
                type="number"
                step="0.5"
                value={millerParams.dv_dt_V_per_ns}
                onChange={(e) => {
                  setMillerParams({ ...millerParams, dv_dt_V_per_ns: parseFloat(e.target.value) || 1 });
                  updateIssueMeasuredValue('dvdtVns', e.target.value);
                }}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100 font-mono"
              />
            </div>
            <div className="col-span-2 flex items-center pt-5">
              <label className="flex items-center space-x-2 text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={millerParams.hasActiveMillerClamp}
                  onChange={(e) =>
                    setMillerParams({ ...millerParams, hasActiveMillerClamp: e.target.checked })
                  }
                  className="rounded bg-slate-900 border-slate-700 text-blue-600 focus:ring-0"
                />
                <span>启用驱动器硬件有源米勒钳位 (Active Clamp)</span>
              </label>
            </div>
          </div>

          {millerResult && (
            <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800 space-y-2.5 text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div>
                  <span className="text-slate-400 text-[10px] block">门极感应峰值 V_gate</span>
                  <span
                    className={`text-base font-bold font-mono ${
                      millerResult.isRiskOfShootThrough ? 'text-red-400' : 'text-slate-100'
                    }`}
                  >
                    {millerResult.vGateInducedV} V
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">门极安全裕量</span>
                  <span
                    className={`text-base font-bold font-mono ${
                      millerResult.safetyMarginV < 0.6 ? 'text-amber-400' : 'text-emerald-400'
                    }`}
                  >
                    {millerResult.safetyMarginV} V
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">米勒位移电流 I_m</span>
                  <span className="text-base font-bold font-mono text-blue-400">
                    {millerResult.millerCurrentA} A
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">门极开启阈值</span>
                  <span className="text-base font-bold font-mono text-slate-300">
                    {millerResult.vThMinV} V
                  </span>
                </div>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed border-t border-slate-800/80 pt-2">
                💡 <strong>对策提示：</strong> {millerResult.recommendation}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 下排两列网格布局：RC Snubber 与 堵转 Foster 结温 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 模块 3：RC Snubber 最佳阻尼自动推荐计算器 */}
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center space-x-2">
              <Activity className="w-4 h-4 text-emerald-400" />
              <h3 className="font-bold text-sm text-slate-100">
                3. RC Snubber 最佳阻尼自动推荐计算器 (EMI/振铃抑制)
              </h3>
            </div>
            <span className="text-[11px] text-slate-400 font-mono">CISPR 25 Class 5 优化</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <label className="text-slate-400 block mb-1">实测振铃频率 (MHz)</label>
              <input
                type="number"
                value={snubberParams.f_ring_MHz}
                onChange={(e) =>
                  setSnubberParams({ ...snubberParams, f_ring_MHz: parseFloat(e.target.value) || 10 })
                }
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100 font-mono"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">MOS 输出电容 C_oss (pF)</label>
              <input
                type="number"
                value={snubberParams.C_oss_pF}
                onChange={(e) =>
                  setSnubberParams({ ...snubberParams, C_oss_pF: parseFloat(e.target.value) || 100 })
                }
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100 font-mono"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">母线工作电压 (V)</label>
              <input
                type="number"
                value={snubberParams.V_bus_V}
                onChange={(e) =>
                  setSnubberParams({ ...snubberParams, V_bus_V: parseFloat(e.target.value) || 13.5 })
                }
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100 font-mono"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">PWM 载波频率 (kHz)</label>
              <input
                type="number"
                value={snubberParams.f_sw_kHz}
                onChange={(e) =>
                  setSnubberParams({ ...snubberParams, f_sw_kHz: parseFloat(e.target.value) || 20 })
                }
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100 font-mono"
              />
            </div>
          </div>

          {snubberResult && (
            <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800 space-y-2.5 text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div>
                  <span className="text-slate-400 text-[10px] block">推算环路杂散电感</span>
                  <span className="text-base font-bold font-mono text-amber-400">
                    {snubberResult.loopInductanceNh} nH
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">推荐吸收电容 C_snub</span>
                  <span className="text-base font-bold font-mono text-emerald-400">
                    {snubberResult.recommendedCsnubPf} pF
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">推荐吸收电阻 R_snub</span>
                  <span className="text-base font-bold font-mono text-emerald-400">
                    {snubberResult.recommendedRsnubOhm} Ω
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">单相电阻耗散功率</span>
                  <span className="text-base font-bold font-mono text-blue-400">
                    {snubberResult.snubberPowerDissipationW} W
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-800/80 pt-2">
                <span>阻尼比设计：ζ = {snubberResult.dampingRatio} (临界阻尼)</span>
                <span className="text-emerald-400 font-semibold">
                  预估高频振铃与传导尖峰衰减：~{snubberResult.attenuationDbe} dB
                </span>
              </div>
            </div>
          )}
        </div>

        {/* 模块 4：堵转瞬态脉冲温升与 Foster 4阶结温模型 */}
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center space-x-2">
              <ArrowDownCircle className="w-4 h-4 text-red-400" />
              <h3 className="font-bold text-sm text-slate-100">
                4. 机械硬限位堵转瞬态结温 (Foster 4阶热网络)
              </h3>
            </div>
            {stallResult && (
              <span
                className={`text-[11px] px-2 py-0.5 rounded font-bold border ${
                  stallResult.status === 'PASS'
                    ? 'bg-emerald-950 text-emerald-300 border-emerald-700'
                    : stallResult.status === 'WARNING_DERATING'
                    ? 'bg-amber-950 text-amber-300 border-amber-700'
                    : 'bg-red-950 text-red-300 border-red-700 animate-pulse'
                }`}
              >
                {stallResult.status === 'PASS'
                  ? '热设计达标 (Safe)'
                  : stallResult.status === 'WARNING_DERATING'
                  ? '突破降额门限 (Derating Exceeded)'
                  : '过热烧毁危险 (Burnout Hazard)'}
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <label className="text-slate-400 block mb-1">环境温度 (发泡海绵℃)</label>
              <input
                type="number"
                value={stallParams.ambientTempC}
                onChange={(e) =>
                  setStallParams({ ...stallParams, ambientTempC: parseFloat(e.target.value) || 25 })
                }
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100 font-mono"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">堵转电流 (A)</label>
              <input
                type="number"
                value={stallParams.stallCurrentA}
                onChange={(e) =>
                  setStallParams({ ...stallParams, stallCurrentA: parseFloat(e.target.value) || 10 })
                }
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100 font-mono"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">堵转持续时间 (ms)</label>
              <input
                type="number"
                step="100"
                value={stallParams.stallDurationMs}
                onChange={(e) =>
                  setStallParams({ ...stallParams, stallDurationMs: parseFloat(e.target.value) || 500 })
                }
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100 font-mono"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">MOS 内阻 (25℃ mΩ)</label>
              <input
                type="number"
                step="0.2"
                value={stallParams.rdson25mOhm}
                onChange={(e) =>
                  setStallParams({ ...stallParams, rdson25mOhm: parseFloat(e.target.value) || 2.0 })
                }
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100 font-mono"
              />
            </div>
          </div>

          {stallResult && (
            <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800 space-y-2.5 text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div>
                  <span className="text-slate-400 text-[10px] block">峰值结温 Tj_peak</span>
                  <span
                    className={`text-base font-bold font-mono ${
                      stallResult.isExceedingTjMax
                        ? 'text-red-400'
                        : stallResult.isExceedingDerating
                        ? 'text-amber-400'
                        : 'text-emerald-400'
                    }`}
                  >
                    {stallResult.peakTj} ℃
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">瞬态温升 ΔT</span>
                  <span className="text-base font-bold font-mono text-slate-200">
                    +{stallResult.maxDeltaT} K
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">堵转电功率 P_stall</span>
                  <span className="text-base font-bold font-mono text-amber-400">
                    {stallResult.stallPowerW} W
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">有效瞬态热阻 Z_th</span>
                  <span className="text-base font-bold font-mono text-blue-400">
                    {stallResult.effectiveZth} K/W
                  </span>
                </div>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed border-t border-slate-800/80 pt-2">
                💡 <strong>热安全结论：</strong> {stallResult.recommendation}
              </p>
            </div>
          )}
        </div>

        {/* 模块 5：换相角误差与失步转矩纹波评估 (Commutation Error & Stall Risk) */}
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center space-x-2">
              <Activity className="w-4 h-4 text-purple-400" />
              <h3 className="font-bold text-sm text-slate-100">
                5. 换相角误差与失步转矩纹波评估 (Commutation Risk)
              </h3>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded bg-purple-950/80 text-purple-300 border border-purple-800/60 font-semibold font-mono">
              FOC / 6-Step Dynamics
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="text-slate-400 block mb-1">控制算法模式</label>
              <select
                value={commutationParams.controlMode}
                onChange={(e) =>
                  setCommutationParams({
                    ...commutationParams,
                    controlMode: e.target.value as 'sensorless_bemf' | 'hall_six_step' | 'foc_vector',
                  })
                }
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100 font-medium"
              >
                <option value="hall_six_step">三霍尔六步方波 (Hall 6-Step)</option>
                <option value="foc_vector">磁场定向控制 (FOC Vector)</option>
                <option value="sensorless_bemf">无感反电势滑模 (Sensorless BEMF)</option>
              </select>
            </div>
            <div>
              <label className="text-slate-400 block mb-1">换相电角度偏差 Δθ (°)</label>
              <input
                type="number"
                step="0.5"
                min="0"
                max="35"
                value={commutationParams.angleOffsetDeg}
                onChange={(e) =>
                  setCommutationParams({
                    ...commutationParams,
                    angleOffsetDeg: parseFloat(e.target.value) || 0,
                  })
                }
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100 font-mono"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">运行转速区间 (rpm)</label>
              <div className="flex items-center space-x-1">
                <input
                  type="number"
                  value={commutationParams.speedMinRpm}
                  onChange={(e) =>
                    setCommutationParams({
                      ...commutationParams,
                      speedMinRpm: parseFloat(e.target.value) || 100,
                    })
                  }
                  className="w-1/2 bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-slate-100 font-mono text-xs"
                  placeholder="Min"
                />
                <span className="text-slate-500">-</span>
                <input
                  type="number"
                  value={commutationParams.speedMaxRpm}
                  onChange={(e) =>
                    setCommutationParams({
                      ...commutationParams,
                      speedMaxRpm: parseFloat(e.target.value) || 3000,
                    })
                  }
                  className="w-1/2 bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-slate-100 font-mono text-xs"
                  placeholder="Max"
                />
              </div>
            </div>
            <div>
              <label className="text-slate-400 block mb-1">负载扭矩波动 (%)</label>
              <input
                type="number"
                value={commutationParams.torqueFluctuationPct}
                onChange={(e) =>
                  setCommutationParams({
                    ...commutationParams,
                    torqueFluctuationPct: parseFloat(e.target.value) || 0,
                  })
                }
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100 font-mono"
              />
            </div>
          </div>

          {commutationResult && (
            <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800 space-y-2 text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <div>
                  <span className="text-slate-400 text-[10px] block">转矩纹波预估</span>
                  <span
                    className={`text-base font-bold font-mono ${
                      commutationResult.torqueRipplePct > 25
                        ? 'text-red-400'
                        : commutationResult.torqueRipplePct > 15
                        ? 'text-amber-400'
                        : 'text-emerald-400'
                    }`}
                  >
                    {commutationResult.torqueRipplePct}%
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">失步卡死概率</span>
                  <span
                    className={`text-base font-bold font-mono uppercase ${
                      commutationResult.stallOutProbability === 'high'
                        ? 'text-red-400'
                        : commutationResult.stallOutProbability === 'medium'
                        ? 'text-amber-400'
                        : 'text-emerald-400'
                    }`}
                  >
                    {commutationResult.stallOutProbability} Risk
                  </span>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <span className="text-slate-400 text-[10px] block">功角裕量评级</span>
                  <span className="text-xs font-bold text-slate-200">
                    {commutationParams.angleOffsetDeg <= 10 ? '稳定区间 (Margin > 30°)' : '濒临失稳临界线'}
                  </span>
                </div>
              </div>
              <p className="text-[11px] text-slate-300 border-t border-slate-800/80 pt-1.5">
                ⚠️ <strong>机理分析：</strong> {commutationResult.stallOutReason}
              </p>
              <p className="text-[11px] text-purple-300">
                🛡️ <strong>降级保护策略：</strong> {commutationResult.degradationAction}
              </p>
            </div>
          )}
        </div>

        {/* 模块 6：转子位置传感器失效降级与 2-Hall 容错 (Sensor Fault Tolerance) */}
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center space-x-2">
              <ShieldAlert className="w-4 h-4 text-emerald-400" />
              <h3 className="font-bold text-sm text-slate-100">
                6. 位置传感器失效降级与 2-Hall 容错 (Sensor Degradation)
              </h3>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-800/60 font-semibold font-mono">
              ISO 26262 Limp-Home
            </span>
          </div>

          <div className="text-xs">
            <label className="text-slate-400 block mb-1">传感器硬件架构类型</label>
            <select
              value={sensorParams.sensorType}
              onChange={(e) =>
                setSensorParams({
                  sensorType: e.target.value as 'hall_triple' | 'hall_single' | 'optical_encoder' | 'sensorless',
                })
              }
              className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100 font-medium"
            >
              <option value="hall_triple">三霍尔传感器 (120° 空间分布，具备 2-Hall 容错)</option>
              <option value="hall_single">单霍尔传感器 (无正交冗余，单点故障直接停机)</option>
              <option value="optical_encoder">增量式光电编码器 (ABZ 正交相位 + 磁链观测器)</option>
              <option value="sensorless">无传感器高频注入 (HFI + 滑模观测器)</option>
            </select>
          </div>

          {sensorResult && (
            <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">硬件冗余可用性：</span>
                <span
                  className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                    sensorResult.redundancyAvailable
                      ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                      : 'bg-red-950 text-red-400 border border-red-800'
                  }`}
                >
                  {sensorResult.redundancyAvailable ? '具备失效冗余与重构算法' : '无硬件冗余 (Single Point Failure)'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 text-[10px] block">故障触发诊断码 (DTC)</span>
                <span className="font-mono text-xs font-bold text-amber-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                  {sensorResult.dtcTriggered}
                </span>
              </div>
              <p className="text-[11px] text-slate-300">
                🔄 <strong>状态机重构逻辑：</strong> {sensorResult.switchingLogic}
              </p>
              <p className="text-[11px] text-amber-300">
                ⚡ <strong>性能衰退与限速：</strong> {sensorResult.performanceLoss}
              </p>
              <div className="border-t border-slate-800/80 pt-2 flex items-center justify-between text-[11px]">
                <span className="text-slate-400">DFMEA 独立条目风险打分：</span>
                <span className="font-mono font-bold text-slate-200">
                  S: {sensorResult.dfmeaSeverity} | O: {sensorResult.dfmeaOccurrence} | D: {sensorResult.dfmeaDetection} (RPN: {sensorResult.dfmeaSeverity * sensorResult.dfmeaOccurrence * sensorResult.dfmeaDetection})
                </span>
              </div>
            </div>
          )}
        </div>

        {/* 模块 7：ISO 26262 功能安全链 FHTI 预算与双通道采样核验 (Safety Chain Timing) */}
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-4 lg:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-cyan-400" />
              <h3 className="font-bold text-sm text-slate-100">
                7. ISO 26262-5 功能安全链 FHTI 预算与双通道采样核验 (Safety Chain & Watchdog)
              </h3>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-950/80 text-cyan-300 border border-cyan-800/60 font-semibold font-mono">
              FHTI & ASIL B Timing
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <label className="text-slate-400 block mb-1">FHTI 时间预算 (ms)</label>
              <input
                type="number"
                step="0.5"
                value={safetyChainParams.fhtiBudgetMs}
                onChange={(e) =>
                  setSafetyChainParams({
                    ...safetyChainParams,
                    fhtiBudgetMs: parseFloat(e.target.value) || 10,
                  })
                }
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100 font-mono"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">硬件看门狗窗口 (ms)</label>
              <input
                type="number"
                step="0.5"
                value={safetyChainParams.wdgTimeoutWindowMs}
                onChange={(e) =>
                  setSafetyChainParams({
                    ...safetyChainParams,
                    wdgTimeoutWindowMs: parseFloat(e.target.value) || 4,
                  })
                }
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100 font-mono"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">安全状态切换延时 (ms)</label>
              <input
                type="number"
                step="0.1"
                value={safetyChainParams.safeStateTransitionMs}
                onChange={(e) =>
                  setSafetyChainParams({
                    ...safetyChainParams,
                    safeStateTransitionMs: parseFloat(e.target.value) || 2.2,
                  })
                }
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100 font-mono"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">双通道采样偏差 (%)</label>
              <input
                type="number"
                step="0.2"
                value={safetyChainParams.currentSenseDeviationPct}
                onChange={(e) =>
                  setSafetyChainParams({
                    ...safetyChainParams,
                    currentSenseDeviationPct: parseFloat(e.target.value) || 0,
                  })
                }
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100 font-mono"
              />
            </div>
          </div>

          {safetyChainResult && (
            <div className="bg-slate-900/80 p-3.5 rounded-lg border border-slate-800 space-y-2 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
                <div className="flex items-center space-x-2">
                  <span className="text-slate-400 text-xs">FHTI 时序闭环：</span>
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-bold font-mono ${
                      safetyChainResult.timingCompliance === 'PASS'
                        ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                        : 'bg-red-950 text-red-400 border border-red-800'
                    }`}
                  >
                    {safetyChainResult.timingCompliance === 'PASS' ? 'COMPLIANT (PASS)' : 'VIOLATION (CRITICAL)'}
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-slate-400 text-xs">时序安全裕量：</span>
                  <span
                    className={`font-mono font-bold text-xs ${
                      safetyChainResult.marginMs >= 0 ? 'text-emerald-400' : 'text-red-400'
                    }`}
                  >
                    {safetyChainResult.marginMs > 0 ? `+${safetyChainResult.marginMs} ms` : `${safetyChainResult.marginMs} ms`}
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-slate-400 text-xs">电流双通道核验：</span>
                  <span
                    className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                      safetyChainResult.currentSenseStatus === 'COMPLIANT'
                        ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                        : safetyChainResult.currentSenseStatus === 'WARNING'
                        ? 'bg-amber-950 text-amber-400 border border-amber-800'
                        : 'bg-red-950 text-red-400 border border-red-800'
                    }`}
                  >
                    {safetyChainResult.currentSenseStatus}
                  </span>
                </div>
              </div>
              <p className="text-[11px] text-slate-300 border-t border-slate-800/80 pt-2">
                ⏱️ <strong>链路时序判定：</strong> {safetyChainResult.detail}
              </p>
              <p className="text-[11px] text-cyan-300">
                🔍 <strong>采样交叉诊断：</strong> {safetyChainResult.currentSenseDiagnosis}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
