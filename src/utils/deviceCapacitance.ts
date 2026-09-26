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

/** Vbus 未由工程师提供时，Crss 曲线取点所用的假设母线电压（与 BLDC pattern context 的 13.5V 假设一致）。 */
export const ASSUMED_VBUS_FOR_CURVE_V = 13.5;

export type CgdSourceKind = 'MEASURED_INPUT' | 'CRSS_CURVE_AT_VBUS' | 'CGD_DIRECT' | 'QGD_DERIVED' | 'NONE';

export interface EffectiveCgdResolution {
  value?: number;
  from: CgdSourceKind;
  /** 曲线取点用的 Vds（仅 CRSS_CURVE_AT_VBUS 时有意义）。 */
  vdsV?: number;
  /** 取点用的是假设母线电压——调用方必须把这件事如实显示给工程师。 */
  vdsAssumed?: boolean;
  /** 供 Trace / UI 展示的取点说明。 */
  note?: string;
}

/**
 * Cgd 的**唯一**优先级解析。path A（scenarioDerived→P003）与 path B
 * （bldcDeterministicEngine.buildMiller）必须共用本函数，否则同一个器件在两条链路上会算出不同的
 * 米勒电流。此前正是如此：P003 让 Crss 曲线**压过**工程师实测的 Cgd，而确定性引擎完全不看曲线。
 *
 * 优先级：实测/导入 > 器件 Crss 曲线@工况Vbus > 规格直接给出的 Cgd > Qgd 换算（工程近似，须标注）。
 */
export function resolveEffectiveCgdPf(args: {
  /** 工程师结构化输入/导入的实测 Cgd（pF）。 */
  measuredCgdPf?: number;
  device?: DeviceEntry;
  /** 直接给出曲线时可不传 device（P003 只有曲线、没有器件对象）。 */
  crssCurve?: Array<{ x: number; y: number }>;
  /** 曲线取点的工况母线电压（V）。 */
  vdsV?: number;
  /** vdsV 是否为假设值（调用方知道，本函数无法判断）。 */
  vdsAssumed?: boolean;
  /** 无实测、无器件曲线时的换算源（nC）。 */
  qgdNc?: number;
  /** Qgd→Cgd 换算假定的电压摆幅（V），默认 12。 */
  qgdSwingV?: number;
}): EffectiveCgdResolution {
  const measured = args.measuredCgdPf;
  if (measured !== undefined && Number.isFinite(measured) && measured > 0) {
    return { value: measured, from: 'MEASURED_INPUT', note: '工程师结构化输入/导入实测，不被器件曲线覆盖' };
  }
  const curve = args.crssCurve ?? (args.device ? getDeviceCurve(args.device, 'crss') : undefined);
  const vdsV = args.vdsV !== undefined && Number.isFinite(args.vdsV) ? args.vdsV : undefined;
  if (curve && curve.length >= 2 && vdsV !== undefined) {
    const v = linearInterp(curve, vdsV).value;
    if (Number.isFinite(v) && v > 0) {
      return {
        value: v,
        from: 'CRSS_CURVE_AT_VBUS',
        vdsV,
        vdsAssumed: args.vdsAssumed,
        note: `按器件 Crss 曲线在 Vds=${vdsV}V 插值（Crss ≡ Cgd）${args.vdsAssumed ? '，⚠ 母线电压未提供，该取点为假设值' : ''}`,
      };
    }
  }
  const direct = args.device ? num((rawPath(args.device.raw, 'capacitanceParams.cgdDirect') as any)?.value) : undefined;
  if (direct !== undefined && direct > 0) {
    return { value: direct, from: 'CGD_DIRECT', note: '器件规格直接给出的 Cgd（非曲线取点）' };
  }
  const qgdNc = args.qgdNc;
  if (qgdNc !== undefined && Number.isFinite(qgdNc) && qgdNc > 0) {
    const swing = args.qgdSwingV ?? 12;
    return { value: (qgdNc * 1000) / swing, from: 'QGD_DERIVED', note: `由 Qgd=${qgdNc}nC 按假定摆幅 ${swing}V 换算（工程近似，非实测）` };
  }
  return { from: 'NONE', note: '未提供 Cgd、器件无 Crss 曲线、也无 Qgd 可用' };
}

export type VthSourceKind = 'PROVIDED' | 'CURVE_AT_HOT_TJ' | 'MIN_OF_PROVIDED_AND_CURVE' | 'NONE';

export interface WorstCaseVthResolution {
  value?: number;
  from: VthSourceKind;
  /** 曲线取点用的结温（最坏情况 = 结温最高）。 */
  tjC?: number;
  note?: string;
}

/**
 * 米勒误导通判据用的 Vth_min。**最坏情况是 Vth 最低，即结温最高**：把 Vth 固定在 25℃ 会算出更大的
 * 安全裕量，等于低估风险。取「工程师标量 / 上游高温恶化值」与「器件 vth 曲线在最坏高温点」的较小者。
 * path A（P003）与 path B（buildMiller）必须共用本函数，否则同一个器件在两条链路上会得到不同的判据阈值。
 */
export function resolveWorstCaseVthMinV(args: {
  /** 工程师给出的标量或上游（热级联）恶化后的 Vth（V）。 */
  providedVthMinV?: number;
  device?: DeviceEntry;
  /** 直接给出曲线时可不传 device（P003 只有曲线）。 */
  vthCurve?: Array<{ x: number; y: number }>;
  /** 器件绝对最大结温（℃）。缺省时退回器件规格 maxRatings.tjMax / vth 曲线最高温点。 */
  tjMaxC?: number;
}): WorstCaseVthResolution {
  const curve = args.vthCurve ?? (args.device ? getDeviceCurve(args.device, 'vth') : undefined);
  const specTj = args.tjMaxC !== undefined && Number.isFinite(args.tjMaxC) ? args.tjMaxC : undefined;
  const deviceTj = args.device ? worstCaseHotTjC(args.device) : undefined;
  const curveTj = curve && curve.length ? curve.reduce((m, p) => (p.x > m ? p.x : m), curve[0].x) : undefined;
  const hotTj = specTj ?? deviceTj ?? curveTj;

  const curveVthRaw = curve && curve.length >= 2 && hotTj !== undefined ? linearInterp(curve, hotTj).value : undefined;
  const curveVth = curveVthRaw !== undefined && Number.isFinite(curveVthRaw) && curveVthRaw > 0 ? curveVthRaw : undefined;
  const provided = args.providedVthMinV !== undefined && Number.isFinite(args.providedVthMinV) && args.providedVthMinV > 0
    ? args.providedVthMinV
    : undefined;

  if (provided === undefined && curveVth === undefined) {
    return { from: 'NONE', tjC: hotTj, note: '未提供 Vth，也无可用 vth 曲线' };
  }
  const value = Math.min(...[provided, curveVth].filter((v): v is number => v !== undefined));
  const from: VthSourceKind = provided !== undefined && curveVth !== undefined
    ? 'MIN_OF_PROVIDED_AND_CURVE'
    : curveVth !== undefined
      ? 'CURVE_AT_HOT_TJ'
      : 'PROVIDED';
  const note = curveVth !== undefined
    ? `Vth 取最坏情况高温点 @${hotTj ?? '?'}℃ 的曲线值 ${curveVth}V${provided !== undefined ? `，与给出值 ${provided}V 取较小者` : ''}（Vth 越低越危险）`
    : '使用工程师给出的 Vth 标量（器件无 vth 曲线，未计入温漂）';
  return { value, from, tjC: hotTj, note };
}
