import { ClerkIncident } from "@/components/auth/clerk-incident";
export default async function IncidentPage({
  params,
}: {
  params: Promise<{ incidentId: string }>;
}) {
  const { incidentId } = await params;
  return <ClerkIncident incidentId={incidentId} />;
}
