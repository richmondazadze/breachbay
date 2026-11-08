/** Public operational transport origins only; no wildcard or credential-bearing URLs. */
export function transportCspOrigins(endpoint?: string): string[] {
  if (!endpoint) return [];
  try {
    const url=new URL(endpoint);
    if(url.username || url.password || !["https:","wss:","http:","ws:"].includes(url.protocol))return [];
    if(["http:","ws:"].includes(url.protocol) && !["localhost","127.0.0.1"].includes(url.hostname))return [];
    const secure=["https:","wss:"].includes(url.protocol);
    return [`${secure?"https":"http"}://${url.host}`,`${secure?"wss":"ws"}://${url.host}`];
  }catch{return [];}
}
/** Clerk includes unsafe-inline as a legacy fallback. Nonced Next/Clerk
 * scripts work without it; preserve intentional runtime style compatibility. */
export function removeInlineScriptFallback(response: Response): Response {
  const csp=response.headers.get("content-security-policy");
  if(!csp)return response;
  const policy=csp.split(";").map(directive=>{
    const tokens=directive.trim().split(/\s+/);
    return tokens[0]==="script-src" ? tokens.filter(token=>token!=="'unsafe-inline'").join(" ") : directive.trim();
  }).join("; ");
  response.headers.set("content-security-policy",policy);
  if(response.headers.has("x-middleware-request-content-security-policy"))response.headers.set("x-middleware-request-content-security-policy",policy);
  return response;
}
