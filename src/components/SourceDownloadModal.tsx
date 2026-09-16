import React, { useState } from 'react';
import {
  X,
  Download,
  Copy,
  Check,
  FileCode,
  BookOpen,
  ShieldCheck,
  Package,
  Terminal,
  Cpu,
  Sparkles,
  AlertTriangle,
} from 'lucide-react';
import { AI_OPTIMIZATION_GUIDE_TEXT } from '../data/optimizationGuideText';

interface SourceDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  showToast: (text: string, type?: 'success' | 'info' | 'error') => void;
}

export const SourceDownloadModal: React.FC<SourceDownloadModalProps> = ({
  isOpen,
  onClose,
  showToast,
}) => {
  const [activeTab, setActiveTab] = useState<'guide' | 'prompt' | 'code-thermal' | 'code-pipeline'>('guide');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isDownloadingZip, setIsDownloadingZip] = useState(false);
  const [isDownloadingTar, setIsDownloadingTar] = useState(false);

  if (!isOpen) return null;

  const copyToClipboard = async (text: string, key: string, label: string) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopiedKey(key);
      showToast(`已成功复制${label}到剪贴板！可以直接发给其他 AI`, 'success');
      setTimeout(() => setCopiedKey(null), 2500);
    } catch (e) {
      showToast('复制失败，请手动选中文本复制', 'error');
    }
  };

  // 应用内安全流式下载（完全避开 Cloud Run 外部 403 权限墙）
  const handleDownloadInApp = async (format: 'zip' | 'tar') => {
    const isZip = format === 'zip';
    const endpoint = isZip ? '/api/download/source-zip' : '/api/download/source-tar';
    const filename = isZip ? 'ecu_hardware_copilot_full_source.zip' : 'ecu_hardware_copilot_full_source.tar.gz';

    if (isZip) setIsDownloadingZip(true);
    else setIsDownloadingTar(true);

    showToast(`正在通过应用内安全通道打包下载 ${filename}...`, 'info');

    try {
      const res = await fetch(endpoint);
      if (!res.ok) {
        throw new Error(`下载服务响应状态异常: HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(blobUrl);

      showToast(`✅ 下载成功！文件已保存至本地下载目录: ${filename}`, 'success');
    } catch (err: any) {
      console.error('In-app download error:', err);
      showToast(`下载失败: ${err?.message || '请稍后重试'}`, 'error');
    } finally {
      if (isZip) setIsDownloadingZip(false);
      else setIsDownloadingTar(false);
    }
  };

  const aiPromptSnippet = `我正在设计并优化一个车规级 ECU 硬件/BLDC/机器人关节的多物理场硬件决策与因果推演 Copilot 系统（基于 React + TypeScript 全栈）。
系统核心模块包含：
1. deterministicPrecomputation.ts：确定性物理计算总控有向无环图（DAG），先于 AI 推理算出硬性物理事实，杜绝大模型幻觉。
2. thermalCascadeEngine.ts：热-电-米勒多物理场级联引擎，通过 P_cond(Tj) + P_sw 迭代收敛稳态结温 Tj，并动态计算门极开启阈值 Vth 负温漂与米勒感应电压 Vgs 的击穿裕量。
3. bldcDeterministicEngine.ts & motorPhysicsEngine.ts：BLDC 急停动能向母线吸收电容转移的电压泵升模型与对管开通高 dv/dt 米勒直通判定。
4. robotJointDeterministicEngine.ts & robotJointResonance.ts：谐波减速器柔度、背隙与双质量共振带宽判定。

请详细阅读附带的源码与《AI_OPTIMIZATION_GUIDE.md》，重点协助优化：
1. 将 thermalCascadeEngine 的稳态收敛热阻模型升级为 Foster 4阶或 Cauer 瞬态热阻网络微分方程，支持毫秒级短时急停脉冲温升计算；
2. 在米勒感应直通判定中引入源极寄生电感 L_source 与输入电容 C_iss 的 RLC 二阶瞬态振荡求解；
3. 审查代码中的数学模型严密性与 TypeScript 类型安全，给出重构优化建议。`;

  const thermalSnippet = `// 摘自 src/utils/thermalCascadeEngine.ts 核心算法段落
export function calculateThermalCascade(
  inputs: ThermalCascadeInput,
  bldc?: Partial<BldcElectricalParams>
): ThermalCascadeOutput {
  // 1. 迭代求解稳态结温 Tj (考虑内阻正温漂自激)
  let Tj = inputs.ambientTempC + 10;
  for (let iter = 0; iter < 12; iter++) {
    // 车规 N-MOSFET Rds(on) 典型温升恶化系数
    const rdsFactor = Math.pow(1 + 0.0065 * Math.max(0, Tj - 25), 1.8);
    const Rds_hot = inputs.rdsOn25mOhm * rdsFactor;
    const P_cond = Math.pow(inputs.operatingCurrentA, 2) * (Rds_hot / 1000);
    const P_total = P_cond + P_sw;
    const nextTj = inputs.caseTempC + P_total * inputs.thermalResistanceJc;
    if (Math.abs(nextTj - Tj) < 0.05) break;
    Tj = nextTj;
  }

  // 2. 门极阈值电压 Vth 负温漂 (典型 -2.2mV/℃)
  const deltaTemp = Math.max(0, Tj - 25);
  const Vth_hot = Math.max(0.5, inputs.vthMin25V + inputs.vthTempCoeffMvPerC * (deltaTemp / 1000));

  // 3. 米勒感应电压计算 (反向对管开通感应位移电流)
  const vGateInducedV = (inputs.cgdPf * 1e-12) * (inputs.dvDtVperNs * 1e9) * inputs.rgOffOhm;
  const safetyMarginV = Vth_hot - vGateInducedV;

  return { Tj, Rds_hot, Vth_hot, vGateInducedV, safetyMarginV };
}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl shadow-emerald-950/30 overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 bg-slate-900/90 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-100">
                  全套源码与多物理场架构优化指南
                </h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/30">
                  71 个源文件完整归档
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                包含纯物理机理算法、统一状态机、专家推理规则树及发给其他 AI 优化的专属指南
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
            title="关闭窗口"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Access Permission Notice Banner */}
        <div className="mx-5 mt-4 p-3 rounded-xl bg-blue-950/30 border border-blue-500/30 text-xs text-blue-200 flex items-start gap-2.5">
          <ShieldCheck className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold text-blue-300">为什么直接复制外部链接会提示“无权访问”？</div>
            <div className="text-slate-300 text-[11px] mt-0.5 leading-relaxed">
              因本系统的云端容器部署在受保护的私有开发沙箱中，若在外部浏览器标签页直接打开 <code className="text-slate-400">ais-dev-...</code> 地址会被 Google Cloud IAM 登录拦截 (403 Forbidden)。
              <strong className="text-emerald-300 ml-1">请直接点击下方绿色按钮</strong>，系统会通过页面内部受信任的通道直接流式下载到您的电脑本地，100% 顺畅无阻。
            </div>
          </div>
        </div>

        {/* Primary Download Action Cards */}
        <div className="px-5 pt-3 pb-2 grid grid-cols-1 sm:grid-cols-2 gap-3 shrink-0">
          {/* Card 1: ZIP (Recommended) */}
          <div className="p-4 rounded-xl bg-emerald-950/20 border-2 border-emerald-500/40 hover:border-emerald-500/70 transition flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-sm">
                  <Download className="w-4 h-4" />
                  <span>推荐：全套源码与指南 ZIP 包</span>
                </div>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                  ~1.3 MB
                </span>
              </div>
              <p className="text-[11px] text-slate-300 mt-1 leading-snug">
                Windows / Mac 通用压缩格式，解压后内含 <code className="text-emerald-300 font-mono">AI_OPTIMIZATION_GUIDE.md</code> 和全部 70+ 源码。
              </p>
            </div>
            <button
              id="modal-download-zip-btn"
              onClick={() => handleDownloadInApp('zip')}
              disabled={isDownloadingZip}
              className="mt-3 w-full py-2 px-3 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-semibold text-xs rounded-lg transition shadow-lg shadow-emerald-950/50 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
            >
              {isDownloadingZip ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>正在应用内流式下载...</span>
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  <span>立即保存 ZIP 源码包到本地</span>
                </>
              )}
            </button>
          </div>

          {/* Card 2: TAR.GZ */}
          <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/80 hover:border-slate-600 transition flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-cyan-400 font-bold text-sm">
                  <Terminal className="w-4 h-4" />
                  <span>开发者备用：TAR.GZ 压缩包</span>
                </div>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300">
                  ~1.2 MB
                </span>
              </div>
              <p className="text-[11px] text-slate-300 mt-1 leading-snug">
                Linux / 服务器开发者偏好的归档格式，保留完整源码文件权限。
              </p>
            </div>
            <button
              id="modal-download-tar-btn"
              onClick={() => handleDownloadInApp('tar')}
              disabled={isDownloadingTar}
              className="mt-3 w-full py-2 px-3 bg-slate-700 hover:bg-slate-600 active:bg-slate-800 text-slate-100 font-semibold text-xs rounded-lg transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
            >
              {isDownloadingTar ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>正在应用内流式下载...</span>
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  <span>立即保存 TAR.GZ 到本地</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Content Viewer Tabs */}
        <div className="px-5 pt-2 flex items-center gap-2 border-b border-slate-800 shrink-0">
          <button
            onClick={() => setActiveTab('guide')}
            className={`px-3 py-2 text-xs font-semibold border-b-2 flex items-center gap-1.5 transition ${
              activeTab === 'guide'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>AI 优化指南全文预览</span>
          </button>
          <button
            onClick={() => setActiveTab('prompt')}
            className={`px-3 py-2 text-xs font-semibold border-b-2 flex items-center gap-1.5 transition ${
              activeTab === 'prompt'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>发给其他 AI 的 Prompt 提示词</span>
          </button>
          <button
            onClick={() => setActiveTab('code-thermal')}
            className={`px-3 py-2 text-xs font-semibold border-b-2 flex items-center gap-1.5 transition ${
              activeTab === 'code-thermal'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>核心算法: 热电米勒级联</span>
          </button>
        </div>

        {/* Tab Body */}
        <div className="px-5 py-3 flex-1 overflow-y-auto min-h-0 bg-slate-950/40">
          {activeTab === 'guide' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">
                  《AI_OPTIMIZATION_GUIDE.md》文档内容（已打包在源码根目录）：
                </span>
                <button
                  onClick={() => copyToClipboard(AI_OPTIMIZATION_GUIDE_TEXT, 'guide', '优化指南文档')}
                  className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-emerald-300 font-medium rounded-lg border border-slate-700 flex items-center gap-1 transition"
                >
                  {copiedKey === 'guide' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedKey === 'guide' ? '已复制成功' : '一键复制指南全文'}</span>
                </button>
              </div>
              <pre className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-[11px] text-slate-300 font-mono whitespace-pre-wrap leading-relaxed max-h-72 overflow-y-auto">
                {AI_OPTIMIZATION_GUIDE_TEXT}
              </pre>
            </div>
          )}

          {activeTab === 'prompt' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">
                  可以直接发送给 Claude 3.7 / ChatGPT-4o / DeepSeek 的提示词：
                </span>
                <button
                  onClick={() => copyToClipboard(aiPromptSnippet, 'prompt', 'AI 提示词')}
                  className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-emerald-300 font-medium rounded-lg border border-slate-700 flex items-center gap-1 transition"
                >
                  {copiedKey === 'prompt' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedKey === 'prompt' ? '已复制成功' : '一键复制 Prompt 提问词'}</span>
                </button>
              </div>
              <pre className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-emerald-300/90 font-mono whitespace-pre-wrap leading-relaxed">
                {aiPromptSnippet}
              </pre>
            </div>
          )}

          {activeTab === 'code-thermal' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">
                  <code className="text-emerald-400 font-mono">src/utils/thermalCascadeEngine.ts</code> 关键物理公式段落：
                </span>
                <button
                  onClick={() => copyToClipboard(thermalSnippet, 'thermal', '热电米勒级联算法源码')}
                  className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-emerald-300 font-medium rounded-lg border border-slate-700 flex items-center gap-1 transition"
                >
                  {copiedKey === 'thermal' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedKey === 'thermal' ? '已复制成功' : '一键复制代码片段'}</span>
                </button>
              </div>
              <pre className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 font-mono whitespace-pre-wrap leading-relaxed max-h-72 overflow-y-auto">
                {thermalSnippet}
              </pre>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-800 bg-slate-900/90 flex items-center justify-between shrink-0">
          <div className="text-[11px] text-slate-400">
            💡 提示：本下载使用前端纯本地流转换，无需任何云账户或 API 权限，即下即得。
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg transition"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
};
