import React, { useState, useRef } from 'react';
import { X, Upload, Activity, AlertTriangle, CheckCircle2, FileText } from 'lucide-react';
import { parseScopeCsv, computeMetrics, ParsedScope } from '../utils/oscilloscopeImport';
import { MeasurementProvenance } from '../types';

interface OscilloscopeImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyMeasured: (values: Record<string, number | string>, provenance: Record<string, MeasurementProvenance>) => void;
  showToast?: (text: string, type: 'success' | 'info' | 'error') => void;
}

type Role = 'none' | 'vbus' | 'vgs' | 'vds';

const ROLE_LABELS: Record<Role, string> = { none: '不导入', vbus: 'Vbus 母线', vgs: 'Vgs 门极', vds: 'Vds 漏源' };

export const OscilloscopeImportModal: React.FC<OscilloscopeImportModalProps> = ({ isOpen, onClose, onApplyMeasured, showToast }) => {
  const [parsed, setParsed] = useState<ParsedScope | null>(null);
  const [fileName, setFileName] = useState('');
  const [roles, setRoles] = useState<Role[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [imported, setImported] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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
    const values: Record<string, number | string> = {};
    const provenance: Record<string, MeasurementProvenance> = {};
    let count = 0;
    parsed.channels.forEach((ch, idx) => {
      const role = roles[idx];
      if (!role || role === 'none') return;
      const m = computeMetrics(parsed.time, ch.samples);
      const srcLabel = fileName + ' · ' + ch.name + ' · ' + ROLE_LABELS[role];
      if (role === 'vbus') {
        values.busVoltagePeakV = m.peak;
        values.busVoltageNominalV = m.valley;
        provenance.busVoltagePeakV = { source: 'IMPORTED', sourceLabel: srcLabel, enteredAt: new Date().toISOString(), confidencePct: 90 };
        provenance.busVoltageNominalV = { source: 'IMPORTED', sourceLabel: srcLabel, enteredAt: new Date().toISOString(), confidencePct: 90 };
        count++;
      } else if (role === 'vgs') {
        values.gateSpikeV = m.peak;
        provenance.gateSpikeV = { source: 'IMPORTED', sourceLabel: srcLabel, enteredAt: new Date().toISOString(), confidencePct: 90 };
        count++;
      } else if (role === 'vds') {
        values.dvdtVns = m.dvDtMaxVns;
        values.busVoltagePeakV = m.peak;
        provenance.dvdtVns = { source: 'IMPORTED', sourceLabel: srcLabel, enteredAt: new Date().toISOString(), confidencePct: 90 };
        provenance.busVoltagePeakV = { source: 'IMPORTED', sourceLabel: srcLabel, enteredAt: new Date().toISOString(), confidencePct: 90 };
        count++;
      }
    });
    if (count === 0) { showToast?.('请至少为一个通道选择角色', 'info'); return; }
    onApplyMeasured(values, provenance);
    setImported('已导入 ' + count + ' 个通道的波形指标（峰值/dv/dt/振铃频率）到实测数据');
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
                      const m = computeMetrics(parsed.time, ch.samples);
                      return (
                        <tr key={ch.name + idx} className='border-t border-slate-800'>
                          <td className='px-3 py-1.5 text-slate-200 font-medium'>{ch.name}</td>
                          <td className='px-3 py-1.5 text-amber-300'>{m.peak}</td>
                          <td className='px-3 py-1.5 text-slate-300'>{m.valley}</td>
                          <td className='px-3 py-1.5 text-cyan-300'>{m.dvDtMaxVns}</td>
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
              <button onClick={handleImport} className='mt-3 flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-2 text-xs font-medium text-white hover:bg-amber-500 cursor-pointer'>
                <CheckCircle2 className='h-3.5 w-3.5' /> 导入到实测数据
              </button>
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

