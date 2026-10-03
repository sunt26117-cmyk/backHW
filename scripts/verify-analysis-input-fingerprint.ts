import { buildAnalysisInputFingerprint } from '../src/utils/analysisInputFingerprint';

const context: any = {
  projectName: 'FP-TEST', productType: 'ECU', ecuType: 'BLDC', projectPhase: 'DV', asilLevel: 'QM',
  customer: 'TEST', sopDate: 'TBD', nextMilestone: 'DV Gate', daysRemaining: 12,
  costConstraint: '中', sampleStatus: 'B样',
};
const issue: any = {
  issueCategories: ['BLDC Motor Drive'], requirement: 'Vds <= 40V', actualMeasurement: '母线峰值 37V',
  testCondition: '12V / 3000rpm', environment: '台架', failurePhenomenon: '急停泵升', engineeringConcern: '器件耐压裕量',
  attachments: [], measuredValues: { busVoltagePeakV: 37 }, measuredValueSource: 'USER_MEASURED', measurementProvenance: {},
};
const a = buildAnalysisInputFingerprint(context, issue);
const same = buildAnalysisInputFingerprint({ ...context }, { ...issue, measuredValues: { ...issue.measuredValues } });
const changedValue = buildAnalysisInputFingerprint(context, { ...issue, measuredValues: { ...issue.measuredValues, busVoltagePeakV: 39.5 } });
const changedContext = buildAnalysisInputFingerprint({ ...context, daysRemaining: 5 }, issue);
if (a !== same) throw new Error('fingerprint changed for semantically identical input');
if (a === changedValue) throw new Error('fingerprint did not change for measured value');
if (a === changedContext) throw new Error('fingerprint did not change for project context');
console.log('ANALYSIS_INPUT_FINGERPRINT_PASS');
