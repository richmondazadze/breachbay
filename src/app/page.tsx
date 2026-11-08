import type { Metadata } from "next";
import { BreachBayLanding } from "@/components/landing/breachbay-landing";
import "@/components/landing/landing.css";
export const metadata: Metadata = {
  title: "BreachBay — Investigate the breach. Decide with evidence.",
  description: "A shared workspace for investigating simulated cyber incidents, previewing response tradeoffs, and keeping humans in control.",
};
export default function Page() {
  return <BreachBayLanding />;
}
