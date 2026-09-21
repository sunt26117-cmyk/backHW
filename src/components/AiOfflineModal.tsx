import React, { useState } from 'react';
import { X, Copy, Download, Upload, Sparkles, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { ProjectContext, IssueInput, CopilotAnalysisResult } from '../types';

interface AiOfflineModalProps {
  isOpen: boolean;
  onClose: () => void;
  context: ProjectContext;
  issue: IssueInput;
  onApplyResult: (result: CopilotAnalysisResult) => void;
  showToast?: (text: string, type: 'success' | 'info' | 'error') => void;
}

export const AiOfflineModal: React.FC<AiOfflineModalProps> = ({ isOpen, onClose, context, issue, onApplyResult, showToast }) => {
  const [fullPrompt, setFullPrompt] = useState('');
  const [isBuilding, setIsBuilding] = useState(false);
  const [importText, setImportText] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<{ ok?: string; error?: string } | null>(null);

  if (!isOpen) return null;

  const buildPrompt = async () => {
    setIsBuilding(true);
    try {
      const res = await fetch('/api/copilot/build-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context, issue }),
      });
      const data = await res.json();
      if (data.success) {
        setFullPrompt(data.fullPrompt || data.userPrompt || '');
      } else {
        showToast?.('生成 Prompt 失败：' + (data.error || '未知错误'), 'error');
      }
    } catch (err: any) {
      showToast?.('生成 Prompt 失败：' + (err?.message || '网络错误'), 'error');
    } finally {
      setIsBuilding(false);
    }
  };

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(fullPrompt);
      showToast?.('完整 Prompt 已复制到剪贴板', 'success');
    } catch {
      showToast?.('复制失败，请手动全选复制', 'error');
    }
  };

  const importResult = async () => {
    if (!importText.trim()) { showToast?.('请先粘贴 AI 返回的 JSON', 'info'); return; }
    setIsImporting(true);
    setImportMsg(null);
    try {
      const res = await fetch('/api/copilot/import-ai-result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context, issue, aiContent: importText }),
      });
      const data = await res.json();
      if (data.success && data.result) {
        const audit = data.aiAudit;
        const warnCount = audit?.flags?.length || 0;
        setImportMsg({ ok: '导入成功，已通过审计并渲染（审计命中 ' + warnCount + ' 条规则）' });
        onApplyResult(data.result);
        setImportText('');
      } else {
        setImportMsg({ error: data.error || '导入失败' });
      }
    } catch (err: any) {
      setImportMsg({ error: err?.message || '网络错误' });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className='fixed inset-0 z-50 flex items-start justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto'>
      <div className='mt-6 w-full max-w-3xl rounded-2xl border border-slate-700 bg-slate-900 text-slate-100 shadow-2xl'>
        <div className='flex items-center justify-between border-b border-slate-800 px-5 py-4'>
          <div className='flex items-center gap-2'>
            <Sparkles className='h-5 w-5 text-blue-400' />
            <h2 className='text-base font-semibold'>AI 离线协作（导出 Prompt → 免费 AI → 导入结果）</h2>
          </div>
          <button onClick={onClose} className='rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200 cursor-pointer'>
            <X className='h-4 w-4' />
          </button>
        </div>

        <div className='px-5 py-4 space-y-5'>
          {/* 1. 导出 Prompt */}
          <section>
            <div className='flex items-center justify-between mb-2'>
              <h3 className='text-sm font-semibold text-blue-300'>1 · 生成并导出完整 Prompt</h3>
              <div className='flex gap-2'>
                <button onClick={buildPrompt} disabled={isBuilding} className='flex items-center gap-1.5 rounded-lg border border-blue-500/40 bg-blue-600/20 px-2.5 py-1.5 text-xs font-medium text-blue-300 hover:bg-blue-600/30 disabled:opacity-50 cursor-pointer'>
                  <Download className='h-3.5 w-3.5' /> {isBuilding ? '生成中…' : '生成 Prompt'}
                </button>
                {fullPrompt && (
                  <button onClick={copyPrompt} className='flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-600/20 px-2.5 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-600/30 cursor-pointer'>
                    <Copy className='h-3.5 w-3.5' /> 复制
                  </button>
                )}
              </div>
            </div>
            <textarea
              value={fullPrompt}
              readOnly
              placeholder='点「生成 Prompt」后，这里会显示完整提示词，复制到免费 AI（DeepSeek / 豆包 / Kimi 等）即可。'
              className='w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-xs text-slate-200 font-mono min-h-[180px] focus:outline-none'
            />
          </section>

          {/* 2. 导入结果 */}
          <section>
            <h3 className='text-sm font-semibold text-blue-300 mb-2'>2 · 粘贴 AI 返回的 JSON 并导入渲染</h3>
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder='把免费 AI 输出的 JSON 粘贴到这里，点导入即自动审计并渲染结果。'
              className='w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-xs text-slate-200 font-mono min-h-[160px] focus:outline-none focus:border-blue-500/60'
            />
            <button onClick={importResult} disabled={isImporting} className='mt-2 flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50 cursor-pointer'>
              <Upload className='h-3.5 w-3.5' /> {isImporting ? '导入中…' : '导入并渲染结果'}
            </button>
            {importMsg?.ok && (
              <div className='mt-2 flex items-start gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-950/30 px-3 py-2 text-xs text-emerald-300'>
                <CheckCircle2 className='h-3.5 w-3.5 shrink-0 mt-0.5' /> {importMsg.ok}
              </div>
            )}
            {importMsg?.error && (
              <div className='mt-2 flex items-start gap-1.5 rounded-lg border border-red-500/40 bg-red-950/30 px-3 py-2 text-xs text-red-300'>
                <AlertTriangle className='h-3.5 w-3.5 shrink-0 mt-0.5' /> {importMsg.error}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

