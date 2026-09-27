#!/usr/bin/env node
/**
 * Optional: run ccmonitor automatically at login (macOS).
 *
 * Collection does not depend on this -- the Claude Code hooks are installed
 * separately and keep recording regardless. This only decides whether the
 * server and dashboard come up on their own, so the dashboard is there when
 * you want it and hook events aren't dropped while nothing is listening.
 *
 *   node scripts/autostart.mjs install | uninstall | status
 */

import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';

const LABEL = 'com.ccmonitor.agent';
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PLIST = join(homedir(), 'Library', 'LaunchAgents', `${LABEL}.plist`);
const LOG_DIR = join(homedir(), 'Library', 'Logs');
const LOG = join(LOG_DIR, 'ccmonitor.log');
const TARGET = `gui/${process.getuid()}/${LABEL}`;

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function requireMacOS() {
  if (process.platform !== 'darwin') {
    fail(`Login auto-start uses launchd and only works on macOS (this is ${process.platform}).`);
  }
}

/** launchctl, tolerating the non-zero exit it returns for "not loaded". */
function launchctl(args, { check = true } = {}) {
  try {
    // stderr is captured, not inherited: `print` on a missing service is a
    // normal negative answer here, not something to print at the user.
    return {
      ok: true,
      out: execFileSync('launchctl', args, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim(),
    };
  } catch (error) {
    if (check) throw error;
    return { ok: false, out: (error.stdout || error.stderr || '').toString().trim() };
  }
}

function isLoaded() {
  return launchctl(['print', TARGET], { check: false }).ok;
}

function escapeXml(value) {
  return value.replace(/[<>&'"]/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]
  );
}

function buildPlist() {
  // launchd starts with a bare PATH, so npm and the node it runs on have to be
  // found explicitly. process.execPath is whichever node is running this --
  // including an nvm one, whose path is version-specific. That version is
  // baked in here, so a node upgrade means re-running `install`.
  const nodeBin = dirname(process.execPath);
  const npm = join(nodeBin, 'npm');
  if (!existsSync(npm)) {
    fail(`Could not find npm next to node at ${nodeBin}. Run this with the node you use for ccmonitor.`);
  }
  const path = `${nodeBin}:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>

  <key>ProgramArguments</key>
  <array>
    <string>${escapeXml(npm)}</string>
    <string>run</string>
    <string>dev</string>
  </array>

  <key>WorkingDirectory</key>
  <string>${escapeXml(REPO)}</string>

  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${escapeXml(path)}</string>
  </dict>

  <key>RunAtLoad</key>
  <true/>

  <!-- Restart if it crashes, but respect a deliberate stop. -->
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>

  <key>StandardOutPath</key>
  <string>${escapeXml(LOG)}</string>
  <key>StandardErrorPath</key>
  <string>${escapeXml(LOG)}</string>
</dict>
</plist>
`;
}

function install() {
  requireMacOS();
  mkdirSync(dirname(PLIST), { recursive: true });
  mkdirSync(LOG_DIR, { recursive: true });

  if (isLoaded()) {
    console.log('Replacing the existing agent...');
    launchctl(['bootout', TARGET], { check: false });
  }

  writeFileSync(PLIST, buildPlist());

  // bootstrap is the modern form; load -w covers older macOS.
  if (!launchctl(['bootstrap', `gui/${process.getuid()}`, PLIST], { check: false }).ok) {
    if (!launchctl(['load', '-w', PLIST], { check: false }).ok) {
      fail(`Could not load the agent. Inspect ${PLIST} and try: launchctl bootstrap gui/$(id -u) "${PLIST}"`);
    }
  }

  console.log('✓ ccmonitor will now start at login');
  console.log(`  agent:     ${PLIST}`);
  console.log(`  directory: ${REPO}`);
  console.log(`  log:       ${LOG}`);
  console.log(`  dashboard: http://localhost:5173`);
  console.log('\nIt is starting now — give it a few seconds.');
  console.log('To undo: npm run uninstall-autostart');
}

function uninstall() {
  requireMacOS();
  let removed = false;

  if (isLoaded()) {
    launchctl(['bootout', TARGET], { check: false });
    removed = true;
  }
  if (existsSync(PLIST)) {
    unlinkSync(PLIST);
    removed = true;
  }

  console.log(
    removed
      ? '✓ Auto-start removed. ccmonitor will no longer start at login.'
      : 'Auto-start was not installed; nothing to do.'
  );
  if (removed) console.log('  Anything already running keeps running until you stop it.');
}

function status() {
  requireMacOS();
  const installed = existsSync(PLIST);
  console.log(`agent file : ${installed ? PLIST : 'not installed'}`);
  console.log(`loaded     : ${isLoaded() ? 'yes' : 'no'}`);

  if (installed) {
    const dir = readFileSync(PLIST, 'utf8').match(
      /<key>WorkingDirectory<\/key>\s*<string>([^<]*)<\/string>/
    );
    if (dir && resolve(dir[1]) !== REPO) {
      console.log(`\n! The installed agent points at ${dir[1]}`);
      console.log(`  but this checkout is ${REPO}. Re-run install to repoint it.`);
    }
  }
  console.log(`log        : ${existsSync(LOG) ? LOG : 'none yet'}`);
}

const command = process.argv[2] || 'status';
if (command === 'install') install();
else if (command === 'uninstall') uninstall();
else if (command === 'status') status();
else {
  console.error('usage: node scripts/autostart.mjs [install|uninstall|status]');
  process.exit(1);
}
