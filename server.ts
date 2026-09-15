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
import { runDeterministicPrecomputations, PrecomputedFact } from './src/utils/deterministicPrecomputation';
import { CopilotAnalysisResult, DebugSnapshot } from './src/types';

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

export const HARDWARE_CHIEF_SYSTEM_PROMPT = `
你是一位在汽车国际顶级Tier-1拥有20年经验的首席硬件架构师，精通ISO 26262 (Part 5)、ASPICE 4.0 (HWE.1-4) 及IATF 16949体系。
你的使命是协助硬件开发工程师进行技术攻关、防身免责与跨部门推演。

【核心工作准则】
1. 严禁和稀泥：方案必须给出鲜明的支持/否决倾向，必须揭示每一个方案的“隐藏代价（Side Effects）”。
2. 绝对区分特采性质（根据 IATF 16949 Section 8.7）：
   - 内部样件特批（Internal Deviation）：仅针对内部A/B样、实验室台架，必须有台套数范围限制（Serial Range）与物理隔离报废措施。
   - 主机厂外部让步（Customer Concession）：涉及功能安全、降额规范击穿、EMC未达标、引脚功能变更，必须走正式VDA ECR流程，严禁建议工程师“私下放行”。
3. 严格执行ISO 26262硬件度量判定：
   - SPFM（单点失效度量）：ASIL B >= 90%, ASIL C >= 97%, ASIL D >= 99%
   - LFM（潜伏失效度量）：ASIL B >= 60%, ASIL C >= 80%, ASIL D >= 90%
   - PMHF（随机硬件失效概率）：ASIL D < 10 FIT, ASIL C < 100 FIT
   任何试图通过削减硬件安全机制、又无底层软件诊断补偿（DC不足）的方案，必须在输出中标记【VETO_SAFETY_VIOLATION】。
4. 深度洞察直属领导处理风格与汽车跨部门博弈生态 (Stakeholder & Leadership Mindset)：
   在各方“想解决问题，但绝不想多干活、绝不想替别人担责”的现实约束下，敏锐识别直属领导风格 (hwLeadStyle)：
   - CONSERVATIVE (技术求稳型): 宁可推迟2周绝不接受降额不足/带病特采，首推物理根治并提供充足测试数据。
   - AGILE_DELIVERY (敏捷交付型): 以保住DV节点为第一要务，坚决抗拒PCB改版重新投板，首选软件标定/原位贴片零工期方案。
   - PROCESS_DEFENSIVE (流程免责型): 极度在乎责任界限，坚决反对硬件单方背锅，力主通过跨专业外部ECR与客户会签实现免责闭环。
   在每个方案中给出针对 HW Lead, PM, SW, System 的具体心理预期与防身策略。
5. 语言必须极其专业：使用正规汽车工程语境（如：工况剖面Mission Profile、抛负载抑制度、寄生振荡、体二极管反向恢复损耗、AEC-Q Grade 1）。
6. 【工况强定锚与防随意发散红线 (Strict Grounding & Zero Hallucination)】：
   - 必须把输入的【工程工况 PROJECT CONTEXT】与【实测问题 ENGINEERING ISSUE】作为唯一最高事实依据。
   - 【已核算事实引用指令】：对于 Prompt 中注入的【本地物理预核算事实】，模型必须严格直接引用该数值与裕量结论，严禁自行凭空推翻或另造相冲突的数值；如有异议，必须在 assumptions 中说明充分理由。
   - 绝对禁止脱离当前工况给出通用套话（如“建议优化走线”、“建议检查PCB”等模糊空话）。

【输出格式强制要求】
严格输出符合预定义JSON Schema的纯JSON文本，禁止带有任何Markdown代码块外壳（如 \`\`\`json），禁止任何前言和结语。
`;

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
  let normalizedBase = config.baseUrl.trim().replace(/\/+$/, '');
  if (!normalizedBase.endsWith('/chat/completions')) {
    normalizedBase = `${normalizedBase}/chat/completions`;
  }

  const modelLower = (config.model || '').toLowerCase();
  const isReasoner =
    modelLower.includes('reasoner') ||
    modelLower.includes('r1') ||
    modelLower.includes('o1') ||
    modelLower.includes('o3') ||
    modelLower.includes('thinking') ||
    modelLower.includes('-pro');

  const timeoutMs = isReasoner ? 150000 : 75000;

  const bodyPayload: Record<string, any> = {
    model: config.model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt },
    ],
  };

  // 绝大多数 OpenAI 兼容端点（DeepSeek, 通义千问, GLM, Moonshot, 硅基流动等）支持 response_format
  // 强制返回合法 JSON object，从协议层逼出严格 JSON，减少 markdown 干扰
  if (!isReasoner) {
    bodyPayload.response_format = { type: 'json_object' };
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

  const isSlowGemini = modelName.toLowerCase().includes('pro') || modelName.toLowerCase().includes('thinking');
  const timeoutMs = isSlowGemini ? 150000 : 75000;

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
  parsed.decisionFrame = parsed.decisionFrame || {
    decisionQuestion: `${context?.nextMilestone || '下一工程门禁'} 前是否具备继续推进的证据条件`,
    currentDecisionGate: context?.nextMilestone || '当前工程门禁',
    decisionWindow: `剩余 ${context?.daysRemaining ?? 14} 天`,
    bestNextAction: parsed.finalRecommendation?.immediateSteps?.[0]?.action || '先完成当前关键未知量的最小验证',
    minimumEvidenceToProceed: [parsed.finalRecommendation?.preconditions?.[0] || '关键实测证据达到项目规范门槛'],
    unknownsBlockingDecision: Array.isArray(parsed.unknowns) ? parsed.unknowns.slice(0, 5) : ['关键输入数据不足'],
    reversalCriteria: Array.isArray(parsed.finalRecommendation?.reEvaluationTriggers)
      ? parsed.finalRecommendation.reEvaluationTriggers.slice(0, 5)
      : ['关键实测证据与当前物理假设不一致'],
  };

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

// AI Analysis Endpoint (主推理与决策推演接口)
app.post('/api/copilot/analyze', async (req, res) => {
  const startTime = Date.now();
  try {
    const { context, issue, modelConfig, customAiResponse } = req.body;

    // 1. 预先执行输入完整度审计评估 (第一层防线)
    const integrityAssessment = assessInputIntegrity(context, issue);
    const integrityPromptDirectives = generatePromptIntegrityDirectives(integrityAssessment);

    // 2. 预先执行本地车规确定性专家引擎，提取物理机理与工程事实底线
    const baseline = runExpertAnalysis(context, issue);
    if (baseline.provenance) {
      baseline.provenance.inputIntegrity = integrityAssessment;
    }

    // 3. 本地车规物理引擎预核算注入 (待办 2.4 - 预计算注入消除幻觉)
    const precomputedFacts = runDeterministicPrecomputations(context, issue);
    const precomputedFactsText =
      precomputedFacts.length > 0
        ? precomputedFacts
            .map(
              (f) =>
                `- 【${f.title}】${f.parameter} = ${f.calculatedValue} ${f.unit} (规范门限: ${f.specThreshold || 'N/A'}，安全裕量: ${f.safetyMargin || 'N/A'}，合规性: ${f.complianceVerdict})。\n  理论核算依据: ${f.formulaOrBasis}。\n  ★ 必须执行的引用指令: ${f.directiveForAi}`
            )
            .join('\n')
        : '（当前工况下无特殊离散物理参数需要预核算）';

    // 4. 多域编排与篇幅裁剪 (待办 1.1 - 主导域完整，弱相关域仅留跨域耦合与否决边界)
    const primaryDomain = resolveEngineeringDomain(issue);
    const relatedDomains = resolveEngineeringDomains(issue).filter((d) => d !== primaryDomain);
    const multiDomainGuidance = getMultiDomainAdaptivePromptGuidance(issue, context);
    const domainGuidance = multiDomainGuidance.primary;

    const primaryGuidanceText = `【主导工程领域：${domainGuidance.title}】(分配完整物理机理链)
- 核心物理公式与因果推导:
${domainGuidance.physicsFormulas}
- 车规元器件成熟选型基准:
${domainGuidance.componentSpecs}
- 专业测试仪器与台架测量规程:
${domainGuidance.testProtocol}
- 跨专业协同要求:
${domainGuidance.crossDisciplinaryImpact}
- 严格禁止的模糊空话清单:
${domainGuidance.prohibitedVagueness.map((v) => `  * ${v}`).join('\n')}`;

    const relatedGuidanceText =
      multiDomainGuidance.related.length > 0
        ? multiDomainGuidance.related
            .map(
              (r) => `【强/弱相关领域：${r.title}】(聚焦跨域耦合与否决边界，防止篇幅发散)
- 跨域耦合物理影响: ${r.crossDisciplinaryImpact}
- 关联否决条件与防穿透红线: 必须确保在主导领域实施的对策不会突破本领域的器件额定耐压、温升限值或一票否决安全裕量！`
            )
            .join('\n\n')
        : '无其他次级相关领域';

    // 5. 跨工程域物理耦合关系矩阵注入 (待办 1.2)
    const crossDomainCouplings = getCrossDomainCouplings(primaryDomain, relatedDomains);
    const couplingText =
      crossDomainCouplings.length > 0
        ? crossDomainCouplings
            .map(
              (c) =>
                `- 【${c.fromDomain} ➔ ${c.toDomain}】触发动作：${c.action} ➔ 物理量变化：${c.physicalChange} ➔ 权衡代价：${c.physicalTradeoff} ➔ 必须复核项：${c.requiredRevalidation.join('; ')}${c.vetoCondition ? ` ➔ 【硬性否决边界】：${c.vetoCondition}` : ''}`
            )
            .join('\n')
        : '未检测到硬性跨域物理冲突规则';

    // 6. 核对实测参数填写情况
    const filledValues = issue?.measuredValues || {};
    const isFilled = (v: unknown) => v !== undefined && v !== null && v !== '' && Number.isFinite(Number(v));
    const allExpectedFields = getDomainMeasurementFields(issue);
    const missingFieldsList = allExpectedFields.filter((f) => !isFilled(filledValues[f.key]));
    const missingFieldsText = missingFieldsList.length
      ? missingFieldsList
          .map((f) => `- ${f.key}（${f.label}${f.unit ? `，单位 ${f.unit}` : ''}，${f.tag}${f.required ? '，必填缺失' : ''}）`)
          .join('\n')
      : '（本次涉及的工程域测量字段均已填写）';

    // 7. 按域拆分实测证据浓度
    const domainEvidenceBreakdown = getDomainMeasurementGroups(issue)
      .map((group, idx) => {
        const filled = group.fields.filter((f) => isFilled(filledValues[f.key]));
        const missing = group.fields.filter((f) => !isFilled(filledValues[f.key]));
        const filledText = filled.length ? filled.map((f) => `${f.key}=${filledValues[f.key]}`).join(', ') : '无';
        const missingText = missing.length ? missing.map((f) => f.key).join(', ') : '无';
        return `【${idx === 0 ? '主导域' : '涉及域'} · ${getEngineeringDomainLabel(group.domain)}】已填：${filledText}；未填：${missingText}`;
      })
      .join('\n');

    // 8. 组装高定锚专业 Prompt
    const prompt = `
你必须严格基于以下【输入工况】、【实测数据】与【本地确定性预核算事实】进行硬件工程决策推演，绝不脱离实际随意作答：

=============================================
【1. 输入工程背景 (PROJECT CONTEXT)】
- 项目名称: ${context?.projectName || '车载域控制器 ECU 项目'}
- ECU 类型: ${context?.ecuType || '域控制器'} (${context?.productType || '车身与底盘'})
- 项目阶段: ${context?.projectPhase || 'DV'} | 样品状态: ${context?.sampleStatus || 'B样试制件'}
- 功能安全等级: ${context?.asilLevel || 'ASIL B'}
- 交付倒计时: 距离【${context?.nextMilestone || '交付节点'}】仅剩【${context?.daysRemaining ?? 14}天】
- 成本约束: ${context?.costConstraint || '中等敏感'}
- 直属硬件领导风格: ${context?.hwLeadStyle || 'AGILE_DELIVERY'}

【2. 输入实测问题与工程顾虑 (ENGINEERING ISSUE)】
- 主导工程领域: 【${getEngineeringDomainLabel(primaryDomain)}】
- 涉及工程领域: 【${resolveEngineeringDomains(issue).map(getEngineeringDomainLabel).join(' / ') || getEngineeringDomainLabel(primaryDomain)}】
- 关联工程领域: 【${relatedDomains.map(getEngineeringDomainLabel).join(' / ') || '无'}】
- 领域分类: ${issue?.issueCategories?.join(', ') || '硬件工程'}
- 规范要求: ${issue?.requirement || '未定义'}
- 实际测量结果: ${issue?.actualMeasurement || '未提供实测'}
- 测试条件: ${issue?.testCondition || '未提供测试边界'}
- 测试环境: ${issue?.environment || '未提供环境条件'}
- 失效现象: ${issue?.failurePhenomenon || '未提供现象'}
- 核心工程顾虑: ${issue?.engineeringConcern || '未提供顾虑'}
- 关键实测数值: ${JSON.stringify(issue?.measuredValues || {}, null, 2)}

【2.0 本地确定性数学物理预核算事实 (NON-NEGOTIABLE FACTS)】
${precomputedFactsText}
★ 核心准则：以上数值由本地经过车规方程标定的物理引擎计算所得。模型输出必须直接引用并以此作为事实锚点，严禁另造冲突数值！

【2.1 输入数据完整度车规审计等级与强约束】
${integrityPromptDirectives}

【2.2 本次输入中未提供的工程参数（必须视为 UNKNOWN，严禁假设默认值替代）】
${missingFieldsText}

【2.3 按工程域拆分的实测证据浓度（用于校准 domainAssessments.evidenceLevel）】
${domainEvidenceBreakdown}

【3. 多工程域物理与推演规约 (权重智能裁剪版)】
${primaryGuidanceText}

${relatedGuidanceText}

【3.1 跨工程域物理耦合规则库 (CROSS-DOMAIN COUPLING MATRIX)】
${couplingText}
★ 规则回填要求：模型在 candidateActions[].crossDomainCouplingChecks 中，必须逐条复核以上规则是否受到本方案影响，并说明 addressed: true/false 及评估说明。

【4. 车规基准定锚 (AUTOMOTIVE BENCHMARK)】
- 确定性问题定性: ${baseline?.coreConclusion?.problemSummary || ''}
- 核心物理失效机理: ${baseline?.physicalMechanism?.rootCauseAnalysis || ''}
- 关键物理影响因子: ${JSON.stringify(baseline?.physicalMechanism?.keyPhysicalFactors || [], null, 2)}
- 综合风险评级基准: ${baseline?.riskRatings?.overallRisk || 'Medium-High'} (${baseline?.riskRatings?.overallRiskScore ?? 75}分)

【5. 当前决策态与双层时间轴要求】
- 决策窗口: 剩余 ${context?.daysRemaining ?? 14} 天
- 必须严格提供双层时间轴：
  - containmentPhase: T+24h 应急临时遏制（0天PCB改版工期，满足当前装车验证）；
  - permanentPhase: 下一改版彻底根除物理根因；
  - strategicTradeoff: 阐明为何双轨协同推进。

Return a single JSON object with these exact keys:
{
  "coreConclusion": {
    "problemSummary": "...",
    "recommendedMeasure": "...",
    "reasonSummary": "..."
  },
  "decisionFrame": {
    "decisionQuestion": "明确回答当前到底要不要继续推进/放行/改版",
    "currentDecisionGate": "当前所处工程门禁",
    "decisionWindow": "结合 daysRemaining 给出实际剩余决策窗口",
    "bestNextAction": "未来 24 小时最应该做的一件事",
    "minimumEvidenceToProceed": ["进入下一阶段前必须拿到的最小证据"],
    "unknownsBlockingDecision": ["当前阻塞决策的关键未知量"],
    "reversalCriteria": ["出现哪些证据时必须推翻当前推荐方案"]
  },
  "multiDomainAnalysis": {
    "primaryDomain": "${primaryDomain}",
    "relatedDomains": ${JSON.stringify(relatedDomains)},
    "domainAssessments": [
      { "domain": "${primaryDomain}", "role": "PRIMARY", "evidenceLevel": "HIGH|MEDIUM_INFERRED|LOW", "knownFacts": ["..."], "evidenceGaps": ["..."], "minimumValidation": "...", "domainConclusion": "..." }
    ],
    "crossDomainLinks": [
      { "fromDomain": "${primaryDomain}", "toDomain": "...", "mechanism": "...", "evidenceBasis": "MEASURED|CALCULATED|ASSUMPTION", "impact": "..." }
    ],
    "crossDomainVetoes": [
      { "condition": "...", "blocks": ["DV_RELEASE"], "rationale": "..." }
    ]
  },
  "riskRatings": {
    "overallRisk": "High|Medium-High|Medium|Low",
    "overallRiskScore": 75,
    "technicalRisk": "High|Medium-High|Medium|Low",
    "qualityRisk": "High|Medium-High|Medium|Low",
    "scheduleRisk": "High|Medium-High|Medium|Low",
    "costRisk": "High|Medium-High|Medium|Low",
    "reliabilityRisk": "High|Medium-High|Medium|Low",
    "functionalSafetyRisk": "High|Medium-High|Medium|Low"
  },
  "knownFacts": ["..."],
  "assumptions": ["..."],
  "unknowns": ["..."],
  "physicalMechanism": {
    "rootCauseAnalysis": "...",
    "keyPhysicalFactors": [{"factor": "...", "description": "..."}]
  },
  "dfmeaView": {
    "failureMode": "...",
    "failureCause": "...",
    "localEffect": "...",
    "systemEffect": "...",
    "vehicleEffect": "...",
    "severity": 8,
    "occurrence": 4,
    "detection": 3,
    "safetyImpact": true,
    "regulatoryImpact": false,
    "massProductionImpact": true
  },
  "candidateActions": [
    {
      "id": "Option A",
      "category": "conservative|agile|radical",
      "categoryLabel": "...",
      "name": "...",
      "description": "...",
      "expectedBenefit": "...",
      "scores": { "T": 88, "S": 55, "C": 60, "Q": 90, "L": 85, "total": 74.5 },
      "veto": { "rejection_veto": false },
      "riskDelta": "高 (器件耐压不足) ➔ 低 (32V/108℃达标)",
      "residualRisk": "Low",
      "residualRiskDetail": "...",
      "sideEffects": "...",
      "verificationCost": "...",
      "timeCost": "...",
      "failureConsequence": "...",
      "preconditions": "...",
      "verificationMethod": "必须具体到测点/仪器/判据",
      "crossDomainCouplingChecks": [
        { "rule": "...", "addressed": true, "note": "..." }
      ],
      "planB": "...",
      "decisionFit": "为什么它适合/不适合当前工期与门禁",
      "fastestValidation": "最快多久能拿到决定性证据",
      "latestDecisionPoint": "最晚在第几天必须做出切换决定",
      "rejectionReason": "若不推荐，明确说明拒绝它的主因"
    }
  ],
  "finalRecommendation": {
    "recommendedOptionId": "Option C",
    "recommendedOptionName": "...",
    "recommendationGrade": "Recommended",
    "whyReason": ["..."],
    "immediateSteps": [
      { "step": 1, "title": "...", "action": "...", "owner": "HW", "deadline": "..." }
    ],
    "preconditions": ["..."],
    "unacceptableActions": ["..."],
    "stopConditions": ["..."],
    "reEvaluationTriggers": ["..."],
    "planB": "..."
  },
  "dualTimeline": {
    "containmentPhase": {
      "phaseTag": "T_PLUS_24H_CONTAINMENT",
      "timeWindow": "T + 24h 紧急应急围堵 (Containment)",
      "title": "...",
      "objective": "...",
      "hardwareImpact": "...",
      "responsibilityRole": "...",
      "actions": [
        { "step": "...", "detail": "...", "owner": "...", "duration": "...", "hardwareImpact": "...", "deliverable": "..." }
      ],
      "verificationCriteria": "...",
      "exitCriteria": "..."
    },
    "permanentPhase": {
      "phaseTag": "NEXT_PHASE_PERMANENT",
      "timeWindow": "下一版本永久纠正 / SOP 封样",
      "title": "...",
      "objective": "...",
      "hardwareImpact": "...",
      "responsibilityRole": "...",
      "actions": [
        { "step": "...", "detail": "...", "owner": "...", "duration": "...", "hardwareImpact": "...", "deliverable": "..." }
      ],
      "verificationCriteria": "...",
      "exitCriteria": "..."
    },
    "strategicTradeoff": "..."
  }
}
`;

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
          prompt,
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

    const elapsedMs = Date.now() - startTime;

    // 10. 挂载调试快照 (DebugSnapshot - 待办 5.3)
    const debugSnapshot: DebugSnapshot = {
      promptLength: prompt.length,
      promptSnippet: prompt.slice(0, 320) + '...',
      fullPrompt: prompt,
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
    return res.status(200).json({
      success: true,
      data: fallbackResult,
      result: fallbackResult,
      source: 'deterministic-expert',
      useFallback: true,
      error: errorMsg,
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
