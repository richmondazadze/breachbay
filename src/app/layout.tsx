import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import { ThemeProvider } from "@/components/theme";
import { BreachBayIdentityProvider } from "@/components/auth/clerk-provider";
import { connection } from "next/server";
import { headers } from "next/headers";
import { Suspense } from "react";
import type { Metadata } from "next";
import "./globals.css";
import "./brand-fonts.css";
import "@/components/premium-workspace.css";
export const metadata: Metadata = {
  title: "BreachBay | Incident command",
  description: "Investigate source logs together, review cited AI findings, and verify approved application responses. AI investigates. Humans stay in control.",
  openGraph: {
    title: "BreachBay — Investigate the breach. Decide with evidence.",
    description: "A shared incident workspace with cited AI investigations, response previews and human approval.",
    siteName: "BreachBay",
    type: "website",
  },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "48x48" },
    ],
    apple: "/apple-touch-icon.png",
  },
  manifest: "/site.webmanifest",
  metadataBase: new URL("https://breachbay.us"),
};
export const viewport = { themeColor: "#FFFFFF" };
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <Suspense><BreachBayDocument>{children}</BreachBayDocument></Suspense>;
}
async function BreachBayDocument({children}: {children: React.ReactNode}) {
  await connection();
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="en" data-theme="light">
      <body>
        <ThemeProvider>
          <BreachBayIdentityProvider nonce={nonce}>{children}</BreachBayIdentityProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
