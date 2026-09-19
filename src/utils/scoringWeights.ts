/**
 * T(Time)-S(Safety)-C(Cost)-Q(Quality)-L(Likelihood) 方案打分标准权重。
 *
 * 之前这一组数字在 aiResultAuditor.ts（用于核对AI给出的加权总分是否算对）和
 * DecisionCockpitView.tsx（用户可交互调整的权重滑块，默认值/重置值）里各写死了一份。
 * 两边数值目前碰巧一致（T25 S25 C15 Q20 L15），但没有共享引用关系——以后任何一边
 * 单独改动（比如把安全权重从25%上调到30%），另一边不会跟着变，又会变成"标准是什么"
 * 两个地方给出不同答案的问题。
 *
 * 注意：DecisionCockpitView.tsx 里的权重滑块允许工程师临时调整以做what-if探索，
 * 这个交互能力保留——只是它的"默认值/重置值"现在从这里取，而不是自己再写一份。
 */
export const STANDARD_TSCQL_WEIGHTS = {
  T: 25,
  S: 25,
  C: 15,
  Q: 20,
  L: 15,
} as const;

export type TscqlScores = { T: number; S: number; C: number; Q: number; L: number };

/**
 * 用标准权重重新计算加权总分（0-100，四舍五入到小数点后1位）。
 * 用于核对AI自己声称的 total 是否与标准公式算出来的一致。
 */
export function recalculateStandardWeightedScore(scores: TscqlScores): number {
  const clamp = (v: number) => Math.max(0, Math.min(100, Number(v) || 0));
  const t = clamp(scores.T);
  const s = clamp(scores.S);
  const c = clamp(scores.C);
  const q = clamp(scores.Q);
  const l = clamp(scores.L);
  const w = STANDARD_TSCQL_WEIGHTS;
  const total = (t * w.T + s * w.S + c * w.C + q * w.Q + l * w.L) / 100;
  return Math.round(total * 10) / 10;
}
