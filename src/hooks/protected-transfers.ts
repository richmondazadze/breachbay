import type { CommandResult } from "@/lib/contracts";
import type { EvidenceUploadCommand, ProtectedDownload } from "./use-incident";

export function evidenceForm(command: EvidenceUploadCommand): FormData {
  const form = new FormData();
  form.set("incidentId", command.incidentId);
  form.set("file", command.file);
  form.set("classification", "SYNTHETIC");
  form.set("modelApproved", String(command.modelApproved));
  form.set("title", command.title);
  if (command.capturedAt) form.set("capturedAt", command.capturedAt);
  form.set("idempotencyKey", command.idempotencyKey);
  form.set("correlationId", command.correlationId);
  return form;
}

export async function downloadResponse(response: Response, correlationId: string): Promise<CommandResult<ProtectedDownload>> {
  const disposition = response.headers.get("content-disposition");
  if (response.ok && disposition?.toLowerCase().startsWith("attachment;")) {
    const name = disposition.match(/filename="?([^";]+)"?/i)?.[1];
    return { ok: true, correlationId: response.headers.get("x-correlation-id") || correlationId,
      data: { blob: await response.blob(), filename: name?.replace(/[^a-zA-Z0-9._-]/g, "_") || "breachbay-download.bin" } };
  }
  if (response.headers.get("content-type")?.includes("application/json")) {
    const result = await response.json();
    if (result?.ok === false && result.error?.code && typeof result.error.message === "string" && typeof result.correlationId === "string") return result;
  }
  return { ok: false, correlationId, error: { code: "DEPENDENCY_UNAVAILABLE", message: "No authorized attachment was returned. Report outcome may be unknown; retry with the same key.", retryable: true } };
}

export function syntheticFile(file: File): File {
  if (!file.size || file.size > 256 * 1024) throw new Error("Choose a nonempty file up to 256 KiB.");
  const types: Record<string, string> = { txt: "text/plain", json: "application/json", csv: "text/csv" };
  const extension = file.name.split(".").pop()?.toLowerCase() || "";
  const type = types[extension];
  if (!type) throw new Error("Choose a synthetic UTF-8 .txt, .json or .csv file.");
  // Browsers disagree on CSV MIME. The server independently validates UTF-8 bytes.
  return new File([file], file.name, { type, lastModified: file.lastModified });
}
