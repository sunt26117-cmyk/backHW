import { CandidateAction, HwLeadStyle, DriftEvaluationResult } from '../types';

export type { DriftEvaluationResult };

/**
 * P1-2: Q 维度动态化非线性惩罚函数
 * 物理与管理学原理：历史复发次数 >= 2 次后，8D 根本原因闭环难度激增，
 * 客户审核与管理层信任度呈加速衰减曲线，非简单的线性扣分。
 */
export function applyRecurrencePenaltyToQ(baseQ: number, recurrenceCount: number = 0): {
  effectiveQ: number;
  penalty: number;
  curveNote: string;
} {
  if (!recurrenceCount || recurrenceCount <= 0) {
    return {
      effectiveQ: baseQ,
      penalty: 0,
      curveNote: '首次发生，无历史复发惩罚。',
    };
  }

  if (recurrenceCount === 1) {
    const penalty = 7;
    return {
      effectiveQ: Math.max(15, baseQ - penalty),
      penalty,
      curveNote: '第 1 次相似复发：轻微惩罚 (-7分)，8D 需追加防呆验证。',
    };
  }

  // recurrenceCount >= 2: 非线性加速衰减 penalty = min(50, round(12 + recurrenceCount^1.8 * 4))
  const penalty = Math.min(55, Math.round(10 + Math.pow(recurrenceCount, 1.75) * 4.2));
  const effectiveQ = Math.max(10, baseQ - penalty);

  return {
    effectiveQ,
    penalty,
    curveNote: `历史复发已达 ${recurrenceCount} 次 (加速惩罚 -${penalty}分)：重复暴雷严重击穿质量信任，8D 必须提供高层特批与三级防错证据！`,
  };
}

/**
 * P0-2: 领导风格动态漂移核算引擎
 * 逻辑：基准风格 (Base Style) + 风险触发漂移规则 (Drift Rules)
 * 漂移是临时性的，仅对触发该规则的特定候选措施生效。
 */
export function evaluateLeadershipFit(
  strategy: CandidateAction,
  leaderStyle: HwLeadStyle = 'CONSERVATIVE',
  recurrenceCount: number = 0
): DriftEvaluationResult {
  const text = `${strategy.name} ${strategy.description} ${strategy.timeCost} ${strategy.sideEffects} ${strategy.expectedBenefit}`.toLowerCase();

  // 1. 判定漂移触发条件
  let effectiveStyle: HwLeadStyle = leaderStyle;
  let isDrifted = false;
  let driftPrompt: string | undefined;
  let driftTrigger: string | undefined;

  // 触发条件 1: 安全红线/一票否决/高残余风险 -> 漂移至 CONSERVATIVE
  const triggersSafetyVeto =
    strategy.veto.rejection_veto === true ||
    strategy.residualRisk === 'High' ||
    (strategy.scores && strategy.scores.T < 50) ||
    text.includes('击穿') ||
    text.includes('炸管') ||
    text.includes('超标');

  // 触发条件 2: 历史复发次数 >= 2 -> 漂移至 PROCESS_DEFENSIVE
  const triggersRecurrence = recurrenceCount >= 2;

  if (triggersSafetyVeto && leaderStyle !== 'CONSERVATIVE') {
    effectiveStyle = 'CONSERVATIVE';
    isDrifted = true;
    driftTrigger = 'safety_score < threshold OR rejection_veto == true';
    driftPrompt = '当前方案触发安全红线/一票否决，领导态度预计临时转向技术求稳 (CONSERVATIVE)';
  } else if (triggersRecurrence && leaderStyle !== 'PROCESS_DEFENSIVE') {
    effectiveStyle = 'PROCESS_DEFENSIVE';
    isDrifted = true;
    driftTrigger = `recurrence_count (${recurrenceCount}) >= 2`;
    driftPrompt = `该问题历史复发达 ${recurrenceCount} 次 (>=2)，审计问责风险激增，领导态度预计临时转向流程免责 (PROCESS_DEFENSIVE)`;
  }

  // 2. 方案特征判定
  const requiresPcbRespin =
    text.includes('改版') ||
    text.includes('打板') ||
    text.includes('respin') ||
    text.includes('re-spin') ||
    text.includes('重新投板') ||
    text.includes('重新布线') ||
    text.includes('更换封装');

  const isTier0or1 =
    strategy.category === 'balanced' ||
    text.includes('原位') ||
    text.includes('软件') ||
    text.includes('配置') ||
    text.includes('微调') ||
    text.includes('snubber') ||
    text.includes('阻容') ||
    text.includes('双轨') ||
    text.includes('磁珠') ||
    text.includes('有源米勒') ||
    text.includes('下桥制动');

  const hasResidualRiskOrDeratingShortage =
    strategy.residualRisk === 'High' ||
    strategy.residualRisk === 'Medium-High' ||
    text.includes('裕量不足') ||
    text.includes('特采') ||
    text.includes('让步') ||
    text.includes('降额不足') ||
    text.includes('极限') ||
    text.includes('侥幸');

  const isRootCauseFix =
    text.includes('根治') ||
    text.includes('机理彻底') ||
    text.includes('彻底解决') ||
    text.includes('物理根治') ||
    strategy.category === 'conservative' ||
    (strategy.scores && strategy.scores.T >= 90);

  const isUnilateralHwRisk =
    text.includes('盲目') ||
    text.includes('私下放行') ||
    text.includes('硬件单方') ||
    text.includes('赌') ||
    text.includes('放宽保护门限') ||
    (strategy.scores && strategy.scores.L < 50);

  const hasExternalSignoff =
    (strategy.scores && strategy.scores.L >= 85) ||
    text.includes('联合') ||
    text.includes('会签') ||
    text.includes('双轨') ||
    text.includes('外壳真实') ||
    text.includes('ecr') ||
    text.includes('签字');

  let multiplier = 1.0;
  let acceptanceRatePercent = 75;
  let warningTag: string | undefined;
  let positiveTag: string | undefined;
  let reason = '';

  // 3. 基于 effectiveStyle 评估加权倍数
  if (effectiveStyle === 'CONSERVATIVE') {
    if (hasResidualRiskOrDeratingShortage) {
      multiplier = 0.65;
      acceptanceRatePercent = 30;
      warningTag = '⚠️ 领导态度预警：技术求稳型风格极度排斥“带病特采/降额不足”，初审极大概率被卡死！';
      reason = '技术求稳型风格极在乎部门声誉与防爆雷，严禁低裕量带病流转。';
    } else if (isRootCauseFix) {
      multiplier = 1.18;
      acceptanceRatePercent = 95;
      positiveTag = '⭐ 领导首选：契合技术求稳风格，根治机理闭环，具备充足安全降额裕量。';
      reason = '方案从物理机理消除隐患，降额充分，领导签字放心。';
    } else {
      multiplier = 1.0;
      acceptanceRatePercent = 70;
      reason = '技术方案中规中矩，领导将重点核查实测自证硬核数据。';
    }
  } else if (effectiveStyle === 'AGILE_DELIVERY') {
    if (requiresPcbRespin) {
      multiplier = 0.65;
      acceptanceRatePercent = 25;
      warningTag = '⚠️ 领导态度预警：改版方案虽技术稳妥，但违背【敏捷保交付】宗旨，在内部极易被按住！';
      reason = '改版打板周期长且挤占救火精力，敏捷型风格抗拒此类方案。';
    } else if (isTier0or1) {
      multiplier = 1.2;
      acceptanceRatePercent = 96;
      positiveTag = '🚀 领导极力支持：零/低工期原位就地消化，不挤爆部门资源，力保交付节点！';
      reason = '原位贴片或寄存器微调，低调搞定，保住交付生命线。';
    } else {
      multiplier = 1.0;
      acceptanceRatePercent = 65;
      reason = '需提供给领导向 PM 交差的死保时间承诺。';
    }
  } else if (effectiveStyle === 'PROCESS_DEFENSIVE') {
    if (isUnilateralHwRisk) {
      multiplier = 0.45;
      acceptanceRatePercent = 15;
      warningTag = '⚠️ 领导态度绝杀：此方案将使硬件单方背负全部连带责任，流程免责型领导绝不可能签字！';
      reason = '缺乏外部依据，日后被审计或客户追责时硬件将成唯一责任人。';
    } else if (hasExternalSignoff) {
      multiplier = 1.25;
      acceptanceRatePercent = 94;
      positiveTag = '🛡️ 流程免责首选：权责边界清晰，有系统/车厂外部会签背书，硬件免责闭环。';
      reason = '方案有据可查，各方责任分界清晰，日后审计合规无忧。';
    } else {
      multiplier = 0.85;
      acceptanceRatePercent = 55;
      reason = '需要补充系统/车厂书面联签记录以满足免责门禁。';
    }
  }

  const scoreTotal = strategy.scores ? strategy.scores.total : 75;
  const clampedRate = Math.min(99, Math.max(15, Math.round(acceptanceRatePercent * (scoreTotal / 85))));

  return {
    baseStyle: leaderStyle,
    effectiveStyle,
    isDrifted,
    driftPrompt,
    driftTrigger,
    multiplier,
    acceptanceRatePercent: clampedRate,
    warningTag,
    positiveTag,
    reason,
  };
}

