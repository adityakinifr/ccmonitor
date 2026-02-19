#!/usr/bin/env node
/**
 * Claude Code Hook Forward Script
 * Receives hook events via stdin and forwards them to the ccmonitor backend.
 * Must be fast and reliable - hooks block Claude Code execution.
 */

const BACKEND_URL = process.env.CCMONITOR_URL || 'http://localhost:3456/api/events';

interface HookEvent {
  session_id: string;
  transcript_path: string;
  hook_event_name: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_response?: unknown;
  prompt?: string;
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
    // Handle case where stdin is empty or not available
    setTimeout(() => {
      if (data === '') {
        resolve('{}');
      }
    }, 100);
  });
}

async function forwardEvent(event: HookEvent): Promise<void> {
  try {
    const response = await fetch(BACKEND_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...event,
        timestamp: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(2000), // 2 second timeout
    });

    if (!response.ok) {
      console.error(`[ccmonitor] Failed to forward event: ${response.status}`);
    }
  } catch (error) {
    // Silently fail - don't block Claude Code if backend is down
    // Uncomment for debugging:
    // console.error('[ccmonitor] Error forwarding event:', error);
  }
}

async function main(): Promise<void> {
  try {
    const input = await readStdin();
    if (!input.trim()) {
      process.exit(0);
    }

    const event = JSON.parse(input) as HookEvent;
    await forwardEvent(event);
  } catch (error) {
    // Silently fail on parse errors
    // console.error('[ccmonitor] Error parsing event:', error);
  }
  process.exit(0);
}

main();
