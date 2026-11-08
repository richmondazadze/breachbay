#!/usr/bin/env bash
set -euo pipefail
# Schema-only authorized baseline; no production configuration, operational rows, or credentials.
baseline_tables=${1:?Pass the authorized current production tables schema JSON}
baseline_types=${2:?Pass the authorized current production Typespace JSON}
test_dir=$(mktemp -d "${TMPDIR:-/tmp}/breachbay-retention-migration.XXXXXX")
test_pid=''
cleanup(){ if [[ -n "$test_pid" ]]; then kill "$test_pid" 2>/dev/null || true; fi; rm -rf "$test_dir"; }
trap cleanup EXIT
mkdir -p "$test_dir/module/src"
cp spacetimedb/package.json spacetimedb/tsconfig.json "$test_dir/module/"
ln -s "$(pwd)/spacetimedb/node_modules" "$test_dir/module/node_modules"
git show HEAD:spacetimedb/src/schema.ts > "$test_dir/module/src/schema.ts"
cat > "$test_dir/module/src/index.ts" <<'TS'
import db from './schema';
export default db;
export const init=db.init(ctx=>{
 const incidentId='synthetic-preservation-case',createdAt='2026-01-01T00:00:00Z';
 const state={incidentId,version:5,seed:'synthetic-seed',synthetic:true,assets:[{id:'synthetic-asset',name:'Synthetic host',criticality:'HIGH',state:'ISOLATED',credentialEnabled:true}],edges:[],compromisedAssetIds:['synthetic-asset'],protectedAssetIds:[]};
 ctx.db.incidents.insert({id:incidentId,incidentId,title:'Retained synthetic case',description:'Synthetic no-delete migration',severity:'HIGH',status:'CONTAINING',classification:'SYNTHETIC',scenarioId:'credential-compromise',scenarioVersion:5,version:7,ownerId:'synthetic-human',createdAt,updatedAt:createdAt});
 ctx.db.evidence.insert({id:'synthetic-evidence',incidentId,kind:'LOG',title:'Retained evidence',source:'Synthetic migration',capturedAt:createdAt,sha256:'c'.repeat(64),redactedSha256:'d'.repeat(64),classification:'SYNTHETIC',redactedContent:'Synthetic original derivative retained exactly',modelApproved:true,assetIds:['synthetic-asset'],createdAt,version:2});
 ctx.db.evidenceStorage.insert({id:'synthetic-evidence',incidentId,storageRef:'synthetic-private-reference'});
 ctx.db.assets.insert({id:'synthetic-asset',incidentId,name:'Synthetic host',type:'HOST',owner:'Synthetic owner',criticality:'HIGH',state:'ISOLATED',version:3,lastSeen:createdAt,riskLabels:['SYNTHETIC']});
 ctx.db.simScenarios.insert({id:incidentId,incidentId,state});
 ctx.db.scenarioHistory.insert({id:'synthetic-history',incidentId,scenarioVersion:5,parentVersion:4,operation:'EXECUTION',stateJson:JSON.stringify(state),stateDigest:'e'.repeat(64),proposalId:'synthetic-proposal',restoredFromId:undefined,createdBy:'synthetic-human',createdAt});
 ctx.db.findings.insert({id:'synthetic-finding',incidentId,investigationId:'synthetic-run',title:'Retained accepted finding',summary:'Synthetic historical finding',evidenceIds:['synthetic-evidence'],assetIds:['synthetic-asset'],confidence:'HIGH',unknowns:['synthetic-unknown'],verificationStatus:'VERIFIED',createdAt,recommendedNextQueries:['Review retained route']});
 ctx.db.investigations.insert({id:'synthetic-run',incidentId,objective:'Synthetic historical investigation',status:'COMPLETED',requestedBy:'synthetic-human',provider:'SYNTHETIC_TEST',model:'synthetic-model',createdAt,updatedAt:createdAt,planningJson:JSON.stringify({assumptions:['Synthetic'],uncertainty:['Unknown route'],alternatives:[]})});
 ctx.db.proposals.insert({id:'synthetic-proposal',incidentId,investigationId:'synthetic-run',simulationId:'synthetic-preview',requestedBy:'synthetic-human',action:{type:'ISOLATE_SIMULATED_HOST',targetIds:['synthetic-asset']},rationale:'Retained human response',evidenceIds:['synthetic-evidence'],assumptions:['Synthetic host'],uncertainty:['Unknown route'],status:'VERIFIED_SUCCESS',expectedVersion:4,version:3,payloadDigest:'a'.repeat(64),createdAt,updatedAt:createdAt,planningJson:undefined});
 ctx.db.approvals.insert({id:'synthetic-approval',incidentId,proposalId:'synthetic-proposal',approverId:'synthetic-human',decision:'APPROVE',justification:'Retained human decision',payloadDigest:'a'.repeat(64),scenarioVersion:4,proposalVersion:2,createdAt,expiresAt:'2026-01-01T00:15:00Z'});
 ctx.db.verifications.insert({id:'synthetic-verification',incidentId,proposalId:'synthetic-proposal',status:'VERIFIED_SUCCESS',expectedVersion:4,observedVersion:5,summary:'Synthetic state matched',createdAt});
 ctx.db.auditEvents.insert({id:'synthetic-audit',incidentId,actorId:'synthetic-human',verb:'executeSimulation',objectId:'synthetic-verification',correlationId:'synthetic-correlation',createdAt,previousHash:'0'.repeat(64),hash:'b'.repeat(64),detail:'Synthetic retained history'});
 ctx.db.auditHeads.insert({id:incidentId,hash:'b'.repeat(64)});
 ctx.db.tasks.insert({id:'synthetic-task',incidentId,title:'Retained task',assigneeId:'synthetic-human',state:'DONE',dueAt:undefined,version:3,createdAt});
 ctx.db.messages.insert({id:'synthetic-message',incidentId,authorId:'synthetic-human',text:'Retained collaboration',createdAt});
 ctx.db.incidentReports.insert({id:'synthetic-report',incidentId,version:7,createdBy:'synthetic-human',createdAt,summary:'Retained immutable report bytes'});
 ctx.db.graphReviews.insert({id:'synthetic-review',incidentId,edgeId:'synthetic-edge',findingId:'synthetic-finding',decision:'VERIFIED',expectedEdgeDigest:'f'.repeat(64),evidenceRefsJson:JSON.stringify([{id:'synthetic-evidence',version:2,sha256:'c'.repeat(64)}]),reviewedBy:'synthetic-human',createdAt});
});
TS
spacetime start --listen-addr 127.0.0.1:3121 --data-dir "$test_dir/data" --non-interactive >"$test_dir/server.log" 2>&1 &
test_pid=$!
for attempt in $(seq 1 40); do if curl -fsS http://127.0.0.1:3121/v1/identity/public-key >/dev/null 2>&1; then break; fi; sleep 0.2; done
test_database="breachbay-preservation-$(date +%s)-$RANDOM"
export AUTH_VALIDATION_URL=https://example.invalid/api/auth/validate OIDC_ISSUER=synthetic-migration OIDC_AUDIENCE=synthetic-migration BOOTSTRAP_COMMANDER_SUBJECTS=synthetic-human SERVICE_SUBJECTS=synthetic-service
spacetime publish --server http://127.0.0.1:3121 --module-path "$test_dir/module" --no-config --yes=skip-login "$test_database"
spacetime describe --server http://127.0.0.1:3121 --no-config --json "$test_database" >"$test_dir/before-schema.json"
python3 spacetimedb/scripts/check-schema-layout.py "$baseline_tables" "$baseline_types" "$test_dir/before-schema.json"
retained_tables=(incidents evidence evidence_storage assets sim_scenarios scenario_history findings investigations proposals approvals verifications audit_events audit_heads tasks messages incident_reports graph_reviews)
for table in "${retained_tables[@]}"; do
 spacetime sql --server http://127.0.0.1:3121 --no-config --format json "$test_database" "SELECT * FROM $table" >"$test_dir/before-$table.json"
done
cp spacetimedb/src/schema.ts "$test_dir/module/src/schema.ts"
spacetime publish --server http://127.0.0.1:3121 --module-path "$test_dir/module" --no-config --delete-data=never --yes=skip-login,break-clients "$test_database"
spacetime describe --server http://127.0.0.1:3121 --no-config --json "$test_database" >"$test_dir/after-schema.json"
python3 spacetimedb/scripts/check-schema-layout.py "$baseline_tables" "$baseline_types" "$test_dir/after-schema.json"
for table in "${retained_tables[@]}"; do
 spacetime sql --server http://127.0.0.1:3121 --no-config --format json "$test_database" "SELECT * FROM $table" >"$test_dir/after-$table.json"
done
python3 - "$test_dir" "${retained_tables[@]}" <<'PY'
import json,pathlib,sys
root=pathlib.Path(sys.argv[1])
def rows(value):
 if isinstance(value,dict):
  if 'rows' in value:return value['rows']
  for item in value.values():
   result=rows(item)
   if result is not None:return result
 if isinstance(value,list):
  for item in value:
   result=rows(item)
   if result is not None:return result
 return None
for table in sys.argv[2:]:
 before=rows(json.loads((root/f'before-{table}.json').read_text()));after=rows(json.loads((root/f'after-{table}.json').read_text()))
 assert before is not None and len(before)==1 and before==after,table
print(f'PASS SAME-identity delete-data=never migration: exact retained synthetic rows in {len(sys.argv[2:])} tables, including evidence/private references/v5/actions/decisions/verifications/history/reports/graph review')
PY
