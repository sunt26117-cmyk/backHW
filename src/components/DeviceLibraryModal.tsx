import React, { useState } from 'react';
import { X, Copy, Database, Trash2, AlertTriangle, CheckCircle2, FileText, Check, Upload, Info } from 'lucide-react';
import { DEVICE_PARAM_PROMPT, MOSFET_TEMPLATE_JSON, DEVICE_FIELD_MEANINGS } from '../data/deviceTemplate';
import { loadDevices, saveDevice, deleteDevice, importDeviceFromJson, DeviceEntry } from '../utils/deviceLibrary';
import { buildDeviceParameterCandidates, DeviceParameterCandidate, getCandidateSummary } from '../utils/deviceParameterCandidates';
import { IssueInput, MeasurementSource } from '../types';
import { getDomainMeasurementFields } from '../utils/scenarioDomainEngine';

interface DeviceLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  showToast?: (text: string, type: 'success' | 'info' | 'error') => void;
  onSelectDevice?: (deviceId: string) => void;
  issue?: IssueInput;
  onApplyToIssue?: (values: Record<string, number | string>, provenance: Record<string, { source: MeasurementSource; sourceLabel?: string; enteredAt?: string; confidencePct?: number; note?: string }>) => void;
}

export const DeviceLibraryModal: React.FC<DeviceLibraryModalProps> = ({ isOpen, onClose, showToast, onSelectDevice, issue, onApplyToIssue }) => {
  const [devices, setDevices] = useState<DeviceEntry[]>(() => loadDevices());
  const [importText, setImportText] = useState('');
  const [importResult, setImportResult] = useState<{ ok?: string; warnings: string[]; error?: string } | null>(null);
  const [candidateDeviceId, setCandidateDeviceId] = useState<string | null>(null);
  const [selectedCandidates, setSelectedCandidates] = useState<string[]>([]);
  const candidateDevice = devices.find(d => d.id === candidateDeviceId) || null;
  const allCandidates = candidateDevice ? buildDeviceParameterCandidates(candidateDevice) : [];
  const currentFieldKeys = new Set((issue ? getDomainMeasurementFields(issue) : []).map(f => f.key));
  const candidates = allCandidates.map(c => ({ ...c, importable: c.importable && currentFieldKeys.has(c.targetKey) }));

  if (!isOpen) return null;

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast?.(label + '已复制到剪贴板', 'success');
    } catch {
      showToast?.('复制失败，请手动选择复制', 'error');
    }
  };

  const handleImport = () => {
    const r = importDeviceFromJson(importText);
    if (r.error) {
      setImportResult({ error: r.error, warnings: [] });
      return;
    }
    if (r.device) {
      setDevices(saveDevice(r.device));
      setImportResult({ ok: '已导入器件：' + r.device.partNumber, warnings: r.warnings || [] });
      setImportText('');
    }
  };

  return (
    <div className='fixed inset-0 z-50 flex items-start justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto'>
      <div className='mt-6 w-full max-w-3xl rounded-2xl border border-slate-700 bg-slate-900 text-slate-100 shadow-2xl'>
        <div className='flex items-center justify-between border-b border-slate-800 px-5 py-4'>
          <div className='flex items-center gap-2'>
            <Database className='h-5 w-5 text-blue-400' />
            <h2 className='text-base font-semibold'>车规器件库 · 参数提取模板</h2>
          </div>
          <button onClick={onClose} className='rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200 cursor-pointer'>
            <X className='h-4 w-4' />
          </button>
        </div>

        <div className='px-5 py-4 space-y-5'>
          {/* 1. 模板调用 */}
          <section>
            <div className='flex items-center justify-between mb-2'>
              <h3 className='text-sm font-semibold text-blue-300'>1 · 参数提取模板（贴给免费 AI）</h3>
              <div className='flex gap-2'>
                <button onClick={() => copy(DEVICE_PARAM_PROMPT, '提取指令')} className='flex items-center gap-1 rounded-lg border border-blue-500/40 bg-blue-600/20 px-2.5 py-1.5 text-xs font-medium text-blue-300 hover:bg-blue-600/30 cursor-pointer'>
                  <Copy className='h-3.5 w-3.5' /> 复制指令
                </button>
                <button onClick={() => copy(MOSFET_TEMPLATE_JSON, 'JSON 模板')} className='flex items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-600/20 px-2.5 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-600/30 cursor-pointer'>
                  <Copy className='h-3.5 w-3.5' /> 复制 JSON 模板
                </button>
              </div>
            </div>
            <div className='rounded-lg border border-slate-800 bg-slate-950 p-3 max-h-48 overflow-y-auto'>
              <pre className='text-[11px] leading-relaxed text-slate-300 whitespace-pre-wrap font-mono'>{MOSFET_TEMPLATE_JSON}</pre>
            </div>
          </section>

          {/* 2. 字段说明 */}
          <section>
            <h3 className='text-sm font-semibold text-blue-300 mb-2'>2 · 字段 → 物理引擎对应</h3>
            <div className='rounded-lg border border-slate-800 overflow-hidden'>
              <table className='w-full text-xs'>
                <thead className='bg-slate-800/60 text-slate-400'>
                  <tr><th className='text-left px-3 py-2 font-medium'>JSON 字段</th><th className='text-left px-3 py-2 font-medium'>喂给哪个判断</th></tr>
                </thead>
                <tbody>
                  {DEVICE_FIELD_MEANINGS.map((m) => (
                    <tr key={m.field} className='border-t border-slate-800'>
                      <td className='px-3 py-1.5 text-blue-200 font-mono'>{m.field}</td>
                      <td className='px-3 py-1.5 text-slate-300'>{m.engine}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* 3. 导入 */}
          <section>
            <h3 className='text-sm font-semibold text-blue-300 mb-2'>3 · 导入 AI 输出的器件 JSON</h3>
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder='把免费 AI 填好的 JSON 粘贴到这里，点导入即可存入器件库'
              className='w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-xs text-slate-200 font-mono min-h-[120px] focus:outline-none focus:border-blue-500/60'
            />
            <button onClick={handleImport} className='mt-2 flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-500 cursor-pointer'>
              <FileText className='h-3.5 w-3.5' /> 导入并保存到器件库
            </button>
            {importResult?.error && (
              <div className='mt-2 flex items-start gap-1.5 rounded-lg border border-red-500/40 bg-red-950/30 px-3 py-2 text-xs text-red-300'>
                <AlertTriangle className='h-3.5 w-3.5 shrink-0 mt-0.5' /> {importResult.error}
              </div>
            )}
            {importResult?.ok && (
              <div className='mt-2 space-y-1'>
                <div className='flex items-start gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-950/30 px-3 py-2 text-xs text-emerald-300'>
                  <CheckCircle2 className='h-3.5 w-3.5 shrink-0 mt-0.5' /> {importResult.ok}
                </div>
                {importResult.warnings.length > 0 && (
                  <div className='rounded-lg border border-amber-500/40 bg-amber-950/30 px-3 py-2 text-xs text-amber-300'>
                    <div className='font-semibold mb-1'>完整性提醒（请补数据）：</div>
                    {importResult.warnings.map((w, i) => <div key={i}>· {w}</div>)}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* 4. 候选参数 → 当前工程输入 */}
          <section>
            <div className='flex items-center justify-between mb-2'>
              <div>
                <h3 className='text-sm font-semibold text-blue-300'>4 · 资料参数候选 → 当前工程输入</h3>
                <div className='text-[10px] text-slate-500 mt-0.5'>AI 只负责提取；这里由工程师选择是否写入。已有工程输入不会被覆盖。</div>
              </div>
              {candidateDevice && <span className='text-[10px] text-slate-500'>{getCandidateSummary(allCandidates).total} 项候选</span>}
            </div>
            {!candidateDevice ? (
              <div className='rounded-lg border border-dashed border-slate-700 px-4 py-5 text-center text-xs text-slate-500'>先在下面选择一个器件，查看它能映射到当前工程的参数。</div>
            ) : (
              <div className='space-y-2'>
                <div className='flex flex-wrap items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2'>
                  <span className='text-xs font-semibold text-slate-200'>{candidateDevice.partNumber}</span>
                  <span className='text-[10px] text-slate-500'>当前工程域：{issue ? issue.issueCategories.join(' / ') || '未分类' : '未提供工程'}</span>
                  <button type='button' onClick={() => setSelectedCandidates(candidates.filter(c => c.importable && c.confidence >= 0.9).map(c => c.id))} className='ml-auto text-[10px] text-blue-300 hover:text-white cursor-pointer'>选高置信度</button>
                  <button type='button' onClick={() => setSelectedCandidates([])} className='text-[10px] text-slate-400 hover:text-white cursor-pointer'>清空</button>
                </div>
                <div className='rounded-lg border border-slate-800 overflow-hidden max-h-72 overflow-y-auto'>
                  {candidates.length === 0 ? <div className='px-4 py-5 text-center text-xs text-slate-500'>没有可直接映射到当前工程字段的候选。器件原始数据仍已完整保存在器件库。</div> : candidates.map(c => {
                    const checked = selectedCandidates.includes(c.id);
                    return <label key={c.id} className={`flex items-center gap-2 px-3 py-2 border-b border-slate-800/80 cursor-pointer ${!c.importable ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-800/40'}`}>
                      <input type='checkbox' checked={checked} disabled={!c.importable} onChange={() => setSelectedCandidates(prev => checked ? prev.filter(id => id !== c.id) : [...prev, c.id])} className='accent-blue-500' />
                      <div className='min-w-0 flex-1'><div className='text-xs text-slate-200'>{c.label} <span className='text-[10px] text-slate-500'>→ {c.targetKey}</span></div><div className='text-[9px] text-slate-500 truncate'>{c.value} {c.unit || ''} · {c.sourceRef || '未定位'} · {c.sourceType}</div></div>
                      <span className={`text-[9px] font-mono ${c.confidence >= 0.9 ? 'text-emerald-400' : 'text-amber-300'}`}>{Math.round(c.confidence*100)}%</span>
                    </label>;
                  })}
                </div>
                <div className='flex flex-col md:flex-row md:items-center gap-2'>
                  <button type='button' disabled={!selectedCandidates.length || !onApplyToIssue} onClick={() => {
                    const chosen = candidates.filter(c => selectedCandidates.includes(c.id) && c.importable);
                    const values: Record<string, number | string> = {};
                    const provenance: Record<string, any> = {};
                    const conflicts: string[] = [];
                    for (const c of chosen) {
                      const existing = issue?.measuredValues?.[c.targetKey];
                      if (existing !== undefined && existing !== null && existing !== '') { conflicts.push(c.label); continue; }
                      values[c.targetKey] = c.value;
                      provenance[c.targetKey] = { source: c.sourceType === 'DERIVED' ? 'DERIVED' : 'DATASHEET', sourceLabel: `${candidateDevice.partNumber} · ${c.sourceRef || 'datasheet'}`, enteredAt: new Date().toISOString(), confidencePct: Math.round(c.confidence * 100), note: c.note || c.evidence || '规格书参数候选，工程师已选择导入。' };
                    }
                    if (Object.keys(values).length) onApplyToIssue?.(values, provenance);
                    setSelectedCandidates([]);
                    showToast?.(`已导入 ${Object.keys(values).length} 项${conflicts.length ? `；${conflicts.length} 项因已有输入未覆盖` : ''}`, 'success');
                  }} className='inline-flex items-center gap-1.5 rounded-lg bg-blue-600 disabled:bg-slate-800 disabled:text-slate-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-500 cursor-pointer'><Upload className='w-3.5 h-3.5' />导入已选择到工程</button>
                  <div className='text-[9px] text-slate-500 flex items-center gap-1'><Info className='w-3 h-3' /> DATASHEET 只作为规格证据；DERIVED 保留为计算/推导来源。</div>
                </div>
              </div>
            )}
          </section>

          {/* 4. 已存器件 */}
          <section>
            <div className='flex items-center justify-between mb-2'>
              <h3 className='text-sm font-semibold text-blue-300'>4 · 已存器件（{devices.length}）</h3>
            </div>
            {devices.length === 0 ? (
              <div className='rounded-lg border border-dashed border-slate-700 px-4 py-6 text-center text-xs text-slate-500'>
                还没有器件。用上面的模板让免费 AI 提取参数，再粘贴导入即可。
              </div>
            ) : (
              <div className='space-y-1.5'>
                {devices.map((d) => (
                  <div key={d.id} className='flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2'>
                    <div className='min-w-0'>
                      <div className='text-sm font-medium text-slate-100'>{d.partNumber}</div>
                      <div className='text-[11px] text-slate-400'>{d.deviceType} · {d.manufacturer} · {d.aecqGrade}</div>
                    </div>
                    <div className='flex items-center gap-1.5 shrink-0'>
                      <button onClick={() => { setCandidateDeviceId(d.id); setSelectedCandidates([]); }} className='rounded-lg border border-slate-600 bg-slate-800/70 px-2 py-1 text-[11px] font-medium text-slate-300 hover:bg-slate-700 cursor-pointer'>参数候选</button>
                      <button onClick={() => { onSelectDevice?.(d.id); showToast?.('已设为当前器件：' + d.partNumber + '（物理引擎将按工况插值读取其参数）', 'success'); }} className='rounded-lg border border-blue-500/40 bg-blue-600/20 px-2 py-1 text-[11px] font-medium text-blue-300 hover:bg-blue-600/30 cursor-pointer'>设为当前</button>
                      <button onClick={() => setDevices(deleteDevice(d.id))} className='rounded-lg p-1.5 text-slate-500 hover:bg-red-950/40 hover:text-red-300 cursor-pointer'>
                        <Trash2 className='h-4 w-4' />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

