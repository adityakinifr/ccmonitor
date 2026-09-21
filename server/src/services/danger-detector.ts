/**
 * Dangerous operations detector for adaptive mode
 * Always requires user confirmation for dangerous operations
 */

export type DangerSeverity = 'critical' | 'high' | 'medium' | 'none';

export interface DangerCheck {
  isDangerous: boolean;
  severity: DangerSeverity;
  reason?: string;
  category?: string;
}

// Patterns for detecting dangerous bash commands
const CRITICAL_BASH_PATTERNS: Array<{ pattern: RegExp; reason: string; category: string }> = [
  // Recursive deletion
  { pattern: /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f|--recursive)\b/i, reason: 'Recursive file deletion', category: 'deletion' },
  { pattern: /\brm\s+-[a-zA-Z]*f[a-zA-Z]*r\b/i, reason: 'Forced recursive deletion', category: 'deletion' },
  { pattern: /\brm\s+(-rf|-fr)\s/i, reason: 'Forced recursive deletion', category: 'deletion' },

  // Database destruction
  { pattern: /\bDROP\s+(TABLE|DATABASE|SCHEMA)\b/i, reason: 'Database drop operation', category: 'database' },
  { pattern: /\bTRUNCATE\s+TABLE\b/i, reason: 'Table truncation', category: 'database' },
  { pattern: /\bDELETE\s+FROM\s+\w+\s*(;|$)/i, reason: 'DELETE without WHERE clause', category: 'database' },
  { pattern: /\bDELETE\s+FROM\s+\w+\s+WHERE\s+1\s*=\s*1/i, reason: 'DELETE with always-true condition', category: 'database' },

  // Git destructive operations
  { pattern: /\bgit\s+push\s+.*--force\b/i, reason: 'Force push to remote', category: 'git' },
  { pattern: /\bgit\s+push\s+-f\b/i, reason: 'Force push to remote', category: 'git' },
  { pattern: /\bgit\s+reset\s+--hard\b/i, reason: 'Hard reset (loses uncommitted changes)', category: 'git' },
  { pattern: /\bgit\s+clean\s+-[a-zA-Z]*f/i, reason: 'Force clean untracked files', category: 'git' },

  // System-level danger
  { pattern: /\bchmod\s+777\b/i, reason: 'Setting world-writable permissions', category: 'permissions' },
  { pattern: /\bchown\s+-R\s+root\b/i, reason: 'Recursive ownership change to root', category: 'permissions' },
  { pattern: /\bmkfs\b/i, reason: 'Filesystem formatting', category: 'system' },
  { pattern: /\bdd\s+if=/i, reason: 'Low-level disk operation', category: 'system' },
  { pattern: /:\(\)\s*{\s*:\s*\|\s*:\s*&\s*}\s*;/i, reason: 'Fork bomb detected', category: 'malicious' },

  // Credential/secret exposure
  { pattern: /\bAWS_SECRET_ACCESS_KEY\s*=/i, reason: 'AWS secret key exposure', category: 'credentials' },
  { pattern: /\bpassword\s*=\s*['"][^'"]+['"]/i, reason: 'Password in command', category: 'credentials' },
];

const HIGH_BASH_PATTERNS: Array<{ pattern: RegExp; reason: string; category: string }> = [
  // Process killing
  { pattern: /\bpkill\b/i, reason: 'Process kill by name', category: 'process' },
  { pattern: /\bkillall\b/i, reason: 'Kill all processes by name', category: 'process' },
  { pattern: /\bkill\s+(-9|-SIGKILL|-KILL)\b/i, reason: 'Force kill process', category: 'process' },

  // Package publishing
  { pattern: /\b(npm|yarn|pnpm)\s+publish\b/i, reason: 'Package publication', category: 'publish' },
  { pattern: /\bcargo\s+publish\b/i, reason: 'Crate publication', category: 'publish' },

  // Container destruction
  { pattern: /\bdocker\s+rm\b/i, reason: 'Docker container removal', category: 'docker' },
  { pattern: /\bdocker\s+rmi\b/i, reason: 'Docker image removal', category: 'docker' },
  { pattern: /\bdocker\s+system\s+prune\b/i, reason: 'Docker system prune', category: 'docker' },

  // Kubernetes deletion
  { pattern: /\bkubectl\s+delete\b/i, reason: 'Kubernetes resource deletion', category: 'kubernetes' },

  // Cloud destruction
  { pattern: /\baws\s+s3\s+rm\s+.*--recursive\b/i, reason: 'Recursive S3 deletion', category: 'cloud' },
  { pattern: /\baws\s+ec2\s+terminate-instances\b/i, reason: 'EC2 instance termination', category: 'cloud' },
  { pattern: /\bgcloud\s+.*delete\b/i, reason: 'GCloud resource deletion', category: 'cloud' },

  // Sudo operations
  { pattern: /\bsudo\s+rm\b/i, reason: 'Sudo removal operation', category: 'sudo' },
  { pattern: /\bsudo\s+.*>/i, reason: 'Sudo with output redirection', category: 'sudo' },
];

const MEDIUM_BASH_PATTERNS: Array<{ pattern: RegExp; reason: string; category: string }> = [
  // Git branch operations
  { pattern: /\bgit\s+branch\s+-[dD]\b/i, reason: 'Git branch deletion', category: 'git' },
  { pattern: /\bgit\s+stash\s+drop\b/i, reason: 'Git stash drop', category: 'git' },

  // Service restarts
  { pattern: /\bsystemctl\s+restart\b/i, reason: 'Service restart', category: 'service' },
  { pattern: /\bservice\s+\w+\s+restart\b/i, reason: 'Service restart', category: 'service' },

  // Database modifications
  { pattern: /\bALTER\s+TABLE\b/i, reason: 'Table schema alteration', category: 'database' },
  { pattern: /\bUPDATE\s+\w+\s+SET\b/i, reason: 'Database update operation', category: 'database' },
];

// Critical file paths that should always require confirmation
const CRITICAL_FILE_PATTERNS: RegExp[] = [
  /\.env($|\.)/i,
  /credentials/i,
  /secrets?\./i,
  /\.ssh\//i,
  /\.aws\//i,
  /config\/prod/i,
  /production\.json$/i,
  /\.pem$/i,
  /\.key$/i,
  /id_rsa/i,
];

/**
 * Check if a tool call is dangerous and should always require confirmation
 */
export function checkDangerous(
  toolName: string,
  toolInput: Record<string, unknown>
): DangerCheck {
  // Bash command checks
  if (toolName === 'Bash') {
    const command = toolInput.command as string;
    if (command) {
      // Check critical patterns
      for (const { pattern, reason, category } of CRITICAL_BASH_PATTERNS) {
        if (pattern.test(command)) {
          return {
            isDangerous: true,
            severity: 'critical',
            reason,
            category,
          };
        }
      }

      // Check high patterns
      for (const { pattern, reason, category } of HIGH_BASH_PATTERNS) {
        if (pattern.test(command)) {
          return {
            isDangerous: true,
            severity: 'high',
            reason,
            category,
          };
        }
      }

      // Check medium patterns
      for (const { pattern, reason, category } of MEDIUM_BASH_PATTERNS) {
        if (pattern.test(command)) {
          return {
            isDangerous: true,
            severity: 'medium',
            reason,
            category,
          };
        }
      }
    }
  }

  // File operation checks
  if (['Write', 'Edit'].includes(toolName)) {
    const filePath = (toolInput.file_path || toolInput.path) as string;
    if (filePath) {
      for (const pattern of CRITICAL_FILE_PATTERNS) {
        if (pattern.test(filePath)) {
          return {
            isDangerous: true,
            severity: 'high',
            reason: `Modifying sensitive file: ${filePath}`,
            category: 'sensitive-file',
          };
        }
      }
    }

    // Check for large content writes (potential binary/data dump)
    const content = toolInput.content as string;
    if (content && content.length > 50000) {
      return {
        isDangerous: true,
        severity: 'medium',
        reason: 'Large file write operation',
        category: 'large-write',
      };
    }
  }

  // Glob-based deletion (if a tool does batch operations)
  if (toolName === 'Glob' && toolInput.delete) {
    return {
      isDangerous: true,
      severity: 'high',
      reason: 'Batch file deletion via glob',
      category: 'deletion',
    };
  }

  // MCP tool checks - be cautious with unknown tools
  if (toolName.startsWith('mcp__')) {
    // Database MCP tools
    if (toolName.includes('database') || toolName.includes('sql')) {
      const query = (toolInput.query || toolInput.sql) as string;
      if (query) {
        if (/\b(DROP|DELETE|TRUNCATE|ALTER)\b/i.test(query)) {
          return {
            isDangerous: true,
            severity: 'high',
            reason: 'Database modification via MCP',
            category: 'database',
          };
        }
      }
    }

    // Automation tools - potentially dangerous
    if (toolName.includes('automation')) {
      return {
        isDangerous: true,
        severity: 'medium',
        reason: 'UI automation operation',
        category: 'automation',
      };
    }
  }

  return {
    isDangerous: false,
    severity: 'none',
  };
}

/**
 * Get a human-readable description of why an operation is dangerous
 */
export function getDangerDescription(check: DangerCheck): string {
  if (!check.isDangerous) {
    return 'Operation appears safe';
  }

  const severityEmoji = {
    critical: '🚨',
    high: '⚠️',
    medium: '⚡',
    none: '✅',
  };

  return `${severityEmoji[check.severity]} ${check.severity.toUpperCase()}: ${check.reason} [${check.category}]`;
}
