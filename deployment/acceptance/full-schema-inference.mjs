// Harmless operator schema feature diagnosis. No incident context or response text is printed.
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
const load = async path => {const m=await import(pathToFileURL(join(process.cwd(),path)).href);return m.default??m;};
const {finalResponseSchema,validateFinalResponseSchema}=await load('src/lib/ai/final-schema.ts');
const {sanitizeEvidence}=await load('src/lib/ai/evidence.ts');
const {credentialCompromiseScenario}=await load('src/lib/simulation/scenario.ts');
const {providerConfig}=await load('src/lib/ai/nemotron.ts');
const config=providerConfig();
const format=finalResponseSchema(credentialCompromiseScenario('schema-probe'),[sanitizeEvidence({id:'synthetic-probe-evidence',incidentId:'schema-probe',version:1,source:'Synthetic probe',capturedAt:'2026-11-07T00:00:00Z',synthetic:true,fields:{description:'Harmless schema capability only'}})],new Set(['synthetic-probe-evidence']));
async function probe(kind) {
  try {
    const transportFormat=JSON.parse(JSON.stringify(format,(key,value)=>key==='uniqueItems'?undefined:value));
    const response=await fetch(config.endpoint,{method:'POST',signal:AbortSignal.timeout(30000),headers:{Authorization:'Bearer '+config.apiKey,'Content-Type':'application/json'},body:JSON.stringify({model:config.model,messages:[{role:'user',content:'Return one minimal JSON object matching the required response schema. Use one finding with summary Synthetic readiness and confidence LOW, empty unknowns and queries, empty planning arrays and proposal null. This is a harmless format probe.'}],stream:false,temperature:0,max_tokens:4096,chat_template_kwargs:{enable_thinking:false},...(kind==='json_schema'?{response_format:{type:'json_schema',json_schema:transportFormat}}:{guided_json:transportFormat.schema})})});
    const bytes=await response.text();
    assert.ok(bytes.length<128000);
    if(!response.ok){const keywords=['uniqueItems','anyOf','minLength','maxLength','minItems','maxItems','schema','guided_json','response_format','unsupported'].filter(k=>bytes.toLowerCase().includes(k.toLowerCase()));console.log(JSON.stringify({kind,status:response.status,diagnosticKeywords:keywords}));return;}
    const data=JSON.parse(bytes);
    assert.notEqual(data.choices?.[0]?.finish_reason,'length');
    validateFinalResponseSchema(JSON.parse(data.choices?.[0]?.message?.content),format);
    console.log(kind+': PASS_FULL_SCHEMA_WITH_LOCAL_UNIQUENESS');
  }catch{console.log(kind+': FAIL_STRUCTURAL_OR_TRANSPORT');process.exitCode=1;}
}
await Promise.all(['json_schema','guided_json'].map(probe));
