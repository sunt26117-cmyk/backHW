import React, { useMemo, useState } from 'react';
import { downsampleMinMax, WaveformMarker } from '../utils/oscilloscopeImport';
import { formatSeconds, niceTicks, windowIndices, zoomWindow, panWindow } from '../utils/waveformFormat';

export interface WaveformPlotProps {
  time: number[];
  samples: number[];
  markers?: WaveformMarker[];
  title?: string;
  color?: string;
  height?: number;
  /** 图上最多绘制的点数（min/max 桶降采样，保尖峰）。 */
  maxPoints?: number;
}

const W = 640;
const ML = 54;
const MR = 12;
const MT = 14;
const MB = 26;

const KIND_COLOR: Record<WaveformMarker['kind'], string> = {
  peak: '#fbbf24',
  valley: '#94a3b8',
  baseline: '#38bdf8',
  edge20: '#22d3ee',
  edge80: '#22d3ee',
  ring: '#f472b6',
};

/**
 * 纯 SVG 波形图（不依赖图表库，离线单文件版可用）。
 * 关键点：指标标记（峰值/基线/20%-80%边沿/振铃峰）直接画在波形上，
 * 让人一眼判断“这个数是从哪里算出来的、算得对不对”。
 */
export const WaveformPlot: React.FC<WaveformPlotProps> = ({
  time, samples, markers = [], title, color = '#f59e0b', height = 220, maxPoints = 900,
}) => {
  const n = samples.length;
  const [view, setView] = useState<[number, number]>([0, 1]);
  const [cursor, setCursor] = useState<{ t: number; v: number } | null>(null);

  const geo = useMemo(() => {
    if (n < 2) return null;
    const [lo, hi] = windowIndices(n, view[0], view[1]);
    const t = time.slice(lo, hi + 1);
    const s = samples.slice(lo, hi + 1);
    const d = downsampleMinMax(t, s, maxPoints);
    let vMin = Infinity; let vMax = -Infinity;
    for (const x of s) { if (x < vMin) vMin = x; if (x > vMax) vMax = x; }
    if (!(vMax > vMin)) { vMax = vMin + 1; }
    const pad = (vMax - vMin) * 0.08;
    return { t0: t[0], t1: t[t.length - 1], vMin: vMin - pad, vMax: vMax + pad, d, visibleT: t, visibleS: s };
  }, [time, samples, view, n, maxPoints]);

  if (!geo || !(geo.t1 > geo.t0)) {
    return <div className='rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs text-slate-500'>波形数据不足，无法绘图</div>;
  }

  const H = height;
  const pw = W - ML - MR;
  const ph = H - MT - MB;
  const X = (t: number) => ML + ((t - geo.t0) / (geo.t1 - geo.t0)) * pw;
  const Y = (v: number) => MT + (1 - (v - geo.vMin) / (geo.vMax - geo.vMin)) * ph;
  const path = geo.d.time.map((t, i) => `${i === 0 ? 'M' : 'L'}${X(t).toFixed(1)},${Y(geo.d.samples[i]).toFixed(1)}`).join(' ');
  const yTicks = niceTicks(geo.vMin, geo.vMax, 5);
  const xTicks = niceTicks(geo.t0, geo.t1, 5);
  const visibleMarkers = markers.filter((m) => m.t >= geo.t0 && m.t <= geo.t1 && m.v >= geo.vMin && m.v <= geo.vMax);

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const frac = Math.min(1, Math.max(0, (px - ML) / pw));
    const idx = Math.round(frac * (geo.visibleT.length - 1));
    setCursor({ t: geo.visibleT[idx], v: geo.visibleS[idx] });
  };

  const btn = 'rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-[11px] text-slate-300 hover:bg-slate-800 cursor-pointer';
  return (
    <div className='rounded-lg border border-slate-800 bg-slate-950 p-2'>
      <div className='mb-1 flex flex-wrap items-center justify-between gap-2'>
        <div className='text-xs font-medium text-slate-300'>{title}</div>
        <div className='flex items-center gap-1'>
          <button type='button' className={btn} onClick={() => setView(([a, b]) => zoomWindow(a, b, 0.5))}>放大</button>
          <button type='button' className={btn} onClick={() => setView(([a, b]) => zoomWindow(a, b, 2))}>缩小</button>
          <button type='button' className={btn} onClick={() => setView(([a, b]) => panWindow(a, b, -0.25))}>←</button>
          <button type='button' className={btn} onClick={() => setView(([a, b]) => panWindow(a, b, 0.25))}>→</button>
          <button type='button' className={btn} onClick={() => setView([0, 1])}>全部</button>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className='w-full' role='img' aria-label={title || '示波器波形'} onMouseMove={onMove} onMouseLeave={() => setCursor(null)}>
        <rect x={ML} y={MT} width={pw} height={ph} fill='#020617' stroke='#1e293b' />
        {yTicks.map((v) => (
          <g key={`y${v}`}>
            <line x1={ML} x2={ML + pw} y1={Y(v)} y2={Y(v)} stroke='#1e293b' strokeWidth={1} />
            <text x={ML - 6} y={Y(v) + 3} textAnchor='end' fontSize={10} fill='#94a3b8'>{Number(v.toPrecision(4))}</text>
          </g>
        ))}
        {xTicks.map((t) => (
          <g key={`x${t}`}>
            <line x1={X(t)} x2={X(t)} y1={MT} y2={MT + ph} stroke='#0f172a' strokeWidth={1} />
            <text x={X(t)} y={H - 8} textAnchor='middle' fontSize={10} fill='#94a3b8'>{formatSeconds(t)}</text>
          </g>
        ))}
        {visibleMarkers.filter((m) => m.kind === 'baseline').map((m, i) => (
          <g key={`b${i}`}>
            <line x1={ML} x2={ML + pw} y1={Y(m.v)} y2={Y(m.v)} stroke={KIND_COLOR.baseline} strokeDasharray='4 3' strokeWidth={1} />
            <text x={ML + pw - 4} y={Y(m.v) - 3} textAnchor='end' fontSize={10} fill={KIND_COLOR.baseline}>{m.label}</text>
          </g>
        ))}
        <path d={path} fill='none' stroke={color} strokeWidth={1.2} />
        {visibleMarkers.filter((m) => m.kind !== 'baseline').map((m, i) => (
          <g key={`m${i}`}>
            <circle cx={X(m.t)} cy={Y(m.v)} r={3.5} fill='none' stroke={KIND_COLOR[m.kind]} strokeWidth={1.6} />
            {m.label && <text x={Math.min(X(m.t) + 6, W - 120)} y={Y(m.v) + (i % 2 ? 12 : -6)} fontSize={10} fill={KIND_COLOR[m.kind]}>{m.label}</text>}
          </g>
        ))}
        {cursor && (
          <g>
            <line x1={X(cursor.t)} x2={X(cursor.t)} y1={MT} y2={MT + ph} stroke='#64748b' strokeDasharray='2 2' />
            <circle cx={X(cursor.t)} cy={Y(cursor.v)} r={2.5} fill='#e2e8f0' />
          </g>
        )}
      </svg>
      <div className='mt-1 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500'>
        <span>{cursor ? `光标：t=${formatSeconds(cursor.t)}，V=${Number(cursor.v.toPrecision(5))} V` : `共 ${n} 点 · 图上 ≤${maxPoints} 点（保尖峰降采样）`}</span>
        <span className='flex items-center gap-2'>
          <Legend c={KIND_COLOR.peak} t='峰值' /><Legend c={KIND_COLOR.baseline} t='基线' /><Legend c={KIND_COLOR.edge20} t='20/80%边沿' /><Legend c={KIND_COLOR.ring} t='振铃峰' />
        </span>
      </div>
    </div>
  );
};

const Legend: React.FC<{ c: string; t: string }> = ({ c, t }) => (
  <span className='inline-flex items-center gap-1'><span className='inline-block h-2 w-2 rounded-full border' style={{ borderColor: c }} />{t}</span>
);
