const fs = require('fs');

let content = fs.readFileSync('src/components/MotorDriveToolbox.tsx', 'utf-8');

const regex = /<div className="text-xl font-bold text-slate-100">\s*\{millerResult\.vGateInducedV\} V\s*<\/div>/m;
const match = content.match(regex);
if (match) {
  const newText = `<div className="text-xl font-bold text-slate-100">
                      {millerResult.isRk4Simulated ? millerResult.vGateInducedV_max : millerResult.vGateInducedV} V
                      {millerResult.isRk4Simulated && <span className="text-xs text-slate-400 ml-2 font-normal">(RK4 峰值)</span>}
                    </div>`;
  content = content.replace(match[0], newText);
  fs.writeFileSync('src/components/MotorDriveToolbox.tsx', content);
}
