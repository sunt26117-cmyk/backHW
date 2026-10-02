import express from 'express';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';

import { runExpertAnalysis } from './src/data/expertEngine';
import { getMultiDomainAdaptivePromptGuidance } from './src/utils/domainAdaptivePromptEngine';
import {
  resolveEngineeringDomain,
  resolveEngineeringDomains,
  getEngineeringDomainLabel,
  getDomainMeasurementFields,
  getDomainMeasurementGroups,
} from './src/utils/scenarioDomainEngine';
import { buildDualTimelinePlan } from './src/utils/dualTimelineEngine';
import { assessInputIntegrity, generatePromptIntegrityDirectives } from './src/utils/inputIntegrityEngine';
import { auditAiResult } from './src/utils/aiResultAuditor';
import { getCrossDomainCouplings } from './src/utils/crossDomainCouplingMatrix';
import { normalizeDecisionFrame } from './src/utils/decisionFrame';
import { runDeterministicPrecomputations } from './src/utils/deterministicPrecomputation';
import { buildGroundingText, findSimilarGoldCases } from './src/utils/aiGrounding';
import { CopilotAnalysisResult, DebugSnapshot } from './src/types';
import { validateAiResultStructure } from './src/utils/aiResultSchema';
import { buildAnalysisPrompt, HARDWARE_CHIEF_SYSTEM_PROMPT } from './src/utils/aiProtocol';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

// Anti-Stale Caching Middleware: ensure clients always fetch fresh index.html and sw.js
app.use((req, res, next) => {
  if (
    req.path === '/' ||
    req.path === '/sw.js' ||
    req.path.endsWith('.html') ||
    req.path.includes('/src/')
  ) {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    mode: '100% Offline Deterministic Expert Engine + Resilient LLM Inference',
    time: new Date().toISOString(),
  });
});

// Download Single-File Offline HTML (Double-click runnable without any server or network)
app.get('/api/download/offline-html', (req, res) => {
  const offlineFilePath = path.join(process.cwd(), 'dist', 'ecu-copilot-offline.html');
  if (fs.existsSync(offlineFilePath)) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="ECU_Hardware_Copilot_Offline.html"');
    res.sendFile(offlineFilePath);
  } else {
    const indexPath = path.join(process.cwd(), 'dist', 'index.html');
    if (fs.existsSync(indexPath)) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="ECU_Hardware_Copilot_Offline.html"');
      res.sendFile(indexPath);
    } else {
      res.status(404).send('Offline bundle is being generated, please wait a moment.');
    }
  }
});

// Download Full Source Code Zip Archive (for external AI review and offline analysis)
app.get(['/api/download/source-zip', '/downloads/ecu_hardware_copilot_full_source.zip'], (req, res) => {
  const zipPath = path.join(process.cwd(), 'public', 'downloads', 'ecu_hardware_copilot_full_source.zip');
  if (fs.existsSync(zipPath)) {
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="ecu_hardware_copilot_full_source.zip"');
    res.sendFile(zipPath);
  } else {
    res.status(404).send('Source zip archive not found.');
  }
});

// Download Full Source Code Tar.Gz Archive
app.get(['/api/download/source-tar', '/downloads/ecu_hardware_copilot_full_source.tar.gz'], (req, res) => {
  const tarPath = path.join(process.cwd(), 'public', 'downloads', 'ecu_hardware_copilot_full_source.tar.gz');
  if (fs.existsSync(tarPath)) {
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', 'attachment; filename="ecu_hardware_copilot_full_source.tar.gz"');
    res.sendFile(tarPath);
  } else {
    res.status(404).send('Source tar archive not found.');
  }
});


/**
 * AI 返回结构协议：字段结构与原 user prompt 的 JSON 示例保持一一对应。
 * OpenAI 走 strict json_schema；Gemini 使用同一语义转换为 @google/genai Schema 子集。
 */
const s = (description: string) => ({ type: 'string', description });
const n = (description: string) => ({ type: 'number', description });
const i = (description: string) => ({ type: 'integer', description });
const b = (description: string) => ({ type: 'boolean', description });
const arr = (items: Record<string, unknown>, description: string) => ({ type: 'array', items, description });
const obj = (properties: Record<string, Record<string, unknown>>, descriptions: string) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
  description: descriptions,
});

const COPILOT_RESULT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'coreConclusion', 'decisionFrame', 'multiDomainAnalysis', 'riskRatings', 'knownFacts', 'assumptions',
    'citedFields', 'unknowns', 'physicalMechanism', 'dfmeaView', 'candidateActions', 'finalRecommendation', 'dualTimeline',
  ],
  properties: {
    coreConclusion: obj({
      problemSummary: s('问题总结'),
      recommendedMeasure: s('推荐措施'),
      reasonSummary: s('推荐理由总结'),
    }, '核心结论'),
    decisionFrame: obj({
      decisionQuestion: s('明确回答当前是否继续推进、放行或改版'),
      currentDecisionGate: s('当前工程门禁'),
      decisionWindow: s('结合剩余天数给出的实际决策窗口'),
      bestNextAction: s('未来24小时最重要的一项动作'),
      minimumEvidenceToProceed: arr(s('最小必要证据'), '进入下一阶段前必须取得的最小证据'),
      unknownsBlockingDecision: arr(s('阻塞决策的未知量'), '当前阻塞决策的关键未知量'),
      reversalCriteria: arr(s('反转条件'), '出现这些证据时需要推翻当前建议'),
    }, '决策框架'),
    multiDomainAnalysis: obj({
      primaryDomain: s('主导工程域'),
      relatedDomains: arr(s('关联工程域'), '次级相关工程域'),
      domainAssessments: arr(obj({
        domain: s('工程域'), role: s('PRIMARY 或 RELATED'), evidenceLevel: s('HIGH、MEDIUM_INFERRED 或 LOW'),
        knownFacts: arr(s('已知事实'), '该域已知事实'), evidenceGaps: arr(s('证据缺口'), '该域证据缺口'),
        minimumValidation: s('最小验证动作'), domainConclusion: s('域级结论'),
      }, '单个工程域评估'), '各工程域证据评估'),
      crossDomainLinks: arr(obj({
        fromDomain: s('起始工程域'), toDomain: s('目标工程域'), mechanism: s('跨域物理机制'),
        evidenceBasis: s('MEASURED、CALCULATED 或 ASSUMPTION'), impact: s('跨域影响'),
      }, '跨域联系'), '跨工程域耦合关系'),
      crossDomainVetoes: arr(obj({
        condition: s('否决条件'), blocks: arr(s('被阻断的发布门禁'), '被否决的流程动作'), rationale: s('否决理由'),
      }, '跨域否决'), '跨域硬性否决条件'),
    }, '多工程域分析'),
    riskRatings: obj({
      overallRisk: s('High、Medium-High、Medium 或 Low'), overallRiskScore: n('综合风险分数'),
      technicalRisk: s('技术风险等级'), qualityRisk: s('质量风险等级'), scheduleRisk: s('进度风险等级'),
      costRisk: s('成本风险等级'), reliabilityRisk: s('可靠性风险等级'), functionalSafetyRisk: s('功能安全风险等级'),
    }, '风险评级'),
    knownFacts: arr(s('已核实事实'), '当前工况的已知事实'),
    assumptions: arr(s('工程假设'), '必须显式标记、待验证的假设'),
    citedFields: arr(s('证据引用键，例如 measuredValues.xxx / baseline.analysisBasis.calculatedOutputs:xxx / precomputed.xxx'), '关键数值结论的证据引用'),
    unknowns: arr(s('未知项'), '尚未得到证据支持的工程未知量'),
    physicalMechanism: obj({
      rootCauseAnalysis: s('根因分析'),
      keyPhysicalFactors: arr(obj({ factor: s('物理因子'), description: s('因子描述') }, '关键物理因子'), '关键物理影响因子'),
    }, '物理失效机理'),
    dfmeaView: obj({
      failureMode: s('失效模式'), failureCause: s('失效原因'), localEffect: s('局部效应'),
      systemEffect: s('系统效应'), vehicleEffect: s('整车效应'), severity: i('DFMEA 严重度'), occurrence: i('DFMEA 发生度'),
      detection: i('DFMEA 探测度'), safetyImpact: b('是否影响功能安全'), regulatoryImpact: b('是否影响法规/认证'), massProductionImpact: b('是否影响量产'),
    }, 'DFMEA 视角'),
    candidateActions: arr(obj({
      id: s('方案ID'), category: s('conservative、agile 或 radical'), categoryLabel: s('方案类型中文标签'), name: s('方案名称'),
      description: s('方案描述'), expectedBenefit: s('预期收益'),
      scores: obj({ T: n('技术维度分数'), S: n('进度维度分数'), C: n('成本维度分数'), Q: n('质量维度分数'), L: n('可靠性维度分数'), total: n('加权总分') }, '方案评分'),
      veto: obj({ rejection_veto: b('是否触发一票否决') }, '方案否决状态'), riskDelta: s('风险变化'), residualRisk: s('残余风险等级'), residualRiskDetail: s('残余风险说明'),
      sideEffects: s('副作用'), verificationCost: s('验证成本'), timeCost: s('时间成本'), failureConsequence: s('失败后果'), preconditions: s('前置条件'),
      verificationMethod: s('具体验证方法'), citedFields: arr(s('证据引用键'), '该候选方案涉及的数值证据引用'),
      crossDomainCouplingChecks: arr(obj({ rule: s('被复核的跨域规则'), addressed: b('是否已处理'), note: s('复核说明') }, '跨域复核项'), '逐条跨域复核'),
      planB: s('备选方案B'), decisionFit: s('与当前工期和门禁的匹配性'), fastestValidation: s('最快验证周期'), latestDecisionPoint: s('最晚切换决策点'), rejectionReason: s('不推荐时的主要拒绝原因'),
    }, '候选方案'), '候选方案列表'),
    finalRecommendation: obj({
      recommendedOptionId: s('最终推荐方案ID'), recommendedOptionName: s('最终推荐方案名称'), recommendationGrade: s('推荐等级'),
      whyReason: arr(s('推荐依据'), '选择该方案的理由'),
      immediateSteps: arr(obj({ step: i('步骤序号'), title: s('步骤标题'), action: s('动作'), owner: s('责任角色'), deadline: s('截止时间') }, '立即行动步骤'), '未来阶段的立即动作'),
      preconditions: arr(s('推荐方案前置条件'), '方案成立前置条件'), unacceptableActions: arr(s('不可接受动作'), '明确不能执行的动作'),
      stopConditions: arr(s('停止条件'), '必须停止当前方案的条件'), reEvaluationTriggers: arr(s('重新评估触发条件'), '触发重新评估的证据'), planB: s('方案B'),
    }, '最终推荐'),
    dualTimeline: obj({
      containmentPhase: obj({
        phaseTag: s('T_PLUS_24H_CONTAINMENT'), timeWindow: s('T+24h 应急临时遏制窗口'), title: s('遏制标题'), objective: s('遏制目标'),
        hardwareImpact: s('硬件影响'), responsibilityRole: s('责任角色'),
        actions: arr(obj({ step: s('步骤'), detail: s('动作细节'), owner: s('责任人'), duration: s('预计耗时'), hardwareImpact: s('硬件影响'), deliverable: s('交付物') }, '遏制动作'), 'T+24h动作'),
        verificationCriteria: s('验证准则'), exitCriteria: s('退出准则'),
      }, 'T+24h临时遏制'),
      permanentPhase: obj({
        phaseTag: s('NEXT_PHASE_PERMANENT'), timeWindow: s('下一版永久纠正窗口'), title: s('永久纠正标题'), objective: s('永久纠正目标'),
        hardwareImpact: s('硬件影响'), responsibilityRole: s('责任角色'),
        actions: arr(obj({ step: s('步骤'), detail: s('动作细节'), owner: s('责任人'), duration: s('预计耗时'), hardwareImpact: s('硬件影响'), deliverable: s('交付物') }, '永久纠正动作'), '永久纠正动作列表'),
        verificationCriteria: s('验证准则'), exitCriteria: s('退出准则'),
      }, '永久纠正'),
      strategicTradeoff: s('双时间轴的策略权衡'),
    }, '双层时间轴'),
  },
};

/** Gemini responseSchema 仅接受 @google/genai Schema/OpenAPI 子集；转换类型大小写并移除 OpenAI 专用 additionalProperties。 */
function toGeminiResponseSchema(schema: any): any {
  if (Array.isArray(schema)) return schema.map(toGeminiResponseSchema);
  if (!schema || typeof schema !== 'object') return schema;
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === 'additionalProperties') continue;
    if (key === 'type' && typeof value === 'string') {
      out[key] = value.toUpperCase();
      continue;
    }
    if (key === 'properties' && value && typeof value === 'object') {
      out[key] = Object.fromEntries(Object.entries(value as Record<string, any>).map(([k, v]) => [k, toGeminiResponseSchema(v)]));
      continue;
    }
    out[key] = toGeminiResponseSchema(value);
  }
  return out;
}
const COPILOT_RESULT_GEMINI_SCHEMA = toGeminiResponseSchema(COPILOT_RESULT_JSON_SCHEMA);

/**
 * 说明(2026-09-20 修复)：DeepSeek 官方 API (api.deepseek.com) 的 JSON Output
 * 文档只承诺支持 response_format: {type:'json_object'}，并且明确要求
 * "prompt 中必须出现 json 字样 + 给出期望结构的示例"，否则模型是在"盲写"结构。
 * 原代码对所有非 reasoner 的 OpenAI 兼容端点一律下发 json_schema+strict，
 * 这对官方 DeepSeek API 是未文档化行为：可能被静默忽略、可能导致输出更不
 * 稳定/更慢，且 prompt 里又完全没有写出字段结构（依赖协议层 schema），
 * 双重削弱了结构化程度，也更容易触发解析失败 -> 二次修复调用 -> 总耗时翻倍。
 * 这里按 baseUrl 判断，不支持 json_schema 的端点自动退回 json_object，
 * 并在调用处把字段结构以纯文本形式写回 prompt（见 buildJsonFieldOutline）。
 */
function supportsStrictJsonSchema(baseUrl: string | undefined): boolean {
  const b = (baseUrl || '').toLowerCase();
  if (b.includes('deepseek.com')) return false;
  return true;
}

/** 把协议层 JSON Schema 递归转成一份简洁的纯文本字段清单（字段名 + 中文说明），
 * 供 json_object 模式的端点按图索骥填充，避免在没有 schema 强约束时"盲写"结构。*/
function buildJsonFieldOutline(schema: any, indent = ''): string {
  if (!schema || typeof schema !== 'object') return '';
  if (schema.type === 'object' && schema.properties) {
    return Object.entries(schema.properties as Record<string, any>)
      .map(([key, value]) => {
        const desc = value?.description ? ` — ${value.description}` : '';
        const nested = buildJsonFieldOutline(value, indent + '  ');
        return `${indent}- ${key}${desc}${nested ? '\n' + nested : ''}`;
      })
      .join('\n');
  }
  if (schema.type === 'array' && schema.items) {
    return buildJsonFieldOutline(schema.items, indent);
  }
  return '';
}
const COPILOT_RESULT_FIELD_OUTLINE = buildJsonFieldOutline(COPILOT_RESULT_JSON_SCHEMA);

/**
 * 响应修复容错拦截器 (Schema Healing Pipeline)
 * 纯函数管道清洗大模型残缺/带有 Markdown 代码块的返回
 */
function healAndParseJson(raw: string): any {
  if (!raw || typeof raw !== 'string') {
    throw new Error('Raw response is empty or non-string');
  }
  let cleaned = raw.trim();

  // 1. 剔除开头的 ```json 或 ``` 及结尾的 ```
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  // 2. 提取最外层的 { ... }
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }

  // 3. 处理偶发的转义字符或尾逗号问题
  try {
    return JSON.parse(cleaned);
  } catch (firstErr) {
    // 尝试去除对象/数组尾部多余逗号 (Trailing commas)
    const fixedComma = cleaned
      .replace(/,\s*([}\]])/g, '$1')
      .replace(/[\u0000-\u001F]+/g, (match) => (match === '\n' || match === '\r' || match === '\t' ? match : ''));
    return JSON.parse(fixedComma);
  }
}

/**
 * 校验远端模型端点 URL，收紧 SSRF 暴露面：仅允许 http/https，拒绝 URL 内嵌凭据。
 * 不阻断回环/内网地址——自定义网关/Ollama/企业私网场景以 localhost 与私有网为合法目标。
 */
function assertSafeBaseUrl(raw: string): URL {
  const url = new URL(raw);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`不支持的端点协议 (${url.protocol})，仅允许 http/https`);
  }
  if (url.username || url.password) {
    throw new Error('端点 URL 不得内嵌用户名/密码凭据');
  }
  return url;
}

/**
 * 通用 OpenAI 兼容协议调用函数 (支持 DeepSeek, 阿里通义千问, 智谱 GLM, 月之暗面, 硅基流动等)
 * 超时按模型架构动态区分：推理/思考模型（R1, O1, Reasoner）给予 120s，常规模型 55s
 */
async function callCustomOpenAIModel(
  config: {
    baseUrl: string;
    apiKey: string;
    model: string;
    temperature?: number;
  },
  prompt: string,
  systemPrompt: string
): Promise<string> {
  assertSafeBaseUrl(config.baseUrl);
  let normalizedBase = config.baseUrl.trim().replace(/\/+$/, '');
  if (!normalizedBase.endsWith('/chat/completions')) {
    normalizedBase = `${normalizedBase}/chat/completions`;
  }

  const modelLower = (config.model || '').toLowerCase();
  // 仅按明确的推理/思考类模型标识判定 reasoner，不再用 '-pro' 子串：
  // 否则 deepseek-v4-pro / *-pro 这类常规旗舰模型会被静默跳过 response_format 与 temperature，
  // 让其在无 json_schema 强约束下盲写深层嵌套 JSON，反而更易触发解析失败 -> 自愈重试。
  const isReasoner =
    modelLower.includes('reasoner') ||
    modelLower.includes('deepseek-r1') ||
    modelLower.includes('o1') ||
    modelLower.includes('o3') ||
    modelLower.includes('thinking');

  // 说明(2026-09-20 修复)：原 75s/150s 阈值是按"简单问答"估算的，
  // 但本系统每次 /api/copilot/analyze 请求都会拼装完整 grounding 长文本
  // (专家基线 + 预计算事实 + 金标准案例 + 跨域耦合矩阵 + 领域指南) 并强制要求
  // 一个覆盖 dfmeaView/candidateActions/dualTimeline 等十余个大对象的深层
  // COPILOT_RESULT_JSON_SCHEMA 结构化输出。这类"大输入+大结构化输出"请求
  // 常规模型也经常需要 90~150s，75s 会在模型即将完成时被 AbortController
  // 打断，前端因此长时间等待后仍然拿不到 AI 结果（只能静默降级到本地引擎）。
  const timeoutMs = isReasoner ? 240000 : 170000;

  const bodyPayload: Record<string, any> = {
    model: config.model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt },
    ],
  };

  // 按端点能力下发 response_format：官方 DeepSeek API 等只承诺 json_object，
  // 盲目下发 json_schema+strict 属于未文档化行为。json_object 模式下 DeepSeek
  // 官方文档要求显式设置 max_tokens 防止大 JSON 被截断，这里一并处理。
  if (!isReasoner) {
    if (supportsStrictJsonSchema(config.baseUrl)) {
      bodyPayload.response_format = {
        type: 'json_schema',
        json_schema: { name: 'copilot_result', schema: COPILOT_RESULT_JSON_SCHEMA, strict: true },
      };
    } else {
      bodyPayload.response_format = { type: 'json_object' };
      bodyPayload.max_tokens = 8192;
    }
  }

  // 某些特定推理模型禁止传递 temperature 参数
  if (!isReasoner && typeof config.temperature === 'number') {
    bodyPayload.temperature = config.temperature;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(normalizedBase, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey.trim()}`,
      },
      body: JSON.stringify(bodyPayload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`API HTTP ${response.status} (${response.statusText}): ${errText.slice(0, 300)}`);
    }

    const data: any = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('模型未返回有效文本内容 (choices[0].message.content 为空)');
    }
    return content;
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error(`模型响应超时 (${timeoutMs / 1000}s)，建议选择响应更快的模型或重试`);
    }
    throw err;
  }
}

/**
 * Google GenAI 调用函数 (支持 Gemini 2.5 Flash / Pro 及环境变量 GEMINI_API_KEY)
 * 根据模型版本智能调整超时 (Pro / Thinking 给予 120s，Flash 给予 60s)
 */
async function callGeminiModel(
  config: {
    apiKey?: string;
    model?: string;
    temperature?: number;
  },
  prompt: string,
  systemPrompt: string
): Promise<string> {
  const apiKey = config.apiKey?.trim() || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('未检测到有效 Gemini API Key (可在此处填入或设置服务端环境变量 GEMINI_API_KEY)');
  }

  const ai = new GoogleGenAI({ apiKey });
  const modelName = config.model?.trim() || 'gemini-2.5-flash';

  // 说明(2026-09-20 修复)：默认模型 gemini-2.5-flash 不含 "pro"/"thinking"
  // 字样，会被判定为"快模型"只给 75s。但 2.5 系列默认开启动态思考
  // (dynamic thinking)，且本接口的 prompt 与强制 responseSchema 都非常大，
  // 实测常规工况下也可能需要 90~150s+ 才能返回完整合法 JSON。75s 超时会
  // 在模型即将生成完毕时被中止，这正是"AI 调用超过 75 秒就拿不到执行分析
  // 结果"的根因。此处统一给足时间，并保留 pro/thinking 更长的窗口。
  const isSlowGemini = modelName.toLowerCase().includes('pro') || modelName.toLowerCase().includes('thinking');
  const timeoutMs = isSlowGemini ? 240000 : 170000;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: 'application/json',
        responseSchema: COPILOT_RESULT_GEMINI_SCHEMA,
        temperature: typeof config.temperature === 'number' ? config.temperature : 0.2,
        abortSignal: controller.signal,
      },
    });
  } finally {
    clearTimeout(timeoutId);
  }

  const content = response.text;
  if (!content) {
    throw new Error('Gemini 模型未返回有效文本内容');
  }
  return content;
}

/**
 * 带有“自愈重问 + JSON解析单次修复”的弹性模型调用器
 */
async function queryModelWithResilience(
  modelConfig: any,
  prompt: string,
  systemPrompt: string
): Promise<{ rawContent: string; parsed: any; retryCount: number }> {
  let retryCount = 0;
  let rawContent = '';

  const isGemini =
    modelConfig.provider === 'gemini' ||
    (modelConfig.model && modelConfig.model.toLowerCase().includes('gemini'));

  // 1. 初次调用
  if (isGemini) {
    rawContent = await callGeminiModel(
      {
        apiKey: modelConfig.apiKey,
        model: modelConfig.model,
        temperature: modelConfig.temperature ?? 0.2,
      },
      prompt,
      systemPrompt
    );
  } else {
    rawContent = await callCustomOpenAIModel(
      {
        baseUrl: modelConfig.baseUrl,
        apiKey: modelConfig.apiKey,
        model: modelConfig.model,
        temperature: modelConfig.temperature ?? 0.2,
      },
      prompt,
      systemPrompt
    );
  }

  // 2. 尝试解析 JSON
  try {
    const parsed = healAndParseJson(rawContent);
    return { rawContent, parsed, retryCount };
  } catch (parseErr: any) {
    // 触发单次 JSON 语法修复重问 (待办 5.2)
    retryCount++;
    console.warn(`JSON 解析失败 (${parseErr.message})，发起单次语法自愈修复重试...`);
    const fixPrompt = `你上一次的输出未能通过 JSON.parse 标准解析，解析错误信息: ${parseErr.message}。
你上一次的原始输出如下（可能包含多余文字、未闭合括号、被截断或使用了非法转义）：
---
${rawContent.slice(0, 8000)}
---
【紧急要求】：请只输出修正后的合法纯 JSON 对象本身：不要包含任何 Markdown 代码块标记（如 \`\`\`json）、不要包含任何前言或解释文字、不要改变原有字段的实质内容，只修正 JSON 语法结构本身：`;

    let healedRaw = '';
    if (isGemini) {
      healedRaw = await callGeminiModel(
        { apiKey: modelConfig.apiKey, model: modelConfig.model, temperature: 0.1 },
        fixPrompt,
        'You are a strict JSON formatting validator. Output pure valid JSON only.'
      );
    } else {
      healedRaw = await callCustomOpenAIModel(
        { baseUrl: modelConfig.baseUrl, apiKey: modelConfig.apiKey, model: modelConfig.model, temperature: 0.1 },
        fixPrompt,
        'You are a strict JSON formatting validator. Output pure valid JSON only.'
      );
    }
    const parsed = healAndParseJson(healedRaw);
    return { rawContent: healedRaw, parsed, retryCount };
  }
}

// 模型 API 连通性测试接口
app.post('/api/copilot/test-model', async (req, res) => {
  try {
    const { baseUrl, apiKey, model, provider } = req.body;
    const startTime = Date.now();

    if (provider === 'gemini') {
      const key = apiKey?.trim() || process.env.GEMINI_API_KEY;
      if (!key) {
        return res.status(400).json({
          success: false,
          error: '请提供 Gemini API Key 或设置服务端环境变量 GEMINI_API_KEY',
        });
      }

      const ai = new GoogleGenAI({ apiKey: key });
      const testModel = model?.trim() || 'gemini-2.5-flash';

      const response = await ai.models.generateContent({
        model: testModel,
        contents: '这是一次车规硬件决策系统 API 连通性检测，请仅回复："CONNECTED"',
      });

      const latency = Date.now() - startTime;
      const reply = response.text?.trim() || 'CONNECTED';

      return res.json({
        success: true,
        latency,
        reply,
        model: testModel,
        message: `成功连接至 Gemini (${testModel}) (延迟 ${latency}ms)`,
      });
    }

    if (!apiKey || !baseUrl || !model) {
      return res.status(400).json({
        success: false,
        error: '请提供完整的 Base URL、API Key 与 Model 名称',
      });
    }
    try {
      assertSafeBaseUrl(baseUrl);
    } catch (urlErr) {
      return res.status(400).json({ success: false, error: (urlErr as Error).message });
    }
    let normalizedBase = baseUrl.trim().replace(/\/+$/, '');
    if (!normalizedBase.endsWith('/chat/completions')) {
      normalizedBase = `${normalizedBase}/chat/completions`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const testPayload = {
      model: model.trim(),
      messages: [{ role: 'user', content: '这是一次车规硬件决策系统 API 连通性检测，请仅回复："CONNECTED"' }],
      max_tokens: 30,
    };

    const response = await fetch(normalizedBase, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey.trim()}`,
      },
      body: JSON.stringify(testPayload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const latency = Date.now() - startTime;

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({
        success: false,
        latency,
        error: `连接失败 HTTP ${response.status}: ${errText.slice(0, 300)}`,
      });
    }

    const data: any = await response.json();
    const reply = data.choices?.[0]?.message?.content || 'CONNECTED';

    return res.json({
      success: true,
      latency,
      reply: reply.trim(),
      model: data.model || model,
      message: `成功连接至 ${model} (延迟 ${latency}ms)`,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: `网络或请求异常: ${err.message}`,
    });
  }
});

/**
 * 校验并用本地车规基准补全大模型推理结果，保证 100% 严谨性与输入工况强绑定
 */
function validateAndEnrichAiResult(
  parsed: any,
  baseline: any,
  modelName: string,
  context: any,
  issue: any,
  integrityAssessment?: any
): any {
  if (!parsed || typeof parsed !== 'object') {
    return baseline;
  }
  // 确保核心结论完整
  if (!parsed.coreConclusion || !parsed.coreConclusion.problemSummary) {
    parsed.coreConclusion = baseline.coreConclusion;
  }
  // 确保物理机理完整
  if (!parsed.physicalMechanism || !parsed.physicalMechanism.rootCauseAnalysis) {
    parsed.physicalMechanism = baseline.physicalMechanism;
  }
  // 确保风险评级完整
  if (!parsed.riskRatings || !parsed.riskRatings.overallRisk) {
    parsed.riskRatings = baseline.riskRatings;
  }
  // 确保候选方案非空
  if (!Array.isArray(parsed.candidateActions) || parsed.candidateActions.length === 0) {
    parsed.candidateActions = baseline.candidateActions;
  }
  // 确保最终推荐方案非空
  if (!parsed.finalRecommendation || !parsed.finalRecommendation.recommendedOptionName) {
    parsed.finalRecommendation = baseline.finalRecommendation;
  }
  // 补充专业工程视图与基线
  parsed.dfmeaView = parsed.dfmeaView || baseline.dfmeaView;
  parsed.containment = parsed.containment || baseline.containment;
  parsed.capa = parsed.capa || baseline.capa;
  parsed.raciMatrix = parsed.raciMatrix || baseline.raciMatrix;
  parsed.engineeringDocs = parsed.engineeringDocs || baseline.engineeringDocs;
  parsed.classifiedInfo = parsed.classifiedInfo || baseline.classifiedInfo;
  parsed.multiRiskBreakdown = parsed.multiRiskBreakdown || baseline.multiRiskBreakdown;
  parsed.whyNotComparison = parsed.whyNotComparison || baseline.whyNotComparison;
  parsed.next24HourPlan = parsed.next24HourPlan || baseline.next24HourPlan;
  parsed.edrRecord = parsed.edrRecord || baseline.edrRecord;
  parsed.redTeamChallenge = parsed.redTeamChallenge || baseline.redTeamChallenge;

  const md = parsed.multiDomainAnalysis;
  if (!md || typeof md !== 'object') {
    const primaryDomain = resolveEngineeringDomain(issue);
    const relatedDomains = resolveEngineeringDomains(issue).filter((d) => d !== primaryDomain);
    parsed.multiDomainAnalysis = {
      primaryDomain,
      relatedDomains,
      domainAssessments: [primaryDomain, ...relatedDomains].map((domain, index) => ({
        domain,
        role: index === 0 ? 'PRIMARY' : 'RELATED',
        evidenceLevel: 'MEDIUM_INFERRED',
        knownFacts: [],
        evidenceGaps: ['当前分析未返回该域独立分层'],
        minimumValidation: '补齐该领域最小实测证据后重新核对',
        domainConclusion: '证据不足，需台架闭环',
      })),
      crossDomainLinks: [],
      crossDomainVetoes: [],
    };
  } else {
    md.primaryDomain = md.primaryDomain || resolveEngineeringDomain(issue);
    md.relatedDomains = Array.isArray(md.relatedDomains)
      ? md.relatedDomains
      : resolveEngineeringDomains(issue).filter((d) => d !== md.primaryDomain);
    md.domainAssessments = Array.isArray(md.domainAssessments) ? md.domainAssessments : [];
    md.crossDomainLinks = Array.isArray(md.crossDomainLinks) ? md.crossDomainLinks : [];
    md.crossDomainVetoes = Array.isArray(md.crossDomainVetoes) ? md.crossDomainVetoes : [];
  }

  parsed.dualTimeline = parsed.dualTimeline || baseline.dualTimeline || buildDualTimelinePlan(parsed, context, issue);
  parsed.decisionFrame = normalizeDecisionFrame(parsed.decisionFrame, {
    decisionQuestion: `${context?.nextMilestone || '下一工程门禁'} 前是否具备继续推进的证据条件`,
    currentDecisionGate: context?.nextMilestone || '当前工程门禁',
    decisionWindow: `剩余 ${context?.daysRemaining ?? 14} 天`,
    bestNextAction: parsed.finalRecommendation?.immediateSteps?.[0]?.action || '先完成当前关键未知量的最小验证',
    minimumEvidenceToProceed: [parsed.finalRecommendation?.preconditions?.[0] || '关键实测证据达到项目规范门槛'],
    unknownsBlockingDecision: Array.isArray(parsed.unknowns) ? parsed.unknowns.slice(0, 5) : ['关键输入数据不足'],
    reversalCriteria: Array.isArray(parsed.finalRecommendation?.reEvaluationTriggers)
      ? parsed.finalRecommendation.reEvaluationTriggers.slice(0, 5)
      : ['关键实测证据与当前物理假设不一致'],
  });

  parsed.provenance = {
    executionMode: 'ONLINE_AI_INFERRED',
    engineName: `云端大模型 (${modelName}) 工况强定锚推理`,
    isAiInferred: true,
    isDeterministicRule: false,
    generatedAt: new Date().toLocaleTimeString(),
    modelIdentifier: modelName,
    transparencyNote: `本分析由云端大模型 [${modelName}] 严格限定在【${context?.projectName || '车载项目'} · ${context?.projectPhase || 'DV'}】输入工况及实测数据【${issue?.actualMeasurement || issue?.failurePhenomenon || '实测数据'}】下推演生成，严禁脱离实际随意作答。`,
  };

  // 执行车规级 AI 结果全栈审计与防幻觉校准
  const { sanitizedResult } = auditAiResult(parsed, baseline, context, issue, integrityAssessment);
  return sanitizedResult;
}

// 专属接口：实时评估输入完整度等级，供前端交互感知
app.post('/api/copilot/assess-input', (req, res) => {
  try {
    const { context, issue } = req.body;
    const assessment = assessInputIntegrity(context, issue);
    res.json({ success: true, assessment });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 离线人工 LLM 循环：把完整 Prompt 导出给免费 AI，再把 AI 的 JSON 结果粘贴回来自动审计渲染。
app.post('/api/copilot/build-prompt', (req, res) => {
  try {
    const { context, issue } = req.body || {};
    const built = buildAnalysisPrompt(context || {}, issue || {});
    return res.json({ success: true, systemPrompt: built.systemPrompt, userPrompt: built.userPrompt, fullPrompt: built.systemPrompt + '\n\n---USER---\n\n' + built.userPrompt });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 导入免费 AI 返回的 JSON，走同一套解析+审计管线后自动渲染。
app.post('/api/copilot/import-ai-result', (req, res) => {
  try {
    const { context, issue, aiContent } = req.body || {};
    if (!aiContent || typeof aiContent !== 'string') {
      return res.status(400).json({ success: false, error: '缺少 aiContent（AI 返回的 JSON 文本）' });
    }
    const built = buildAnalysisPrompt(context || {}, issue || {});
    const parsed = healAndParseJson(aiContent);
    const structureCheck = validateAiResultStructure(parsed);
    if (!structureCheck.valid) {
      return res.status(400).json({
        success: false,
        error: 'AI 返回的 JSON 结构有问题，请让免费 AI 修正后重试：' + structureCheck.issues.map((i) => i.path + ' → ' + i.message).join('；'),
        structureIssues: structureCheck.issues,
      });
    }
    const enriched = validateAndEnrichAiResult(parsed, built.baseline, 'offline-free-ai', context || {}, issue || {}, built.integrityAssessment);
    const audited = auditAiResult(enriched, built.baseline, context || {}, issue || {}, built.integrityAssessment);
    const finalData = audited.sanitizedResult;
    if (finalData && finalData.provenance) {
      finalData.provenance.inputIntegrity = built.integrityAssessment;
      finalData.provenance.aiAudit = audited.auditResult;
    }
    return res.json({ success: true, data: finalData, result: finalData, source: 'offline-free-ai', aiAudit: audited.auditResult });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// AI Analysis Endpoint (主推理与决策推演接口)
// AI Analysis Endpoint (主推理与决策推演接口)
app.post('/api/copilot/analyze', async (req, res) => {
  const startTime = Date.now();
  try {
    const { context, issue, modelConfig, customAiResponse } = req.body;

    // Prompt / Grounding 唯一来源：在线分析与离线导出必须使用同一个构建器。
    const builtPrompt = buildAnalysisPrompt(context || {}, issue || {}, modelConfig);
    const { baseline, integrityAssessment, precomputedFacts } = builtPrompt;
    const finalPrompt = builtPrompt.userPrompt;
    // 9. 调度模型执行与自愈降级处理
    let finalData: CopilotAnalysisResult | null = null;
    let usedSource = 'deterministic-expert';
    let modelNameUsed = 'deterministic-rules';
    let retryAttempts = 0;

    const isCustomModelConfigured =
      modelConfig &&
      modelConfig.enabled &&
      modelConfig.apiKey &&
      modelConfig.baseUrl &&
      modelConfig.model &&
      modelConfig.provider !== 'builtin';

    const isGeminiConfigured =
      modelConfig &&
      modelConfig.enabled &&
      (modelConfig.provider === 'gemini' || (modelConfig.model && modelConfig.model.toLowerCase().includes('gemini')));

    if (customAiResponse) {
      try {
        const parsed = typeof customAiResponse === 'string' ? JSON.parse(customAiResponse) : customAiResponse;
        usedSource = 'injected-ai:custom-evaluation';
        modelNameUsed = 'evaluator-ai';
        finalData = validateAndEnrichAiResult(
          parsed,
          baseline,
          'evaluator-ai',
          context,
          issue,
          integrityAssessment
        );
      } catch (injectedErr: any) {
        console.warn('解析注入的 AI 响应失败，使用基线:', injectedErr.message);
        finalData = runExpertAnalysis(context, issue);
      }
    } else if (isGeminiConfigured || isCustomModelConfigured) {
      try {
        const { rawContent, parsed, retryCount } = await queryModelWithResilience(
          modelConfig,
          finalPrompt,
          HARDWARE_CHIEF_SYSTEM_PROMPT
        );
        retryAttempts = retryCount;
        modelNameUsed = modelConfig.model;
        usedSource = isGeminiConfigured ? `gemini:${modelConfig.model}` : `custom-llm:${modelConfig.model}`;

        finalData = validateAndEnrichAiResult(
          parsed,
          baseline,
          modelConfig.model,
          context,
          issue,
          integrityAssessment
        );
      } catch (callErr: any) {
        console.warn(`云端模型 (${modelConfig?.model}) 推演异常，平滑启用确定性专家引擎:`, callErr.message);
        finalData = runExpertAnalysis(context, issue);
        if (finalData.provenance) {
          finalData.provenance.inputIntegrity = integrityAssessment;
        }
        usedSource = 'deterministic-expert';
        modelNameUsed = 'deterministic-expert';
      }
    } else {
      // 默认使用 100% 本地车规级确定性专家系统
      finalData = runExpertAnalysis(context, issue);
      if (finalData.provenance) {
        finalData.provenance.inputIntegrity = integrityAssessment;
      }
    }

    // strict 模式收口：前面各分支都会给 finalData 赋值，这里做一次编译期收口，避免 possibly null。
    finalData = finalData ?? runExpertAnalysis(context, issue);

    // [健壮性收口] 无论是缺省、还是 AI / 缓存回灌的畸形结构（数组字段被写成字符串），
    // 统一在此归一化，保证下游 UI 的 .slice().join() / .map() 不会崩溃。
    {
      const dfDefaults = {
        decisionQuestion: `${context?.nextMilestone || '下一工程门禁'} 前是否具备继续推进的证据条件`,
        currentDecisionGate: context?.nextMilestone || '当前工程门禁',
        decisionWindow: `剩余 ${context?.daysRemaining ?? 14} 天`,
        bestNextAction: finalData.finalRecommendation?.immediateSteps?.[0]?.action || '先完成当前关键未知量的最小验证',
        minimumEvidenceToProceed: [finalData.finalRecommendation?.preconditions?.[0] || '关键实测证据达到项目规范门槛'],
        unknownsBlockingDecision: Array.isArray(finalData.unknowns) ? finalData.unknowns.slice(0, 5) : ['关键输入数据不足'],
        reversalCriteria: Array.isArray(finalData.finalRecommendation?.reEvaluationTriggers)
          ? finalData.finalRecommendation.reEvaluationTriggers.slice(0, 5)
          : ['关键实测证据与当前物理假设不一致'],
      };
      finalData.decisionFrame = normalizeDecisionFrame(finalData.decisionFrame, dfDefaults);
    }
    if (finalData.coreConclusion && !finalData.coreConclusion.coreRiskGrade) {
      finalData.coreConclusion.coreRiskGrade = finalData.riskRatings?.overallRisk || 'Medium';
    }

    const elapsedMs = Date.now() - startTime;

    // 10. 挂载调试快照 (DebugSnapshot - 待办 5.3)
    const debugSnapshot: DebugSnapshot = {
      promptLength: finalPrompt.length,
      promptSnippet: finalPrompt.slice(0, 320) + '...',
      modelIdentifier: modelNameUsed,
      latencyMs: elapsedMs,
      timestamp: new Date().toISOString(),
      precomputedFactsCount: precomputedFacts.length,
      autoFixesCount: finalData?.aiAudit?.autoFixSummary?.length || 0,
      auditedRuleHits: finalData?.aiAudit?.flags?.length || 0,
      retryCount: retryAttempts,
    };

    if (finalData) {
      finalData.debugSnapshot = debugSnapshot;
      if (finalData.provenance) {
        finalData.provenance.debugSnapshot = debugSnapshot;
      }
    }

    res.setHeader('X-Engine-Source', usedSource);
    return res.json({
      success: true,
      data: finalData,
      result: finalData,
      source: usedSource,
      model: modelNameUsed,
      debugSnapshot,
    });
  } catch (error: any) {
    const errorMsg = error?.message || String(error);
    const { context, issue } = req.body;
    const fallbackResult = runExpertAnalysis(context || {}, issue || {});
    res.setHeader('X-Engine-Source', 'Deterministic-Expert-Engine');
    // 出错不再伪装成成功：用 500 + success:false 明确告知前端发生降级/异常。
    return res.status(500).json({
      success: false,
      error: errorMsg,
      data: fallbackResult,
      result: fallbackResult,
      source: 'deterministic-expert',
      useFallback: true,
    });
  }
});

// 按需生成具体车规工程文档专属接口 (待办 3 - 避免主推演结构臃肿)
app.post('/api/copilot/generate-doc', async (req, res) => {
  try {
    const { docType, analysisResult, context, issue, modelConfig } = req.body;
    if (!docType || !analysisResult) {
      return res.status(400).json({ success: false, error: '缺少 docType 或 analysisResult' });
    }

    // 如果未配置或不需要 AI，由确定性文档生成器即时填充
    const baseline = runExpertAnalysis(context || {}, issue || {});
    const docTemplates: Record<string, any> = baseline.engineeringDocs || {};
    const fallbackDoc = docTemplates[docType] || { title: `${docType} 文档`, content: '由车规工程规则生成的标准草案' };

    // 若配置了可用的大模型，做高保真深度生成
    if (modelConfig && modelConfig.enabled && modelConfig.apiKey) {
      try {
        const docPrompt = `
作为首席硬件架构师，请针对当前缺陷决策推演结果，输出一份符合汽车行业 VDA / IATF 16949 规范的【${docType}】工程文档。
- 缺陷摘要: ${analysisResult.coreConclusion?.problemSummary}
- 推荐措施: ${analysisResult.coreConclusion?.recommendedMeasure}
- 最终方案: ${analysisResult.finalRecommendation?.recommendedOptionName}
- 交付倒计时: 剩余 ${context?.daysRemaining ?? 14} 天
- 项目阶段: ${context?.projectPhase || 'DV'}

请返回符合该文档结构的 JSON 数据。禁止包裹 markdown，输出纯 JSON。
`;
        let raw = '';
        if (
          modelConfig.provider === 'gemini' ||
          (modelConfig.model && modelConfig.model.toLowerCase().includes('gemini'))
        ) {
          raw = await callGeminiModel(modelConfig, docPrompt, HARDWARE_CHIEF_SYSTEM_PROMPT);
        } else {
          raw = await callCustomOpenAIModel(modelConfig, docPrompt, HARDWARE_CHIEF_SYSTEM_PROMPT);
        }
        const docData = healAndParseJson(raw);
        return res.json({ success: true, docType, data: docData, source: 'ai-generated' });
      } catch (e: any) {
        console.warn(`Doc ${docType} generation fallback:`, e.message);
      }
    }

    return res.json({ success: true, docType, data: fallbackDoc, source: 'deterministic-template' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Deterministic Engineering Calculations API
app.post('/api/copilot/calculate', (req, res) => {
  const { calcType, params } = req.body;
  if (calcType === 'wcca') {
    const { nominal = 100, tolerance = 0.01, tempDrift = 0.005, aging = 0.008 } = params;
    const extremeTolerance = tolerance + tempDrift + aging;
    const extremeMin = nominal * (1 - extremeTolerance);
    const extremeMax = nominal * (1 + extremeTolerance);

    const rssTolerance = Math.sqrt(tolerance * tolerance + tempDrift * tempDrift + aging * aging);
    const rssMin = nominal * (1 - rssTolerance);
    const rssMax = nominal * (1 + rssTolerance);

    const N = 10000;
    const samples: number[] = [];
    for (let i = 0; i < N; i++) {
      const u1 = Math.random() || 0.0001;
      const u2 = Math.random() || 0.0001;
      const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
      const z1 = Math.sqrt(-2.0 * Math.log(u1)) * Math.sin(2.0 * Math.PI * u2);
      const u3 = Math.random() || 0.0001;
      const z2 = Math.sqrt(-2.0 * Math.log(u3)) * Math.cos(2.0 * Math.PI * u3);

      const dTol = (z0 / 3) * tolerance;
      const dTemp = (z1 / 3) * tempDrift;
      const dAging = (z2 / 3) * aging;
      samples.push(nominal * (1 + dTol + dTemp + dAging));
    }
    samples.sort((a, b) => a - b);
    const mean = samples.reduce((s, v) => s + v, 0) / N;
    const variance = samples.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / N;
    const sigma = Math.sqrt(variance);

    const p1 = samples[Math.floor(N * 0.01)];
    const p3 = samples[Math.floor(N * 0.03)];
    const p5 = samples[Math.floor(N * 0.05)];
    const p95 = samples[Math.floor(N * 0.95)];
    const p97 = samples[Math.floor(N * 0.97)];
    const p99 = samples[Math.floor(N * 0.99)];

    return res.json({
      calcType: 'wcca',
      extremeWorstCase: { min: extremeMin, max: extremeMax, deviationPercent: extremeTolerance * 100 },
      rss: { min: rssMin, max: rssMax, deviationPercent: rssTolerance * 100 },
      monteCarlo: { mean, sigma, p1, p3, p5, p95, p97, p99, iterations: N },
    });
  }

  if (calcType === 'thermal') {
    const { powerLoss = 2.5, rthJA = 28, rthJC = 1.8, ambient = 85, tjMax = 150, deratingMargin = 25 } = params;
    const tj = ambient + powerLoss * rthJA;
    const tc = ambient + powerLoss * (rthJA - rthJC);
    const maxAllowableTj = tjMax - deratingMargin;
    const margin = maxAllowableTj - tj;
    const isPassing = margin >= 0;

    return res.json({
      calcType: 'thermal',
      tj: Number(tj.toFixed(1)),
      tc: Number(tc.toFixed(1)),
      maxAllowableTj,
      margin: Number(margin.toFixed(1)),
      isPassing,
      deratingPercentage: Number(((tj / tjMax) * 100).toFixed(1)),
    });
  }

  if (calcType === 'voltage_margin') {
    const { nominal = 3.3, tolerancePercent = 3, lineLoadDrop = 0.04, transientDip = 0.08, minAllowed = 3.0 } = params;
    const vMinSteady = nominal * (1 - tolerancePercent / 100) - lineLoadDrop;
    const vMinTransient = vMinSteady - transientDip;
    const margin = vMinTransient - minAllowed;

    return res.json({
      calcType: 'voltage_margin',
      vMinSteady: Number(vMinSteady.toFixed(3)),
      vMinTransient: Number(vMinTransient.toFixed(3)),
      minAllowed,
      margin: Number(margin.toFixed(3)),
      isPassing: margin >= 0,
    });
  }

  res.status(400).json({ error: 'Unknown calculation type' });
});

// Vite middleware / Static serving
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ECU Copilot Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
