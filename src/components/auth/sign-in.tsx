"use client";
import { SignIn, SignUp } from "@clerk/nextjs";

export function BreachBaySignIn({ creatingAccount = false }: { creatingAccount?: boolean }) {
  return (
    <main className="auth-page">
      <a className="brand" href="/">
        <img
          className="harbor-mark"
          src="/brand/harbor.svg"
          width="36"
          height="36"
          alt=""
        />
        BreachBay.
      </a>
      <div className="auth-grid">
        <section>
          <div className="eyebrow">Your incident workspace</div>
          <h1>{creatingAccount ? "Create your responder account" : "Sign in to BreachBay"}</h1>
          <p>
            {creatingAccount ? "Create your BreachBay account, verify your email, and join your team’s incident workspace." : "Use your responder account to access the incidents assigned to you."}
          </p>
          <div className="independent">
            <span>
              Separate from corporate SSO
              <small>Incident access is granted by your commander.</small>
            </span>
          </div>
          <p className="small muted">
            Your account identifies you. Your incident role determines what you
            can review, approve and execute.
          </p>
          <p>
            <a className="button button-outline" href={creatingAccount ? "/sign-in" : "/sign-up"}>
              {creatingAccount ? "Already have an account? Sign in" : "New responder? Create an account"}
            </a>
          </p>
          <a className="text-button" href="/">
            Explore BreachBay →
          </a>
        </section>
        <section className="auth-card" aria-label={creatingAccount ? "Responder account creation" : "Responder sign in"}>
          {process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ? (
            creatingAccount ? <SignUp
              routing="path" path="/sign-up" signInUrl="/sign-in"
              fallbackRedirectUrl="/command" signInFallbackRedirectUrl="/command"
              fallback={<p role="status">Loading account creation…</p>}
            /> : <SignIn
              routing="path" path="/sign-in" signUpUrl="/sign-up"
              withSignUp={false} fallbackRedirectUrl="/command" signUpFallbackRedirectUrl="/command"
              fallback={<p role="status">Loading sign in…</p>}
            />
          ) : (
            <div className="decision-body">
              <h2>Responder authentication is not configured</h2>
              <p>
                A dedicated BreachBay Clerk application must be configured
                before responder login is available.
              </p>
              <p className="small muted">
                Live authentication and database JWT acceptance have not been
                verified.
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
