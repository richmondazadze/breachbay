import type { Metadata } from "next";
import { BreachBayLanding } from "@/components/landing/breachbay-landing";
import "@/components/landing/landing.css";
import "@/components/landing/recorded-walkthrough.css";
export const metadata: Metadata = {
  title: "BreachBay — Investigate the breach. Decide with evidence.",
  description: "A shared workspace for investigating source logs, reviewing application responses, and independently verifying their effects.",
};
export default function Page() {
  return <BreachBayLanding />;
}
