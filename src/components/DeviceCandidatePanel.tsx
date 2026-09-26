import React from 'react';
import { Info, Upload } from 'lucide-react';
import type { DeviceEntry } from '../utils/deviceLibrary';
import { getCandidateSummary } from '../utils/deviceParameterCandidates';
import type { DeviceParameterCandidate } from '../utils/deviceParameterCandidates';
import type { DomainMeasurementField } from '../utils/scenarioDomainEngine';

interface Props {
  candidateDevice: DeviceEntry;
  candidates: DeviceParameterCandidate[];
  mappedCandidates: DeviceParameterCandidate[];
  reviewCandidates: DeviceParameterCandidate[];
  /** 已识别到目标工程参数，但只有曲线/多条件、拿不出单值的候选（不可导入）。 */
  curveOnlyCandidates: DeviceParameterCandidate[];
  autoSelectableCandidates: DeviceParameterCandidate[];
  skippedCandidates: DeviceParameterCandidate[];
  visibleUnmappedCandidates: DeviceParameterCandidate[];
  selectedCandidates: string[];
  setSelectedCandidates: React.Dispatch<React.SetStateAction<string[]>>;
  showUnmapped: boolean;
  setShowUnmapped: React.Dispatch<React.SetStateAction<boolean>>;
  showSkipped: boolean;
  setShowSkipped: React.Dispatch<React.SetStateAction<boolean>>;
  mappingDrafts: Record<string, string>;
  setMappingDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  issueLabel: string;
  mappingOptions: (candidate: DeviceParameterCandidate) => DomainMeasurementField[];
  onSkip: (candidate: DeviceParameterCandidate) => void;
  onRestore: (candidate: DeviceParameterCandidate) => void;
  onMap: (candidate: DeviceParameterCandidate, mappedKey: string) => void;
  onRequestParameter: (candidate: DeviceParameterCandidate) => void;
  onImport: () => void;
  onConfirmReview: (candidate: DeviceParameterCandidate) => void;
  /** 强制覆盖开关：勾选后连实测/人工输入也允许被当前器件规格覆盖（默认关闭，保护实测）。 */
  forceOverwrite: boolean;
  setForceOverwrite: React.Dispatch<React.SetStateAction<boolean>>;
  formatConditions: (conditions?: Record<string, unknown>) => string;
}

export const DeviceCandidatePanel: React.FC<Props> = ({
  candidateDevice, candidates, mappedCandidates, reviewCandidates, curveOnlyCandidates, autoSelectableCandidates, skippedCandidates, visibleUnmappedCandidates,
  selectedCandidates, setSelectedCandidates, showUnmapped, setShowUnmapped, showSkipped, setShowSkipped,
  mappingDrafts, setMappingDrafts, issueLabel, mappingOptions, onSkip, onRestore, onMap, onRequestParameter, onImport, onConfirmReview, forceOverwrite, setForceOverwrite, formatConditions,
}) => (
  <section>
    <div className='flex items-center justify-between mb-2'>
      <div>
        <h3 className='text-sm font-semibold text-blue-300'>4 · 资料参数候选 → 当前工程输入</h3>
        <div className='text-[10px] text-slate-500 mt-0.5'>系统先按全工程 schema、单位和 AI 明确 mapping 自动匹配；工程师只决定是否导入。实测/工程师输入永不被覆盖；已有的 datasheet/基准值会被当前器件覆盖，导入结果会如实告知覆盖了哪几项。</div>
      </div>
      <span className='text-[10px] text-slate-500'>{getCandidateSummary(candidates).total} 项候选</span>
    </div>
    <div className='space-y-3'>
      <div className='flex flex-wrap items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2'>
        <span className='text-xs font-semibold text-slate-200'>{candidateDevice.partNumber}</span>
        <span className='text-[10px] text-slate-500'>当前工程域：{issueLabel} · 全工程 schema 自动匹配</span>
        <span className='text-[10px] text-slate-500'>可导入 {mappedCandidates.length} · 需确认 {reviewCandidates.length} · 仅曲线 {curveOnlyCandidates.length} · 未映射 {visibleUnmappedCandidates.length} · 待创建 {Object.keys(candidateDevice.candidateRequests || {}).length}</span>
        <button type='button' onClick={() => setSelectedCandidates(autoSelectableCandidates.map(c => c.id))} className='ml-auto text-[10px] text-emerald-300 hover:text-white cursor-pointer'>自动选中可安全直导 {autoSelectableCandidates.length} 项</button>
        <button type='button' onClick={() => setSelectedCandidates(mappedCandidates.filter(c => c.confidence >= 0.9).map(c => c.id))} className='text-[10px] text-blue-300 hover:text-white cursor-pointer'>选高置信度</button>
        <button type='button' onClick={() => setSelectedCandidates([])} className='text-[10px] text-slate-400 hover:text-white cursor-pointer'>清空</button>
      </div>
      <div>
        <div className='text-[11px] font-semibold text-slate-300 mb-1'>已自动映射，可直接导入</div>
        <div className='rounded-lg border border-slate-800 overflow-hidden max-h-72 overflow-y-auto'>
          {mappedCandidates.length === 0 ? <div className='px-4 py-5 text-center text-xs text-slate-500'>暂无可直接导入的候选；下面仍会列出 AI 已提取但没有安全映射的参数。</div> : mappedCandidates.map(c => {
            const checked = selectedCandidates.includes(c.id);
            return <label key={c.id} className='flex items-center gap-2 px-3 py-2 border-b border-slate-800/80 cursor-pointer hover:bg-slate-800/40'>
              <input type='checkbox' checked={checked} onChange={() => setSelectedCandidates(prev => checked ? prev.filter(id => id !== c.id) : [...prev, c.id])} className='accent-blue-500' />
              <div className='min-w-0 flex-1'>
                <div className='text-xs text-slate-200'>{c.label} <span className='text-[10px] text-slate-500'>→ {c.targetKey}</span>{candidateDevice.candidateDecisions?.[c.rawPath]?.decision === 'imported' && <span className='ml-1 rounded px-1 py-0.5 text-[8px] bg-emerald-500/10 text-emerald-300'>上次已导入</span>}</div>
                <div className='text-[9px] text-slate-500 truncate'>{c.value} {c.unit || ''} · {c.sourceRef || '未定位'} · {c.sourceType}</div>
                {formatConditions(c.conditions) && <div className='text-[9px] text-slate-500 truncate'>条件：{formatConditions(c.conditions)}</div>}
              </div>
              <span className={`text-[9px] font-mono ${c.confidence >= 0.9 ? 'text-emerald-400' : 'text-amber-300'}`}>{Math.round(c.confidence * 100)}%</span>
            </label>;
          })}
        </div>
      </div>
      {reviewCandidates.length > 0 && <div className='rounded-lg border border-sky-500/30 bg-sky-950/10'>
        <div className='px-3 py-2 text-[11px] font-semibold text-sky-200'>已匹配，但需要工程确认（不会自动导入）</div>
        <div className='border-t border-sky-500/20'>
          {reviewCandidates.map(c => <div key={c.id} className='px-3 py-2 border-b border-slate-800/80 last:border-b-0'>
            <div className='flex items-center gap-2'>
              <div className='min-w-0 flex-1'>
                <div className='text-xs text-slate-200'>{c.label} <span className='text-[10px] text-slate-500'>→ {c.targetKey}</span></div>
                <div className='text-[9px] text-slate-500'>{c.value} {c.unit || ''} · {c.sourceType} · {c.note || '来源或条件不足以支持静默导入'}</div>
              </div>
              <div className='flex shrink-0 items-center gap-1.5'>
                <span className='text-[9px] text-sky-300'>{Math.round(c.confidence * 100)}%</span>
                <button type='button' onClick={() => onConfirmReview(c)} className='rounded border border-sky-500/40 bg-sky-600/15 px-2 py-1 text-[9px] text-sky-200 hover:bg-sky-600/25 cursor-pointer'>确认导入</button>
              </div>
            </div>
          </div>)}
        </div>
      </div>}
      {curveOnlyCandidates.length > 0 && <div className='rounded-lg border border-violet-500/30 bg-violet-950/10'>
        <div className='px-3 py-2 text-[11px] font-semibold text-violet-200'>已识别对应工程参数，但当前只有曲线/多条件，无法生成单值（不可导入）</div>
        <div className='border-t border-violet-500/20'>
          {curveOnlyCandidates.map(c => <div key={c.id} className='px-3 py-2 border-b border-slate-800/80 last:border-b-0'>
            <div className='text-xs text-slate-200'>{c.label} <span className='text-[10px] text-slate-500'>→ {c.targetKey}</span></div>
            <div className='text-[9px] text-slate-500'>{c.value} · {c.sourceType} · {c.note || '曲线数据仍保留在器件库；工程输入需要单值，必须由工程师明确取点与条件。'}</div>
          </div>)}
        </div>
      </div>}
      <div className='rounded-lg border border-amber-500/30 bg-amber-950/10'>
        <button type='button' onClick={() => setShowUnmapped(v => !v)} className='w-full flex items-center justify-between px-3 py-2 text-left cursor-pointer'>
          <span><span className='text-[11px] font-semibold text-amber-200'>已提取，但当前没有安全工程映射</span><span className='ml-2 text-[10px] text-slate-500'>{visibleUnmappedCandidates.length} 项</span></span>
          <span className='text-[10px] text-slate-500'>{showUnmapped ? '收起' : '展开'}</span>
        </button>
        {showUnmapped && <div className='border-t border-amber-500/20'>
          {visibleUnmappedCandidates.length === 0 ? <div className='px-3 py-4 text-xs text-slate-500'>没有新的未映射候选。</div> : visibleUnmappedCandidates.map(c => {
            const options = mappingOptions(c);
            const decision = candidateDevice.candidateDecisions?.[c.rawPath];
            return <div key={c.id} className='border-b border-slate-800/80 px-3 py-2.5'>
              <div className='flex items-start gap-2'>
                <div className='min-w-0 flex-1'>
                  <div className='text-xs text-slate-200'>{c.label}</div>
                  <div className='text-[9px] text-slate-500 mt-0.5'>{c.value} {c.unit || ''} · {c.category} · {c.sourceRef || '未定位'} · {c.sourceType}</div>
                  {formatConditions(c.conditions) && <div className='text-[9px] text-slate-500 mt-0.5'>条件：{formatConditions(c.conditions)}</div>}
                  {decision?.decision === 'mapped_to' && decision.mappedKey && <div className='text-[9px] text-emerald-400 mt-0.5'>已人工映射：{decision.mappedKey}</div>}
                </div>
                <span className='shrink-0 rounded px-1.5 py-0.5 text-[9px] bg-amber-500/10 text-amber-300'>{c.mappingStatus === 'unmapped' ? '未映射' : c.mappingStatus}</span>
              </div>
              <div className='mt-2 flex flex-wrap items-center gap-1.5'>
                {decision?.decision === 'skipped' ? <button type='button' onClick={() => onRestore(c)} className='rounded border border-emerald-500/30 bg-emerald-600/10 px-2 py-1 text-[9px] text-emerald-300 cursor-pointer'>恢复使用</button> : <button type='button' onClick={() => onSkip(c)} className='rounded border border-slate-700 px-2 py-1 text-[9px] text-slate-400 hover:text-white cursor-pointer'>暂不使用</button>}
                {options.length > 0 && <>
                  <select value={mappingDrafts[c.rawPath] || decision?.mappedKey || ''} onChange={e => setMappingDrafts(prev => ({ ...prev, [c.rawPath]: e.target.value }))} className='rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[9px] text-slate-300'>
                    <option value=''>选择同类工程字段</option>{options.map(f => <option key={f.key} value={f.key}>{f.label} · {f.key}</option>)}
                  </select>
                  <button type='button' disabled={!mappingDrafts[c.rawPath] && !decision?.mappedKey} onClick={() => { const key = mappingDrafts[c.rawPath] || decision?.mappedKey; if (key) onMap(c, key); }} className='rounded border border-blue-500/40 bg-blue-600/15 px-2 py-1 text-[9px] text-blue-300 disabled:opacity-40 cursor-pointer'>映射到现有参数</button>
                </>}
                <button type='button' onClick={() => onRequestParameter(c)} className='rounded border border-purple-500/30 bg-purple-600/10 px-2 py-1 text-[9px] text-purple-300 cursor-pointer'>{candidateDevice.candidateRequests?.[c.rawPath] ? '已记待办' : '创建工程参数（记待办）'}</button>
              </div>
            </div>;
          })}
          {skippedCandidates.length > 0 && <button type='button' onClick={() => setShowSkipped(v => !v)} className='w-full px-3 py-2 text-left text-[9px] text-slate-500 hover:text-slate-300 cursor-pointer'>{showSkipped ? '隐藏' : '显示'} {skippedCandidates.length} 项已暂不使用</button>}
        </div>}
      </div>
      <div className='flex flex-col md:flex-row md:items-center gap-2'>
        <button type='button' disabled={!selectedCandidates.length} onClick={onImport} className='inline-flex items-center gap-1.5 rounded-lg bg-blue-600 disabled:bg-slate-800 disabled:text-slate-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-500 cursor-pointer'><Upload className='w-3.5 h-3.5' />导入已选择到工程</button>
        <label className='flex items-center gap-1.5 text-[10px] text-slate-400 cursor-pointer select-none'>
          <input type='checkbox' checked={forceOverwrite} onChange={(e) => setForceOverwrite(e.target.checked)} className='accent-rose-500' />
          强制覆盖已有输入（含实测/人工/来源不明的值）
        </label>
        <div className='text-[9px] text-slate-500 flex items-center gap-1'><Info className='w-3 h-3' /> 已明确映射的 DATASHEET 直接值可一键导入；曲线估读、DERIVED 和没有可靠同义字段的数据不会静默写入。默认保护实测/人工输入，只有勾选上面的开关才会覆盖它们。</div>
      </div>
    </div>
  </section>
);
