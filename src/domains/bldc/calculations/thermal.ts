import { linearInterp } from '../../../utils/deviceLibrary';
import type { BldcEvaluationInput } from '../types';

export interface BldcThermalCalculation {
  assumptions: string[];
  rdsOn25: number;
  iPeak: number;
  rthJc: number;
  rthCaOrJa: number;
  hasRthCa: boolean;
  useRthJaTotal: boolean;
  modIdx: number;
  pf: number;
  swFreq: number;
  swTimeNs: number;
  iDeviceRms: number;
  avgCurrentForSwitching: number;
  qrrLossW: number;
  tjEstimated: number;
  pCondFinal: number;
  pSwFinal: number;
  pTotal: number;
  converged: boolean;
  thermalRunaway: boolean;
  overheat: boolean;
  criticalAssumption: boolean;
  rdsOnAtEstimatedTemp: number;
}

/** Shared thermal model consumed by P006 and P007. */
export function calculateBldcThermal(
  input: BldcEvaluationInput,
  vbusNominalSafe: number,
): BldcThermalCalculation {
  const assumptions: string[] = [];
  const rdsOn25 = input.rdsOnMilliOhm !== undefined ? input.rdsOnMilliOhm : 3.5;
  if (input.rdsOnMilliOhm === undefined) assumptions.push('Rds(on)@25℃未提供，假设3.5mΩ');
  const iPeak = input.currentPeakA !== undefined ? input.currentPeakA : 25;
  if (input.currentPeakA === undefined) assumptions.push('相电流峰值未提供，假设25A');
  const rthJc = input.rthJc !== undefined ? input.rthJc : 1.8;
  if (input.rthJc === undefined) assumptions.push('Rth(结-壳)未提供，假设1.8℃/W(按封装类型典型值)');

  const hasRthCa = input.rthCaOrJa !== undefined;
  const hasRthJaTotal = input.rthJaTotal !== undefined && input.rthJaTotal > 0;
  const useRthJaTotal = hasRthJaTotal && !hasRthCa;
  if (!hasRthCa && !useRthJaTotal) assumptions.push('壳到环境(或结到环境)热阻 rthCaOrJa 未提供，假设12.0℃/W——这是整条热阻链里占比最大的一项，强烈建议实测(温箱多功率点测壳温反推)');
  if (useRthJaTotal) assumptions.push('检测到 datasheet RθJA 总热阻，且未同时提供系统 RθCA；本次直接使用 RθJA，避免 RθJC + RθJA 重复相加');
  const rthCaOrJa = hasRthCa ? input.rthCaOrJa! : 12.0;

  const modIdx = input.modulationIndex !== undefined ? input.modulationIndex : 0.9;
  const pf = input.powerFactorCosPhi !== undefined ? input.powerFactorCosPhi : 0.9;
  const swFreq = input.pwmSwitchingFreqHz !== undefined ? input.pwmSwitchingFreqHz : 20000;
  const swTimeNs = input.switchingTimeNs !== undefined ? input.switchingTimeNs : 55;
  if (input.switchingTimeNs === undefined) assumptions.push('开关重叠时间未提供，假设55ns');

  const iDeviceRms = iPeak * Math.sqrt(Math.max(0, 1 / 8 + (modIdx * pf) / (3 * Math.PI)));
  const avgCurrentForSwitching = (2 / Math.PI) * iPeak;
  const qrrLossW = input.qrrNc !== undefined ? 0.5 * input.qrrNc * 1e-9 * vbusNominalSafe * swFreq : 0;
  if (input.qrrNc === undefined) assumptions.push('体二极管反向恢复电荷Qrr未提供，本次估算未计入Qrr损耗，实际损耗可能更高');

  const rdsOnAtTemp = (tjC: number): number => {
    if (input.rdsOnCurve && input.rdsOnCurve.length >= 2) return linearInterp(input.rdsOnCurve, tjC).value;
    const normAt125 = 1.65;
    const normAt150 = 1.85;
    if (tjC <= 25) return rdsOn25;
    if (tjC <= 125) return rdsOn25 * (1 + (normAt125 - 1) * ((tjC - 25) / 100));
    return rdsOn25 * (normAt125 + (normAt150 - normAt125) * ((tjC - 125) / 25));
  };

  let tjIter = input.tAmbientC + 40;
  let pCondFinal = 0;
  let pSwFinal = 0;
  let converged = false;
  const totalThermalResistance = useRthJaTotal ? input.rthJaTotal! : rthJc + rthCaOrJa;
  for (let i = 0; i < 15; i++) {
    const rdsHot = rdsOnAtTemp(tjIter);
    pCondFinal = Math.pow(iDeviceRms, 2) * (rdsHot * 1e-3);
    pSwFinal = 0.5 * vbusNominalSafe * avgCurrentForSwitching * (swTimeNs * 1e-9) * swFreq + qrrLossW;
    const pTotalIter = pCondFinal + pSwFinal;
    const tjNext = input.tAmbientC + pTotalIter * totalThermalResistance;
    if (Math.abs(tjNext - tjIter) < 0.05) { tjIter = tjNext; converged = true; break; }
    tjIter = tjNext;
    if (tjIter > 400) break;
  }

  const tjEstimated = tjIter;
  const pTotal = pCondFinal + pSwFinal;
  return {
    assumptions,
    rdsOn25,
    iPeak,
    rthJc,
    rthCaOrJa,
    hasRthCa,
    useRthJaTotal,
    modIdx,
    pf,
    swFreq,
    swTimeNs,
    iDeviceRms,
    avgCurrentForSwitching,
    qrrLossW,
    tjEstimated,
    pCondFinal,
    pSwFinal,
    pTotal,
    converged,
    thermalRunaway: Number.isFinite(tjEstimated) && (!converged || tjEstimated > 400),
    overheat: tjEstimated >= 140,
    criticalAssumption: !hasRthCa,
    rdsOnAtEstimatedTemp: rdsOnAtTemp(tjEstimated),
  };
}
