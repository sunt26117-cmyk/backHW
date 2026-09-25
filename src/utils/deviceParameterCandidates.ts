import type { DeviceEntry } from './deviceLibrary';

export type CandidateSourceType = 'DATASHEET_DIRECT' | 'DATASHEET_GRAPH_ESTIMATE' | 'DERIVED';
export type CandidateValueType = 'TYP' | 'MIN' | 'MAX' | 'NOMINAL' | 'ESTIMATE';

export interface DeviceParameterCandidate {
  id: string;
  targetKey: string;
  label: string;
  unit?: string;
  value: number | string;
  sourceType: CandidateSourceType;
  valueType: CandidateValueType;
  confidence: number;
  sourceRef?: string;
  conditions?: Record<string, unknown>;
  evidence?: string;
  note?: string;
  importable: boolean;
}

const finiteNumber = (v: unknown): number | undefined => {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

const asSourceType = (v: unknown, fallback: CandidateSourceType): CandidateSourceType =>
  v === 'DATASHEET_DIRECT' || v === 'DATASHEET_GRAPH_ESTIMATE' || v === 'DERIVED' ? v : fallback;

const asValueType = (v: unknown, fallback: CandidateValueType): CandidateValueType => {
  const normalized = String(v ?? '').toUpperCase();
  return normalized === 'TYP' || normalized === 'MIN' || normalized === 'MAX' || normalized === 'NOMINAL' || normalized === 'ESTIMATE' ? normalized as CandidateValueType : fallback;
};

function candidate(
  device: DeviceEntry,
  targetKey: string,
  label: string,
  value: unknown,
  unit: string | undefined,
  sourceType: CandidateSourceType,
  valueType: CandidateValueType,
  sourceRef?: string,
  conditions?: Record<string, unknown>,
  evidence?: string,
  confidence = 0.95,
  note?: string,
): DeviceParameterCandidate | null {
  if (value === null || value === undefined || value === '') return null;
  const numeric = typeof value === 'number' ? value : finiteNumber(value);
  if (numeric === undefined) return null;
  const safeConfidence = sourceType === 'DATASHEET_GRAPH_ESTIMATE' ? Math.min(confidence, 0.85) : confidence;
  return {
    id: `${device.id}:${targetKey}:${sourceRef || 'value'}:${numeric}`,
    targetKey,
    label,
    unit,
    value: numeric,
    sourceType,
    valueType,
    confidence: safeConfidence,
    sourceRef,
    conditions,
    evidence,
    note,
    importable: true,
  };
}

function rawPath(raw: any, path: string): unknown {
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), raw);
}

function scalar(obj: any): { value?: number; stat?: CandidateValueType; sourceType?: CandidateSourceType; source?: string; conditions?: Record<string, unknown> } {
  if (!obj || typeof obj !== 'object') return {};
  const v = finiteNumber(obj.value);
  const stat = asValueType(obj.stat, 'TYP');
  const sourceType = asSourceType(obj.sourceType, 'DATASHEET_DIRECT');
  return { value: v, stat, sourceType, source: typeof obj.source === 'string' ? obj.source : undefined, conditions: obj.conditions && typeof obj.conditions === 'object' ? obj.conditions : undefined };
}

export function buildDeviceParameterCandidates(device: DeviceEntry): DeviceParameterCandidate[] {
  const r = device.raw as any;
  const out: DeviceParameterCandidate[] = [];
  const push = (c: DeviceParameterCandidate | null) => { if (c) out.push(c); };

  const vds = scalar(rawPath(r, 'maxRatings.vds'));
  push(candidate(device, 'vdsRatingV', 'Vds 额定耐压', vds.value, 'V', vds.sourceType || 'DATASHEET_DIRECT', vds.stat || 'MAX', vds.source, vds.conditions, 'MaxRatings.VDS', 0.98));

  const eas = scalar(rawPath(r, 'maxRatings.easPulse'));
  push(candidate(device, 'easEnergyMj', '单脉冲雪崩能量 EAS', eas.value, 'mJ', eas.sourceType || 'DATASHEET_DIRECT', eas.stat || 'MAX', eas.source, eas.conditions, 'MaxRatings.EAS', 0.96));

  const rdsObj = rawPath(r, 'staticParams.rdsOn') as any;
  const rdsPoints = Array.isArray(rdsObj?.points) ? rdsObj.points : [];
  const rds25 = rdsPoints.find((p: any) => Number(p?.x) === 25) || rdsPoints[0];
  push(candidate(
    device,
    'rdsOnMilliOhm',
    'Rds(on)（曲线选点）',
    rds25?.y,
    'mΩ',
    asSourceType(rdsObj?.sourceType, 'DATASHEET_GRAPH_ESTIMATE'),
    asValueType(rdsObj?.stat, 'TYP'),
    rdsObj?.source,
    { ...(rdsObj?.conditions || {}), tj: rds25?.x },
    'Rds(on) vs Tj 曲线选点',
    0.82,
    '项目单值字段不能代表整条 Rds(on)-Tj 曲线；完整曲线继续保留在器件库。',
  ));

  const vthObj = rawPath(r, 'staticParams.vth') as any;
  const vthPoints = Array.isArray(vthObj?.points) ? vthObj.points : [];
  const vthPoint = vthPoints[0];
  push(candidate(
    device,
    'vthMinV',
    'Vgs 阈值 Vth（曲线选点）',
    vthPoint?.y,
    'V',
    asSourceType(vthObj?.sourceType, 'DATASHEET_GRAPH_ESTIMATE'),
    asValueType(vthObj?.stat, 'MIN'),
    vthObj?.source,
    { ...(vthObj?.conditions || {}), tj: vthPoint?.x },
    'Vth vs Tj 曲线选点',
    0.82,
    '只有规格书明确给出 min Vth 时才可作为最小阈值使用；曲线估读不得冒充保证值。',
  ));

  const cgdDirect = scalar(rawPath(r, 'capacitanceParams.cgdDirect'));
  if (cgdDirect.value !== undefined) {
    push(candidate(device, 'cgdPf', '直接给出的 Cgd', cgdDirect.value, 'pF', cgdDirect.sourceType || 'DATASHEET_DIRECT', cgdDirect.stat || 'TYP', cgdDirect.source, cgdDirect.conditions, 'Capacitance Cgd', 0.95));
  } else {
    const crssObj = rawPath(r, 'capacitanceParams.crss') as any;
    const crssPoints = Array.isArray(crssObj?.points) ? crssObj.points : [];
    const crss25 = crssPoints.find((p: any) => Number(p?.x) === 25) || crssPoints[0];
    if (crss25?.y !== undefined) {
      push(candidate(
        device,
        'cgdPf',
        'Cgd 候选（由 Crss 近似）',
        crss25.y,
        'pF',
        'DERIVED',
        'ESTIMATE',
        crssObj?.source,
        { ...(crssObj?.conditions || {}), vds: crss25?.x },
        'Crss 曲线选点 → Cgd 工程近似候选',
        0.72,
        '这是工程近似，不是 datasheet 直接 Cgd。优先使用规格书明确给出的 Cgd；必须由工程师确认后再进入工程输入。',
      ));
    }
  }

  // Cgs≈Ciss-Crss 只能作为低置信度派生候选，不能当成 datasheet 直接值。
  const ciss = scalar(rawPath(r, 'capacitanceParams.ciss'));
  const crssObj = rawPath(r, 'capacitanceParams.crss') as any;
  const crssPoints = Array.isArray(crssObj?.points) ? crssObj.points : [];
  const crss25 = crssPoints.find((p: any) => Number(p?.x) === 25) || crssPoints[0];
  const crssVal = finiteNumber(crss25?.y);
  if (ciss.value !== undefined && crssVal !== undefined && ciss.value > crssVal) {
    push(candidate(device, 'cgsPf', 'Cgs（Ciss - Crss 派生）', ciss.value - crssVal, 'pF', 'DERIVED', 'ESTIMATE', ciss.source || crssObj?.source, { ...(ciss.conditions || {}), vds: crss25?.x }, 'Ciss - Crss 派生候选', 0.70, '仅作为工程近似候选，不是 datasheet 直接 Cgs。'));
  }

  const qg = scalar(rawPath(r, 'gateCharge.qg'));
  push(candidate(device, 'gateChargeQgNc', '总栅电荷 Qg', qg.value, 'nC', qg.sourceType || 'DATASHEET_DIRECT', qg.stat || 'TYP', qg.source, qg.conditions, 'Gate charge Qg', 0.96));

  const tdOff = scalar(rawPath(r, 'switchingParams.tdOff'));
  const tf = scalar(rawPath(r, 'switchingParams.tf'));
  push(candidate(device, 'turnOffDelayNs', '关断延迟 td(off)', tdOff.value, 'ns', tdOff.sourceType || 'DATASHEET_DIRECT', tdOff.stat || 'TYP', tdOff.source, tdOff.conditions, 'Switching characteristics', 0.92));
  push(candidate(device, 'fallTimeNs', '下降时间 tf', tf.value, 'ns', tf.sourceType || 'DATASHEET_DIRECT', tf.stat || 'TYP', tf.source, tf.conditions, 'Switching characteristics', 0.92));

  const rthJa = scalar(rawPath(r, 'thermalParams.rthJa'));
  push(candidate(device, 'rthCaOrJa', 'RθJA', rthJa.value, '℃/W', rthJa.sourceType || 'DATASHEET_DIRECT', rthJa.stat || 'TYP', rthJa.source, rthJa.conditions, 'Thermal resistance junction-to-ambient', 0.80, 'RθJA 强依赖 PCB/铜箔/散热条件；不能直接当成任意 ECU 装配状态下的真实热阻。'));

  const vf = scalar(rawPath(r, 'bodyDiode.vf'));
  const qrr = scalar(rawPath(r, 'bodyDiode.qrr'));
  push(candidate(device, 'diodeForwardVoltageV', '体二极管 Vf', vf.value, 'V', vf.sourceType || 'DATASHEET_DIRECT', vf.stat || 'TYP', vf.source, vf.conditions, 'Body diode forward voltage', 0.95));
  push(candidate(device, 'qrrNc', '反向恢复电荷 Qrr', qrr.value, 'nC', qrr.sourceType || 'DATASHEET_DIRECT', qrr.stat || 'TYP', qrr.source, qrr.conditions, 'Body diode reverse recovery charge', 0.95));

  return out;
}

export function getCandidateSummary(candidates: DeviceParameterCandidate[]): { total: number; highConfidence: number; importable: number } {
  return {
    total: candidates.length,
    highConfidence: candidates.filter(c => c.confidence >= 0.9).length,
    importable: candidates.filter(c => c.importable).length,
  };
}
