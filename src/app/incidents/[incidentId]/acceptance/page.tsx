import { ClerkAcceptance } from "@/components/auth/clerk-acceptance";

export const metadata = { title: "BreachBay | Browser execution acceptance", robots: { index: false, follow: false } };
export default async function AcceptancePage({ params }: { params: Promise<{ incidentId: string }> }) {
  const { incidentId } = await params;
  return <ClerkAcceptance incidentId={incidentId} />;
}
