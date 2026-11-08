/** Operator-only REAL inference diagnosis. No operational writes, tokens/body/evidence logging, or acceptance claims.
 * Run: node --conditions=react-server --import tsx tests/ai-simulation/diagnose-live.mjs
 * Operator injects protected env; never put secret literals in command/source.
 */
const required = name => { const value = process.env[name]; if (!value) throw new Error('DEPENDENCY_UNAVAILABLE'); return value; };
const allowedTools = new Set(['get_incident_context','search_evidence','get_asset_graph','correlate_indicators','calculate_impact','simulate_response','get_action_status']);
const allowedStages = new Set(['PROVIDER','TOOLS','FINAL_JSON','FINDINGS','PLANNING','PROPOSAL','PERSISTENCE','BUDGET']);
const allowedReasons = new Set(['PROVIDER_TRUNCATED','PROVIDER_JSON_INVALID','PROVIDER_SCHEMA_INVALID','PROVIDER_TOO_LARGE','PROVIDER_FINAL_TOOL_CALLS','FINAL_JSON_INVALID','FINAL_ROOT_INVALID','FINAL_SCHEMA_INVALID','FINDINGS_SHAPE_INVALID','FINDING_FIELDS_INVALID','CITATION_NOT_RETRIEVED','NEXT_QUERIES_INVALID','NEXT_QUERIES_MISSING','NO_FINDINGS','PLAN_FIELDS_INVALID','PLAN_ALTERNATIVE_INVALID','PLAN_REQUIRED','PLAN_DISTINCT_ALTERNATIVE_REQUIRED','VALIDATION_REJECTED']);
let conn, proposalBoundary = false, diagnostic;
const started = new Set(), completed = new Set();
let findingsValidated = 0, correctionCount = 0;
const lifecycle = new AbortController();
let authorizedIncidentId;
try {
  const loadTs = async path => { const imported = await import(path); return imported.default ?? imported; };
  const { actionStatusFromSnapshot } = await loadTs('../../src/lib/backend/action-status.ts');
  const { investigate } = await loadTs('../../src/lib/ai/investigation.ts');
  const { sanitizeEvidence } = await loadTs('../../src/lib/ai/evidence.ts');
  const { connectBackend, snapshotFromConnection } = await loadTs('../../src/lib/backend/client.ts');
  if (![actionStatusFromSnapshot, investigate, sanitizeEvidence, connectBackend, snapshotFromConnection].every(value=>typeof value==='function')) throw new Error('DEPENDENCY_UNAVAILABLE');
  const incidentId = required('BREACHBAY_DIAGNOSTIC_INCIDENT_ID');
  authorizedIncidentId = incidentId;
  conn = await connectBackend({ endpoint: required('BREACHBAY_DIAGNOSTIC_SPACETIME_ENDPOINT'), database: required('BREACHBAY_DIAGNOSTIC_DATABASE'), token: required('BREACHBAY_DIAGNOSTIC_SERVICE_TOKEN'), onDisconnect:()=>lifecycle.abort(), onChange:()=>{ if(conn && authorizedIncidentId){const current=snapshotFromConnection(conn,authorizedIncidentId);const actor=[...conn.db.myProfile.iter()][0];if(!current?.memberships.some(m=>m.active&&m.role==='AI_SERVICE'&&m.userId===actor?.id))lifecycle.abort();} } });
  const snapshot = snapshotFromConnection(conn, incidentId);
  const profile = [...conn.db.myProfile.iter()][0];
  if (!snapshot || snapshot.incident.classification !== 'SYNTHETIC' || !snapshot.memberships.some(m => m.userId === profile?.id && m.active && m.role === 'AI_SERVICE')) throw new Error('FORBIDDEN');
  const scenario = [...conn.db.scopedScenarios.iter()].find(s => s.incidentId === incidentId)?.state;
  if (!scenario) throw new Error('FORBIDDEN');
  const evidence = snapshot.evidence.filter(e => e.modelApproved && e.classification === 'SYNTHETIC').map(e => {
    let fields;
    try { const parsed = JSON.parse(e.redactedContent); fields = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : { description: e.redactedContent }; }
    catch { fields = { description: e.redactedContent }; }
    return sanitizeEvidence({ id:e.id,incidentId,version:e.version,source:e.source,capturedAt:e.capturedAt,synthetic:true,fields });
  });
  const summary = sanitizeEvidence({ id:incidentId,incidentId,version:snapshot.incident.version,source:'Synthetic summary',capturedAt:snapshot.incident.createdAt,synthetic:true,fields:{description:`${snapshot.incident.title}: ${snapshot.incident.description}`} }).excerpt;
  const ports = {
    async loadContext(id) { if(id!==incidentId)throw new Error('FORBIDDEN');return {incidentId,summary,scenario,evidence}; },
    async persistEvent(event) {
      // Capture only fixed diagnostic metadata; never save or log event payload/result/finding/text.
      const tool = event.data.tool;
      if (allowedTools.has(tool) && event.type==='tool_started') started.add(tool);
      if (allowedTools.has(tool) && event.type==='tool_completed') completed.add(tool);
      if (event.type==='finding') findingsValidated++;
      if (Array.isArray(event.data.validationCorrections)) correctionCount=Math.min(2,event.data.validationCorrections.filter(c=>['CITATION_NOT_RETRIEVED','FINAL_JSON_INVALID','PLAN_FIELDS_INVALID','PLAN_REQUIRED','PLAN_DISTINCT_ALTERNATIVE_REQUIRED'].includes(c?.reason)).length);
      if (event.type==='run_failed') diagnostic = { stage:allowedStages.has(event.data.failureStage)?event.data.failureStage:'UNKNOWN',reason:allowedReasons.has(event.data.failureReason)?event.data.failureReason:'UNCLASSIFIED' };
    },
    async getActionStatus(id,actionId) {
      if(id!==incidentId || lifecycle.signal.aborted)throw new Error('FORBIDDEN');
      const current=snapshotFromConnection(conn,incidentId);
      if(!current || !current.memberships.some(m=>m.active&&m.role==='AI_SERVICE'&&m.userId===profile.id))throw new Error('FORBIDDEN');
      return actionStatusFromSnapshot(current,incidentId,actionId);
    },
    async submitProposal() {
      proposalBoundary=true;
      throw new Error('DIAGNOSTIC_ONLY_NO_WRITE'); // never generate a fake persisted proposal ID
    },
  };
  const objective = process.env.BREACHBAY_DIAGNOSTIC_OBJECTIVE ?? 'Evaluate app-host isolation in this synthetic credential compromise. Retrieve approved evidence, inspect graph and impact, explain customer portal disruption and residual jump-host path, cite only retrieved evidence, recommend next queries, and propose a current-version response with a distinct alternative.';
  await investigate(incidentId, objective, ports, undefined, AbortSignal.any([lifecycle.signal,AbortSignal.timeout(90000)]), lifecycle.signal);
  console.log(JSON.stringify({diagnosticOnly:true,outcome:'NO_WRITE_FINAL_RETURN',startedTools:[...started],completedTools:[...completed],completedDistinctTools:completed.size,findingsValidated,correctionCount}));
} catch {
  console.log(JSON.stringify({diagnosticOnly:true,outcome:proposalBoundary?'FINAL_VALIDATED_WRITE_BOUNDARY_BLOCKED':'STOPPED',stage:proposalBoundary?'PERSISTENCE':diagnostic?.stage??'SETUP',reason:proposalBoundary?'NO_OPERATIONAL_WRITES':diagnostic?.reason??'DEPENDENCY_OR_AUTH_FAILURE',startedTools:[...started],completedTools:[...completed],completedDistinctTools:completed.size,findingsValidated,correctionCount}));
  process.exitCode = proposalBoundary ? 0 : 1;
} finally { conn?.disconnect(); }
