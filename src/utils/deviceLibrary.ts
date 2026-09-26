/**
 * 本地器件库：存储工程师自建的车规器件参数（带工况标注），供确定性物理引擎按工况插值读取。
 * 自用单机场景，采用 localStorage 持久化，与 scenarioStorage / analysisStorage 保持一致。
 */

export interface DeviceParamPoint {
  x: number;
  y: number | null;
}

export type CandidateDecisionType = 'imported' | 'skipped' | 'mapped_to';

export interface CandidateDecision {
  decision: CandidateDecisionType;
  mappedKey?: string;
  decidedAt: string;
}

export interface DeviceEntry {
  id: string;
  deviceType: string;
  partNumber: string;
  manufacturer: string;
  package: string;
  aecqGrade: string;
  channelType: string;
  /** 完整导入的原始 JSON（保留所有字段与工况，供后续物理引擎读取）。 */
  raw: Record<string, unknown>;
  /** 以 rawPath 为稳定键保存工程师对候选的处理决定。 */
  candidateDecisions: Record<string, CandidateDecision>;
  /** 工程师提出但当前 schema 尚未承载的参数需求，作为本地待办保留。 */
  candidateRequests: Record<string, { label: string; category: string; requestedAt: string }>;
  createdAt: string;
  updatedAt: string;
}

const STORAGE_KEY = 'ecu_copilot_device_library';

export function loadDevices(): DeviceEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    if (Array.isArray(list)) {
      return list.map((device: DeviceEntry) => ({
        ...device,
        candidateDecisions: device && typeof device.candidateDecisions === 'object' && device.candidateDecisions
          ? device.candidateDecisions
          : {},
        candidateRequests: device && typeof device.candidateRequests === 'object' && device.candidateRequests
          ? device.candidateRequests
          : {},
      })) as DeviceEntry[];
    }
  } catch (err) {
    console.error('加载本地器件库失败:', err);
  }
  return [];
}

export function saveDevice(entry: DeviceEntry): DeviceEntry[] {
  const current = loadDevices();
  const idx = current.findIndex((d) => d.id === entry.id);
  const updated: DeviceEntry = { ...entry, updatedAt: new Date().toISOString() };
  const next = idx >= 0 ? current.map((d) => (d.id === entry.id ? updated : d)) : [updated, ...current];
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch (err) {
    console.error('保存器件失败:', err);
  }
  return next;
}

export function deleteDevice(id: string): DeviceEntry[] {
  const next = loadDevices().filter((d) => d.id !== id);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch (err) {
    console.error('删除器件失败:', err);
  }
  return next;
}

/** 从免费 AI 输出的 JSON 文本导入器件；返回解析结果 + 完整性体检警告。 */
export function importDeviceFromJson(jsonText: string): { device?: DeviceEntry; warnings?: string[]; error?: string } {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    return { error: 'JSON 解析失败：' + (err as Error).message };
  }
  if (!parsed || typeof parsed !== 'object') {
    return { error: 'JSON 不是有效对象。' };
  }
  const rawAny = parsed as any;
  const partNumber = String(rawAny.partNumber || '').trim();
  if (!partNumber) {
    return { error: '缺少 partNumber（料号），无法作为器件条目保存。' };
  }
  const device: DeviceEntry = {
    id: 'dev_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    deviceType: String(rawAny.deviceType || 'MOSFET'),
    partNumber,
    manufacturer: String(rawAny.manufacturer || ''),
    package: String(rawAny.package || ''),
    aecqGrade: String(rawAny.aecqGrade || ''),
    channelType: String(rawAny.channelType || ''),
    raw: parsed,
    candidateDecisions: {},
    candidateRequests: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const warnings = validateDeviceCompleteness(device);
  return { device, warnings };
}

export function updateDeviceCandidateDecision(
  deviceId: string,
  rawPath: string,
  decision: CandidateDecisionType,
  mappedKey?: string,
): DeviceEntry[] {
  const devices = loadDevices();
  const device = devices.find((d) => d.id === deviceId);
  if (!device) return devices;

  const candidateDecisions = {
    ...(device.candidateDecisions || {}),
    [rawPath]: {
      decision,
      ...(mappedKey ? { mappedKey } : {}),
      decidedAt: new Date().toISOString(),
    },
  };

  return saveDevice({ ...device, candidateDecisions });
}

export function clearDeviceCandidateDecision(deviceId: string, rawPath: string): DeviceEntry[] {
  const devices = loadDevices();
  const device = devices.find((d) => d.id === deviceId);
  if (!device) return devices;
  const candidateDecisions = { ...(device.candidateDecisions || {}) };
  delete candidateDecisions[rawPath];
  return saveDevice({ ...device, candidateDecisions });
}

export function requestDeviceCandidateParameter(
  deviceId: string,
  rawPath: string,
  label: string,
  category: string,
): DeviceEntry[] {
  const devices = loadDevices();
  const device = devices.find((d) => d.id === deviceId);
  if (!device) return devices;

  const candidateRequests = {
    ...(device.candidateRequests || {}),
    [rawPath]: { label, category, requestedAt: new Date().toISOString() },
  };
  return saveDevice({ ...device, candidateRequests });
}

export function applyCandidateDecisions<T extends {
  rawPath: string;
  targetKey: string | null;
  value: number | string;
  note?: string;
  importable: boolean;
  mappingStatus: 'mapped' | 'unmapped' | 'ambiguous' | 'rejected';
}>(
  candidates: T[],
  decisions: Record<string, CandidateDecision> | undefined,
  currentFieldKeys: ReadonlySet<string>,
): T[] {
  if (!decisions) return candidates;
  return candidates.map((candidate) => {
    const decision = decisions[candidate.rawPath];
    if (!decision) return candidate;

    if (decision.decision === 'skipped') {
      return { ...candidate, importable: false };
    }

    if ((decision.decision === 'mapped_to' || decision.decision === 'imported') && decision.mappedKey) {
      const mapped = currentFieldKeys.has(decision.mappedKey);
      return {
        ...candidate,
        targetKey: decision.mappedKey,
        mappingStatus: mapped ? 'mapped' : 'unmapped',
        // 文本型工程字段（器件型号/供应商/PCN 描述等）的值本来就是字符串；这里只判断"能不能作为值"，
        // 具体"这个字段能不能收这个类型"由唯一写入口 buildDeviceCandidateImportPayload 严格把关。
        importable: mapped && (typeof candidate.value === 'number' || typeof candidate.value === 'string'),
        manuallyDecided: true,
        note: `${candidate.note ? candidate.note + ' ' : ''}工程师已人工映射至 ${decision.mappedKey}。`,
      };
    }

    return candidate;
  });
}

/** 完整性体检：关键曲线参数是否录够了随工况变化的点。 */
export function validateDeviceCompleteness(device: DeviceEntry): string[] {
  const warnings: string[] = [];
  const r = device.raw as any;

  const curvePoints = (obj: any): Array<{ x: number; y: number | null }> =>
    Array.isArray(obj && obj.points) ? obj.points.filter((p: any) => p && p.y !== null && p.y !== undefined && Number.isFinite(Number(p.y))) : [];

  const rdsPoints = curvePoints(r && r.staticParams && r.staticParams.rdsOn);
  const rdsHasHighTemp = rdsPoints.some((p) => Number(p.x) >= 125);
  if (rdsPoints.length < 2) {
    warnings.push('rdsOn 曲线点数不足（<2 个 Tj 点），结温迭代无法插值，会退回保守假设。');
  } else if (!rdsHasHighTemp) {
    warnings.push('rdsOn 缺少 >=125℃ 的点，高温降额/结温上限判定不可靠。');
  }

  const crssPoints = curvePoints(r && r.capacitanceParams && r.capacitanceParams.crss);
  if (crssPoints.length < 2) {
    warnings.push('crss(Cgd) 曲线点数不足（<2 个 Vds 点），米勒位移电流计算不准。');
  }

  const vthPoints = curvePoints(r && r.staticParams && r.staticParams.vth);
  if (vthPoints.length < 2) {
    warnings.push('vth 曲线点数不足（<2 个 Tj 点），米勒直通裕量未计入温漂。');
  }

  if (r && r.maxRatings && r.maxRatings.vds && r.maxRatings.vds.value == null) {
    warnings.push('缺少 Vds 额定耐压，P001/P014 耐压判定将失效。');
  }
  if (r && r.thermalParams && r.thermalParams.rthJc && r.thermalParams.rthJc.value == null) {
    warnings.push('缺少 Rθjc，结温计算会退回假设值。');
  }
  return warnings;
}

export interface DeviceCurvePoint {
  x: number;
  y: number;
}

/** 线性插值：区间内线性，超界截断到端点并标记 extrapolated。 */
export function linearInterp(curve: DeviceCurvePoint[], x: number): { value: number; extrapolated: boolean } {
  const pts = curve
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
    .sort((a, b) => a.x - b.x);
  if (pts.length === 0) return { value: NaN, extrapolated: true };
  if (x <= pts[0].x) return { value: pts[0].y, extrapolated: x < pts[0].x };
  if (x >= pts[pts.length - 1].x) return { value: pts[pts.length - 1].y, extrapolated: x > pts[pts.length - 1].x };
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (x >= a.x && x <= b.x) {
      const t = (x - a.x) / (b.x - a.x);
      return { value: a.y + t * (b.y - a.y), extrapolated: false };
    }
  }
  return { value: NaN, extrapolated: true };
}

/** 从器件原始 JSON 里提取某条曲线（rdsOn@Tj / crss@Vds / vth@Tj）。 */
export function getDeviceCurve(device: DeviceEntry, key: 'rdsOn' | 'crss' | 'vth'): DeviceCurvePoint[] {
  const r = device.raw as any;
  const obj = key === 'rdsOn'
    ? r && r.staticParams && r.staticParams.rdsOn
    : key === 'crss'
      ? r && r.capacitanceParams && r.capacitanceParams.crss
      : r && r.staticParams && r.staticParams.vth;
  if (!obj || !Array.isArray(obj.points)) return [];
  return obj.points
    .filter((p: any) => p && p.x !== null && p.x !== undefined && p.y !== null && p.y !== undefined && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y)))
    .map((p: any) => ({ x: Number(p.x), y: Number(p.y) }));
}



