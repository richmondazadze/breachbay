import { deploymentReadiness } from "../../../lib/backend/deployment-readiness";
export const runtime="nodejs";
export async function GET() {
  return Response.json(deploymentReadiness(process.env),{headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
}
