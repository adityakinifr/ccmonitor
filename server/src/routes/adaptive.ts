import type { FastifyInstance } from 'fastify';
import type { Repository } from '../db/repository.js';
import type { AdaptiveCheckResult } from '../types/index.js';
import {
  generateEmbedding,
  normalizeToolInput,
  cosineSimilarity,
  embeddingToBuffer,
  bufferToEmbedding,
  checkOllamaHealth,
} from '../services/embeddings.js';
import { checkDangerous, getDangerDescription } from '../services/danger-detector.js';
import { whatsappService } from '../services/whatsapp.js';
import { whatsappBusinessService } from '../services/whatsapp-business.js';

// Helper to get the active WhatsApp service (prefer Business API)
function getActiveWhatsAppService() {
  if (whatsappBusinessService.isReady()) {
    return { service: whatsappBusinessService, type: 'business' as const };
  }
  if (whatsappService.isReady()) {
    return { service: whatsappService, type: 'web' as const };
  }
  return null;
}

const SIMILARITY_THRESHOLD = 0.85;

// Tools that require user permission and should be tracked
// These are tools where Claude Code prompts the user for approval
const PERMISSION_REQUIRED_TOOLS = new Set([
  'Bash',
  'Write',
  'Edit',
  'NotebookEdit',
]);

// Tools that should never be tracked (internal/read-only)
const NEVER_TRACK_TOOLS = new Set([
  'Read',
  'Glob',
  'Grep',
  'Task',           // Internal subagent spawning
  'WebFetch',
  'WebSearch',
  'AskUserQuestion',
  'TodoWrite',
  'EnterPlanMode',
  'ExitPlanMode',
  'ListMcpResourcesTool',
  'ReadMcpResourceTool',
  'Skill',
  'TaskOutput',
  'KillShell',
]);

// Check if a tool requires user permission
function requiresPermission(toolName: string): boolean {
  // MCP tools (mcp__*) generally require permission unless read-only
  if (toolName.startsWith('mcp__')) {
    // Read-only MCP tools
    if (toolName.includes('get') || toolName.includes('list') || toolName.includes('read') || toolName.includes('search') || toolName.includes('info') || toolName.includes('status')) {
      return false;
    }
    return true;
  }

  // Check explicit lists
  if (NEVER_TRACK_TOOLS.has(toolName)) {
    return false;
  }

  if (PERMISSION_REQUIRED_TOOLS.has(toolName)) {
    return true;
  }

  // Default: don't track unknown tools
  return false;
}

// Check if a path is internal Claude Code path (should not be tracked)
function isInternalPath(toolInput: Record<string, unknown>): boolean {
  const filePath = (toolInput.file_path || toolInput.path || '') as string;
  // .claude/ directories are internal
  if (filePath.includes('/.claude/') || filePath.includes('.claude/')) {
    return true;
  }
  return false;
}

// Match a tool input against a rule pattern
function matchesRule(
  toolName: string,
  toolInput: Record<string, unknown>,
  rule: { toolName: string; pattern: string; patternType: string }
): boolean {
  if (toolName !== rule.toolName) return false;

  const inputValue = getMatchableValue(toolName, toolInput);
  if (!inputValue) return false;

  switch (rule.patternType) {
    case 'exact':
      return inputValue === rule.pattern;

    case 'prefix':
      return inputValue.startsWith(rule.pattern);

    case 'directory':
      // Match if any path segment matches the directory pattern
      // Pattern could be "src" or "src/components"
      // This matches /any/path/src/anything or /any/path/src/components/anything
      const patternParts = rule.pattern.split('/').filter(Boolean);
      const inputParts = inputValue.split('/').filter(Boolean);

      // Find if pattern appears as contiguous segments in input
      for (let i = 0; i <= inputParts.length - patternParts.length; i++) {
        let matches = true;
        for (let j = 0; j < patternParts.length; j++) {
          if (inputParts[i + j] !== patternParts[j]) {
            matches = false;
            break;
          }
        }
        if (matches) return true;
      }
      return false;

    case 'contains':
      // Match if pattern appears anywhere in the input
      return inputValue.includes(rule.pattern);

    case 'glob':
      return matchGlob(inputValue, rule.pattern);

    default:
      return false;
  }
}

// Get the value to match against from tool input
function getMatchableValue(toolName: string, toolInput: Record<string, unknown>): string | null {
  switch (toolName) {
    case 'Edit':
    case 'Write':
    case 'NotebookEdit':
      return (toolInput.file_path || toolInput.path) as string || null;

    case 'Bash':
      return toolInput.command as string || null;

    default:
      // For MCP tools, try common patterns
      return (toolInput.file_path || toolInput.path || toolInput.command || toolInput.query) as string || null;
  }
}

// Simple glob matching (supports * and **)
function matchGlob(value: string, pattern: string): boolean {
  // Convert glob to regex
  let regex = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape special regex chars except * and ?
    .replace(/\*\*/g, '{{GLOBSTAR}}')      // Temporarily replace **
    .replace(/\*/g, '[^/]*')                // * matches anything except /
    .replace(/{{GLOBSTAR}}/g, '.*')         // ** matches anything including /
    .replace(/\?/g, '.');                   // ? matches single char

  regex = '^' + regex + '$';

  try {
    return new RegExp(regex).test(value);
  } catch {
    return false;
  }
}

// Parse tool input into selectable parts for rule creation
function parseToolInputParts(toolName: string, toolInput: Record<string, unknown>): {
  type: string;
  value: string;
  label: string;
}[] {
  const parts: { type: string; value: string; label: string }[] = [];

  // Always include tool name
  parts.push({ type: 'tool', value: toolName, label: toolName });

  switch (toolName) {
    case 'Edit':
    case 'Write':
    case 'NotebookEdit': {
      const filePath = (toolInput.file_path || toolInput.path) as string;
      if (filePath) {
        // Split path into individual segments (each can be selected independently)
        const segments = filePath.split('/').filter(Boolean);
        for (let i = 0; i < segments.length; i++) {
          const isFile = i === segments.length - 1;
          // Value is just the segment name for matching flexibility
          parts.push({
            type: isFile ? 'file' : 'directory',
            value: segments[i],
            label: segments[i],
          });
        }
      }
      break;
    }

    case 'Bash': {
      const command = toolInput.command as string;
      if (command) {
        // Split command into tokens - each token is independent
        const tokens = command.trim().split(/\s+/);
        for (let i = 0; i < Math.min(tokens.length, 6); i++) { // Limit to first 6 tokens
          parts.push({
            type: i === 0 ? 'command' : 'arg',
            value: tokens[i],
            label: tokens[i],
          });
        }
      }
      break;
    }

    default: {
      // Generic handling for other tools
      const value = getMatchableValue(toolName, toolInput);
      if (value) {
        parts.push({ type: 'value', value, label: value.slice(0, 50) });
      }
    }
  }

  return parts;
}

// Check if a tool input text contains project-specific paths (absolute paths)
function isProjectSpecific(normalizedText: string): boolean {
  // Contains absolute path (Unix or Windows style)
  if (/(?:^|\s)\/(?:Users|home|var|tmp|etc|opt|usr)/i.test(normalizedText)) {
    return true;
  }
  // Contains Windows absolute path
  if (/[A-Za-z]:\\/.test(normalizedText)) {
    return true;
  }
  // Contains home directory reference
  if (/(?:^|\s)~\//.test(normalizedText)) {
    return true;
  }
  return false;
}

interface CheckBody {
  taskId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  projectPath: string;
}

interface RecordBody {
  sessionId: string;
  taskId?: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  projectPath: string;
  decision: 'approved' | 'denied';
  source: 'user' | 'adaptive' | 'autopilot';
}

interface ImportBody {
  projectPath: string;
  threshold?: number;
}

export function registerAdaptiveRoutes(app: FastifyInstance, repo: Repository): void {
  // Health check for Ollama
  app.get('/api/adaptive/health', async (_request, reply) => {
    const health = await checkOllamaHealth();
    return reply.send(health);
  });

  // Check if a tool call should be auto-approved (using rules)
  app.post<{ Body: CheckBody }>('/api/adaptive/check', async (request, reply) => {
    const { taskId, toolName, toolInput, projectPath } = request.body;

    if (!taskId || !toolName) {
      return reply.status(400).send({ error: 'taskId and toolName required' });
    }

    // Check if adaptive mode is enabled for this task
    const adaptiveEnabled = repo.checkAdaptiveMode(taskId);
    if (!adaptiveEnabled) {
      return reply.send({
        decision: 'ask',
        reason: 'Adaptive mode not enabled',
      } as AdaptiveCheckResult);
    }

    // First, check if operation is dangerous
    const dangerCheck = checkDangerous(toolName, toolInput);
    if (dangerCheck.isDangerous && dangerCheck.severity !== 'none') {
      return reply.send({
        decision: 'ask',
        reason: getDangerDescription(dangerCheck),
        isDangerous: true,
        dangerReason: dangerCheck.reason,
      } as AdaptiveCheckResult);
    }

    try {
      // Get all rules for this project (including global rules)
      const rules = repo.getAllApprovalRulesForProject(projectPath);

      // Check if any rule matches
      for (const rule of rules) {
        if (matchesRule(toolName, toolInput, rule)) {
          // Update match count
          repo.updateRuleMatchCount(rule.id);

          if (rule.ruleType === 'allow') {
            return reply.send({
              decision: 'allow',
              reason: `Matched rule: ${rule.pattern}`,
              matchedRule: {
                id: rule.id,
                pattern: rule.pattern,
                isGlobal: rule.projectPath === null,
              },
            } as AdaptiveCheckResult);
          } else {
            return reply.send({
              decision: 'deny',
              reason: `Blocked by rule: ${rule.pattern}`,
              matchedRule: {
                id: rule.id,
                pattern: rule.pattern,
                isGlobal: rule.projectPath === null,
              },
            } as AdaptiveCheckResult);
          }
        }
      }

      // No rule matched - ask user
      return reply.send({
        decision: 'ask',
        reason: 'No matching rule found',
      } as AdaptiveCheckResult);

    } catch (error) {
      console.error('[Adaptive] Error checking rules:', error);
      return reply.send({
        decision: 'ask',
        reason: 'Error checking adaptive rules',
      } as AdaptiveCheckResult);
    }
  });

  // Check with WhatsApp proxy - waits for WhatsApp response if needed
  app.post<{ Body: CheckBody & { sessionId?: string } }>('/api/adaptive/check-whatsapp', async (request, reply) => {
    const { taskId, toolName, toolInput, projectPath, sessionId } = request.body;

    if (!taskId || !toolName) {
      return reply.status(400).send({ error: 'taskId and toolName required' });
    }

    // Check if adaptive mode is enabled for this task
    const adaptiveEnabled = repo.checkAdaptiveMode(taskId);
    if (!adaptiveEnabled) {
      return reply.send({
        decision: 'ask',
        reason: 'Adaptive mode not enabled',
        whatsappUsed: false,
      });
    }

    // Get active WhatsApp service (Business API preferred)
    const waService = getActiveWhatsAppService();

    // First, check if operation is dangerous - always ask for dangerous ops
    const dangerCheck = checkDangerous(toolName, toolInput);
    if (dangerCheck.isDangerous && dangerCheck.severity !== 'none') {
      // For dangerous ops, still proxy to WhatsApp but mark as dangerous
      if (waService) {
        const normalizedText = normalizeToolInput(toolName, toolInput);
        const decision = await waService.service.requestApproval({
          taskId,
          sessionId: sessionId || taskId,
          toolName,
          toolInput,
          projectPath,
          normalizedText: `[DANGEROUS] ${normalizedText}`,
        });

        return reply.send({
          decision: decision === 'timeout' ? 'deny' : decision,
          reason: decision === 'timeout' ? 'WhatsApp approval timed out' : `WhatsApp (${waService.type}): ${decision}`,
          isDangerous: true,
          dangerReason: dangerCheck.reason,
          whatsappUsed: true,
          whatsappType: waService.type,
        });
      }

      return reply.send({
        decision: 'ask',
        reason: getDangerDescription(dangerCheck),
        isDangerous: true,
        dangerReason: dangerCheck.reason,
        whatsappUsed: false,
      });
    }

    try {
      // Get all rules for this project (including global rules)
      const rules = repo.getAllApprovalRulesForProject(projectPath);

      // Check if any rule matches
      for (const rule of rules) {
        if (matchesRule(toolName, toolInput, rule)) {
          repo.updateRuleMatchCount(rule.id);

          return reply.send({
            decision: rule.ruleType === 'allow' ? 'allow' : 'deny',
            reason: `Matched rule: ${rule.pattern}`,
            matchedRule: {
              id: rule.id,
              pattern: rule.pattern,
              isGlobal: rule.projectPath === null,
            },
            whatsappUsed: false,
          });
        }
      }

      // No rule matched - check if WhatsApp is available
      if (waService) {
        const normalizedText = normalizeToolInput(toolName, toolInput);
        console.log(`[Adaptive] Proxying to WhatsApp (${waService.type}): ${toolName} - ${normalizedText.slice(0, 50)}...`);

        const decision = await waService.service.requestApproval({
          taskId,
          sessionId: sessionId || taskId,
          toolName,
          toolInput,
          projectPath,
          normalizedText,
        });

        // Map timeout to deny
        const finalDecision = decision === 'timeout' ? 'deny' : decision;

        return reply.send({
          decision: finalDecision,
          reason: decision === 'timeout' ? 'WhatsApp approval timed out - auto-denied' : `WhatsApp (${waService.type}): ${decision}`,
          whatsappUsed: true,
          whatsappType: waService.type,
        });
      }

      // WhatsApp not available, fall back to ask
      return reply.send({
        decision: 'ask',
        reason: 'No matching rule found and WhatsApp not available',
        whatsappUsed: false,
      });

    } catch (error) {
      console.error('[Adaptive] Error in WhatsApp check:', error);
      return reply.send({
        decision: 'ask',
        reason: 'Error checking adaptive rules',
        whatsappUsed: false,
      });
    }
  });

  // Legacy: Check if a tool call should be auto-approved (using embeddings)
  app.post<{ Body: CheckBody }>('/api/adaptive/check-embeddings', async (request, reply) => {
    const { taskId, toolName, toolInput, projectPath } = request.body;

    if (!taskId || !toolName) {
      return reply.status(400).send({ error: 'taskId and toolName required' });
    }

    const adaptiveEnabled = repo.checkAdaptiveMode(taskId);
    if (!adaptiveEnabled) {
      return reply.send({
        decision: 'ask',
        reason: 'Adaptive mode not enabled',
      } as AdaptiveCheckResult);
    }

    const dangerCheck = checkDangerous(toolName, toolInput);
    if (dangerCheck.isDangerous && dangerCheck.severity !== 'none') {
      return reply.send({
        decision: 'ask',
        reason: getDangerDescription(dangerCheck),
        isDangerous: true,
        dangerReason: dangerCheck.reason,
      } as AdaptiveCheckResult);
    }

    try {
      const normalizedText = normalizeToolInput(toolName, toolInput);
      const embedding = await generateEmbedding(normalizedText);

      const projectPatterns = repo.getApprovalEmbeddings(projectPath, toolName);
      let bestMatch: {
        id: number;
        similarity: number;
        text: string;
        approvalCount: number;
        denialCount: number;
      } | null = null;

      for (const pattern of projectPatterns) {
        const storedEmbedding = bufferToEmbedding(pattern.embedding);
        const similarity = cosineSimilarity(embedding, storedEmbedding);

        if (similarity >= SIMILARITY_THRESHOLD) {
          if (!bestMatch || similarity > bestMatch.similarity) {
            bestMatch = {
              id: pattern.id,
              similarity,
              text: pattern.toolInputText,
              approvalCount: pattern.approvalCount,
              denialCount: pattern.denialCount,
            };
          }
        }
      }

      if (!bestMatch) {
        const globalPatterns = repo.getApprovalEmbeddings(null, toolName);
        for (const pattern of globalPatterns) {
          const storedEmbedding = bufferToEmbedding(pattern.embedding);
          const similarity = cosineSimilarity(embedding, storedEmbedding);

          // Slightly lower threshold for global patterns
          if (similarity >= SIMILARITY_THRESHOLD * 0.95) {
            if (!bestMatch || similarity > bestMatch.similarity) {
              bestMatch = {
                id: pattern.id,
                similarity: similarity * 0.9, // Reduce confidence for global
                text: pattern.toolInputText,
                approvalCount: pattern.approvalCount,
                denialCount: pattern.denialCount,
              };
            }
          }
        }
      }

      // Make decision based on match
      if (bestMatch) {
        // Pattern found - check approval history
        if (bestMatch.approvalCount > 0 && bestMatch.denialCount === 0) {
          return reply.send({
            decision: 'allow',
            reason: `Matched approved pattern (${bestMatch.approvalCount} approvals, similarity: ${(bestMatch.similarity * 100).toFixed(1)}%)`,
            matchedPattern: {
              id: bestMatch.id,
              similarity: bestMatch.similarity,
              text: bestMatch.text,
            },
          } as AdaptiveCheckResult);
        } else if (bestMatch.denialCount > bestMatch.approvalCount) {
          return reply.send({
            decision: 'deny',
            reason: `Matched denied pattern (${bestMatch.denialCount} denials)`,
            matchedPattern: {
              id: bestMatch.id,
              similarity: bestMatch.similarity,
              text: bestMatch.text,
            },
          } as AdaptiveCheckResult);
        }
      }

      // No match or mixed history - ask user
      return reply.send({
        decision: 'ask',
        reason: 'No matching approval pattern found',
      } as AdaptiveCheckResult);

    } catch (error) {
      console.error('[Adaptive] Error checking pattern:', error);
      return reply.send({
        decision: 'ask',
        reason: 'Error checking adaptive patterns',
      } as AdaptiveCheckResult);
    }
  });

  // Record a decision for learning
  app.post<{ Body: RecordBody }>('/api/adaptive/record', async (request, reply) => {
    const { sessionId, taskId, toolName, toolInput, projectPath, decision, source } = request.body;

    if (!sessionId || !toolName) {
      return reply.status(400).send({ error: 'sessionId and toolName required' });
    }

    // Skip tools that don't require user permission
    if (!requiresPermission(toolName)) {
      return reply.send({ success: true, skipped: true, reason: 'Tool does not require permission' });
    }

    // Skip internal Claude Code paths
    if (isInternalPath(toolInput)) {
      return reply.send({ success: true, skipped: true, reason: 'Internal Claude Code path' });
    }

    try {
      const normalizedText = normalizeToolInput(toolName, toolInput);
      const embedding = await generateEmbedding(normalizedText);

      // Search for existing similar pattern
      const projectPatterns = repo.getApprovalEmbeddings(projectPath, toolName);
      let matchedId: number | null = null;
      let matchedSimilarity: number | null = null;

      for (const pattern of projectPatterns) {
        const storedEmbedding = bufferToEmbedding(pattern.embedding);
        const similarity = cosineSimilarity(embedding, storedEmbedding);

        if (similarity >= SIMILARITY_THRESHOLD) {
          matchedId = pattern.id;
          matchedSimilarity = similarity;
          break;
        }
      }

      const isApproved = decision === 'approved';

      if (matchedId) {
        // Update existing pattern
        repo.updateApprovalEmbedding(matchedId, isApproved);
      } else {
        // Create new pattern
        const newId = repo.createApprovalEmbedding({
          projectPath,
          toolName,
          toolInputText: normalizedText,
          embedding: embeddingToBuffer(embedding),
        });

        // Also create a global pattern (with null project_path) if not project-specific
        if (!isProjectSpecific(normalizedText)) {
          const globalPatterns = repo.getApprovalEmbeddings(null, toolName);
          let globalMatchId: number | null = null;

          for (const pattern of globalPatterns) {
            const storedEmbedding = bufferToEmbedding(pattern.embedding);
            const similarity = cosineSimilarity(embedding, storedEmbedding);

            if (similarity >= SIMILARITY_THRESHOLD) {
              globalMatchId = pattern.id;
              break;
            }
          }

          if (globalMatchId) {
            repo.updateApprovalEmbedding(globalMatchId, isApproved);
          } else {
            repo.createApprovalEmbedding({
              projectPath: null,
              toolName,
              toolInputText: normalizedText,
              embedding: embeddingToBuffer(embedding),
            });
          }
        }

        // Update the project pattern we just created
        repo.updateApprovalEmbedding(newId, isApproved);
        matchedId = newId;
      }

      // Record decision audit trail
      repo.recordApprovalDecision({
        sessionId,
        taskId: taskId || null,
        projectPath,
        toolName,
        toolInputText: normalizedText,
        decision: isApproved ? 'approved' : 'denied',
        decisionSource: source,
        similarityScore: matchedSimilarity,
        matchedEmbeddingId: matchedId,
      });

      return reply.send({ success: true, embeddingId: matchedId });

    } catch (error) {
      console.error('[Adaptive] Error recording decision:', error);
      return reply.status(500).send({ error: 'Failed to record decision' });
    }
  });

  // Get patterns for a project
  app.get<{ Querystring: { projectPath?: string } }>('/api/adaptive/patterns', async (request, reply) => {
    const { projectPath } = request.query;

    const patterns = projectPath
      ? repo.getApprovalEmbeddings(projectPath)
      : [];

    const globalPatterns = repo.getApprovalEmbeddings(null);

    // Remove embedding data from response (too large)
    const cleanPatterns = patterns.map(p => ({
      id: p.id,
      projectPath: p.projectPath,
      toolName: p.toolName,
      toolInputText: p.toolInputText,
      approvalCount: p.approvalCount,
      denialCount: p.denialCount,
      lastApprovedAt: p.lastApprovedAt,
      lastDeniedAt: p.lastDeniedAt,
    }));

    const cleanGlobalPatterns = globalPatterns.map(p => ({
      id: p.id,
      projectPath: p.projectPath,
      toolName: p.toolName,
      toolInputText: p.toolInputText,
      approvalCount: p.approvalCount,
      denialCount: p.denialCount,
      lastApprovedAt: p.lastApprovedAt,
      lastDeniedAt: p.lastDeniedAt,
    }));

    return reply.send({
      patterns: cleanPatterns,
      globalPatterns: cleanGlobalPatterns,
    });
  });

  // Delete a pattern
  app.delete<{ Params: { id: string } }>('/api/adaptive/patterns/:id', async (request, reply) => {
    const { id } = request.params;
    const deleted = repo.deleteApprovalEmbedding(parseInt(id, 10));
    return reply.send({ success: deleted });
  });

  // Import global patterns to a new project
  app.post<{ Body: ImportBody }>('/api/adaptive/import', async (request, reply) => {
    const { projectPath, threshold = 3 } = request.body;

    if (!projectPath) {
      return reply.status(400).send({ error: 'projectPath required' });
    }

    // Check if project already has patterns
    if (repo.hasProjectPatterns(projectPath)) {
      return reply.send({
        success: false,
        reason: 'Project already has patterns',
        imported: 0,
      });
    }

    const imported = repo.copyGlobalPatternsToProject(projectPath, threshold);

    return reply.send({
      success: true,
      imported,
      message: `Imported ${imported} patterns from global defaults`,
    });
  });

  // Get adaptive stats
  app.get('/api/adaptive/stats', async (_request, reply) => {
    const globalPatternCount = repo.getGlobalPatternCount();
    const recentDecisions = repo.getApprovalDecisions(null, 20);

    // Count unique projects with patterns
    const projectStats = repo.getApprovalEmbeddings(null);
    const toolCounts: Record<string, { approved: number; denied: number }> = {};

    for (const p of projectStats) {
      if (!toolCounts[p.toolName]) {
        toolCounts[p.toolName] = { approved: 0, denied: 0 };
      }
      toolCounts[p.toolName].approved += p.approvalCount;
      toolCounts[p.toolName].denied += p.denialCount;
    }

    const topTools = Object.entries(toolCounts)
      .sort((a, b) => (b[1].approved + b[1].denied) - (a[1].approved + a[1].denied))
      .slice(0, 10)
      .map(([tool, counts]) => ({
        tool,
        approved: counts.approved,
        denied: counts.denied,
      }));

    return reply.send({
      totalGlobalPatterns: globalPatternCount,
      recentDecisions,
      topTools,
    });
  });

  // Backfill patterns from recent tool calls
  app.post<{ Body: { projectPath: string; limit?: number } }>('/api/adaptive/backfill', async (request, reply) => {
    const { projectPath, limit = 100 } = request.body;

    if (!projectPath) {
      return reply.status(400).send({ error: 'projectPath required' });
    }

    console.log(`[Adaptive] Starting backfill for project: ${projectPath}, limit: ${limit}`);

    try {
      // Get recent tool calls from events that have tool_name and tool_input
      const recentToolCalls = repo.getRecentToolCalls(projectPath, limit);
      console.log(`[Adaptive] Found ${recentToolCalls.length} tool calls to process`);

      if (recentToolCalls.length === 0) {
        return reply.send({
          success: true,
          processed: 0,
          found: 0,
          newPatterns: 0,
          updatedPatterns: 0,
          message: `No tool calls found for project: ${projectPath}. Make sure sessions have been recorded with this project path.`,
        });
      }

      let processed = 0;
      let newPatterns = 0;
      let updatedPatterns = 0;
      const errors: string[] = [];

      for (const toolCall of recentToolCalls) {
        // Skip tools that don't require user permission
        if (!requiresPermission(toolCall.toolName)) {
          console.log(`[Adaptive] Skipping ${toolCall.toolName} - doesn't require permission`);
          continue;
        }

        // Skip internal Claude Code paths
        if (isInternalPath(toolCall.toolInput)) {
          console.log(`[Adaptive] Skipping ${toolCall.toolName} - internal path`);
          continue;
        }

        try {
          const normalizedText = normalizeToolInput(toolCall.toolName, toolCall.toolInput);
          console.log(`[Adaptive] Processing: ${toolCall.toolName} - ${normalizedText.slice(0, 50)}...`);

          const embedding = await generateEmbedding(normalizedText);

          // Check if similar pattern exists
          const projectPatterns = repo.getApprovalEmbeddings(projectPath, toolCall.toolName);
          let exists = false;

          for (const pattern of projectPatterns) {
            const storedEmbedding = bufferToEmbedding(pattern.embedding);
            const similarity = cosineSimilarity(embedding, storedEmbedding);
            if (similarity >= SIMILARITY_THRESHOLD) {
              exists = true;
              // Increment approval count for existing pattern
              repo.updateApprovalEmbedding(pattern.id, true);
              updatedPatterns++;
              break;
            }
          }

          if (!exists) {
            // Create new pattern
            const newId = repo.createApprovalEmbedding({
              projectPath,
              toolName: toolCall.toolName,
              toolInputText: normalizedText,
              embedding: embeddingToBuffer(embedding),
            });
            repo.updateApprovalEmbedding(newId, true);
            newPatterns++;

            // Also add to global patterns if not project-specific
            if (!isProjectSpecific(normalizedText)) {
              const globalPatterns = repo.getApprovalEmbeddings(null, toolCall.toolName);
              let globalExists = false;

              for (const pattern of globalPatterns) {
                const storedEmbedding = bufferToEmbedding(pattern.embedding);
                const similarity = cosineSimilarity(embedding, storedEmbedding);
                if (similarity >= SIMILARITY_THRESHOLD) {
                  globalExists = true;
                  repo.updateApprovalEmbedding(pattern.id, true);
                  break;
                }
              }

              if (!globalExists) {
                const globalId = repo.createApprovalEmbedding({
                  projectPath: null,
                  toolName: toolCall.toolName,
                  toolInputText: normalizedText,
                  embedding: embeddingToBuffer(embedding),
                });
                repo.updateApprovalEmbedding(globalId, true);
              }
            }
          }

          processed++;
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          errors.push(`${toolCall.toolName}: ${errMsg}`);
          console.error(`[Adaptive] Error processing ${toolCall.toolName}:`, err);
        }
      }

      console.log(`[Adaptive] Backfill complete: ${processed} processed, ${newPatterns} new, ${updatedPatterns} updated`);

      return reply.send({
        success: true,
        processed,
        found: recentToolCalls.length,
        newPatterns,
        updatedPatterns,
        errors: errors.length > 0 ? errors.slice(0, 5) : undefined,
        message: `Processed ${processed}/${recentToolCalls.length} tool calls. Created ${newPatterns} new patterns, updated ${updatedPatterns} existing.`,
      });

    } catch (error) {
      console.error('[Adaptive] Backfill error:', error);
      return reply.status(500).send({ error: 'Backfill failed', details: error instanceof Error ? error.message : String(error) });
    }
  });

  // Vote on a pattern (agree/disagree)
  app.post<{ Params: { id: string }; Body: { vote: 'agree' | 'disagree' } }>('/api/adaptive/patterns/:id/vote', async (request, reply) => {
    const { id } = request.params;
    const { vote } = request.body;

    if (!vote || !['agree', 'disagree'].includes(vote)) {
      return reply.status(400).send({ error: 'vote must be agree or disagree' });
    }

    const patternId = parseInt(id, 10);

    // Update the pattern based on vote
    // agree = increment approval, disagree = increment denial
    repo.updateApprovalEmbedding(patternId, vote === 'agree');

    return reply.send({ success: true });
  });

  // Get decisions by session
  app.get<{ Params: { sessionId: string }; Querystring: { limit?: string } }>('/api/adaptive/decisions/:sessionId', async (request, reply) => {
    const { sessionId } = request.params;
    const limit = parseInt(request.query.limit || '50', 10);

    const decisions = repo.getDecisionsBySession(sessionId, limit);
    const counts = repo.getDecisionCountsBySession(sessionId);

    return reply.send({
      decisions,
      counts,
    });
  });

  // Get pattern count for a project
  app.get<{ Querystring: { projectPath: string } }>('/api/adaptive/pattern-count', async (request, reply) => {
    const { projectPath } = request.query;

    if (!projectPath) {
      return reply.status(400).send({ error: 'projectPath required' });
    }

    const count = repo.getProjectPatternCount(projectPath);

    return reply.send({ count, projectPath });
  });

  // Promote a project pattern to global
  app.post<{ Params: { id: string } }>('/api/adaptive/patterns/:id/promote', async (request, reply) => {
    const { id } = request.params;
    const patternId = parseInt(id, 10);

    // Get the pattern
    const pattern = repo.getApprovalEmbeddingById(patternId);
    if (!pattern) {
      return reply.status(404).send({ error: 'Pattern not found' });
    }

    if (pattern.projectPath === null) {
      return reply.status(400).send({ error: 'Pattern is already global' });
    }

    // Check if similar global pattern exists
    const globalPatterns = repo.getApprovalEmbeddings(null, pattern.toolName);
    const embedding = bufferToEmbedding(pattern.embedding);

    for (const globalPattern of globalPatterns) {
      const globalEmbedding = bufferToEmbedding(globalPattern.embedding);
      const similarity = cosineSimilarity(embedding, globalEmbedding);
      if (similarity >= SIMILARITY_THRESHOLD) {
        // Update existing global pattern
        repo.updateApprovalEmbedding(globalPattern.id, true);
        return reply.send({
          success: true,
          message: 'Updated existing global pattern',
          globalPatternId: globalPattern.id
        });
      }
    }

    // Create new global pattern
    const globalId = repo.createApprovalEmbedding({
      projectPath: null,
      toolName: pattern.toolName,
      toolInputText: pattern.toolInputText,
      embedding: pattern.embedding,
    });

    // Copy approval count
    for (let i = 0; i < pattern.approvalCount; i++) {
      repo.updateApprovalEmbedding(globalId, true);
    }

    return reply.send({
      success: true,
      message: 'Created new global pattern',
      globalPatternId: globalId
    });
  });

  // =============== RULES API ===============

  // Get rules for a project
  app.get<{ Querystring: { projectPath?: string } }>('/api/adaptive/rules', async (request, reply) => {
    const { projectPath } = request.query;

    const projectRules = projectPath ? repo.getApprovalRules(projectPath) : [];
    const globalRules = repo.getApprovalRules(null);

    return reply.send({
      rules: projectRules,
      globalRules,
    });
  });

  // Create a new rule
  app.post<{ Body: {
    projectPath: string | null;
    toolName: string;
    pattern: string;
    patternType: 'exact' | 'prefix' | 'glob' | 'directory';
    ruleType: 'allow' | 'deny';
    description?: string;
  } }>('/api/adaptive/rules', async (request, reply) => {
    const { projectPath, toolName, pattern, patternType, ruleType, description } = request.body;

    if (!toolName || !pattern || !patternType || !ruleType) {
      return reply.status(400).send({ error: 'toolName, pattern, patternType, and ruleType are required' });
    }

    const id = repo.createApprovalRule({
      projectPath,
      toolName,
      pattern,
      patternType,
      ruleType,
      description,
    });

    return reply.send({ success: true, id });
  });

  // Delete a rule
  app.delete<{ Params: { id: string } }>('/api/adaptive/rules/:id', async (request, reply) => {
    const { id } = request.params;
    const deleted = repo.deleteApprovalRule(parseInt(id, 10));
    return reply.send({ success: deleted });
  });

  // Promote a rule to global
  app.post<{ Params: { id: string } }>('/api/adaptive/rules/:id/promote', async (request, reply) => {
    const { id } = request.params;
    const globalId = repo.promoteRuleToGlobal(parseInt(id, 10));

    if (globalId === null) {
      return reply.status(404).send({ error: 'Rule not found' });
    }

    return reply.send({ success: true, globalRuleId: globalId });
  });

  // Get recent tool calls for rule creation (grouped by common patterns)
  app.get<{ Querystring: { projectPath: string; limit?: string } }>('/api/adaptive/tool-calls', async (request, reply) => {
    const { projectPath, limit } = request.query;

    if (!projectPath) {
      return reply.status(400).send({ error: 'projectPath required' });
    }

    const toolCalls = repo.getRecentToolCallsForRules(projectPath, parseInt(limit || '100', 10));

    // Group by tool name first
    const byTool = new Map<string, typeof toolCalls>();
    for (const tc of toolCalls) {
      const existing = byTool.get(tc.toolName) || [];
      existing.push(tc);
      byTool.set(tc.toolName, existing);
    }

    const groupedCalls: {
      toolName: string;
      toolInput: Record<string, unknown>;
      count: number;
      lastUsed: string;
      parts: ReturnType<typeof parseToolInputParts>;
      normalizedText: string;
      similarCount: number;
      suggestedPattern?: string;
      suggestedPatternType?: string;
    }[] = [];

    for (const [toolName, calls] of byTool) {
      if (toolName === 'Edit' || toolName === 'Write' || toolName === 'NotebookEdit') {
        // Group file operations by directory
        const byDirectory = new Map<string, { calls: typeof calls; count: number }>();

        for (const tc of calls) {
          const filePath = (tc.toolInput.file_path || tc.toolInput.path) as string;
          if (!filePath) continue;

          // Get directory path (all but last segment)
          const segments = filePath.split('/').filter(Boolean);
          const dirPath = segments.slice(0, -1).join('/');

          const existing = byDirectory.get(dirPath) || { calls: [], count: 0 };
          existing.calls.push(tc);
          existing.count += tc.count;
          byDirectory.set(dirPath, existing);
        }

        // Create grouped entries
        for (const [dirPath, { calls: dirCalls, count }] of byDirectory) {
          if (dirCalls.length > 1) {
            // Multiple files in same directory - suggest directory pattern
            const segments = dirPath.split('/').filter(Boolean);
            // Find a reasonable pattern (last 2-3 meaningful segments)
            const meaningfulSegments = segments.filter(s =>
              !['Users', 'home', 'var', 'code'].includes(s) &&
              !s.match(/^[a-z]{2,}$/) // Skip short common names like 'src'
            );
            const patternSegments = meaningfulSegments.length > 0
              ? meaningfulSegments.slice(-2)
              : segments.slice(-2);

            groupedCalls.push({
              toolName,
              toolInput: { file_path: dirPath + '/*' },
              count,
              lastUsed: dirCalls[0].lastUsed,
              parts: [
                { type: 'tool', value: toolName, label: toolName },
                ...patternSegments.map(s => ({ type: 'directory', value: s, label: s })),
                { type: 'file', value: '*', label: '*' },
              ],
              normalizedText: `${toolName} file ${patternSegments.join('/')}/*`,
              similarCount: dirCalls.length - 1,
              suggestedPattern: patternSegments.join('/'),
              suggestedPatternType: 'directory',
            });
          } else {
            // Single file - show as-is
            const tc = dirCalls[0];
            groupedCalls.push({
              toolName,
              toolInput: tc.toolInput,
              count: tc.count,
              lastUsed: tc.lastUsed,
              parts: parseToolInputParts(toolName, tc.toolInput),
              normalizedText: normalizeToolInput(toolName, tc.toolInput),
              similarCount: 0,
            });
          }
        }
      } else if (toolName === 'Bash') {
        // Group bash commands by first token (command)
        const byCommand = new Map<string, { calls: typeof calls; count: number }>();

        for (const tc of calls) {
          const command = (tc.toolInput.command as string || '').trim();
          const firstToken = command.split(/\s+/)[0];

          const existing = byCommand.get(firstToken) || { calls: [], count: 0 };
          existing.calls.push(tc);
          existing.count += tc.count;
          byCommand.set(firstToken, existing);
        }

        for (const [cmd, { calls: cmdCalls, count }] of byCommand) {
          if (cmdCalls.length > 1) {
            // Multiple commands with same prefix
            groupedCalls.push({
              toolName,
              toolInput: { command: cmd + ' *' },
              count,
              lastUsed: cmdCalls[0].lastUsed,
              parts: [
                { type: 'tool', value: toolName, label: toolName },
                { type: 'command', value: cmd, label: cmd },
              ],
              normalizedText: `Bash ${cmd} *`,
              similarCount: cmdCalls.length - 1,
              suggestedPattern: cmd,
              suggestedPatternType: 'prefix',
            });
          } else {
            const tc = cmdCalls[0];
            groupedCalls.push({
              toolName,
              toolInput: tc.toolInput,
              count: tc.count,
              lastUsed: tc.lastUsed,
              parts: parseToolInputParts(toolName, tc.toolInput),
              normalizedText: normalizeToolInput(toolName, tc.toolInput),
              similarCount: 0,
            });
          }
        }
      } else {
        // Other tools - add as-is
        for (const tc of calls) {
          groupedCalls.push({
            toolName,
            toolInput: tc.toolInput,
            count: tc.count,
            lastUsed: tc.lastUsed,
            parts: parseToolInputParts(toolName, tc.toolInput),
            normalizedText: normalizeToolInput(toolName, tc.toolInput),
            similarCount: 0,
          });
        }
      }
    }

    // Sort by count (most frequent first)
    groupedCalls.sort((a, b) => b.count - a.count);

    return reply.send({ toolCalls: groupedCalls.slice(0, parseInt(limit || '50', 10)) });
  });

  // Get rule stats
  app.get('/api/adaptive/rules/stats', async (_request, reply) => {
    const globalCount = repo.getRuleCount(null);

    return reply.send({
      globalRules: globalCount,
    });
  });
}
