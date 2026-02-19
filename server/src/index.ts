import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { config } from './config.js';
import { initializeDatabase } from './db/schema.js';
import { Repository } from './db/repository.js';
import { registerEventsRoutes } from './routes/events.js';
import { registerSessionsRoutes } from './routes/sessions.js';
import { registerStatsRoutes } from './routes/stats.js';
import { wsBroadcaster } from './services/websocket.js';
import { TranscriptParser } from './services/transcript-parser.js';
import { TranscriptWatcher } from './services/transcript-watcher.js';

async function main() {
  // Initialize database
  console.log(`[DB] Initializing database at: ${config.dbPath}`);
  const db = initializeDatabase(config.dbPath);
  const repo = new Repository(db);

  // Create Fastify instance
  const app = Fastify({
    logger: true,
  });

  // Register plugins
  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  await app.register(websocket);

  // WebSocket endpoint
  app.get('/ws', { websocket: true }, (connection) => {
    wsBroadcaster.addClient(connection);

    // Send initial stats
    const stats = repo.getStats();
    connection.socket.send(JSON.stringify({ type: 'stats_update', payload: stats }));
  });

  // Health check
  app.get('/health', async () => {
    return { status: 'ok', clients: wsBroadcaster.getClientCount() };
  });

  // Register routes
  registerEventsRoutes(app, repo);
  registerSessionsRoutes(app, repo);
  registerStatsRoutes(app, repo);

  // Start transcript watcher
  const parser = new TranscriptParser(repo);
  const watcher = new TranscriptWatcher(parser);
  watcher.start();

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\n[Server] Shutting down...');
    watcher.stop();
    await app.close();
    db.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Start server
  try {
    await app.listen({ port: config.port, host: config.host });
    console.log(`\n[Server] Claude Code Monitor running at http://${config.host}:${config.port}`);
    console.log(`[Server] WebSocket endpoint: ws://${config.host}:${config.port}/ws`);
    console.log(`[Server] Watching transcripts at: ${config.claudeProjectsPath}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
