const fs = require('fs');

let content = fs.readFileSync('src/components/MotorDriveToolbox.tsx', 'utf-8');

// The toolbox doesn't have C_iss, L_g, vbus in its local state yet.
// We need to add them to the local state `millerParams` or just provide defaults if missing.
// Let's add them to `millerParams` definition.
const regexParams = /const \[millerParams, setMillerParams\] = useState\(\{[\s\S]*?\}\);/;
const matchParams = content.match(regexParams);
if (matchParams) {
    const newParams = `const [millerParams, setMillerParams] = useState({
    V_th_min: 2.0,
    C_gd_pF: 35,
    C_iss_pF: 1500,
    R_g_pulldown_ohm: 3.3,
    L_g_nH: 5,
    dv_dt_V_per_ns: 10,
    vbus: 12,
    hasActiveMillerClamp: false,
  });`;
    content = content.replace(matchParams[0], newParams);
}

const pRegex = /const p = linkedMillerReady \? \{[\s\S]*?\} : millerParams;/;
const newP = `const p = linkedMillerReady ? {
      V_th_min: issueNumber('vthMinV') || millerParams.V_th_min,
      C_gd_pF: issueNumber('cgdPf') || millerParams.C_gd_pF,
      C_iss_pF: millerParams.C_iss_pF,
      R_g_pulldown_ohm: issueNumber('rgOffOhm') || millerParams.R_g_pulldown_ohm,
      L_g_nH: millerParams.L_g_nH,
      dv_dt_V_per_ns: issueNumber('dvdtVns') || millerParams.dv_dt_V_per_ns,
      vbus: millerParams.vbus,
      hasActiveMillerClamp: millerParams.hasActiveMillerClamp,
    } : millerParams;`;
content = content.replace(pRegex, newP);

const checkRegex = /const mRes = checkMillerRisk\(\{[\s\S]*?\}\);/;
const newCheck = `const mRes = checkMillerRisk({
      V_th_min: p.V_th_min,
      C_gd_pF: p.C_gd_pF,
      C_iss_pF: p.C_iss_pF,
      R_g_pulldown_ohm: p.R_g_pulldown_ohm,
      L_g_nH: p.L_g_nH,
      dv_dt_V_per_ns: p.dv_dt_V_per_ns,
      vbus: p.vbus,
      hasActiveMillerClamp: p.hasActiveMillerClamp,
    });`;
content = content.replace(checkRegex, newCheck);

// Add the new fields to the UI form
const uiRegex = /<div className="space-y-4">\s*<div className="grid grid-cols-2 gap-4">\s*(?:<div[\s\S]*?<\/div>\s*)*?<\/div>\s*<label className="flex items-center gap-2 text-sm text-slate-300">/m;
const matchUi = content.match(uiRegex);
if(matchUi) {
  const newUi = `<div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">V_th_min (V)</label>
                <input type="number" className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm" value={millerParams.V_th_min} onChange={e => setMillerParams({...millerParams, V_th_min: Number(e.target.value)})} />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">C_gd (pF)</label>
                <input type="number" className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm" value={millerParams.C_gd_pF} onChange={e => setMillerParams({...millerParams, C_gd_pF: Number(e.target.value)})} />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">C_iss (pF)</label>
                <input type="number" className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm" value={millerParams.C_iss_pF} onChange={e => setMillerParams({...millerParams, C_iss_pF: Number(e.target.value)})} />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">R_g_pulldown (Ω)</label>
                <input type="number" className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm" value={millerParams.R_g_pulldown_ohm} onChange={e => setMillerParams({...millerParams, R_g_pulldown_ohm: Number(e.target.value)})} />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">L_g (nH)</label>
                <input type="number" className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm" value={millerParams.L_g_nH} onChange={e => setMillerParams({...millerParams, L_g_nH: Number(e.target.value)})} />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">dv/dt (V/ns)</label>
                <input type="number" className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm" value={millerParams.dv_dt_V_per_ns} onChange={e => setMillerParams({...millerParams, dv_dt_V_per_ns: Number(e.target.value)})} />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-300">`;
  content = content.replace(matchUi[0], newUi);
}


fs.writeFileSync('src/components/MotorDriveToolbox.tsx', content);
