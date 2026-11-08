import {test} from "node:test";
import assert from "node:assert/strict";
import {bootstrapPolicy} from "../../../../spacetimedb/src/bootstrap-policy";
test("explicit commander list promotes existing ordinary active human only",()=>{
 const ordinary={service:false,platformAdmin:false,status:"ACTIVE"};
 assert.equal(bootstrapPolicy("u","","",ordinary).promote,false);
 assert.equal(bootstrapPolicy("u"," other, u ","",ordinary).promote,true);
 assert.equal(bootstrapPolicy("u","u","",{...ordinary,status:"DISABLED"}).promote,false);
 assert.equal(bootstrapPolicy("u","u","",{...ordinary,platformAdmin:true}).promote,false);
 assert.equal(bootstrapPolicy("v","u","",ordinary).promote,false);
});
test("fails closed on overlaps and human/service classification migrations",()=>{
 const human={service:false,platformAdmin:false,status:"ACTIVE"};
 const service={...human,service:true};
 assert.throws(()=>bootstrapPolicy("u","u","u",human),/CONFLICT/);
 assert.throws(()=>bootstrapPolicy("u","u","",service),/CONFLICT/);
 assert.throws(()=>bootstrapPolicy("u","","u",human),/CONFLICT/);
 assert.equal(bootstrapPolicy("u","","u",service).promote,false);
 assert.deepEqual(bootstrapPolicy("u","","u"),{service:true,promote:false});
});
