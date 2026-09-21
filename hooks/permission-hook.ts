#!/usr/bin/env node
/**
 * PermissionRequest hook: auto-approves permission dialogs when autopilot is on
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

async function checkAutopilot(taskId: string): Promise<boolean> {
  try {
    const response = await fetch(`${BACKEND_URL}/api/tasks/autopilot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId, check: '1' }),
      signal: AbortSignal.timeout(2000),
    });

    if (response.ok) {
      const data = await response.json() as { allow: boolean };
      return data.allow;
    }
  } catch {
    // Silently fail
  }
  return false;
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

    if (!sessionId) {
      console.log('{}');
      process.exit(0);
    }

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

    // Check autopilot status
    const allowed = await checkAutopilot(taskId);

    if (allowed) {
      console.log('{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"allow"}}}');
    } else {
      console.log('{}');
    }
  } catch {
    console.log('{}');
  }
  process.exit(0);
}

main();
