import { Suspense } from "react";
import { BreachBaySignIn } from "@/components/auth/sign-in";
export default function SignUpPage() {
  return <Suspense fallback={<p role="status">Loading account creation…</p>}><BreachBaySignIn creatingAccount /></Suspense>;
}
