/**
 * 示波器 CSV 导入：解析时序波形（时间 + 电压通道），计算峰值/谷值/dv/dt/振铃频率。
 * 宽容解析：自动识别分隔符、跳过元数据注释行、定位数据起始行，适配 Tektronix/Rigol/Keysight 等常见导出格式。
 */

import { MeasurementProvenance } from '../types';

export interface WaveformChannel {
  name: string;
  samples: number[];
}

export interface ParsedScope {
  time: number[];
  channels: WaveformChannel[];
  sampleRateHz: number;
  rowCount: number;
}

export interface EdgeInfo {
  direction: 'rise' | 'fall';
  startIdx: number;
  endIdx: number;
  /** 20% / 80% 电平穿越时刻（线性插值，秒）与对应电压 */
  t20: number;
  t80: number;
  v20: number;
  v80: number;
  lowV: number;
  highV: number;
  /** 20%→80% 之间的采样间隔数；过少说明示波器采样率不足，dv/dt 会被低估 */
  samplesIn2080: number;
}

export interface RingingInfo {
  /** 参与周期估算的振铃峰值（采样点下标） */
  peakIdx: number[];
  settleLevel: number;
  amplitudeV: number;
}

export interface WaveformMetrics {
  peak: number;
  valley: number;
  peakToPeak: number;
  /** dv/dt (V/ns)。优先用 20%–80% 边沿法；边沿检测失败时回退为相邻点最大斜率（见 dvDtMethod）。 */
  dvDtMaxVns: number;
  /** 振铃频率 (Hz)：取主边沿过冲之后相邻振铃峰的间隔；不足 2 个峰时为 null，不再对整段波形数过零点。 */
  ringingHz: number | null;
  // ---- 以下为新增（均可选，旧调用方不受影响）----
  /** 前 10% 样本（触发前基线）的中位数：用作“标称电压”，而不是波形谷值。 */
  baselineLevel?: number;
  baselineStable?: boolean;
  /** 旧算法（相邻两点最大斜率）的结果，仅供对照。噪声与采样率敏感，通常偏大。 */
  dvDtRawMaxVns?: number;
  dvDtMethod?: 'EDGE_20_80' | 'RAW_SLOPE';
  peakIdx?: number;
  valleyIdx?: number;
  edge?: EdgeInfo;
  ringing?: RingingInfo;
  /** 指标可信度提示（采样点不足、基线不稳等），UI 必须展示。 */
  warnings?: string[];
}

export type ParseResult = { ok: boolean; data?: ParsedScope; error?: string };

const isNumeric = (v: unknown): boolean => {
  if (typeof v === 'number') return Number.isFinite(v);
  if (typeof v !== 'string') return false;
  const t = v.trim();
  if (t === '') return false;
  const n = Number(t);
  return Number.isFinite(n);
};

function detectDelimiter(line: string): string {
  const candidates = [',', ';', '\t', ' '];
  let best = ',';
  let bestCount = -1;
  for (const d of candidates) {
    const c = line.split(d).length - 1;
    if (c > bestCount) { best = d; bestCount = c; }
  }
  return best;
}

export function parseScopeCsv(text: string): ParseResult {
  if (!text || !text.trim()) return { ok: false, error: '文件为空。' };
  const lines = text.replace(/\r/g, '').split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length < 2) return { ok: false, error: '行数不足，不是有效的示波器 CSV。' };

  // 找一个「数据密度最高」的行来判定分隔符
  const delimLine = lines.slice(0, Math.min(50, lines.length)).sort((a, b) => (b.split(',').length - a.split(',').length))[0] || lines[0];
  const delim = detectDelimiter(delimLine);
  const split = (l: string) => l.split(delim).map((c) => c.trim());

  // 定位数据起始行：整行（除第一列可能是时间）都是数字
  let headerNames: string[] = [];
  let dataStart = -1;
  for (let i = 0; i < lines.length; i++) {
    const cells = split(lines[i]);
    if (cells.length < 2) continue;
    const numericCount = cells.filter(isNumeric).length;
    if (numericCount >= cells.length - 1) {
      // 该行基本全是数字 → 数据行
      if (dataStart === -1) dataStart = i;
      break;
    }
    // 该行含大量非数字 → 可能是表头/通道名行
    if (cells.every((c) => c !== '')) {
      headerNames = cells;
    }
  }
  if (dataStart === -1) return { ok: false, error: '未找到数值数据行，请确认 CSV 里包含时间与电压列。' };

  // 收集数据行
  const rows: number[][] = [];
  for (let i = dataStart; i < lines.length; i++) {
    const cells = split(lines[i]);
    if (cells.length < 2) continue;
    const nums = cells.map(Number);
    if (nums.every((n) => Number.isFinite(n))) {
      rows.push(nums);
    } else if (rows.length > 0) {
      break; // 遇到非数字行且已有数据 → 数据结束
    }
  }
  if (rows.length < 2) return { ok: false, error: '有效数据行不足 2 行。' };

  const colCount = rows[0].length;
  const time = rows.map((r) => r[0]);
  const channels: WaveformChannel[] = [];
  for (let c = 1; c < colCount; c++) {
    const samples = rows.map((r) => r[c]);
    channels.push({ name: headerNames[c] || ('CH' + c), samples });
  }
  const dt = (time[time.length - 1] - time[0]) / Math.max(1, time.length - 1);
  const sampleRateHz = dt > 0 ? Math.round(1 / dt) : 0;
  return { ok: true, data: { time, channels, sampleRateHz, rowCount: rows.length } };
}

const median = (arr: number[]): number => {
  if (arr.length === 0) return 0;
  const a = [...arr].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

/** 在 [startIdx, endIdx] 内找 20%/80% 电平的穿越时刻（线性插值）。 */
function crossingTime(time: number[], v: number[], level: number, from: number, to: number): number | null {
  for (let i = from; i < to; i++) {
    const a = v[i] - level;
    const b = v[i + 1] - level;
    if ((a <= 0 && b >= 0) || (a >= 0 && b <= 0)) {
      if (v[i + 1] === v[i]) return time[i];
      return time[i] + ((level - v[i]) / (v[i + 1] - v[i])) * (time[i + 1] - time[i]);
    }
  }
  return null;
}

/**
 * 找最陡的一段边沿并按 20%–80% 法计算 dv/dt。
 * 以“单调边沿段的首尾”作为 0%/100% 参考；若边沿后有过冲，参考高点会略高于稳态，
 * 因此 80% 点会略偏高——这仍落在边沿最陡处，对 dv/dt 的影响远小于相邻点法。
 */
function detectEdge(time: number[], v: number[], p2p: number): { edge: EdgeInfo; dvDtVns: number } | null {
  const n = v.length;
  if (n < 5 || !(p2p > 0)) return null;
  const w = 2;
  let best = -1;
  let bestSlope = 0;
  for (let i = 0; i + w < n; i++) {
    const dt = time[i + w] - time[i];
    if (!(dt > 0)) continue;
    const sl = (v[i + w] - v[i]) / dt;
    if (Math.abs(sl) > Math.abs(bestSlope)) { bestSlope = sl; best = i; }
  }
  if (best < 0 || bestSlope === 0) return null;
  const dir = bestSlope > 0 ? 1 : -1;
  const d = (i: number) => v[i] - v[i - 1]; // d(i)：第 i-1 → i 个样本的差分
  let D = 0;
  for (let j = best + 1; j <= best + w; j++) D = Math.max(D, dir * d(j));
  if (!(D > 0)) return null;
  const c = best + 1;
  let sIdx = c;
  while (sIdx - 1 >= 1 && dir * d(sIdx - 1) > 0.1 * D) sIdx--;
  let eIdx = c;
  while (eIdx + 1 <= n - 1 && dir * d(eIdx + 1) > 0.1 * D) eIdx++;
  const startIdx = sIdx - 1;
  const endIdx = eIdx;
  const lowV = v[startIdx];
  const highV = v[endIdx];
  const dV = highV - lowV;
  if (Math.abs(dV) < 0.25 * p2p) return null; // 最陡的一段只是小毛刺，不是主边沿
  const v20 = lowV + 0.2 * dV;
  const v80 = lowV + 0.8 * dV;
  const t20 = crossingTime(time, v, v20, startIdx, endIdx);
  const t80 = crossingTime(time, v, v80, startIdx, endIdx);
  if (t20 === null || t80 === null) return null;
  const dur = Math.abs(t80 - t20);
  if (!(dur > 0)) return null;
  const dtAvg = (time[n - 1] - time[0]) / Math.max(1, n - 1);
  return {
    edge: {
      direction: dir > 0 ? 'rise' : 'fall',
      startIdx, endIdx, t20, t80, v20, v80, lowV, highV,
      samplesIn2080: dtAvg > 0 ? dur / dtAvg : 0,
    },
    dvDtVns: (0.6 * Math.abs(dV)) / dur / 1e9,
  };
}

/** 主边沿过冲之后的振铃：取相邻振铃峰间隔的均值换算频率。峰数不足 2 个时返回 null。 */
function detectRinging(time: number[], v: number[], edge: EdgeInfo, dvSpan: number): { hz: number; info: RingingInfo } | null {
  const n = v.length;
  const dir = edge.direction === 'rise' ? 1 : -1;
  const u = v.map((x) => dir * x);
  const from = Math.max(1, edge.endIdx - 1);
  const winEnd = Math.min(n - 1, from + Math.max(20, Math.floor(n * 0.5)));
  if (winEnd - from < 8) return null;
  // 稳态电平：窗口后 1/3 的中位数
  const tail = u.slice(from + Math.floor((winEnd - from) * 2 / 3), winEnd + 1);
  const settle = median(tail);
  const A = u[edge.endIdx] - settle; // 首个过冲幅度
  if (!(A > 0.05 * Math.abs(dvSpan))) return null; // 过冲不足边沿幅度的 5%，认为没有可测振铃
  const peaks: number[] = [];
  for (let k = from; k <= winEnd - 1; k++) {
    if (u[k] - settle < -1.5 * A) break; // 已离开振铃带（例如后面出现了下降沿）
    const isPeak = k >= 1 && u[k] > u[k - 1] && u[k] >= u[k + 1];
    if (!isPeak) continue;
    const need = peaks.length === 0 ? 0.5 * A : 0.15 * A;
    if (u[k] - settle < need) continue;
    if (peaks.length > 0 && k - peaks[peaks.length - 1] < 3) continue;
    peaks.push(k);
  }
  if (peaks.length < 2) return null;
  let sum = 0;
  for (let i = 1; i < peaks.length; i++) sum += time[peaks[i]] - time[peaks[i - 1]];
  const period = sum / (peaks.length - 1);
  if (!(period > 0)) return null;
  return { hz: Math.round(1 / period), info: { peakIdx: peaks, settleLevel: dir * settle, amplitudeV: Math.abs(A) } };
}

export function computeMetrics(time: number[], samples: number[]): WaveformMetrics {
  const n = samples.length;
  let peak = -Infinity;
  let valley = Infinity;
  let peakIdx = 0;
  let valleyIdx = 0;
  for (let i = 0; i < n; i++) {
    const s = samples[i];
    if (s > peak) { peak = s; peakIdx = i; }
    if (s < valley) { valley = s; valleyIdx = i; }
  }
  if (!Number.isFinite(peak) || !Number.isFinite(valley)) {
    return { peak: 0, valley: 0, peakToPeak: 0, dvDtMaxVns: 0, ringingHz: null, warnings: ['波形为空或含非数值样本'] };
  }
  const p2p = peak - valley;
  const warnings: string[] = [];

  // 旧算法：相邻两点最大斜率（保留仅作对照）
  let maxSlopeVs = 0;
  for (let i = 1; i < n; i++) {
    const dt = time[i] - time[i - 1];
    if (dt > 0) {
      const slope = Math.abs(samples[i] - samples[i - 1]) / dt;
      if (slope > maxSlopeVs) maxSlopeVs = slope;
    }
  }
  const dvDtRawMaxVns = maxSlopeVs / 1e9;

  // 触发前基线（前 10%，至少 3 点）
  const nBase = Math.max(3, Math.floor(n * 0.1));
  const baseSeg = samples.slice(0, Math.min(n, nBase));
  const baselineLevel = median(baseSeg);
  const baseSpan = Math.max(...baseSeg) - Math.min(...baseSeg);
  const baselineStable = p2p > 0 ? baseSpan <= 0.1 * p2p : true;
  if (!baselineStable) warnings.push('前 10% 样本波动较大，触发前基线不稳定，“标称电压”请人工确认');

  // dv/dt：20%–80% 边沿法，失败时回退到相邻点法
  const edgeRes = detectEdge(time, samples, p2p);
  let dvDtMaxVns = dvDtRawMaxVns;
  let dvDtMethod: 'EDGE_20_80' | 'RAW_SLOPE' = 'RAW_SLOPE';
  if (edgeRes) {
    dvDtMaxVns = edgeRes.dvDtVns;
    dvDtMethod = 'EDGE_20_80';
    if (edgeRes.edge.samplesIn2080 < 4) {
      warnings.push(`20%–80% 边沿仅覆盖约 ${edgeRes.edge.samplesIn2080.toFixed(1)} 个采样间隔，示波器采样率不足，dv/dt 会被低估`);
    }
  } else {
    warnings.push('未检测到清晰的主边沿，dv/dt 回退为相邻两点最大斜率（对噪声和采样率敏感，仅供参考）');
  }

  // 振铃频率
  let ringingHz: number | null = null;
  let ringing: RingingInfo | undefined;
  if (edgeRes) {
    const r = detectRinging(time, samples, edgeRes.edge, edgeRes.edge.highV - edgeRes.edge.lowV);
    if (r) { ringingHz = r.hz; ringing = r.info; }
  }

  return {
    peak: Number(peak.toFixed(3)),
    valley: Number(valley.toFixed(3)),
    peakToPeak: Number(p2p.toFixed(3)),
    dvDtMaxVns: Number(dvDtMaxVns.toFixed(3)),
    ringingHz,
    baselineLevel: Number(baselineLevel.toFixed(3)),
    baselineStable,
    dvDtRawMaxVns: Number(dvDtRawMaxVns.toFixed(3)),
    dvDtMethod,
    peakIdx,
    valleyIdx,
    edge: edgeRes?.edge,
    ringing,
    warnings,
  };
}

/**
 * 保留尖峰的降采样：把序列切成若干桶，每桶只保留最小值与最大值（按原顺序）。
 * 不能等间隔抽点——那样会把几个采样点宽的尖峰直接丢掉，而尖峰恰恰是要看的东西。
 */
export function downsampleMinMax(time: number[], samples: number[], maxPoints: number): { time: number[]; samples: number[] } {
  const n = samples.length;
  if (n <= maxPoints || maxPoints < 4) return { time: time.slice(), samples: samples.slice() };
  const buckets = Math.floor(maxPoints / 2);
  const outT: number[] = [];
  const outS: number[] = [];
  for (let b = 0; b < buckets; b++) {
    const lo = Math.floor((b * n) / buckets);
    const hi = Math.max(lo + 1, Math.floor(((b + 1) * n) / buckets));
    let minI = lo;
    let maxI = lo;
    for (let i = lo; i < hi; i++) {
      if (samples[i] < samples[minI]) minI = i;
      if (samples[i] > samples[maxI]) maxI = i;
    }
    const a = Math.min(minI, maxI);
    const c = Math.max(minI, maxI);
    outT.push(time[a]); outS.push(samples[a]);
    if (c !== a) { outT.push(time[c]); outS.push(samples[c]); }
  }
  return { time: outT, samples: outS };
}

export interface WaveformMarker {
  kind: 'peak' | 'valley' | 'edge20' | 'edge80' | 'ring' | 'baseline';
  t: number;
  v: number;
  label: string;
}

/** 把指标是“从波形哪里算出来的”换成图上可画的标记（物理单位，不依赖降采样下标）。 */
export function buildMarkers(time: number[], samples: number[], m: WaveformMetrics): WaveformMarker[] {
  const out: WaveformMarker[] = [];
  if (m.peakIdx !== undefined) out.push({ kind: 'peak', t: time[m.peakIdx], v: samples[m.peakIdx], label: `峰值 ${m.peak} V` });
  if (m.valleyIdx !== undefined) out.push({ kind: 'valley', t: time[m.valleyIdx], v: samples[m.valleyIdx], label: `谷值 ${m.valley} V` });
  if (m.baselineLevel !== undefined) out.push({ kind: 'baseline', t: time[0], v: m.baselineLevel, label: `基线 ${m.baselineLevel} V` });
  if (m.edge) {
    out.push({ kind: 'edge20', t: m.edge.t20, v: m.edge.v20, label: '20%' });
    out.push({ kind: 'edge80', t: m.edge.t80, v: m.edge.v80, label: `80% · dv/dt ${m.dvDtMaxVns} V/ns` });
  }
  if (m.ringing) {
    m.ringing.peakIdx.forEach((i, k) => out.push({ kind: 'ring', t: time[i], v: samples[i], label: k === 0 ? `振铃 ${m.ringingHz} Hz` : '' }));
  }
  return out;
}

export type ScopeRole = 'none' | 'vbus' | 'vgs' | 'vds';

export interface ChannelReport {
  channelIndex: number;
  channelName: string;
  role: ScopeRole;
  evidenceId: string;
  metrics: WaveformMetrics;
}

export interface ScopeMeasurementResult {
  values: Record<string, number | string>;
  provenance: Record<string, MeasurementProvenance>;
  warnings: string[];
  count: number;
  reports: ChannelReport[];
}

const clampConf = (base: number, penalties: number[]): number => Math.max(30, base - penalties.reduce((a, b) => a + b, 0));

/**
 * 通道角色 → 工程输入字段。纯函数，可测试。
 * 与旧版的差异（均为修正）：
 *  1. 标称母线电压取触发前基线的中位数，不再把波形谷值当标称值；
 *  2. dv/dt 用 20%–80% 边沿法；
 *  3. 同时选了 Vbus 与 Vds 时，母线峰值只取 Vbus 通道，不再由“后选的通道”静默覆盖；
 *  4. 置信度不再固定 90%，采样不足/基线不稳会降低并写明原因。
 */
export function buildMeasurementsFromChannels(
  parsed: ParsedScope,
  roles: ScopeRole[],
  fileName: string,
  nowIso: string = new Date().toISOString(),
): ScopeMeasurementResult {
  const values: Record<string, number | string> = {};
  const provenance: Record<string, MeasurementProvenance> = {};
  const warnings: string[] = [];
  const reports: ChannelReport[] = [];
  const hasVbus = roles.some((r) => r === 'vbus');

  parsed.channels.forEach((ch, idx) => {
    const role = roles[idx];
    if (!role || role === 'none') return;
    const m = computeMetrics(parsed.time, ch.samples);
    const evidenceId = `scope:${fileName}:${ch.name}:${nowIso}`;
    const label = `${fileName} · ${ch.name} · ${role}`;
    const mk = (conf: number, notes: string[]): MeasurementProvenance => ({
      source: 'IMPORTED',
      sourceLabel: label,
      enteredAt: nowIso,
      evidenceId,
      confidencePct: conf,
      note: notes.length ? notes.join('；') : undefined,
    });
    reports.push({ channelIndex: idx, channelName: ch.name, role, evidenceId, metrics: m });

    if (role === 'vbus') {
      values.busVoltagePeakV = m.peak;
      provenance.busVoltagePeakV = mk(90, ['取通道峰值']);
      if (m.baselineLevel !== undefined) {
        values.busVoltageNominalV = m.baselineLevel;
        const notes = ['取触发前 10% 样本中位数作为标称电压'];
        const pen: number[] = [];
        if (m.baselineStable === false) { pen.push(25); notes.push('基线不稳定，请人工确认'); }
        provenance.busVoltageNominalV = mk(clampConf(90, pen), notes);
      }
    } else if (role === 'vgs') {
      values.gateSpikeV = m.peak;
      provenance.gateSpikeV = mk(90, ['取通道峰值（含正常驱动电平，非仅尖峰增量）']);
    } else if (role === 'vds') {
      const pen: number[] = [];
      const notes = [m.dvDtMethod === 'EDGE_20_80' ? '20%–80% 边沿法' : '回退：相邻两点最大斜率'];
      if (m.dvDtMethod !== 'EDGE_20_80') pen.push(30);
      if (m.edge && m.edge.samplesIn2080 < 4) { pen.push(25); notes.push('边沿采样点不足，dv/dt 偏低'); }
      values.dvdtVns = m.dvDtMaxVns;
      provenance.dvdtVns = mk(clampConf(90, pen), notes);
      if (hasVbus) {
        warnings.push('同时选择了 Vbus 与 Vds 通道：母线峰值取 Vbus 通道，Vds 峰值未写入。');
      } else {
        values.busVoltagePeakV = m.peak;
        provenance.busVoltagePeakV = mk(70, ['无 Vbus 通道，暂用 Vds 峰值代替母线峰值，请确认']);
        warnings.push('未选 Vbus 通道：母线峰值暂用 Vds 峰值代替（置信度已下调）。');
      }
    }
    (m.warnings || []).forEach((w) => warnings.push(`${ch.name}：${w}`));
  });

  return { values, provenance, warnings, count: reports.length, reports };
}
