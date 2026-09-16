import { IssueInput, MeasurementSource } from '../types';
import { UnifiedEngineeringModel } from '../types/v4Models';
import { calculateTwoMassResonance } from './robotJointResonance';
import { DeterministicCalculationStatus } from './bldcDeterministicEngine';
import { extractUnifiedEngineeringModel } from './unifiedStateExtractor';

export interface RobotJointCalculationEvidence {
  id: string;
  key: string;
  title: string;
  status: DeterministicCalculationStatus;
  value?: number;
  unit: string;
  engine: 'robotJointResonance';
  calculation: 'resonance' | 'kinematicError';
  formula: string;
  inputs: string[];
  inputSources: Record<string, MeasurementSource | 'MISSING' | 'DEFAULT_FOR_NONENGINE_PARAMETER'>;
  missingInputs: string[];
  specThreshold?: number;
  safetyMargin?: number;
  complianceVerdict?: 'PASS' | 'MARGINAL' | 'FAIL' | 'CRITICAL';
  directiveForAi: string;
}

function sourceFor(issue: IssueInput, key: string, value: any): MeasurementSource | 'MISSING' {
  if (value === undefined || value === null) return 'MISSING';
  // Check if it exists in measuredValues first
  if (issue.measuredValues && issue.measuredValues[key] !== undefined && issue.measuredValues[key] !== '') {
    return issue.measurementProvenance?.[key]?.source || issue.measuredValueSource || 'USER_MEASURED';
  }
  // Otherwise, it was extracted from text
  return 'TEXT_INFERRED' as any; // Using type cast since TEXT_INFERRED might not be in MeasurementSource enum yet
}

function buildKinematicError(issue: IssueInput, state: UnifiedEngineeringModel): RobotJointCalculationEvidence {
  const inputs = ['backlashArcmin', 'torsionalStiffnessNmPerRad', 'outputTorqueNm', 'requiredPositionAccuracyArcmin'];
  
  // Use mechanical model state
  const values: Record<string, number | undefined> = {
    backlashArcmin: state.mechanical.backlashArcmin || undefined,
    torsionalStiffnessNmPerRad: state.mechanical.torsionalStiffnessNmPerRad || undefined,
    outputTorqueNm: state.motor.peakTorqueNm || undefined,
    requiredPositionAccuracyArcmin: state.mechanical.requiredPositionAccuracyArcmin,
  };

  const missingInputs = ['backlashArcmin', 'torsionalStiffnessNmPerRad', 'outputTorqueNm'].filter((key) => values[key] === undefined);
  const inputSources = Object.fromEntries(inputs.map((key) => [key, sourceFor(issue, key, values[key])])) as RobotJointCalculationEvidence['inputSources'];

  if (missingInputs.length > 0) {
    return {
      id: 'ROBOT_JOINT_KINEMATIC_ERROR',
      key: 'robotJoint.totalErrorArcmin',
      title: '机器人关节运动学总误差',
      status: 'INSUFFICIENT_INPUT',
      unit: 'arcmin',
      engine: 'robotJointResonance',
      calculation: 'kinematicError',
      formula: 'Error = Backlash + (Torque / Stiffness)',
      inputs: inputs.map((key) => `state.${key}`),
      inputSources,
      missingInputs: missingInputs.map((key) => `state.${key}`),
      directiveForAi: `当前机器人关节运动学计算缺少结构化输入：${missingInputs.join(', ')}。不得输出确定性的误差值；不得从自由文本或默认参数补齐。`,
    };
  }

  const windupArcmin = (values.outputTorqueNm! / values.torsionalStiffnessNmPerRad!) * (180 / Math.PI) * 60;
  const totalErrorArcmin = values.backlashArcmin! + windupArcmin;
  const reqAccuracy = values.requiredPositionAccuracyArcmin;
  const safetyMargin = reqAccuracy !== undefined ? reqAccuracy - totalErrorArcmin : undefined;
  
  let verdict: RobotJointCalculationEvidence['complianceVerdict'] = 'PASS';
  if (safetyMargin !== undefined) {
    verdict = safetyMargin < 0 ? 'CRITICAL' : (safetyMargin < reqAccuracy! * 0.2 ? 'MARGINAL' : 'PASS');
  } else {
    verdict = undefined;
  }

  return {
    id: 'ROBOT_JOINT_KINEMATIC_ERROR',
    key: 'robotJoint.totalErrorArcmin',
    title: '机器人关节运动学总误差',
    status: 'CALCULATED',
    value: totalErrorArcmin,
    unit: 'arcmin',
    engine: 'robotJointResonance',
    calculation: 'kinematicError',
    formula: 'Error = Backlash + (Torque / Stiffness)',
    inputs: inputs.map((key) => `state.${key}`),
    inputSources,
    missingInputs: [],
    specThreshold: reqAccuracy,
    safetyMargin: safetyMargin,
    complianceVerdict: verdict,
    directiveForAi: `机器人关节运动学总误差由本地推演为 ${totalErrorArcmin.toFixed(2)} arcmin（背隙 ${values.backlashArcmin} + 扭转变形 ${windupArcmin.toFixed(2)}）。${safetyMargin !== undefined ? `精度裕量 ${safetyMargin.toFixed(2)} arcmin。` : ''} 模型不得自行重算出另一套当前项目数值。`,
  };
}

function buildResonance(issue: IssueInput, state: UnifiedEngineeringModel): RobotJointCalculationEvidence {
  const inputs = ['torsionalStiffnessNmPerRad', 'motorInertiaKgm2', 'loadInertiaKgm2', 'gearRatio', 'velocityLoopBandwidthHz'];
  
  const values: Record<string, number | undefined> = {
    torsionalStiffnessNmPerRad: state.mechanical.torsionalStiffnessNmPerRad || undefined,
    motorInertiaKgm2: state.motor.j || undefined,
    loadInertiaKgm2: state.mechanical.loadInertiaKgm2 || undefined,
    gearRatio: state.mechanical.gearRatio || undefined,
    velocityLoopBandwidthHz: state.mechanical.velocityLoopBandwidthHz,
  };

  const missingInputs = ['torsionalStiffnessNmPerRad', 'motorInertiaKgm2', 'loadInertiaKgm2', 'gearRatio'].filter((key) => values[key] === undefined);
  const inputSources = Object.fromEntries(inputs.map((key) => [key, sourceFor(issue, key, values[key])])) as RobotJointCalculationEvidence['inputSources'];

  if (missingInputs.length > 0) {
    return {
      id: 'ROBOT_JOINT_RESONANCE',
      key: 'robotJoint.resonanceFreqHz',
      title: '机器人关节二质量机械谐振频率',
      status: 'INSUFFICIENT_INPUT',
      unit: 'Hz',
      engine: 'robotJointResonance',
      calculation: 'resonance',
      formula: 'f_res = sqrt(K_output * (1/J_m_refl + 1/J_L)) / 2π',
      inputs: inputs.map((key) => `state.${key}`),
      inputSources,
      missingInputs: missingInputs.map((key) => `state.${key}`),
      directiveForAi: `当前机器人关节谐振计算缺少结构化输入：${missingInputs.join(', ')}。不得从自由文本或默认参数补齐。`,
    };
  }

  const res = calculateTwoMassResonance({
    torsionalStiffnessNmPerRad: values.torsionalStiffnessNmPerRad!,
    motorInertiaKgm2: values.motorInertiaKgm2!,
    loadInertiaKgm2: values.loadInertiaKgm2!,
    gearRatio: values.gearRatio!,
    velocityLoopBandwidthHz: values.velocityLoopBandwidthHz,
  });

  let verdict: RobotJointCalculationEvidence['complianceVerdict'] = 'PASS';
  if (values.velocityLoopBandwidthHz !== undefined) {
    verdict = res.isBandwidthAboveResonance ? 'CRITICAL' : (res.isBandwidthInvadingResonance ? 'MARGINAL' : 'PASS');
  }

  return {
    id: 'ROBOT_JOINT_RESONANCE',
    key: 'robotJoint.resonanceFreqHz',
    title: '机器人关节二质量机械谐振频率',
    status: 'CALCULATED',
    value: res.resonanceFreqHz,
    unit: 'Hz',
    engine: 'robotJointResonance',
    calculation: 'resonance',
    formula: 'f_res = sqrt(K_output * (1/J_m_refl + 1/J_L)) / 2π',
    inputs: inputs.map((key) => `state.${key}`),
    inputSources,
    missingInputs: [],
    specThreshold: values.velocityLoopBandwidthHz !== undefined ? values.velocityLoopBandwidthHz * 3 : undefined, // Ideal isolation ratio is 3x
    safetyMargin: res.bandwidthIsolationRatio, // Here margin is isolation ratio for reference
    complianceVerdict: verdict,
    directiveForAi: `机器人关节二质量机械谐振频率本地算得为 ${res.resonanceFreqHz.toFixed(1)} Hz (反谐振 ${res.antiResonanceFreqHz.toFixed(1)} Hz)。${values.velocityLoopBandwidthHz !== undefined ? `速度环隔离度为 ${res.bandwidthIsolationRatio.toFixed(1)}x。` : ''}模型必须使用这些精确结果，不得重算量纲导致不一致！`,
  };
}

export function calculateRobotJointDeterministicCalculations(issue: IssueInput, state: UnifiedEngineeringModel): RobotJointCalculationEvidence[] {
  return [buildKinematicError(issue, state), buildResonance(issue, state)];
}
