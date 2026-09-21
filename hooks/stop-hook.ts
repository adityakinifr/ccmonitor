#!/usr/bin/env node
/**
 * Stop hook: marks task as "done" when Claude session stops
 */

import { readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const BACKEND_URL = process.env.CCMONITOR_URL || 'http://localhost:3456';

interface HookInput {
  session_id: string;
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

async function completeTask(taskId: string): Promise<void> {
  try {
    await fetch(`${BACKEND_URL}/api/tasks/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId }),
      signal: AbortSignal.timeout(2000),
    });
  } catch {
    // Silently fail
  }
}

async function main(): Promise<void> {
  try {
    const input = await readStdin();
    if (!input.trim()) {
      process.exit(0);
    }

    const event = JSON.parse(input) as HookInput;
    const sessionId = event.session_id;

    if (!sessionId) {
      process.exit(0);
    }

    const taskFile = getTaskFilePath(sessionId);
    if (!existsSync(taskFile)) {
      process.exit(0);
    }

    const taskId = readFileSync(taskFile, 'utf8').trim();
    if (!taskId) {
      process.exit(0);
    }

    await completeTask(taskId);
    // Do NOT delete temp file — SessionEnd needs it to clean up the task
  } catch {
    // Silently fail
  }
  process.exit(0);
}

main();
