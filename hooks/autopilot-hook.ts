#!/usr/bin/env node
/**
 * PreToolUse hook: auto-registers session as task + checks autopilot/adaptive mode
 * Self-contained — does NOT depend on SessionStart hook
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { homedir, tmpdir } from 'os';
import { join, basename, dirname } from 'path';
import { execSync } from 'child_process';

const BACKEND_URL = process.env.CCMONITOR_URL || 'http://localhost:3456';

interface HookInput {
  session_id: string;
  cwd?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
}

interface AdaptiveCheckResult {
  decision: 'allow' | 'deny' | 'ask';
  reason: string;
  isDangerous?: boolean;
  whatsappUsed?: boolean;
}

function getTaskFilePath(sessionId: string): string {
  return join(tmpdir(), `ccmonitor-task-${sessionId}`);
}

function getMachine(): string {
  const machineFile = join(homedir(), '.ccmonitor-machine');
  if (existsSync(machineFile)) {
    return readFileSync(machineFile, 'utf8').trim();
  }
  return 'unknown';
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

async function registerTask(sessionId: string, machine: string, cwd: string): Promise<string | null> {
  try {
    const response = await fetch(`${BACKEND_URL}/api/tasks/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, machine, cwd }),
      signal: AbortSignal.timeout(3000),
    });

    if (response.ok) {
      const data = await response.json() as { taskId: string };
      return data.taskId;
    }
  } catch {
    // Silently fail
  }
  return null;
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

async function checkAdaptive(
  taskId: string,
  sessionId: string,
  toolName: string,
  toolInput: Record<string, unknown>,
  projectPath: string
): Promise<AdaptiveCheckResult> {
  try {
    // Use WhatsApp endpoint which waits for WhatsApp response if enabled
    // Timeout is 6 minutes to allow for WhatsApp response (default timeout is 5 min)
    const response = await fetch(`${BACKEND_URL}/api/adaptive/check-whatsapp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId, sessionId, toolName, toolInput, projectPath }),
      signal: AbortSignal.timeout(360000), // 6 minutes to allow for WhatsApp timeout
    });

    if (response.ok) {
      return await response.json() as AdaptiveCheckResult;
    }
  } catch {
    // Silently fail - fall back to asking
  }
  return { decision: 'ask', reason: 'Adaptive check failed' };
}

function injectKeystroke(toolName: string): void {
  // Only inject keystroke for tools that wait on user input
  if (toolName === 'AskUserQuestion' || toolName === 'ExitPlanMode') {
    try {
      // Find the TTY that Claude Code is reading from
      const ppid = process.ppid;
      const fdPath = `/proc/${ppid}/fd/0`;
      const tty = execSync(`readlink -f ${fdPath} 2>/dev/null`, { encoding: 'utf8' }).trim();

      if (tty.includes('/dev/pts/') || tty.includes('/dev/tty')) {
        // Inject "1" keystroke after a short delay
        setTimeout(() => {
          try {
            execSync(`printf '1\\n' > "${tty}"`, { stdio: 'ignore' });
          } catch {
            // Ignore errors
          }
        }, 500);
      }
    } catch {
      // Ignore errors - not all systems support this
    }
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

    if (!sessionId) {
      console.log('{}');
      process.exit(0);
    }

    const taskFile = getTaskFilePath(sessionId);
    let taskId: string | null = null;

    // If no task file yet, register this session (first tool call)
    if (!existsSync(taskFile)) {
      const machine = getMachine();
      const cwd = event.cwd || '';
      taskId = await registerTask(sessionId, machine, cwd);

      if (taskId) {
        mkdirSync(dirname(taskFile), { recursive: true });
        writeFileSync(taskFile, taskId);
      } else {
        console.log('{}');
        process.exit(0);
      }
    } else {
      taskId = readFileSync(taskFile, 'utf8').trim();
    }

    if (!taskId) {
      console.log('{}');
      process.exit(0);
    }

    // Check autopilot status first (overrides adaptive)
    const autopilotAllowed = await checkAutopilot(taskId);

    if (autopilotAllowed) {
      // Inject keystroke for tools that wait on user input
      if (event.tool_name) {
        injectKeystroke(event.tool_name);
      }
      console.log('{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow"}}');
      process.exit(0);
    }

    // Check adaptive mode if autopilot is not enabled
    if (event.tool_name) {
      const adaptiveResult = await checkAdaptive(
        taskId,
        sessionId,
        event.tool_name,
        event.tool_input || {},
        event.cwd || ''
      );

      if (adaptiveResult.decision === 'allow') {
        injectKeystroke(event.tool_name);
        console.log('{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow"}}');
        process.exit(0);
      }

      if (adaptiveResult.decision === 'deny') {
        // Explicit denial (from WhatsApp timeout or deny response)
        console.log('{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny"}}');
        process.exit(0);
      }

      // If decision is 'ask' - let user decide (no WhatsApp or no match)
    }

    console.log('{}');
  } catch {
    console.log('{}');
  }
  process.exit(0);
}

main();
