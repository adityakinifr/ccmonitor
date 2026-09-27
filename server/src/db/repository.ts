import Database from 'better-sqlite3';
import { getPricing } from '../services/token-calculator.js';
import type {
  Session,
  Event,
  McpTool,
  SessionSummary,
  EventItem,
  McpToolStats,
  CostSummary,
  Stats,
  HookEvent,
} from '../types/index.js';

export class Repository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  // Sessions
  upsertSession(session: Partial<Session> & { id: string }): void {
    const existing = this.db.prepare('SELECT id, started_at FROM sessions WHERE id = ?').get(session.id) as { id: string; started_at: string } | undefined;

    if (existing) {
      const updates: string[] = [];
      const values: unknown[] = [];

      // Update started_at if the new timestamp is earlier (ensures we track actual session start)
      if (session.started_at !== undefined && session.started_at < existing.started_at) {
        updates.push('started_at = ?');
        values.push(session.started_at);
      }
      if (session.ended_at !== undefined) {
        updates.push('ended_at = ?');
        values.push(session.ended_at);
      }
      // Most transcripts open with a metadata line (mode/last-prompt/ai-title)
      // that carries no cwd, so the row is first inserted with a null
      // project_path. Backfill it from the first entry that does have one,
      // otherwise the session never appears in project stats.
      if (session.project_path) {
        updates.push('project_path = COALESCE(NULLIF(project_path, \'\'), ?)');
        values.push(session.project_path);
      }
      if (session.git_branch) {
        updates.push('git_branch = COALESCE(NULLIF(git_branch, \'\'), ?)');
        values.push(session.git_branch);
      }
      if (session.total_input_tokens !== undefined) {
        updates.push('total_input_tokens = total_input_tokens + ?');
        values.push(session.total_input_tokens);
      }
      if (session.total_output_tokens !== undefined) {
        updates.push('total_output_tokens = total_output_tokens + ?');
        values.push(session.total_output_tokens);
      }
      if (session.total_cost_usd !== undefined) {
        updates.push('total_cost_usd = total_cost_usd + ?');
        values.push(session.total_cost_usd);
      }
      if (session.total_cache_read_tokens !== undefined) {
        updates.push('total_cache_read_tokens = total_cache_read_tokens + ?');
        values.push(session.total_cache_read_tokens);
      }
      if (session.total_cache_write_tokens !== undefined) {
        updates.push('total_cache_write_tokens = total_cache_write_tokens + ?');
        values.push(session.total_cache_write_tokens);
      }

      if (updates.length > 0) {
        values.push(session.id);
        this.db.prepare(`UPDATE sessions SET ${updates.join(', ')} WHERE id = ?`).run(...values);
      }
    } else {
      this.db
        .prepare(
          `
        INSERT INTO sessions (id, project_path, git_branch, started_at, ended_at, total_input_tokens, total_output_tokens, total_cost_usd, version)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
        )
        .run(
          session.id,
          session.project_path || null,
          session.git_branch || null,
          session.started_at || new Date().toISOString(),
          session.ended_at || null,
          session.total_input_tokens || 0,
          session.total_output_tokens || 0,
          session.total_cost_usd || 0,
          session.version || null
        );
    }
  }

  getSession(id: string): Session | undefined {
    return this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as Session | undefined;
  }

  getSessions(limit = 50, offset = 0): SessionSummary[] {
    const rows = this.db
      .prepare(
        `
      SELECT
        s.*,
        COUNT(e.id) as event_count,
        SUM(CASE WHEN e.tool_name IS NOT NULL THEN 1 ELSE 0 END) as tool_call_count
      FROM sessions s
      LEFT JOIN events e ON s.id = e.session_id
      GROUP BY s.id
      ORDER BY s.started_at DESC
      LIMIT ? OFFSET ?
    `
      )
      .all(limit, offset) as (Session & { event_count: number; tool_call_count: number })[];

    return rows.map((row) => ({
      id: row.id,
      projectPath: row.project_path,
      gitBranch: row.git_branch,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      totalInputTokens: row.total_input_tokens,
      totalOutputTokens: row.total_output_tokens,
      totalCacheReadTokens: row.total_cache_read_tokens || 0,
      totalCacheWriteTokens: row.total_cache_write_tokens || 0,
      totalCostUsd: row.total_cost_usd,
      eventCount: row.event_count,
      toolCallCount: row.tool_call_count,
    }));
  }

  // Events
  insertEvent(event: Omit<Event, 'id'>): number {
    const result = this.db
      .prepare(
        `
      INSERT INTO events (session_id, event_type, hook_event_name, entry_type, tool_name, tool_input, tool_response, content, tokens_input, tokens_output, cache_read_tokens, cache_write_tokens, cost, model, timestamp, uuid, parent_uuid, message_id, result_bytes, raw_data)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        event.session_id,
        event.event_type,
        event.hook_event_name,
        event.entry_type,
        event.tool_name,
        event.tool_input,
        event.tool_response,
        event.content,
        event.tokens_input,
        event.tokens_output,
        event.cache_read_tokens,
        event.cache_write_tokens,
        event.cost,
        event.model,
        event.timestamp,
        event.uuid,
        event.parent_uuid,
        event.message_id,
        event.result_bytes,
        event.raw_data
      );

    return result.lastInsertRowid as number;
  }

  getEvents(sessionId?: string, limit = 100, offset = 0): EventItem[] {
    let query = `
      SELECT id, session_id, event_type, hook_event_name, entry_type, tool_name, content, tokens_input, tokens_output, cache_read_tokens, cache_write_tokens, cost, model, timestamp
      FROM events
    `;
    const params: unknown[] = [];

    if (sessionId) {
      query += ' WHERE session_id = ?';
      params.push(sessionId);
    }

    query += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const rows = this.db.prepare(query).all(...params) as Event[];

    return rows.map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      eventType: row.event_type,
      hookEventName: row.hook_event_name || undefined,
      entryType: row.entry_type || undefined,
      toolName: row.tool_name || undefined,
      content: row.content || undefined,
      tokensInput: row.tokens_input || undefined,
      tokensOutput: row.tokens_output || undefined,
      cacheReadTokens: row.cache_read_tokens || undefined,
      cacheWriteTokens: row.cache_write_tokens || undefined,
      cost: row.cost || undefined,
      model: row.model || undefined,
      timestamp: row.timestamp,
    }));
  }

  getSessionEvents(sessionId: string): EventItem[] {
    return this.getEvents(sessionId, 1000, 0);
  }

  // One Anthropic message id == one billed API response. Transcript entries are
  // re-emitted with fresh uuids on resume/fork/subagent runs, so uuid alone lets
  // the same response be counted many times over.
  checkMessageExists(messageId: string): boolean {
    const result = this.db
      .prepare('SELECT 1 FROM events WHERE message_id = ? LIMIT 1')
      .get(messageId);
    return !!result;
  }

  checkEventExists(sessionId: string, uuid: string): boolean {
    // Check UUID globally - UUIDs are unique across all sessions
    // This prevents double counting when the same event appears in multiple transcript files
    // (e.g., session resumption, forking, or subagent transcripts)
    const result = this.db
      .prepare('SELECT 1 FROM events WHERE uuid = ? LIMIT 1')
      .get(uuid);
    return !!result;
  }

  // MCP Tools
  upsertMcpTool(
    sessionId: string,
    toolName: string,
    success: boolean,
    durationMs = 0
  ): void {
    const serverName = toolName.startsWith('mcp__')
      ? toolName.split('__')[1] || null
      : null;

    const existing = this.db
      .prepare('SELECT * FROM mcp_tools WHERE session_id = ? AND tool_name = ?')
      .get(sessionId, toolName) as McpTool | undefined;

    if (existing) {
      this.db
        .prepare(
          `
        UPDATE mcp_tools
        SET invocation_count = invocation_count + 1,
            success_count = success_count + ?,
            error_count = error_count + ?,
            total_duration_ms = total_duration_ms + ?,
            last_used_at = ?
        WHERE session_id = ? AND tool_name = ?
      `
        )
        .run(
          success ? 1 : 0,
          success ? 0 : 1,
          durationMs,
          new Date().toISOString(),
          sessionId,
          toolName
        );
    } else {
      this.db
        .prepare(
          `
        INSERT INTO mcp_tools (session_id, tool_name, server_name, invocation_count, success_count, error_count, total_duration_ms, last_used_at)
        VALUES (?, ?, ?, 1, ?, ?, ?, ?)
      `
        )
        .run(
          sessionId,
          toolName,
          serverName,
          success ? 1 : 0,
          success ? 0 : 1,
          durationMs,
          new Date().toISOString()
        );
    }
  }

  // Tool outcomes arrive later, in a separate tool_result entry, so an
  // invocation is recorded as pending and resolved when its result shows up.
  // Counting at tool_use time (as this used to) makes every tool look 100%
  // successful because the error flag only exists on the result.
  recordToolInvocation(sessionId: string, toolName: string, toolUseId: string): void {
    // MCP tools additionally carry aggregate stats; every tool is recorded in
    // the pending map so its result can be attributed back to it.
    if (toolName.startsWith('mcp__')) {
      const serverName = toolName.split('__')[1] || null;
      this.db
        .prepare(
          `INSERT INTO mcp_tools (session_id, tool_name, server_name, invocation_count, success_count, error_count, total_duration_ms, last_used_at)
           VALUES (?, ?, ?, 1, 0, 0, 0, ?)
           ON CONFLICT(session_id, tool_name) DO UPDATE SET
             invocation_count = invocation_count + 1,
             last_used_at = excluded.last_used_at`
        )
        .run(sessionId, toolName, serverName, new Date().toISOString());
    }

    this.db
      .prepare(
        `INSERT INTO mcp_tool_calls (tool_use_id, session_id, tool_name)
         VALUES (?, ?, ?)
         ON CONFLICT(tool_use_id) DO NOTHING`
      )
      .run(toolUseId, sessionId, toolName);
  }

  /** Resolves a tool_result to the tool that produced it, returning its name. */
  resolveToolCall(toolUseId: string, success: boolean): string | null {
    const pending = this.db
      .prepare('SELECT session_id, tool_name FROM mcp_tool_calls WHERE tool_use_id = ?')
      .get(toolUseId) as { session_id: string; tool_name: string } | undefined;
    if (!pending) return null;

    if (pending.tool_name.startsWith('mcp__')) {
      this.db
        .prepare(
          `UPDATE mcp_tools
           SET success_count = success_count + ?, error_count = error_count + ?
           WHERE session_id = ? AND tool_name = ?`
        )
        .run(success ? 1 : 0, success ? 0 : 1, pending.session_id, pending.tool_name);
    }

    this.db.prepare('DELETE FROM mcp_tool_calls WHERE tool_use_id = ?').run(toolUseId);
    return pending.tool_name;
  }

  getMcpToolStats(): McpToolStats[] {
    const rows = this.db
      .prepare(
        `
      SELECT
        tool_name,
        server_name,
        SUM(invocation_count) as invocation_count,
        SUM(success_count) as success_count,
        SUM(error_count) as error_count,
        SUM(total_duration_ms) as total_duration_ms
      FROM mcp_tools
      GROUP BY tool_name
      ORDER BY invocation_count DESC
    `
      )
      .all() as {
      tool_name: string;
      server_name: string | null;
      invocation_count: number;
      success_count: number;
      error_count: number;
      total_duration_ms: number;
    }[];

    return rows.map((row) => {
      // Rate over calls whose outcome is actually known. Dividing by
      // invocation_count would count still-pending calls as failures, and the
      // old code paired that denominator with a success_count incremented
      // unconditionally -- which is why every tool read 100%.
      const resolved = row.success_count + row.error_count;
      return {
      toolName: row.tool_name,
      serverName: row.server_name,
      invocationCount: row.invocation_count,
      resolvedCount: resolved,
      errorCount: row.error_count,
      successRate: resolved > 0 ? (row.success_count / resolved) * 100 : null,
      avgDurationMs:
        row.invocation_count > 0
          ? row.total_duration_ms / row.invocation_count
          : 0,
      };
    });
  }

  // Stats
  getStats(): Stats {
    const sessions = this.db
      .prepare('SELECT COUNT(*) as count FROM sessions')
      .get() as { count: number };
    const events = this.db
      .prepare('SELECT COUNT(*) as count FROM events')
      .get() as { count: number };
    const tokens = this.db
      .prepare(
        'SELECT COALESCE(SUM(total_input_tokens + total_output_tokens), 0) as total FROM sessions'
      )
      .get() as { total: number };
    const cost = this.db
      .prepare('SELECT COALESCE(SUM(total_cost_usd), 0) as total FROM sessions')
      .get() as { total: number };
    const mcpTools = this.db
      .prepare('SELECT COUNT(DISTINCT tool_name) as count FROM mcp_tools')
      .get() as { count: number };

    return {
      totalSessions: sessions.count,
      totalEvents: events.count,
      totalTokens: tokens.total,
      totalCost: cost.total,
      mcpToolsUsed: mcpTools.count,
    };
  }

  // Grouped by the timestamp of each event, in local time.
  //
  // This used to group sessions by their started_at, which billed a session's
  // entire run to the single day it began on -- a session spanning three weeks
  // put every dollar on one bar and left the days it actually ran reading zero.
  getCostsByDay(days = 30): CostSummary[] {
    const rows = this.db
      .prepare(
        `
      SELECT
        DATE(timestamp, 'localtime') as date,
        COALESCE(model, '') as model,
        SUM(COALESCE(tokens_input, 0)) as input_tokens,
        SUM(COALESCE(tokens_output, 0)) as output_tokens,
        SUM(COALESCE(cache_read_tokens, 0)) as cache_read_tokens,
        SUM(COALESCE(cache_write_tokens, 0)) as cache_write_tokens,
        SUM(COALESCE(cost, 0)) as cost_usd
      FROM events
      -- The raw-timestamp bound is what lets this use idx_events_timestamp;
      -- DATE(timestamp,'localtime') alone forces a full scan. It is deliberately
      -- a day wider than needed so the exact local-date predicate below still
      -- decides membership -- this only narrows the rows examined.
      WHERE timestamp >= datetime('now', '-' || (? + 1) || ' days')
        AND DATE(timestamp, 'localtime') >= DATE('now', 'localtime', '-' || ? || ' days')
      GROUP BY DATE(timestamp, 'localtime'), COALESCE(model, '')
    `
      )
      .all(days, days) as {
      date: string;
      model: string;
      input_tokens: number;
      output_tokens: number;
      cache_read_tokens: number;
      cache_write_tokens: number;
      cost_usd: number;
    }[];

    // Roll the per-model rows up per day, pricing each model's cache reads at
    // its own rate rather than one blended guess.
    const dataMap = new Map<string, Omit<CostSummary, 'date'>>();
    for (const row of rows) {
      const p = getPricing(row.model);
      // Without caching those reads would have been billed as fresh input.
      const savings =
        (row.cache_read_tokens / 1_000_000) * (p.inputPerMillion - p.cacheReadPerMillion);

      const acc = dataMap.get(row.date) || {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        costUsd: 0,
        costWithoutCache: 0,
        cacheSavings: 0,
      };
      acc.inputTokens += row.input_tokens;
      acc.outputTokens += row.output_tokens;
      acc.cacheReadTokens += row.cache_read_tokens;
      acc.cacheWriteTokens += row.cache_write_tokens;
      acc.costUsd += row.cost_usd;
      acc.cacheSavings += savings;
      acc.costWithoutCache += row.cost_usd + savings;
      dataMap.set(row.date, acc);
    }

    // Fill gaps for all days in the range (using local timezone)
    const result: CostSummary[] = [];
    const endDate = new Date();
    endDate.setHours(0, 0, 0, 0);
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - days + 1);

    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const data = dataMap.get(dateStr);
      result.push(
        data
          ? { date: dateStr, ...data }
          : {
              date: dateStr,
              inputTokens: 0,
              outputTokens: 0,
              cacheReadTokens: 0,
              cacheWriteTokens: 0,
              costUsd: 0,
              costWithoutCache: 0,
              cacheSavings: 0,
            }
      );
    }

    return result;
  }

  // File positions for transcript watching
  getFilePosition(filePath: string): number {
    const row = this.db
      .prepare('SELECT position FROM file_positions WHERE file_path = ?')
      .get(filePath) as { position: number } | undefined;
    return row?.position || 0;
  }

  setFilePosition(filePath: string, position: number): void {
    this.db
      .prepare(
        `
      INSERT INTO file_positions (file_path, position, last_read_at)
      VALUES (?, ?, ?)
      ON CONFLICT(file_path) DO UPDATE SET position = ?, last_read_at = ?
    `
      )
      .run(
        filePath,
        position,
        new Date().toISOString(),
        position,
        new Date().toISOString()
      );
  }

  // Get today's costs by minute for granular trending (with gaps filled)
  // Uses local timezone for "today" calculation
  getTodayCostsByMinute(): { timestamp: string; cost: number; tokens: number; runningCost: number; runningTokens: number }[] {
    const rows = this.db
      .prepare(
        `
      SELECT
        strftime('%Y-%m-%dT%H:%M:00', timestamp, 'localtime') as minute,
        SUM(COALESCE(cost, 0)) as cost,
        SUM(COALESCE(tokens_input, 0) + COALESCE(tokens_output, 0)) as tokens
      FROM events
      WHERE DATE(timestamp, 'localtime') = DATE('now', 'localtime')
        AND cost IS NOT NULL
        AND cost > 0
      GROUP BY strftime('%Y-%m-%dT%H:%M:00', timestamp, 'localtime')
      ORDER BY minute ASC
    `
      )
      .all() as { minute: string; cost: number; tokens: number }[];

    if (rows.length === 0) {
      return [];
    }

    // Create a map for quick lookup
    const dataMap = new Map<string, { cost: number; tokens: number }>();
    for (const row of rows) {
      dataMap.set(row.minute, { cost: row.cost, tokens: row.tokens });
    }

    // Fill gaps between first data point and now (using local time)
    const result: { timestamp: string; cost: number; tokens: number; runningCost: number; runningTokens: number }[] = [];
    const firstTime = new Date(rows[0].minute);
    const now = new Date();

    // Round now down to current minute
    now.setSeconds(0, 0);

    let runningCost = 0;
    let runningTokens = 0;
    let currentTime = new Date(firstTime);

    while (currentTime <= now) {
      // Format as local time (YYYY-MM-DDTHH:MM:00)
      const timeStr = `${currentTime.getFullYear()}-${String(currentTime.getMonth() + 1).padStart(2, '0')}-${String(currentTime.getDate()).padStart(2, '0')}T${String(currentTime.getHours()).padStart(2, '0')}:${String(currentTime.getMinutes()).padStart(2, '0')}:00`;
      const data = dataMap.get(timeStr);

      if (data) {
        runningCost += data.cost;
        runningTokens += data.tokens;
        result.push({
          timestamp: timeStr,
          cost: data.cost,
          tokens: data.tokens,
          runningCost,
          runningTokens,
        });
      } else {
        // Gap - no activity this minute
        result.push({
          timestamp: timeStr,
          cost: 0,
          tokens: 0,
          runningCost,
          runningTokens,
        });
      }

      // Move to next minute
      currentTime.setMinutes(currentTime.getMinutes() + 1);
    }

    return result;
  }

  // Get recent events with cost for real-time trending
  getRecentCostEvents(minutes = 60): { timestamp: string; cost: number; tokens: number; model: string | null }[] {
    const rows = this.db
      .prepare(
        `
      SELECT
        timestamp,
        COALESCE(cost, 0) as cost,
        COALESCE(tokens_input, 0) + COALESCE(tokens_output, 0) as tokens,
        model
      FROM events
      WHERE timestamp >= datetime('now', '-' || ? || ' minutes')
        AND cost IS NOT NULL
        AND cost > 0
      ORDER BY timestamp ASC
    `
      )
      .all(minutes) as { timestamp: string; cost: number; tokens: number; model: string | null }[];

    return rows;
  }

  // Cost Analysis
  analyzeCostsByTool(): { toolName: string; totalCost: number; count: number; avgCost: number; totalTokens: number }[] {
    // Get tool costs (with actual tool names)
    const toolRows = this.db
      .prepare(
        `
      SELECT
        tool_name,
        SUM(COALESCE(cost, 0)) as total_cost,
        COUNT(*) as count,
        AVG(COALESCE(cost, 0)) as avg_cost,
        SUM(COALESCE(tokens_input, 0) + COALESCE(tokens_output, 0)) as total_tokens
      FROM events
      WHERE cost IS NOT NULL AND cost > 0
        AND tool_name IS NOT NULL AND tool_name != ''
      GROUP BY tool_name
    `
      )
      .all() as { tool_name: string; total_cost: number; count: number; avg_cost: number; total_tokens: number }[];

    // Get text responses (no tool) for categorization
    const textRows = this.db
      .prepare(
        `
      SELECT
        content,
        COALESCE(cost, 0) as cost,
        COALESCE(tokens_input, 0) + COALESCE(tokens_output, 0) as tokens
      FROM events
      WHERE cost IS NOT NULL AND cost > 0
        AND (tool_name IS NULL OR tool_name = '')
        AND content IS NOT NULL AND content != ''
    `
      )
      .all() as { content: string; cost: number; tokens: number }[];

    // Categorize text responses
    const textCategories: Record<string, { cost: number; count: number; tokens: number }> = {};

    for (const row of textRows) {
      const content = row.content.toLowerCase();
      let category: string;

      if (content.startsWith('[thinking]') || content.includes('let me think') || content.includes('i need to')) {
        category = 'Text: Thinking';
      } else if (content.includes('```') || content.includes('function') || content.includes('const ') || content.includes('import ')) {
        category = 'Text: Code/Explanation';
      } else if (content.includes('plan') || content.includes('step') || content.includes('first,') || content.includes('approach')) {
        category = 'Text: Planning';
      } else if (content.includes('error') || content.includes('issue') || content.includes('fix') || content.includes('bug')) {
        category = 'Text: Error Analysis';
      } else if (content.includes('tool') || content.includes('let me') || content.includes("i'll") || content.includes('i will')) {
        category = 'Text: Tool Intro';
      } else if (row.content.length < 100) {
        category = 'Text: Short';
      } else if (row.content.length > 500) {
        category = 'Text: Long';
      } else {
        category = 'Text: Other';
      }

      if (!textCategories[category]) {
        textCategories[category] = { cost: 0, count: 0, tokens: 0 };
      }
      textCategories[category].cost += row.cost;
      textCategories[category].count += 1;
      textCategories[category].tokens += row.tokens;
    }

    // Combine tool rows and text categories
    const results = toolRows.map((r) => ({
      toolName: r.tool_name,
      totalCost: r.total_cost,
      count: r.count,
      avgCost: r.avg_cost,
      totalTokens: r.total_tokens,
    }));

    for (const [category, data] of Object.entries(textCategories)) {
      if (data.count > 0) {
        results.push({
          toolName: category,
          totalCost: data.cost,
          count: data.count,
          avgCost: data.cost / data.count,
          totalTokens: data.tokens,
        });
      }
    }

    // Sort by total cost descending
    return results.sort((a, b) => b.totalCost - a.totalCost);
  }

  analyzeCostsByModel(): { model: string; totalCost: number; count: number; avgCost: number; totalTokens: number }[] {
    const rows = this.db
      .prepare(
        `
      SELECT
        COALESCE(model, 'Unknown') as model,
        SUM(COALESCE(cost, 0)) as total_cost,
        COUNT(*) as count,
        AVG(COALESCE(cost, 0)) as avg_cost,
        SUM(COALESCE(tokens_input, 0) + COALESCE(tokens_output, 0)) as total_tokens
      FROM events
      WHERE cost IS NOT NULL AND cost > 0
      GROUP BY model
      ORDER BY total_cost DESC
    `
      )
      .all() as { model: string; total_cost: number; count: number; avg_cost: number; total_tokens: number }[];

    return rows.map((r) => ({
      model: r.model,
      totalCost: r.total_cost,
      count: r.count,
      avgCost: r.avg_cost,
      totalTokens: r.total_tokens,
    }));
  }

  analyzeCostsByEntryType(): { entryType: string; totalCost: number; count: number; avgCost: number; totalTokens: number }[] {
    const rows = this.db
      .prepare(
        `
      SELECT
        COALESCE(entry_type, event_type) as entry_type,
        SUM(COALESCE(cost, 0)) as total_cost,
        COUNT(*) as count,
        AVG(COALESCE(cost, 0)) as avg_cost,
        SUM(COALESCE(tokens_input, 0) + COALESCE(tokens_output, 0)) as total_tokens
      FROM events
      WHERE cost IS NOT NULL AND cost > 0
      GROUP BY entry_type
      ORDER BY total_cost DESC
    `
      )
      .all() as { entry_type: string; total_cost: number; count: number; avg_cost: number; total_tokens: number }[];

    return rows.map((r) => ({
      entryType: r.entry_type,
      totalCost: r.total_cost,
      count: r.count,
      avgCost: r.avg_cost,
      totalTokens: r.total_tokens,
    }));
  }

  analyzeCostsByHour(): { hour: string; totalCost: number; count: number; totalTokens: number }[] {
    const rows = this.db
      .prepare(
        `
      SELECT
        strftime('%Y-%m-%d %H:00', timestamp) as hour,
        SUM(COALESCE(cost, 0)) as total_cost,
        COUNT(*) as count,
        SUM(COALESCE(tokens_input, 0) + COALESCE(tokens_output, 0)) as total_tokens
      FROM events
      WHERE cost IS NOT NULL AND cost > 0
        AND timestamp >= datetime('now', '-7 days')
      GROUP BY hour
      ORDER BY hour DESC
    `
      )
      .all() as { hour: string; total_cost: number; count: number; total_tokens: number }[];

    return rows.map((r) => ({
      hour: r.hour,
      totalCost: r.total_cost,
      count: r.count,
      totalTokens: r.total_tokens,
    }));
  }

  // Analyze text response content patterns
  analyzeTextResponsePatterns(): {
    category: string;
    totalCost: number;
    count: number;
    avgCost: number;
    totalTokens: number;
    avgTokens: number;
    examples: string[];
  }[] {
    // Get all text responses (no tool)
    const rows = this.db
      .prepare(
        `
      SELECT
        content,
        COALESCE(cost, 0) as cost,
        COALESCE(tokens_input, 0) + COALESCE(tokens_output, 0) as tokens
      FROM events
      WHERE cost IS NOT NULL
        AND cost > 0
        AND (tool_name IS NULL OR tool_name = '')
        AND content IS NOT NULL
        AND content != ''
    `
      )
      .all() as { content: string; cost: number; tokens: number }[];

    // Categorize by content pattern
    const categories: Record<string, { cost: number; count: number; tokens: number; examples: string[] }> = {
      'Thinking/Reasoning': { cost: 0, count: 0, tokens: 0, examples: [] },
      'Code Explanation': { cost: 0, count: 0, tokens: 0, examples: [] },
      'Planning/Strategy': { cost: 0, count: 0, tokens: 0, examples: [] },
      'Error Analysis': { cost: 0, count: 0, tokens: 0, examples: [] },
      'Tool Usage Explanation': { cost: 0, count: 0, tokens: 0, examples: [] },
      'Short Response': { cost: 0, count: 0, tokens: 0, examples: [] },
      'Long Response': { cost: 0, count: 0, tokens: 0, examples: [] },
      'Other': { cost: 0, count: 0, tokens: 0, examples: [] },
    };

    for (const row of rows) {
      const content = row.content.toLowerCase();
      const contentPreview = row.content.slice(0, 100);
      let category = 'Other';

      if (content.startsWith('[thinking]') || content.includes('let me think') || content.includes('i need to')) {
        category = 'Thinking/Reasoning';
      } else if (content.includes('```') || content.includes('function') || content.includes('const ') || content.includes('import ')) {
        category = 'Code Explanation';
      } else if (content.includes('plan') || content.includes('step') || content.includes('first,') || content.includes('approach')) {
        category = 'Planning/Strategy';
      } else if (content.includes('error') || content.includes('issue') || content.includes('fix') || content.includes('bug')) {
        category = 'Error Analysis';
      } else if (content.includes('tool') || content.includes('let me') || content.includes('i\'ll') || content.includes('i will')) {
        category = 'Tool Usage Explanation';
      } else if (row.content.length < 100) {
        category = 'Short Response';
      } else if (row.content.length > 500) {
        category = 'Long Response';
      }

      categories[category].cost += row.cost;
      categories[category].count += 1;
      categories[category].tokens += row.tokens;
      if (categories[category].examples.length < 3) {
        categories[category].examples.push(contentPreview);
      }
    }

    return Object.entries(categories)
      .filter(([_, data]) => data.count > 0)
      .map(([category, data]) => ({
        category,
        totalCost: data.cost,
        count: data.count,
        avgCost: data.cost / data.count,
        totalTokens: data.tokens,
        avgTokens: data.tokens / data.count,
        examples: data.examples,
      }))
      .sort((a, b) => b.totalCost - a.totalCost);
  }

  // Analyze content length vs cost correlation
  analyzeContentLengthCost(): { lengthBucket: string; totalCost: number; count: number; avgCost: number }[] {
    const rows = this.db
      .prepare(
        `
      SELECT
        CASE
          WHEN LENGTH(content) < 100 THEN '< 100 chars'
          WHEN LENGTH(content) < 500 THEN '100-500 chars'
          WHEN LENGTH(content) < 1000 THEN '500-1K chars'
          WHEN LENGTH(content) < 2000 THEN '1K-2K chars'
          ELSE '2K+ chars'
        END as length_bucket,
        SUM(COALESCE(cost, 0)) as total_cost,
        COUNT(*) as count,
        AVG(COALESCE(cost, 0)) as avg_cost
      FROM events
      WHERE cost IS NOT NULL
        AND cost > 0
        AND (tool_name IS NULL OR tool_name = '')
        AND content IS NOT NULL
      GROUP BY length_bucket
      ORDER BY total_cost DESC
    `
      )
      .all() as { length_bucket: string; total_cost: number; count: number; avg_cost: number }[];

    return rows.map(r => ({
      lengthBucket: r.length_bucket,
      totalCost: r.total_cost,
      count: r.count,
      avgCost: r.avg_cost,
    }));
  }

  getExpensiveEvents(limit = 20): { id: number; sessionId: string; toolName: string | null; content: string | null; cost: number; tokens: number; model: string | null; timestamp: string }[] {
    const rows = this.db
      .prepare(
        `
      SELECT
        id,
        session_id,
        tool_name,
        content,
        COALESCE(cost, 0) as cost,
        COALESCE(tokens_input, 0) + COALESCE(tokens_output, 0) as tokens,
        model,
        timestamp
      FROM events
      WHERE cost IS NOT NULL AND cost > 0
      ORDER BY cost DESC
      LIMIT ?
    `
      )
      .all(limit) as { id: number; session_id: string; tool_name: string | null; content: string | null; cost: number; tokens: number; model: string | null; timestamp: string }[];

    return rows.map((r) => ({
      id: r.id,
      sessionId: r.session_id,
      toolName: r.tool_name,
      content: r.content?.slice(0, 200) || null,
      cost: r.cost,
      tokens: r.tokens,
      model: r.model,
      timestamp: r.timestamp,
    }));
  }

  // Get detailed expensive events with full content for AI analysis
  getExpensiveEventsDetailed(limit = 15): { id: number; toolName: string | null; content: string | null; cost: number; tokens: number; tokensInput: number; tokensOutput: number; model: string | null; timestamp: string }[] {
    const rows = this.db
      .prepare(
        `
      SELECT
        id,
        tool_name,
        content,
        COALESCE(cost, 0) as cost,
        COALESCE(tokens_input, 0) + COALESCE(tokens_output, 0) as tokens,
        COALESCE(tokens_input, 0) as tokens_input,
        COALESCE(tokens_output, 0) as tokens_output,
        model,
        timestamp
      FROM events
      WHERE cost IS NOT NULL AND cost > 0
      ORDER BY cost DESC
      LIMIT ?
    `
      )
      .all(limit) as { id: number; tool_name: string | null; content: string | null; cost: number; tokens: number; tokens_input: number; tokens_output: number; model: string | null; timestamp: string }[];

    return rows.map((r) => ({
      id: r.id,
      toolName: r.tool_name,
      content: r.content,
      cost: r.cost,
      tokens: r.tokens,
      tokensInput: r.tokens_input,
      tokensOutput: r.tokens_output,
      model: r.model,
      timestamp: r.timestamp,
    }));
  }

  // Get expensive prompts with full context for AI analysis
  getExpensivePromptsForAnalysis(limit = 5): {
    id: number;
    content: string | null;
    toolName: string | null;
    cost: number;
    tokensInput: number;
    tokensOutput: number;
    model: string | null;
    entryType: string | null;
    timestamp: string;
  }[] {
    const rows = this.db
      .prepare(
        `
      SELECT
        id,
        content,
        tool_name,
        entry_type,
        COALESCE(cost, 0) as cost,
        COALESCE(tokens_input, 0) as tokens_input,
        COALESCE(tokens_output, 0) as tokens_output,
        model,
        timestamp
      FROM events
      WHERE cost IS NOT NULL
        AND cost > 0
        AND content IS NOT NULL
        AND length(content) > 10
      ORDER BY cost DESC
      LIMIT ?
    `
      )
      .all(limit) as {
        id: number;
        content: string | null;
        tool_name: string | null;
        entry_type: string | null;
        cost: number;
        tokens_input: number;
        tokens_output: number;
        model: string | null;
        timestamp: string;
      }[];

    return rows.map((r) => ({
      id: r.id,
      toolName: r.tool_name,
      content: r.content?.slice(0, 1000) || null, // More content for AI analysis
      cost: r.cost,
      tokensInput: r.tokens_input,
      tokensOutput: r.tokens_output,
      model: r.model,
      entryType: r.entry_type,
      timestamp: r.timestamp,
    }));
  }

  // Search
  searchEvents(query: string, limit = 50): EventItem[] {
    const rows = this.db
      .prepare(
        `
      SELECT id, session_id, event_type, hook_event_name, entry_type, tool_name, content, tokens_input, tokens_output, cost, model, timestamp
      FROM events
      WHERE content LIKE ? OR tool_name LIKE ?
      ORDER BY timestamp DESC
      LIMIT ?
    `
      )
      .all(`%${query}%`, `%${query}%`, limit) as Event[];

    return rows.map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      eventType: row.event_type,
      hookEventName: row.hook_event_name || undefined,
      entryType: row.entry_type || undefined,
      toolName: row.tool_name || undefined,
      content: row.content || undefined,
      tokensInput: row.tokens_input || undefined,
      tokensOutput: row.tokens_output || undefined,
      cost: row.cost || undefined,
      model: row.model || undefined,
      timestamp: row.timestamp,
    }));
  }

  /**
   * Context health: what is filling the context window and what it costs.
   *
   * Two things drive spend on long agentic sessions -- the size of the context
   * re-read on every turn, and the turns where the cache is rebuilt instead of
   * read. Both are visible here alongside the tool results that inflate them.
   *
   * Counts only billed rows: one API response spans several transcript lines
   * and only the first carries its usage, so the rest would otherwise show up
   * as zero-context calls and halve the average.
   */
  getContextHealth(rebuildThreshold = 50_000): {
    summary: {
      avgContextTokens: number;
      callsOverThreshold: number;
      totalCalls: number;
      rebuildCalls: number;
      rebuildCost: number;
      totalCost: number;
      oversizedResults: number;
    };
    distribution: { bucket: string; calls: number; cost: number }[];
    rebuildsByCause: { cause: string; calls: number; cost: number }[];
    rebuildSessions: {
      sessionId: string;
      projectName: string | null;
      calls: number;
      cost: number;
      unexplained: number;
    }[];
    byTool: {
      toolName: string;
      results: number;
      totalBytes: number;
      avgBytes: number;
      maxBytes: number;
      oversized: number;
    }[];
    worstResults: {
      id: number;
      sessionId: string;
      toolName: string | null;
      bytes: number;
      timestamp: string;
    }[];
  } {
    const OVERSIZED = 200_000;

    const totals = this.db
      .prepare(
        `SELECT COUNT(*) as calls,
                COALESCE(SUM(cache_read_tokens), 0) as ctx,
                COALESCE(SUM(cost), 0) as cost,
                SUM(CASE WHEN COALESCE(cache_read_tokens, 0) > 800000 THEN 1 ELSE 0 END) as over
         FROM events WHERE entry_type = 'assistant' AND COALESCE(cost, 0) > 0`
      )
      .get() as { calls: number; ctx: number; cost: number; over: number };

    const distribution = this.db
      .prepare(
        `SELECT CASE
                  WHEN COALESCE(cache_read_tokens,0) < 50000  THEN '<50k'
                  WHEN COALESCE(cache_read_tokens,0) < 150000 THEN '50-150k'
                  WHEN COALESCE(cache_read_tokens,0) < 400000 THEN '150-400k'
                  WHEN COALESCE(cache_read_tokens,0) < 800000 THEN '400-800k'
                  ELSE '>800k' END as bucket,
                COUNT(*) as calls, COALESCE(SUM(cost), 0) as cost
         FROM events WHERE entry_type = 'assistant' AND COALESCE(cost, 0) > 0
         GROUP BY bucket`
      )
      .all() as { bucket: string; calls: number; cost: number }[];
    const order = ['<50k', '50-150k', '150-400k', '400-800k', '>800k'];
    distribution.sort((a, b) => order.indexOf(a.bucket) - order.indexOf(b.bucket));

    // A rebuild is a turn that wrote a large prefix to cache without reading
    // any of it back. Classified by the gap since the previous call: beyond the
    // 1h TTL it simply expired; inside it, the prefix was invalidated.
    const rebuilds = this.db
      .prepare(
        `WITH a AS (
           SELECT id, session_id, timestamp, COALESCE(cost, 0) as cost,
                  LAG(timestamp) OVER (PARTITION BY session_id ORDER BY timestamp) as prev
           FROM events WHERE entry_type = 'assistant' AND COALESCE(cost, 0) > 0
         )
         SELECT id, session_id, cost,
                CASE
                  WHEN prev IS NULL THEN 'first call in session'
                  WHEN (julianday(timestamp) - julianday(prev)) * 1440 > 60 THEN 'cache TTL expired (idle > 1h)'
                  ELSE 'unexplained (within cache window)' END as cause
         FROM a
         WHERE id IN (
           SELECT id FROM events
           WHERE entry_type = 'assistant' AND cache_write_tokens > ?
             AND COALESCE(cache_read_tokens, 0) = 0 AND COALESCE(cost, 0) > 0
         )`
      )
      .all(rebuildThreshold) as { id: number; session_id: string; cost: number; cause: string }[];

    const causeMap = new Map<string, { calls: number; cost: number }>();
    const sessionMap = new Map<string, { calls: number; cost: number; unexplained: number }>();
    for (const r of rebuilds) {
      const c = causeMap.get(r.cause) || { calls: 0, cost: 0 };
      c.calls++;
      c.cost += r.cost;
      causeMap.set(r.cause, c);

      const sess = sessionMap.get(r.session_id) || { calls: 0, cost: 0, unexplained: 0 };
      sess.calls++;
      sess.cost += r.cost;
      if (r.cause.startsWith('unexplained')) sess.unexplained++;
      sessionMap.set(r.session_id, sess);
    }

    const projectOf = this.db.prepare('SELECT project_path FROM sessions WHERE id = ?');
    const rebuildSessions = [...sessionMap.entries()]
      .map(([sessionId, v]) => {
        const row = projectOf.get(sessionId) as { project_path: string | null } | undefined;
        return {
          sessionId,
          projectName: row?.project_path?.split('/').pop() || null,
          ...v,
        };
      })
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 15);

    const byTool = this.db
      .prepare(
        `SELECT COALESCE(tool_name, '(unattributed)') as tool_name,
                COUNT(*) as results,
                COALESCE(SUM(result_bytes), 0) as total_bytes,
                CAST(COALESCE(AVG(result_bytes), 0) AS INTEGER) as avg_bytes,
                COALESCE(MAX(result_bytes), 0) as max_bytes,
                SUM(CASE WHEN result_bytes > ? THEN 1 ELSE 0 END) as oversized
         FROM events WHERE entry_type = 'tool_result' AND result_bytes IS NOT NULL
         GROUP BY tool_name ORDER BY total_bytes DESC LIMIT 20`
      )
      .all(OVERSIZED) as {
      tool_name: string;
      results: number;
      total_bytes: number;
      avg_bytes: number;
      max_bytes: number;
      oversized: number;
    }[];

    const worstResults = this.db
      .prepare(
        `SELECT id, session_id, tool_name, result_bytes, timestamp
         FROM events WHERE entry_type = 'tool_result' AND result_bytes IS NOT NULL
         ORDER BY result_bytes DESC LIMIT 15`
      )
      .all() as {
      id: number;
      session_id: string;
      tool_name: string | null;
      result_bytes: number;
      timestamp: string;
    }[];

    const oversized = this.db
      .prepare(
        `SELECT COUNT(*) as n FROM events
         WHERE entry_type = 'tool_result' AND result_bytes > ?`
      )
      .get(OVERSIZED) as { n: number };

    return {
      summary: {
        avgContextTokens: totals.calls > 0 ? Math.round(totals.ctx / totals.calls) : 0,
        callsOverThreshold: totals.over,
        totalCalls: totals.calls,
        rebuildCalls: rebuilds.length,
        rebuildCost: rebuilds.reduce((sum, r) => sum + r.cost, 0),
        totalCost: totals.cost,
        oversizedResults: oversized.n,
      },
      distribution,
      rebuildsByCause: [...causeMap.entries()]
        .map(([cause, v]) => ({ cause, ...v }))
        .sort((a, b) => b.cost - a.cost),
      rebuildSessions,
      byTool: byTool.map((t) => ({
        toolName: t.tool_name,
        results: t.results,
        totalBytes: t.total_bytes,
        avgBytes: t.avg_bytes,
        maxBytes: t.max_bytes,
        oversized: t.oversized,
      })),
      worstResults: worstResults.map((r) => ({
        id: r.id,
        sessionId: r.session_id,
        toolName: r.tool_name,
        bytes: r.result_bytes,
        timestamp: r.timestamp,
      })),
    };
  }

  // Project Analysis
  getProjectStats(): {
    projectPath: string;
    projectName: string;
    gitBranches: string[];
    totalCost: number;
    totalSessions: number;
    totalEvents: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCacheReadTokens: number;
    totalCacheWriteTokens: number;
    firstSessionAt: string;
    lastSessionAt: string;
  }[] {
    // Use subquery to avoid multiplication from JOIN
    const rows = this.db
      .prepare(
        `
      SELECT
        s.project_path,
        SUM(s.total_cost_usd) as total_cost,
        COUNT(s.id) as total_sessions,
        SUM(s.total_input_tokens) as total_input_tokens,
        SUM(s.total_output_tokens) as total_output_tokens,
        SUM(COALESCE(s.total_cache_read_tokens, 0)) as total_cache_read_tokens,
        SUM(COALESCE(s.total_cache_write_tokens, 0)) as total_cache_write_tokens,
        MIN(s.started_at) as first_session_at,
        MAX(s.started_at) as last_session_at,
        GROUP_CONCAT(DISTINCT s.git_branch) as git_branches,
        (SELECT COUNT(*) FROM events e WHERE e.session_id IN (
          SELECT id FROM sessions WHERE project_path = s.project_path
        )) as total_events
      FROM sessions s
      WHERE s.project_path IS NOT NULL AND s.project_path != ''
      GROUP BY s.project_path
      ORDER BY total_cost DESC
    `
      )
      .all() as {
        project_path: string;
        total_cost: number;
        total_sessions: number;
        total_events: number;
        total_input_tokens: number;
        total_output_tokens: number;
        total_cache_read_tokens: number;
        total_cache_write_tokens: number;
        first_session_at: string;
        last_session_at: string;
        git_branches: string | null;
      }[];

    return rows.map((r) => ({
      projectPath: r.project_path,
      projectName: r.project_path.split('/').pop() || r.project_path,
      gitBranches: r.git_branches ? r.git_branches.split(',').filter(b => b && b.trim()) : [],
      totalCost: r.total_cost || 0,
      totalSessions: r.total_sessions,
      totalEvents: r.total_events || 0,
      totalInputTokens: r.total_input_tokens || 0,
      totalOutputTokens: r.total_output_tokens || 0,
      totalCacheReadTokens: r.total_cache_read_tokens || 0,
      totalCacheWriteTokens: r.total_cache_write_tokens || 0,
      firstSessionAt: r.first_session_at,
      lastSessionAt: r.last_session_at,
    }));
  }

  getProjectCostsByDay(projectPath: string, days = 30): {
    date: string;
    costUsd: number;
    sessions: number;
    events: number;
  }[] {
    // Grouped by event timestamp, not session start, so a long-running session
    // spreads across the days it actually ran. See getCostsByDay.
    const rows = this.db
      .prepare(
        `
      SELECT
        date(e.timestamp, 'localtime') as date,
        SUM(COALESCE(e.cost, 0)) as cost_usd,
        COUNT(DISTINCT e.session_id) as sessions,
        COUNT(*) as events
      FROM events e
      JOIN sessions s ON s.id = e.session_id
      WHERE s.project_path = ?
        AND e.timestamp >= datetime('now', '-' || (? + 1) || ' days')
        AND date(e.timestamp, 'localtime') >= date('now', 'localtime', '-' || ? || ' days')
      GROUP BY date(e.timestamp, 'localtime')
      ORDER BY date ASC
    `
      )
      .all(projectPath, days, days) as { date: string; cost_usd: number; sessions: number; events: number }[];

    return rows.map((r) => ({
      date: r.date,
      costUsd: r.cost_usd || 0,
      sessions: r.sessions,
      events: r.events,
    }));
  }

  getProjectToolBreakdown(projectPath: string): {
    toolName: string;
    totalCost: number;
    count: number;
  }[] {
    const rows = this.db
      .prepare(
        `
      SELECT
        COALESCE(e.tool_name, 'Text Response') as tool_name,
        SUM(COALESCE(e.cost, 0)) as total_cost,
        COUNT(*) as count
      FROM events e
      JOIN sessions s ON e.session_id = s.id
      WHERE s.project_path = ?
        AND e.cost IS NOT NULL AND e.cost > 0
      GROUP BY e.tool_name
      ORDER BY total_cost DESC
    `
      )
      .all(projectPath) as { tool_name: string; total_cost: number; count: number }[];

    return rows.map((r) => ({
      toolName: r.tool_name,
      totalCost: r.total_cost || 0,
      count: r.count,
    }));
  }
}
