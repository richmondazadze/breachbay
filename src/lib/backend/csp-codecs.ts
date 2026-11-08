import {
 AlgebraicType,ProductType,SumType,Identity,ConnectionId,Timestamp,TimeDuration,Uuid,
 type ProductTypeType,type SumTypeType,type Serializer,type Deserializer,
} from 'spacetimedb';
type Typespace=Parameters<typeof ProductType.makeSerializer>[1];
type Composite=ProductTypeType|SumTypeType;
type Cache={serialize:WeakMap<Composite,Serializer<unknown>>;deserialize:WeakMap<Composite,Deserializer<unknown>>};
const emptyTypespace={};
const caches=new WeakMap<object,Cache>();
function cache(typespace:Typespace):Cache{
 const key=typespace??emptyTypespace;let value=caches.get(key);
 if(!value){value={serialize:new WeakMap(),deserialize:new WeakMap()};caches.set(key,value);}return value;
}
function productSerializer(type:ProductTypeType,typespace?:Typespace):Serializer<unknown>{
 const memo=cache(typespace).serialize;const previous=memo.get(type);if(previous)return previous;
 let fields:{name:string;serialize:Serializer<unknown>}[]=[];
 const serialize:Serializer<unknown>=(writer,value)=>{for(const field of fields)field.serialize(writer,(value as Record<string,unknown>)[field.name]);};
 memo.set(type,serialize);
 fields=type.elements.map(e=>({name:String(e.name),serialize:AlgebraicType.makeSerializer(e.algebraicType,typespace)}));
 return serialize;
}
function productDeserializer(type:ProductTypeType,typespace?:Typespace):Deserializer<unknown>{
 if(type.elements.length===1){
  switch(type.elements[0].name){
   case '__identity__':return reader=>new Identity(reader.readU256());
   case '__connection_id__':return reader=>new ConnectionId(reader.readU128());
   case '__timestamp_micros_since_unix_epoch__':return reader=>new Timestamp(reader.readI64());
   case '__time_duration_micros__':return reader=>new TimeDuration(reader.readI64());
   case '__uuid__':return reader=>new Uuid(reader.readU128());
  }
 }
 const memo=cache(typespace).deserialize;const previous=memo.get(type);if(previous)return previous;
 let fields:{name:string;deserialize:Deserializer<unknown>}[]=[];
 const deserialize:Deserializer<unknown>=reader=>{
  const value:Record<string,unknown>={};
  for(const field of fields)Object.defineProperty(value,field.name,{value:field.deserialize(reader),writable:true,enumerable:true,configurable:true});
  return value;
 };
 memo.set(type,deserialize);
 fields=type.elements.map(e=>({name:String(e.name),deserialize:AlgebraicType.makeDeserializer(e.algebraicType,typespace)}));
 return deserialize;
}
function sumSerializer(type:SumTypeType,typespace?:Typespace):Serializer<unknown>{
 const memo=cache(typespace).serialize;const previous=memo.get(type);if(previous)return previous;
 const option=type.variants.length===2&&type.variants[0].name==='some'&&type.variants[1].name==='none';
 const result=type.variants.length===2&&type.variants[0].name==='ok'&&type.variants[1].name==='err';
 let variants:Serializer<unknown>[]=[];
 const serialize:Serializer<unknown>=(writer,value)=>{
  let index:number,payload:unknown;
  if(option){index=value===undefined||value===null?1:0;payload=value;}
  else if(result){
   if(!value||typeof value!=='object')throw new TypeError('Invalid result value');
   if('ok'in value){index=0;payload=value.ok;}else if('err'in value){index=1;payload=value.err;}else throw new TypeError('Invalid result variant');
  }else{
   const tagged=value as {tag?:string;value?:unknown};
   index=type.variants.findIndex(v=>v.name===tagged?.tag);payload=tagged?.value;
   if(index<0)throw new TypeError('Unknown sum variant');
  }
  writer.writeU8(index);
  // SDK Option None is represented by undefined, not a product payload.
  if(!option||index===0)variants[index](writer,payload);
 };
 memo.set(type,serialize);variants=type.variants.map(v=>AlgebraicType.makeSerializer(v.algebraicType,typespace));return serialize;
}
function sumDeserializer(type:SumTypeType,typespace?:Typespace):Deserializer<unknown>{
 const memo=cache(typespace).deserialize;const previous=memo.get(type);if(previous)return previous;
 const option=type.variants.length===2&&type.variants[0].name==='some'&&type.variants[1].name==='none';
 const result=type.variants.length===2&&type.variants[0].name==='ok'&&type.variants[1].name==='err';
 let variants:Deserializer<unknown>[]=[];
 const deserialize:Deserializer<unknown>=reader=>{
  const index=reader.readU8();if(index>=variants.length)throw new TypeError('Invalid sum discriminant');
  if(option)return index===0?variants[0](reader):undefined;
  const value=variants[index](reader);
  if(result)return index===0?{ok:value}:{err:value};
  return {tag:type.variants[index].name,value};
 };
 memo.set(type,deserialize);variants=type.variants.map(v=>AlgebraicType.makeDeserializer(v.algebraicType,typespace));return deserialize;
}
let installed=false;
/** Project-owned closure codecs for pinned SDK 2.14.1 public factories; no code evaluation. */
export function installCspSafeCodecs(){
 if(installed)return;
 ProductType.makeSerializer=productSerializer;ProductType.makeDeserializer=productDeserializer;
 SumType.makeSerializer=sumSerializer;SumType.makeDeserializer=sumDeserializer;
 installed=true;
}
