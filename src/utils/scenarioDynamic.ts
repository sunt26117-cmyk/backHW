import { CopilotAnalysisResult, IssueInput, ProjectContext } from '../types';
import { buildScenarioPassFailCriteria, getDomainPhysics, resolveEngineeringDomain, resolveEngineeringDomains } from './scenarioDomainEngine';
import { getCrossDomainCouplings } from './crossDomainCouplingMatrix';
import { recalculateStandardWeightedScore } from './scoringWeights';

const firstNum = (text: string, regs: RegExp[], fallback = NaN) => {
  for (const re of regs) {
    const m = text.match(re);
    if (m?.[1]) {
      const n = Number(m[1]);
      if (Number.isFinite(n)) return n;
    }
  }
  return fallback;
};

const safeArray = <T = any>(value: unknown): T[] => {
  if (Array.isArray(value)) return value as T[];
  if (value == null) return [];
  return [value as T];
};

const safeStringArray = (value: unknown): string[] => safeArray(value).map((v) => {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object') return asPlainObjectText(v);
  return String(v);
}).filter(Boolean);

function asPlainObjectText(value: object): string {
  const o = value as Record<string, unknown>;
  if (typeof o.standard === 'string' || typeof o.clause === 'string') return [o.standard, o.clause].filter(Boolean).join(' ');
  if (typeof o.label === 'string') return o.label;
  if (typeof o.name === 'string') return o.name;
  if (typeof o.title === 'string') return o.title;
  return JSON.stringify(o);
}

function metric(issue: IssueInput, key: string, fallback = NaN): number {
  const raw = issue.measuredValues?.[key];
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function scoreTotal(T: number, S: number, C: number, Q: number, L: number): number {
  return recalculateStandardWeightedScore({ T, S, C, Q, L });
}

function deriveScenarioRiskScore(issue: IssueInput, context: ProjectContext, domain: string): number {
  const text = `${issue.requirement || ''} ${issue.actualMeasurement || ''} ${issue.failurePhenomenon || ''}`;
  const m = issue.measuredValues || {};
  let score = 55;
  const n = (k: string) => { const v = Number(m[k]); return Number.isFinite(v) ? v : NaN; };
  if (domain === 'EMC_BCI') {
    const err = n('currentSenseErrorPct'); const recovery = n('recoveryTimeMs');
    if (Number.isFinite(err)) score += Math.min(22, Math.max(0, err - 1) * 10);
    if (Number.isFinite(recovery) && recovery > 50) score += Math.min(12, (recovery - 50) / 5);
    if (/sporadic|异常|error frame|失效/i.test(text)) score += 8;
  } else if (domain === 'EMC_RE_CE') {
    const peak = n('emcPeakDb');
    const lim = firstNum(issue.requirement || '', [/限值[^0-9]*(\d+(?:\.\d+)?)\s*dB/i, /<=\s*(\d+(?:\.\d+)?)\s*dB/i]);
    if (Number.isFinite(peak) && Number.isFinite(lim)) score += Math.max(0, Math.min(28, (peak-lim)*8));
    if (/超标|FAIL/i.test(text)) score += 8;
  } else if (domain === 'WCCA_EOL') {
    const hot = n('accuracyErrorHotPct'); const raw = n('accuracyErrorPct');
    const lim = firstNum(issue.requirement || '', [/±\s*(\d+(?:\.\d+)?)\s*%/i, /<=\s*±?\s*(\d+(?:\.\d+)?)\s*%/i]);
    const maxErr = Number.isFinite(hot) ? hot : raw;
    if (Number.isFinite(maxErr) && Number.isFinite(lim)) score += Math.min(30, Math.max(0, maxErr/lim-1)*18);
    if (/超限|exceed|超标/i.test(text)) score += 7;
  } else if (domain === 'THERMAL') {
    const tj = n('junctionTempC');
    if (Number.isFinite(tj)) score += Math.min(28, Math.max(0, tj-100)*0.55);
    if (/接近|超过|超限|热失控/i.test(text)) score += 8;
  } else if (domain === 'EMC_ESD') {
    const rec = n('recoveryTimeMs');
    if (Number.isFinite(rec) && rec > 100) score += Math.min(18, (rec - 100) / 10);
    if (/复位|reset|通信丢失|失效/i.test(text)) score += 10;
  } else if (domain === 'POWER_TRANSIENT') {
    const peak = n('pulseEcuBusPeakV'); const input = n('inputVoltageV');
    if (Number.isFinite(peak) && Number.isFinite(input) && input > 0) score += Math.min(22, Math.max(0, (peak / input - 1) * 18));
    if (/复位|reset|OVP|UVLO|过压/i.test(text)) score += 10;
  } else if (domain === 'COMPONENT') {
    const qgd = /Qgd[^0-9]*(\d+(?:\.\d+)?)\s*%/i.exec(text)?.[1];
    const soa = /SOA[^0-9]*(\d+(?:\.\d+)?)\s*%/i.exec(text)?.[1];
    if (qgd) score += Math.min(12, Number(qgd)/4);
    if (soa) score += Math.min(12, Number(soa)/4);
    if (/缺料|停产|PCN|PPAP/i.test(text)) score += 7;
  } else {
    if (issue.issueCategories?.includes('Functional Safety')) score += 10;
    if (context.daysRemaining <= 7) score += 8;
    if (issue.attachments?.length === 0) score += 4;
  }
  return Math.max(10, Math.min(98, Math.round(score)));
}

function buildDynamicCandidateActions(context: ProjectContext, issue: IssueInput, domain: string, riskScore: number): CopilotAnalysisResult['candidateActions'] {
  const days = context.daysRemaining;
  const cats = issue.issueCategories || [];
  const text = `${issue.actualMeasurement || ''} ${issue.failurePhenomenon || ''} ${issue.requirement || ''} ${issue.notes || ''}`;
  const req = issue.requirement || '当前工程规格/客户门限';
  const cond = issue.testCondition || '当前测试条件';
  const baseScores = (riskLift: number, schedule: number, cost: number, quality: number, longTerm: number) => {
    const T = Math.max(20, Math.min(98, 55 + riskLift - riskScore * 0.12));
    const S = Math.max(15, Math.min(98, schedule));
    const C = Math.max(15, Math.min(98, cost));
    const Q = Math.max(15, Math.min(98, quality));
    const L = Math.max(15, Math.min(98, longTerm));
    return { T, S, C, Q, L, total: scoreTotal(T, S, C, Q, L) };
  };
  const pDom = resolveEngineeringDomain(issue);
  const rDoms = resolveEngineeringDomains(issue).filter((d) => d !== pDom);
  const couplings = getCrossDomainCouplings(pDom, rDoms);

  const mk = (id: string, category: any, categoryLabel: string, name: string, description: string, expectedBenefit: string, scores: any, residualRisk: any, residualRiskDetail: string, sideEffects: string, timeCost: string, verificationMethod: string, planB: string): any => {
    const riskDelta = residualRisk === 'Low'
      ? '高风险隐患 ➔ 受控低残余风险 (满足门禁放行)'
      : residualRisk === 'Medium'
      ? '高不确定性 ➔ 中等受控风险 (需快速实验收敛)'
      : '潜在击穿/超差 ➔ 高残余风险 (触发一票否决或限期整改)';

    const crossDomainCouplingChecks = couplings.map((c) => ({
      rule: `【${c.fromDomain} ➔ ${c.toDomain}】${c.action}`,
      addressed: residualRisk !== 'High',
      note: residualRisk === 'High'
        ? `未消除${c.affectedDomain}跨域隐患，需在后续永久阶段补齐闭环`
        : `已纳入本方案边界控制，${c.requiredRevalidation[0] || '参数受控'}`,
    }));

    return {
      id, category, categoryLabel, name, description, expectedBenefit, scores,
      veto: { rejection_veto: residualRisk === 'High' && id.includes('Option C') && category === 'schedule_priority' && false },
      riskBefore: text.slice(0, 120), riskAfter: expectedBenefit, riskDelta, residualRisk, residualRiskDetail,
      sideEffects, verificationCost: '按当前项目实验室/样件资源实际核算', timeCost,
      failureConsequence: `若验证失败，将影响 ${context.nextMilestone}，必须切换 Plan B`,
      preconditions: `输入边界必须与当前 ${context.projectName} / ${context.projectPhase} 一致`,
      verificationMethod, planB,
      crossDomainCouplingChecks,
    };
  };

  if (domain === 'EMC_BCI') {
    const inj = metric(issue, 'bciInjectionMa');
    const freq = metric(issue, 'bciSensitiveFreqMhz');
    const err = metric(issue, 'currentSenseErrorPct');
    const recovery = metric(issue, 'recoveryTimeMs');
    return [
      mk('Option A','conservative','物理链路治理','优先整改共模回流/端口滤波并同步验证 BCI',`围绕 ${Number.isFinite(freq)?freq:'目标'}MHz / ${Number.isFinite(inj)?inj:'目标'}mA 注入点，改变连接器/TVS/共模电感/采样回流路径，禁止先靠软件滤波掩盖。`,`目标是把受扰节点异常从“功能失效”降到“可控扰动”，并让恢复时间可验证。`,baseScores(28,55,45,92,88),'Low','物理路径被改善但需要重新确认 EMC 发射与热副作用。','可能需要局部硬件修改与样件',`5~${Math.max(2, Math.min(10, days))} 天`,'BCI 注入电流与受扰节点波形同步记录；同时记录 CAN 错误帧/采样误差/恢复时间','保留软件诊断窗口作为临时措施，但不得代替物理整改。'),
      mk('Option B','balanced','证据优先','先做逐频点敏感度扫描 + A/B 隔离，再决定硬件改动',`以 ${Number.isFinite(freq)?freq:'敏感'}MHz 附近为中心做注入电流—敏感节点—功能状态三联表，隔离线束、参考地、滤波、屏蔽变量。`,`用最小验证集识别真正主导路径，避免无效改板。当前节点剩余 ${days} 天时最适合并行执行。`,baseScores(24,90,78,88,90),'Medium','若路径定位慢，可能压缩后续整改窗口。','需要暗室/BCI 工位与多路同步测量','2~3 天','逐频点 Iinj/Vnoise/function 三联测；重复敏感点后做 A/B','若仍无法闭环，立即执行局部物理滤波/回流改动的 Plan B。'),
      mk('Option C','schedule_priority','节点优先但受控','只调整软件异常门限/恢复逻辑，不改变物理链路',`仅处理 ${Number.isFinite(recovery)?recovery+'ms':'当前'} 恢复窗口和误报，不解决注入电流耦合本体。`,`短期可能减少用户可见异常，但不能证明 EMC 物理通过，也不应作为长期关闭条件。`,baseScores(5,96,92,45,35),'High','物理根因未消除，量产/其他 ECU 平台迁移风险高。','软件验证快，但可能掩盖真实硬件敏感度','1~2 天','必须保留未屏蔽软件前的 BCI 物理证据，并要求后续硬件闭环','作为临时缓解，不得关闭根因问题。')
    ];
  }

  if (domain === 'EMC_ESD') {
    const kv = metric(issue,'esdLevelKv'); const rec = metric(issue,'recoveryTimeMs');
    return [
      mk('Option A','conservative','物理路径治理','优化放电回流 + TVS/连接器保护布局',`围绕 ${Number.isFinite(kv)?kv:'当前'}kV 放电路径，优先处理连接器回流、TVS位置、壳体/屏蔽参考与敏感IO保护，不先靠软件屏蔽。`,`降低真实放电能量进入敏感节点的概率，并保留功能恢复证据。`,baseScores(27,65,52,92,92),'Low','需复测不同放电点与装配状态，可能有小改板成本。','TVS/地回流局部改动','3~7 天','逐端口接触/空气放电 + VBUS/CAN/MCU reset同步记录','保留诊断/恢复策略作为二次缓解。'),
      mk('Option B','balanced','证据优先','端口扫描 + 放电路径 A/B 定位',`先建立放电点—敏感节点—功能状态矩阵，比较 TVS、参考地、屏蔽和回流路径变化。`,`快速识别真正的主导路径，减少盲改。`,baseScores(23,90,82,90,91),'Medium','如果放电点多，测试矩阵会较大。','需要ESD工位和同步示波器','2~4 天','建立端口×等级×功能状态×恢复时间矩阵','若定位失败，切换物理保护优化。'),
      mk('Option C','schedule_priority','节点优先但受控','增强软件恢复与错误隔离作为临时措施',`针对${Number.isFinite(rec)?rec+'ms':'当前'}恢复窗口优化复位与通信重连，但明确不替代ESD物理闭环。`,`保护里程碑、缩短用户可见异常，但不能证明潜在损伤不存在。`,baseScores(8,97,93,55,40),'High','可能掩盖硬件敏感路径，必须设置过期日期。','固件状态机验证','1~2 天','必须保留原始放电与故障证据并验证潜在损伤','到期仍无法物理闭环则升级硬件整改。')
    ];
  }

  if (domain === 'POWER_TRANSIENT') {
    const peak = metric(issue,'pulseEcuBusPeakV'); const min = metric(issue,'pulseEcuBusMinV');
    return [
      mk('Option A','conservative','保护链路整改','优化TVS/输入滤波/阻尼并复核内部电源轨',`围绕 ECU 端峰值 ${Number.isFinite(peak)?peak:'当前'}V 与最低值 ${Number.isFinite(min)?min:'当前'}V，区分源端与内部电源轨应力。`,`从能量路径上降低器件应力与复位风险。`,baseScores(28,62,50,93,94),'Low','硬件节奏较长，但风险下降最彻底。','器件/BOM或布局可能变化','5~10 天','源端+ECU端双测点，覆盖温度与规定脉冲族','保留软件复位恢复作为辅助，但不得替代保护整改。'),
      mk('Option B','balanced','系统优化','DC/DC控制环 + 输入阻抗 + 去耦组合调优',`针对内部电源轨动态响应，做补偿/去耦与源阻抗 A/B，找出哪一项决定峰值与恢复。`,`以较小改动提升瞬态裕量。`,baseScores(23,88,76,91,90),'Medium','需要控制环与硬件联合验证。','验证时间中等','3~6 天','双通道电源波形 + reset/CAN行为 + 热角点','必要时再上更强TVS。'),
      mk('Option C','schedule_priority','临时受控','软件 brown-out / restart 策略优化',`仅降低瞬态导致的功能不可恢复时间，不解决内部电源轨可能越界的问题。`,`短期保护节点，但必须保留器件应力证据。`,baseScores(7,96,93,55,38),'High','潜在物理损伤不能用软件规避。','软件风险回归','1~2 天','必须确认器件绝对最大额定值未被突破','超过任何硬件门限立即切换硬件方案。')
    ];
  }

  if (domain === 'WCCA_EOL') {
    const raw = metric(issue,'accuracyErrorPct');
    const hot = metric(issue,'accuracyErrorHotPct');
    const n = metric(issue,'sampleCount');
    return [
      mk('Option A','conservative','设计升级','升级低漂移基准/采样链并重新做 WCCA',`针对当前 ±误差目标重新选低漂移器件，重新计算初始公差、温漂、老化与制造离散。`,`技术裕量最大，但要把 BOM、交期和全温验证纳入总成本，而不能只看理论误差。`,baseScores(30,55,42,94,94),'Low','最稳妥但成本/改板周期较高。','BOM 与样件周期增加','7~14 天','全温四点 + 代表性老化 + WCCA/RSS/Monte Carlo 与实测交叉验证','继续使用现板 + EOL Calibration 作为第二轨。'),
      mk('Option B','balanced','工程平衡推荐','EOL Offset/Gain Calibration + 温漂/老化残余预算闭环',`将可校准的初始误差与不可校准的温漂/老化项拆开，基于 ${Number.isFinite(n)?n:'当前'} 台样件分布验证残余误差。`,`只有当残余误差在全温/寿命范围内仍满足客户门限时，EOL 标定才能作为正式闭环。`,baseScores(25,88,86,91,88),'Medium','对量产窗口与校准工艺依赖较大，需要 Cpk/重复性证据。','增加 EOL 时间与治具维护成本','3~7 天','多温点 Calibration 前后误差 + 重复性 + Cpk/Ppk + 老化残余趋势','若高温残余仍超限，切换器件/增益架构方案。'),
      mk('Option C','schedule_priority','仅靠统计合理化','用 RSS/Monte Carlo 替代 Extreme Worst Case 直接放行',`利用统计方法降低理论误差，但不补充相关性与实测分布证据。`,`只能作为分析视角，不能单独作为客户规格放行依据。`,baseScores(0,97,95,35,30),'High','若客户要求硬性绝对边界，统计方法不能直接替代最坏情况证据。','报告生成快，但关闭风险大','1 天','必须至少有实测分布、相关性假设及客户接受准则','保留为内部 sensitivity analysis，不作为放行结论。')
    ];
  }

  if (domain === 'ROBOT_JOINT') {
    return [
      mk('Option A', 'conservative', '物理硬件重构', 'PCB Layout 双通道 STO 物理隔离 + 关节第二编码器全闭环 + 泄放电阻外置散热', '从硬件单板走线、机械测角全闭环与传热路径从源头根治背隙、单点失效与过热。', '彻底达到量产级硬指标，通过正式 TÜV Cat 3 PLd 认证并具备长期运行可靠性。', baseScores(18, 55, 45, 95, 95), 'Low', '需重新投板制作 PCB 并微调机械结构，工期 22~25 天。', 'PCB 投板打样 + 机械小改模', '22~25 天', '激光干涉仪双向定位精度复测 + STO 单通道短路/开路故障注入 + 连续满载温升', '并行推进软件补偿作为过渡，待新硬件归档后完成切换。'),
      mk('Option B', 'balanced', '双轨推进 (推荐)', '软件反向间隙查表动态补偿 + 外挂独立双通道安全继电器箱过渡 + 加减速 S 曲线回馈削峰', '利用固件反向补偿消除背隙，外设独立安全盒确保 STO 双通道电气隔离，微调加减速保护电阻。', '在不改动板卡 (0天PCB工期) 前提下，将末端精度压入 2.5 arcmin 以内，通过现场符合性预审。', baseScores(25, 92, 90, 88, 88), 'Medium', '软件补偿在磨损老化后可能漂移，外置安全盒不能替代量产单板设计。', '激光干涉仪全行程标定 + 外置安全继电器模块', '3~4 天', '激光干涉仪 10 次往复测量重复定位误差 + STO 故障注入切断时延抓波 + 100% 负荷热电偶温升', '若精度离散度超出 2.5 arcmin，立即降速运行并启动 Option A 硬件投板。'),
      mk('Option C', 'schedule_priority', '高风险放行 (一票否决)', '仅在上位机单边调大目标误差容限，不对硬件与安全机制做任何整改', '直接放宽重复定位精度指标至 4.5 arcmin，并出具免责说明申请现场免检。', '眼前不改动任何软硬件，但直接违反 ISO 13849-1 及合同技术规格。', baseScores(0, 98, 98, 20, 10), 'High', '面临客户拒收退货索赔，且 STO 单点共地共因失效触碰产品责任法规红线。', '无法通过验收', '0 天', '无法通过', '无')
    ];
  }

  // Generic dynamic set for other domains: avoid hard-coded case-specific numeric claims.
  const domainLabel = cats[0] || domain;
  return [
    mk('Option A','conservative','技术稳妥','按当前物理根因直接做设计修正',`围绕“${(issue.failurePhenomenon || issue.engineeringConcern || '当前问题').slice(0,100)}”实施源头整改，并在当前边界 ${cond.slice(0,100)} 下验证。`,`降低根因风险并建立可重复验证条件。`,baseScores(24,60,48,92,90),'Low','技术风险较低，代价是可能产生改板/样件周期。','可能影响 BOM/PCB/结构','与当前节点并行排期','建立修正前后 A/B 对比与最坏边界复测','保留临时措施作为第二轨。'),
    mk('Option B','balanced','证据优先','先验证最大不确定性，再决定改动范围',`把当前未知项转成最小可区分试验，先做因果隔离，再提交方案。`,`优先提高决策信息质量，避免无证据改动。`,baseScores(20,92,80,90,92),'Medium','对验证资源要求较高，但可减少无效设计迭代。','需要安排专项测试资源','2~3 天','针对首要 unknown 做 A/B 或边界扫描','验证失败时执行源头整改。'),
    mk('Option C','schedule_priority','节点优先但受控','采用临时缓解措施确保节点，再补根因闭环',`围绕当前项目节点 ${context.nextMilestone} 设置时间盒和临时控制，但不把临时措施写成永久设计。`,`保护里程碑，但必须设置明确关闭日期与回归条件。`,baseScores(10,97,90,58,45),'High','可能把物理问题遗留到后续阶段。','后续验证与返工成本可能上升','1~2 天','必须给出临时措施失效边界与退出条件','超出时间盒立即转源头整改。')
  ];
}

export function applyScenarioDynamicLayer(result: CopilotAnalysisResult, context: ProjectContext, issue: IssueInput): CopilotAnalysisResult {
  const domain = resolveEngineeringDomain(issue);
  const text = `${issue.actualMeasurement || ''} ${issue.testCondition || ''} ${issue.failurePhenomenon || ''} ${issue.requirement || ''}`;
  const measuredV = firstNum(text, [/实测[^\d]{0,18}(\d+(?:\.\d+)?)\s*V/i, /(?:峰值|peak)[^\d]{0,10}(\d+(?:\.\d+)?)\s*V/i]);
  const rpm = firstNum(text, [/(\d+(?:\.\d+)?)\s*rpm/i, /转速[^\d]{0,10}(\d+(?:\.\d+)?)/i]);
  const temp = firstNum(text, [/(?:环温|环境温度|ambient|温箱)[^\d-]{0,10}([+-]?\d+(?:\.\d+)?)\s*℃/i]);
  const overDb = firstNum(text, [/([+-]?\d+(?:\.\d+)?)\s*dB\b/i]);
  const errPct = firstNum(text, [/±\s*(\d+(?:\.\d+)?)\s*%/i, /(\d+(?:\.\d+)?)\s*%/i]);


  const profile = getDomainPhysics(issue);
  const cfg = {
    title: profile.title,
    root: `${profile.question} ${issue.failurePhenomenon || issue.engineeringConcern || '当前工况根因待验证。'}`,
    factors: profile.chain.split('→').map((x) => x.trim()).filter(Boolean).slice(0, 3),
    verify: profile.tests,
  };
  const prefix = `【${domain} / ${context.projectPhase} / 剩余${context.daysRemaining}天】`;

  const scenarioPass = buildScenarioPassFailCriteria(issue, context);

  const dynamic = structuredClone(result) as CopilotAnalysisResult & { __scenarioLabel?: string };
  dynamic.whyNotComparison = safeArray(dynamic.whyNotComparison).map((x: any) => ({
    optionId: String(x?.optionId || x?.id || 'Option'),
    optionName: String(x?.optionName || x?.name || '未命名方案'),
    categoryLabel: String(x?.categoryLabel || x?.category || '方案'),
    isRecommended: Boolean(x?.isRecommended),
    verdictTitle: String(x?.verdictTitle || (x?.isRecommended ? '为什么选它' : '为什么不选它')),
    coreTradeoffReason: String(x?.coreTradeoffReason || x?.tradeoffRationale || x?.whyNotChosenReason || ''),
    keyRiskOrPenalty: safeStringArray(x?.keyRiskOrPenalty ?? x?.closingEvidence ?? x?.keyPenalties),
    reActivationCondition: String(x?.reActivationCondition || x?.reActivation || '验证失败或边界条件变化时重新评估'),
  }));
  dynamic.finalRecommendation = {
    ...dynamic.finalRecommendation,
    whyReason: safeStringArray(dynamic.finalRecommendation?.whyReason),
    immediateSteps: safeArray(dynamic.finalRecommendation?.immediateSteps),
    preconditions: safeStringArray(dynamic.finalRecommendation?.preconditions),
    unacceptableActions: safeStringArray(dynamic.finalRecommendation?.unacceptableActions),
    stopConditions: safeStringArray(dynamic.finalRecommendation?.stopConditions),
    reEvaluationTriggers: safeStringArray(dynamic.finalRecommendation?.reEvaluationTriggers),
  } as any;
  dynamic.__scenarioLabel = `${context.projectName}｜${context.projectPhase}｜${(issue.issueCategories || ['Other']).join(' / ')}｜${issue.failurePhenomenon || issue.engineeringConcern || '当前问题'}`;
  dynamic.coreConclusion = {
    ...dynamic.coreConclusion,
    problemSummary: `${prefix} ${issue.failurePhenomenon || issue.engineeringConcern || dynamic.coreConclusion.problemSummary}`,
    recommendedMeasure: `${prefix} ${dynamic.coreConclusion.recommendedMeasure}`,
    reasonSummary: `${prefix} ${cfg.root}`,
  };
  dynamic.physicalMechanism = {
    ...dynamic.physicalMechanism,
    rootCauseAnalysis: cfg.root,
    keyPhysicalFactors: cfg.factors.map((f, i) => ({
      factor: f,
      description: [
        issue.actualMeasurement || '用当前工况实测值校正模型',
        issue.testCondition || '按当前工况边界重新计算',
        issue.requirement || '以当前客户/标准门限作为判定边界'
      ][i]
    }))
  };
  dynamic.knownFacts = [
    `当前工程：${context.projectName}｜${context.productType}｜${context.projectPhase}｜${context.asilLevel}`,
    `当前类别：${(issue.issueCategories || ['Other']).join(' / ')}`,
    issue.actualMeasurement || '暂无实测回填',
    issue.testCondition || '暂无测试条件回填',
    ...(result.knownFacts || []).filter(x => !/3800rpm|37\.8V|40V|48MHz|2\.15V|BLDC/i.test(x)).slice(0, 6)
  ];
  dynamic.next24HourPlan = {
    timeline: (result.next24HourPlan?.timeline || []).map((t, i) => ({
      ...t,
      task: `${cfg.verify[i % cfg.verify.length]}；${t.task}`,
      deliverable: `${t.deliverable}｜证据必须标注 MEASURED / CALCULATED / SPEC`
    })),
    passFailCriteria: scenarioPass,
  };
  dynamic.whyNotComparison = safeArray(dynamic.whyNotComparison).map((x: any) => ({
    ...x,
    coreTradeoffReason: `${prefix} ${String(x.coreTradeoffReason || '')}`,
    keyRiskOrPenalty: safeStringArray(x.keyRiskOrPenalty),
  }));
  dynamic.candidateActions = (dynamic.candidateActions || []).map((a) => ({
    ...a,
    description: `${prefix} ${a.description}`,
    expectedBenefit: `${prefix} ${a.expectedBenefit}`,
    riskBefore: `${prefix} ${issue.actualMeasurement || a.riskBefore}`,
    verificationMethod: `${cfg.verify.join('；')}。原方案：${a.verificationMethod}`,
  }));
  dynamic.finalRecommendation = {
    ...dynamic.finalRecommendation,
    whyReason: [prefix, ...safeStringArray(dynamic.finalRecommendation?.whyReason)].filter(Boolean),
    immediateSteps: safeArray(dynamic.finalRecommendation?.immediateSteps).map((step: any, idx) => ({ ...step, step: Number(step?.step) || idx + 1, action: `${cfg.verify[idx % cfg.verify.length]}：${String(step?.action || step?.title || '')}` })),
  };
  const existingDocs = (dynamic.engineeringDocs || {}) as any;
  dynamic.engineeringDocs = {
    ...existingDocs,
    pmDecisionEmail: {
      ...existingDocs.pmDecisionEmail,
      subject: `【${domain}】${context.projectName}｜${existingDocs.pmDecisionEmail?.subject || '工程决策请求'}`,
      technicalFact: `${issue.actualMeasurement || '暂无实测'}｜${issue.requirement || '暂无规格'}｜测试条件：${issue.testCondition || '待补充'}`,
      currentSituation: `${issue.failurePhenomenon || issue.engineeringConcern || '当前工况问题'}｜${context.nextMilestone}｜剩余${context.daysRemaining}天`,
      risk: issue.engineeringConcern || '未评估',
      options: (dynamic.candidateActions || []).map((a: any) => a.name).join(' / ') || '待生成',
      recommendedOption: (dynamic.candidateActions || [])[0]?.name || '待定',
      costImpact: context.costConstraint || '待评估',
      scheduleImpact: '剩余 ' + context.daysRemaining + ' 天',
      requiredDecision: '是否放行进入下一工程门禁',
      decisionOwner: 'PM / 硬件负责人',
      deadline: '剩余 ' + context.daysRemaining + ' 天内',
      assumedProceeding: '默认按推荐方案推进，除非触发一票否决',
      changeConsequence: '若延期或变更，需走 VDA ECR / IATF 16949 变更流程',
    },
    meetingMinutes: {
      ...existingDocs.meetingMinutes,
      title: `【${domain}】${context.projectName}｜${existingDocs.meetingMinutes?.title || '工程评审会纪要'}`,
      discussionSummary: `${cfg.root} 当前验证主线：${cfg.verify.join('；')}。${existingDocs.meetingMinutes?.discussionSummary || ''}`
    }
  };

  // Strip obvious historical BLDC numeric leakage from non-BLDC narrative fields.
  if (domain !== 'BLDC') {
    const replaceLegacy = (s: string) => s
      .replace(/3800\s*rpm/gi, rpm ? `${rpm} rpm` : '当前工况转速')
      .replace(/37\.8\s*V/g, Number.isFinite(measuredV) ? `${measuredV} V` : '当前实测母线峰值')
      .replace(/40\s*V/g, '当前器件额定耐压')
      .replace(/48MHz/g, '当前主要噪声/谐振频点')
      .replace(/2\.15\s*V/g, '当前门极实测尖峰');
    dynamic.candidateActions = dynamic.candidateActions.map(a => ({ ...a, description: replaceLegacy(a.description), expectedBenefit: replaceLegacy(a.expectedBenefit), riskBefore: replaceLegacy(a.riskBefore), residualRiskDetail: replaceLegacy(a.residualRiskDetail) }));
    dynamic.coreConclusion = { ...dynamic.coreConclusion, problemSummary: replaceLegacy(dynamic.coreConclusion.problemSummary), reasonSummary: replaceLegacy(dynamic.coreConclusion.reasonSummary) };
  }
  void overDb; void errPct;
  // BLDC 也重建通用支柱(classifiedInfo/multiRiskBreakdown/redTeamChallenge/edrRecord/whyNotComparison/next24HourPlan)，
  // 避免 decisionPillars.getBldcPillars 里 3800rpm/48MHz/37.8V 等参考案例数字泄漏进结果。
  if (domain === 'BLDC') {
    const riskScore = dynamic.riskRatings?.overallRiskScore ?? 60;
    const presentInputs = Object.entries(issue.measuredValues || {})
      .filter(([, v]) => v !== '' && v !== null && v !== undefined)
      .map(([k, v]) => k + '=' + v);
    const missingRequired = profile.measurements.filter((f) => f.required && !(issue.measuredValues?.[f.key] !== undefined && issue.measuredValues?.[f.key] !== ''));
    dynamic.classifiedInfo = [
      { id: 'FACT-01', tag: 'MEASURED', title: '当前工程事实', content: issue.actualMeasurement || issue.failurePhenomenon || '暂无实测结果', sourceOrBasis: issue.measuredValueSource === 'BENCHMARK' ? 'BENCHMARK · 示例输入' : issue.measuredValueSource === 'IMPORTED' ? 'IMPORTED · 原始数据导入' : 'USER_MEASURED · 工程师回填', confidenceLevel: issue.measuredValueSource === 'BENCHMARK' ? 40 : (issue.actualMeasurement || issue.failurePhenomenon) ? 92 : 20, verificationMethod: '保留原始报告/波形/CSV作为证据' },
      { id: 'FACT-02', tag: 'SPEC', title: '当前放行基线', content: issue.requirement || '规格尚未提供', sourceOrBasis: '客户/标准/设计规格，由工程师确认适用性', confidenceLevel: issue.requirement ? 90 : 20 },
      { id: 'FACT-03', tag: 'CALCULATED', title: '确定性领域计算', content: 'BLDC 物理链路：' + profile.chain + '；输出：' + profile.outputs.slice(0, 4).join('、'), sourceOrBasis: 'ECU Copilot 领域规则 + 当前输入', confidenceLevel: 85, verificationMethod: '用实验结果回灌并做模型-实测交叉验证' },
    ];
    const lvl = (score: number) => (score >= 82 ? 'High' : score >= 68 ? 'Medium-High' : score >= 50 ? 'Medium' : 'Low');
    const dim = (name: string, key: 'techMargin' | 'reliabilityStress' | 'scheduleDelay' | 'redesignCost' | 'verificationGap', score: number, evidence: string) => ({ name, dimensionKey: key, score, level: lvl(score) as any, evidence });
    dynamic.multiRiskBreakdown = {
      techMargin: dim('技术裕量', 'techMargin', riskScore, 'BLDC：' + profile.question),
      reliabilityStress: dim('可靠性应力', 'reliabilityStress', Math.min(98, riskScore), profile.chain),
      scheduleDelay: dim('节点风险', 'scheduleDelay', Math.min(98, 50 + Math.max(0, 14 - context.daysRemaining) * 2), '剩余 ' + context.daysRemaining + ' 天 / ' + context.nextMilestone),
      redesignCost: dim('改动成本', 'redesignCost', Math.min(98, 45), context.costConstraint || '成本约束待输入'),
      verificationGap: dim('验证缺口', 'verificationGap', Math.min(98, 25 + missingRequired.length * 12), '必填数据缺口：' + (missingRequired.map((f) => f.label).join('、') || '无')),
    };
    dynamic.redTeamChallenge = {
      auditVerdict: '当前 BLDC 结论只有在“事实—物理机理—验证”三者一致时才能进入正式放行。',
      riskGaps: ['是否把 BLDC 之外的历史案例数字误当成当前项目事实？', '是否存在未量测但被方案叙述默认通过的关键边界？', '模型是否存在相关性、温漂、装配状态或测试夹具影响的未验证假设？'],
      missingEvidenceList: missingRequired.map((f) => f.label + (f.unit ? ' (' + f.unit + ')' : '')),
      confidenceScorePct: issue.measuredValueSource === 'BENCHMARK' ? 55 : profile.measurements.filter((f) => f.required).length === 0 ? 75 : Math.round((profile.measurements.filter((f) => f.required && issue.measuredValues?.[f.key] !== undefined && issue.measuredValues?.[f.key] !== '').length / Math.max(1, profile.measurements.filter((f) => f.required).length)) * 100),
    };
    const ranked = [...(dynamic.candidateActions || [])].sort((a: any, b: any) => (b.scores?.total || 0) - (a.scores?.total || 0));
    const best = ranked[0];
    if (best) {
      dynamic.whyNotComparison = dynamic.candidateActions.map((a: any, idx: number) => ({
        optionId: a.id, optionName: a.name, categoryLabel: a.categoryLabel, isRecommended: a.id === best.id,
        verdictTitle: a.id === best.id ? '为什么选它' : '为什么不选它',
        coreTradeoffReason: a.id === best.id ? '在当前 BLDC 工况下，综合 T/S/C/Q/L 后总分 ' + (a.scores?.total ?? '') + '。' : '相对首选方案的主要差异：' + (a.residualRiskDetail || a.residualRisk),
        keyRiskOrPenalty: [a.residualRiskDetail, a.sideEffects].filter(Boolean),
        reActivationCondition: a.id === best.id ? '出现新实测证据、规格变化或验证失败时重新评估。' : ((a.planB || '') + '；验证首选方案失败时重新激活。'),
      }) as any);
      const timelineBase = cfg.verify.length ? cfg.verify : ['补齐当前工况关键实测证据', '做最小区分试验', '回填结果并重算', '执行门禁复核'];
      dynamic.next24HourPlan = {
        timeline: timelineBase.slice(0, 4).map((task: string, i: number) => ({
          timeWindow: ['0~2h', '2~6h', '6~12h', '12~24h'][i], phase: 'Current Scenario Closed Loop',
          task: task + '；配套方案：' + (dynamic.candidateActions[(i) % dynamic.candidateActions.length]?.name || ''),
          owner: '硬件负责人 / 验证测试工程师', deliverable: 'MEASURED / CALCULATED 证据 + Go/No-Go结论',
        })),
        passFailCriteria: buildScenarioPassFailCriteria(issue, context),
      };
      dynamic.edrRecord = {
        edrId: 'EDR-BLDC-' + Date.now().toString(36).toUpperCase(),
        projectCode: context.projectName, decisionDate: new Date().toISOString().slice(0, 10), decisionMaker: 'HW Lead / 决策评审会',
        coreProblem: 'BLDC：' + (issue.failurePhenomenon || issue.engineeringConcern || '当前工程问题'),
        measuredSnapshot: issue.actualMeasurement || '暂无实测回填', specThreshold: issue.requirement || '规格/客户门限待输入',
        engineeringAssumptions: ['未测量的字段保持 UNKNOWN，不自动生成人为实测值', '当前风险评分 ' + riskScore + '/100（由当前工况输入推导）'],
        chosenOptionId: best.id, chosenOptionTitle: best.name,
        rejectedOptionsSummary: ranked.filter((a: any) => a.id !== best.id).map((a: any) => a.name + '：残余风险 ' + a.residualRisk).join('；'),
        defenseBasis: '基于当前 BLDC 工况输入与确定性规则排序，首选方案总分 ' + (best.scores?.total ?? ''),
        signOffSignatures: [{ role: '硬件负责人', name: 'HW Lead', status: 'Pending', signDate: '' }, { role: '质量经理', name: 'QA Manager', status: 'Pending', signDate: '' }],
        localHashDigest: 'PENDING', decisionStatus: 'CONDITIONALLY_APPROVED', createdAt: new Date().toISOString(),
      };
      if (dynamic.engineeringDocs) dynamic.engineeringDocs.edrRecord = dynamic.edrRecord;
    }
  }
  // Replace case-specific candidate tables with scenario-native actions for non-BLDC domains.
  // This prevents the legacy EMC/WCCA case library from leaking 150MHz/BLDC numbers into unrelated scenarios.
  if (domain !== 'BLDC') {
    const riskScore = dynamic.riskRatings.overallRiskScore || 60;
    const scenarioDomainKey = domain === 'EMC_BCI' || /BCI|大电流注入|11452-4/i.test(`${issue.failurePhenomenon} ${issue.notes}`) ? 'EMC_BCI' : domain === 'WCCA_EOL' ? 'WCCA_EOL' : domain;

    // Rebuild the P0 evidence summaries from the active domain instead of keeping legacy
    // case-library pillars. This is the main anti-leak mechanism for 5/6/7/8/10.
    const presentInputs = Object.entries(issue.measuredValues || {})
      .filter(([, v]) => v !== '' && v !== null && v !== undefined)
      .slice(0, 8)
      .map(([k, v]) => `${k}=${v}`);
    dynamic.knownFacts = [
      issue.actualMeasurement || '暂无实测数据',
      `测试边界：${issue.testCondition || '待补充'}`,
      presentInputs.length ? `结构化输入：${presentInputs.join('；')}` : '尚无结构化输入；禁止用案例数字替代',
    ];
    dynamic.assumptions = [
      `当前物理领域：${scenarioDomainKey}`,
      `标准/客户适用性需工程师确认：${issue.requirement || '待输入'}`,
      '未测量字段保持为 UNKNOWN，不自动生成人为实测值',
    ];
    dynamic.unknowns = [
      ...(Array.isArray(result.unknowns) ? result.unknowns.map(String) : []),
      ...profile.measurements.filter(f => f.required && !(issue.measuredValues?.[f.key] !== undefined && issue.measuredValues?.[f.key] !== '')).map(f => `${f.label}尚未录入`),
    ].slice(0, 8);
    dynamic.classifiedInfo = [
      { id:'FACT-01', tag:'MEASURED', title:'当前工程事实', content: issue.actualMeasurement || '暂无实测结果', sourceOrBasis: issue.measuredValueSource === 'BENCHMARK' ? 'BENCHMARK · 示例输入' : issue.measuredValueSource === 'IMPORTED' ? 'IMPORTED · 原始数据导入' : 'USER_MEASURED · 工程师回填', confidenceLevel: issue.measuredValueSource === 'BENCHMARK' ? 40 : issue.actualMeasurement ? 92 : 20, verificationMethod: '保留原始报告/波形/CSV作为证据' },
      { id:'FACT-02', tag:'SPEC', title:'当前放行基线', content: issue.requirement || '规格尚未提供', sourceOrBasis:'客户/标准/设计规格，由工程师确认适用性', confidenceLevel: issue.requirement ? 90 : 20 },
      { id:'FACT-03', tag:'CALCULATED', title:'确定性领域计算', content: `${profile.chain}；输出：${profile.outputs.slice(0,4).join('、')}`, sourceOrBasis:'ECU Copilot 领域规则 + 当前输入', confidenceLevel: 85, verificationMethod: '用实验结果回灌并做模型-实测交叉验证' },
    ];
    const lvl = (score:number) => score >= 82 ? 'High' : score >= 68 ? 'Medium-High' : score >= 50 ? 'Medium' : 'Low';
    const dim = (name:string, key:'techMargin'|'reliabilityStress'|'scheduleDelay'|'redesignCost'|'verificationGap', score:number, evidence:string) => ({ name, dimensionKey:key, score, level:lvl(score) as any, evidence });
    dynamic.multiRiskBreakdown = {
      techMargin: dim('技术裕量','techMargin',riskScore,`${scenarioDomainKey}：${profile.question}`),
      reliabilityStress: dim('可靠性应力','reliabilityStress',Math.min(98,riskScore + (domain==='THERMAL'||domain==='COMPONENT'?7:0)),profile.chain),
      scheduleDelay: dim('节点风险','scheduleDelay',Math.min(98,50 + Math.max(0,14-context.daysRemaining)*2),`剩余 ${context.daysRemaining} 天 / ${context.nextMilestone}`),
      redesignCost: dim('改动成本','redesignCost',Math.min(98,45 + (domain==='COMPONENT'||domain==='THERMAL'?12:0)),context.costConstraint || '成本约束待输入'),
      verificationGap: dim('验证缺口','verificationGap',Math.min(98,25 + profile.measurements.filter(f => f.required && !(issue.measuredValues?.[f.key] !== undefined && issue.measuredValues?.[f.key] !== '')).length*12),`必填数据缺口：${getDomainPhysics(issue).measurements.filter(f=>f.required && !(issue.measuredValues?.[f.key] !== undefined && issue.measuredValues?.[f.key] !== '')).map(f=>f.label).join('、') || '无'}`),
    };
    dynamic.redTeamChallenge = {
      auditVerdict: `当前${scenarioDomainKey}结论只有在“事实—物理机理—验证”三者一致时才能进入正式放行。`,
      riskGaps: [
        `是否把${scenarioDomainKey}之外的历史案例数字误当成当前项目事实？`,
        '是否存在未量测但被方案叙述默认通过的关键边界？',
        '模型是否存在相关性、温漂、装配状态或测试夹具影响的未验证假设？',
      ],
      missingEvidenceList: profile.measurements.filter(f => f.required && !(issue.measuredValues?.[f.key] !== undefined && issue.measuredValues?.[f.key] !== '')).map(f => `${f.label}${f.unit ? ` (${f.unit})` : ''}`),
      confidenceScorePct: issue.measuredValueSource === 'BENCHMARK' ? 55 : profile.measurements.filter(f=>f.required).length === 0 ? 75 : Math.round((profile.measurements.filter(f=>f.required && issue.measuredValues?.[f.key] !== undefined && issue.measuredValues?.[f.key] !== '').length / profile.measurements.filter(f=>f.required).length)*100),
    };
    dynamic.candidateActions = buildDynamicCandidateActions(context, issue, scenarioDomainKey, riskScore);
    const nativeRiskScore = deriveScenarioRiskScore(issue, context, scenarioDomainKey);
    const nativeRisk = nativeRiskScore >= 82 ? 'High' : nativeRiskScore >= 68 ? 'Medium-High' : nativeRiskScore >= 50 ? 'Medium' : 'Low';
    dynamic.riskRatings = { ...dynamic.riskRatings, overallRiskScore: nativeRiskScore, overallRisk: nativeRisk as any, technicalRisk: nativeRisk as any };
    const ranked = [...dynamic.candidateActions].sort((a,b) => b.scores.total - a.scores.total);
    const best = ranked[0];
    if (best) {
      const bestIndex = dynamic.candidateActions.findIndex(a => a.id === best.id);
      dynamic.finalRecommendation = {
        recommendedOptionId: best.id,
        recommendedOptionName: best.name,
        recommendationGrade: best.residualRisk === 'Low' ? 'Strongly Recommended' : best.residualRisk === 'Medium' ? 'Conditionally Recommended' : 'Caution',
        whyReason: [`根据当前 ${scenarioDomainKey} 工况及风险 ${nativeRiskScore}/100 排序；首选方案：${best.name}`, `决策依据优先使用当前项目输入、实测/导入证据与确定性领域规则；没有实测的数据不会被伪装成测量事实。`],
        immediateSteps: best.verificationMethod.split('；').slice(0,4).map((x,i) => ({ step:i+1, title:`验证-${i+1}`, action:x, expectedEvidence:'MEASURED / CALCULATED 证据回填' } as any)),
        preconditions: [best.preconditions],
        unacceptableActions: ranked.filter(a => a.id !== best.id).slice(-2).map(a => `${a.name}：残余风险 ${a.residualRisk}`),
        stopConditions: [best.veto.veto_reason || `当前 ${scenarioDomainKey} 工况关键门限超限时立即停止放行`],
        reEvaluationTriggers: [`实测结果与当前模型差异 > 20%`, `关键未知项解除或新增安全/客户红线`],
        planB: best.planB,
      };

      dynamic.whyNotComparison = dynamic.candidateActions.map((a, idx) => ({
        optionId: a.id, optionName: a.name, categoryLabel: a.categoryLabel, isRecommended: a.id === best.id,
        verdictTitle: a.id === best.id ? '为什么选它' : '为什么不选它',
        coreTradeoffReason: a.id === best.id ? `在当前 ${scenarioDomainKey} 工况下，综合 T/S/C/Q/L 后总分 ${a.scores.total}。` : `相对首选方案的主要差异：${a.residualRiskDetail}`,
        keyRiskOrPenalty: [a.residualRiskDetail, a.sideEffects].filter(Boolean),
        reActivationCondition: a.id === best.id ? '出现新实测证据、规格变化或验证失败时重新评估。' : `${a.planB}；验证首选方案失败时重新激活。`,
      } as any));

      dynamic.coreConclusion = {
        ...dynamic.coreConclusion,
        problemSummary: `${prefix} ${issue.failurePhenomenon || issue.engineeringConcern || '当前工程问题待确认'}`,
        recommendedMeasure: `${prefix} ${best.name}：${best.expectedBenefit}`,
        reasonSummary: `${prefix} ${cfg.root}`,
      };

      const timelineBase = cfg.verify.length ? cfg.verify : ['补齐当前工况关键实测证据','做最小区分试验','回填结果并重算','执行门禁复核'];
      dynamic.next24HourPlan = {
        timeline: timelineBase.slice(0,4).map((task, i) => ({
          timeWindow: ['0~2h','2~6h','6~12h','12~24h'][i],
          phase: 'Current Scenario Closed Loop',
          task: `${task}${bestIndex >= 0 ? `；配套方案：${dynamic.candidateActions[(bestIndex+i)%dynamic.candidateActions.length].name}` : ''}`,
          owner: '硬件负责人 / 验证测试工程师',
          deliverable: 'MEASURED / CALCULATED 证据 + Go/No-Go结论',
        })),
        passFailCriteria: buildScenarioPassFailCriteria(issue, context),
      };

      dynamic.engineeringDocs = {
        ...dynamic.engineeringDocs,
        pmDecisionEmail: {
          ...dynamic.engineeringDocs?.pmDecisionEmail,
          subject: `【${scenarioDomainKey}】${context.projectName}｜${best.name}`,
          technicalFact: `${issue.actualMeasurement || '暂无实测'}｜${issue.requirement || '暂无规格'}｜测试条件：${issue.testCondition || '待补充'}`,
          currentSituation: `${issue.failurePhenomenon || issue.engineeringConcern || '当前工况问题'}｜${context.nextMilestone}｜剩余${context.daysRemaining}天`,
          recommendedOption: best.name,
          options: ranked.map((a: any) => a.name).join(' / '),
          costImpact: context.costConstraint || '待评估',
          scheduleImpact: '剩余 ' + context.daysRemaining + ' 天',
        },
        meetingMinutes: {
          ...dynamic.engineeringDocs?.meetingMinutes,
          title: `【${scenarioDomainKey}】${context.projectName}｜闭环评审`,
          discussionSummary: `${cfg.root}；下一步：${timelineBase.slice(0,3).join('；')}。首选方案：${best.name}。`,
        },
        deviationPermit: {
          title: '【' + scenarioDomainKey + '】工程临时让步与偏差许可申请单',
          requirement: issue.requirement || '客户与行业设计基准规范',
          actualResult: issue.actualMeasurement || '当前实测数据与规格存在偏差',
          deviationDetail: '允许在 ' + context.projectPhase + ' 阶段样件在受控条件下存在临时性偏差，受控进入下一门禁复检。',
          technicalCause: cfg.root.slice(0, 100),
          riskAnalysis: '短期风险受控于应急措施；量产前必须完成永久纠正与全温/全寿命验证。',
          affectedScope: '仅限当前 ' + context.projectPhase + ' 阶段 ' + context.nextMilestone + ' 临时样件验证，严禁带入正式量产。',
          containment: best.verificationMethod || '执行台架连续复测与关键指标逐项闭环。',
          temporaryValidity: '仅限当前 ' + context.projectPhase + ' 阶段 ' + context.nextMilestone + ' 临时样件验证，严禁带入正式量产。',
          approvalRoles: '硬件负责人 / 质量经理 / 系统架构师',
          correctiveAction: '量产前完成永久纠正与全温/全寿命验证，并走 VDA ECR 流程。',
          verificationPlan: best.verificationMethod || '执行台架连续复测与关键指标逐项闭环。',
          closureCriteria: '正式器件/正式外壳装配后实测裕量达标即闭环归档。',
        },
      } as any;

      dynamic.dfmeaView = {
        failureMode: `${scenarioDomainKey} 异常：${(issue.failurePhenomenon || '指标超差').slice(0, 50)}`,
        failureCause: cfg.root.slice(0, 100),
        localEffect: `受测接口或单元性能未达到 [${(issue.requirement || '设计指标').slice(0, 40)}] 要求`,
        systemEffect: `ECU 控制系统存在潜在功能降级或异常报警`,
        vehicleEffect: `整车/系统集成测试出现质量门禁阻断风险`,
        severity: nativeRiskScore >= 80 ? 8 : nativeRiskScore >= 65 ? 6 : 4,
        occurrence: nativeRiskScore >= 75 ? 6 : 4,
        detection: 4,
        safetyImpact: context.asilLevel !== 'QM',
        regulatoryImpact: domain.startsWith('EMC'),
        massProductionImpact: true,
      };

      // EDR 记录也改为依据当前工况动态生成，避免 decisionPillars 里的历史示例数字(如 150MHz)泄漏进结果。
      dynamic.edrRecord = {
        edrId: 'EDR-' + scenarioDomainKey + '-' + Date.now().toString(36).toUpperCase(),
        projectCode: context.projectName,
        decisionDate: new Date().toISOString().slice(0, 10),
        decisionMaker: 'HW Lead / 决策评审会',
        coreProblem: scenarioDomainKey + '：' + (issue.failurePhenomenon || issue.engineeringConcern || '当前工程问题'),
        measuredSnapshot: issue.actualMeasurement || '暂无实测回填',
        specThreshold: issue.requirement || '规格/客户门限待输入',
        engineeringAssumptions: [
          '未测量的字段保持 UNKNOWN，不自动生成人为实测值',
          '当前风险评分 ' + nativeRiskScore + '/100（由当前工况输入推导）',
        ],
        chosenOptionId: best.id,
        chosenOptionTitle: best.name,
        rejectedOptionsSummary: ranked.filter((a) => a.id !== best.id).map((a) => a.name + '：残余风险 ' + a.residualRisk).join('；'),
        defenseBasis: '基于当前 ' + scenarioDomainKey + ' 工况输入与确定性规则排序，首选方案总分 ' + best.scores.total,
        signOffSignatures: [
          { role: '硬件负责人', name: 'HW Lead', status: 'Pending', signDate: '' },
          { role: '质量经理', name: 'QA Manager', status: 'Pending', signDate: '' },
        ],
        localHashDigest: 'PENDING',
        decisionStatus: 'CONDITIONALLY_APPROVED',
        createdAt: new Date().toISOString(),
      };
      if (dynamic.engineeringDocs) {
        dynamic.engineeringDocs.edrRecord = dynamic.edrRecord;
      }
    }
  }
  const measuredInputs = Object.entries(issue.measuredValues || {}).filter(([,v]) => v !== '' && v !== null && v !== undefined).map(([k,v]) => `${k}=${v}`);
  const priorAnalysisBasis = dynamic.analysisBasis;
  dynamic.analysisBasis = {
    ruleInputs: [
      ...(priorAnalysisBasis?.ruleInputs || []),
      `场景规则：${domain}`,
      `项目阶段：${context.projectPhase}`,
      `ASIL：${context.asilLevel}`,
    ],
    measuredInputs: priorAnalysisBasis?.measuredInputs?.length
      ? priorAnalysisBasis.measuredInputs
      : measuredInputs.map(x => `${issue.measuredValueSource || 'USER_MEASURED'} · ${x}`),
    calculatedOutputs: Array.from(new Set([
      ...(priorAnalysisBasis?.calculatedOutputs || []),
      `风险评分：${dynamic.riskRatings.overallRiskScore}/100`,
      `物理机理：${dynamic.physicalMechanism.rootCauseAnalysis.slice(0,120)}`,
      `候选方案：${dynamic.candidateActions?.length || 0} 个`,
    ])),
    assumptions: Array.from(new Set([...(priorAnalysisBasis?.assumptions || []), ...(dynamic.assumptions || [])])),
    fixedTemplateFields: Array.from(new Set([
      ...(priorAnalysisBasis?.fixedTemplateFields || []),
      '专家规则/公式骨架',
      '模块布局与字段结构',
      '部分标准条款库；具体适用性仍需工程师确认',
      issue.measuredValueSource === 'BENCHMARK' ? '当前存在系统基准样例值：仅用于演示，不能作为项目实测证据' : '无系统基准样例值',
    ])),
    calculatedOutputEvidence: priorAnalysisBasis?.calculatedOutputEvidence || [],
  };
  return dynamic;
}

export function asRenderableString(value: unknown, fallback = ''): string {
  if (value == null) return fallback;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(v => asRenderableString(v)).filter(Boolean).join('；');
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>;
    if (typeof o.standard === 'string' || typeof o.clause === 'string') return [o.standard, o.clause].filter(Boolean).join(' ');
    if (typeof o.relevance === 'string') return o.relevance;
    return JSON.stringify(value);
  }
  return fallback;
}
