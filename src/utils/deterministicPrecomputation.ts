import { ProjectContext, IssueInput } from '../types';
import { calculateBldcDeterministicCalculations } from './bldcDeterministicEngine';
import { calculateRobotJointDeterministicCalculations } from './robotJointDeterministicEngine';
import { resolveEngineeringDomains } from './scenarioDomainEngine';
import { extractUnifiedEngineeringModel } from './unifiedStateExtractor';
import { calculateThermalCascade } from './thermalCascadeEngine';

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
 * 确定性车规物理预核算引擎
 * 在调用大语言模型之前，直接调用本地经过 ISO/AEC 方程标定的数学物理引擎完成预计算，
 * 消除大模型直接凭空心算高阶非线性物理参数时的“算术幻觉”，作为不可推翻的锚定事实注入 Prompt。
 */
export function runDeterministicPrecomputations(
  context: ProjectContext,
  issue: IssueInput
): PrecomputedFact[] {
  const facts: PrecomputedFact[] = [];
  const state = extractUnifiedEngineeringModel(context, issue);
  const fullText = [
    issue.failurePhenomenon,
    issue.requirement,
    issue.testCondition,
    issue.actualMeasurement,
    issue.engineeringConcern,
    issue.notes
  ].join(' ');

  // Phase 1: 热力-电气 耦合预计算 (Thermal-Electrical Cascade)
  // 如果输入足够，算稳态结温，并且将恶化后的物理参数注回状态树，供下游安全验证。
  const thermalResult = calculateThermalCascade(state);
  if (thermalResult) {
    facts.push(thermalResult.fact);
    // 注入恶化参数到状态树 (Pipeline DAG)
    state.powerStage.vthMinV = thermalResult.vthHot;
    state.powerStage.rdsOnMilliOhm = thermalResult.rdsOnHot;
    // 此高温甚至会导致关断更慢，如果后续有专门模型可以继续在此叠加大
  }

  // Phase 2: 安全与电气时序判据 (如 Bus Pumping, Miller)
  // 此时的 BLDC 引擎将透明地使用 Phase 1 恶化过的高温 Vth!
  if (resolveEngineeringDomains(issue).includes('BLDC')) {
    const bldcCalculations = calculateBldcDeterministicCalculations(issue, state);

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

  if (resolveEngineeringDomains(issue).includes('ROBOT_JOINT')) {
    const jointCalculations = calculateRobotJointDeterministicCalculations(issue, state);

    for (const calc of jointCalculations) {
      if (calc.status === 'INSUFFICIENT_INPUT') {
        facts.push({
          id: calc.id,
          category: 'HARMONIC_BACKLASH',
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
        category: 'HARMONIC_BACKLASH',
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
