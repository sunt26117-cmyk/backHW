/**
 * 示波器 CSV 导入：解析时序波形（时间 + 电压通道），计算峰值/谷值/dv/dt/振铃频率。
 * 宽容解析：自动识别分隔符、跳过元数据注释行、定位数据起始行，适配 Tektronix/Rigol/Keysight 等常见导出格式。
 */

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

export interface WaveformMetrics {
  peak: number;
  valley: number;
  peakToPeak: number;
  dvDtMaxVns: number;
  ringingHz: number | null;
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

export function computeMetrics(time: number[], samples: number[]): WaveformMetrics {
  const n = samples.length;
  let peak = -Infinity;
  let valley = Infinity;
  for (const s of samples) {
    if (s > peak) peak = s;
    if (s < valley) valley = s;
  }
  if (!Number.isFinite(peak) || !Number.isFinite(valley)) {
    return { peak: 0, valley: 0, peakToPeak: 0, dvDtMaxVns: 0, ringingHz: null };
  }

  // dv/dt：最大相邻斜率，转成 V/ns
  let maxSlopeVs = 0;
  for (let i = 1; i < n; i++) {
    const dt = time[i] - time[i - 1];
    if (dt > 0) {
      const slope = Math.abs(samples[i] - samples[i - 1]) / dt;
      if (slope > maxSlopeVs) maxSlopeVs = slope;
    }
  }
  const dvDtMaxVns = maxSlopeVs / 1e9;

  // 振铃频率：去均值后过零计数（一阶近似）
  const mean = samples.reduce((a, b) => a + b, 0) / n;
  let crossings = 0;
  for (let i = 1; i < n; i++) {
    const a = samples[i - 1] - mean;
    const b = samples[i] - mean;
    if ((a >= 0 && b < 0) || (a < 0 && b >= 0)) crossings++;
  }
  const duration = time[n - 1] - time[0];
  const ringingHz = crossings >= 2 && duration > 0 ? Math.round(crossings / 2 / duration) : null;

  return {
    peak: Number(peak.toFixed(3)),
    valley: Number(valley.toFixed(3)),
    peakToPeak: Number((peak - valley).toFixed(3)),
    dvDtMaxVns: Number(dvDtMaxVns.toFixed(3)),
    ringingHz: ringingHz !== null ? Math.round(ringingHz) : null,
  };
}

