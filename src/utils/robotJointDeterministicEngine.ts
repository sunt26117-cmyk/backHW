import { IssueInput, MeasurementSource } from '../types';
import { UnifiedEngineeringModel } from '../types/v4Models';
import { calculateTwoMassResonance } from './robotJointResonance';
import { DeterministicCalculationStatus } from './bldcDeterministicEngine';
import { extractUnifiedEngineeringModel, isDecisionReadyValuePresent } from './unifiedStateExtractor';

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

// 少数字段在这个文件里用的"语义名"跟 issue.measuredValues / unifiedStateExtractor 里的
// 原始表单字段名不一致（outputTorqueNm 实际对应表单的 peakTorqueNm，motorInertiaKgm2 实际
// 对应表单的 rotorInertiaKgm2），核对是否有真实输入时必须换算成原始字段名去查，否则即使工程师
// 已经真实填写了数据，也会被误判为缺失。
const RAW_MEASURED_KEY: Record<string, string> = {
  outputTorqueNm: 'peakTorqueNm',
  motorInertiaKgm2: 'rotorInertiaKgm2',
};
const rawKeyOf = (key: string) => RAW_MEASURED_KEY[key] || key;

function sourceFor(issue: IssueInput, key: string): MeasurementSource | 'MISSING' {
  // 同 bldcDeterministicEngine.ts：必须核对 issue.measuredValues 原始输入，不能看 state 派生值，
  // 因为 state 在结构化输入缺失时会被 unifiedStateExtractor.getNum() 用写死的默认值兜底。
  const rawKey = rawKeyOf(key);
  if (!isDecisionReadyValuePresent(issue, rawKey)) return 'MISSING';
  return issue.measurementProvenance?.[rawKey]?.source || issue.measuredValueSource || 'USER_MEASURED';
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

  const missingInputs = ['backlashArcmin', 'torsionalStiffnessNmPerRad', 'outputTorqueNm'].filter(
    (key) => !isDecisionReadyValuePresent(issue, rawKeyOf(key))
  );
  const inputSources = Object.fromEntries(inputs.map((key) => [key, sourceFor(issue, key)])) as RobotJointCalculationEvidence['inputSources'];

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

  const missingInputs = ['torsionalStiffnessNmPerRad', 'motorInertiaKgm2', 'loadInertiaKgm2', 'gearRatio'].filter(
    (key) => !isDecisionReadyValuePresent(issue, rawKeyOf(key))
  );
  const inputSources = Object.fromEntries(inputs.map((key) => [key, sourceFor(issue, key)])) as RobotJointCalculationEvidence['inputSources'];

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
