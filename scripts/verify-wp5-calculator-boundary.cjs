const fs = require('fs');

const calc = fs.readFileSync('src/components/EngineeringCalculatorView.tsx', 'utf8');
const motor = fs.readFileSync('src/components/MotorDriveToolbox.tsx', 'utf8');
const doc = fs.readFileSync('docs/wp5-calculator-boundary.md', 'utf8');

const checks = [
  ['MotorDriveToolbox 在计算器中不是平级 activeCalc', !/setActiveCalc\(['"]motor_drive['"]\)/.test(calc)],
  ['MotorDriveToolbox 默认折叠', /useState\(false\)/.test(calc) && /motorDriveExpanded/.test(calc)],
  ['计算器使用折叠后才挂载专项工具', /motorDriveExpanded &&/.test(calc)],
  ['专项工具不再维护典型应用预设', !/applyPreset\(/.test(motor)],
  ['专项工具不再依赖 ActuatorArchetype', !/ActuatorArchetype/.test(motor)],
  ['WP5 明确公式不变与边界', /未改变任何物理公式/.test(doc)],
  ['WP5 明确全局 Scenario Manager 为唯一典型工况入口', /唯一入口回到全局 Scenario Manager/.test(doc)],
];

let failed = false;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  if (!ok) failed = true;
}
if (failed) process.exit(1);
console.log(`WP5 calculator boundary: ${checks.length}/${checks.length} passed`);
