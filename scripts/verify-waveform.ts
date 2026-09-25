import assert from 'node:assert/strict';
import {
  computeMetrics, downsampleMinMax, buildMeasurementsFromChannels, buildMarkers, ParsedScope, ScopeRole,
} from '../src/utils/oscilloscopeImport';
import { formatSeconds, niceTicks, windowIndices, zoomWindow, panWindow } from '../src/utils/waveformFormat';
import { addWaveforms, loadWaveforms, removeWaveform, toStoredWaveform, MAX_STORED_WAVEFORMS, KeyValueStorage } from '../src/utils/waveformStorage';

let failures = 0;
function check(label: string, fn: () => void) {
  try { fn(); console.log(`  ✓ ${label}`); }
  catch (err) { failures++; console.log(`  ✗ ${label}\n    ${(err as Error).message}`); }
}
// 确定性伪随机，保证测试可重复
function rng(seed: number) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const gauss = (r: () => number) => { let u = 0, v = 0; while (u === 0) u = r(); while (v === 0) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

function ramp(n: number, dt: number, tEdge: number, riseS: number, v0: number, v1: number, noise = 0, seed = 1) {
  const r = rng(seed);
  const time: number[] = []; const v: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = i * dt;
    const x = Math.min(1, Math.max(0, (t - tEdge) / riseS));
    time.push(t); v.push(v0 + (v1 - v0) * x + (noise ? noise * gauss(r) : 0));
  }
  return { time, v };
}

console.log('\n=== 示波器指标：合成波形已知答案 ===');

check('线性上升沿 0→40V/50ns：dv/dt≈0.8 V/ns，走 20%-80% 边沿法', () => {
  const { time, v } = ramp(1000, 1e-9, 200e-9, 50e-9, 0, 40);
  const m = computeMetrics(time, v);
  assert.equal(m.dvDtMethod, 'EDGE_20_80');
  assert.ok(Math.abs(m.dvDtMaxVns - 0.8) / 0.8 < 0.03, `dv/dt=${m.dvDtMaxVns}`);
  assert.ok(m.edge && m.edge.samplesIn2080 >= 25, `samplesIn2080=${m.edge?.samplesIn2080}`);
});

check('带噪声(σ=0.3V)：边沿法误差小，相邻点法明显偏大（旧算法的问题）', () => {
  const { time, v } = ramp(1000, 1e-9, 200e-9, 50e-9, 0, 40, 0.3, 7);
  const m = computeMetrics(time, v);
  const err = Math.abs(m.dvDtMaxVns - 0.8) / 0.8;
  assert.ok(err < 0.15, `边沿法误差 ${(err * 100).toFixed(1)}%`);
  assert.ok((m.dvDtRawMaxVns as number) > 1.3 * 0.8, `旧算法=${m.dvDtRawMaxVns}，应显著偏大`);
});

check('采样率不足(20ns 采样 50ns 边沿)：给出警告，不假装准确', () => {
  const { time, v } = ramp(200, 20e-9, 1000e-9, 50e-9, 0, 40);
  const m = computeMetrics(time, v);
  assert.ok((m.warnings || []).some((w) => /采样/.test(w)), `warnings=${JSON.stringify(m.warnings)}`);
});

check('振铃：阶跃后 50MHz 衰减振荡 → ringingHz≈50MHz（误差<5%）', () => {
  const n = 1200, dt = 0.5e-9, f = 50e6, tau = 80e-9, tEdge = 100e-9, rise = 5e-9;
  const time: number[] = []; const v: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = i * dt; time.push(t);
    const base = 20 * Math.min(1, Math.max(0, (t - tEdge) / rise));
    const tt = t - tEdge - rise;
    const ring = tt > 0 ? 8 * Math.exp(-tt / tau) * Math.sin(2 * Math.PI * f * tt + Math.PI / 2 * 0) : 0;
    v.push(base + ring);
  }
  const m = computeMetrics(time, v);
  assert.ok(m.ringingHz !== null, '应检测到振铃');
  assert.ok(Math.abs((m.ringingHz as number) - f) / f < 0.05, `ringingHz=${m.ringingHz}`);
});

check('纯方波(无过冲)：不得把开关基波误报成振铃频率', () => {
  const n = 2000, dt = 10e-9; const time: number[] = []; const v: number[] = [];
  for (let i = 0; i < n; i++) { time.push(i * dt); v.push(Math.floor(i / 500) % 2 === 0 ? 0 : 12); } // ~10kHz 方波
  const m = computeMetrics(time, v);
  assert.equal(m.ringingHz, null);
});

check('母线泵升波形：标称电压取触发前基线(≈12V)，而不是谷值', () => {
  const n = 2000, dt = 1e-6; const time: number[] = []; const v: number[] = [];
  for (let i = 0; i < n; i++) {
    time.push(i * dt);
    const t = i * dt;
    // 前 20% 稳态 12V（+小幅纹波，谷值会低于 12V），然后泵升到 38V 再回落
    const ripple = 0.4 * Math.sin(i * 0.9);
    const pump = t > 400e-6 ? 26 * Math.exp(-(t - 400e-6) / 300e-6) : 0;
    v.push(12 + ripple + pump);
  }
  const m = computeMetrics(time, v);
  assert.ok(Math.abs((m.baselineLevel as number) - 12) < 0.5, `baselineLevel=${m.baselineLevel}`);
  assert.ok(m.valley < (m.baselineLevel as number), '谷值应低于基线，说明旧写法(nominal=valley)会低估');
  assert.equal(m.baselineStable, true);
});

console.log('\n=== 降采样保尖峰 / 标记 ===');

check('10 万点里单点尖峰经 downsampleMinMax 仍保留，且点数受限', () => {
  const n = 100000; const time = Array.from({ length: n }, (_, i) => i * 1e-9); const s = new Array(n).fill(1); s[54321] = 50;
  const d = downsampleMinMax(time, s, 1000);
  assert.ok(d.samples.length <= 1000 && d.samples.length >= 500, `len=${d.samples.length}`);
  assert.equal(Math.max(...d.samples), 50);
});

check('buildMarkers：峰值/边沿/振铃标记都落在真实样本或插值点上', () => {
  const { time, v } = ramp(1000, 1e-9, 200e-9, 50e-9, 0, 40);
  const m = computeMetrics(time, v);
  const mk = buildMarkers(time, v, m);
  const kinds = mk.map((x) => x.kind);
  assert.ok(kinds.includes('peak') && kinds.includes('edge20') && kinds.includes('edge80'));
  const e20 = mk.find((x) => x.kind === 'edge20')!;
  assert.ok(Math.abs(e20.v - 8) < 0.5 && Math.abs(e20.t - 210e-9) < 2e-9, `edge20=(${e20.t},${e20.v})`);
});

console.log('\n=== 通道角色 → 工程输入（修正旧版的覆盖/固定置信度问题）===');

function scope(vdsRiseUs = 50): ParsedScope {
  const vbus = (() => { const n = 2000, dt = 1e-6; const time: number[] = []; const v: number[] = [];
    for (let i = 0; i < n; i++) { time.push(i * dt); v.push(12 + (i * dt > 400e-6 ? 26 * Math.exp(-(i * dt - 400e-6) / 300e-6) : 0)); } return { time, v }; })();
  const vds = vbus.time.map((t) => 0); // 占位，下面按同一时间轴构造 Vds
  const vdsS = vbus.time.map((t) => { const x = Math.min(1, Math.max(0, (t - 1000e-6) / (vdsRiseUs * 1e-6))); return 40 * x; });
  void vds;
  return { time: vbus.time, channels: [{ name: 'CH1', samples: vbus.v }, { name: 'CH2', samples: vdsS }], sampleRateHz: 1e6, rowCount: vbus.time.length };
}

check('同时选 Vbus 与 Vds：母线峰值来自 Vbus(≈38V)，不被 Vds(40V)覆盖，并给出警告', () => {
  const r = buildMeasurementsFromChannels(scope(), ['vbus', 'vds'] as ScopeRole[], 'a.csv', '2026-01-01T00:00:00.000Z');
  assert.ok(Math.abs((r.values.busVoltagePeakV as number) - 38) < 0.6, `busVoltagePeakV=${r.values.busVoltagePeakV}`);
  assert.ok(Math.abs((r.values.busVoltageNominalV as number) - 12) < 0.5, `nominal=${r.values.busVoltageNominalV}`);
  assert.ok(r.warnings.some((w) => /Vbus.*Vds|母线峰值取 Vbus/.test(w)));
});

check('采样不足(边沿仅 3 个采样间隔)时 dv/dt 置信度低于 90 并写明原因；采样充足时不降级', () => {
  const ok = buildMeasurementsFromChannels(scope(50), ['none', 'vds'] as ScopeRole[], 'a.csv', '2026-01-01T00:00:00.000Z');
  assert.equal(ok.provenance.dvdtVns.confidencePct, 90, '采样充足不应被降级');
  const r = buildMeasurementsFromChannels(scope(3), ['none', 'vds'] as ScopeRole[], 'a.csv', '2026-01-01T00:00:00.000Z');
  const p = r.provenance.dvdtVns;
  assert.ok(p && (p.confidencePct as number) < 90, `confidence=${p?.confidencePct}`);
  assert.ok(/采样|回退/.test(p?.note || ''), `note=${p?.note}`);
});

check('未选任何角色：count=0，不产出任何字段', () => {
  const r = buildMeasurementsFromChannels(scope(), ['none', 'none'] as ScopeRole[], 'a.csv');
  assert.equal(r.count, 0);
  assert.deepEqual(r.values, {});
});

console.log('\n=== 波形留存 / 绘图辅助 ===');

function memStorage(quotaChars = Infinity): KeyValueStorage & { data: Record<string, string> } {
  const data: Record<string, string> = {};
  return { data, getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { if (v.length > quotaChars) throw new Error('QuotaExceeded'); data[k] = v; } };
}

check('导入后留存：降采样≤1200点、保留峰值标记、可读回、可删除', () => {
  const st = memStorage();
  const sc = scope(50);
  const r = buildMeasurementsFromChannels(sc, ['vbus', 'none'] as ScopeRole[], 'a.csv', '2026-01-01T00:00:00.000Z');
  const w = toStoredWaveform(r.reports[0], sc, 'a.csv', '2026-01-01T00:00:00.000Z', 'scn-1');
  assert.ok(w.samples.length <= 1200);
  assert.equal(Math.max(...w.samples), Math.max(...sc.channels[0].samples), '降采样后峰值必须保留');
  assert.ok(w.markers.some((m) => m.kind === 'peak'));
  addWaveforms([w], st);
  assert.equal(loadWaveforms(st).length, 1);
  assert.equal(loadWaveforms(st)[0].scenarioId, 'scn-1');
  assert.equal(removeWaveform(w.id, st).length, 0);
});

check('留存上限：超过 8 条丢最旧；存储配额不足时不抛异常', () => {
  const st = memStorage();
  const sc = scope(50);
  const mk = (i: number) => { const r = buildMeasurementsFromChannels(sc, ['vbus', 'none'] as ScopeRole[], `f${i}.csv`, `2026-01-01T00:00:0${i % 10}.000Z`); return toStoredWaveform(r.reports[0], sc, `f${i}.csv`, 'x'); };
  for (let i = 0; i < MAX_STORED_WAVEFORMS + 3; i++) addWaveforms([mk(i)], st);
  assert.equal(loadWaveforms(st).length, MAX_STORED_WAVEFORMS);
  const tiny = memStorage(10);
  assert.doesNotThrow(() => addWaveforms([mk(1)], tiny));
  assert.equal(loadWaveforms(null).length, 0, '无 storage 时返回空');
});

check('格式化/刻度/缩放：工程单位、刻度落在范围内、视窗不越界', () => {
  assert.equal(formatSeconds(50e-9), '50 ns');
  assert.equal(formatSeconds(2.5e-6), '2.5 µs');
  const ticks = niceTicks(0, 38, 5);
  assert.ok(ticks.every((t) => t >= 0 && t <= 38) && ticks.length >= 3);
  const [a, b] = zoomWindow(0, 1, 0.5); assert.ok(Math.abs((b - a) - 0.5) < 1e-9);
  const [c, d] = panWindow(0.75, 1, 0.5); assert.ok(c >= 0 && d <= 1 && Math.abs((d - c) - 0.25) < 1e-9);
  const [lo, hi] = windowIndices(1000, 0.2, 0.4); assert.ok(lo === 199 && hi === 400);
});

console.log(failures === 0 ? '\nALL WAVEFORM CHECKS PASSED' : `\n${failures} WAVEFORM CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
