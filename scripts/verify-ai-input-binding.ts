import { buildAnalysisPrompt } from '../src/utils/aiProtocol';

const context = {
  projectName: 'AI-BINDING-TEST', productType: 'ECU', ecuType: 'BLDC', projectPhase: 'DV', asilLevel: 'QM',
  customer: 'TEST', sopDate: 'TBD', nextMilestone: 'DV Gate', daysRemaining: 12,
  costConstraint: '中', sampleStatus: 'B样',
};
const issueBase: any = {
  issueCategories: ['BLDC Motor Drive'], requirement: 'Vds <= 40V', actualMeasurement: '母线峰值 37V',
  testCondition: '12V / 3000rpm / 负载测试', environment: '台架', failurePhenomenon: '急停泵升',
  engineeringConcern: '器件耐压裕量', notes: '', attachments: [], measuredValueSource: 'USER_MEASURED',
  measurementProvenance: {}, measuredValues: { busVoltagePeakV: 37, rotorSpeedRpm: 3000 },
};
const a = buildAnalysisPrompt(context, issueBase).userPrompt;
const b = buildAnalysisPrompt(context, { ...issueBase, measuredValues: { ...issueBase.measuredValues, busVoltagePeakV: 39.5 } }).userPrompt;
const c = buildAnalysisPrompt({ ...context, projectPhase: 'PV', daysRemaining: 5 }, issueBase).userPrompt;
if (a === b) throw new Error('AI prompt did not change when a measured engineering input changed');
if (a === c) throw new Error('AI prompt did not change when project context changed');
if (!a.includes('busVoltagePeakV') || !a.includes('3000')) throw new Error('AI prompt missing current structured input evidence');
if (!b.includes('39.5')) throw new Error('AI prompt missing updated measured value');
console.log('AI_INPUT_BINDING_PASS');
