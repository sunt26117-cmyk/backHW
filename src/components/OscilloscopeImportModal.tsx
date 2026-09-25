import React, { useState, useRef, useMemo } from 'react';
import { X, Upload, Activity, AlertTriangle, CheckCircle2, FileText } from 'lucide-react';
import { parseScopeCsv, computeMetrics, buildMarkers, buildMeasurementsFromChannels, ParsedScope, ScopeRole } from '../utils/oscilloscopeImport';
import { addWaveforms, toStoredWaveform } from '../utils/waveformStorage';
import { WaveformPlot } from './WaveformPlot';
import { MeasurementProvenance } from '../types';

interface OscilloscopeImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyMeasured: (values: Record<string, number | string>, provenance: Record<string, MeasurementProvenance>) => void;
  showToast?: (text: string, type: 'success' | 'info' | 'error') => void;
  /** 当前工况 id：用于把导入的波形留存到该工况下，导入后可回看。 */
  scenarioId?: string;
}

type Role = ScopeRole;

const ROLE_LABELS: Record<Role, string> = { none: '不导入', vbus: 'Vbus 母线', vgs: 'Vgs 门极', vds: 'Vds 漏源' };

export const OscilloscopeImportModal: React.FC<OscilloscopeImportModalProps> = ({ isOpen, onClose, onApplyMeasured, showToast, scenarioId }) => {
  const [parsed, setParsed] = useState<ParsedScope | null>(null);
  const [fileName, setFileName] = useState('');
  const [roles, setRoles] = useState<Role[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [imported, setImported] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [viewIdx, setViewIdx] = useState(0);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  // 指标只在解析结果变化时算一次（波形可能有几十万点，不能每次渲染都重算）
  const metricsList = useMemo(
    () => (parsed ? parsed.channels.map((ch) => computeMetrics(parsed.time, ch.samples)) : []),
    [parsed],
  );

  if (!isOpen) return null;

  const handleFile = async (file: File) => {
    setError(null);
    setImported(null);
    setFileName(file.name);
    const text = await file.text();
    const r = parseScopeCsv(text);
    if (!r.ok || !r.data) {
      setError(r.error || '解析失败');
      setParsed(null);
      return;
    }
    setParsed(r.data);
    setRoles(r.data.channels.map(() => 'none' as Role));
    setViewIdx(0);
    setImportWarnings([]);
  };

  const setRole = (idx: number, role: Role) => {
    setRoles((prev) => {
      const next = [...prev];
      if (role !== 'none') {
        // 同一种角色只能映射到一个通道，先清掉其它通道的相同角色
        for (let i = 0; i < next.length; i++) {
          if (i !== idx && next[i] === role) next[i] = 'none';
        }
      }
      next[idx] = role;
      return next;
    });
  };

  const handleImport = () => {
    if (!parsed) return;
    const nowIso = new Date().toISOString();
    const res = buildMeasurementsFromChannels(parsed, roles, fileName, nowIso);
    if (res.count === 0) { showToast?.('请至少为一个通道选择角色', 'info'); return; }
    onApplyMeasured(res.values, res.provenance);
    // 波形本体（降采样）+ 指标标记留存到本地，导入后可在“依据审计”页回看
    addWaveforms(res.reports.map((r) => toStoredWaveform(r, parsed, fileName, nowIso, scenarioId)));
    setImportWarnings(res.warnings);
    setImported('已导入 ' + res.count + ' 个通道：' + Object.keys(res.values).join('、') + '（波形已留存，可回看）');
    showToast?.('示波器数据已导入实测数据', 'success');
  };

  return (
    <div className='fixed inset-0 z-50 flex items-start justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto'>
      <div className='mt-6 w-full max-w-3xl rounded-2xl border border-slate-700 bg-slate-900 text-slate-100 shadow-2xl'>
        <div className='flex items-center justify-between border-b border-slate-800 px-5 py-4'>
          <div className='flex items-center gap-2'>
            <Activity className='h-5 w-5 text-amber-400' />
            <h2 className='text-base font-semibold'>示波器 CSV 导入</h2>
          </div>
          <button onClick={onClose} className='rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200 cursor-pointer'>
            <X className='h-4 w-4' />
          </button>
        </div>

        <div className='px-5 py-4 space-y-4'>
          <section>
            <input ref={fileRef} type='file' accept='.csv,.txt' className='hidden' onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
            <button onClick={() => fileRef.current?.click()} className='flex items-center gap-2 rounded-lg border border-dashed border-slate-600 bg-slate-950 px-4 py-6 w-full justify-center text-slate-300 hover:border-amber-500/50 hover:text-amber-300 cursor-pointer'>
              <Upload className='h-5 w-5' /> 选择示波器导出的 CSV（含时间 + 电压通道列）
            </button>
            {fileName && <div className='mt-1.5 flex items-center gap-1.5 text-xs text-slate-400'><FileText className='h-3.5 w-3.5' /> {fileName}</div>}
          </section>

          {error && (
            <div className='flex items-start gap-1.5 rounded-lg border border-red-500/40 bg-red-950/30 px-3 py-2 text-xs text-red-300'>
              <AlertTriangle className='h-3.5 w-3.5 shrink-0 mt-0.5' /> {error}
            </div>
          )}

          {parsed && (
            <section>
              <div className='text-xs text-slate-400 mb-2'>解析到 {parsed.channels.length} 个电压通道 · {parsed.rowCount} 行 · 采样率 {parsed.sampleRateHz >= 1000 ? (parsed.sampleRateHz / 1000).toFixed(1) + ' MHz' : parsed.sampleRateHz + ' Hz'}</div>
              <div className='rounded-lg border border-slate-800 overflow-hidden'>
                <table className='w-full text-xs'>
                  <thead className='bg-slate-800/60 text-slate-400'>
                    <tr>
                      <th className='text-left px-3 py-2 font-medium'>通道</th>
                      <th className='text-left px-3 py-2 font-medium'>峰值 (V)</th>
                      <th className='text-left px-3 py-2 font-medium'>谷值 (V)</th>
                      <th className='text-left px-3 py-2 font-medium'>dv/dt (V/ns)</th>
                      <th className='text-left px-3 py-2 font-medium'>振铃 (Hz)</th>
                      <th className='text-left px-3 py-2 font-medium'>映射角色</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.channels.map((ch, idx) => {
                      const m = metricsList[idx];
                      return (
                        <tr key={ch.name + idx} className='border-t border-slate-800'>
                          <td className='px-3 py-1.5 text-slate-200 font-medium'>{ch.name}</td>
                          <td className='px-3 py-1.5 text-amber-300'>{m.peak}</td>
                          <td className='px-3 py-1.5 text-slate-300'>{m.valley}</td>
                          <td className='px-3 py-1.5 text-cyan-300'>{m.dvDtMaxVns}<span className='ml-1 text-[10px] text-slate-500'>{m.dvDtMethod === 'EDGE_20_80' ? '20-80%' : '相邻点·仅供参考'}</span></td>
                          <td className='px-3 py-1.5 text-slate-300'>{m.ringingHz ?? '—'}</td>
                          <td className='px-3 py-1.5'>
                            <select value={roles[idx] || 'none'} onChange={(e) => setRole(idx, e.target.value as Role)} className='rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200 focus:outline-none cursor-pointer'>
                              {(Object.keys(ROLE_LABELS) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className='mt-3 space-y-2'>
                <div className='flex flex-wrap gap-1'>
                  {parsed.channels.map((ch, idx) => (
                    <button key={ch.name + idx} type='button' onClick={() => setViewIdx(idx)} className={'rounded border px-2 py-0.5 text-[11px] cursor-pointer ' + (idx === viewIdx ? 'border-amber-500 text-amber-300' : 'border-slate-700 text-slate-400')}>{ch.name}</button>
                  ))}
                </div>
                {parsed.channels[viewIdx] && metricsList[viewIdx] && (
                  <WaveformPlot
                    time={parsed.time}
                    samples={parsed.channels[viewIdx].samples}
                    markers={buildMarkers(parsed.time, parsed.channels[viewIdx].samples, metricsList[viewIdx])}
                    title={parsed.channels[viewIdx].name + ' · 指标取点标注'}
                  />
                )}
                {metricsList.some((m) => (m.warnings || []).length > 0) && (
                  <ul className='rounded-lg border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-[11px] text-amber-200 space-y-0.5'>
                    {parsed.channels.flatMap((ch, idx) => (metricsList[idx].warnings || []).map((w, k) => <li key={idx + '-' + k}>⚠ {ch.name}：{w}</li>))}
                  </ul>
                )}
              </div>
              <button onClick={handleImport} className='mt-3 flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-2 text-xs font-medium text-white hover:bg-amber-500 cursor-pointer'>
                <CheckCircle2 className='h-3.5 w-3.5' /> 导入到实测数据
              </button>
              {importWarnings.length > 0 && (
                <ul className='mt-2 rounded-lg border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-[11px] text-amber-200 space-y-0.5'>
                  {importWarnings.map((w, i) => <li key={i}>⚠ {w}</li>)}
                </ul>
              )}
              {imported && (
                <div className='mt-2 flex items-start gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-950/30 px-3 py-2 text-xs text-emerald-300'>
                  <CheckCircle2 className='h-3.5 w-3.5 shrink-0 mt-0.5' /> {imported}
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
};

