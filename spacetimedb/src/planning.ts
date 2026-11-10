import { simulateResponse } from '../../src/lib/simulation/engine';
import type { Scenario, SimAction } from '../../src/lib/simulation/types';
import type { ResponsePlan } from '../../src/lib/contracts';
const strings=(value:unknown)=>{
 if(!Array.isArray(value)||value.length>8||value.some(s=>typeof s!=='string'||!s.trim()||s.length>500))throw new Error('INVALID_MODEL_OUTPUT');
 return value as string[];
};
export function canonicalObservationPlanning(value: unknown): ResponsePlan {
 if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_MODEL_OUTPUT');
 const plan = value as ResponsePlan;
 if (!Array.isArray(plan.alternatives) || plan.alternatives.length) throw new Error('INVALID_MODEL_OUTPUT');
 return { assumptions: strings(plan.assumptions), uncertainty: strings(plan.uncertainty), alternatives: [] };
}
/** Validate persistence shape and recompute impact with the authoritative forward engine. */
export function canonicalPlanning(value:unknown,scenario:Scenario,proposed?:SimAction):ResponsePlan{
 if(!value || typeof value!=='object')throw new Error('INVALID_MODEL_OUTPUT');
 const plan=value as ResponsePlan;
 const assumptions=strings(plan.assumptions),uncertainty=strings(plan.uncertainty);
 if(!Array.isArray(plan.alternatives)||(proposed!==undefined&&!plan.alternatives.length)||plan.alternatives.length>3)throw new Error('INVALID_MODEL_OUTPUT');
 const alternatives=plan.alternatives.map(a=>{
  if(!a || typeof a.rationale!=='string'||!a.rationale.trim()||a.rationale.length>1000)throw new Error('INVALID_MODEL_OUTPUT');
  const preview=simulateResponse(scenario,a.action,scenario.version);
  return {action:{type:a.action.type,targetIds:[...a.action.targetIds].sort()},rationale:a.rationale,tradeoffs:strings(a.tradeoffs),expectedImpact:preview.after};
 });
 const same=(a:SimAction)=>a.type===proposed?.type && JSON.stringify([...a.targetIds].sort())===JSON.stringify([...(proposed?.targetIds??[])].sort());
 if(proposed && !alternatives.some(a=>!same(a.action)))throw new Error('INVALID_MODEL_OUTPUT');
 return {assumptions,uncertainty,alternatives};
}
export function boundedNextQueries(value:unknown):string[]|undefined{
 if(value===undefined)return undefined;
 if(!Array.isArray(value)||value.length>5||value.some(s=>typeof s!=='string'||!s.trim()||s.length>200))throw new Error('INVALID_MODEL_OUTPUT');
 return value as string[];
}
