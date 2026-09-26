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
import { buildDeviceCandidateImportPayload, getAutoImportCandidateIds } from '../utils/deviceCandidateImport';
import { DeviceCandidatePanel } from './DeviceCandidatePanel';
import { IssueInput, MeasurementSource } from '../types';
import { getAllEngineeringMeasurementFields, getDomainMeasurementFields } from '../utils/scenarioDomainEngine';
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
  const activeDomainFields = issue ? getDomainMeasurementFields(issue) : [];
  const engineeringSchemaFields = getAllEngineeringMeasurementFields();
  const currentFieldKeys = new Set(engineeringSchemaFields.map(f => f.key));
  const baseCandidates = candidateDevice ? buildDeviceParameterCandidates(candidateDevice, currentFieldKeys) : [];
  const candidates = candidateDevice
    ? applyCandidateDecisions(baseCandidates, candidateDevice.candidateDecisions, currentFieldKeys)
    : [];
  // 分桶只依据 candidateKind（唯一规则）：不再由 UI 各自判断 value 类型或来源，避免与字段表/Prompt 说法不一致。
  const mappedCandidates = candidates.filter(c => c.candidateKind === 'DIRECT_SCALAR' && c.mappingStatus === 'mapped');
  const reviewCandidates = candidates.filter(c => c.candidateKind === 'DERIVED_OR_ESTIMATE' && c.mappingStatus === 'mapped');
  const curveOnlyCandidates = candidates.filter(c => c.candidateKind === 'CURVE_ONLY');
  const autoSelectableCandidateIds = getAutoImportCandidateIds(candidates, issue?.measuredValues);
  const autoSelectableCandidates = candidates.filter((candidate) => autoSelectableCandidateIds.has(candidate.id));
  const unmappedCandidates = candidates.filter(c => c.mappingStatus !== 'mapped');
  const skippedCandidates = candidateDevice
    ? unmappedCandidates.filter(c => candidateDevice.candidateDecisions?.[c.rawPath]?.decision === 'skipped')
    : [];
  const visibleUnmappedCandidates = showSkipped
    ? unmappedCandidates
    : unmappedCandidates.filter(c => candidateDevice?.candidateDecisions?.[c.rawPath]?.decision !== 'skipped');
  const mappingOptions = (candidate: DeviceParameterCandidate) => getMosfetMappingOptions(candidate, engineeringSchemaFields);
  const activeDomainKeys = new Set(activeDomainFields.map(f => f.key));
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
          <section>
            {!candidateDevice ? (
              <div className='rounded-lg border border-dashed border-slate-700 px-4 py-5 text-center text-xs text-slate-500'>先在下面选择一个器件，查看它能映射到当前工程的参数。</div>
            ) : (
          <DeviceCandidatePanel
            candidateDevice={candidateDevice!}
            candidates={candidates}
            mappedCandidates={mappedCandidates}
            reviewCandidates={reviewCandidates}
            curveOnlyCandidates={curveOnlyCandidates}
            autoSelectableCandidates={autoSelectableCandidates}
            skippedCandidates={skippedCandidates}
            visibleUnmappedCandidates={visibleUnmappedCandidates}
            selectedCandidates={selectedCandidates}
            setSelectedCandidates={setSelectedCandidates}
            showUnmapped={showUnmapped}
            setShowUnmapped={setShowUnmapped}
            showSkipped={showSkipped}
            setShowSkipped={setShowSkipped}
            mappingDrafts={mappingDrafts}
            setMappingDrafts={setMappingDrafts}
            issueLabel={issue ? issue.issueCategories.join(' / ') || '未分类' : '未提供工程'}
            mappingOptions={mappingOptions}
            onSkip={(c) => { const next = updateDeviceCandidateDecision(candidateDevice!.id, c.rawPath, 'skipped'); setDevices(next); setSelectedCandidates(prev => prev.filter(id => id !== c.id)); }}
            onRestore={(c) => setDevices(clearDeviceCandidateDecision(candidateDevice!.id, c.rawPath))}
            onMap={(c, key) => { setDevices(updateDeviceCandidateDecision(candidateDevice!.id, c.rawPath, 'mapped_to', key)); setMappingDrafts(prev => ({ ...prev, [c.rawPath]: key })); }}
            onRequestParameter={(c) => { setDevices(requestDeviceCandidateParameter(candidateDevice!.id, c.rawPath, c.label, c.category)); showToast?.('已记录为“待创建工程参数”', 'info'); }}
            onConfirmReview={(c) => {
              const payload = buildDeviceCandidateImportPayload(candidates, new Set([c.id]), issue?.measuredValues, candidateDevice!.partNumber, undefined, new Set([c.id]));
              if (Object.keys(payload.values).length) onApplyToIssue?.(payload.values, payload.provenance);
              if (payload.importedIds.includes(c.id) && c.targetKey) {
                const next = updateDeviceCandidateDecision(candidateDevice!.id, c.rawPath, 'imported', c.targetKey);
                setDevices(next);
                showToast?.(`已确认导入：${c.label} → ${c.targetKey}`, 'success');
              } else if (payload.conflicts.length) {
                showToast?.(`当前工程已有 ${c.targetKey || c.label}，为避免覆盖未导入`, 'info');
              } else {
                showToast?.('该候选未通过最终导入校验', 'error');
              }
            }}
            onImport={() => {
              const payload = buildDeviceCandidateImportPayload(candidates, new Set(selectedCandidates), issue?.measuredValues, candidateDevice!.partNumber);
              if (Object.keys(payload.values).length) onApplyToIssue?.(payload.values, payload.provenance);
              let nextDevices = devices;
              for (const candidate of candidates) if (payload.importedIds.includes(candidate.id) && candidate.targetKey) nextDevices = updateDeviceCandidateDecision(candidateDevice!.id, candidate.rawPath, 'imported', candidate.targetKey);
              if (nextDevices !== devices) setDevices(nextDevices);
              setSelectedCandidates([]);
              const messages = [`已导入 ${payload.importedIds.length} 项`];
              if (payload.conflicts.length) messages.push(`${payload.conflicts.length} 项因已有输入未覆盖`);
              if (payload.duplicateTargets.length) messages.push(`${payload.duplicateTargets.length} 个目标字段重复，已阻止覆盖`);
              if (payload.invalidCandidates.length) messages.push(`${payload.invalidCandidates.length} 项映射/数值异常未导入`);
              showToast?.(messages.join('；'), payload.importedIds.length ? 'success' : 'info');
            }}
            formatConditions={formatConditions}
          />
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
                      <button
                        onClick={() => {
                          onSelectDevice?.(d.id);
                          const selectedDeviceCandidates = applyCandidateDecisions(
                            buildDeviceParameterCandidates(d, currentFieldKeys),
                            d.candidateDecisions,
                            currentFieldKeys,
                          );
                          const autoIds = getAutoImportCandidateIds(selectedDeviceCandidates, issue?.measuredValues);
                          const autoPayload = onApplyToIssue
                            ? buildDeviceCandidateImportPayload(
                                selectedDeviceCandidates,
                                autoIds,
                                issue?.measuredValues,
                                d.partNumber,
                              )
                            : null;
                          if (autoPayload && Object.keys(autoPayload.values).length) {
                            onApplyToIssue?.(autoPayload.values, autoPayload.provenance);
                          }
                          showToast?.(
                            autoPayload && autoPayload.importedIds.length
                              ? `已设为当前器件：${d.partNumber}；自动带入 ${autoPayload.importedIds.length} 项高置信度规格参数，无需逐项映射。`
                              : `已设为当前器件：${d.partNumber}；没有新的可安全直导参数，未覆盖已有工程输入。`,
                            autoPayload && autoPayload.importedIds.length ? 'success' : 'info',
                          );
                        }}
                        className='rounded-lg border border-blue-500/40 bg-blue-600/20 px-2 py-1 text-[11px] font-medium text-blue-300 hover:bg-blue-600/30 cursor-pointer'
                      >设为当前</button>
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
