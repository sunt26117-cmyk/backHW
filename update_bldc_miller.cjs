const fs = require('fs');

let content = fs.readFileSync('src/utils/bldcDeterministicEngine.ts', 'utf-8');

const regex = /const inputs = \['dvdtVns', 'cgdPf', 'rgOffOhm', 'vthMinV'\];/;
const newInputs = "const inputs = ['dvdtVns', 'cgdPf', 'cissPf', 'rgOffOhm', 'lsNh', 'vthMinV'];";

content = content.replace(regex, newInputs);

const valuesRegex = /const values: Record<string, number \| undefined> = \{[\s\S]*?\};/;
const newValues = `const values: Record<string, number | undefined> = {
    dvdtVns: state.powerStage.dvdtVns,
    cgdPf: state.powerStage.cgdPf?.value || (state.powerStage.qgdNc ? state.powerStage.qgdNc * 1000 / 12 : undefined),
    cissPf: state.powerStage.cissPf?.value || (state.powerStage.qgNc ? state.powerStage.qgNc * 1000 / 12 : undefined),
    rgOffOhm: state.powerStage.rgOffOhm?.value,
    lsNh: state.powerStage.lsNh?.value || 5, // default 5nH
    vthMinV: state.powerStage.vthMinV,
  };`;

content = content.replace(valuesRegex, newValues);

const millerCallRegex = /const miller = checkMillerRisk\(\{[\s\S]*?\}\);/;
const newMillerCall = `const miller = checkMillerRisk({
    V_th_min: values.vthMinV!,
    C_gd_pF: values.cgdPf!,
    C_iss_pF: values.cissPf!,
    R_g_pulldown_ohm: values.rgOffOhm!,
    L_g_nH: values.lsNh!,
    dv_dt_V_per_ns: values.dvdtVns!,
    vbus: state.electrical.vbusNominal || 12,
  });`;

content = content.replace(millerCallRegex, newMillerCall);

content = content.replace(
  "formula: 'Vgs_induced ≈ Cgd·dv/dt·Rg',",
  "formula: '二阶 RK4 微分: Cgs·dv/dt + i_R = Cgd·dv/dt, Lg·di_R/dt + Rg·i_R = v',"
);

fs.writeFileSync('src/utils/bldcDeterministicEngine.ts', content);
