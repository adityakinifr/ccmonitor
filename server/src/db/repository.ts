import Database from 'better-sqlite3';
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
    const existing = this.db.prepare('SELECT id FROM sessions WHERE id = ?').get(session.id);

    if (existing) {
      const updates: string[] = [];
      const values: unknown[] = [];

      if (session.ended_at !== undefined) {
        updates.push('ended_at = ?');
        values.push(session.ended_at);
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
      INSERT INTO events (session_id, event_type, hook_event_name, entry_type, tool_name, tool_input, tool_response, content, tokens_input, tokens_output, cost, model, timestamp, uuid, parent_uuid, raw_data)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        event.cost,
        event.model,
        event.timestamp,
        event.uuid,
        event.parent_uuid,
        event.raw_data
      );

    return result.lastInsertRowid as number;
  }

  getEvents(sessionId?: string, limit = 100, offset = 0): EventItem[] {
    let query = `
      SELECT id, session_id, event_type, hook_event_name, entry_type, tool_name, content, tokens_input, tokens_output, cost, model, timestamp
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
      cost: row.cost || undefined,
      model: row.model || undefined,
      timestamp: row.timestamp,
    }));
  }

  getSessionEvents(sessionId: string): EventItem[] {
    return this.getEvents(sessionId, 1000, 0);
  }

  checkEventExists(sessionId: string, uuid: string): boolean {
    const result = this.db
      .prepare('SELECT 1 FROM events WHERE session_id = ? AND uuid = ? LIMIT 1')
      .get(sessionId, uuid);
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

    return rows.map((row) => ({
      toolName: row.tool_name,
      serverName: row.server_name,
      invocationCount: row.invocation_count,
      successRate:
        row.invocation_count > 0
          ? (row.success_count / row.invocation_count) * 100
          : 0,
      avgDurationMs:
        row.invocation_count > 0
          ? row.total_duration_ms / row.invocation_count
          : 0,
    }));
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

  getCostsByDay(days = 30): CostSummary[] {
    const rows = this.db
      .prepare(
        `
      SELECT
        DATE(started_at) as date,
        SUM(total_input_tokens) as input_tokens,
        SUM(total_output_tokens) as output_tokens,
        0 as cache_tokens,
        SUM(total_cost_usd) as cost_usd
      FROM sessions
      WHERE started_at >= DATE('now', '-' || ? || ' days')
      GROUP BY DATE(started_at)
      ORDER BY date DESC
    `
      )
      .all(days) as {
      date: string;
      input_tokens: number;
      output_tokens: number;
      cache_tokens: number;
      cost_usd: number;
    }[];

    return rows.map((row) => ({
      date: row.date,
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      cacheTokens: row.cache_tokens,
      costUsd: row.cost_usd,
    }));
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

  // Get today's costs by minute for granular trending
  getTodayCostsByMinute(): { timestamp: string; cost: number; tokens: number; runningCost: number; runningTokens: number }[] {
    const rows = this.db
      .prepare(
        `
      SELECT
        strftime('%Y-%m-%dT%H:%M:00Z', timestamp) as minute,
        SUM(COALESCE(cost, 0)) as cost,
        SUM(COALESCE(tokens_input, 0) + COALESCE(tokens_output, 0)) as tokens
      FROM events
      WHERE DATE(timestamp) = DATE('now')
        AND cost IS NOT NULL
        AND cost > 0
      GROUP BY strftime('%Y-%m-%dT%H:%M:00Z', timestamp)
      ORDER BY minute ASC
    `
      )
      .all() as { minute: string; cost: number; tokens: number }[];

    // Calculate running totals
    let runningCost = 0;
    let runningTokens = 0;
    return rows.map((row) => {
      runningCost += row.cost;
      runningTokens += row.tokens;
      return {
        timestamp: row.minute,
        cost: row.cost,
        tokens: row.tokens,
        runningCost,
        runningTokens,
      };
    });
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
    const rows = this.db
      .prepare(
        `
      SELECT
        COALESCE(tool_name, 'No Tool (Text Response)') as tool_name,
        SUM(COALESCE(cost, 0)) as total_cost,
        COUNT(*) as count,
        AVG(COALESCE(cost, 0)) as avg_cost,
        SUM(COALESCE(tokens_input, 0) + COALESCE(tokens_output, 0)) as total_tokens
      FROM events
      WHERE cost IS NOT NULL AND cost > 0
      GROUP BY tool_name
      ORDER BY total_cost DESC
    `
      )
      .all() as { tool_name: string; total_cost: number; count: number; avg_cost: number; total_tokens: number }[];

    return rows.map((r) => ({
      toolName: r.tool_name,
      totalCost: r.total_cost,
      count: r.count,
      avgCost: r.avg_cost,
      totalTokens: r.total_tokens,
    }));
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
}
