import type { DeviceEntry } from './deviceLibrary';
import { getDeviceCurve, linearInterp } from './deviceLibrary';
import { MOSFET_FIELD_TABLE } from './mosfetFieldTable';

/**
 * 替代料（一供 / 二供）对比字段的一键填入 —— 从器件库读，不再逐项手抄。
 *
 * 背景（工程师原话）：「另一张 component 中，不和规格书提取的参数关联，还要自己填写吗?」
 * 这张表里的 8 个一供/二供字段（Rds(on)/Qg/Qrr/Rth(j-c) 各两个）直接决定
 * safetyReliabilityEngine 的 delta% 等价性结论 —— 抄错一个数字就会得出错误的「等价」判定。
 *
 * 映射关系**不在这里重新写一遍**：rawPath 一律从 MOSFET_FIELD_TABLE（器件字段的唯一真源）查，
 * 避免出现第三份 rawPath 副本（历史上正是多份副本导致同名字段各读各的）。
 *
 * 仍然必须由工程师实测、器件规格给不了的字段：见 MEASURED_ONLY_COMPONENT_FIELDS。
 */

export type SupplyPairQuantity = 'RdsOnMilliOhm' | 'QgNc' | 'QrrNc' | 'RthJcCPerW';

const TARGET_KEY_BY_QUANTITY: Record<SupplyPairQuantity, string> = {
  RdsOnMilliOhm: 'rdsOnMilliOhm',
  QgNc: 'gateChargeQgNc',
  QrrNc: 'qrrNc',
  RthJcCPerW: 'rthJcCPerW',
};

const QUANTITY_LABEL: Record<SupplyPairQuantity, string> = {
  RdsOnMilliOhm: 'Rds(on)',
  QgNc: 'Qg',
  QrrNc: 'Qrr',
  RthJcCPerW: 'Rth(j-c)',
};

export const SUPPLY_PAIR_QUANTITIES: SupplyPairQuantity[] = ['RdsOnMilliOhm', 'QgNc', 'QrrNc', 'RthJcCPerW'];

/** COMPONENT 页里真正属于「当前器件」的字段（可从规格书继承）。 */
const DUT_FIELDS: Array<{ key: string; targetKey: string }> = [
  { key: 'rdsOnMilliOhm', targetKey: 'rdsOnMilliOhm' },
  { key: 'qgNc', targetKey: 'gateChargeQgNc' },
  { key: 'qgdNc', targetKey: 'qgdNc' },
  { key: 'vdsRatingV', targetKey: 'vdsRatingV' },
  // VGS(th) 最小值与最大值都要带出来：datasheet 给 min/typ/max，只带最小值无法判断
  // "给定 Gate 驱动电压能否可靠开通"。
  { key: 'vthMinV', targetKey: 'vthMinV' },
  { key: 'vthMaxV', targetKey: 'vthMaxV' },
];

/** COMPONENT 页里必须实测、规格书给不了的字段（如实提示，绝不凭空填）。 */
export const MEASURED_ONLY_COMPONENT_FIELDS = ['switchDelayNs', 'junctionTempC', 'soaMarginPct'] as const;

export function rawPathForTargetKey(targetKey: string): string | undefined {
  return MOSFET_FIELD_TABLE.find((field) => field.targetKey === targetKey)?.rawPath;
}

function readRaw(raw: unknown, path: string): unknown {
  return path.split('.').reduce((acc: any, key) => (acc == null ? undefined : acc[key]), raw);
}

export interface DeviceScalarRead {
  value?: number;
  from: 'SCALAR' | 'CURVE_AT_TJ' | 'NONE';
  note?: string;
}

/**
 * 读器件规格单值。Rds(on) 随结温变化剧烈：规格只给曲线时取指定 Tj 的曲线点，并在 note 里写明取点，
 * 绝不静默地把曲线当成标量用（否则一供/二供可能用了不同温点而对比结果没有意义）。
 */
export function readDeviceScalarAtTj(
  device: DeviceEntry | undefined,
  targetKey: string,
  curveTjC = 125,
): DeviceScalarRead {
  if (!device) return { from: 'NONE', note: '未选择器件' };
  const path = rawPathForTargetKey(targetKey);
  if (!path) return { from: 'NONE', note: `字段表里没有 ${targetKey} 的映射` };
  const scalar = readRaw(device.raw, path) as any;
  const value = Number(scalar?.value);
  if (scalar?.value !== null && scalar?.value !== undefined && Number.isFinite(value)) {
    return { value, from: 'SCALAR', note: `${path}.value（规格标量）` };
  }
  // VGS(th) 最大值：优先独立字段（上面的标量分支已覆盖 staticParams.vthMax.value），
  // 否则从 staticParams.vth.variants 里的 MAX 恢复（datasheet 普遍给 min/typ/max）。
  if (targetKey === 'vthMaxV') {
    const variants = (readRaw(device.raw, 'staticParams.vth') as any)?.variants;
    const maxima = Array.isArray(variants)
      ? variants.map((v: any) => Number(v?.value)).filter((n: number) => Number.isFinite(n))
      : [];
    if (maxima.length) return { value: Math.max(...maxima), from: 'SCALAR', note: 'staticParams.vth.variants 中的 MAX（datasheet min/typ/max）' };
    return { from: 'NONE', note: '规格未给出 VGS(th) 最大值（既无 staticParams.vthMax.value，也无 variants MAX）' };
  }
  // 曲线回落：**单点也算**。真实器件常只给一个 TYP/MIN 点（如 BUK9M6R0-40H 的
  // staticParams.rdsOn = { points:[{x:25,y:4.9}] }），那一点就是规格标称值；
  // 此前要求「>=2 点才认」，直接把这种器件判成"未提供 Rds(on)"。
  const curveKey: 'rdsOn' | 'vth' | undefined = targetKey === 'rdsOnMilliOhm' ? 'rdsOn' : targetKey === 'vthMinV' ? 'vth' : undefined;
  if (curveKey) {
    const curve = getDeviceCurve(device, curveKey);
    const usable = (curve || []).filter((p) => Number.isFinite(Number(p?.y)) && Number(p?.y) > 0);
    if (usable.length === 1) {
      return { value: Number(usable[0].y), from: 'SCALAR', note: `${curveKey === 'rdsOn' ? 'Rds(on)' : 'Vth'} 曲线上唯一的数据点 @${usable[0].x}（规格只给一个点，未做温漂外推）` };
    }
    if (usable.length >= 2) {
      const interpolated = linearInterp(usable as Array<{ x: number; y: number }>, curveTjC).value;
      if (Number.isFinite(interpolated) && interpolated > 0) {
        return { value: interpolated, from: 'CURVE_AT_TJ', note: `${curveKey === 'rdsOn' ? 'Rds(on)' : 'Vth'} 曲线 @${curveTjC}℃ 取点（规格未给标量）` };
      }
    }
  }
  return { from: 'NONE', note: `${path} 没有可用数值` };
}

export interface SupplyPairFill {
  /** key -> 值（数值字段为数字；器件型号/供应商等文本字段为字符串），可直接写入 issue.measuredValues。 */
  values: Record<string, number | string>;
  sources: Record<string, string>;
  notes: Record<string, string>;
  /** 器件库确实给不出来的项（人话列表，用于提示而不是编一个数填上）。 */
  missing: string[];
}

export function buildSupplyPairFill(
  primary?: DeviceEntry,
  secondary?: DeviceEntry,
  curveTjC = 125,
): SupplyPairFill {
  const values: Record<string, number | string> = {};
  const sources: Record<string, string> = {};
  const notes: Record<string, string> = {};
  const missing: string[] = [];

  for (const quantity of SUPPLY_PAIR_QUANTITIES) {
    const targetKey = TARGET_KEY_BY_QUANTITY[quantity];
    const sides: Array<['primary' | 'secondary', DeviceEntry | undefined, string]> = [
      ['primary', primary, '一供'],
      ['secondary', secondary, '二供'],
    ];
    for (const [prefix, device, sideLabel] of sides) {
      const key = prefix + quantity;
      if (!device) {
        missing.push(`${sideLabel}未选择器件 → ${QUANTITY_LABEL[quantity]}`);
        continue;
      }
      const read = readDeviceScalarAtTj(device, targetKey, curveTjC);
      if (read.value === undefined) {
        missing.push(`${device.partNumber || device.id} 未提供 ${QUANTITY_LABEL[quantity]}`);
        continue;
      }
      values[key] = read.value;
      sources[key] = 'DATASHEET';
      if (read.note) notes[key] = read.note;
    }
  }

  for (const { key, targetKey } of DUT_FIELDS) {
    const read = readDeviceScalarAtTj(primary, targetKey, curveTjC);
    if (read.value === undefined) {
      if (primary) missing.push(`当前器件未提供 ${key}`);
      continue;
    }
    values[key] = read.value;
    sources[key] = 'DATASHEET';
    if (read.note) notes[key] = read.note;
  }

  // 文本字段：器件型号 = PCN/替代评估的**目标器件**（有二供取二供，否则取一供）；
  // 供应商取同一颗的制造商。此前这两格在界面上永远是空的——它们压根不在填入清单里，
  // 而器件库里明明就有 partNumber / manufacturer。
  const textSource = secondary ?? primary;
  if (textSource) {
    const sideLabel = secondary ? '二供/替代目标器件' : '一供器件';
    if (textSource.partNumber) {
      values.componentPartNumber = textSource.partNumber;
      sources.componentPartNumber = 'DATASHEET';
      notes.componentPartNumber = `${sideLabel}型号（${textSource.manufacturer || '制造商未记录'}）`;
    }
    if (textSource.manufacturer) {
      values.supplierName = textSource.manufacturer;
      sources.supplierName = 'DATASHEET';
      notes.supplierName = `${sideLabel}制造商`;
    }
  }

  return { values, sources, notes, missing };
}
