#!/usr/bin/env node
/**
 * Claude Code Hook Installer
 * Installs/uninstalls ccmonitor hooks into Claude Code settings.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CLAUDE_SETTINGS_PATH = join(homedir(), '.claude', 'settings.json');
const FORWARD_SCRIPT_PATH = join(__dirname, 'forward.js');

interface HookConfig {
  type: string;
  command: string;
}

interface HookWithMatcher {
  matcher: string;
  hooks: HookConfig[];
}

type HookEventMap = {
  UserPromptSubmit: HookWithMatcher[];
  PreToolUse: HookWithMatcher[];
  PostToolUse: HookWithMatcher[];
  SessionStart: HookWithMatcher[];
  SessionEnd: HookWithMatcher[];
  [key: string]: HookWithMatcher[];
};

interface ClaudeSettings {
  hooks?: Partial<HookEventMap>;
  [key: string]: unknown;
}

const CCMONITOR_HOOKS: HookEventMap = {
  UserPromptSubmit: [
    {
      matcher: '*',
      hooks: [
        {
          type: 'command',
          command: `node "${FORWARD_SCRIPT_PATH}"`,
        },
      ],
    },
  ],
  PreToolUse: [
    {
      matcher: '*',
      hooks: [
        {
          type: 'command',
          command: `node "${FORWARD_SCRIPT_PATH}"`,
        },
      ],
    },
  ],
  PostToolUse: [
    {
      matcher: '*',
      hooks: [
        {
          type: 'command',
          command: `node "${FORWARD_SCRIPT_PATH}"`,
        },
      ],
    },
  ],
  SessionStart: [
    {
      matcher: '*',
      hooks: [
        {
          type: 'command',
          command: `node "${FORWARD_SCRIPT_PATH}"`,
        },
      ],
    },
  ],
  SessionEnd: [
    {
      matcher: '*',
      hooks: [
        {
          type: 'command',
          command: `node "${FORWARD_SCRIPT_PATH}"`,
        },
      ],
    },
  ],
};

function loadSettings(): ClaudeSettings {
  if (!existsSync(CLAUDE_SETTINGS_PATH)) {
    return {};
  }
  try {
    const content = readFileSync(CLAUDE_SETTINGS_PATH, 'utf8');
    return JSON.parse(content) as ClaudeSettings;
  } catch {
    return {};
  }
}

function saveSettings(settings: ClaudeSettings): void {
  const dir = dirname(CLAUDE_SETTINGS_PATH);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(CLAUDE_SETTINGS_PATH, JSON.stringify(settings, null, 2));
}

function isOurHook(hook: HookConfig): boolean {
  return hook.command?.includes('ccmonitor') || hook.command?.includes(FORWARD_SCRIPT_PATH);
}

function isOurMatcherHook(matcherEntry: HookWithMatcher): boolean {
  return matcherEntry.hooks.some((hook) => isOurHook(hook));
}

function install(): void {
  console.log('Installing ccmonitor hooks...');

  const settings = loadSettings();
  settings.hooks = settings.hooks || {};

  for (const [eventName, hooks] of Object.entries(CCMONITOR_HOOKS)) {
    // All hooks now use the matcher-based format
    const existingHooks = (settings.hooks[eventName] as HookWithMatcher[]) || [];

    // Remove any existing ccmonitor matcher hooks
    const filteredHooks = existingHooks.filter((h) => !isOurMatcherHook(h));

    // Add our hooks
    settings.hooks[eventName] = [...filteredHooks, ...(hooks as HookWithMatcher[])];
  }

  saveSettings(settings);
  console.log('Hooks installed successfully!');
  console.log(`Settings file: ${CLAUDE_SETTINGS_PATH}`);
  console.log('\nInstalled hooks for:');
  console.log('  - UserPromptSubmit');
  console.log('  - PreToolUse (all tools)');
  console.log('  - PostToolUse (all tools)');
  console.log('  - SessionStart');
  console.log('  - SessionEnd');
  console.log('\nMake sure the ccmonitor server is running on http://localhost:3456');
}

function uninstall(): void {
  console.log('Uninstalling ccmonitor hooks...');

  const settings = loadSettings();
  if (!settings.hooks) {
    console.log('No hooks found.');
    return;
  }

  for (const eventName of Object.keys(CCMONITOR_HOOKS)) {
    // All hooks now use the matcher-based format
    const existingHooks = (settings.hooks[eventName] as HookWithMatcher[]) || [];
    settings.hooks[eventName] = existingHooks.filter((h) => !isOurMatcherHook(h));

    // Remove empty arrays
    if ((settings.hooks[eventName] as HookWithMatcher[]).length === 0) {
      delete settings.hooks[eventName];
    }
  }

  saveSettings(settings);
  console.log('Hooks uninstalled successfully!');
}

function status(): void {
  console.log('Checking ccmonitor hook status...\n');

  const settings = loadSettings();
  if (!settings.hooks) {
    console.log('No hooks configured.');
    return;
  }

  let hasOurHooks = false;
  for (const eventName of Object.keys(CCMONITOR_HOOKS)) {
    // All hooks now use the matcher-based format
    const hooks = (settings.hooks[eventName] as HookWithMatcher[]) || [];
    const ourHooks = hooks.filter((h) => isOurMatcherHook(h));
    if (ourHooks.length > 0) {
      console.log(`  ${eventName}: installed`);
      hasOurHooks = true;
    }
  }

  if (!hasOurHooks) {
    console.log('ccmonitor hooks are not installed.');
    console.log('Run: npm run install-hooks');
  }
}

// CLI
const command = process.argv[2] || 'install';

switch (command) {
  case 'install':
    install();
    break;
  case 'uninstall':
    uninstall();
    break;
  case 'status':
    status();
    break;
  default:
    console.log('Usage: install.js [install|uninstall|status]');
    process.exit(1);
}
