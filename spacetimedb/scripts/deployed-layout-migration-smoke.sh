#!/usr/bin/env bash
set -euo pipefail
# Read ONLY explicitly authorized schema artifacts, never production env/data/credentials.
layout_tables=${1:?Pass deployed tables schema JSON}
layout_types=${2:?Pass deployed Typespace JSON}
layout_dir=$(mktemp -d "${TMPDIR:-/tmp}/breachbay-deployed-layout.XXXXXX")
layout_pid=''
cleanup(){ if [[ -n "$layout_pid" ]]; then kill "$layout_pid" 2>/dev/null || true; fi; rm -rf "$layout_dir"; }
trap cleanup EXIT
mkdir -p "$layout_dir/module/src"
cp spacetimedb/package.json spacetimedb/tsconfig.json "$layout_dir/module/"
ln -s "$(pwd)/spacetimedb/node_modules" "$layout_dir/module/node_modules"
cp spacetimedb/src/schema.ts "$layout_dir/current-schema.ts"
python3 - "$layout_dir" <<'PY'
import pathlib,re,sys
root=pathlib.Path(sys.argv[1]);s=(root/'current-schema.ts').read_text()
for line in ['    recommendedNextQueries: t.option(t.array(t.string())).default(undefined),\n','    planningJson:t.option(t.string()).default(undefined),\n','    planningJson: t.option(t.string()).default(undefined),\n']:
 assert s.count(line)==1;s=s.replace(line,'')
s=re.sub(r'export const graphReviews=table\([^\n]+\);\n','',s)
s=re.sub(r'export const scenarioHistory = table\(\{name:"scenario_history"\},\{[\s\S]*?\n\}\);\n','',s)
s=s.replace('    graphReviews,\n','').replace('    scenarioHistory,\n','')
(root/'module/src/schema.ts').write_text(s)
PY
cat > "$layout_dir/module/src/index.ts" <<'TS'
import db from './schema';
export default db;
export const init=db.init(ctx=>{
 const incidentId='synthetic-layout-incident',createdAt='2026-01-01T00:00:00Z';
 ctx.db.incidents.insert({id:incidentId,incidentId,title:'Synthetic layout case',description:'Synthetic no-delete migration',severity:'HIGH',status:'INVESTIGATING',classification:'SYNTHETIC',scenarioId:'credential-compromise',scenarioVersion:1,version:1,ownerId:'synthetic-human',createdAt,updatedAt:createdAt});
 ctx.db.findings.insert({id:'synthetic-finding',incidentId,investigationId:'synthetic-run',title:'Synthetic finding',summary:'Synthetic historical finding',evidenceIds:['synthetic-evidence'],assetIds:['synthetic-asset'],confidence:'HIGH',unknowns:['synthetic-unknown'],verificationStatus:'HYPOTHESIS',createdAt});
 ctx.db.investigations.insert({id:'synthetic-run',incidentId,objective:'Synthetic investigation',status:'COMPLETED',requestedBy:'synthetic-human',provider:'SYNTHETIC_TEST',model:'synthetic-model',createdAt,updatedAt:createdAt});
 ctx.db.proposals.insert({id:'synthetic-proposal',incidentId,investigationId:undefined,simulationId:undefined,requestedBy:'synthetic-human',action:{type:'ISOLATE_SIMULATED_HOST',targetIds:['synthetic-asset']},rationale:'Synthetic rationale',evidenceIds:['synthetic-evidence'],assumptions:[],uncertainty:[],status:'VALIDATED',expectedVersion:1,version:1,payloadDigest:'a'.repeat(64),createdAt,updatedAt:createdAt});
 ctx.db.evidence.insert({id:'synthetic-evidence',incidentId,kind:'LOG',title:'Synthetic retained evidence',source:'Synthetic migration',capturedAt:createdAt,sha256:'c'.repeat(64),redactedSha256:'d'.repeat(64),classification:'SYNTHETIC',redactedContent:'Synthetic evidence retained exactly',modelApproved:true,assetIds:['synthetic-asset'],createdAt,version:2});
 ctx.db.assets.insert({id:'synthetic-asset',incidentId,name:'Synthetic asset',type:'HOST',owner:'Synthetic owner',criticality:'HIGH',state:'COMPROMISED',version:3,lastSeen:createdAt,riskLabels:['SYNTHETIC']});
 ctx.db.simScenarios.insert({id:incidentId,incidentId,state:{incidentId,version:1,seed:'synthetic-seed',synthetic:true,assets:[{id:'synthetic-asset',name:'Synthetic asset',criticality:'HIGH',state:'ACTIVE',credentialEnabled:true}],edges:[],compromisedAssetIds:['synthetic-asset'],protectedAssetIds:[]}});
 ctx.db.evidenceStorage.insert({id:'synthetic-evidence',incidentId,storageRef:'synthetic-private-reference'});
 ctx.db.auditEvents.insert({id:'synthetic-audit',incidentId,actorId:'synthetic-human',verb:'synthetic-migration',objectId:incidentId,correlationId:'synthetic-correlation',createdAt,previousHash:'0'.repeat(64),hash:'b'.repeat(64),detail:'Synthetic immutable history'});
 ctx.db.auditHeads.insert({id:incidentId,hash:'b'.repeat(64)});
 ctx.db.tasks.insert({id:'synthetic-task',incidentId,title:'Synthetic triage',assigneeId:'synthetic-human',state:'TODO',dueAt:undefined,version:1,createdAt});
});
TS
spacetime start --listen-addr 127.0.0.1:3121 --data-dir "$layout_dir/data" --non-interactive >"$layout_dir/server.log" 2>&1 &
layout_pid=$!
for attempt in $(seq 1 40); do if curl -fsS http://127.0.0.1:3121/v1/identity/public-key >/dev/null 2>&1; then break; fi; sleep 0.2; done
layout_database="breachbay-layout-$(date +%s)-$RANDOM"
export AUTH_VALIDATION_URL=https://example.invalid/api/auth/validate OIDC_ISSUER=synthetic-layout OIDC_AUDIENCE=synthetic-layout BOOTSTRAP_COMMANDER_SUBJECTS=synthetic-human SERVICE_SUBJECTS=synthetic-service
spacetime publish --server http://127.0.0.1:3121 --module-path "$layout_dir/module" --no-config --yes=skip-login "$layout_database"
spacetime describe --server http://127.0.0.1:3121 --no-config --json "$layout_database" >"$layout_dir/baseline.json"
python3 spacetimedb/scripts/check-schema-layout.py "$layout_tables" "$layout_types" "$layout_dir/baseline.json"
for table in findings investigations proposals evidence_storage audit_events audit_heads tasks incidents evidence assets sim_scenarios; do
 spacetime sql --server http://127.0.0.1:3121 --no-config --format json "$layout_database" "SELECT * FROM $table" >"$layout_dir/before-$table.json"
done
cp "$layout_dir/current-schema.ts" "$layout_dir/module/src/schema.ts"
# Module only validates/migrates schemas; no production reducers/auth/session access is invoked.
python3 - "$layout_dir/module/src/index.ts" <<'PY'
import pathlib,sys
p=pathlib.Path(sys.argv[1]);s=p.read_text().replace("unknowns:['synthetic-unknown'],","unknowns:['synthetic-unknown'],recommendedNextQueries:undefined,").replace("model:'synthetic-model',","model:'synthetic-model',planningJson:undefined,").replace("rationale:'Synthetic rationale',","rationale:'Synthetic rationale',planningJson:undefined,");p.write_text(s)
PY
spacetime publish --server http://127.0.0.1:3121 --module-path "$layout_dir/module" --no-config --delete-data=never --yes=skip-login,break-clients "$layout_database"
spacetime describe --server http://127.0.0.1:3121 --no-config --json "$layout_database" >"$layout_dir/after.json"
python3 spacetimedb/scripts/check-schema-layout.py "$layout_tables" "$layout_types" "$layout_dir/after.json"
for table in findings investigations proposals evidence_storage audit_events audit_heads tasks incidents evidence assets sim_scenarios; do
 spacetime sql --server http://127.0.0.1:3121 --no-config --format json "$layout_database" "SELECT * FROM $table" >"$layout_dir/after-$table.json"
done
python3 - "$layout_dir" <<'PY'
import json,pathlib,sys
root=pathlib.Path(sys.argv[1])
def rows(v):
 if isinstance(v,dict):
  if 'rows' in v:return v['rows']
  for x in v.values():
   r=rows(x)
   if r is not None:return r
 if isinstance(v,list):
  for x in v:
   r=rows(x)
   if r is not None:return r
 return None
for table in ['findings','investigations','proposals','evidence_storage','audit_events','audit_heads','tasks','incidents','evidence','assets','sim_scenarios']:
 before=rows(json.loads((root/f'before-{table}.json').read_text()));after=rows(json.loads((root/f'after-{table}.json').read_text()))
 assert before is not None and after is not None and len(before)==len(after)==1,table
 assert after[0][:len(before[0])]==before[0],table
print('PASS SAME-identity delete-data=never actual-deployed-layout migration retains exact synthetic case/task/evidence/asset/scenario/finding/proposal/COMPLETED-run/audit/private-storage rows')
PY
