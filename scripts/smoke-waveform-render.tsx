import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { WaveformPlot } from '../src/components/WaveformPlot';
import { computeMetrics, buildMarkers } from '../src/utils/oscilloscopeImport';

// 带 50MHz 振铃的上升沿：渲染出的 SVG 必须含波形路径、20/80% 与振铃标记，且点数受限
const n = 60000, dt = 0.05e-9, f = 50e6;
const time: number[] = []; const v: number[] = [];
for (let i = 0; i < n; i++) {
  const t = i * dt; time.push(t);
  const base = 20 * Math.min(1, Math.max(0, (t - 500e-9) / 5e-9));
  const tt = t - 505e-9;
  v.push(base + (tt > 0 ? 8 * Math.exp(-tt / 80e-9) * Math.sin(2 * Math.PI * f * tt + Math.PI / 2) : 0));
}
const m = computeMetrics(time, v);
const html = renderToStaticMarkup(<WaveformPlot time={time} samples={v} markers={buildMarkers(time, v, m)} title='CH2 · 指标取点标注' />);

assert.ok(html.includes('<svg') && html.includes('<path'), '应渲染 SVG 波形路径');
assert.ok(/aria-label="CH2/.test(html), '应带可访问标题');
assert.ok(html.includes('20%') && html.includes('dv/dt'), '应标注 20%-80% 边沿与 dv/dt');
assert.ok(/振铃 \d+ Hz/.test(html), '应标注振铃频率');
const d = /<path d="([^"]+)"/.exec(html)![1];
const pts = d.split(/(?=[ML])/).length;
assert.ok(pts <= 900, `图上点数应被降采样，实际 ${pts}`);
assert.ok(html.includes('放大') && html.includes('全部'), '应有缩放控件');
const empty = renderToStaticMarkup(<WaveformPlot time={[0]} samples={[1]} />);
assert.ok(empty.includes('波形数据不足'), '数据不足时给出提示而不是崩溃');
console.log('smoke-waveform-render OK  (markers=' + buildMarkers(time, v, m).length + ', path points=' + pts + ', ringingHz=' + m.ringingHz + ')');
