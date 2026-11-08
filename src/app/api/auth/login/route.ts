import { authConfig } from "../../../../lib/backend/oidc";
import { authFailure } from "../../../../lib/backend/http";
export async function GET() {
  try {
    return Response.redirect(`${authConfig().origin}/sign-in`, 302);
  } catch (error) {
    return authFailure(error);
  }
}
