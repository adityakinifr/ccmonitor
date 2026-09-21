#!/usr/bin/env node
/**
 * PostToolUse hook: Records approved tool calls for adaptive learning
 * When a tool reaches PostToolUse, it means it was approved (either by user or autopilot)
 */

import { readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const BACKEND_URL = process.env.CCMONITOR_URL || 'http://localhost:3456';

interface HookInput {
  session_id: string;
  cwd?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
}

function getTaskFilePath(sessionId: string): string {
  return join(tmpdir(), `ccmonitor-task-${sessionId}`);
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

async function recordApproval(
  sessionId: string,
  taskId: string,
  toolName: string,
  toolInput: Record<string, unknown>,
  projectPath: string
): Promise<void> {
  try {
    await fetch(`${BACKEND_URL}/api/adaptive/record`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        taskId,
        toolName,
        toolInput,
        projectPath,
        decision: 'approved',
        source: 'user', // Inferred from reaching PostToolUse
      }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // Silently fail - don't block the tool execution
  }
}

async function main(): Promise<void> {
  try {
    const input = await readStdin();
    if (!input.trim()) {
      console.log('{}');
      process.exit(0);
    }

    const event = JSON.parse(input) as HookInput;
    const sessionId = event.session_id;

    if (!sessionId || !event.tool_name) {
      console.log('{}');
      process.exit(0);
    }

    // Get task ID from temp file
    const taskFile = getTaskFilePath(sessionId);
    if (!existsSync(taskFile)) {
      console.log('{}');
      process.exit(0);
    }

    const taskId = readFileSync(taskFile, 'utf8').trim();
    if (!taskId) {
      console.log('{}');
      process.exit(0);
    }

    // Record this as an approved tool call
    // Do this async - don't wait for it
    recordApproval(
      sessionId,
      taskId,
      event.tool_name,
      event.tool_input || {},
      event.cwd || ''
    );

    // Always output empty object - PostToolUse doesn't need any special output
    console.log('{}');
  } catch {
    console.log('{}');
  }
  process.exit(0);
}

main();
