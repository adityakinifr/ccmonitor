import { closeSync, openSync, readSync, statSync } from 'fs';
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
      if (readFrom >= stat.size) {
        return events;
      }

      // Read only the bytes appended since last time. Transcripts grow to tens
      // of megabytes and every watcher event used to re-read and re-parse the
      // whole file from byte zero.
      const { text, endPosition } = this.readFrom(filePath, readFrom, stat.size);
      const lines = text.split('\n').filter((line) => line.trim());

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

      // Resume from the last complete line, not necessarily EOF.
      this.repo.setFilePosition(filePath, endPosition);
    } catch (error) {
      console.error(`[TranscriptParser] Error parsing ${filePath}:`, error);
    }

    return events;
  }

  /**
   * Read bytes [from, size) and return only whole lines. A transcript may be
   * mid-write, so any trailing partial line is left for the next pass and the
   * returned position stops at the last newline. Slicing on \n is safe for
   * UTF-8: 0x0A never occurs inside a multi-byte sequence.
   */
  private readFrom(
    filePath: string,
    from: number,
    size: number
  ): { text: string; endPosition: number } {
    const length = size - from;
    const buffer = Buffer.allocUnsafe(length);
    const fd = openSync(filePath, 'r');
    try {
      readSync(fd, buffer, 0, length, from);
    } finally {
      closeSync(fd);
    }

    const lastNewline = buffer.lastIndexOf(0x0a);
    if (lastNewline === -1) {
      return { text: '', endPosition: from };
    }
    return {
      text: buffer.subarray(0, lastNewline + 1).toString('utf8'),
      endPosition: from + lastNewline + 1,
    };
  }

  private processEntry(entry: TranscriptEntry, sessionId: string): EventItem | null {
    // Skip only a genuinely repeated line. Note this is NOT the same as a
    // repeated message id: Claude Code writes one API response as several
    // lines (one per content block), each carrying its own uuid and a copy of
    // the same usage. Those lines are distinct content and must be kept -- the
    // billing is deduplicated in processAssistantEntry instead.
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
        // Resolve the tool this answers: its name (for attribution) and, for
        // MCP tools, the success/error counters.
        for (const result of toolResults) {
          if (result.tool_use_id) {
            toolName = this.repo.resolveToolCall(result.tool_use_id, !result.is_error) || toolName;
          }
        }
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
      result_bytes: isToolResult ? Buffer.byteLength(content, 'utf8') : null,
      tokens_input: null,
      tokens_output: null,
      cache_read_tokens: null,
      cache_write_tokens: null,
      model: null,
      timestamp: entry.timestamp,
      uuid: entry.uuid,
      parent_uuid: entry.parentUuid,
      message_id: null,
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

        // Record the call so its result can be attributed back to this tool.
        // Outcome is unknown here -- it arrives on the matching tool_result.
        this.repo.recordToolInvocation(sessionId, block.name, block.id);
      }
    }

    // One API response can span several transcript lines, each repeating the
    // same usage. Bill the first line we see for a message id and record the
    // rest at zero, so the content is kept without counting the response twice.
    const messageId = message.id || null;
    const alreadyBilled = messageId ? this.repo.checkMessageExists(messageId) : false;

    const raw = extractTokens(usage);
    const tokens = alreadyBilled
      ? { input: 0, output: 0, cacheWrite: 0, cacheRead: 0, totalInput: 0 }
      : raw;
    const cost = alreadyBilled ? 0 : calculateCost(model, usage);

    if (!alreadyBilled) {
      this.repo.upsertSession({
        id: sessionId,
        total_input_tokens: tokens.totalInput,
        total_output_tokens: tokens.output,
        total_cache_read_tokens: tokens.cacheRead,
        total_cache_write_tokens: tokens.cacheWrite,
        total_cost_usd: cost,
      });
    }

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
      result_bytes: null,
      cost,
      model,
      timestamp: entry.timestamp,
      uuid: entry.uuid,
      parent_uuid: entry.parentUuid,
      message_id: messageId,
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
