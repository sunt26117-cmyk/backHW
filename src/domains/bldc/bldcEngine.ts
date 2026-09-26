import type { PatternOutputItem } from '../../types';
import { sanitizePatternOutput } from '../../utils/nanGuard';
import type { BldcEvaluationInput } from './types';
import { createBldcPatternContext } from './context';
import { finalizeBldcPatternResult } from './patternPolicy';
import { evaluateP001 } from './patterns/P001';
import { evaluateP002 } from './patterns/P002';
import { evaluateP003 } from './patterns/P003';
import { evaluateP004 } from './patterns/P004';
import { evaluateP005 } from './patterns/P005';
import { evaluateP006 } from './patterns/P006';
import { evaluateP007 } from './patterns/P007';
import { evaluateP008 } from './patterns/P008';
import { evaluateP009 } from './patterns/P009';
import { evaluateP010 } from './patterns/P010';
import { evaluateP011 } from './patterns/P011';
import { evaluateP012 } from './patterns/P012';
import { evaluateP013 } from './patterns/P013';
import { evaluateP014 } from './patterns/P014';
import { evaluateP015 } from './patterns/P015';
import { evaluateP016 } from './patterns/P016';
import { evaluateP017 } from './patterns/P017';
import { evaluateP018 } from './patterns/P018';

export type BldcPatternEvaluator = (
  input: BldcEvaluationInput,
  context: ReturnType<typeof createBldcPatternContext>,
) => PatternOutputItem;

/**
 * Stable BLDC orchestration boundary. Pattern implementations are independent of the UI, AI, and scenario layers.
 * Add/remove a pattern here without modifying the existing pattern implementations.
 */
export const BLDC_PATTERN_EVALUATORS = [
  evaluateP001,
  evaluateP002,
  evaluateP003,
  evaluateP004,
  evaluateP005,
  evaluateP006,
  evaluateP007,
  evaluateP008,
  evaluateP009,
  evaluateP010,
  evaluateP011,
  evaluateP012,
  evaluateP013,
  evaluateP014,
  evaluateP015,
  evaluateP016,
  evaluateP017,
  evaluateP018
] satisfies readonly BldcPatternEvaluator[];

export function evaluateAllBldcPatterns(input: BldcEvaluationInput): PatternOutputItem[] {
  const context = createBldcPatternContext(input);
  return BLDC_PATTERN_EVALUATORS
    .map((evaluate) => finalizeBldcPatternResult(evaluate(input, context)))
    .map(sanitizePatternOutput);
}

export type { BldcEvaluationInput } from './types';
