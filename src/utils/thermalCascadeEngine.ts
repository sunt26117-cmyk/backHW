import { IssueInput } from '../types';
import { UnifiedEngineeringModel } from '../types/v4Models';
import { PrecomputedFact } from './deterministicPrecomputation';
import { isDecisionReadyValuePresent } from './unifiedStateExtractor';

export interface ThermalCascadeResult {
  status: 'CALCULATED' | 'INSUFFICIENT_INPUT';
  tjEst?: number;
  rdsOnHot?: number;
  vthHot?: number;
  deratingMargin?: number;
  fact: PrecomputedFact;
}

// 少数字段语义名跟 issue.measuredValues 原始表单字段名不一致
const RAW_KEY: Record<string, string> = {
  vbusNominal: 'busVoltageNominalV',
  currentNominal: 'currentNominalA',
  pwmFrequencyKhz: 'pwmFreqKhz',
};
const rawKeyOf = (key: string) => RAW_KEY[key] || key;

export function calculateThermalCascade(issue: IssueInput, state: UnifiedEngineeringModel): ThermalCascadeResult | null {
  // 核心必需输入：电流、25℃标称导通电阻、母线电压、PWM开关频率、米勒电荷、结温上限，
  // 全部必须是工程师真实填写的结构化输入；温度基准（焊盘温度/环境温度）二选一即可。
  // 之前的实现直接读 state.xxx 并用 `|| 默认值` 兜底，state 里的数值即使输入缺失也永远
  // 是一个数字（unifiedStateExtractor 里写死的经验默认值），导致这里的"输入不足"检查从未生效，
  // 每次都会算出一个包装成"确定性结温"的、实际上大半是拍脑袋常数拼出来的数字。
  const hasCaseTemp = isDecisionReadyValuePresent(issue, 'tCaseC');
  const hasAmbientTemp = isDecisionReadyValuePresent(issue, 'tAmbientC');
  const requiredCoreKeys = ['currentNominal', 'rdsOnMilliOhm', 'vbusNominal', 'pwmFrequencyKhz', 'qgdNc', 'tjMaxC'];
  const missingCore = requiredCoreKeys.filter((key) => !isDecisionReadyValuePresent(issue, rawKeyOf(key)));
  const missingTemp = !hasCaseTemp && !hasAmbientTemp ? ['tCaseC(焊盘温度) 或 tAmbientC(环境温度)'] : [];
  const missingInputs = [...missingCore, ...missingTemp];

  if (missingInputs.length > 0) {
    return {
      status: 'INSUFFICIENT_INPUT',
      fact: {
        id: 'PRE_THERMAL_TJ',
        category: 'THERMAL_TJ',
        title: '多物理场级联计算：功率器件稳态结温与车规降额裕量',
        parameter: 'Tj_est (估计稳态结温)',
        calculatedValue: 'INSUFFICIENT_INPUT',
        unit: '℃',
        formulaOrBasis: 'Rds(on)温度漂移反馈环 -> 损耗 -> 热阻链',
        safetyMargin: `缺失：${missingInputs.join(', ')}`,
        complianceVerdict: 'CRITICAL',
        directiveForAi: `当前结温级联计算缺少结构化输入：${missingInputs.join(', ')}。不得输出确定性的结温/降额裕量数值，不得用默认参数或自由文本补齐，缺失部分必须写入 unknowns。`,
        status: 'INSUFFICIENT_INPUT',
      },
    };
  }

  try {
    const tAmb = state.environment.tAmbientC;
    const tPad = hasCaseTemp ? state.environment.tCaseC : undefined;
    const currentA = state.electrical.currentNominal;
    const rthJc = 1.2; // ℃/W - TO-252/D2PAK 典型封装热阻，这是封装级模型假设常数，不是逐项目测量值
    const vbus = state.electrical.vbusNominal;
    const fswKhz = state.electrical.pwmFrequencyKhz;
    const rdsOnNominal = state.powerStage.rdsOnMilliOhm;
    const qgd = state.powerStage.qgdNc;
    const tjMax = state.environment.tjMaxC;

    let tjEst = tPad !== undefined ? tPad : tAmb + 5; // 初始猜测
    let rdsOnHot = rdsOnNominal;
    let powerLoss = 0;

    // 迭代收敛 Tj 与 Rds(on) 的正反馈环，而不是固定跑3次就直接采用最后一次的数字——
    // 3次对某些工况可能还没收敛（结温还在明显变化），对另一些工况又是白跑（提前就已经稳定了）。
    // 同时要能识别"结温正反馈发散"这个真实的物理现象（散热路径撑不住导通电阻随温度上升的
    // 恶化速度），不能让它悄悄算出一个巨大但看起来"正常"的数字。
    const MAX_ITERATIONS = 30;
    const CONVERGENCE_TOLERANCE_C = 0.05;
    const PHYSICALLY_IMPOSSIBLE_TJ_C = 500; // 超过这个量级，任何常见封装都不可能维持，判定为发散/热失控
    let converged = false;
    let isThermalRunaway = false;

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const prevTj = tjEst;
      rdsOnHot = rdsOnNominal * (1 + ((tjEst - 25) / 50) * 0.4);
      const pCond = Math.pow(currentA, 2) * (rdsOnHot / 1000);
      const iGate = 0.5; // 假定门驱电流 0.5A（模型假设，非测量值）
      const tSwNs = qgd / iGate;
      const pSw = 0.5 * vbus * currentA * (tSwNs * 1e-9) * (fswKhz * 1e3) * 2;
      powerLoss = pCond + pSw;
      const baseTemp = tPad !== undefined ? tPad : tAmb + powerLoss * 6.5; // 6.5℃/W 为 RthCA 假设常数
      tjEst = baseTemp + powerLoss * rthJc;

      if (!isFinite(tjEst) || tjEst > PHYSICALLY_IMPOSSIBLE_TJ_C) {
        isThermalRunaway = true;
        break;
      }
      if (Math.abs(tjEst - prevTj) < CONVERGENCE_TOLERANCE_C) {
        converged = true;
        break;
      }
    }

    if (isThermalRunaway) {
      return {
        status: 'CALCULATED',
        tjEst: undefined,
        deratingMargin: undefined,
        fact: {
          id: 'PRE_THERMAL_TJ',
          category: 'THERMAL_TJ',
          title: '多物理场级联计算：功率器件稳态结温与车规降额裕量',
          parameter: 'Tj_est (估计稳态结温)',
          calculatedValue: 'THERMAL_RUNAWAY',
          unit: '℃',
          formulaOrBasis: 'Rds(on)温度漂移反馈环 -> 损耗 -> 热阻链，迭代未能收敛于合理量级',
          safetyMargin: `迭代 ${MAX_ITERATIONS} 次仍未收敛，或结温超过 ${PHYSICALLY_IMPOSSIBLE_TJ_C}℃（任何常见封装都不可能维持）`,
          complianceVerdict: 'CRITICAL',
          directiveForAi: `【重要-热失控风险】按当前结构化输入迭代计算 Rds(on) 温漂正反馈环，未能收敛到一个物理上合理的稳态结温——说明当前散热路径大概率无法承受此工况下的功率损耗，属于真实的热失控风险信号，不是数值计算故障。模型必须将此标记为需要立即复核散热设计/降低负载工况的高优先级问题，不得忽略或自行假设一个"合理"的结温数字继续推演。`,
          status: 'CALCULATED',
        },
      };
    }

    const deratingMargin = tjMax - tjEst;

    // Vth 是可选字段：只有真实测量值存在才计算高温漂移后数值，不能替它假设一个 2.0V
    const vthNominal = state.powerStage.vthMinV;
    const vthHot = vthNominal !== undefined ? vthNominal - (tjEst - 25) * 0.002 : undefined;

    return {
      status: 'CALCULATED',
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
        formulaOrBasis: 'Rds(on)温度漂移反馈环 -> 损耗 -> 热阻链（rthJc=1.2℃/W、RthCA=6.5℃/W、门驱电流0.5A 为封装/驱动级建模假设常数；Rds(on)温漂采用线性近似 (1+((Tj-25)/50)×0.4)，实际器件通常呈超线性特性，量产签核前建议用datasheet实测Rds(on)-Tj曲线校核，均非逐项目测量值）',
        specThreshold: `${tjMax.toFixed(1)} ℃ (车规降额安全上限)`,
        safetyMargin: `${deratingMargin.toFixed(1)} ℃`,
        complianceVerdict: deratingMargin < 0 ? 'CRITICAL' : deratingMargin < 15 ? 'MARGINAL' : 'PASS',
        directiveForAi: `【重要】此为电气-热力跨域级联计算结果。当前稳态结温已收敛至 ${tjEst.toFixed(1)}℃，降额安全裕量 ${deratingMargin.toFixed(1)}℃。高温导致导通内阻恶化至 ${rdsOnHot.toFixed(1)}mΩ (25℃标称 ${rdsOnNominal}mΩ)。${vthHot !== undefined ? `Vth 下降至 ${vthHot.toFixed(2)}V。` : 'Vth 无真实测量输入，未计算高温漂移后数值，不得假设。'}模型需依据这些恶化后参数进行推演，不得自行重算。`,
        status: 'CALCULATED',
      },
    };
  } catch {
    return null;
  }
}
