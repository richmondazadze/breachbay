import type { ProviderCallEventData } from '../contracts';

type ReportedUsage = Pick<ProviderCallEventData, 'usageSource' | 'promptTokens' | 'completionTokens' | 'totalTokens'>;
/** Vendor fields are observations only. Never copy arbitrary usage/body keys or invent counts/pricing. */
export function reportedProviderUsage(value: unknown): ReportedUsage {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { usageSource: 'unavailable' };
  const raw = value as Record<string, unknown>;
  const counts: Omit<ReportedUsage, 'usageSource'> = {};
  for (const [vendor, field] of [['prompt_tokens', 'promptTokens'], ['completion_tokens', 'completionTokens'], ['total_tokens', 'totalTokens']] as const) {
    const count = raw[vendor];
    if (typeof count === 'number' && Number.isSafeInteger(count) && count >= 0 && count <= 10000000) counts[field] = count;
  }
  // An inconsistent total is unavailable; independently valid component counts remain vendor observations.
  if (counts.totalTokens !== undefined && counts.totalTokens < (counts.promptTokens ?? 0) + (counts.completionTokens ?? 0)) delete counts.totalTokens;
  return { usageSource: Object.keys(counts).length ? 'reported' : 'unavailable', ...counts };
}

export function providerFinishReason(value: unknown): ProviderCallEventData['finishReason'] {
  return ['stop', 'tool_calls', 'length', 'content_filter', 'function_call'].includes(value as string)
    ? value as ProviderCallEventData['finishReason'] : 'unknown';
}
