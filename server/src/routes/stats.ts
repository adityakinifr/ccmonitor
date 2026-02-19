import type { FastifyInstance } from 'fastify';
import type { Repository } from '../db/repository.js';
import { GeminiAnalyzer } from '../services/gemini-analyzer.js';

export function registerStatsRoutes(app: FastifyInstance, repo: Repository): void {
  const geminiAnalyzer = new GeminiAnalyzer(repo);
  // Get overview stats
  app.get('/api/stats', async (_request, reply) => {
    const stats = repo.getStats();
    return reply.send(stats);
  });

  // Get MCP tool stats
  app.get('/api/stats/mcp', async (_request, reply) => {
    const tools = repo.getMcpToolStats();
    return reply.send({ tools });
  });

  // Get costs by day
  app.get<{
    Querystring: { days?: string };
  }>('/api/stats/costs', async (request, reply) => {
    const { days = '30' } = request.query;
    const costs = repo.getCostsByDay(parseInt(days, 10));
    return reply.send({ costs });
  });

  // Get today's costs by minute for granular trending
  app.get('/api/stats/costs/today', async (_request, reply) => {
    const costs = repo.getTodayCostsByMinute();
    const stats = repo.getStats();
    return reply.send({
      costs,
      totalCost: stats.totalCost,
      totalTokens: stats.totalTokens,
    });
  });

  // Get recent cost events (last N minutes)
  app.get<{
    Querystring: { minutes?: string };
  }>('/api/stats/costs/recent', async (request, reply) => {
    const { minutes = '60' } = request.query;
    const events = repo.getRecentCostEvents(parseInt(minutes, 10));
    return reply.send({ events });
  });

  // Cost analysis endpoint
  app.get('/api/stats/costs/analyze', async (_request, reply) => {
    const byTool = repo.analyzeCostsByTool();
    const byModel = repo.analyzeCostsByModel();
    const byEntryType = repo.analyzeCostsByEntryType();
    const byHour = repo.analyzeCostsByHour();
    const expensiveEvents = repo.getExpensiveEvents(20);
    const textResponsePatterns = repo.analyzeTextResponsePatterns();
    const contentLengthCost = repo.analyzeContentLengthCost();
    const stats = repo.getStats();

    return reply.send({
      byTool,
      byModel,
      byEntryType,
      byHour,
      expensiveEvents,
      textResponsePatterns,
      contentLengthCost,
      summary: {
        totalCost: stats.totalCost,
        totalTokens: stats.totalTokens,
        totalEvents: stats.totalEvents,
      },
    });
  });

  // AI-powered analysis with Gemini
  app.post<{
    Body: { apiKey: string };
  }>('/api/stats/ai-analyze', async (request, reply) => {
    const { apiKey } = request.body;

    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
      return reply.status(400).send({ error: 'Gemini API key is required' });
    }

    try {
      const analysis = await geminiAnalyzer.analyze(apiKey.trim());
      return reply.send({ analysis });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return reply.status(500).send({ error: message });
    }
  });
}
