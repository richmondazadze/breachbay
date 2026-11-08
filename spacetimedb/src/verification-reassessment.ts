/** Human follow-up only. A deterministic success never queues reassessment or calls inference. */
export function verificationReassessment(status: "VERIFIED_SUCCESS" | "VERIFIED_PARTIAL" | "VERIFIED_FAILED", verificationId: string, proposalId: string) {
  if (status === "VERIFIED_SUCCESS") return undefined;
  return { title: "Reassess synthetic response mismatch", state: "TODO", detail: { verificationId, proposalId, status, humanReviewRequired: true, guidance: "Inspect mismatch, refresh evidence, rerun investigation." } };
}
