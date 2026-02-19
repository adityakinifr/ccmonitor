import { homedir } from 'os';
import { join } from 'path';

export const config = {
  port: parseInt(process.env.PORT || '3456', 10),
  host: process.env.HOST || '0.0.0.0',

  // Database
  dbPath: process.env.DB_PATH || join(process.cwd(), '..', 'data', 'ccmonitor.db'),

  // Claude paths
  claudeProjectsPath: process.env.CLAUDE_PROJECTS_PATH || join(homedir(), '.claude', 'projects'),

  // Watch settings
  watchDebounceMs: 500,
};
