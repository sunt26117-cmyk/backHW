import express from 'express';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';

import { runExpertAnalysis } from './src/data/expertEngine';
import { getDomainAdaptivePromptGuidance, getMultiDomainAdaptivePromptGuidance } from './src/utils/domainAdaptivePromptEngine';
import { resolveEngineeringDomain, resolveEngineeringDomains, getEngineeringDomainLabel, getDomainMeasurementFields, getDomainMeasurementGroups } from './src/utils/scenarioDomainEngine';
import { buildDualTimelinePlan } from './src/utils/dualTimelineEngine';

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
6. 【工况强定锚与防随意发散红线 (Strict Grounding & Zero Hallucination)】：
   - 必须把输入的【工程工况 PROJECT CONTEXT】与【实测问题 ENGINEERING ISSUE】作为唯一最高事实依据。
   - 绝对禁止脱离当前工况给出通用套话（如“建议优化走线”、“建议检查PCB”等模糊空话）。针对当前工况：
     - 若为 BLDC 电机控制工况：必须精准围绕反电势动能泵升 ($E=\frac{1}{2}J\omega^2$)、母线电容与 TVS 吸收、全下桥/全上桥主动短路制动、MOSFET 耐压降额开展；
     - 若为 EMC 辐射发射/传导工况：必须精准围绕 CISPR 25 Class 5 频段限值、共模电流回流环路、开关谐波、π型滤波、铁氧体磁珠阻抗匹配开展；
     - 若为 MOSFET 缺料替代/热阻工况：必须精准围绕 RDS(on)、Qg/Qgd 驱动损耗、AEC-Q101 标准、瞬态 SOA 脉冲耐压及结温降额开展；
     - 若为 WCCA 容差漂移工况：必须精准围绕最坏情况极值分析 (Extreme Worst-Case) 与均方根容差 (RSS) 开展。
   - 必须精准回答车规 4 大黄金问题：
     ① What is wrong: 精准列出当前超标物理量、测试条件与现象；
     ② Why: 揭示深层物理机理（具体物理效应与电路参数）；
     ③ What should we do now: 给出 3 个鲜明对立的候选方案（原位原封修改 / 系统软件控制标定 / 重新投板改版），必须结合当前工期倒计时（daysRemaining）严格判定交付可行性；
     ④ What would prove it: 给出量化的台架实测判定指标与闭环验证步骤。

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

/**
 * 校验并用本地车规基准补全大模型推理结果，保证 100% 严谨性与输入工况强绑定
 */
function validateAndEnrichAiResult(parsed: any, baseline: any, modelName: string, context: any, issue: any): any {
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
        domain, role: index === 0 ? 'PRIMARY' : 'RELATED', evidenceLevel: 'UNKNOWN', knownFacts: [],
        evidenceGaps: ['当前云端分析未返回该域的独立证据分层'], minimumValidation: '补齐该领域最小实测证据后重新判断', domainConclusion: '证据不足，不宣称根因已锁定',
      })),
      crossDomainLinks: [],
      crossDomainVetoes: [],
    };
  } else {
    md.primaryDomain = md.primaryDomain || resolveEngineeringDomain(issue);
    md.relatedDomains = Array.isArray(md.relatedDomains) ? md.relatedDomains : resolveEngineeringDomains(issue).filter((d) => d !== md.primaryDomain);
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
    reversalCriteria: Array.isArray(parsed.finalRecommendation?.reEvaluationTriggers) ? parsed.finalRecommendation.reEvaluationTriggers.slice(0, 5) : ['关键实测证据与当前物理假设不一致'],
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

  return parsed;
}

// AI Analysis Endpoint
app.post('/api/copilot/analyze', async (req, res) => {
  try {
    const { context, issue, modelConfig } = req.body;

    // 1. 预先执行本地车规确定性专家引擎，提取物理机理与工程事实底线
    const baseline = runExpertAnalysis(context, issue);

    // 2. 根据输入实测与工况自适应匹配车规 Chief Engineer 专属专业领域指导
    const primaryDomain = resolveEngineeringDomain(issue);
    const relatedDomains = resolveEngineeringDomains(issue).filter(d => d !== primaryDomain);
    const multiDomainGuidance = getMultiDomainAdaptivePromptGuidance(issue, context);
    const domainGuidance = multiDomainGuidance.primary;
    const multiDomainEvidence = multiDomainGuidance.all.map((g) => `- ${g.title}\n  物理链：${g.physicsFormulas}\n  测试规约：${g.testProtocol}\n  跨域影响：${g.crossDisciplinaryImpact}\n  禁止空话：${g.prohibitedVagueness.join('；')}`).join('\n\n');

    // 3. 逐字段核对实测参数的填写情况：区分"用户实际填了什么"与"这个域本来应该填什么"，
    //    避免 AI 在不知道哪些字段是真空的情况下自行脑补默认值。
    const filledValues = issue?.measuredValues || {};
    const isFilled = (v: unknown) => v !== undefined && v !== null && v !== '' && Number.isFinite(Number(v));
    const allExpectedFields = getDomainMeasurementFields(issue);
    const missingFieldsList = allExpectedFields.filter((f) => !isFilled(filledValues[f.key]));
    const missingFieldsText = missingFieldsList.length
      ? missingFieldsList.map((f) => `- ${f.key}（${f.label}${f.unit ? `，单位 ${f.unit}` : ''}，${f.tag}${f.required ? '，必填缺失' : ''}）`).join('\n')
      : '（本次涉及的工程域测量字段均已填写）';

    // 4. 按域拆分实测证据浓度：让 related domains 也有真实数据支撑，而不是仅靠 domain 名称脑补证据等级。
    const domainEvidenceBreakdown = getDomainMeasurementGroups(issue).map((group, idx) => {
      const filled = group.fields.filter((f) => isFilled(filledValues[f.key]));
      const missing = group.fields.filter((f) => !isFilled(filledValues[f.key]));
      const filledText = filled.length ? filled.map((f) => `${f.key}=${filledValues[f.key]}`).join(', ') : '无';
      const missingText = missing.length ? missing.map((f) => f.key).join(', ') : '无';
      return `【${idx === 0 ? '主导域' : '涉及域'} · ${getEngineeringDomainLabel(group.domain)}】已填：${filledText}；未填：${missingText}`;
    }).join('\n');

    const prompt = `
你必须严格基于以下【输入工况】、【实测数据】与【${domainGuidance.title}】专属车规物理基准进行硬件工程决策推演，绝不脱离实际随意作答：

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

【2.1 本次输入中未提供的工程参数（必须视为 UNKNOWN，严禁假设默认值替代）】
${missingFieldsText}
以上字段若对某候选方案的结论是必要输入，必须在该方案中明确指出"因缺少 XX 字段暂无法定量核算，已作为假设/待验证项处理"，不得直接代入经验默认值后当作已验证结论。

【2.2 按工程域拆分的实测证据浓度（用于校准 domainAssessments.evidenceLevel，禁止仅凭域名称主观判断证据等级）】
${domainEvidenceBreakdown}

【3. 本工程多域物理与推演规约】
【主导域：${domainGuidance.title}】
[物理公式与机理推导要求]:
${domainGuidance.physicsFormulas}

[车规元器件规格与成熟料号指导]:
${domainGuidance.componentSpecs}

[专业测试仪器与台架测量规程]:
${domainGuidance.testProtocol}

[跨专业协同要求 (SW / System / PM)]:
${domainGuidance.crossDisciplinaryImpact}

[严禁出现的空话反模式 (PROHIBITED VAGUENESS)]:
${domainGuidance.prohibitedVagueness.map(v => `* ${v}`).join('\n')}

[所有涉及工程域的并行指导：]
${multiDomainEvidence}

【4. 车规基准定锚 (AUTOMOTIVE BENCHMARK)】
- 确定性问题定性: ${baseline?.coreConclusion?.problemSummary || ''}
- 核心物理失效机理: ${baseline?.physicalMechanism?.rootCauseAnalysis || ''}
- 关键物理影响因子: ${JSON.stringify(baseline?.physicalMechanism?.keyPhysicalFactors || [], null, 2)}
- 综合风险评级基准: ${baseline?.riskRatings?.overallRisk || 'Medium-High'} (${baseline?.riskRatings?.overallRiskScore ?? 75}分)
- 多域确定性基线: ${JSON.stringify(baseline?.multiDomainAnalysis || {}, null, 2)}

【5. 工程事实分层 (EVIDENCE HIERARCHY)】
必须逐条区分以下信息等级，任何低等级信息不得伪装成高等级事实：
- A · USER_MEASURED / 实测：用户明确提供的仪器读数、测试记录、样件现象；可直接作为现状证据。
- B · IMPORTED / 外部导入：用户提供的测试报告、供应商数据、客户协议摘录；引用时说明来源。
- C · SPEC / 规范：客户要求、项目规范、标准条款；不得自行创造不存在的限值。
- D · CALCULATED / 物理计算：由输入实测值和明确公式计算得到；必须写出关键输入。
- E · ASSUMPTION / 工程假设：用于推演但尚未证实；必须显式标为“假设”。
- F · AI_INFERENCE / AI 推断：只能作为候选解释或方案，禁止写成已验证根因。
- 当关键数据缺失时，不得补造数值。必须进入 unknowns，并说明“缺什么数据 + 为什么影响决策 + 最小验证方法”。

【6. 当前决策态 (DECISION STATE)】
请先在脑中建立以下状态，再输出结果：
- 当前真正需要做的决定：${context?.nextMilestone || '下一工程门禁'} 前，当前缺陷能否继续推进/进入下一阶段。
- 当前决策窗口：${context?.daysRemaining ?? 14} 天。
- 主要硬约束：${context?.costConstraint || '未定义成本约束'}。
- 当前样件边界：${context?.sampleStatus || '未定义'}。
- 必须识别：当前最关键的 decision gate、最小证据集、最大未知量、方案被推翻的触发条件。

【执行指令与车规专家落地硬性约束】
1. 【深度咬合专属领域公式与器件规格】：
   - 必须严格应用上述【${domainGuidance.title}】中的物理公式与机理进行量化推导，严禁张冠李戴；
   - 只有在输入或领域指导明确支持时，才允许给出具体器件参数/料号；无法确认时必须标记“待选型确认”，不得虚构库存、交期或适配性。
2. 【候选方案必须围绕当前决策窗口排序】:
   - 每个候选方案必须回答：为什么适合/不适合当前工期、样件、成本和安全门禁；最快何时取得决定性证据；最晚何时必须切换；若不推荐，主拒绝理由是什么。
3. 【台架实操抓波与判定规程】：
   - 在候选方案的 verificationMethod 及 finalRecommendation.immediateSteps 中，必须给出“测什么、在哪里测、用什么仪器/探头、Pass/Fail 门槛”；
   - 如果当前输入没有可靠的量化门槛，不得自行制造一个标准值，应返回“需要确认的规范/设计门槛”。
4. 【时间红线与不可接受行为】：
   - 必须把 ${context?.daysRemaining ?? 14} 天决策窗口与每个方案的实际工期相乘分析；PCB 改版、样件、软件标定等耗时只能作为“当前项目假设/经验估算”，除非输入已明确确认，不得视为普遍事实；
   - 对每个方案必须明确：最快可验证时间、最晚决策点、错过门禁的直接后果；
   - 在 engineeringDocs.pmDecisionEmail 中输出可直接复制发送给 PM 的汇报邮件，明确事实、风险、请求决策和责任边界。
5. 【双层工程时间轴机制 (Dual-Timeline Action Architecture)】：
   车规硬件决策绝非单选，必须在 JSON 中严格清晰拆分：
   - containmentPhase (T+24h 应急临时遏制)：0天板卡改版工期（如原位阻容焊盘替换、软件寄存器展频、线束磁环套管），在当前交样节点前 24~48h 内完成闭环，满足装车验证与试验准入；
   - permanentPhase (下一版本永久纠正)：在后续改版（如 C 样或 DV2/PV）中重新投板优化地回路/布局布线，彻底根除物理根因，通过全套规范与 PPAP Level 3 审查；
   - strategicTradeoff：清晰阐明为什么绝不能只选其一，而是需要双轨闭环协同推进。
6. 【多域决策硬约束】：
   - 必须明确 primary domain 与 related domains；
   - 必须识别至少 1 条真实的跨域因果链，格式为“域A → 物理机制 → 域B”，不得只罗列标签；
   - 每个涉及域都必须给出证据充足度、关键缺口与最小验证项；
   - 候选方案必须同时评价其对所有涉及域的正面收益、负面副作用和潜在一票否决项；
   - 任何一个硬门限域触发 VETO 时，不得因为另一个域改善而判定整体放行。
7. 【candidateActions.scores 打分锚点（禁止凭感觉打分，必须对照以下锚点定档）】：
   - T 技术裕量：90-100=留有≥30%物理裕量且已有实测数据支撑；70-89=裕量20-30%，仅有计算/仿真支撑尚无实测；50-69=裕量<20%或关键参数依赖假设；<50=已知会突破额定值/规范限值。
   - S 工期/进度可行性：90-100=可在当前决策窗口内完成且无需改版；70-89=需要少量工期但仍在窗口内；50-69=接近或压线决策窗口；<50=明确超出剩余天数。
   - C 成本：90-100=零/极低成本（原位标定、软件）；70-89=小额BOM或工装变化；50-69=需要改版打样等中等成本；<50=显著BOM上升或需要重新开模/大改版。
   - Q 质量与可靠性：90-100=有实测/仿真双重验证且无已知副作用；70-89=有一种验证手段支撑；50-69=仅有理论推导支撑；<50=已知存在未闭环的可靠性隐患。
   - L 领导/干系人可接受度：90-100=完全符合当前 hwLeadStyle 与决策窗口预期；70-89=基本符合但需额外沟通；50-69=需要跨部门让步或特批；<50=预计会被否决或需升级评审。
   - 每个方案的四个分项必须能在 description/expectedBenefit/verificationMethod 中找到对应的具体依据，不得出现"分数与文字描述对不上"的情况。
8. 严格输出符合预定义 JSON Schema 的纯 JSON 文本，包含全部必须键。
9. 【输出前自我核对（不得省略）】：
   - 生成 candidateActions 后，逐条对照本域【严禁出现的空话反模式】清单自查每个方案的 description/expectedBenefit；
   - 若命中任一反模式（如只写"加滤波电容/优化走线"而未写具体数值、封装、料号或测点），必须重写该字段后再输出，不允许原样保留空话表述；
   - 若某个数值结论所需的关键字段在【2.1 未提供的工程参数】清单中，必须在该结论旁注明依赖假设，不得默认视为已验证事实。

Return a single JSON object with these exact keys:
{
  "coreConclusion": {
    "problemSummary": "...",
    "recommendedMeasure": "...",
    "reasonSummary": "..."
  },
  "decisionFrame": {
    "decisionQuestion": "明确回答当前到底要不要继续推进/放行/改版",
    "currentDecisionGate": "当前所处工程门禁，例如 DV 准入 / EOL 放行 / 设计冻结",
    "decisionWindow": "结合 daysRemaining 给出实际剩余决策窗口",
    "bestNextAction": "未来 24 小时最应该做的一件事",
    "minimumEvidenceToProceed": ["进入下一阶段前必须拿到的最小证据"],
    "unknownsBlockingDecision": ["当前阻塞决策的关键未知量"],
    "reversalCriteria": ["出现哪些证据时必须推翻当前推荐方案"]
  },
  "multiDomainAnalysis": {
    "primaryDomain": "BLDC",
    "relatedDomains": ["EMC_RE_CE", "THERMAL"],
    "domainAssessments": [
      { "domain": "BLDC", "role": "PRIMARY", "evidenceLevel": "MEDIUM", "knownFacts": ["..."], "evidenceGaps": ["..."], "minimumValidation": "...", "domainConclusion": "..." },
      { "domain": "EMC_RE_CE", "role": "RELATED", "evidenceLevel": "LOW", "knownFacts": ["..."], "evidenceGaps": ["..."], "minimumValidation": "...", "domainConclusion": "..." }
    ],
    "crossDomainLinks": [
      { "fromDomain": "BLDC", "toDomain": "EMC_RE_CE", "mechanism": "...", "evidenceBasis": "MEASURED|CALCULATED|ASSUMPTION|AI_INFERENCE", "impact": "..." }
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
      "verificationMethod": "必须具体到测点/仪器/判据",
      "planB": "...",
      "decisionFit": "为什么它适合/不适合当前工期、样件、成本与安全门禁",
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
        const finalData = validateAndEnrichAiResult(parsed, baseline, modelConfig.model, context, issue);
        res.setHeader('X-Engine-Source', `Gemini-${modelConfig.model}`);
        return res.json({
          success: true,
          data: finalData,
          result: finalData,
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
        const finalData = validateAndEnrichAiResult(parsed, baseline, modelConfig.model, context, issue);
        res.setHeader('X-Engine-Source', `Custom-${modelConfig.model}`);
        return res.json({
          success: true,
          data: finalData,
          result: finalData,
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
