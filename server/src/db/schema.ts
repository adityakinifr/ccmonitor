import Database from 'better-sqlite3';

export function initializeDatabase(dbPath: string): Database.Database {
  const db = new Database(dbPath);

  // Enable WAL mode for better concurrent access
  db.pragma('journal_mode = WAL');

  // Create tables
  db.exec(`
    -- Sessions table
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      project_path TEXT,
      git_branch TEXT,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      total_input_tokens INTEGER DEFAULT 0,
      total_output_tokens INTEGER DEFAULT 0,
      total_cache_read_tokens INTEGER DEFAULT 0,
      total_cache_write_tokens INTEGER DEFAULT 0,
      total_cost_usd REAL DEFAULT 0,
      version TEXT
    );

    -- Events table
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      event_type TEXT NOT NULL CHECK(event_type IN ('hook', 'transcript')),
      hook_event_name TEXT,
      entry_type TEXT,
      tool_name TEXT,
      tool_input TEXT,
      tool_response TEXT,
      content TEXT,
      tokens_input INTEGER,
      tokens_output INTEGER,
      cache_read_tokens INTEGER,
      cache_write_tokens INTEGER,
      cost REAL,
      model TEXT,
      timestamp TEXT NOT NULL,
      uuid TEXT,
      parent_uuid TEXT,
      raw_data TEXT,
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    );

    -- MCP tools statistics
    CREATE TABLE IF NOT EXISTS mcp_tools (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      tool_name TEXT NOT NULL,
      server_name TEXT,
      invocation_count INTEGER DEFAULT 1,
      success_count INTEGER DEFAULT 0,
      error_count INTEGER DEFAULT 0,
      total_duration_ms INTEGER DEFAULT 0,
      last_used_at TEXT,
      FOREIGN KEY (session_id) REFERENCES sessions(id),
      UNIQUE(session_id, tool_name)
    );

    -- File positions for incremental transcript reading
    CREATE TABLE IF NOT EXISTS file_positions (
      file_path TEXT PRIMARY KEY,
      position INTEGER DEFAULT 0,
      last_read_at TEXT
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id);
    CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
    CREATE INDEX IF NOT EXISTS idx_events_tool ON events(tool_name);
    CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
    CREATE INDEX IF NOT EXISTS idx_mcp_tools_name ON mcp_tools(tool_name);
    CREATE INDEX IF NOT EXISTS idx_sessions_started ON sessions(started_at);
  `);

  // Clean up any existing duplicate events BEFORE creating unique index
  const duplicates = db.prepare(`
    SELECT uuid, MIN(id) as keep_id
    FROM events
    WHERE uuid IS NOT NULL
    GROUP BY uuid
    HAVING COUNT(*) > 1
  `).all() as { uuid: string; keep_id: number }[];

  if (duplicates.length > 0) {
    console.log(`[DB] Found ${duplicates.length} duplicate UUIDs, cleaning up...`);

    for (const { uuid, keep_id } of duplicates) {
      // Get the cost of events we're about to delete
      const toDelete = db.prepare(`
        SELECT session_id, COALESCE(cost, 0) as cost,
               COALESCE(tokens_input, 0) as tokens_input,
               COALESCE(tokens_output, 0) as tokens_output
        FROM events
        WHERE uuid = ? AND id != ?
      `).all(uuid, keep_id) as { session_id: string; cost: number; tokens_input: number; tokens_output: number }[];

      // Subtract the duplicate costs from session totals
      for (const event of toDelete) {
        db.prepare(`
          UPDATE sessions
          SET total_cost_usd = total_cost_usd - ?,
              total_input_tokens = total_input_tokens - ?,
              total_output_tokens = total_output_tokens - ?
          WHERE id = ?
        `).run(event.cost, event.tokens_input, event.tokens_output, event.session_id);
      }

      // Delete the duplicate events
      db.prepare('DELETE FROM events WHERE uuid = ? AND id != ?').run(uuid, keep_id);
    }

    console.log(`[DB] Cleaned up duplicate events`);
  }

  // Now create unique index on UUID to prevent future duplicates (only for non-null UUIDs)
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_events_uuid_unique ON events(uuid) WHERE uuid IS NOT NULL;
  `);

  // Fix session started_at to use the earliest event timestamp
  // This corrects sessions that were created when ccmonitor first ran and
  // incorrectly got the processing time instead of the actual session start time
  const sessionsToFix = db.prepare(`
    SELECT s.id, s.started_at as current_start, MIN(e.timestamp) as actual_start
    FROM sessions s
    JOIN events e ON s.id = e.session_id
    GROUP BY s.id
    HAVING MIN(e.timestamp) < s.started_at
  `).all() as { id: string; current_start: string; actual_start: string }[];

  if (sessionsToFix.length > 0) {
    console.log(`[DB] Fixing started_at for ${sessionsToFix.length} sessions...`);

    const updateStmt = db.prepare('UPDATE sessions SET started_at = ? WHERE id = ?');
    for (const session of sessionsToFix) {
      updateStmt.run(session.actual_start, session.id);
    }

    console.log(`[DB] Fixed session start times`);
  }

  // Add cache columns if they don't exist (migration)
  const eventColumns = db.prepare("PRAGMA table_info(events)").all() as { name: string }[];
  const eventColumnNames = eventColumns.map(c => c.name);

  if (!eventColumnNames.includes('cache_read_tokens')) {
    console.log('[DB] Adding cache_read_tokens column to events...');
    db.exec('ALTER TABLE events ADD COLUMN cache_read_tokens INTEGER');
  }
  if (!eventColumnNames.includes('cache_write_tokens')) {
    console.log('[DB] Adding cache_write_tokens column to events...');
    db.exec('ALTER TABLE events ADD COLUMN cache_write_tokens INTEGER');
  }

  const sessionColumns = db.prepare("PRAGMA table_info(sessions)").all() as { name: string }[];
  const sessionColumnNames = sessionColumns.map(c => c.name);

  if (!sessionColumnNames.includes('total_cache_read_tokens')) {
    console.log('[DB] Adding total_cache_read_tokens column to sessions...');
    db.exec('ALTER TABLE sessions ADD COLUMN total_cache_read_tokens INTEGER DEFAULT 0');
  }
  if (!sessionColumnNames.includes('total_cache_write_tokens')) {
    console.log('[DB] Adding total_cache_write_tokens column to sessions...');
    db.exec('ALTER TABLE sessions ADD COLUMN total_cache_write_tokens INTEGER DEFAULT 0');
  }

  // Backfill cache tokens from raw_data for existing events
  const eventsToBackfill = db.prepare(`
    SELECT id, raw_data
    FROM events
    WHERE raw_data IS NOT NULL
      AND cache_read_tokens IS NULL
      AND cost > 0
    LIMIT 1000
  `).all() as { id: number; raw_data: string }[];

  if (eventsToBackfill.length > 0) {
    console.log(`[DB] Backfilling cache tokens for ${eventsToBackfill.length} events...`);
    const updateStmt = db.prepare('UPDATE events SET cache_read_tokens = ?, cache_write_tokens = ? WHERE id = ?');

    for (const event of eventsToBackfill) {
      try {
        const data = JSON.parse(event.raw_data);
        const cacheRead = data?.message?.usage?.cache_read_input_tokens || 0;
        const cacheWrite = data?.message?.usage?.cache_creation_input_tokens || 0;
        updateStmt.run(cacheRead, cacheWrite, event.id);
      } catch {
        // Skip invalid JSON
      }
    }
    console.log('[DB] Backfilled cache tokens');
  }

  // Update session cache totals
  db.exec(`
    UPDATE sessions SET
      total_cache_read_tokens = COALESCE((
        SELECT SUM(COALESCE(cache_read_tokens, 0))
        FROM events WHERE events.session_id = sessions.id
      ), 0),
      total_cache_write_tokens = COALESCE((
        SELECT SUM(COALESCE(cache_write_tokens, 0))
        FROM events WHERE events.session_id = sessions.id
      ), 0)
    WHERE total_cache_read_tokens = 0 OR total_cache_read_tokens IS NULL
  `);

  return db;
}
