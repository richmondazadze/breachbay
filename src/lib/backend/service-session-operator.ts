import {open, realpath} from "node:fs/promises";
import {dirname, isAbsolute, resolve, relative} from "node:path";
export { SERVICE_EXTERNAL_ID, assertServiceUser, assertServiceSession } from "./service-principal";
/** Protected artifacts must not fall under the repository, including symlinked parents. */
export async function writeOperatorArtifact(path:string,value:unknown,projectRoot=process.cwd()) {
 if(!isAbsolute(path))throw new Error("PRIVATE_OUTPUT_REQUIRED");
 const parent=await realpath(dirname(path)),project=await realpath(projectRoot);
 const destination=resolve(parent, path.slice(path.lastIndexOf("/")+1));
 const rel=relative(project,destination);
 if(!rel || !(rel === ".." || rel.startsWith("../") || isAbsolute(rel)))throw new Error("PRIVATE_OUTPUT_REQUIRED");
 const file=await open(destination,"wx",0o600);
 try {await file.writeFile(JSON.stringify(value));await file.sync();}finally{await file.close();}
}
