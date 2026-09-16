const fs = require('fs');

let motorDriveContent = fs.readFileSync('src/types/motorDrive.ts', 'utf-8');
motorDriveContent = motorDriveContent.replace(
  "export interface MillerRiskResult {",
  `export interface MillerRiskResult {
  millerCurrentA: number;
  vGateInducedV: number;
  vGateInducedV_max?: number; // RK4 peak
  vGateInducedV_min?: number; // RK4 trough
  vThMinV: number;
  safetyMarginV: number;
  isRiskOfShootThrough: boolean;
  riskLevel: 'SAFE' | 'WARNING' | 'CRITICAL_SHOOT_THROUGH';
  recommendation: string;
  isRk4Simulated?: boolean;
}

export interface MillerRiskResultLegacy {`
);
motorDriveContent = motorDriveContent.replace(
  "export interface MillerRiskResultLegacy {\n  millerCurrentA: number;",
  "// Legacy\nexport interface MillerRiskResultLegacy {\n  millerCurrentA: number;"
);
fs.writeFileSync('src/types/motorDrive.ts', motorDriveContent);
