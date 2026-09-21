#!/usr/bin/env node
/**
 * Haiku Suggestion Hook
 * Analyzes user prompts and suggests using Haiku model for simple tasks.
 * Outputs a user-facing message when a simpler model would suffice.
 */

interface HookInput {
  hook_event_name: string;
  prompt?: string;
  tool_name?: string;
}

interface HookOutput {
  message?: string;
}

// Patterns that indicate simple tasks suitable for Haiku
const SIMPLE_PATTERNS = [
  /^(what|where|how|which|when|why) (is|are|do|does|did|was|were)\b/i,
  /^(show|list|find|get|check|look|tell) (me|us)?\b/i,
  /^(can you |could you )?(explain|describe|summarize)\b/i,
  /\?$/,  // Questions
  /^(hi|hello|hey|thanks|thank you|ok|okay)\b/i,  // Greetings/acknowledgments
];

// Patterns that indicate complex tasks requiring Opus
const COMPLEX_PATTERNS = [
  /\b(implement|create|build|develop|write|add|fix|refactor|debug)\b/i,
  /\b(change|modify|update|edit|replace)\b.*\b(code|file|function|class)\b/i,
  /\bplan\b/i,
  /\bpr\b|\bpull request\b/i,
  /\bcommit\b/i,
  /\btest(s|ing)?\b/i,
];

// Word count threshold - very short prompts are often simple
const SHORT_PROMPT_THRESHOLD = 15;

function isSimpleTask(prompt: string): boolean {
  // Check if it matches complex patterns first
  for (const pattern of COMPLEX_PATTERNS) {
    if (pattern.test(prompt)) {
      return false;
    }
  }

  // Check for simple patterns
  for (const pattern of SIMPLE_PATTERNS) {
    if (pattern.test(prompt)) {
      return true;
    }
  }

  // Very short prompts are often simple queries
  const wordCount = prompt.trim().split(/\s+/).length;
  if (wordCount <= SHORT_PROMPT_THRESHOLD && !COMPLEX_PATTERNS.some(p => p.test(prompt))) {
    return true;
  }

  return false;
}

async function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => {
      resolve(data);
    });
    setTimeout(() => {
      if (data === '') resolve('{}');
    }, 100);
  });
}

async function main(): Promise<void> {
  try {
    const input = await readStdin();
    if (!input.trim()) {
      process.exit(0);
    }

    const event = JSON.parse(input) as HookInput;

    // Only process UserPromptSubmit events
    if (event.hook_event_name !== 'UserPromptSubmit' || !event.prompt) {
      process.exit(0);
    }

    if (isSimpleTask(event.prompt)) {
      const output: HookOutput = {
        message: "Tip: For simple queries like this, consider using `claude --model haiku` to save cost and get faster responses."
      };
      console.log(JSON.stringify(output));
    }
  } catch (error) {
    // Silently fail
  }
  process.exit(0);
}

main();
