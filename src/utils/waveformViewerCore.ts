/**
 * WAVE-Test → backHW integration core.
 *
 * Rules:
 * 1) Display always uses the source t[] timebase.
 * 2) FFT never fabricates a constant dt; non-uniform data is linearly resampled first.
 * 3) Measurements come from imported samples, never demo/fixed values.
 */

export interface WaveformSeries {
  id: string;
  name: string;
  unit: string;
  t: Float64Array;
  v: Float32Array;
}

export interface SpectrumSeries {
  frequencies: Float32Array;
  magnitudes: Float32Array;
  dbValues: Float32Array;
  sampleRate: number;
  resolution: number;
  fftSize: number;
}

export function isUniformTime(t: Float64Array, tolerance = 0.01): boolean {
  if (t.length < 3) return true;
  const dts = new Float64Array(t.length - 1);
  for (let i = 1; i < t.length; i++) dts[i - 1] = t[i] - t[i - 1];
  const sorted = Array.from(dts).filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
  if (!sorted.length) return false;
  const median = sorted[Math.floor(sorted.length / 2)];
  return median > 0 && sorted.every((dt) => Math.abs(dt - median) / median <= tolerance);
}

export function medianDt(t: Float64Array): number {
  if (t.length < 2) return 0;
  const dts: number[] = [];
  for (let i = 1; i < t.length; i++) {
    const dt = t[i] - t[i - 1];
    if (Number.isFinite(dt) && dt > 0) dts.push(dt);
  }
  if (!dts.length) return 0;
  dts.sort((a, b) => a - b);
  const m = Math.floor(dts.length / 2);
  return dts.length % 2 ? dts[m] : (dts[m - 1] + dts[m]) / 2;
}

/** Linear resampling for analysis only. Source waveform remains untouched. */
export function resampleUniform(t: Float64Array, v: Float32Array, nominalDt = medianDt(t)): WaveformSeries {
  if (t.length !== v.length) throw new Error('Time/value length mismatch.');
  if (t.length < 2 || !(nominalDt > 0)) return { id: 'resampled', name: 'resampled', unit: '', t: t.slice(), v: v.slice() };

  const start = t[0];
  const end = t[t.length - 1];
  const count = Math.max(2, Math.round((end - start) / nominalDt) + 1);
  // 均匀网格：步长由 (end-start)/(count-1) 反推，保证输出严格等间隔且末点恰为 end。
  // 不能只把末点吸附到 end —— 那会让最后一段 dt 与其余段不同，重采样后仍是非均匀序列，
  // FFT 会把这段不均匀当成频谱成分（本模块的存在意义就是避免这一点）。
  const step = (end - start) / (count - 1);
  const outT = new Float64Array(count);
  const outV = new Float32Array(count);

  let j = 0;
  for (let i = 0; i < count; i++) {
    const target = start + i * step;
    outT[i] = target;
    while (j < t.length - 2 && t[j + 1] < target) j++;
    const t0 = t[j];
    const t1 = t[j + 1];
    const v0 = v[j];
    const v1 = v[j + 1];
    const frac = t1 > t0 ? (target - t0) / (t1 - t0) : 0;
    outV[i] = Number.isFinite(v0) && Number.isFinite(v1)
      ? v0 + frac * (v1 - v0)
      : Number.isFinite(v0) ? v0 : Number.isFinite(v1) ? v1 : NaN;
  }

  return { id: 'resampled', name: 'resampled', unit: '', t: outT, v: outV };
}

function floorPowerOfTwo(n: number): number {
  let p = 1;
  while (p * 2 <= n) p *= 2;
  return p;
}

function radix2FFT(real: Float64Array, imag: Float64Array): void {
  const n = real.length;
  let j = 0;
  for (let i = 0; i < n - 1; i++) {
    if (i < j) {
      [real[i], real[j]] = [real[j], real[i]];
      [imag[i], imag[j]] = [imag[j], imag[i]];
    }
    let k = n >> 1;
    while (k <= j) { j -= k; k >>= 1; }
    j += k;
  }
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const a = -2 * Math.PI / len;
    const wrStep = Math.cos(a);
    const wiStep = Math.sin(a);
    for (let i = 0; i < n; i += len) {
      let wr = 1;
      let wi = 0;
      for (let k = 0; k < half; k++) {
        const p = i + k;
        const q = p + half;
        const vr = real[q] * wr - imag[q] * wi;
        const vi = real[q] * wi + imag[q] * wr;
        const ur = real[p];
        const ui = imag[p];
        real[p] = ur + vr;
        imag[p] = ui + vi;
        real[q] = ur - vr;
        imag[q] = ui - vi;
        const nextWr = wr * wrStep - wi * wiStep;
        wi = wr * wiStep + wi * wrStep;
        wr = nextWr;
      }
    }
  }
}

function windowValue(kind: 'hann' | 'hamming' | 'blackman-harris' | 'rectangular', i: number, n: number): number {
  if (kind === 'rectangular' || n <= 1) return 1;
  const x = 2 * Math.PI * i / (n - 1);
  if (kind === 'hamming') return 0.54 - 0.46 * Math.cos(x);
  if (kind === 'blackman-harris') return 0.35875 - 0.48829 * Math.cos(x) + 0.14128 * Math.cos(2 * x) - 0.01168 * Math.cos(3 * x);
  return 0.5 * (1 - Math.cos(x));
}

/** Compute a single-sided spectrum from imported data. */
export function computeSpectrum(
  sourceT: Float64Array,
  sourceV: Float32Array,
  window: 'hann' | 'hamming' | 'blackman-harris' | 'rectangular' = 'hann',
): SpectrumSeries {
  const uniform = resampleUniform(sourceT, sourceV);
  const baseN = floorPowerOfTwo(uniform.v.length);
  if (baseN < 4) throw new Error('波形点数不足，无法进行 FFT。');
  const sampleRate = 1 / medianDt(uniform.t);
  if (!(sampleRate > 0)) throw new Error('无法从时间轴得到有效采样率。');

  let mean = 0;
  for (let i = 0; i < baseN; i++) mean += uniform.v[i];
  mean /= baseN;

  let gain = 0;
  for (let i = 0; i < baseN; i++) gain += windowValue(window, i, baseN);
  gain /= baseN;

  const real = new Float64Array(baseN);
  const imag = new Float64Array(baseN);
  for (let i = 0; i < baseN; i++) real[i] = (uniform.v[i] - mean) * windowValue(window, i, baseN);
  radix2FFT(real, imag);

  const bins = baseN / 2 + 1;
  const frequencies = new Float32Array(bins);
  const magnitudes = new Float32Array(bins);
  const dbValues = new Float32Array(bins);
  const df = sampleRate / baseN;
  const norm = baseN * gain;
  for (let k = 0; k < bins; k++) {
    frequencies[k] = k * df;
    const raw = Math.hypot(real[k], imag[k]);
    magnitudes[k] = (k === 0 || k === bins - 1 ? raw : 2 * raw) / norm;
    dbValues[k] = 20 * Math.log10(Math.max(magnitudes[k], 1e-12));
  }
  return { frequencies, magnitudes, dbValues, sampleRate, resolution: df, fftSize: baseN };
}

export type WaveformEngineeringRole = 'none' | 'vbus' | 'vgs' | 'vds';

/** Assign one engineering role to one channel; selecting the same role elsewhere clears the prior owner. */
export function assignUniqueScopeRole(
  roles: readonly WaveformEngineeringRole[],
  index: number,
  role: WaveformEngineeringRole,
): WaveformEngineeringRole[] {
  if (index < 0 || index >= roles.length) throw new Error('Scope role index out of range.');
  const next = [...roles];
  if (role !== 'none') {
    for (let i = 0; i < next.length; i++) {
      if (i !== index && next[i] === role) next[i] = 'none';
    }
  }
  next[index] = role;
  return next;
}

export function nearestTimeIndex(t: Float64Array, target: number): number {
  if (!t.length) return 0;
  let lo = 0;
  let hi = t.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (t[mid] < target) lo = mid + 1;
    else if (t[mid] > target) hi = mid - 1;
    else return mid;
  }
  const a = Math.max(0, Math.min(t.length - 1, lo - 1));
  const b = Math.max(0, Math.min(t.length - 1, lo));
  return Math.abs(t[a] - target) <= Math.abs(t[b] - target) ? a : b;
}

export function formatEngineering(value: number, unit = ''): string {
  if (!Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  const prefixes: Array<[string, number]> = [['G', 1e9], ['M', 1e6], ['k', 1e3], ['', 1], ['m', 1e-3], ['µ', 1e-6], ['n', 1e-9]];
  for (const [p, f] of prefixes) {
    if (abs >= f && abs < f * 1000) return `${(value / f).toFixed(3)} ${p}${unit}`.trim();
  }
  return `${value.toExponential(3)} ${unit}`.trim();
}
