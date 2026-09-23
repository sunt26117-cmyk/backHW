import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface TemplateContentNoticeProps {
  blocks?: string[];
  message?: string;
  compact?: boolean;
}

/**
 * 通用模板内容显式提示。
 *
 * 用途：把 decisionPillars / getRobotJointPillars 生成的“通用模板”内容（多维度风险分解、
 * 方案为什么不选、24小时计划、EDR 记录、红队挑战）在界面上明确标注出来，避免工程师在
 * 不知情的情况下，把模板里的示例数字（如 22.16J / 307V / 1360pF / 37.8V）当成当前 case
 * 的真实分析结论引用到评审、EDR 或客户文档里。
 */
export const TemplateContentNotice: React.FC<TemplateContentNoticeProps> = ({ blocks, message, compact }) => {
  return (
    <div className={'border border-amber-600/50 bg-amber-950/30 rounded-lg ' + (compact ? 'p-2.5' : 'p-3') + ' text-[11px] text-amber-200 flex items-start gap-2'}>
      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
      <div className="leading-relaxed">
        <span className="font-bold text-amber-300">通用模板内容提示：</span>
        <span>{message || '本区块由内置工程域模板生成，并非针对当前 case 的专属分析；其中具体数值为模板示例，禁止直接引用到 EDR、评审或客户文档。请以本地确定性预核算事实与实测数据为准。'}</span>
        {Array.isArray(blocks) && blocks.length > 0 && (
          <div className="mt-1 text-[10px] text-amber-300/80 font-mono">涉及区块：{blocks.join('、')}</div>
        )}
      </div>
    </div>
  );
};