const fs = require('fs');
const src = fs.readFileSync('src/components/MotorDriveToolbox.tsx', 'utf8');
const governance = fs.readFileSync('src/utils/motorDriveInputGovernance.ts', 'utf8');
const defaults = fs.readFileSync('src/utils/motorDriveWhatIfDefaults.ts', 'utf8');
const schema = fs.readFileSync('src/domains/bldc/motorDriveInputSchema.ts', 'utf8');
const checks = [
  ['专项工具使用统一输入治理目录', /motorDriveInputGovernance/.test(src) && /MOTOR_DRIVE_INPUTS/.test(src)],
  ['What-if 起始值集中管理', /MOTOR_DRIVE_WHAT_IF_DEFAULTS/.test(src) && /UI starting points for an isolated What-if/.test(defaults)],
  ['当前工程 / What-if 边界在组件中可见', (src.match(/<InputBoundary group=/g) || []).length >= 6],
  ['What-if 不自动写入 IssueInput', /writeMotorDriveWhatIfToIssue/.test(src) && !/updateIssueMeasuredValue\(/.test(src)],
  ['正式 domain schema 是唯一归属表', /MOTOR_DRIVE_DOMAIN_SCHEMA/.test(schema) && /CURRENT_ISSUE/.test(schema) && /WHAT_IF_ONLY/.test(schema)],
  ['只有 CURRENT_ISSUE 字段允许显式回写', /binding !== 'CURRENT_ISSUE'/.test(schema) && /writeMotorDriveWhatIfToIssue/.test(schema)],
  ['核心 BLDC 输入仍可从 IssueInput 绑定', /busVoltageNominalV/.test(schema) && /vdsRatingV/.test(schema) && /cBusUf/.test(schema) && /rotorInertiaKgm2/.test(schema) && /vthMinV/.test(schema)],
  ['MotorDriveToolbox 不维护典型工况第二入口', !/applyPreset\(/.test(src)],
];
let failed=false;
for (const [name, ok] of checks) { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (!ok) failed=true; }
if (failed) process.exit(1);
console.log(`MotorDrive input governance: ${checks.length}/${checks.length} passed`);
