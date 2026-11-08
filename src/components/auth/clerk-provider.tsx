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
          colorPrimary: theme === "light" ? "#0a705a" : "#27d6b0",
          colorBackground: theme === "light" ? "#ffffff" : "#152125",
          colorForeground: theme === "light" ? "#122321" : "#f3f1e9",
          colorMutedForeground: theme === "light" ? "#4c625c" : "#a8b6b6",
          borderRadius: "0px",
          fontFamily: "IBM Plex Sans, Arial, sans-serif",
          fontFamilyButtons: "IBM Plex Sans, Arial, sans-serif",
        },
      }}
    >
      {children}
    </ClerkProvider>
  );
}
