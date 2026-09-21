/**
 * 本地器件库：存储工程师自建的车规器件参数（带工况标注），供确定性物理引擎按工况插值读取。
 * 自用单机场景，采用 localStorage 持久化，与 scenarioStorage / analysisStorage 保持一致。
 */

export interface DeviceParamPoint {
  x: number;
  y: number | null;
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
  createdAt: string;
  updatedAt: string;
}

const STORAGE_KEY = 'ecu_copilot_device_library';

export function loadDevices(): DeviceEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    if (Array.isArray(list)) return list as DeviceEntry[];
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
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const warnings = validateDeviceCompleteness(device);
  return { device, warnings };
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

