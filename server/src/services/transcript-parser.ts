import { readFileSync, statSync } from 'fs';
import type { Repository } from '../db/repository.js';
import type {
  TranscriptEntry,
  UserEntry,
  AssistantEntry,
  EventItem,
  ContentBlock,
} from '../types/index.js';
import { calculateCost, extractTokens } from './token-calculator.js';
import { wsBroadcaster } from './websocket.js';

export class TranscriptParser {
  private repo: Repository;

  constructor(repo: Repository) {
    this.repo = repo;
  }

  parseFile(filePath: string): EventItem[] {
    const events: EventItem[] = [];

    try {
      const stat = statSync(filePath);
      const startPosition = this.repo.getFilePosition(filePath);

      // If file is smaller than our position, it was likely truncated/recreated
      const readFrom = stat.size < startPosition ? 0 : startPosition;

      const content = readFileSync(filePath, 'utf8');
      const lines = content.split('\n').filter((line) => line.trim());

      // Extract session ID from file path
      // Path format: ~/.claude/projects/<hash>/<session-id>.jsonl
      const sessionId = filePath.split('/').pop()?.replace('.jsonl', '') || 'unknown';

      for (const line of lines) {
        try {
          const entry = JSON.parse(line) as TranscriptEntry;
          const eventItem = this.processEntry(entry, sessionId);
          if (eventItem) {
            events.push(eventItem);
          }
        } catch {
          // Skip malformed lines
        }
      }

      // Update file position
      this.repo.setFilePosition(filePath, stat.size);
    } catch (error) {
      console.error(`[TranscriptParser] Error parsing ${filePath}:`, error);
    }

    return events;
  }

  private processEntry(entry: TranscriptEntry, sessionId: string): EventItem | null {
    // Skip if we've already processed this entry
    if (entry.uuid && this.repo.checkEventExists(sessionId, entry.uuid)) {
      return null;
    }

    // Ensure session exists
    this.repo.upsertSession({
      id: sessionId,
      project_path: entry.cwd,
      git_branch: entry.gitBranch || null,
      started_at: entry.timestamp,
      version: entry.version,
    });

    if (entry.type === 'user') {
      return this.processUserEntry(entry as UserEntry, sessionId);
    } else if (entry.type === 'assistant') {
      return this.processAssistantEntry(entry as AssistantEntry, sessionId);
    }

    return null;
  }

  private processUserEntry(entry: UserEntry, sessionId: string): EventItem | null {
    let content = '';
    let toolName: string | null = null;
    let isToolResult = false;

    if (typeof entry.message.content === 'string') {
      content = entry.message.content;
    } else if (Array.isArray(entry.message.content)) {
      // Process tool results - extract actual content
      const toolResults = entry.message.content.filter((c) => c.type === 'tool_result');
      if (toolResults.length > 0) {
        isToolResult = true;
        content = toolResults
          .map((c) => {
            const prefix = c.is_error ? '[Error] ' : '';
            // Handle content that might be string or object
            const resultContent = typeof c.content === 'string'
              ? c.content
              : JSON.stringify(c.content);
            return `${prefix}${resultContent}`;
          })
          .join('\n---\n');
      }
    }

    const entryType = isToolResult ? 'tool_result' : 'user';

    const eventId = this.repo.insertEvent({
      session_id: sessionId,
      event_type: 'transcript',
      hook_event_name: null,
      entry_type: entryType,
      tool_name: toolName,
      tool_input: null,
      tool_response: isToolResult ? content.slice(0, 5000) : null,
      content: content.slice(0, 5000),
      tokens_input: null,
      tokens_output: null,
      model: null,
      timestamp: entry.timestamp,
      uuid: entry.uuid,
      parent_uuid: entry.parentUuid,
      raw_data: JSON.stringify(entry),
    });

    const eventItem: EventItem = {
      id: eventId,
      sessionId,
      eventType: 'transcript',
      entryType,
      content: content.slice(0, 500),
      timestamp: entry.timestamp,
    };

    wsBroadcaster.broadcastEvent(eventItem);
    return eventItem;
  }

  private processAssistantEntry(entry: AssistantEntry, sessionId: string): EventItem | null {
    const message = entry.message;
    const usage = message.usage;
    const model = message.model;

    // Extract content and tool uses
    let textContent = '';
    const toolUses: string[] = [];

    for (const block of message.content) {
      if (block.type === 'text') {
        textContent += block.text;
      } else if (block.type === 'thinking') {
        // Include thinking content (summarized)
        const thinking = (block as { thinking: string }).thinking;
        if (thinking) {
          textContent += `[Thinking] ${thinking}\n`;
        }
      } else if (block.type === 'tool_use') {
        toolUses.push(block.name);
        // Include tool input as content for visibility
        const input = (block as { input: Record<string, unknown> }).input;
        if (input) {
          const inputStr = JSON.stringify(input, null, 2);
          textContent += `[Tool: ${block.name}] ${inputStr.slice(0, 500)}\n`;
        }

        // Track MCP tools
        if (block.name.startsWith('mcp__')) {
          this.repo.upsertMcpTool(sessionId, block.name, true);
        }
      }
    }

    // Calculate tokens and cost
    const tokens = extractTokens(usage);
    const cost = calculateCost(model, usage);

    // Update session totals (use totalInput for accurate count)
    this.repo.upsertSession({
      id: sessionId,
      total_input_tokens: tokens.totalInput,
      total_output_tokens: tokens.output,
      total_cache_read_tokens: tokens.cacheRead,
      total_cache_write_tokens: tokens.cacheWrite,
      total_cost_usd: cost,
    });

    const eventId = this.repo.insertEvent({
      session_id: sessionId,
      event_type: 'transcript',
      hook_event_name: null,
      entry_type: 'assistant',
      tool_name: toolUses.length > 0 ? toolUses.join(', ') : null,
      tool_input: null,
      tool_response: null,
      content: textContent.slice(0, 5000),
      tokens_input: tokens.totalInput,
      tokens_output: tokens.output,
      cache_read_tokens: tokens.cacheRead,
      cache_write_tokens: tokens.cacheWrite,
      cost,
      model,
      timestamp: entry.timestamp,
      uuid: entry.uuid,
      parent_uuid: entry.parentUuid,
      raw_data: JSON.stringify(entry),
    });

    const eventItem: EventItem = {
      id: eventId,
      sessionId,
      eventType: 'transcript',
      entryType: 'assistant',
      toolName: toolUses.length > 0 ? toolUses.join(', ') : undefined,
      content: textContent.slice(0, 500),
      tokensInput: tokens.totalInput,
      tokensOutput: tokens.output,
      cost,
      model,
      timestamp: entry.timestamp,
    };

    wsBroadcaster.broadcastEvent(eventItem);

    // Broadcast updated stats
    const stats = this.repo.getStats();
    wsBroadcaster.broadcastStats(stats);

    return eventItem;
  }
}
