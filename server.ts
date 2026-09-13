import express from 'express';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';

import { runExpertAnalysis } from './src/data/expertEngine';

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
    mode: '100% Offline Deterministic Expert Engine',
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
    // If not built yet, fallback to dist/index.html or return message
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

【输出格式强制要求】
严格输出符合预定义JSON Schema的纯JSON文本，禁止带有任何Markdown代码块外壳（如 \`\`\`json），禁止任何前言和结语。
`;

/**
 * 2.2 响应修复容错拦截器 (Schema Healing Pipeline)
 * 纯函数管道清洗大模型残缺/带有 Markdown 代码块的返回，若解析崩溃毫秒级安全降级
 */
function healAndParseJson(raw: string): any {
  let cleaned = raw.trim();

  // 1. 剔除开头的 ```json 或 ``` 及结尾的 ```
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  // 2. 提取最外层的 { ... }
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }

  // 3. 尝试标准解析
  return JSON.parse(cleaned);
}

/**
 * 通用 OpenAI 兼容协议调用函数 (支持 DeepSeek, 阿里通义千问 Qwen, 智谱 GLM, 月之暗面 Moonshot, 硅基流动, 自定义 API)
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
  const isReasoner = modelLower.includes('reasoner') || modelLower.includes('r1');

  const bodyPayload: Record<string, any> = {
    model: config.model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt },
    ],
  };

  // 绝大多数标准模型支持 temperature；部分特定推理模型 (如 deepseek-reasoner) 限制传参
  if (!isReasoner && typeof config.temperature === 'number') {
    bodyPayload.temperature = config.temperature;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 75000);

  try {
    const response = await fetch(normalizedBase, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey.trim()}`,
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
    throw err;
  }
}

/**
 * Google GenAI 调用函数 (支持 Gemini 2.5 Flash / Pro 及环境变量 GEMINI_API_KEY)
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

  const response = await ai.models.generateContent({
    model: modelName,
    contents: prompt,
    config: {
      systemInstruction: systemPrompt,
      responseMimeType: 'application/json',
      temperature: typeof config.temperature === 'number' ? config.temperature : 0.2,
    },
  });

  const content = response.text;
  if (!content) {
    throw new Error('Gemini 模型未返回有效文本内容');
  }
  return content;
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
      messages: [
        { role: 'user', content: '这是一次车规硬件决策系统 API 连通性检测，请仅回复："CONNECTED"' },
      ],
      max_tokens: 30,
    };

    const response = await fetch(normalizedBase, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey.trim()}`,
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

// AI Analysis Endpoint
app.post('/api/copilot/analyze', async (req, res) => {
  try {
    const { context, issue, modelConfig } = req.body;

    const prompt = `
Please evaluate this automotive ECU hardware engineering problem according to the system prompt and return a complete JSON object.

PROJECT CONTEXT:
${JSON.stringify(context, null, 2)}

ENGINEERING ISSUE:
${JSON.stringify(issue, null, 2)}

Return a single JSON object with these exact keys:
{
  "coreConclusion": {
    "problemSummary": "...",
    "recommendedMeasure": "...",
    "reasonSummary": "..."
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
      "category": "conservative",
      "categoryLabel": "保守/技术最稳妥",
      "name": "...",
      "description": "...",
      "expectedBenefit": "...",
      "scores": { "T": 88, "S": 55, "C": 60, "Q": 90, "L": 85, "total": 74.5 },
      "veto": { "rejection_veto": false },
      "riskBefore": "...",
      "riskAfter": "...",
      "residualRisk": "Low",
      "residualRiskDetail": "...",
      "sideEffects": "...",
      "verificationCost": "...",
      "timeCost": "...",
      "failureConsequence": "...",
      "preconditions": "...",
      "verificationMethod": "...",
      "planB": "..."
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
  "raciMatrix": [
    { "role": "HW", "raciType": "R", "owner": "HW Lead", "action": "...", "output": "...", "dueDate": "...", "decisionGate": "..." }
  ],
  "containment": {
    "shortTermMeasure": "...",
    "validityScope": "...",
    "responsibleParty": "...",
    "timeline": "..."
  },
  "capa": {
    "rootCauseAction": "...",
    "preventiveMeasure": "...",
    "lessonsLearned": "...",
    "verificationTarget": "..."
  },
  "engineeringDocs": {
    "pmDecisionEmail": {
      "subject": "...",
      "technicalFact": "...",
      "currentSituation": "...",
      "risk": "...",
      "options": "...",
      "recommendedOption": "...",
      "costImpact": "...",
      "scheduleImpact": "...",
      "requiredDecision": "...",
      "decisionOwner": "...",
      "deadline": "...",
      "assumedProceeding": "...",
      "changeConsequence": "..."
    },
    "deviationPermit": {
      "title": "...",
      "requirement": "...",
      "actualResult": "...",
      "deviationDetail": "...",
      "technicalCause": "...",
      "riskAnalysis": "...",
      "affectedScope": "...",
      "containment": "...",
      "temporaryValidity": "...",
      "approvalRoles": "...",
      "correctiveAction": "...",
      "verificationPlan": "...",
      "closureCriteria": "..."
    },
    "meetingMinutes": {
      "title": "...",
      "attendees": "...",
      "discussionSummary": "...",
      "agreements": ["..."],
      "actionItems": ["..."]
    },
    "riskAcceptance": {
      "riskId": "...",
      "description": "...",
      "residualRiskJustification": "...",
      "acceptingSignOff": "...",
      "expirationCondition": "..."
    },
    "dfmeaComment": {
      "lineItem": "...",
      "recommendedAction": "...",
      "targetDate": "...",
      "owner": "..."
    },
    "ecrDescription": {
      "ecrTitle": "...",
      "reasonForChange": "...",
      "proposedSolution": "...",
      "costEstimate": "...",
      "toolingLeadTime": "...",
      "impactAssessment": "..."
    }
  }
}
`;

    // 1. 如果配置为 Google Gemini 模型 (支持服务端环境变量 GEMINI_API_KEY 自动授权)
    if (
      modelConfig &&
      modelConfig.enabled &&
      (modelConfig.provider === 'gemini' || (modelConfig.model && modelConfig.model.toLowerCase().includes('gemini')))
    ) {
      try {
        const rawContent = await callGeminiModel(
          {
            apiKey: modelConfig.apiKey,
            model: modelConfig.model,
            temperature: modelConfig.temperature ?? 0.2,
          },
          prompt,
          HARDWARE_CHIEF_SYSTEM_PROMPT
        );

        const parsed = healAndParseJson(rawContent);
        parsed.provenance = {
          executionMode: 'ONLINE_AI_INFERRED',
          engineName: `云端大模型 (${modelConfig.model}) 即时推理`,
          isAiInferred: true,
          isDeterministicRule: false,
          generatedAt: new Date().toLocaleTimeString(),
          modelIdentifier: modelConfig.model,
          transparencyNote: `本分析由 Google Gemini [${modelConfig.model}] 大模型即时推演生成，包含跨领域工程推测。`,
        };
        res.setHeader('X-Engine-Source', `Gemini-${modelConfig.model}`);
        return res.json({
          success: true,
          data: parsed,
          result: parsed,
          source: `gemini:${modelConfig.model}`,
          model: modelConfig.model,
        });
      } catch (geminiErr: any) {
        console.warn(`Gemini model (${modelConfig.model}) execution failed, falling back:`, geminiErr.message);
        const fallbackResult = runExpertAnalysis(context, issue);
        res.setHeader('X-Engine-Source', 'Local-Fallback');
        return res.json({
          success: true,
          data: fallbackResult,
          result: fallbackResult,
          source: 'deterministic-expert',
          useFallback: true,
          error: `Gemini 模型 (${modelConfig.model}) 调用异常: ${geminiErr.message}，已自动平滑启用车规级确定性专家引擎。`,
        });
      }
    }

    // 2. 检查并调用用户配置的自定义 OpenAI 兼容大模型 (如 DeepSeek, 通义千问, 智谱, 硅基流动等)
    if (
      modelConfig &&
      modelConfig.enabled &&
      modelConfig.apiKey &&
      modelConfig.baseUrl &&
      modelConfig.model &&
      modelConfig.provider !== 'builtin'
    ) {
      try {
        const rawContent = await callCustomOpenAIModel(
          {
            baseUrl: modelConfig.baseUrl,
            apiKey: modelConfig.apiKey,
            model: modelConfig.model,
            temperature: modelConfig.temperature ?? 0.2,
          },
          prompt,
          HARDWARE_CHIEF_SYSTEM_PROMPT
        );

        const parsed = healAndParseJson(rawContent);
        parsed.provenance = {
          executionMode: 'ONLINE_AI_INFERRED',
          engineName: `云端大模型 (${modelConfig.model}) 即时推理`,
          isAiInferred: true,
          isDeterministicRule: false,
          generatedAt: new Date().toLocaleTimeString(),
          modelIdentifier: modelConfig.model,
          transparencyNote: `本分析由自定义大模型 [${modelConfig.model}] 即时生成，结合了车规首席架构师提示词与多维决策护栏。`,
        };
        res.setHeader('X-Engine-Source', `Custom-${modelConfig.model}`);
        return res.json({
          success: true,
          data: parsed,
          result: parsed,
          source: `custom-llm:${modelConfig.model}`,
          model: modelConfig.model,
        });
      } catch (customErr: any) {
        console.warn(`Custom model (${modelConfig.model}) execution failed, falling back:`, customErr.message);
        const fallbackResult = runExpertAnalysis(context, issue);
        res.setHeader('X-Engine-Source', 'Local-Fallback');
        return res.json({
          success: true,
          data: fallbackResult,
          result: fallbackResult,
          source: 'deterministic-expert',
          useFallback: true,
          error: `自定义大模型 (${modelConfig.model}) 调用异常: ${customErr.message}，已自动平滑启用车规级确定性专家引擎。`,
        });
      }
    }

    // 2. 默认使用 100% 本地车规级确定性专家系统
    const expertResult = runExpertAnalysis(context, issue);
    res.setHeader('X-Engine-Source', 'Deterministic-Expert-Engine');
    return res.json({
      success: true,
      data: expertResult,
      result: expertResult,
      source: 'deterministic-expert',
      message: '100% 本地车规级确定性专家推理引擎，零外部 API 依赖，数据安全隔离。',
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

// Deterministic Engineering Calculations API
app.post('/api/copilot/calculate', (req, res) => {
  const { calcType, params } = req.body;
  if (calcType === 'wcca') {
    const { nominal = 100, tolerance = 0.01, tempDrift = 0.005, aging = 0.008 } = params;
    // Extreme Worst Case: direct sum
    const extremeTolerance = tolerance + tempDrift + aging;
    const extremeMin = nominal * (1 - extremeTolerance);
    const extremeMax = nominal * (1 + extremeTolerance);

    // RSS (Root Sum of Squares)
    const rssTolerance = Math.sqrt(tolerance * tolerance + tempDrift * tempDrift + aging * aging);
    const rssMin = nominal * (1 - rssTolerance);
    const rssMax = nominal * (1 + rssTolerance);

    // Monte Carlo simulation (10,000 iterations)
    const N = 10000;
    const samples: number[] = [];
    for (let i = 0; i < N; i++) {
      // Box-Muller normal approximation for independent 3-sigma tolerances
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
