export const REAL_OPERATIONS = ["DISABLE_APPLICATION_LOGIN", "ENABLE_APPLICATION_LOGIN"] as const;
export type RealOperation = (typeof REAL_OPERATIONS)[number];
export interface ApplicationObservation {
  instanceId: string;
  version: number;
  loginEnabled: boolean;
  observedAt: string;
}
export interface ResponsePreview {
  kind: "PREVIEW";
  incidentId: string;
  connectorId: string;
  assetId: string;
  observation: ApplicationObservation;
  impact: string;
  limitation: string;
}
export interface ResponseReceipt {
  requestId: string;
  requestDigest: string;
  applied: boolean;
  code: "APPLIED" | "VERSION_CONFLICT";
  beforeVersion: number;
  afterVersion: number;
  instanceId: string;
  loginEnabled: boolean;
  recordedAt: string;
}
export interface ResponseResult {
  kind: "RESULT";
  incidentId: string;
  responseId: string;
  executionId: string;
  payloadDigest: string;
  connectorId: string;
  status: "VERIFIED_SUCCESS" | "VERIFIED_FAILED" | "UNCONFIRMED";
  receipt: ResponseReceipt | null;
  observation: ApplicationObservation | null;
  healthStatus: number | null;
  loginProbeStatus: number | null;
  observedAt: string;
}
export interface OperationalTarget {
  id: string; incidentId: string; connectorId: string; assetId: string;
  name: string; owner: string; criticality: string; active: boolean; version: number;
  instanceId: string; reviewedBy: string; reviewedAt: string;
}
export interface OperationalResponse {
  id: string; incidentId: string; targetId: string; operation: RealOperation;
  expectedTargetVersion: number; expectedStateVersion: number; instanceId: string;
  payloadDigest: string; previewJson: string; evidenceIds: string[];
  rationale: string; requestedBy: string; status: string; version: number;
  approvalBy?: string; approvalReason?: string; approvalExpiresAt?: string;
  executionId?: string; executionBy?: string; resultJson?: string;
  createdAt: string; updatedAt: string;
}
