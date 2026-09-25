/** 波形绘图用的纯函数（无 React 依赖，可直接单测）。 */

/** 工程单位格式化秒：ns / µs / ms / s。 */
export function formatSeconds(t: number): string {
  if (!Number.isFinite(t)) return '—';
  const a = Math.abs(t);
  if (a === 0) return '0';
  if (a < 1e-6) return `${trim(t * 1e9)} ns`;
  if (a < 1e-3) return `${trim(t * 1e6)} µs`;
  if (a < 1) return `${trim(t * 1e3)} ms`;
  return `${trim(t)} s`;
}

export function formatHz(f: number): string {
  if (!Number.isFinite(f)) return '—';
  const a = Math.abs(f);
  if (a >= 1e9) return `${trim(f / 1e9)} GHz`;
  if (a >= 1e6) return `${trim(f / 1e6)} MHz`;
  if (a >= 1e3) return `${trim(f / 1e3)} kHz`;
  return `${trim(f)} Hz`;
}

function trim(x: number): string {
  return Number(x.toPrecision(4)).toString();
}

/** “好看”的刻度：返回落在 [min,max] 内的等间隔刻度。 */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (!(max > min)) return [min];
  const span = max - min;
  const raw = span / Math.max(1, count);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm >= 5 ? 5 : norm >= 2 ? 2 : 1) * mag;
  const first = Math.ceil(min / step) * step;
  const out: number[] = [];
  for (let v = first; v <= max + step * 1e-9; v += step) out.push(Number(v.toPrecision(12)));
  return out;
}

/** 视窗按下标比例裁剪：返回 [lo, hi] 闭区间下标。 */
export function windowIndices(n: number, viewLo: number, viewHi: number): [number, number] {
  const lo = Math.max(0, Math.floor(viewLo * (n - 1)));
  const hi = Math.min(n - 1, Math.max(lo + 1, Math.ceil(viewHi * (n - 1))));
  return [lo, hi];
}

/** 缩放/平移视窗，保证落在 [0,1] 且最小宽度不小于 minSpan。 */
export function zoomWindow(lo: number, hi: number, factor: number, minSpan = 0.002): [number, number] {
  const c = (lo + hi) / 2;
  let span = Math.min(1, Math.max(minSpan, (hi - lo) * factor));
  let a = c - span / 2;
  let b = c + span / 2;
  if (a < 0) { b -= a; a = 0; }
  if (b > 1) { a -= b - 1; b = 1; }
  return [Math.max(0, a), Math.min(1, b)];
}

export function panWindow(lo: number, hi: number, delta: number): [number, number] {
  const span = hi - lo;
  let a = lo + delta * span;
  let b = hi + delta * span;
  if (a < 0) { b -= a; a = 0; }
  if (b > 1) { a -= b - 1; b = 1; }
  return [Math.max(0, a), Math.min(1, b)];
}
