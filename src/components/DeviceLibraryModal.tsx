import React, { useState } from 'react';
import { X, Copy, Database, Trash2, AlertTriangle, CheckCircle2, FileText } from 'lucide-react';
import { DEVICE_PARAM_PROMPT, MOSFET_TEMPLATE_JSON, DEVICE_FIELD_MEANINGS } from '../data/deviceTemplate';
import { loadDevices, saveDevice, deleteDevice, importDeviceFromJson, DeviceEntry } from '../utils/deviceLibrary';

interface DeviceLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  showToast?: (text: string, type: 'success' | 'info' | 'error') => void;
  onSelectDevice?: (deviceId: string) => void;
}

export const DeviceLibraryModal: React.FC<DeviceLibraryModalProps> = ({ isOpen, onClose, showToast, onSelectDevice }) => {
  const [devices, setDevices] = useState<DeviceEntry[]>(() => loadDevices());
  const [importText, setImportText] = useState('');
  const [importResult, setImportResult] = useState<{ ok?: string; warnings: string[]; error?: string } | null>(null);

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

