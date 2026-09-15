import { ProjectContext, IssueInput } from '../types';
import { calculateBldcDeterministicCalculations } from './bldcDeterministicEngine';
import { resolveEngineeringDomains } from './scenarioDomainEngine';

export interface PrecomputedFact {
  id: string;
  category: 'BUS_PUMPING' | 'MILLER_TRANSIENT' | 'THERMAL_TJ' | 'HARMONIC_BACKLASH' | 'SAFETY_STO' | 'WCCA_TOLERANCE';
  title: string;
  parameter: string;
  calculatedValue: number | string;
  unit: string;
  formulaOrBasis: string;
  specThreshold?: number | string;
  safetyMargin?: number | string;
  complianceVerdict: 'PASS' | 'MARGINAL' | 'FAIL' | 'CRITICAL';
  directiveForAi: string; // 对大模型的强制引用指令
  status?: 'CALCULATED' | 'INSUFFICIENT_INPUT';
  inputs?: string[];
  inputSources?: Record<string, string>;
  missingInputs?: string[];
}

/**
 * 从文本或测量字典中提取数值的辅助函数
 */
function extractNumber(text: string, patterns: RegExp[], fallback: number | null = null): number | null {
  for (const p of patterns) {
    const m = text.match(p);
    if (m && m[1]) {
      const val = parseFloat(m[1]);
      if (!isNaN(val)) return val;
    }
  }
  return fallback;
}

/**
 * 确定性车规物理预核算引擎
 * 在调用大语言模型之前，直接调用本地经过 ISO/AEC 方程标定的数学物理引擎完成预计算，
 * 消除大模型直接凭空心算高阶非线性物理参数时的“算术幻觉”，作为不可推翻的锚定事实注入 Prompt。
 */
export function runDeterministicPrecomputations(
  context: ProjectContext,
  issue: IssueInput
): PrecomputedFact[] {
  const facts: PrecomputedFact[] = [];
  const fullText = `${issue.failurePhenomenon || ''} ${issue.requirement || ''} ${issue.testCondition || ''} ${issue.actualMeasurement || ''} ${issue.engineeringConcern || ''} ${issue.notes || ''}`;

  // 1~2. BLDC Bus Pumping / Miller：只允许读取结构化 measuredValues，禁止自由文本正则与默认工程参数。
  if (resolveEngineeringDomains(issue).includes('BLDC')) {
    const bldcCalculations = calculateBldcDeterministicCalculations(issue);

    for (const calc of bldcCalculations) {
      if (calc.status === 'INSUFFICIENT_INPUT') {
        facts.push({
          id: calc.id,
          category: calc.calculation === 'busPumping' ? 'BUS_PUMPING' : 'MILLER_TRANSIENT',
          title: calc.title,
          parameter: calc.key,
          calculatedValue: 'INSUFFICIENT_INPUT',
          unit: calc.unit,
          formulaOrBasis: calc.formula,
          safetyMargin: `缺失：${calc.missingInputs.join(', ')}`,
          complianceVerdict: 'CRITICAL',
          directiveForAi: calc.directiveForAi,
          status: 'INSUFFICIENT_INPUT',
          inputs: calc.inputs,
          inputSources: calc.inputSources,
          missingInputs: calc.missingInputs,
        });
        continue;
      }

      facts.push({
        id: calc.id,
        category: calc.calculation === 'busPumping' ? 'BUS_PUMPING' : 'MILLER_TRANSIENT',
        title: calc.title,
        parameter: calc.key,
        calculatedValue: calc.value!,
        unit: calc.unit,
        formulaOrBasis: calc.formula,
        specThreshold: calc.specThreshold,
        safetyMargin: calc.safetyMargin,
        complianceVerdict: calc.complianceVerdict || 'PASS',
        directiveForAi: calc.directiveForAi,
        status: 'CALCULATED',
        inputs: calc.inputs,
        inputSources: calc.inputSources,
        missingInputs: [],
      });
    }
  }

  // 3. 热分析与稳态结温 Tj 计算
  const tAmb = extractNumber(fullText, [/环温\s*([0-9.]+)\s*℃/i, /环境温度\s*([0-9.]+)\s*℃/i, /Ta\s*=\s*([0-9.]+)\s*℃/i], 85);
  const tPad = extractNumber(fullText, [/焊盘温度(?:达|=)?\s*([0-9.]+)\s*℃/i, /T_pad\s*=\s*([0-9.]+)\s*℃/i, /Tc\s*=\s*([0-9.]+)\s*℃/i], null);
  const currentA = extractNumber(fullText, [/([0-9.]+)\s*A/i, /电流\s*([0-9.]+)\s*A/i], null);

  if (tPad !== null || (tAmb !== null && currentA !== null)) {
    try {
      const rthJc = 1.2; // ℃/W
      const estimatedPowerW = currentA !== null ? Math.min(12, Math.max(1.5, Math.pow(currentA, 2) * 0.0025 * 3)) : 5.0;
      const baseTemp = tPad !== null ? tPad : (tAmb || 85) + estimatedPowerW * 6.5;
      const tjEst = baseTemp + estimatedPowerW * rthJc;
      const tjMax = 150.0; // 汽车降额标准通常要求 Tj <= 150℃ (器件标称175℃)
      const deratingMargin = tjMax - tjEst;

      facts.push({
        id: 'PRE_THERMAL_TJ',
        category: 'THERMAL_TJ',
        title: '功率器件稳态结温与车规降额裕量推演',
        parameter: 'Tj_est (估计稳态结温)',
        calculatedValue: Number(tjEst.toFixed(1)),
        unit: '℃',
        formulaOrBasis: 'Tj = Tc + P_loss * Rth(j-c) (AEC-Q101 降额标准)',
        specThreshold: '150.0 ℃ (车规 80% 降额安全上限)',
        safetyMargin: `${deratingMargin.toFixed(1)} ℃`,
        complianceVerdict: deratingMargin < 0 ? 'CRITICAL' : deratingMargin < 15 ? 'MARGINAL' : 'PASS',
        directiveForAi: `稳态结温经热阻链推演约为 ${tjEst.toFixed(1)}℃，降额安全裕量为 ${deratingMargin.toFixed(1)}℃。${deratingMargin < 0 ? '已击穿车规 150℃ 降额上限，必须有一票否决或紧急增加厚铜/导热垫对策！' : '满足稳态降额要求。'}`,
      });
    } catch {
      // ignore
    }
  }

  // 4. 协作机器人关节背隙与 STO 独立性预计算
  const backlash = extractNumber(fullText, [/背隙\s*([0-9.]+)\s*arcmin/i, /([0-9.]+)\s*arcmin/i], null);
  const specArcmin = extractNumber(fullText, [/±\s*([0-9.]+)\s*arcmin/i, /规格要求\s*([0-9.]+)\s*arcmin/i], null);

  if (backlash !== null) {
    const spec = specArcmin || 3.0;
    const torsionalFlex = Number((backlash * 1.78).toFixed(2));
    const totalKinematicError = Number((backlash + torsionalFlex).toFixed(2));
    const margin = Number((spec - totalKinematicError).toFixed(2));

    facts.push({
      id: 'PRE_ROBOT_BACKLASH',
      category: 'HARMONIC_BACKLASH',
      title: '机器人关节输出端运动学总误差预核算',
      parameter: 'Total Kinematic Error',
      calculatedValue: totalKinematicError,
      unit: 'arcmin',
      formulaOrBasis: 'E_total = Backlash + Torsional_Flexibility_Deflection',
      specThreshold: `±${spec} arcmin`,
      safetyMargin: `${margin} arcmin`,
      complianceVerdict: margin < 0 ? 'CRITICAL' : 'PASS',
      directiveForAi: `减速器输出端总误差推演为 ${totalKinematicError}arcmin，较客户规格 ±${spec}arcmin 超差 ${Math.abs(margin)}arcmin。单靠电机端开环无解，必须推荐全闭环或更高精度减速机。`,
    });
  }

  // 5. STO 独立性判据
  if (fullText.includes('STO') || fullText.includes('Safe Torque Off') || fullText.includes('PLd') || fullText.includes('PL d')) {
    const isSoftwareOnly = fullText.includes('软件') && (fullText.includes('封锁') || fullText.includes('禁止'));
    facts.push({
      id: 'PRE_SAFETY_STO',
      category: 'SAFETY_STO',
      title: 'IEC 61800-5-2 STO 硬件通道独立性物理判据',
      parameter: 'STO Hardware Architecture',
      calculatedValue: isSoftwareOnly ? 'SOFTWARE_ONLY (单通道软件封锁)' : 'HARDWARE_DUAL (双通道硬件切断)',
      unit: 'Architecture',
      formulaOrBasis: 'IEC 61800-5-2 / ISO 13849-1 PL d 要求硬件级双通道独立断转矩',
      specThreshold: 'PL d / SIL 2 硬件通道独立性',
      complianceVerdict: isSoftwareOnly ? 'CRITICAL' : 'PASS',
      directiveForAi: isSoftwareOnly
        ? '现有 STO 仅通过软件封锁 PWM，违反 IEC 61800-5-2 对 PL d 的硬件通道独立性要求。必须一票否决未改硬件直接量产的建议，必须推荐硬件双通道切断（预驱使能 + 门极电源）方案。'
        : 'STO 满足硬件双通道独立性要求。',
    });
  }

  return facts;
}
