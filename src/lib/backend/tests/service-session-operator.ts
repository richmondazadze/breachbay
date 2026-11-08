import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,mkdir,rm,readFile,stat,symlink} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {assertServiceUser,assertServiceSession,writeOperatorArtifact} from "../service-session-operator";
test("service user/session guards reject humans, blocked accounts and inactive/foreign sessions",()=>{
 const user={id:"service",externalId:"breachbay-investigation-service",banned:false,locked:false};
 assertServiceUser(user,"service");assertServiceSession({userId:"service",status:"active"},"service");
 for(const bad of [{...user,externalId:null},{...user,banned:true},{...user,locked:true}])assert.throws(()=>assertServiceUser(bad,"service"));
 assert.throws(()=>assertServiceUser(user,"human"));
 for(const bad of [{userId:"human",status:"active"},{userId:"service",status:"pending"},{userId:"service",status:"revoked"}])assert.throws(()=>assertServiceSession(bad,"service"));
});
test("one-time artifacts remain external, private and cannot overwrite or escape through symlink",async()=>{
 const root=await mkdtemp(join(tmpdir(),"breachbay-operator-"));
 try {
 const project=join(root,"project"),external=join(root,"private");await mkdir(project);await mkdir(external);
 const file=join(external,"ticket.json");await writeOperatorArtifact(file,{ticket:"synthetic-test-only"},project);
 assert.equal((await stat(file)).mode & 0o777,0o600);assert.equal(JSON.parse(await readFile(file,"utf8")).ticket,"synthetic-test-only");
 await assert.rejects(writeOperatorArtifact(file,{},project));
 await assert.rejects(writeOperatorArtifact(join(project,"..inside"),{},project));
 await symlink(project,join(external,"linked-project"));await assert.rejects(writeOperatorArtifact(join(external,"linked-project","ticket"),{},project));
 }finally{await rm(root,{recursive:true,force:true});}
});
