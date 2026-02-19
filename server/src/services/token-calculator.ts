import type { TokenUsage } from '../types/index.js';

// Pricing per million tokens (as of 2024)
const MODEL_PRICING: Record<string, {
  inputPerMillion: number;
  outputPerMillion: number;
  cacheWritePerMillion: number;
  cacheReadPerMillion: number;
}> = {
  'claude-opus-4-5-20251101': {
    inputPerMillion: 15.00,
    outputPerMillion: 75.00,
    cacheWritePerMillion: 18.75,
    cacheReadPerMillion: 1.50,
  },
  'claude-sonnet-4-20250514': {
    inputPerMillion: 3.00,
    outputPerMillion: 15.00,
    cacheWritePerMillion: 3.75,
    cacheReadPerMillion: 0.30,
  },
  'claude-3-5-sonnet-20241022': {
    inputPerMillion: 3.00,
    outputPerMillion: 15.00,
    cacheWritePerMillion: 3.75,
    cacheReadPerMillion: 0.30,
  },
  'claude-3-5-haiku-20241022': {
    inputPerMillion: 1.00,
    outputPerMillion: 5.00,
    cacheWritePerMillion: 1.25,
    cacheReadPerMillion: 0.10,
  },
  // Default fallback pricing
  default: {
    inputPerMillion: 3.00,
    outputPerMillion: 15.00,
    cacheWritePerMillion: 3.75,
    cacheReadPerMillion: 0.30,
  },
};

export function calculateCost(model: string, usage: TokenUsage): number {
  const pricing = MODEL_PRICING[model] || MODEL_PRICING.default;

  // input_tokens = new tokens only (excludes cache)
  // cache_read_input_tokens = tokens read from cache (charged at lower rate)
  // cache_creation_input_tokens = tokens written to cache (charged at higher rate)
  const inputTokens = usage.input_tokens || 0;
  const outputTokens = usage.output_tokens || 0;
  const cacheWriteTokens = usage.cache_creation_input_tokens || 0;
  const cacheReadTokens = usage.cache_read_input_tokens || 0;

  // Input cost for new tokens (full rate)
  const inputCost = (inputTokens / 1_000_000) * pricing.inputPerMillion;

  // Output cost
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPerMillion;

  // Cache costs
  const cacheWriteCost = (cacheWriteTokens / 1_000_000) * pricing.cacheWritePerMillion;
  const cacheReadCost = (cacheReadTokens / 1_000_000) * pricing.cacheReadPerMillion;

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
