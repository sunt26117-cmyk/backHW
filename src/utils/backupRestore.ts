import { ProjectContext, IssueInput, CopilotAnalysisResult } from '../types';
import { readAnalysisResultMetadata } from '../adapters/analysisResultAdapter';
import { withLegacyImportedAnalysisRecord } from '../adapters/analysisResultRecordAdapter';
import { buildAnalysisInputFingerprint } from './analysisInputFingerprint';
import { selectAction, selectJudgment, selectFacts, selectDeliverySnapshot } from './analysisResultSelectors';

export interface BackupData {
  version: string;
  exportTime: string;
  app: string;
  context: ProjectContext;
  issue: IssueInput;
  result: CopilotAnalysisResult | null;
  resultRecord: ReturnType<typeof readAnalysisResultMetadata>['analysisRecord'];
}

/**
 * 导出当前所有项目、实测事实与分析结果为本地 JSON 备份文件
 */
export function exportBackupJson(
  context: ProjectContext,
  issue: IssueInput,
  result: CopilotAnalysisResult | null
): void {
  const backup: BackupData = {
    version: '1.4-automotive',
    exportTime: new Date().toISOString(),
    app: 'ECU Hardware Risk & Decision Copilot',
    context,
    issue,
    result,
    resultRecord: readAnalysisResultMetadata(result).analysisRecord,
  };

  const jsonStr = JSON.stringify(backup, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const cleanProjectName = (context.projectName || 'ECU_Project')
    .replace(/[^\w\u4e00-\u9fa5-_]/g, '_')
    .slice(0, 30);
  const dateStr = new Date().toISOString().split('T')[0];
  const fileName = `ECU_Copilot_Backup_${cleanProjectName}_${dateStr}.json`;

  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * 导入并解析用户上传的本地 JSON 备份文件
 */
export function importBackupJson(file: File): Promise<BackupData> {
  return new Promise((resolve, reject) => {
    if (!file) {
      return reject(new Error('未选择任何文件'));
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const parsed = JSON.parse(text);

        if (!parsed.context || !parsed.issue) {
          throw new Error('无效的备份文件结构：缺少必要的 context 或 issue 字段');
        }

        const expectedInputHash = buildAnalysisInputFingerprint(parsed.context, parsed.issue);
        if (parsed.result) {
          const record = readAnalysisResultMetadata(parsed.result as CopilotAnalysisResult).analysisRecord;
          if (record) {
            if (record.inputHash !== expectedInputHash) {
              throw new Error('备份中的分析结果与备份内的 context / issue 不匹配，已拒绝恢复旧结论');
            }
            if (parsed.resultRecord && parsed.resultRecord.inputHash !== record.inputHash) {
              throw new Error('备份 resultRecord 与结果 payload 不一致');
            }
          } else {
            // 旧备份没有 WP10 记录元数据：只允许按备份内 context / issue 重新建立指纹，
            // 同时保留旧结果内容，作为一次显式兼容迁移。
            parsed.result = withLegacyImportedAnalysisRecord(parsed.result as CopilotAnalysisResult, expectedInputHash);
          }
          parsed.resultRecord = readAnalysisResultMetadata(parsed.result as CopilotAnalysisResult).analysisRecord;
        } else {
          parsed.resultRecord = null;
        }

        resolve(parsed as BackupData);
      } catch (err: any) {
        reject(new Error(`解析备份文件失败: ${err.message}`));
      }
    };

    reader.onerror = () => {
      reject(new Error('读取本地文件失败'));
    };

    reader.readAsText(file, 'utf-8');
  });
}

/**
 * 导出包含机理、评分、领导过关率与工程文档的完整 Markdown 白皮书报告
 */
export function exportMarkdownReport(
  context: ProjectContext,
  issue: IssueInput,
  result: CopilotAnalysisResult | null
): void {
  const dateStr = new Date().toLocaleString('zh-CN');
  const cleanProjectName = context.projectName || '车载硬件决策';

  let md = `# ${cleanProjectName} · 硬件工程决策与风险评估报告\n\n`;
  md += `> **生成时间**：${dateStr}  \n`;
  md += `> **系统架构**：ECU Hardware Risk & Decision Copilot (100% 离线确定性专家引擎)  \n`;
  md += `> **项目阶段**：${context.projectPhase} | **安全等级**：${context.asilLevel} | **倒计时**：剩余 ${context.daysRemaining} 天 | **成本约束**：${context.costConstraint}  \n`;
  md += `> **直属领导倾向**：${
    context.hwLeadStyle === 'CONSERVATIVE'
      ? '🛡️ 技术求稳型 (Quality First)'
      : context.hwLeadStyle === 'AGILE_DELIVERY'
      ? '🚀 敏捷交付型 (Delivery First)'
      : '⚖️ 流程免责型 (Boundary First)'
  }\n\n`;

  md += `---\n\n`;
  md += `## 1. 核心技术事实与失效描述\n\n`;
  md += `- **失效分类**：${issue.issueCategories.join(', ')}\n`;
  md += `- **标准规范要求**：${issue.requirement}\n`;
  md += `- **实际量测数据**：${issue.actualMeasurement}\n`;
  md += `- **试验边界工况**：${issue.testCondition}\n`;
  md += `- **失效模式表现**：${issue.failurePhenomenon}\n`;
  md += `- **核心顾虑 (Concern)**：${issue.engineeringConcern}\n\n`;

  if (result) {
    const facts = selectFacts(result);
    const judgment = selectJudgment(result);
    const action = selectAction(result);
    const delivery = selectDeliverySnapshot(result);
    if (!facts || !judgment || !action || !delivery || !judgment.coreConclusion || !judgment.risk) return;
    md += `## 2. 核心分析结论与第一性原理\n\n`;
    md += `- **根本原因推导**：${judgment.coreConclusion.problemSummary}\n`;
    md += `- **首要推荐策略**：${judgment.coreConclusion.recommendedMeasure}\n`;
    md += `- **综合决策逻辑**：${judgment.coreConclusion.reasonSummary}\n`;
    md += `- **整体技术风险评级**：${judgment.risk.overallRisk} (发生度: ${facts.dfmea[0]?.occurrence ?? '-'} / 严重度: ${facts.dfmea[0]?.severity ?? '-'} / 风险分: ${judgment.risk.overallRiskScore})\n\n`;

    md += `## 3. C-T-S-Q-L 候选方案综合权衡表\n\n`;
    md += `| 排名 | 方案名称 | 类型 | T技术 | S工期 | C成本 | Q质量 | L责任 | 综合基准分 | 领导过关评估 |\n`;
    md += `| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- |\n`;

    action.candidateActions.forEach((opt, idx) => {
      const isVeto = opt.veto.rejection_veto ? '❌ 一票否决' : '✅ 正常候选';
      md += `| ${idx + 1} | **${opt.name}** | ${opt.categoryLabel} | ${opt.scores.T} | ${opt.scores.S} | ${opt.scores.C} | ${opt.scores.Q} | ${opt.scores.L} | ${opt.scores.total} | ${isVeto} |\n`;
    });
    md += `\n`;

    md += `## 4. 最终推荐实施路径与 RACI 矩阵\n\n`;
    md += `### 推荐方案：${delivery.recommendedOptionName}\n\n`;
    md += `**推荐理由**：\n`;
    (judgment.finalRecommendation?.whyReason || []).forEach((r) => {
      md += `- ${r}\n`;
    });
    md += `\n`;

    md += `### RACI 权责分工门禁\n\n`;
    md += `| 专业角色 | RACI | 责任人 | 关键交付动作与输出 | 决策门禁节点 |\n`;
    md += `| :--- | :---: | :--- | :--- | :--- |\n`;
    action.raciMatrix.forEach((item) => {
      md += `| **${item.role}** | **${item.raciType}** | ${item.owner} | ${item.action}（交付物：${item.output}） | ${item.decisionGate} |\n`;
    });
    md += `\n`;

    md += `## 5. 跨部门决策与合规文本草案\n\n`;
    md += `### 5.1 PM 决策邮件草案\n\n`;
    md += `\`\`\`text\n`;
    md += `主题：${action.engineeringDocs?.pmDecisionEmail.subject}\n\n`;
    md += `各位领导、PM 及相关接口人：\n\n`;
    md += `【客观技术事实】\n${action.engineeringDocs?.pmDecisionEmail.technicalFact}\n\n`;
    md += `【当前现状与隐形代价】\n${action.engineeringDocs?.pmDecisionEmail.currentSituation}\n\n`;
    md += `【潜在风险】\n${action.engineeringDocs?.pmDecisionEmail.risk}\n\n`;
    md += `【推荐方案与收益】\n${action.engineeringDocs?.pmDecisionEmail.recommendedOption}\n\n`;
    md += `【成本与工期影响】\n- BOM影响：${action.engineeringDocs?.pmDecisionEmail.costImpact}\n- 进度影响：${action.engineeringDocs?.pmDecisionEmail.scheduleImpact}\n\n`;
    md += `【所需决策与截止时间】\n请 ${action.engineeringDocs?.pmDecisionEmail.decisionOwner} 于 ${action.engineeringDocs?.pmDecisionEmail.deadline} 前明确决策。\n`;
    md += `\`\`\`\n\n`;

    md += `### 5.2 受控偏差特批单 (Deviation Permit)\n\n`;
    md += `- **特批项目**：${action.engineeringDocs?.deviationPermit.title}\n`;
    md += `- **标准要求**：${action.engineeringDocs?.deviationPermit.requirement}\n`;
    md += `- **实测偏差**：${action.engineeringDocs?.deviationPermit.actualResult}\n`;
    md += `- **围堵受控范围**：${action.engineeringDocs?.deviationPermit.affectedScope}\n`;
    md += `- **临时有效期**：${action.engineeringDocs?.deviationPermit.temporaryValidity}\n`;
    md += `- **纠正预防 (CAPA)**：${action.engineeringDocs?.deviationPermit.correctiveAction}\n`;
  }

  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const fileName = `ECU_Decision_Report_${cleanProjectName.replace(/[^\w\u4e00-\u9fa5-_]/g, '_')}_${new Date().toISOString().split('T')[0]}.md`;

  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportHtmlReport(
  context: ProjectContext,
  issue: IssueInput,
  result: CopilotAnalysisResult | null
): void {
  if (!result) return;
  const dateStr = new Date().toLocaleString('zh-CN');
  const projectName = (context.projectName || '车载硬件决策').replace(/[<>&]/g, '');

  const action = selectAction(result);
  const judgment = selectJudgment(result);
  if (!action || !judgment || !judgment.coreConclusion || !judgment.risk || !judgment.finalRecommendation) return;
  const actionRows = action.candidateActions.map((o, i) => {
    const veto = o.veto.rejection_veto ? '❌ 否决' : '✅ 候选';
    return '<tr><td>' + (i + 1) + '</td><td>' + String(o.name).replace(/[<>&]/g, '') + '</td><td>' + o.categoryLabel + '</td>' +
      '<td>' + o.scores.T + '</td><td>' + o.scores.S + '</td><td>' + o.scores.C + '</td><td>' + o.scores.Q + '</td><td>' + o.scores.L + '</td><td>' + o.scores.total + '</td><td>' + veto + '</td></tr>';
  }).join('');

  const whyReason = (judgment.finalRecommendation.whyReason || []).map((r) => '<li>' + String(r).replace(/[<>&]/g, '') + '</li>').join('');

  const html = [
    '<!DOCTYPE html>',
    '<html lang="zh-CN"><head><meta charset="utf-8"><title>' + projectName + ' 硬件工程决策报告</title>',
    '<style>body{font-family:-apple-system,"Segoe UI","Microsoft YaHei",sans-serif;max-width:820px;margin:24px auto;padding:0 20px;color:#1a202c;line-height:1.6}h1{font-size:20px;border-bottom:2px solid #2563eb;padding-bottom:8px}h2{font-size:16px;margin-top:24px;color:#2563eb}table{width:100%;border-collapse:collapse;font-size:12px;margin-top:8px}th,td{border:1px solid #cbd5e1;padding:6px 8px;text-align:left}th{background:#f1f5f9}.meta{color:#64748b;font-size:12px}.sig{margin-top:32px;display:flex;gap:48px}.sig div{border-top:1px solid #333;padding-top:6px;font-size:12px;width:160px}@media print{body{margin:0;padding:0}}</style></head><body>',
    '<h1>' + projectName + ' · 硬件工程决策与风险评估报告</h1>',
    '<div class="meta">生成时间：' + dateStr + ' ｜ 项目阶段：' + (context.projectPhase || '-') + ' ｜ 安全等级：' + (context.asilLevel || '-') + ' ｜ 剩余 ' + (context.daysRemaining ?? '-') + ' 天 ｜ 版本：v1.0（车规离线专家引擎）</div>',
    '<h2>1. 核心结论</h2>',
    '<p><strong>问题定性：</strong>' + String(judgment.coreConclusion.problemSummary || '').replace(/[<>&]/g, '') + '</p>',
    '<p><strong>推荐措施：</strong>' + String(judgment.coreConclusion.recommendedMeasure || '').replace(/[<>&]/g, '') + '</p>',
    '<h2>2. 风险评级</h2>',
    '<p>综合风险：<strong>' + (judgment.risk.overallRisk || '-') + '</strong>（风险分 ' + (judgment.risk.overallRiskScore ?? '-') + '）｜ 技术 ' + (judgment.risk.technicalRisk || '-') + ' ｜ 质量 ' + (judgment.risk.qualityRisk || '-') + ' ｜ 进度 ' + (judgment.risk.scheduleRisk || '-') + ' ｜ 成本 ' + (judgment.risk.costRisk || '-') + '</p>',
    '<h2>3. 失效与实测</h2>',
    '<p><strong>失效分类：</strong>' + (issue.issueCategories.join(', ') || '-') + '</p>',
    '<p><strong>失效现象：</strong>' + String(issue.failurePhenomenon || '-').replace(/[<>&]/g, '') + '</p>',
    '<p><strong>实测数据：</strong>' + String(issue.actualMeasurement || '-').replace(/[<>&]/g, '') + '</p>',
    '<p><strong>规格要求：</strong>' + String(issue.requirement || '-').replace(/[<>&]/g, '') + '</p>',
    '<h2>4. C-T-S-Q-L 候选方案权衡</h2>',
    '<table><thead><tr><th>#</th><th>方案</th><th>类型</th><th>T</th><th>S</th><th>C</th><th>Q</th><th>L</th><th>总分</th><th>状态</th></tr></thead><tbody>' + actionRows + '</tbody></table>',
    '<h2>5. 最终推荐</h2>',
    '<p><strong>推荐方案：</strong>' + String(judgment.finalRecommendation.recommendedOptionName || '').replace(/[<>&]/g, '') + '</p>',
    '<ul>' + whyReason + '</ul>',
    '<div class="sig"><div>硬件负责人（签字/日期）</div><div>质量经理（签字/日期）</div><div>项目经理（签字/日期）</div></div>',
    '</body></html>',
  ].join('');

  const win = window.open('', '_blank', 'width=920,height=1100');
  if (!win) {
    alert('浏览器拦截了弹窗，请允许弹窗后重试导出。');
    return;
  }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => { try { win.print(); } catch (e) { /* 忽略打印取消 */ } }, 350);
}


