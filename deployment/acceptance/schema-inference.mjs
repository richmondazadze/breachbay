// Harmless hosted-schema capability probe. Prints only fixed diagnostics, never provider text.
import assert from 'node:assert/strict';
const schema = {type:'object',properties:{status:{type:'string',enum:['READY']},checks:{type:'array',items:{type:'string',enum:['SCHEMA']},minItems:1,maxItems:1}},required:['status','checks'],additionalProperties:false};
async function probe(kind) {
  const started = Date.now();
  try {
    const url = new URL(process.env.NEMOTRON_BASE_URL);
    assert.equal(url.protocol,'https:');
    assert.ok(!url.username && !url.password && !url.search && !url.hash);
    assert.equal(process.env.NEMOTRON_MODEL,'nvidia/nemotron-3.5-lightning-30b-a3b');
    const response = await fetch(url.href.replace(/\/$/,'')+'/chat/completions',{method:'POST',signal:AbortSignal.timeout(30000),headers:{Authorization:'Bearer '+process.env.NEMOTRON_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.NEMOTRON_MODEL,messages:[{role:'user',content:'Return exactly the plain text UNSTRUCTURED. Do not return a JSON object.'}],stream:false,temperature:0,max_tokens:256,chat_template_kwargs:{enable_thinking:false},...(kind==='json_schema'?{response_format:{type:'json_schema',json_schema:{name:'breachbay_readiness',strict:true,schema}}}:{guided_json:schema})})});
    if(!response.ok){console.log(kind+': HTTP_'+response.status);return;}
    const body = await response.text();
    assert.ok(body.length<128000);
    const data=JSON.parse(body);
    assert.notEqual(data.choices?.[0]?.finish_reason,'length');
    assert.deepEqual(JSON.parse(data.choices?.[0]?.message?.content),{status:'READY',checks:['SCHEMA']});
    console.log(kind+': PASS_ENFORCED_SCHEMA latencyMs='+(Date.now()-started));
  } catch { console.log(kind+': FAIL_ENFORCEMENT_OR_TRANSPORT');process.exitCode=1; }
}
await Promise.all(['json_schema','guided_json'].map(probe));
