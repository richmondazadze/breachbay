import assert from 'node:assert/strict';
import {AlgebraicType as A,BinaryWriter,BinaryReader,Identity,ConnectionId,Timestamp,TimeDuration,Uuid,type AlgebraicTypeType} from 'spacetimedb';
import {DbConnection} from '../generated';
import {installCspSafeCodecs} from '../csp-codecs';
async function main(){
const product=(fields:Record<string,AlgebraicTypeType>)=>A.Product({elements:Object.entries(fields).map(([name,algebraicType])=>({name,algebraicType}))});
const option=(ty:AlgebraicTypeType)=>A.Sum({variants:[{name:'some',algebraicType:ty},{name:'none',algebraicType:product({})}]});
const result=A.Sum({variants:[{name:'ok',algebraicType:A.String},{name:'err',algebraicType:A.U32}]});
const sum=A.Sum({variants:[{name:'Empty',algebraicType:product({})},{name:'Value',algebraicType:product({text:A.String,count:A.U32})}]});
const primitives=product({bool:A.Bool,i8:A.I8,u8:A.U8,i16:A.I16,u16:A.U16,i32:A.I32,u32:A.U32,i64:A.I64,u64:A.U64,i128:A.I128,u128:A.U128,i256:A.I256,u256:A.U256,f32:A.F32,f64:A.F64,string:A.String});
const specials=product({identity:Identity.getAlgebraicType(),connection:ConnectionId.getAlgebraicType(),timestamp:Timestamp.getAlgebraicType(),duration:TimeDuration.getAlgebraicType(),uuid:Uuid.getAlgebraicType()});
const recursive=product({text:A.String,tail:option(A.Ref(0))});const typespace={types:[recursive]};
const cases:{type:AlgebraicTypeType,value:unknown,typespace?:{types:AlgebraicTypeType[]}}[]=[
 {type:primitives,value:{bool:true,i8:-7,u8:255,i16:-222,u16:65535,i32:-123000,u32:4294967295,i64:-BigInt("9007199254740993"),u64:BigInt("9007199254740993"),i128:-(BigInt("1")<<BigInt("100")),u128:BigInt("1")<<BigInt("110"),i256:-(BigInt("1")<<BigInt("230")),u256:BigInt("1")<<BigInt("240"),f32:0.125,f64:1e123,string:'Synthetic € 😀 text'}},
 {type:specials,value:{identity:new Identity(BigInt("123")),connection:new ConnectionId(BigInt("456")),timestamp:new Timestamp(-BigInt("99")),duration:new TimeDuration(BigInt("1000")),uuid:new Uuid(BigInt("789"))}},
 {type:product({bytes:A.Array(A.U8),strings:A.Array(A.String),nested:product({value:option(A.U32)})}),value:{bytes:new Uint8Array([0,127,255]),strings:['a','€'],nested:{value:4}}},
 ...[undefined,null,0,123].map(value=>({type:option(A.U32),value})),
 ...[{ok:'success'},{err:7}].map(value=>({type:result,value})),
 ...[{tag:'Empty',value:{}},{tag:'Value',value:{text:'value',count:7}}].map(value=>({type:sum,value})),
 {type:recursive,typespace,value:{text:'first',tail:{text:'second',tail:undefined}}},
 {type:product({reference:A.Ref(0)}),typespace:{types:[A.String]},value:{reference:'string-ref'}},
 {type:product({reference:A.Ref(0)}),typespace:{types:[A.U32]},value:{reference:42}},
];
const references=cases.map(c=>{
 const serialize=A.makeSerializer(c.type,c.typespace),deserialize=A.makeDeserializer(c.type,c.typespace);const writer=new BinaryWriter(128);serialize(writer,c.value);const bytes=writer.getBuffer().slice();
 return {bytes,value:deserialize(new BinaryReader(bytes))};
});
const originalFunction=globalThis.Function;
const blocked=new Proxy(originalFunction,{apply(){throw new EvalError('Synthetic CSP blocked evaluation');},construct(){throw new EvalError('Synthetic CSP blocked evaluation');}});
globalThis.Function=blocked;
try{
 assert.throws(()=>DbConnection.builder().withUri('http://127.0.0.1:1').withDatabaseName('synthetic-csp').withWSFn(async()=>{throw new Error('Transport must not start');}).build(),/blocked evaluation/);
 installCspSafeCodecs();installCspSafeCodecs();
 for(let i=0;i<cases.length;i++){
  const c=cases[i],writer=new BinaryWriter(128);A.makeSerializer(c.type,c.typespace)(writer,c.value);const bytes=writer.getBuffer().slice();assert.deepEqual(bytes,references[i].bytes,`wire case ${i}`);
  const reader=new BinaryReader(bytes);assert.deepEqual(A.makeDeserializer(c.type,c.typespace)(reader),references[i].value,`decode case ${i}`);assert.equal(reader.remaining,0);
 }
 assert.throws(()=>A.makeDeserializer(sum)(new BinaryReader(new Uint8Array([255]))));
 assert.throws(()=>A.makeDeserializer(option(A.U32))(new BinaryReader(new Uint8Array([2]))));
 assert.throws(()=>A.makeDeserializer(primitives)(new BinaryReader(new Uint8Array([1]))));
 assert.throws(()=>A.makeSerializer(sum)(new BinaryWriter(8),{tag:'Unknown'}));
 assert.throws(()=>A.makeSerializer(result)(new BinaryWriter(8),{}));
 let transportError:unknown;const connection=DbConnection.builder().withUri('http://127.0.0.1:1').withDatabaseName('synthetic-csp').withWSFn(async()=>{throw new Error('Synthetic transport rejection');}).onConnectError((_ctx,error)=>{transportError=error;}).build();
 await new Promise(r=>setTimeout(r,10));assert.match(String(transportError),/Synthetic transport rejection/);connection.disconnect();
 console.log(`PASS ${cases.length} CSP-blocked byte-equivalent codecs, special classes/ref/recursion, malformed input denial and full generated connection constructor`);
}finally{globalThis.Function=originalFunction;}

}
main().catch(error=>{console.error(error);process.exitCode=1;});
