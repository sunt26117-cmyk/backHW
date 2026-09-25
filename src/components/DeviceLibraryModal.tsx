import React, { useState } from 'react';
import { X, Copy, Database, Trash2, AlertTriangle, CheckCircle2, FileText, Check, Upload, Info } from 'lucide-react';
import { DEVICE_PARAM_PROMPT, MOSFET_TEMPLATE_JSON, DEVICE_FIELD_MEANINGS } from '../data/deviceTemplate';
import {
  loadDevices,
  saveDevice,
  deleteDevice,
  importDeviceFromJson,
  updateDeviceCandidateDecision,
  clearDeviceCandidateDecision,
  requestDeviceCandidateParameter,
  applyCandidateDecisions,
  DeviceEntry,
} from '../utils/deviceLibrary';
import {
  buildDeviceParameterCandidates,
  DeviceParameterCandidate,
  getCandidateSummary,
  getMosfetMappingOptions,
} from '../utils/deviceParameterCandidates';
import { buildDeviceCandidateImportPayload } from '../utils/deviceCandidateImport';
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

const formatConditions = (conditions?: Record<string, unknown>) => {
  if (!conditions) return '';
  const entries = Object.entries(conditions).filter(([, value]) => value !== null && value !== undefined && value !== '');
  return entries.length ? entries.map(([key, value]) => `${key}=${String(value)}`).join(' · ') : '';
};

export const DeviceLibraryModal: React.FC<DeviceLibraryModalProps> = ({ isOpen, onClose, showToast, onSelectDevice, issue, onApplyToIssue }) => {
  const [devices, setDevices] = useState<DeviceEntry[]>(() => loadDevices());
  const [importText, setImportText] = useState('');
  const [importResult, setImportResult] = useState<{ ok?: string; warnings: string[]; error?: string } | null>(null);
  const [candidateDeviceId, setCandidateDeviceId] = useState<string | null>(null);
  const [selectedCandidates, setSelectedCandidates] = useState<string[]>([]);
  const [showUnmapped, setShowUnmapped] = useState(true);
  const [showSkipped, setShowSkipped] = useState(false);
  const [mappingDrafts, setMappingDrafts] = useState<Record<string, string>>({});
  const candidateDevice = devices.find(d => d.id === candidateDeviceId) || null;
  const currentFields = issue ? getDomainMeasurementFields(issue) : [];
  const currentFieldKeys = new Set(currentFields.map(f => f.key));
  const baseCandidates = candidateDevice ? buildDeviceParameterCandidates(candidateDevice, currentFieldKeys) : [];
  const candidates = candidateDevice
    ? applyCandidateDecisions(baseCandidates, candidateDevice.candidateDecisions, currentFieldKeys)
    : [];
  const mappedCandidates = candidates.filter(c => c.mappingStatus === 'mapped' && c.importable);
  const unmappedCandidates = candidates.filter(c => c.mappingStatus !== 'mapped');
  const skippedCandidates = candidateDevice
    ? unmappedCandidates.filter(c => candidateDevice.candidateDecisions?.[c.rawPath]?.decision === 'skipped')
    : [];
  const visibleUnmappedCandidates = showSkipped
    ? unmappedCandidates
    : unmappedCandidates.filter(c => candidateDevice?.candidateDecisions?.[c.rawPath]?.decision !== 'skipped');

  const mappingOptions = (candidate: DeviceParameterCandidate) => getMosfetMappingOptions(candidate, currentFields);

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
      setCandidateDeviceId(r.device.id);
      setSelectedCandidates([]);
      setMappingDrafts({});
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
                <div className='text-[10px] text-slate-500 mt-0.5'>AI 只负责提取；工程师决定导入、跳过或人工映射。已有工程输入不会被覆盖。</div>
              </div>
              {candidateDevice && <span className='text-[10px] text-slate-500'>{getCandidateSummary(candidates).total} 项已提取候选</span>}
            </div>

            {!candidateDevice ? (
              <div className='rounded-lg border border-dashed border-slate-700 px-4 py-5 text-center text-xs text-slate-500'>先在下面选择一个器件，查看它能映射到当前工程的参数。</div>
            ) : (
              <div className='space-y-3'>
                <div className='flex flex-wrap items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2'>
                  <span className='text-xs font-semibold text-slate-200'>{candidateDevice.partNumber}</span>
                  <span className='text-[10px] text-slate-500'>当前工程域：{issue ? issue.issueCategories.join(' / ') || '未分类' : '未提供工程'}</span>
                  <span className='text-[10px] text-slate-500'>可导入 {mappedCandidates.length} · 未映射 {visibleUnmappedCandidates.length} · 待创建 {Object.keys(candidateDevice.candidateRequests || {}).length}</span>
                  <button
                    type='button'
                    onClick={() => setSelectedCandidates(mappedCandidates.filter(c => c.confidence >= 0.9).map(c => c.id))}
                    className='ml-auto text-[10px] text-blue-300 hover:text-white cursor-pointer'
                  >选高置信度</button>
                  <button type='button' onClick={() => setSelectedCandidates([])} className='text-[10px] text-slate-400 hover:text-white cursor-pointer'>清空</button>
                </div>

                <div>
                  <div className='text-[11px] font-semibold text-slate-300 mb-1'>可导入到当前工程</div>
                  <div className='rounded-lg border border-slate-800 overflow-hidden max-h-72 overflow-y-auto'>
                    {mappedCandidates.length === 0 ? (
                      <div className='px-4 py-5 text-center text-xs text-slate-500'>当前工程暂无可直接导入的候选；下面的“已提取但未映射”仍会完整列出。</div>
                    ) : mappedCandidates.map(c => {
                      const checked = selectedCandidates.includes(c.id);
                      return (
                        <label key={c.id} className='flex items-center gap-2 px-3 py-2 border-b border-slate-800/80 cursor-pointer hover:bg-slate-800/40'>
                          <input type='checkbox' checked={checked} onChange={() => setSelectedCandidates(prev => checked ? prev.filter(id => id !== c.id) : [...prev, c.id])} className='accent-blue-500' />
                          <div className='min-w-0 flex-1'>
                            <div className='text-xs text-slate-200 flex items-center gap-1.5'>
                              <span>{c.label} <span className='text-[10px] text-slate-500'>→ {c.targetKey}</span></span>
                              {candidateDevice.candidateDecisions?.[c.rawPath]?.decision === 'imported' && <span className='rounded px-1 py-0.5 text-[8px] bg-emerald-500/10 text-emerald-300'>上次已导入</span>}
                            </div>
                            <div className='text-[9px] text-slate-500 truncate'>{c.value} {c.unit || ''} · {c.sourceRef || '未定位'} · {c.sourceType}</div>
                            {formatConditions(c.conditions) && <div className='text-[9px] text-slate-500 truncate'>条件：{formatConditions(c.conditions)}</div>}
                          </div>
                          <span className={`text-[9px] font-mono ${c.confidence >= 0.9 ? 'text-emerald-400' : 'text-amber-300'}`}>{Math.round(c.confidence * 100)}%</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className='rounded-lg border border-amber-500/30 bg-amber-950/10'>
                  <button
                    type='button'
                    onClick={() => setShowUnmapped(v => !v)}
                    className='w-full flex items-center justify-between px-3 py-2 text-left cursor-pointer'
                  >
                    <span>
                      <span className='text-[11px] font-semibold text-amber-200'>已提取，但当前工程暂无对应输入项</span>
                      <span className='ml-2 text-[10px] text-slate-500'>{visibleUnmappedCandidates.length} 项</span>
                    </span>
                    <span className='text-[10px] text-slate-500'>{showUnmapped ? '收起' : '展开'}</span>
                  </button>

                  {showUnmapped && (
                    <div className='border-t border-amber-500/20'>
                      {visibleUnmappedCandidates.length === 0 ? (
                        <div className='px-3 py-4 text-xs text-slate-500'>没有新的未映射候选。</div>
                      ) : visibleUnmappedCandidates.map(c => {
                        const options = mappingOptions(c);
                        const decision = candidateDevice.candidateDecisions?.[c.rawPath];
                        return (
                          <div key={c.id} className='border-b border-slate-800/80 px-3 py-2.5'>
                            <div className='flex items-start gap-2'>
                              <div className='min-w-0 flex-1'>
                                <div className='text-xs text-slate-200'>{c.label}</div>
                                <div className='text-[9px] text-slate-500 mt-0.5'>{c.value} {c.unit || ''} · {c.category} · {c.sourceRef || '未定位'} · {c.sourceType}</div>
                                {formatConditions(c.conditions) && <div className='text-[9px] text-slate-500 mt-0.5'>条件：{formatConditions(c.conditions)}</div>}
                                {decision?.decision === 'mapped_to' && decision.mappedKey && (
                                  <div className='text-[9px] text-emerald-400 mt-0.5'>已人工映射：{decision.mappedKey}</div>
                                )}
                              </div>
                              <span className='shrink-0 rounded px-1.5 py-0.5 text-[9px] bg-amber-500/10 text-amber-300'>{c.mappingStatus === 'unmapped' ? '未映射' : c.mappingStatus}</span>
                            </div>

                            <div className='mt-2 flex flex-wrap items-center gap-1.5'>
                              {decision?.decision === 'skipped' ? (
                                <button
                                  type='button'
                                  onClick={() => setDevices(clearDeviceCandidateDecision(candidateDevice.id, c.rawPath))}
                                  className='rounded border border-emerald-500/30 bg-emerald-600/10 px-2 py-1 text-[9px] text-emerald-300 cursor-pointer'
                                >恢复使用</button>
                              ) : (
                                <button
                                  type='button'
                                  onClick={() => {
                                    const next = updateDeviceCandidateDecision(candidateDevice.id, c.rawPath, 'skipped');
                                    setDevices(next);
                                    setSelectedCandidates(prev => prev.filter(id => id !== c.id));
                                  }}
                                  className='rounded border border-slate-700 px-2 py-1 text-[9px] text-slate-400 hover:text-white cursor-pointer'
                                >暂不使用</button>
                              )}

                              {options.length > 0 && (
                                <>
                                  <select
                                    value={mappingDrafts[c.rawPath] || decision?.mappedKey || ''}
                                    onChange={e => setMappingDrafts(prev => ({ ...prev, [c.rawPath]: e.target.value }))}
                                    className='rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[9px] text-slate-300'
                                  >
                                    <option value=''>选择同类工程字段</option>
                                    {options.map(f => <option key={f.key} value={f.key}>{f.label} · {f.key}</option>)}
                                  </select>
                                  <button
                                    type='button'
                                    disabled={!mappingDrafts[c.rawPath] && !decision?.mappedKey}
                                    onClick={() => {
                                      const mappedKey = mappingDrafts[c.rawPath] || decision?.mappedKey;
                                      if (!mappedKey) return;
                                      setDevices(updateDeviceCandidateDecision(candidateDevice.id, c.rawPath, 'mapped_to', mappedKey));
                                      setMappingDrafts(prev => ({ ...prev, [c.rawPath]: mappedKey }));
                                    }}
                                    className='rounded border border-blue-500/40 bg-blue-600/15 px-2 py-1 text-[9px] text-blue-300 disabled:opacity-40 cursor-pointer'
                                  >映射到现有参数</button>
                                </>
                              )}

                              <button
                                type='button'
                                onClick={() => {
                                  const next = requestDeviceCandidateParameter(candidateDevice.id, c.rawPath, c.label, c.category);
                                  setDevices(next);
                                  showToast?.('已记录为“待创建工程参数”', 'info');
                                }}
                                className='rounded border border-purple-500/30 bg-purple-600/10 px-2 py-1 text-[9px] text-purple-300 cursor-pointer'
                              >{candidateDevice.candidateRequests?.[c.rawPath] ? '已记待办' : '创建工程参数（记待办）'}</button>
                            </div>
                          </div>
                        );
                      })}
                      {skippedCandidates.length > 0 && (
                        <button
                          type='button'
                          onClick={() => setShowSkipped(v => !v)}
                          className='w-full px-3 py-2 text-left text-[9px] text-slate-500 hover:text-slate-300 cursor-pointer'
                        >{showSkipped ? '隐藏' : '显示'} {skippedCandidates.length} 项已暂不使用</button>
                      )}
                    </div>
                  )}
                </div>

                <div className='flex flex-col md:flex-row md:items-center gap-2'>
                  <button
                    type='button'
                    disabled={!selectedCandidates.length || !onApplyToIssue}
                    onClick={() => {
                      const payload = buildDeviceCandidateImportPayload(
                        candidates,
                        new Set(selectedCandidates),
                        issue?.measuredValues,
                        candidateDevice.partNumber,
                      );
                      if (Object.keys(payload.values).length) {
                        onApplyToIssue?.(payload.values, payload.provenance);
                      }
                      let nextDevices = devices;
                      for (const candidate of candidates) {
                        if (payload.importedIds.includes(candidate.id) && candidate.targetKey) {
                          nextDevices = updateDeviceCandidateDecision(candidateDevice.id, candidate.rawPath, 'imported', candidate.targetKey);
                        }
                      }
                      if (nextDevices !== devices) setDevices(nextDevices);
                      setSelectedCandidates([]);
                      const messages: string[] = [`已导入 ${payload.importedIds.length} 项`];
                      if (payload.conflicts.length) messages.push(`${payload.conflicts.length} 项因已有输入未覆盖`);
                      if (payload.duplicateTargets.length) messages.push(`${payload.duplicateTargets.length} 个目标字段存在重复候选，已阻止重复写入`);
                      if (payload.invalidCandidates.length) messages.push(`${payload.invalidCandidates.length} 项因映射/数值状态异常未导入`);
                      showToast?.(messages.join('；'), payload.importedIds.length ? 'success' : 'info');
                    }}
                    className='inline-flex items-center gap-1.5 rounded-lg bg-blue-600 disabled:bg-slate-800 disabled:text-slate-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-500 cursor-pointer'
                  ><Upload className='w-3.5 h-3.5' />导入已选择到工程</button>
                  <div className='text-[9px] text-slate-500 flex items-center gap-1'><Info className='w-3 h-3' /> unmapped / skipped 候选绝不会写入 measuredValues；DATASHEET 只作为规格证据。</div>
                </div>
              </div>
            )}
          </section>

          {/* 5. 已存器件 */}
          <section>
            <div className='flex items-center justify-between mb-2'>
              <h3 className='text-sm font-semibold text-blue-300'>5 · 已存器件（{devices.length}）</h3>
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
                      <button onClick={() => { setCandidateDeviceId(d.id); setSelectedCandidates([]); setMappingDrafts({}); setShowSkipped(false); }} className='rounded-lg border border-slate-600 bg-slate-800/70 px-2 py-1 text-[11px] font-medium text-slate-300 hover:bg-slate-700 cursor-pointer'>参数候选</button>
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

