import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, BarChart3, Download, Maximize2, MousePointer2, ScanSearch, Upload, X, Zap } from 'lucide-react';
import { buildMeasurementsFromChannels, computeMetrics, parseScopeCsv, ParsedScope, ScopeRole } from '../utils/oscilloscopeImport';
import { addWaveforms, toStoredWaveform } from '../utils/waveformStorage';
import { computeSpectrum, formatEngineering, isUniformTime, nearestTimeIndex } from '../utils/waveformViewerCore';
import { MeasurementProvenance } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onApplyMeasured: (values: Record<string, number | string>, provenance: Record<string, MeasurementProvenance>) => void;
  showToast: (text: string, type?: 'success' | 'info' | 'error') => void;
  scenarioId?: string;
}

type ViewMode = 'waveform' | 'fft';

const ROLE_OPTIONS: ScopeRole[] = ['none', 'vbus', 'vgs', 'vds'];
const roleLabel: Record<ScopeRole, string> = { none: '不作为工程输入', vbus: 'Vbus', vgs: 'Vgs', vds: 'Vds' };

export const WaveformWorkbenchModal: React.FC<Props> = ({ isOpen, onClose, onApplyMeasured, showToast, scenarioId }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ x: number; start: number; end: number } | null>(null);
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState<ParsedScope | null>(null);
  const [channelIndex, setChannelIndex] = useState(0);
  const [mode, setMode] = useState<ViewMode>('waveform');
  const [startIndex, setStartIndex] = useState(0);
  const [endIndex, setEndIndex] = useState(0);
  const [cursor1, setCursor1] = useState<number | null>(null);
  const [cursor2, setCursor2] = useState<number | null>(null);
  const [cursorArmed, setCursorArmed] = useState(false);
  const [roles, setRoles] = useState<ScopeRole[]>([]);
  const [fftError, setFftError] = useState<string | null>(null);

  const activeChannel = parsed?.channels[channelIndex];
  const activeRole = roles[channelIndex];
  // WaveformChannel 只有 name/samples，本身不带单位。工程角色的三路（Vbus/Vgs/Vds）都是电压通道，
  // 因此按角色给 'V'；未映射为工程角色的通道不擅自显示单位。
  const activeUnit = activeRole === 'vbus' || activeRole === 'vgs' || activeRole === 'vds' ? 'V' : '';
  const metrics = useMemo(() => {
    if (!parsed || !activeChannel) return null;
    return computeMetrics(parsed.time, activeChannel.samples);
  }, [parsed, activeChannel]);

  useEffect(() => {
    if (!parsed) return;
    setEndIndex(parsed.time.length);
    setRoles(parsed.channels.map(() => 'none' as ScopeRole));
    setChannelIndex(0);
    setCursor1(null);
    setCursor2(null);
  }, [parsed]);

  const fit = useCallback(() => {
    if (!parsed) return;
    setStartIndex(0);
    setEndIndex(parsed.time.length);
  }, [parsed]);

  const parseFile = async (file: File) => {
    try {
      const text = await file.text();
      const parsedScope = parseScopeCsv(text);
      if (!parsedScope.ok || !parsedScope.data) throw new Error(parsedScope.error || '波形解析失败');
      setFileName(file.name);
      setParsed(parsedScope.data);
      setFftError(null);
      showToast(`已导入 ${file.name}：${parsedScope.data.rowCount.toLocaleString()} 点 / ${parsedScope.data.channels.length} 通道`, 'success');
    } catch (err: any) {
      showToast(err?.message || '波形文件解析失败', 'error');
    }
  };

  const applyEvidence = () => {
    if (!parsed || !fileName) return;
    const measurements = buildMeasurementsFromChannels(parsed, roles, fileName);
    const stored = measurements.reports.map((report) => toStoredWaveform(report, parsed, fileName, new Date().toISOString(), scenarioId));
    if (stored.length) addWaveforms(stored);
    if (!Object.keys(measurements.values).length) {
      showToast('请至少给一个通道指定 Vbus / Vgs / Vds 角色后再回填工程事实', 'info');
      return;
    }
    onApplyMeasured(measurements.values, measurements.provenance);
    showToast(`已将 ${Object.keys(measurements.values).length} 项实测值回填到当前工程，并保留波形证据`, 'success');
  };

  const exportVisibleCsv = () => {
    if (!parsed || !activeChannel) return;
    const lo = Math.max(0, Math.min(startIndex, parsed.time.length - 1));
    const hi = Math.max(lo + 1, Math.min(endIndex, parsed.time.length));
    const rows = ['time,channel'];
    for (let i = lo; i < hi; i++) rows.push(`${parsed.time[i]},${activeChannel.samples[i]}`);
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${fileName || 'waveform'}-${activeChannel.name}-view.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !parsed || !activeChannel) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = rect.width;
    const h = rect.height;
    const pad = { l: 64, r: 18, t: 22, b: 34 };
    const pw = Math.max(10, w - pad.l - pad.r);
    const ph = Math.max(10, h - pad.t - pad.b);

    ctx.fillStyle = '#0b1220';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#111a2b';
    ctx.fillRect(pad.l, pad.t, pw, ph);
    ctx.strokeStyle = '#26344a';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 10; i++) {
      const x = pad.l + (i / 10) * pw;
      ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, pad.t + ph); ctx.stroke();
    }
    for (let i = 0; i <= 8; i++) {
      const y = pad.t + (i / 8) * ph;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + pw, y); ctx.stroke();
    }

    if (mode === 'fft') {
      try {
        setFftError(null);
        const spectrum = computeSpectrum(Float64Array.from(parsed.time), Float32Array.from(activeChannel.samples), 'hann');
        let maxDb = -Infinity;
        for (let i = 1; i < spectrum.dbValues.length; i++) maxDb = Math.max(maxDb, spectrum.dbValues[i]);
        const yTop = Math.ceil(maxDb / 10) * 10 + 10;
        const yBottom = yTop - 120;
        const maxF = spectrum.frequencies[spectrum.frequencies.length - 1];
        ctx.strokeStyle = '#22d3ee';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < spectrum.frequencies.length; i++) {
          const x = pad.l + (spectrum.frequencies[i] / Math.max(maxF, 1)) * pw;
          const y = pad.t + ph - ((spectrum.dbValues[i] - yBottom) / (yTop - yBottom)) * ph;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.fillStyle = '#94a3b8';
        ctx.font = '11px ui-monospace, monospace';
        ctx.fillText(`FFT · Fs ${formatEngineering(spectrum.sampleRate, 'S/s')} · Δf ${formatEngineering(spectrum.resolution, 'Hz')}`, pad.l + 8, pad.t + 16);
        ctx.fillText(`${formatEngineering(maxF, 'Hz')}`, pad.l + pw - 90, pad.t + ph + 24);
      } catch (err: any) {
        setFftError(err?.message || 'FFT 失败');
      }
      return;
    }

    const lo = Math.max(0, Math.min(startIndex, parsed.time.length - 1));
    const hi = Math.max(lo + 1, Math.min(endIndex || parsed.time.length, parsed.time.length));
    const t0 = parsed.time[lo];
    const t1 = parsed.time[Math.max(lo, hi - 1)];
    const spanT = Math.max(1e-30, t1 - t0);
    let vLo = Infinity;
    let vHi = -Infinity;
    for (let i = lo; i < hi; i++) {
      const val = activeChannel.samples[i];
      if (!Number.isFinite(val)) continue;
      if (val < vLo) vLo = val;
      if (val > vHi) vHi = val;
    }
    if (!Number.isFinite(vLo) || !Number.isFinite(vHi)) { vLo = 0; vHi = 1; }
    const spanV = Math.max(1e-12, vHi - vLo);

    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    const pxBucketCount = Math.max(1, Math.floor(pw * 1.5));
    for (let px = 0; px < pxBucketCount; px++) {
      const a = lo + Math.floor((px / pxBucketCount) * (hi - lo));
      const b = Math.max(a + 1, lo + Math.floor(((px + 1) / pxBucketCount) * (hi - lo)));
      let minV = Infinity, maxV = -Infinity, minI = a, maxI = a;
      for (let i = a; i < Math.min(b, hi); i++) {
        const val = activeChannel.samples[i];
        if (!Number.isFinite(val)) continue;
        if (val < minV) { minV = val; minI = i; }
        if (val > maxV) { maxV = val; maxI = i; }
      }
      if (!Number.isFinite(minV)) continue;
      const ix = (i: number) => pad.l + ((parsed.time[i] - t0) / spanT) * pw;
      const iy = (v: number) => pad.t + ph - ((v - vLo) / spanV) * ph;
      const p1 = minI <= maxI ? minI : maxI;
      const p2 = minI <= maxI ? maxI : minI;
      const x = pad.l + (px / pxBucketCount) * pw;
      if (px === 0) ctx.moveTo(x, iy(activeChannel.samples[p1]));
      ctx.lineTo(ix(p1), iy(activeChannel.samples[p1]));
      ctx.lineTo(ix(p2), iy(activeChannel.samples[p2]));
    }
    ctx.stroke();

    if (metrics?.edge) {
      ctx.strokeStyle = '#f59e0b';
      ctx.setLineDash([4, 4]);
      for (const tt of [metrics.edge.t20, metrics.edge.t80]) {
        const x = pad.l + ((tt - t0) / spanT) * pw;
        ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, pad.t + ph); ctx.stroke();
      }
      ctx.setLineDash([]);
    }
    if (metrics?.baselineLevel !== undefined) {
      const y = pad.t + ph - ((metrics.baselineLevel - vLo) / spanV) * ph;
      ctx.strokeStyle = '#64748b'; ctx.setLineDash([6, 4]);
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + pw, y); ctx.stroke(); ctx.setLineDash([]);
    }

    const drawCursor = (tt: number | null, label: string) => {
      if (tt === null) return;
      const x = pad.l + ((tt - t0) / spanT) * pw;
      if (x < pad.l || x > pad.l + pw) return;
      ctx.strokeStyle = '#a78bfa'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, pad.t + ph); ctx.stroke();
      ctx.fillStyle = '#ddd6fe'; ctx.font = '10px ui-monospace, monospace'; ctx.fillText(`${label} ${formatEngineering(tt, 's')}`, Math.min(x + 4, pad.l + pw - 90), pad.t + 14);
    };
    drawCursor(cursor1, 'X1'); drawCursor(cursor2, 'X2');

    ctx.fillStyle = '#94a3b8'; ctx.font = '10px ui-monospace, monospace';
    ctx.fillText(formatEngineering(t0, 's'), pad.l, h - 9);
    ctx.fillText(formatEngineering(t1, 's'), pad.l + pw - 90, h - 9);
    ctx.fillText(formatEngineering(vHi, activeUnit), 6, pad.t + 9);
    ctx.fillText(formatEngineering(vLo, activeUnit), 6, pad.t + ph);
  }, [parsed, activeChannel, activeUnit, startIndex, endIndex, mode, metrics, cursor1, cursor2]);

  if (!isOpen) return null;

  const onWheel: React.WheelEventHandler<HTMLCanvasElement> = (e) => {
    if (!parsed || mode !== 'waveform') return;
    e.preventDefault();
    const span = Math.max(20, endIndex - startIndex);
    const center = startIndex + span * 0.5;
    const factor = e.deltaY > 0 ? 1.25 : 0.8;
    const nextSpan = Math.min(parsed.time.length, Math.max(20, Math.round(span * factor)));
    const nextStart = Math.max(0, Math.min(parsed.time.length - nextSpan, Math.round(center - nextSpan * 0.5)));
    setStartIndex(nextStart);
    setEndIndex(nextStart + nextSpan);
  };

  const onPointerDown: React.PointerEventHandler<HTMLCanvasElement> = (e) => {
    if (!parsed || mode !== 'waveform') return;
    dragRef.current = { x: e.clientX, start: startIndex, end: endIndex };
    (e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove: React.PointerEventHandler<HTMLCanvasElement> = (e) => {
    const d = dragRef.current;
    if (!d || !parsed) return;
    const width = e.currentTarget.getBoundingClientRect().width;
    const delta = Math.round(((e.clientX - d.x) / Math.max(1, width)) * (d.end - d.start));
    const span = d.end - d.start;
    const nextStart = Math.max(0, Math.min(parsed.time.length - span, d.start - delta));
    setStartIndex(nextStart); setEndIndex(nextStart + span);
  };
  const onPointerUp: React.PointerEventHandler<HTMLCanvasElement> = () => { dragRef.current = null; };

  const armCursor = () => {
    setCursorArmed((v) => !v);
    if (!cursorArmed) showToast('游标已启用：在波形上点击两次设置 X1 / X2', 'info');
  };
  const onClickCanvas: React.MouseEventHandler<HTMLCanvasElement> = (e) => {
    if (!cursorArmed || !parsed || mode !== 'waveform') return;
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const idx = Math.round(startIndex + frac * (endIndex - startIndex - 1));
    const t = parsed.time[Math.max(0, Math.min(parsed.time.length - 1, idx))];
    if (cursor1 === null || cursor2 !== null) { setCursor1(t); setCursor2(null); }
    else setCursor2(t);
  };

  const uniform = parsed ? isUniformTime(Float64Array.from(parsed.time)) : true;
  const sourceInfo = parsed ? `${parsed.rowCount.toLocaleString()} 点 · ${parsed.channels.length} 通道 · ${uniform ? '均匀时间轴' : '自适应时间轴 / FFT 前自动重采样'}` : '等待导入波形';

  return (
    <div className="fixed inset-0 z-[80] bg-black/80 backdrop-blur-sm p-2 sm:p-4">
      <div className="h-full w-full overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl flex flex-col">
        <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center"><Activity className="w-5 h-5 text-amber-300" /></div>
            <div className="min-w-0"><div className="font-semibold text-white text-sm">波形分析工作台</div><div className="text-[10px] text-slate-400 truncate">WAVE-Test 核心能力 · 真实 t[] 时间轴 · FFT 分析 · 工程证据回填</div></div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <label className="cursor-pointer rounded-md border border-blue-700/50 bg-blue-950/30 px-2.5 py-1.5 text-[11px] text-blue-300 hover:bg-blue-900/30 flex items-center gap-1.5"><Upload className="w-3.5 h-3.5" /> 导入 CSV/TXT<input type="file" accept=".csv,.txt" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void parseFile(f); e.currentTarget.value = ''; }} /></label>
            <button type="button" onClick={fit} disabled={!parsed} className="rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-[11px] text-slate-300 hover:text-white disabled:opacity-40 flex items-center gap-1.5"><Maximize2 className="w-3.5 h-3.5" /> Fit</button>
            <button type="button" onClick={armCursor} disabled={!parsed || mode !== 'waveform'} className={`rounded-md border px-2.5 py-1.5 text-[11px] flex items-center gap-1.5 ${cursorArmed ? 'border-violet-500/60 bg-violet-950/30 text-violet-200' : 'border-slate-700 bg-slate-900 text-slate-300'} disabled:opacity-40`}><MousePointer2 className="w-3.5 h-3.5" /> Cursor</button>
            <button type="button" onClick={exportVisibleCsv} disabled={!parsed} className="rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-[11px] text-slate-300 hover:text-white disabled:opacity-40"><Download className="w-3.5 h-3.5" /></button>
            <button type="button" onClick={onClose} className="rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-slate-300 hover:text-white"><X className="w-4 h-4" /></button>
          </div>
        </div>

        <div className="px-4 py-2 border-b border-slate-800 bg-slate-950 flex items-center gap-2 overflow-x-auto shrink-0">
          <button type="button" onClick={() => setMode('waveform')} className={`px-3 py-1.5 rounded-md text-[11px] font-medium ${mode === 'waveform' ? 'bg-blue-600/25 text-blue-300 border border-blue-500/40' : 'text-slate-400 hover:bg-slate-900'}`}><ScanSearch className="inline w-3.5 h-3.5 mr-1" /> Waveform</button>
          <button type="button" onClick={() => setMode('fft')} className={`px-3 py-1.5 rounded-md text-[11px] font-medium ${mode === 'fft' ? 'bg-amber-600/20 text-amber-300 border border-amber-500/40' : 'text-slate-400 hover:bg-slate-900'}`}><BarChart3 className="inline w-3.5 h-3.5 mr-1" /> Spectrum / FFT</button>
          <div className="h-5 w-px bg-slate-800" />
          <span className="text-[10px] text-slate-400 truncate">{fileName || '未导入'} · {sourceInfo}</span>
          {mode === 'waveform' && <span className="ml-auto text-[10px] text-slate-500 hidden md:inline">滚轮缩放 · 拖拽平移 · Cursor 点击两点</span>}
        </div>

        <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
          <aside className="lg:w-72 xl:w-80 border-b lg:border-b-0 lg:border-r border-slate-800 overflow-y-auto shrink-0 bg-slate-950/80">
            <div className="p-3 border-b border-slate-800"><div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">Channels</div>{parsed ? parsed.channels.map((ch, i) => <button key={`${ch.name}-${i}`} type="button" onClick={() => setChannelIndex(i)} className={`w-full text-left rounded-md px-2.5 py-2 text-[11px] mb-1 flex items-center justify-between ${i === channelIndex ? 'bg-blue-600/15 border border-blue-500/30 text-blue-200' : 'bg-slate-900/60 border border-slate-800 text-slate-300 hover:bg-slate-900'}`}><span className="truncate">CH{i + 1} · {ch.name}</span><span className="text-[9px] text-slate-500">{roles[i] && roleLabel[roles[i]]}</span></button>) : <div className="text-[11px] text-slate-500">导入后显示通道。</div>}</div>
            <div className="p-3 border-b border-slate-800"><div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">Engineering Role Mapping</div>{parsed?.channels.map((ch, i) => <div key={`role-${i}`} className="flex items-center gap-2 mb-1.5"><span className="w-8 text-[10px] text-slate-500">CH{i + 1}</span><select value={roles[i] || 'none'} onChange={(e) => setRoles((prev) => prev.map((r, j) => j === i ? e.target.value as ScopeRole : r))} className="flex-1 bg-slate-900 border border-slate-700 rounded-md px-2 py-1.5 text-[10px] text-slate-200"><option value="none">{roleLabel.none}</option><option value="vbus">Vbus · 母线</option><option value="vgs">Vgs · 栅极</option><option value="vds">Vds · 漏源</option></select></div>)}{parsed && <button type="button" onClick={applyEvidence} className="mt-2 w-full rounded-md border border-emerald-700/50 bg-emerald-950/30 px-3 py-2 text-[11px] font-semibold text-emerald-300 hover:bg-emerald-900/30">保存为工程实测证据</button>}</div>
            <div className="p-3"><div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">Current Measurements</div>{metrics ? <div className="grid grid-cols-2 gap-1.5 text-[10px] font-mono"><div className="rounded border border-slate-800 bg-slate-900 p-2"><span className="text-slate-500">Peak</span><div className="text-white">{formatEngineering(metrics.peak, activeUnit)}</div></div><div className="rounded border border-slate-800 bg-slate-900 p-2"><span className="text-slate-500">Vpp</span><div className="text-white">{formatEngineering(metrics.peakToPeak, activeUnit)}</div></div><div className="rounded border border-slate-800 bg-slate-900 p-2"><span className="text-slate-500">dv/dt</span><div className="text-amber-300">{formatEngineering(metrics.dvDtMaxVns, 'V/ns')}</div></div><div className="rounded border border-slate-800 bg-slate-900 p-2"><span className="text-slate-500">Ringing</span><div className="text-white">{metrics.ringingHz ? formatEngineering(metrics.ringingHz, 'Hz') : 'none'}</div></div><div className="col-span-2 rounded border border-slate-800 bg-slate-900 p-2"><span className="text-slate-500">Baseline</span><div className="text-white">{metrics.baselineLevel !== undefined ? formatEngineering(metrics.baselineLevel, activeUnit) : '—'}</div></div></div> : <div className="text-[11px] text-slate-500">等待波形。</div>}</div>
          </aside>

          <section className="flex-1 min-w-0 min-h-[320px] flex flex-col">
            <div className="flex-1 min-h-0 relative p-1">
              <canvas ref={canvasRef} className="absolute inset-1 w-[calc(100%-8px)] h-[calc(100%-8px)] touch-none cursor-crosshair rounded-lg" onWheel={onWheel} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onClick={onClickCanvas} />
              {!parsed && <div className="absolute inset-0 flex items-center justify-center pointer-events-none"><div className="text-center text-slate-500"><Zap className="w-8 h-8 mx-auto mb-2 opacity-40" /><div className="text-sm">导入示波器 / PSIM / LTspice CSV</div><div className="text-[10px] mt-1">波形会直接使用文件真实时间轴，FFT 分析前才进行线性重采样。</div></div></div>}
              {fftError && <div className="absolute left-4 bottom-4 right-4 rounded-md border border-red-700/40 bg-red-950/70 p-2 text-[10px] text-red-300">{fftError}</div>}
            </div>
            <div className="h-9 shrink-0 border-t border-slate-800 px-3 flex items-center justify-between text-[10px] text-slate-500 font-mono"><span>{activeChannel ? `${activeChannel.name} · ${activeChannel.samples.length.toLocaleString()} samples` : 'No waveform'}</span><span>{cursor1 !== null && cursor2 !== null ? `Δt = ${formatEngineering(Math.abs(cursor2 - cursor1), 's')}` : '—'}</span></div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default WaveformWorkbenchModal;
