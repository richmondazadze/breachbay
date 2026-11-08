/** Tool traces describe exact model argument bytes; never substitute a call identifier hash. */
export function validatedToolArgumentsDigest(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value))
    throw new Error("INVALID_MODEL_OUTPUT");
  return value;
}
