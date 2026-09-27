import Database from 'better-sqlite3';
import { calculateCost } from '../services/token-calculator.js';

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
      message_id TEXT,
      -- Size of a tool_result's payload, so oversized results can be surfaced
      -- without re-parsing raw_data on every query.
      result_bytes INTEGER,
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

    -- One-shot migration markers, so data repairs don't re-run every boot.
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );

    -- Open tool calls awaiting their tool_result. Lets a result be attributed
    -- back to the tool that produced it (and, for MCP, its success/error).
    -- Rows are deleted as results arrive, so this stays small.
    CREATE TABLE IF NOT EXISTS mcp_tool_calls (
      tool_use_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      tool_name TEXT NOT NULL
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

  // Removal of adaptive mode and the task board (migration): drop their tables.
  db.exec(`
    DROP TABLE IF EXISTS approval_embeddings;
    DROP TABLE IF EXISTS approval_decisions;
    DROP TABLE IF EXISTS approval_rules;
    DROP TABLE IF EXISTS tasks;
  `);

  const hasRun = (name: string): boolean =>
    !!db.prepare('SELECT 1 FROM schema_migrations WHERE name = ?').get(name);
  const markRun = (name: string): void => {
    db.prepare('INSERT OR REPLACE INTO schema_migrations (name, applied_at) VALUES (?, ?)').run(
      name,
      new Date().toISOString()
    );
  };

  // --- message-id dedup (migration) ---------------------------------------
  // Events were previously deduplicated on uuid alone. Resumed, forked and
  // subagent transcripts re-emit the same API response with a fresh uuid, so
  // one billed response could land as a dozen rows and inflate every cost
  // figure. Backfill the message id, collapse the duplicates, then enforce it.
  const REPAIR = 'dedup-by-message-id-and-project-backfill';
  const eventCols = db.prepare("PRAGMA table_info(events)").all() as { name: string }[];
  if (!eventCols.some((c) => c.name === 'message_id')) {
    console.log('[DB] Adding message_id column to events...');
    db.exec('ALTER TABLE events ADD COLUMN message_id TEXT');
  }

  // User entries and tool results legitimately have no message id, so they stay
  // null forever -- gate on the marker instead of re-scanning them every boot.
  const unbackfilled = hasRun(REPAIR)
    ? { n: 0 }
    : (db
        .prepare("SELECT COUNT(*) as n FROM events WHERE message_id IS NULL AND raw_data IS NOT NULL")
        .get() as { n: number });
  if (unbackfilled.n > 0) {
    console.log(`[DB] Backfilling message_id for ${unbackfilled.n} events...`);
    db.exec(`
      UPDATE events
      SET message_id = json_extract(raw_data, '$.message.id')
      WHERE message_id IS NULL
        AND raw_data IS NOT NULL
        AND json_valid(raw_data)
        AND json_extract(raw_data, '$.message.id') IS NOT NULL
    `);
  }

  const dupMessages = hasRun(REPAIR)
    ? { groups: 0, extra: 0 }
    : (db
        .prepare(
          `SELECT COUNT(*) as groups, COALESCE(SUM(copies - 1), 0) as extra FROM (
             SELECT COUNT(*) as copies FROM events
             WHERE message_id IS NOT NULL GROUP BY message_id HAVING COUNT(*) > 1
           )`
        )
        .get() as { groups: number; extra: number });

  if (dupMessages.extra > 0) {
    console.log(
      `[DB] Zeroing usage on ${dupMessages.extra} repeated lines across ${dupMessages.groups} message ids...`
    );
    // Do NOT delete these rows. Claude Code writes one API response as several
    // transcript lines -- one per content block (thinking, text, each tool_use)
    // -- and repeats the full usage on every one. Counting each line bills the
    // response several times over, but the lines carry different content, so
    // deleting them loses the tool calls recorded only there. Keep every row;
    // charge the first of each group and zero the rest.
    db.exec(`
      UPDATE events
      SET cost = 0, tokens_input = 0, tokens_output = 0,
          cache_read_tokens = 0, cache_write_tokens = 0
      WHERE message_id IS NOT NULL
        AND id NOT IN (SELECT MIN(id) FROM events WHERE message_id IS NOT NULL GROUP BY message_id)
    `);
    console.log('[DB] Repeated lines zeroed');
  }

  // Plain index: message_id is legitimately non-unique (see above).
  db.exec('DROP INDEX IF EXISTS idx_events_message_id_unique');
  db.exec('CREATE INDEX IF NOT EXISTS idx_events_message_id ON events(message_id)');

  // --- project_path backfill (migration) -----------------------------------
  // Sessions whose transcript opened with a metadata line (mode/last-prompt/
  // ai-title) were inserted with a null project_path and never corrected, so
  // their spend was missing from project stats entirely. The cwd is recoverable
  // from the raw transcript entries.
  // Sessions whose transcripts are gone can never be attributed, so this is
  // gated on the marker rather than re-scanning on every boot.
  const orphaned = hasRun(REPAIR)
    ? { n: 0 }
    : (db
        .prepare("SELECT COUNT(*) as n FROM sessions WHERE project_path IS NULL OR project_path = ''")
        .get() as { n: number });
  if (orphaned.n > 0) {
    console.log(`[DB] Backfilling project_path for ${orphaned.n} sessions...`);
    db.exec(`
      UPDATE sessions SET project_path = (
        SELECT json_extract(e.raw_data, '$.cwd') FROM events e
        WHERE e.session_id = sessions.id
          AND e.raw_data IS NOT NULL
          AND json_valid(e.raw_data)
          AND json_extract(e.raw_data, '$.cwd') IS NOT NULL
        ORDER BY e.id LIMIT 1
      )
      WHERE project_path IS NULL OR project_path = ''
    `);
    db.exec(`
      UPDATE sessions SET git_branch = (
        SELECT json_extract(e.raw_data, '$.gitBranch') FROM events e
        WHERE e.session_id = sessions.id
          AND e.raw_data IS NOT NULL
          AND json_valid(e.raw_data)
          AND json_extract(e.raw_data, '$.gitBranch') IS NOT NULL
        ORDER BY e.id LIMIT 1
      )
      WHERE git_branch IS NULL OR git_branch = ''
    `);
    const stillNull = db
      .prepare("SELECT COUNT(*) as n FROM sessions WHERE project_path IS NULL OR project_path = ''")
      .get() as { n: number };
    console.log(`[DB] project_path backfilled (${stillNull.n} sessions still unattributed)`);
  }

  // --- session totals rebuild ----------------------------------------------
  // Totals were accumulated incrementally as events arrived, so they still
  // carry the duplicates removed above. Recompute them from the events table,
  // which is now the single source of truth.
  if (dupMessages.extra > 0 || orphaned.n > 0) {
    console.log('[DB] Recomputing session totals from events...');
    db.exec(`
      UPDATE sessions SET
        total_input_tokens = COALESCE((SELECT SUM(COALESCE(tokens_input, 0)) FROM events WHERE events.session_id = sessions.id), 0),
        total_output_tokens = COALESCE((SELECT SUM(COALESCE(tokens_output, 0)) FROM events WHERE events.session_id = sessions.id), 0),
        total_cache_read_tokens = COALESCE((SELECT SUM(COALESCE(cache_read_tokens, 0)) FROM events WHERE events.session_id = sessions.id), 0),
        total_cache_write_tokens = COALESCE((SELECT SUM(COALESCE(cache_write_tokens, 0)) FROM events WHERE events.session_id = sessions.id), 0),
        total_cost_usd = COALESCE((SELECT SUM(COALESCE(cost, 0)) FROM events WHERE events.session_id = sessions.id), 0)
    `);
    console.log('[DB] Session totals recomputed');
  }

  // --- MCP outcome counters reset (migration) ------------------------------
  // success_count used to be incremented at tool_use time with a hardcoded
  // true, so every historical row claims a 100% success rate and zero errors.
  // Those numbers were never observed; clear them so the rate reflects only
  // outcomes actually read off a tool_result from here on.
  const MCP_RESET = 'reset-fabricated-mcp-success-counts';
  if (!hasRun(MCP_RESET)) {
    const fabricated = db
      .prepare('SELECT COUNT(*) as n FROM mcp_tools WHERE success_count > 0 AND error_count = 0')
      .get() as { n: number };
    if (fabricated.n > 0) {
      console.log(`[DB] Clearing unobserved success counts on ${fabricated.n} MCP tool rows...`);
      db.exec('UPDATE mcp_tools SET success_count = 0, error_count = 0');
    }
    markRun(MCP_RESET);
  }

  // --- recost at corrected rates (migration) --------------------------------
  // Opus 5.5 had no pricing entry and prefix-matched Opus 5 ($5/$25 instead of
  // $4/$20), and Fable 5.1 / Mythos 5.1 cache reads were derived as 0.1x input
  // instead of their published $0.25/MTok. Both overcharged. Recompute the
  // affected rows from the usage still stored in raw_data.
  const RECOST = 'recost-opus-5-5-and-fable-5-1-cache-reads';
  if (!hasRun(RECOST)) {
    const affected = db
      .prepare(
        `SELECT id, model, raw_data FROM events
         WHERE cost IS NOT NULL AND raw_data IS NOT NULL AND json_valid(raw_data)
           AND (model LIKE 'claude-opus-5-5%' OR model LIKE 'claude-fable-5-1%' OR model LIKE 'claude-mythos-5-1%')`
      )
      .all() as { id: number; model: string; raw_data: string }[];

    if (affected.length > 0) {
      console.log(`[DB] Recosting ${affected.length} events at corrected rates...`);
      const update = db.prepare('UPDATE events SET cost = ? WHERE id = ?');
      const run = db.transaction(() => {
        for (const row of affected) {
          try {
            const usage = JSON.parse(row.raw_data).message?.usage;
            if (usage) update.run(calculateCost(row.model, usage), row.id);
          } catch {
            // Leave rows whose raw_data can't be read at their stored cost.
          }
        }
      });
      run();

      db.exec(`
        UPDATE sessions SET
          total_cost_usd = COALESCE((SELECT SUM(COALESCE(cost, 0)) FROM events WHERE events.session_id = sessions.id), 0)
      `);
      console.log('[DB] Recosted and session totals updated');
    }
    markRun(RECOST);
  }

  // --- tool_result attribution (migration) ---------------------------------
  // Surface which tool injected how much context. result_bytes is the payload
  // size; tool_name is resolved back through the tool_use_id that produced it.
  const colsNow = db.prepare("PRAGMA table_info(events)").all() as { name: string }[];
  if (!colsNow.some((c) => c.name === 'result_bytes')) {
    console.log('[DB] Adding result_bytes column to events...');
    db.exec('ALTER TABLE events ADD COLUMN result_bytes INTEGER');
  }

  // Sizing is idempotent and cheap: gated on the column being null, not a marker.
  db.exec(`
    UPDATE events
    SET result_bytes = LENGTH(raw_data)
    WHERE entry_type = 'tool_result' AND result_bytes IS NULL AND raw_data IS NOT NULL
  `);

  // Attribution is separately guarded so an interrupted run resumes instead of
  // being marked done. It completes only when nothing is left to attribute.
  const TOOLNAMES = 'backfill-tool-result-names';
  if (!hasRun(TOOLNAMES)) {
    const results = db
      .prepare(
        `SELECT id, raw_data FROM events
         WHERE entry_type = 'tool_result' AND tool_name IS NULL
           AND raw_data IS NOT NULL AND json_valid(raw_data)`
      )
      .all() as { id: number; raw_data: string }[];

    if (results.length > 0) {
      console.log(`[DB] Attributing ${results.length} tool results to their tools...`);

      // tool_use_id -> tool name, from the assistant turns that issued them.
      const names = new Map<string, string>();
      const assistants = db
        .prepare(
          `SELECT raw_data FROM events
           WHERE entry_type = 'assistant' AND tool_name IS NOT NULL
             AND raw_data IS NOT NULL AND json_valid(raw_data)`
        )
        .all() as { raw_data: string }[];
      for (const row of assistants) {
        try {
          for (const block of JSON.parse(row.raw_data).message?.content || []) {
            if (block?.type === 'tool_use' && block.id) names.set(block.id, block.name);
          }
        } catch {
          // Skip entries we can't read.
        }
      }

      const setName = db.prepare('UPDATE events SET tool_name = ? WHERE id = ?');
      let matched = 0;
      const attribute = db.transaction(() => {
        for (const row of results) {
          try {
            const content = JSON.parse(row.raw_data).message?.content;
            if (!Array.isArray(content)) continue;
            for (const block of content) {
              if (block?.type !== 'tool_result') continue;
              const name = names.get(block.tool_use_id);
              if (name) {
                setName.run(name, row.id);
                matched++;
                break;
              }
            }
          } catch {
            // Skip entries we can't read.
          }
        }
      });
      attribute();
      console.log(
        `[DB] Attributed ${matched} of ${results.length} tool results ` +
          `(${names.size} tool calls indexed)`
      );
    }
    markRun(TOOLNAMES);
  }

  markRun(REPAIR);

  return db;
}
