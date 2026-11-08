import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialModelMessages, ULTRA_MODEL } from '../../src/lib/ai/provider-profile';
test('Ultra uses sole official reasoning-off control and preserves trusted task rules', () => {
  const messages = initialModelMessages(ULTRA_MODEL, 'Trusted allowlisted tool rules', '{"objective":"Synthetic investigation"}');
  assert.deepEqual(messages[0], { role: 'system', content: 'detailed thinking off' });
  assert.equal(messages.filter(m => m.role === 'system').length, 1);
  assert(messages[1].content?.includes('Trusted allowlisted tool rules'));
  assert(messages[1].content?.includes('Synthetic investigation'));
  assert(messages[1].content?.includes('untrusted data'));
});
test('other model profiles keep existing instruction placement and attribution', () => {
  assert.deepEqual(initialModelMessages('other-explicit-model', 'Trusted rules', '{}'), [{ role: 'system', content: 'Trusted rules' }, { role: 'user', content: '{}' }]);
});

test('known Nano3 aliases request nonstreaming thinking-off without rewriting attribution', async () => {
  const { providerRequestOptions } = await import('../../src/lib/ai/provider-profile');
  for (const model of ['nvidia/nemotron-nano-3-30b-a3b', 'nvidia/nemotron-3-nano-30b-a3b']) {
    assert.deepEqual(providerRequestOptions(model), { stream: false, temperature: 0, max_tokens: 2000, chat_template_kwargs: { enable_thinking: false } });
  }
  assert.deepEqual(providerRequestOptions(ULTRA_MODEL), { stream: false, temperature: 0, max_tokens: 2000 });
});

test('exact Lightning gets bounded 4096 cap and compact complete JSON guidance with documented Lightning reasoning-off', async () => {
  const { providerRequestOptions, LIGHTNING_MODEL, CONCISE_FINAL_GUIDANCE } = await import('../../src/lib/ai/provider-profile');
  const options = providerRequestOptions(LIGHTNING_MODEL);
  assert.deepEqual(options, { stream: false, temperature: 0, max_tokens: 4096, chat_template_kwargs: { enable_thinking: false } });
  assert(!('reasoning_budget' in options)); assert(!('response_format' in options));
  const messages = initialModelMessages(LIGHTNING_MODEL, 'Trusted citation and tool rules', '{}');
  assert(messages[0].content?.includes(CONCISE_FINAL_GUIDANCE));
  assert(messages[0].content?.includes('Trusted citation and tool rules'));
  assert(messages[0].content?.includes('required fields'));
  assert.equal(providerRequestOptions('other-explicit-model').max_tokens, 2000);
});

test('native final JSON profile is exact-Lightning only; normal tool profiles are unchanged', async () => {
  const { providerRequestOptions, LIGHTNING_MODEL } = await import('../../src/lib/ai/provider-profile');
  assert.deepEqual(providerRequestOptions(LIGHTNING_MODEL, 'final_json'), { stream: false, temperature: 0, max_tokens: 4096, chat_template_kwargs: { enable_thinking: false }, response_format: { type: 'json_object' } });
  for (const model of [ULTRA_MODEL, 'other-explicit-model', 'nvidia/nemotron-nano-3-30b-a3b']) {
    assert.deepEqual(providerRequestOptions(model, 'final_json'), providerRequestOptions(model));
  }
});
