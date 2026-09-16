import { UnifiedEngineeringModel } from '../types/v4Models';
import { PrecomputedFact } from './deterministicPrecomputation';

export interface ThermalCascadeResult {
  tjEst: number;
  rdsOnHot: number;
  vthHot: number;
  deratingMargin: number;
  fact: PrecomputedFact;
}

export function calculateThermalCascade(state: UnifiedEngineeringModel): ThermalCascadeResult | null {
  const tAmb = state.environment.tAmbientC;
  const tPad = state.environment.tCaseC;
  const currentA = state.electrical.currentNominal;
  
  // Need sufficient inputs to calculate Thermal Pipeline
  if (tPad === undefined && (tAmb === undefined || currentA === undefined)) {
    return null;
  }
  
  try {
    const rthJc = 1.2; // ℃/W - typical TO-252/D2PAK
    const vbus = state.electrical.vbusNominal || 12;
    const fswKhz = state.electrical.pwmFrequencyKhz || 20;
    const rdsOnNominal = state.powerStage.rdsOnMilliOhm; // at 25C
    
    // Iterative thermal calculation
    let tjEst = tPad !== undefined ? tPad : (tAmb || 85) + 5; // Initial guess
    let rdsOnHot = rdsOnNominal;
    let powerLoss = 0;
    
    // 3 iterations to converge Tj and Rds(on)
    for (let i = 0; i < 3; i++) {
      // Rds(on) increases ~40% per 50°C above 25°C
      rdsOnHot = rdsOnNominal * (1 + ((tjEst - 25) / 50) * 0.4);
      
      // Conduction Loss (W)
      const pCond = currentA !== undefined ? Math.pow(currentA, 2) * (rdsOnHot / 1000) : 0;
      
      // Switching Loss (W) - roughly using Qgd as proxy for switching time
      const qgd = state.powerStage.qgdNc || 15;
      const iGate = 0.5; // Assumed gate drive current 0.5A
      const tSwNs = (qgd / iGate); // typical switching time ns
      const pSw = currentA !== undefined ? 0.5 * vbus * currentA * (tSwNs * 1e-9) * (fswKhz * 1e3) * 2 : 0;
      
      powerLoss = pCond + pSw;
      
      const baseTemp = tPad !== undefined ? tPad : (tAmb || 85) + (powerLoss * 6.5); // 6.5 C/W for RthCA if tPad is unknown
      tjEst = baseTemp + powerLoss * rthJc;
    }
    
    const tjMax = state.environment.tjMaxC || 150.0;
    const deratingMargin = tjMax - tjEst;
    
    // Electrical parameter degradation due to temp
    // Vth drops by ~ -2mV/°C
    const vthNominal = state.powerStage.vthMinV || 2.0;
    const vthHot = vthNominal - (tjEst - 25) * 0.002;
    
    return {
      tjEst,
      rdsOnHot,
      vthHot,
      deratingMargin,
      fact: {
        id: 'PRE_THERMAL_TJ',
        category: 'THERMAL_TJ',
        title: '多物理场级联计算：功率器件稳态结温与车规降额裕量',
        parameter: 'Tj_est (估计稳态结温)',
        calculatedValue: Number(tjEst.toFixed(1)),
        unit: '℃',
        formulaOrBasis: 'Rds(on)温度漂移反馈环 -> 损耗 -> 热阻链',
        specThreshold: `${tjMax.toFixed(1)} ℃ (车规降额安全上限)`,
        safetyMargin: `${deratingMargin.toFixed(1)} ℃`,
        complianceVerdict: deratingMargin < 0 ? 'CRITICAL' : deratingMargin < 15 ? 'MARGINAL' : 'PASS',
        directiveForAi: `【重要】此为电气-热力跨域级联计算结果。当前稳态结温已收敛至 ${tjEst.toFixed(1)}℃，降额安全裕量 ${deratingMargin.toFixed(1)}℃。高温导致导通内阻恶化至 ${rdsOnHot.toFixed(1)}mΩ (25℃标称 ${rdsOnNominal}mΩ)，Vth 下降至 ${vthHot.toFixed(2)}V。模型需依据这些恶化后参数进行推演。`,
        status: 'CALCULATED',
      }
    };
  } catch {
    return null;
  }
}
