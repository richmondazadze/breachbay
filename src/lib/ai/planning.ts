import { OutputValidationError } from './diagnostics';
import { simulateResponse } from '../simulation/engine';
import type { Scenario, SimAction, Impact } from '../simulation/types';
import { sanitizeFreeText } from './evidence';
export interface ResponsePlan { assumptions: string[]; uncertainty: string[]; alternatives: { action: SimAction; rationale: string; tradeoffs: string[]; expectedImpact?: Impact }[] }
const strings = (value: unknown): string[] => {
  if (!Array.isArray(value) || value.length > 8 || value.some(s => typeof s !== 'string' || !s.trim() || s.length > 500)) throw new OutputValidationError({ stage: 'PLANNING', reason: 'PLAN_FIELDS_INVALID' });
  return value.map(s => sanitizeFreeText(s));
};
export function validatePlanning(value: unknown, scenario: Scenario): ResponsePlan {
  if (!value || typeof value !== 'object') throw new OutputValidationError({ stage: 'PLANNING', reason: 'PLAN_FIELDS_INVALID' });
  const v = value as ResponsePlan;
  const assumptions = strings(v.assumptions), uncertainty = strings(v.uncertainty);
  if (!Array.isArray(v.alternatives) || v.alternatives.length > 3) throw new OutputValidationError({ stage: 'PLANNING', reason: 'PLAN_FIELDS_INVALID' });
  const alternatives = v.alternatives.map(a => {
    if (!a || typeof a.rationale !== 'string' || !a.rationale.trim() || a.rationale.length > 1000) throw new OutputValidationError({ stage: 'PLANNING', reason: 'PLAN_FIELDS_INVALID' });
    let preview;
    try { preview = simulateResponse(scenario, a.action, scenario.version); } catch { throw new OutputValidationError({ stage: 'PLANNING', reason: 'PLAN_ALTERNATIVE_INVALID' }); }
    return { action: { type: a.action.type, targetIds: [...a.action.targetIds] }, rationale: sanitizeFreeText(a.rationale), tradeoffs: strings(a.tradeoffs), expectedImpact: preview.after };
  });
  return { assumptions, uncertainty, alternatives };
}
