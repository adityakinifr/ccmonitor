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

  return db;
}
