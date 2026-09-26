import type { DeviceEntry } from './deviceLibrary';
import { getDeviceCurve, linearInterp } from './deviceLibrary';

/**
 * 器件规格里「电容 / 阈值」的取点解析 —— 单一真源。
 *
 * 三个真实缺陷（均由真实器件复核发现，本模块是它们的统一修法）：
 *  1. 电容三者只有 2 个独立量：Crss ≡ Cgd、Ciss = Cgs + Cgd、Coss = Cds + Cgd。
 *     规格书只给 Ciss / Coss / Crss 曲线，所以 Cgd / Cgs 应当派生，而不是各自填一个标量。
 *  2. 这三个电容**随 Vds 强烈变化**（某器件 Crss 从 0.1 V 的 400 pF 掉到 100 V 的 60 pF，6.7 倍），
 *     因此任何相减都必须在**同一个 Vds 点**上做。此前实现用 Ciss@标注点(25 V) − Crss@工况Vbus，混点了。
 *  3. 米勒误导通的最坏情况是 Vth **最低**，即结温**最高**；把 Vth 固定在 25 ℃ 会低估风险。
 *
 * 这些值都来自器件 datasheet（曲线/规格），不是自由文本推断，因此可以进入确定性计算——
 * 但调用方必须如实标注来源（DERIVED/曲线取点），不得当作工程师实测值。
 */

const num = (v: unknown): number | undefined => {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

function rawPath(raw: unknown, path: string): unknown {
  return path.split('.').reduce((acc: any, k) => (acc == null ? undefined : acc[k]), raw);
}

/** 读规格对象的测试条件数字，例如 capacitanceParams.ciss.conditions.vds = "25 V" → 25。 */
export function readSpecConditionNumber(device: DeviceEntry | undefined, path: string, conditionKey: string): number | undefined {
  if (!device) return undefined;
  const cond = (rawPath(device.raw, path) as any)?.conditions?.[conditionKey];
  if (typeof cond === 'number') return Number.isFinite(cond) ? cond : undefined;
  if (typeof cond !== 'string') return undefined;
  const m = cond.match(/-?[0-9]+(?:\.[0-9]+)?/);
  return m ? num(m[0]) : undefined;
}

export type CgdResolution = { value?: number; from: 'CRSS_CURVE' | 'CGD_DIRECT' | 'NONE'; vdsV?: number };

/** Cgd 在指定 Vds 的取值：优先 Crss 曲线在该点插值（Crss ≡ Cgd），否则回落到直接给出的 Cgd。 */
export function resolveCgdPfAtVds(device: DeviceEntry | undefined, vdsV: number | undefined): CgdResolution {
  if (!device) return { from: 'NONE' };
  const curve = getDeviceCurve(device, 'crss');
  if (curve && curve.length >= 2 && vdsV !== undefined && Number.isFinite(vdsV)) {
    const v = linearInterp(curve, vdsV).value;
    if (Number.isFinite(v) && v > 0) return { value: v, from: 'CRSS_CURVE', vdsV };
  }
  const direct = num((rawPath(device.raw, 'capacitanceParams.cgdDirect') as any)?.value);
  if (direct !== undefined && direct > 0) return { value: direct, from: 'CGD_DIRECT' };
  return { from: 'NONE' };
}

export type CgsResolution = { value?: number; from: 'CGS_DIRECT' | 'CISS_MINUS_CRSS' | 'NONE'; vdsV?: number; reason?: string };

/**
 * Cgs：优先规格书直接给出的 Cgs；否则用**同一个 Vds 点**的 Ciss − Crss。
 * 规格未标注 Ciss 的测试 Vds 时返回 NONE —— 宁可没有值，也不跨电压点相减。
 */
export function resolveCgsPf(device: DeviceEntry | undefined): CgsResolution {
  if (!device) return { from: 'NONE' };
  const direct = num((rawPath(device.raw, 'capacitanceParams.cgsDirect') as any)?.value);
  if (direct !== undefined && direct > 0) return { value: direct, from: 'CGS_DIRECT' };
  const ciss = num((rawPath(device.raw, 'capacitanceParams.ciss') as any)?.value);
  if (ciss === undefined) return { from: 'NONE', reason: '器件规格未提供 Ciss' };
  const specVds = readSpecConditionNumber(device, 'capacitanceParams.ciss', 'vds');
  if (specVds === undefined) return { from: 'NONE', reason: 'Ciss 未标注测试 Vds，无法与 Crss 同点相减（禁止跨电压点）' };
  const curve = getDeviceCurve(device, 'crss');
  if (!curve || curve.length < 1) return { from: 'NONE', reason: '缺少 Crss 曲线，无法同点相减' };
  const crssAtSpec = linearInterp(curve, specVds).value;
  if (!Number.isFinite(crssAtSpec)) return { from: 'NONE', reason: 'Crss 曲线在该点无法插值' };
  const value = ciss - crssAtSpec;
  if (!(value > 0)) return { from: 'NONE', reason: 'Ciss − Crss 非正，数据可疑' };
  return { value, from: 'CISS_MINUS_CRSS', vdsV: specVds };
}

/** Vth 在指定结温的取值（vth 曲线插值）。 */
export function resolveVthMinVAtTj(device: DeviceEntry | undefined, tjC: number | undefined): number | undefined {
  if (!device || tjC === undefined || !Number.isFinite(tjC)) return undefined;
  const curve = getDeviceCurve(device, 'vth');
  if (!curve || curve.length < 2) return undefined;
  const v = linearInterp(curve, tjC).value;
  return Number.isFinite(v) ? v : undefined;
}

/** 米勒误导通最坏情况的取点温度（Vth 最低 = 结温最高）：绝对最大结温 → 曲线最高温点。 */
export function worstCaseHotTjC(device: DeviceEntry | undefined, tjMaxC?: number): number | undefined {
  if (tjMaxC !== undefined && Number.isFinite(tjMaxC)) return tjMaxC;
  if (!device) return undefined;
  const specTjMax = num((rawPath(device.raw, 'maxRatings.tjMax') as any)?.value);
  if (specTjMax !== undefined) return specTjMax;
  const curve = getDeviceCurve(device, 'vth');
  if (curve && curve.length) return curve.reduce((m, p) => (p.x > m ? p.x : m), curve[0].x);
  return undefined;
}
