/** Configuration presence only; never reveals values or claims upstream connectivity. */
export function deploymentReadiness(env: Record<string,string|undefined>) {
  const configured=(...keys:string[])=>keys.every(k=>Boolean(env[k]?.trim()));
  const dependencies={
    authentication:configured("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY","CLERK_SECRET_KEY","CLERK_ISSUER_URL"),
    backend:Boolean((env.SPACETIMEDB_ENDPOINT || env.NEXT_PUBLIC_SPACETIMEDB_ENDPOINT)?.trim() && (env.SPACETIMEDB_DATABASE || env.NEXT_PUBLIC_SPACETIMEDB_DATABASE)?.trim()),
    inference:configured("NEMOTRON_API_KEY","NEMOTRON_BASE_URL","NEMOTRON_MODEL"),
    serviceIdentity:configured("AI_SERVICE_CLERK_SESSION_ID","AI_SERVICE_CLERK_USER_ID") || configured("AI_SERVICE_ID_TOKEN"),
    evidenceStorage:configured("EVIDENCE_STORAGE_DIR"),
  };
  return {ready:Object.values(dependencies).every(Boolean),dependencies,version:"0.1.0",spacetimeVersion:"2.14.1"};
}
