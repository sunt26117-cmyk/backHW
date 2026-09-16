export type ScoringProfile = 'DEFAULT' | 'SOP_CRITICAL' | 'ASIL_D_SAFETY';

export interface ScoringWeights {
  T: number;
  S: number;
  C: number;
  Q: number;
  L: number;
}

export const SCORING_PROFILES: Record<ScoringProfile, { weights: ScoringWeights; rationale: string; appliesTo: string }> = {
  DEFAULT: {
    weights: { T: 25, S: 25, C: 15, Q: 20, L: 15 },
    rationale: '平衡技术可行性与项目进度',
    appliesTo: '常规研发阶段',
  },
  SOP_CRITICAL: {
    weights: { T: 20, S: 40, C: 15, Q: 15, L: 10 },
    rationale: '临近SOP，进度(S)权重上调，优先保障量产节点',
    appliesTo: '距离SOP不足30天',
  },
  ASIL_D_SAFETY: {
    weights: { T: 30, S: 10, C: 10, Q: 40, L: 10 },
    rationale: '高安全等级项目，质量与合规(Q)及技术(T)权重上调',
    appliesTo: 'ASIL C/D 级项目',
  },
};

export function getActiveScoringProfile(daysRemaining?: number, asilLevel?: string): ScoringProfile {
  if (asilLevel === 'ASIL D' || asilLevel === 'ASIL C') {
    return 'ASIL_D_SAFETY';
  }
  if (daysRemaining !== undefined && daysRemaining < 30) {
    return 'SOP_CRITICAL';
  }
  return 'DEFAULT';
}

export function calculateWeightedScore(scores: Partial<ScoringWeights>, weights: ScoringWeights): number {
  const t = Math.max(0, Math.min(100, Number(scores.T) || 0));
  const s = Math.max(0, Math.min(100, Number(scores.S) || 0));
  const c = Math.max(0, Math.min(100, Number(scores.C) || 0));
  const q = Math.max(0, Math.min(100, Number(scores.Q) || 0));
  const l = Math.max(0, Math.min(100, Number(scores.L) || 0));
  
  const total = (t * weights.T + s * weights.S + c * weights.C + q * weights.Q + l * weights.L) / 100;
  return Math.round(total * 10) / 10;
}
