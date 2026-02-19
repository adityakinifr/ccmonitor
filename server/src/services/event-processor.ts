import type { Repository } from '../db/repository.js';
import type { HookEvent, EventItem } from '../types/index.js';
import { wsBroadcaster } from './websocket.js';

export class EventProcessor {
  private repo: Repository;

  constructor(repo: Repository) {
    this.repo = repo;
  }

  processHookEvent(event: HookEvent): EventItem {
    // Ensure session exists
    this.repo.upsertSession({
      id: event.session_id,
      started_at: event.timestamp,
    });

    // Extract content based on event type
    let content: string | null = null;
    if (event.hook_event_name === 'UserPromptSubmit' && event.prompt) {
      content = event.prompt;
    } else if (event.tool_input) {
      content = JSON.stringify(event.tool_input).slice(0, 1000);
    }

    // Insert the event
    const eventId = this.repo.insertEvent({
      session_id: event.session_id,
      event_type: 'hook',
      hook_event_name: event.hook_event_name,
      entry_type: null,
      tool_name: event.tool_name || null,
      tool_input: event.tool_input ? JSON.stringify(event.tool_input) : null,
      tool_response: event.tool_response ? JSON.stringify(event.tool_response) : null,
      content,
      tokens_input: null,
      tokens_output: null,
      model: null,
      timestamp: event.timestamp,
      uuid: null,
      parent_uuid: null,
      raw_data: JSON.stringify(event),
    });

    // Track MCP tool usage
    if (event.tool_name?.startsWith('mcp__') && event.hook_event_name === 'PostToolUse') {
      const success = !event.tool_response ||
        (typeof event.tool_response === 'object' &&
         (event.tool_response as { is_error?: boolean }).is_error !== true);
      this.repo.upsertMcpTool(event.session_id, event.tool_name, success);
    }

    // Handle session lifecycle
    if (event.hook_event_name === 'SessionEnd') {
      this.repo.upsertSession({
        id: event.session_id,
        ended_at: event.timestamp,
      });
    }

    const eventItem: EventItem = {
      id: eventId,
      sessionId: event.session_id,
      eventType: 'hook',
      hookEventName: event.hook_event_name,
      toolName: event.tool_name,
      content: content || undefined,
      timestamp: event.timestamp,
    };

    // Broadcast to WebSocket clients
    wsBroadcaster.broadcastEvent(eventItem);

    // Periodically broadcast updated stats
    const stats = this.repo.getStats();
    wsBroadcaster.broadcastStats(stats);

    return eventItem;
  }
}
