import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import type { IncidentSnapshot } from '../../../src/lib/contracts';
export interface DurableEvent {
  runId: string; incidentId: string; type: string; time?: string; provider?: string; model?: string; tool?: string;
  /** Required durable sanitized payload; backend trace contract must expose this. */
  dataJson?: string;
}
interface Citation { evidenceId: string; version: number; sha256: string }
export function verifyRealRun(snapshot: IncidentSnapshot, events: DurableEvent[], runId: string, expectedModel: string, requiredEvidenceId?: string) {
  const run = snapshot.investigations.find(r => r.id === runId);
  assert(run && run.status === 'COMPLETED', 'Canonical persisted investigation is not completed');
  assert.equal(run.provider, 'NVIDIA', 'Run has wrong provider');
  assert.equal(run.model, expectedModel, 'Run has wrong model');
  const trace = events.filter(e => e.runId === runId && e.incidentId === snapshot.incident.id);
  assert(trace.some(e => e.type === 'run_started'), 'Missing durable run start');
  assert(trace.some(e => e.type === 'run_completed'), 'Missing durable run completion');
  assert(!trace.some(e => e.type === 'run_failed'), 'Completed run includes terminal failure');
  assert(trace.every(e => e.provider === 'NVIDIA' && e.model === expectedModel), 'Trace attribution is incomplete');
  const completed = snapshot.toolRuns.filter(t => t.investigationId === runId && t.status === 'COMPLETED');
  const tools = new Set(completed.map(t => t.tool));
  assert(tools.size >= 3, 'Fewer than three distinct persisted completed tools');
  assert(tools.has('search_evidence'), 'No evidence retrieval tool completed');
  assert(completed.every(t => /^[a-f0-9]{64}$/.test(t.argumentsDigest)), 'Invalid persisted argument digest');
  const completedTrace = trace.filter(e => e.type === 'tool_completed');
  assert(new Set(completedTrace.map(e => e.tool)).size >= 3, 'Missing three distinct durable completed tool events');
  const callIds = new Set<string>();
  for (const event of completedTrace) {
    assert(event.dataJson, 'TRACE_CONTRACT_INCOMPLETE: tool completion lacks safe durable payload');
    const data = JSON.parse(event.dataJson) as { toolCallId: string; argumentsDigest: string; step: number };
    assert(typeof data.toolCallId === 'string' && !callIds.has(data.toolCallId), 'Tool call identity missing or duplicated');
    callIds.add(data.toolCallId);
    assert(Number.isInteger(data.step) && data.step >= 0 && data.step < 8, 'Tool step is outside bounded investigation');
    const started = trace.find(e => e.type === 'tool_started' && e.tool === event.tool && e.dataJson && JSON.parse(e.dataJson).toolCallId === data.toolCallId);
    assert(started && started.dataJson, 'Tool completed without matching durable start');
    assert.equal(JSON.parse(started.dataJson).argumentsDigest, data.argumentsDigest, 'Tool argument digest changed between start and completion');
    assert(completed.some(t => t.tool === event.tool && t.toolCallId === data.toolCallId && t.argumentsDigest === data.argumentsDigest), 'Durable event does not match persisted tool record');
  }

  const retrievedIds = new Set(completed.filter(t => t.tool === 'search_evidence').flatMap(t => t.evidenceIds));
  const findings = snapshot.findings.filter(f => f.investigationId === runId);
  assert(findings.length > 0, 'No persisted findings');
  const durableCitations = trace.filter(e => e.type === 'finding').flatMap(e => {
    assert(e.dataJson, 'TRACE_CONTRACT_INCOMPLETE: finding lacks durable version/hash citation payload');
    const data = JSON.parse(e.dataJson) as { findingId?: string; citations?: Citation[] };
    assert(data.findingId && findings.some(f => f.id === data.findingId), 'Citation trace does not reference canonical persisted finding');
    assert(Array.isArray(data.citations), 'TRACE_CONTRACT_INCOMPLETE: missing citation snapshots');
    return data.citations.map(c => ({ ...c, findingId: data.findingId }));
  });
  for (const finding of findings) {
    assert(finding.evidenceIds.length > 0, 'Uncited persisted finding');
    for (const id of finding.evidenceIds) {
      assert(retrievedIds.has(id), 'Finding cites evidence not retrieved by tools');
      const current = snapshot.evidence.find(e => e.id === id && e.incidentId === snapshot.incident.id);
      assert(current?.modelApproved && current.classification === 'SYNTHETIC', 'Finding cites unauthorized evidence');
      const citation = durableCitations.find(c => c.findingId === finding.id && c.evidenceId === id && c.version === current.version);
      assert(citation && /^[a-f0-9]{64}$/.test(citation.sha256), 'Citation is not tied to evidence version and derivative hash');
      const packets = completed.filter(t => t.tool === 'search_evidence' && t.evidenceIds.includes(id)).flatMap(t => {
        assert(t.citationsJson, 'Persisted search tool lacks citation packet');
        const packet = JSON.parse(t.citationsJson) as Citation[];
        assert(Array.isArray(packet), 'Invalid persisted tool citation packet');
        return packet;
      });
      assert(packets.some(c => c.evidenceId === id && c.version === citation.version && c.sha256 === citation.sha256), 'Finding citation differs from canonical tool citation packet');
      // AI derivative is a stricter allowlist than upload redaction. Verify against durable tool excerpt.
      const retrieved = trace.filter(e => e.type === 'tool_completed' && e.tool === 'search_evidence').flatMap(e => {
        assert(e.dataJson, 'TRACE_CONTRACT_INCOMPLETE: evidence search lacks durable safe results');
        const data = JSON.parse(e.dataJson) as { result?: { id: string; version: number; sha256: string; excerpt: string }[] };
        assert(Array.isArray(data.result), 'TRACE_CONTRACT_INCOMPLETE: missing evidence tool result');
        return data.result;
      });
      assert(retrieved.some(e => e.id === id && e.version === citation.version && e.sha256 === citation.sha256 && typeof e.excerpt === 'string' && createHash('sha256').update(e.excerpt).digest('hex') === e.sha256), 'Citation hash/version differs from retrieved derivative');
    }
  }
  if (requiredEvidenceId) assert(findings.some(f => f.evidenceIds.includes(requiredEvidenceId)), 'Reassessment did not cite newly injected evidence');
  const proposal = snapshot.proposals.find(p => p.investigationId === runId);
  assert(proposal && proposal.incidentId === snapshot.incident.id, 'No canonical persisted proposal');
  assert(proposal.evidenceIds.length > 0 && proposal.evidenceIds.every(id => retrievedIds.has(id)), 'Proposal has unsupported citations');
  assert.equal(proposal.expectedVersion, snapshot.incident.scenarioVersion, 'Proposal binds stale scenario version');
  assert(['DRAFT','VALIDATED','SIMULATED','PENDING_APPROVAL'].includes(proposal.status), 'AI run bypassed human approval');
  assert(snapshot.auditEvents.some(e => e.objectId === proposal.id), 'Proposal lacks persisted audit event');
  return { runId, proposalId: proposal.id, completedDistinctTools: tools.size, findingsCount: findings.length };
}
export function verifyOutage(snapshot: IncidentSnapshot, previousRunIds: Set<string>) {
  const newRuns = snapshot.investigations.filter(r => !previousRunIds.has(r.id));
  assert(newRuns.every(r => !['COMPLETED'].includes(r.status)), 'Provider outage produced completed investigation');
  const newIds = new Set(newRuns.map(r => r.id));
  assert(!snapshot.proposals.some(p => p.investigationId && newIds.has(p.investigationId)), 'Provider outage produced proposal');
  assert(!snapshot.findings.some(f => newIds.has(f.investigationId)), 'Provider outage produced findings');
  assert(newRuns.every(r => ['FAILED','CANCELLED'].includes(r.status)), 'Provider outage left abandoned run without terminal state');
}
