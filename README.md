# Claude Code Monitor

A comprehensive monitoring and analytics platform for Claude Code. Track sessions, monitor API usage, analyze costs, and visualize MCP tool interactions with a real-time web dashboard.

## Features

- **Real-time Session Tracking** - Monitor active Claude Code sessions as they happen
- **Token Usage & Cost Tracking** - Track input/output tokens with accurate cost calculations for all Claude models
- **MCP Tool Statistics** - Analyze Model Context Protocol tool usage with success/error rates
- **Cost Analysis** - Multi-dimensional cost breakdown by tool, model, entry type, and time
- **AI-Powered Optimization** - Get optimization suggestions powered by Google Gemini
- **Live Dashboard** - WebSocket-based real-time updates for instant visibility

## Architecture

This is a monorepo with three packages:

```
ccmonitor/
├── hooks/     # Claude Code integration hooks
├── server/    # Backend API (Fastify + SQLite)
└── web/       # Frontend dashboard (React + Vite)
```

## Prerequisites

- Node.js 18+
- Claude Code installed with projects directory (`~/.claude/projects`)

## Installation

```bash
# Install all dependencies
npm install

# Install Claude Code hooks
npm run install-hooks
```

## Running

### Development

```bash
# Start both server and web dashboard
npm run dev
```

Or run them separately:

```bash
npm run server   # Backend on http://localhost:3456
npm run web      # Frontend on http://localhost:5173
```

### Production Build

```bash
npm run build
```

## Usage

1. Start the development server: `npm run dev`
2. Open http://localhost:5173 in your browser
3. Use Claude Code normally - the monitor will automatically track your sessions

### Dashboard Sections

- **Activity Stream** - Real-time event feed
- **Sessions** - Browse and inspect individual sessions
- **MCP Tools** - Tool usage statistics and trends
- **Cost Tracker** - Daily cost trends and breakdowns
- **Cost Analyzer** - Multi-dimensional cost analysis
- **AI Optimizer** - AI-powered optimization suggestions

## Configuration

Environment variables (all optional):

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3456` | Server port |
| `HOST` | `0.0.0.0` | Server host |
| `DB_PATH` | `./data/ccmonitor.db` | SQLite database path |
| `CLAUDE_PROJECTS_PATH` | `~/.claude/projects` | Claude transcript directory |

### AI Analysis

To use the AI optimization feature, you'll need a Google Gemini API key. Enter it in the AI Optimizer section of the dashboard.

## Data Flow

```
Claude Code
    │
    ├── [Hook Events] ──────→ POST /api/events
    │                              │
    └── [Transcript Files] ──→ File Watcher
                                   │
                                   ▼
                            SQLite Database
                                   │
                    ┌──────────────┼──────────────┐
                    ▼              ▼              ▼
               REST APIs     WebSocket      Statistics
                    │              │              │
                    └──────────────┴──────────────┘
                                   │
                                   ▼
                            Web Dashboard
```

## Supported Models

Cost tracking supports current Claude model pricing:

- Claude Opus 4.5
- Claude Sonnet 4
- Claude Sonnet 3.5
- Claude Haiku 3.5

## Tech Stack

**Server:** Fastify, SQLite (better-sqlite3), Chokidar, WebSocket

**Web:** React 18, Vite, Tailwind CSS, Radix UI, Recharts, Zustand

**Shared:** TypeScript, npm workspaces

## License

MIT
