import type { TokenUsage } from '../types/index.js';

// Pricing per million tokens (Anthropic first-party API rates, 2026)
// cacheWrite5m = 1.25x input, cacheWrite1h = 2x input, cacheRead = 0.1x input
interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
  cacheWrite5mPerMillion: number;
  cacheWrite1hPerMillion: number;
  cacheReadPerMillion: number;
}

function pricing(input: number, output: number): ModelPricing {
  return {
    inputPerMillion: input,
    outputPerMillion: output,
    cacheWrite5mPerMillion: input * 1.25,
    cacheWrite1hPerMillion: input * 2,
    cacheReadPerMillion: input * 0.1,
  };
}

// Ordered prefix match so dated variants (e.g. claude-haiku-4-5-20251001) resolve.
const MODEL_PRICING: Array<[string, ModelPricing]> = [
  ['claude-fable-5', pricing(10.0, 50.0)],
  ['claude-mythos-5', pricing(10.0, 50.0)],
  ['claude-opus-5', pricing(5.0, 25.0)],
  ['claude-opus-4-8', pricing(5.0, 25.0)],
  ['claude-opus-4-7', pricing(5.0, 25.0)],
  ['claude-opus-4-6', pricing(5.0, 25.0)],
  ['claude-opus-4-5', pricing(15.0, 75.0)],
  ['claude-sonnet-5', pricing(2.0, 10.0)],
  ['claude-sonnet-4-6', pricing(3.0, 15.0)],
  ['claude-sonnet-4', pricing(3.0, 15.0)],
  ['claude-haiku-4-5', pricing(1.0, 5.0)],
  ['claude-3-5-sonnet', pricing(3.0, 15.0)],
  ['claude-3-5-haiku', pricing(1.0, 5.0)],
];

// Unknown models are most likely new frontier models; opus-tier is the least-wrong guess.
const DEFAULT_PRICING = pricing(5.0, 25.0);

export function getPricing(model: string): ModelPricing {
  const match = MODEL_PRICING.find(([prefix]) => model.startsWith(prefix));
  return match ? match[1] : DEFAULT_PRICING;
}

export function calculateCost(model: string, usage: TokenUsage): number {
  const p = getPricing(model);

  // input_tokens = new tokens only (excludes cache)
  // cache_read_input_tokens = tokens read from cache (charged at lower rate)
  // cache_creation_input_tokens = tokens written to cache (charged at higher rate)
  const inputTokens = usage.input_tokens || 0;
  const outputTokens = usage.output_tokens || 0;
  const cacheWriteTokens = usage.cache_creation_input_tokens || 0;
  const cacheReadTokens = usage.cache_read_input_tokens || 0;

  // Cache writes bill by TTL: 1.25x input for 5m entries, 2x for 1h entries.
  // Claude Code uses the 1h cache, so default to 1h when the split is absent.
  const write5m = usage.cache_creation?.ephemeral_5m_input_tokens;
  const write1h = usage.cache_creation?.ephemeral_1h_input_tokens;
  let cacheWriteCost: number;
  if (write5m !== undefined || write1h !== undefined) {
    cacheWriteCost =
      ((write5m || 0) / 1_000_000) * p.cacheWrite5mPerMillion +
      ((write1h || 0) / 1_000_000) * p.cacheWrite1hPerMillion;
  } else {
    cacheWriteCost = (cacheWriteTokens / 1_000_000) * p.cacheWrite1hPerMillion;
  }

  const inputCost = (inputTokens / 1_000_000) * p.inputPerMillion;
  const outputCost = (outputTokens / 1_000_000) * p.outputPerMillion;
  const cacheReadCost = (cacheReadTokens / 1_000_000) * p.cacheReadPerMillion;

  return inputCost + outputCost + cacheWriteCost + cacheReadCost;
}

export function extractTokens(usage: TokenUsage): {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
  totalInput: number;
} {
  const inputTokens = usage.input_tokens || 0;
  const outputTokens = usage.output_tokens || 0;
  const cacheWrite = usage.cache_creation_input_tokens || 0;
  const cacheRead = usage.cache_read_input_tokens || 0;

  // Total input = new tokens + cache read tokens
  // (cache write tokens are part of input_tokens already)
  const totalInput = inputTokens + cacheRead;

  return {
    input: inputTokens,
    output: outputTokens,
    cacheWrite,
    cacheRead,
    totalInput,
  };
}
