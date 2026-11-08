export interface ReplayView {version:number;assets:{id:string;state:string;credentialEnabled:boolean}[];edges:{id:string;enabled:boolean}[]}
/** Recheck the saved snapshot digest and expose only synthetic mutable state. */
export async function scenarioReplay(json:string,incidentId:string,digest:string):Promise<ReplayView> {
  if(json.length>500000 || !/^[a-f0-9]{64}$/i.test(digest))throw new Error("Saved snapshot integrity unavailable.");
  const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(json));
  const actual=[...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,"0")).join("");
  if(actual!==digest.toLowerCase())throw new Error("Saved snapshot integrity mismatch.");
  const state=JSON.parse(json);
  if(!state || state.synthetic!==true || state.incidentId!==incidentId || !Number.isInteger(state.version) || state.version<1 || !Array.isArray(state.assets) || !Array.isArray(state.edges))throw new Error("Saved snapshot is outside this incident or invalid.");
  if(state.assets.length>1000 || state.edges.length>5000)throw new Error("Saved snapshot exceeds display limits.");
  const assets=state.assets.map((a:Record<string,unknown>)=>{
    if(!a || typeof a.id!=="string" || !["ACTIVE","ISOLATED"].includes(a.state as string) || typeof a.credentialEnabled!=="boolean")throw new Error("Invalid saved asset state.");
    return {id:a.id,state:a.state,credentialEnabled:a.credentialEnabled};
  });
  const edges=state.edges.map((e:Record<string,unknown>)=>{
    if(!e || typeof e.id!=="string" || typeof e.enabled!=="boolean")throw new Error("Invalid saved edge state.");
    return {id:e.id,enabled:e.enabled};
  });
  return {version:state.version,assets,edges};
}
