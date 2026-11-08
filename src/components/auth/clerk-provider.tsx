"use client";
import { useTheme } from "../theme";
import { ClerkProvider } from "@clerk/nextjs";
export function BreachBayIdentityProvider({
  children,
  nonce,
}: {
  children: React.ReactNode;
  nonce?: string;
}) {
  const { theme } = useTheme();
  const key = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (!key) return children;
  return (
    <ClerkProvider
      publishableKey={key}
      dynamic
      nonce={nonce}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signUpFallbackRedirectUrl="/command"
      afterSignOutUrl="/sign-in"
      signInFallbackRedirectUrl="/command"
      appearance={{
        variables: {
          colorPrimary: theme === "light" ? "#0059EB" : "#7CA4FF",
          colorBackground: theme === "light" ? "#ffffff" : "#242422",
          colorForeground: theme === "light" ? "#1E1E1C" : "#ffffff",
          colorMutedForeground: theme === "light" ? "#62625E" : "#b9b9b3",
          borderRadius: "6px",
          fontFamily: "Switzer, Arial, sans-serif",
          fontFamilyButtons: "Switzer, Arial, sans-serif",
        },
      }}
    >
      {children}
    </ClerkProvider>
  );
}
