import { IssueInput } from '../types';
import { readMeasuredNumber } from './unifiedStateExtractor';
import {
  MOTOR_DRIVE_DOMAIN_SCHEMA,
  getCurrentIssueFields,
  getMotorDriveField,
  getWhatIfOnlyFields,
  writeMotorDriveWhatIfToIssue,
  type MotorDriveDomainField as MotorDriveInputDescriptor,
  type MotorDriveInputGroup,
  type MotorDriveFieldBinding,
} from '../domains/bldc/motorDriveInputSchema';

/**
 * Compatibility facade. WP5c-2 后，正式归属只在 domain schema；旧调用方继续使用原导出名。
 */
export { MOTOR_DRIVE_DOMAIN_SCHEMA as MOTOR_DRIVE_INPUTS };
export type MotorDriveInputSource = 'CURRENT_ISSUE' | 'WHAT_IF';
export type { MotorDriveInputDescriptor, MotorDriveInputGroup, MotorDriveFieldBinding };
export { getMotorDriveField, getCurrentIssueFields, getWhatIfOnlyFields, writeMotorDriveWhatIfToIssue };

export function getMotorDriveInputSource(issue: IssueInput | undefined, descriptor: MotorDriveInputDescriptor): MotorDriveInputSource {
  if (!issue || !descriptor.issueKey) return 'WHAT_IF';
  return readMeasuredNumber(issue.measuredValues, descriptor.issueKey) !== undefined ? 'CURRENT_ISSUE' : 'WHAT_IF';
}

export function getMotorDriveSourceLabel(issue: IssueInput | undefined, descriptor: MotorDriveInputDescriptor): string {
  if (!descriptor.issueKey) return 'WHAT_IF';
  const provenance = issue?.measurementProvenance?.[descriptor.issueKey];
  return provenance?.source || descriptor.sourceType;
}

export function getMotorDriveInputSummary(issue: IssueInput | undefined, group: MotorDriveInputGroup) {
  const descriptors = MOTOR_DRIVE_DOMAIN_SCHEMA[group];
  const current = descriptors.filter((item) => getMotorDriveInputSource(issue, item) === 'CURRENT_ISSUE');
  const whatIf = descriptors.filter((item) => getMotorDriveInputSource(issue, item) === 'WHAT_IF');
  return { current, whatIf };
}
