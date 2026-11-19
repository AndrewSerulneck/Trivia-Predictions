/* The one OpenAI transport for question checks (docs/speed-trivia-backlog-and-quality-plan.md Phase 4f.2, D40).
 *
 * Responses API, strict JSON schema output, store:false (OpenAI keeps nothing for later use). No automatic retries:
 * every attempt is reserved on the caller's budget first and settled from reported usage, as the Gemini client did.
 * Prompts carry question DATA only; never a secret. Errors are short codes, never the provider's raw message.
 */
const ENDPOINT = 'https://api.openai.com/v1/responses';

// USD per 1M tokens, Standard tier (developers.openai.com/api/docs/pricing, read 2026-11-19). Output includes
// reasoning tokens. A model missing here can't be used: the budget must be able to price every call.
const RATES = Object.freeze({
  'gpt-5-nano': Object.freeze({ input: 0.05, output: 0.40 }),
  'gpt-6-luna': Object.freeze({ input: 0.10, output: 0.50 }),
  'gpt-4o-mini': Object.freeze({ input: 0.15, output: 0.60 }),
  'gpt-5.6-luna': Object.freeze({ input: 0.20, output: 1.20 }),
  'gpt-5.4-nano': Object.freeze({ input: 0.20, output: 1.25 }),
  'gpt-5-mini': Object.freeze({ input: 0.25, output: 2.00 }),
  'gpt-4.1-mini': Object.freeze({ input: 0.40, output: 1.60 }),
  'gpt-6.1-terra': Object.freeze({ input: 1.00, output: 5.00 }),
  'gpt-6.1-sol': Object.freeze({ input: 2.00, output: 10.00 }),
});

// The lowest reasoning setting each model accepts (probed 2026-11-19). null: not a reasoning model, so temperature 0.
const EFFORT = Object.freeze({
  'gpt-5-nano': 'minimal', 'gpt-5-mini': 'minimal',
  'gpt-6-luna': 'none', 'gpt-5.6-luna': 'none', 'gpt-5.4-nano': 'none', 'gpt-6.1-terra': 'none', 'gpt-6.1-sol': 'low',
  'gpt-4o-mini': null, 'gpt-4.1-mini': null,
});

const rateFor = model => {
  const rate = RATES[model];
  if (!rate) throw new Error('openai-unknown-model');
  return rate;
};

/** Dollars for reported usage. */
const priceOf = (model, inputTokens, outputTokens) => {
  const rate = rateFor(model);
  return (inputTokens * rate.input + outputTokens * rate.output) / 1e6;
};

/**
 * The reservation for one call. UTF-8 bytes conservatively upper-bound ordinary text tokens; `slack` covers the
 * request framing and the schema.
 */
const claimFor = ({ model, prompt, maxOutputTokens, slack = 2048 }) => {
  const inputTokens = Buffer.byteLength(prompt) + slack;
  return { dollars: priceOf(model, inputTokens, maxOutputTokens), inputTokens, outputTokens: maxOutputTokens, requests: 1 };
};

const outputText = data => (Array.isArray(data?.output) ? data.output : [])
  .filter(item => item?.type === 'message')
  .flatMap(item => (Array.isArray(item.content) ? item.content : []))
  .filter(part => part?.type === 'output_text')
  .map(part => part.text ?? '')
  .join('');
const refused = data => (Array.isArray(data?.output) ? data.output : [])
  .some(item => Array.isArray(item?.content) && item.content.some(part => part?.type === 'refusal'));

/**
 * One call. Returns { usage:{ inputTokens, outputTokens, reasoningTokens, dollars }, model, complete, text } so the
 * caller can settle its reservation BEFORE it rejects an incomplete reply (a truncated call is still billed).
 * Throws only when nothing was billed: network/timeout, HTTP error, or no usage reported.
 * A rate limit or server error (429/500/502/503/504) is retried up to `retries` times with backoff: OpenAI bills
 * nothing for those, and they come in short bursts. A timeout is never retried (it may have been billed), nor is
 * an exhausted quota (429 insufficient_quota), which no wait fixes.
 */
const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const waitFor = (response, attempt) => {
  const seconds = Number(response.headers?.get?.('retry-after'));
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds * 1000, 20_000) : [1000, 3000, 8000][attempt] ?? 8000;
};
const callJson = async ({ model, apiKey, prompt, schema, name = 'result', maxOutputTokens, timeoutMs = 60_000, transport = fetch, signal, retries = 2, sleep = pause }) => {
  rateFor(model);
  if (!apiKey) throw new Error('missing-OPENAI_API_KEY');
  if (!Number.isInteger(maxOutputTokens) || maxOutputTokens < 16 || maxOutputTokens > 32768) throw new Error('invalid-token-budget');
  const effort = EFFORT[model];
  const body = {
    model, input: prompt, store: false, max_output_tokens: maxOutputTokens,
    text: { format: { type: 'json_schema', name, strict: true, schema } },
    ...(effort ? { reasoning: { effort } } : { temperature: 0 }),
  };
  let response, data;
  for (let attempt = 0; ; attempt++) {
    try {
      response = await transport(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs),
        body: JSON.stringify(body),
      });
    } catch { throw new Error('openai-network-or-timeout'); }
    data = await response.json().catch(() => null);
    if (response.ok) break;
    const retryable = RETRY_STATUSES.has(response.status) && data?.error?.code !== 'insufficient_quota';
    if (!retryable || attempt >= retries || signal?.aborted) throw new Error(`openai-http-${response.status}`);
    await sleep(waitFor(response, attempt));
  }
  const usage = data?.usage;
  if (!usage || !Number.isSafeInteger(usage.input_tokens) || usage.input_tokens < 0
    || !Number.isSafeInteger(usage.output_tokens) || usage.output_tokens < 0) throw new Error('openai-missing-usage');
  const reasoningTokens = Number.isSafeInteger(usage.output_tokens_details?.reasoning_tokens) ? usage.output_tokens_details.reasoning_tokens : 0;
  return {
    usage: { inputTokens: usage.input_tokens, outputTokens: usage.output_tokens, reasoningTokens, dollars: priceOf(model, usage.input_tokens, usage.output_tokens) },
    model: typeof data.model === 'string' ? data.model : model,
    complete: data.status === 'completed' && !refused(data),
    text: outputText(data),
  };
};

/** The parsed JSON of a complete reply, or a short error code with `prefix` (e.g. 'semantic'). */
const jsonOf = (reply, prefix) => {
  if (!reply.complete) throw new Error(`${prefix}-truncated-or-blocked`);
  try { return JSON.parse(reply.text); } catch { throw new Error(`${prefix}-json-invalid`); }
};

module.exports = { ENDPOINT, RATES, EFFORT, rateFor, priceOf, claimFor, callJson, jsonOf };
