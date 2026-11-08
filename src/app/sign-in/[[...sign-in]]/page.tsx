import { BreachBaySignIn } from "@/components/auth/sign-in";
import { Suspense } from "react";
export default function SignInPage() {
  return <Suspense fallback={<p role="status">Loading sign in…</p>}><BreachBaySignIn /></Suspense>;
}
