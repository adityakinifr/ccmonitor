#!/usr/bin/env node
/**
 * SessionEnd hook: removes task from dashboard when session exits
 */

import { readFileSync, existsSync, unlinkSync } from 'fs';
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

async function deleteTask(taskId: string): Promise<void> {
  try {
    await fetch(`${BACKEND_URL}/api/tasks/${taskId}`, {
      method: 'DELETE',
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
    if (taskId) {
      await deleteTask(taskId);
    }

    // Clean up the temp file
    try {
      unlinkSync(taskFile);
    } catch {
      // Ignore errors
    }
  } catch {
    // Silently fail
  }
  process.exit(0);
}

main();
