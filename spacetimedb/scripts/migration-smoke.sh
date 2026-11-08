#!/usr/bin/env bash
set -euo pipefail
# Isolated synthetic migration test: no deployment configuration, credentials or data deletion.
migration_dir=$(mktemp -d "${TMPDIR:-/tmp}/breachbay-migration.XXXXXX")
server_pid=''
cleanup() { if [[ -n "$server_pid" ]]; then kill "$server_pid" 2>/dev/null || true; fi; rm -rf "$migration_dir"; }
trap cleanup EXIT
mkdir -p "$migration_dir/module/src"
ln -s "$PWD/node_modules" "$migration_dir/module/node_modules"
cp spacetimedb/package.json spacetimedb/tsconfig.json "$migration_dir/module/"
cat > "$migration_dir/module/src/index.ts" <<'TS'
import {schema,table,t} from "spacetimedb/server";
const events=table({name:"stream_events"},{id:t.string().primaryKey(),payloadJson:t.option(t.string())});
const audits=table({name:"audit_events"},{id:t.string().primaryKey(),detail:t.string()});
const storage=table({name:"evidence_storage"},{id:t.string().primaryKey(),storageRef:t.string()});
const findings=table({name:"findings"},{id:t.string().primaryKey(),unknowns:t.array(t.string())});
const proposals=table({name:"proposals"},{id:t.string().primaryKey(),rationale:t.string()});
const investigations=table({name:"investigations"},{id:t.string().primaryKey(),status:t.string()});
const db=schema({events,audits,storage,findings,proposals,investigations});
export default db;
export const init=db.init(ctx=>{
ctx.db.findings.insert({id:"synthetic-finding",unknowns:["synthetic-unknown"]});
ctx.db.proposals.insert({id:"synthetic-proposal",rationale:"synthetic-rationale"});
ctx.db.investigations.insert({id:"synthetic-run",status:"COMPLETED"});
ctx.db.events.insert({id:"synthetic-event",payloadJson:"synthetic-legacy-history"});
ctx.db.audits.insert({id:"synthetic-audit",detail:"synthetic-audit-preserved"});
ctx.db.storage.insert({id:"synthetic-evidence",storageRef:"synthetic-private-reference"});
});
TS
spacetime start --listen-addr 127.0.0.1:3117 --data-dir "$migration_dir/data" --non-interactive >"$migration_dir/server.log" 2>&1 &
server_pid=$!
for attempt in $(seq 1 50); do if curl -fsS http://127.0.0.1:3117/v1/identity/public-key >/dev/null 2>&1; then break; fi; sleep 0.2; done
migration_database="breachbay-migration-$(date +%s)-$RANDOM"
spacetime publish --server http://127.0.0.1:3117 --module-path "$migration_dir/module" --no-config --yes=skip-login "$migration_database"
python3 - "$migration_dir/module/src/index.ts" <<'PY'
import sys
p=sys.argv[1];s=open(p).read().replace('payloadJson:t.option(t.string())','payloadJson:t.option(t.string()).default(undefined),dataJson:t.option(t.string()).default(undefined)').replace('payloadJson:"synthetic-legacy-history"','payloadJson:"synthetic-legacy-history",dataJson:undefined')
s=s.replace('const db=schema({events,audits,storage,findings,proposals,investigations});','const scenarioHistory=table({name:"scenario_history"},{id:t.string().primaryKey(),incidentId:t.string(),scenarioVersion:t.u32(),parentVersion:t.option(t.u32()),operation:t.string(),stateJson:t.string(),stateDigest:t.string(),proposalId:t.option(t.string()),restoredFromId:t.option(t.string()),createdBy:t.string(),createdAt:t.string()});\nconst graphReviews=table({name:"graph_reviews"},{id:t.string().primaryKey(),incidentId:t.string(),edgeId:t.string(),findingId:t.option(t.string()),decision:t.string(),expectedEdgeDigest:t.string(),evidenceRefsJson:t.string(),reviewedBy:t.string(),createdAt:t.string()});\nconst db=schema({events,audits,storage,scenarioHistory,graphReviews,findings,proposals,investigations});')
s=s.replace('unknowns:t.array(t.string())','unknowns:t.array(t.string()),recommendedNextQueries:t.option(t.array(t.string())).default(undefined)').replace('rationale:t.string()','rationale:t.string(),planningJson:t.option(t.string()).default(undefined)').replace('status:t.string()','status:t.string(),planningJson:t.option(t.string()).default(undefined)').replace('unknowns:["synthetic-unknown"]','unknowns:["synthetic-unknown"],recommendedNextQueries:undefined').replace('rationale:"synthetic-rationale"','rationale:"synthetic-rationale",planningJson:undefined').replace('status:"COMPLETED"','status:"COMPLETED",planningJson:undefined')
open(p,'w').write(s)
PY
spacetime publish --server http://127.0.0.1:3117 --module-path "$migration_dir/module" --no-config --delete-data=never --yes=skip-login,break-clients "$migration_database"
spacetime sql --server http://127.0.0.1:3117 --no-config --format json "$migration_database" 'SELECT * FROM stream_events' >"$migration_dir/events.json"
spacetime sql --server http://127.0.0.1:3117 --no-config --format json "$migration_database" 'SELECT * FROM audit_events' >"$migration_dir/audits.json"
spacetime sql --server http://127.0.0.1:3117 --no-config --format json "$migration_database" 'SELECT * FROM evidence_storage' >"$migration_dir/storage.json"
spacetime sql --server http://127.0.0.1:3117 --no-config --format json "$migration_database" 'SELECT * FROM findings' >"$migration_dir/findings.json"
spacetime sql --server http://127.0.0.1:3117 --no-config --format json "$migration_database" 'SELECT * FROM proposals' >"$migration_dir/proposals.json"
spacetime sql --server http://127.0.0.1:3117 --no-config --format json "$migration_database" 'SELECT * FROM investigations' >"$migration_dir/investigations.json"
python3 - "$migration_dir" <<'PY'
import sys,pathlib
root=pathlib.Path(sys.argv[1]);events=(root/'events.json').read_text()
assert 'synthetic-legacy-history' in events and 'data_json' in events
assert 'synthetic-audit-preserved' in (root/'audits.json').read_text()
assert 'synthetic-private-reference' in (root/'storage.json').read_text()
assert 'synthetic-unknown' in (root/'findings.json').read_text() and 'recommended_next_queries' in (root/'findings.json').read_text()
assert 'synthetic-rationale' in (root/'proposals.json').read_text() and 'planning_json' in (root/'proposals.json').read_text()
assert 'COMPLETED' in (root/'investigations.json').read_text() and 'planning_json' in (root/'investigations.json').read_text()
print('PASS optional planning/next-query/trace defaults and new private scenario history/review tables preserve legacy event, audit and private storage rows without deletion')
PY
