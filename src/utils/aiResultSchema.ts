import { z } from 'zod';

/**
 * AI 分析结果的运行时校验 Schema（宽松版）：
 * - 只校验顶层关键字段的存在性与类型，发现明显畸形立即报错。
 * - passthrough 允许 AI 输出额外字段，不因多字段而拒绝。
 * - 深层字段不逐一校验，交给 validateAndEnrichAiResult + auditAiResult 兜底。
 */
export const AI_RESULT_ZOD_SCHEMA = z.object({
  coreConclusion: z.object({}).passthrough().optional(),
  riskRatings: z.object({}).passthrough().optional(),
  candidateActions: z.array(z.any()).optional(),
  finalRecommendation: z.any().optional(),
  knownFacts: z.array(z.any()).optional(),
  assumptions: z.array(z.any()).optional(),
  unknowns: z.array(z.any()).optional(),
  physicalMechanism: z.any().optional(),
  dfmeaView: z.any().optional(),
  dualTimeline: z.any().optional(),
}).passthrough();

export interface AiResultSchemaIssue { path: string; message: string; }

/** 校验 AI 返回结构；valid=false 时返回具体问题路径与原因，供用户反馈给免费 AI 修正。 */
export function validateAiResultStructure(data: unknown): { valid: boolean; issues: AiResultSchemaIssue[] } {
  const result = AI_RESULT_ZOD_SCHEMA.safeParse(data);
  if (result.success) return { valid: true, issues: [] };
  const issues = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
  return { valid: false, issues };
}

