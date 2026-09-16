const fs = require('fs');
const content = fs.readFileSync('src/types/v4Models.ts', 'utf-8');

const zodImportsAndDefinitions = `
import { z } from 'zod';

// ==========================================
// 1. Zod Branded Types & ParamOrigin (Stage 1 Refactoring)
// ==========================================

export const MilliOhmSchema = z.number().brand<'MilliOhm'>();
export type MilliOhm = z.infer<typeof MilliOhmSchema>;

export const MicrofaradSchema = z.number().brand<'Microfarad'>();
export type Microfarad = z.infer<typeof MicrofaradSchema>;

export const PicofaradSchema = z.number().brand<'Picofarad'>();
export type Picofarad = z.infer<typeof PicofaradSchema>;

export const OhmSchema = z.number().brand<'Ohm'>();
export type Ohm = z.infer<typeof OhmSchema>;

export const NanoHenrySchema = z.number().brand<'NanoHenry'>();
export type NanoHenry = z.infer<typeof NanoHenrySchema>;

export const KelvinPerWattSchema = z.number().brand<'KelvinPerWatt'>();
export type KelvinPerWatt = z.infer<typeof KelvinPerWattSchema>;

export type OriginTier = 'MEASURED' | 'DATASHEET' | 'DEFAULT';

export interface ParamOrigin<T> {
  value: T;
  origin: OriginTier;
  tolerance: number; // e.g., 0.1 for 10%
  source: string;
}

export const createParam = <T>(value: number, origin: OriginTier, source: string, tolerance = 0): ParamOrigin<T> => {
  return { value: value as unknown as T, origin, tolerance, source };
};
`;

let newContent = content.replace(
  "import { AsilLevel, ProjectPhase, RiskLevel } from '../types';", 
  "import { AsilLevel, ProjectPhase, RiskLevel } from '../types';\n" + zodImportsAndDefinitions
);

newContent = newContent.replace(
  /export interface PowerStageModel \{([\s\S]*?)\}/,
  (match, p1) => {
    let replaced = p1
      .replace(/rdsOnMilliOhm: number;/g, 'rdsOnMilliOhm: ParamOrigin<MilliOhm>;')
      .replace(/cgdPf\?: number;/g, 'cgdPf?: ParamOrigin<Picofarad>;')
      .replace(/rgOnOhm: number;/g, 'rgOnOhm: ParamOrigin<Ohm>;')
      .replace(/rgOffOhm: number;/g, 'rgOffOhm: ParamOrigin<Ohm>;')
      .replace(/cbusUf: number;/g, 'cbusUf: ParamOrigin<Microfarad>;');
    
    // Add Ciss, Ls, Rth_jc if not exist
    if (!replaced.includes('cissPf?:')) {
      replaced = replaced.replace(/cgdPf\?: ParamOrigin<Picofarad>;/, 'cissPf?: ParamOrigin<Picofarad>;\n  cgdPf?: ParamOrigin<Picofarad>;');
    }
    if (!replaced.includes('lsNh?:')) {
      replaced = replaced.replace(/cbusUf: ParamOrigin<Microfarad>;/, 'lsNh?: ParamOrigin<NanoHenry>;\n  cbusUf: ParamOrigin<Microfarad>;');
    }
    if (!replaced.includes('rthJc?:')) {
      replaced = replaced.replace(/mosfetPartNumber: string;/, 'mosfetPartNumber: string;\n  rthJc?: ParamOrigin<KelvinPerWatt>;');
    }
    
    return `export interface PowerStageModel {${replaced}}`;
  }
);

fs.writeFileSync('src/types/v4Models.ts', newContent);
