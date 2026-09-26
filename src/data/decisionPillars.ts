// LEGACY COMPATIBILITY SHIM — runtime analysis must NOT import this module.
// Historical pillar templates live under ./legacy and are retained only for backwards compatibility/docs.
export type { ScenarioPillars } from '../types';
export {
  getBldcPillars,
  getEmcPillars,
  getThermalPillars,
} from './legacy/decisionPillars';
