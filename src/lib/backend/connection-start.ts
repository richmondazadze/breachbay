/** Reject constructor failures immediately and release every owned deadline/partial connection. */
export function awaitConnection<C extends {disconnect():void}>(
 build:(callbacks:{connected:(connection:C)=>void;failed:(error:unknown)=>void})=>C,
 timeoutMs=10000,
):Promise<C>{
 return new Promise((resolve,reject)=>{
  let connection:C|undefined;
  let settled=false,failed=false;
  const close=()=>{try{connection?.disconnect();}catch{/* Preserve original connection failure. */}};
  const rejectOnce=(error:unknown)=>{
   if(settled)return;
   settled=true;failed=true;clearTimeout(timer);close();reject(error);
  };
  const timer=setTimeout(()=>rejectOnce(new Error('DEPENDENCY_UNAVAILABLE')),timeoutMs);
  try{
   connection=build({connected:c=>{
    if(settled){if(failed)try{c.disconnect();}catch{};return;}
    settled=true;clearTimeout(timer);resolve(c);
   },failed:rejectOnce});
   if(failed)close();
  }catch(error){rejectOnce(error);}
 });
}
