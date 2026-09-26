/**
 * Compatibility facade for the BLDC pattern engine.
 *
 * The implementation now lives under src/domains/bldc. Existing imports remain valid
 * while the domain becomes independently maintainable.
 */
export { evaluateAllBldcPatterns, BLDC_PATTERN_EVALUATORS } from '../domains/bldc/bldcEngine';
export type { BldcEvaluationInput } from '../domains/bldc/types';
