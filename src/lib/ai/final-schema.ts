import { citationManifest } from './citation-guidance';
import type { SanitizedEvidence } from './evidence';
import { OutputValidationError } from './diagnostics';
import { validateScenario } from '../simulation/engine';
import type { Scenario } from '../simulation/types';

/** Deliberately small JSON Schema subset, also checked locally without coercion. */
interface SchemaNode {
  type?: 'object' | 'array' | 'string' | 'null';
  properties?: Record<string, SchemaNode>;
  required?: string[];
  additionalProperties?: false;
  items?: SchemaNode;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: true;
  minLength?: number;
  maxLength?: number;
  enum?: string[];
  anyOf?: SchemaNode[];
}
export interface FinalJsonSchema { name: 'breachbay_final'; strict: true; schema: SchemaNode }
/** Provider grammar omits unsupported uniqueness and uses a conservative distinct-type subset. Local rules stay authoritative. */
export function providerTransportSchema(format: FinalJsonSchema): FinalJsonSchema {
  const transport = structuredClone(format);
  const omitUnsupportedKeyword = (node: SchemaNode) => {
    delete node.uniqueItems;
    for (const child of Object.values(node.properties ?? {})) omitUnsupportedKeyword(child);
    if (node.items) omitUnsupportedKeyword(node.items);
    for (const child of node.anyOf ?? []) omitUnsupportedKeyword(child);
  };
  omitUnsupportedKeyword(transport.schema);
  const properties = transport.schema.properties;
  const planning = properties?.planning.properties;
  const alternatives = planning?.alternatives;
  const alternative = alternatives?.items?.properties;
  const proposals = properties?.proposal.anyOf;
  const nullProposal = proposals?.find(node => node.type === 'null');
  // Observation reports have no executable actions and use a compact grammar.
  if (properties && planning && alternatives?.maxItems === 0 && proposals?.length === 1 && nullProposal) {
    properties.proposal = nullProposal;
    return transport;
  }
  if (!properties || !planning || !alternatives || !alternative || !proposals || !nullProposal) throw new OutputValidationError({ stage: 'FINAL_JSON', reason: 'FINAL_SCHEMA_INVALID' });
  const actions = proposals.filter(node => node.type === 'object');
  // Full object branches use only existing schema keywords; never enumerate target combinations.
  // Native generation is narrower than runtime distinctness, which also permits differing target sets.
  transport.schema.anyOf = [object({ ...properties, proposal: nullProposal }), ...actions.flatMap(proposal => {
    const differentTypes = actions.filter(action => action.properties?.type.enum?.[0] !== proposal.properties?.type.enum?.[0]);
    if (!differentTypes.length) return [];
    return [object({ ...properties, proposal, planning: object({ ...planning, alternatives: {
      ...alternatives, minItems: 1, items: object({ ...alternative, action: { anyOf: differentTypes } }),
    } }) })];
  })];
  if (JSON.stringify(transport).length > 50000) throw new OutputValidationError({ stage: 'FINAL_JSON', reason: 'FINAL_SCHEMA_INVALID' });
  return transport;
}
const object = (properties: Record<string, SchemaNode>): SchemaNode => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const text = (maxLength: number): SchemaNode => ({ type: 'string', minLength: 1, maxLength });
const strings = (maxItems: number, maxLength: number): SchemaNode => ({ type: 'array', items: text(maxLength), maxItems });

/** Observation-only investigations cannot manufacture a containment proposal or a simulated alternative. */
export function observationResponseSchema(evidence: SanitizedEvidence[], retrievedIds: Set<string>, incidentId: string): FinalJsonSchema {
  const ids = citationManifest(evidence, retrievedIds, incidentId).map(e => e.evidenceId);
  if (!ids.length) throw new OutputValidationError({ stage: 'FINDINGS', reason: 'NO_FINDINGS' });
  return { name: 'breachbay_final', strict: true, schema: object({
    findings: { type: 'array', minItems: 1, maxItems: 2, items: object({ summary: text(400), confidence: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'] }, evidenceIds: { type: 'array', minItems: 1, maxItems: ids.length, uniqueItems: true, items: { type: 'string', enum: ids } }, unknowns: strings(2, 1000), recommendedNextQueries: strings(2, 200) }) },
    planning: object({ assumptions: strings(2, 500), uncertainty: strings(2, 500), alternatives: { type: 'array', maxItems: 0, items: object({}) } }),
    proposal: { anyOf: [{ type: 'null' }] },
  }) };
}

/** Only scoped retrieved citations and synthetic assets/communication edges enter enums. */
export function finalResponseSchema(scenario: Scenario, evidence: SanitizedEvidence[], retrievedIds: Set<string>): FinalJsonSchema {
  validateScenario(scenario);
  const evidenceIds = citationManifest(evidence, retrievedIds, scenario.incidentId).map(e => e.evidenceId);
  if (!evidenceIds.length) throw new OutputValidationError({ stage: 'FINDINGS', reason: 'NO_FINDINGS' });
  const assetIds = scenario.assets.map(a => a.id).sort();
  const routeIds = scenario.edges.filter(e => e.type === 'COMMUNICATES_WITH').map(e => e.id).sort();
  const actions: SchemaNode[] = [];
  for (const [type, targetIds] of [
    ['ISOLATE_SIMULATED_HOST', assetIds],
    ['RESET_SIMULATED_CREDENTIAL', assetIds],
    ['BLOCK_SIMULATED_ROUTE', routeIds],
  ] as const) {
    if (targetIds.length) actions.push(object({ type: { type: 'string', enum: [type] }, targetIds: { type: 'array', minItems: 1, maxItems: Math.min(10, targetIds.length), uniqueItems: true, items: { type: 'string', enum: targetIds } } }));
  }
  const action: SchemaNode = { anyOf: actions };
  const alternatives: SchemaNode = actions.length ? { type: 'array', maxItems: 1, items: object({ action, rationale: text(240), tradeoffs: strings(2, 500) }) } : { type: 'array', maxItems: 0, items: object({}) };
  const schema = object({
    findings: { type: 'array', minItems: 1, maxItems: 2, items: object({ summary: text(400), confidence: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'] }, evidenceIds: { type: 'array', minItems: 1, maxItems: evidenceIds.length, uniqueItems: true, items: { type: 'string', enum: evidenceIds } }, unknowns: strings(2, 1000), recommendedNextQueries: strings(2, 200) }) },
    planning: object({ assumptions: strings(2, 500), uncertainty: strings(2, 500), alternatives }),
    proposal: { anyOf: [{ type: 'null' }, ...actions] },
  });
  const format: FinalJsonSchema = { name: 'breachbay_final', strict: true, schema };
  if (JSON.stringify(format).length > 50000) throw new OutputValidationError({ stage: 'FINAL_JSON', reason: 'FINAL_SCHEMA_INVALID' });
  return format;
}

function matches(value: unknown, schema: SchemaNode): boolean {
  if (schema.anyOf) return schema.anyOf.some(branch => matches(value, branch));
  if (schema.type === 'null') return value === null;
  if (schema.type === 'string') {
    if (typeof value !== 'string') return false;
    // JSON Schema string bounds count Unicode code points, rather than UTF-16 code units.
    const length = Array.from(value).length;
    return (schema.minLength === undefined || length >= schema.minLength) && (schema.maxLength === undefined || length <= schema.maxLength) && (!schema.enum || schema.enum.includes(value));
  }
  if (schema.type === 'array') return Array.isArray(value) && (schema.minItems === undefined || value.length >= schema.minItems) && (schema.maxItems === undefined || value.length <= schema.maxItems) && (!schema.uniqueItems || new Set(value).size === value.length) && value.every(item => !!schema.items && matches(item, schema.items));
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const record = value as Record<string, unknown>, properties = schema.properties ?? {};
    return (schema.required ?? []).every(key => Object.hasOwn(record, key)) && Object.keys(record).every(key => Object.hasOwn(properties, key) && matches(record[key], properties[key]));
  }
  return false;
}

/** Reject only: never defaults, alias mapping, field removal or output repair. */
export function validateFinalResponseSchema(value: unknown, format: FinalJsonSchema): void {
  if (!matches(value, format.schema)) throw new OutputValidationError({ stage: 'FINAL_JSON', reason: 'FINAL_SCHEMA_INVALID' });
}
