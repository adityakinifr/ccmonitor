import chokidar from 'chokidar';
import { TranscriptParser } from './transcript-parser.js';
import { config } from '../config.js';

export class TranscriptWatcher {
  private watcher: chokidar.FSWatcher | null = null;
  private parser: TranscriptParser;
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(parser: TranscriptParser) {
    this.parser = parser;
  }

  start(): void {
    console.log(`[TranscriptWatcher] Watching: ${config.claudeProjectsPath}`);

    this.watcher = chokidar.watch(`${config.claudeProjectsPath}/**/*.jsonl`, {
      persistent: true,
      ignoreInitial: false,
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100,
      },
    });

    this.watcher
      .on('add', (path) => this.handleFile(path, 'add'))
      .on('change', (path) => this.handleFile(path, 'change'))
      .on('error', (error) => console.error('[TranscriptWatcher] Error:', error));
  }

  private handleFile(filePath: string, event: string): void {
    // Debounce rapid changes
    const existing = this.debounceTimers.get(filePath);
    if (existing) {
      clearTimeout(existing);
    }

    const timer = setTimeout(() => {
      console.log(`[TranscriptWatcher] ${event}: ${filePath}`);
      try {
        this.parser.parseFile(filePath);
      } catch (error) {
        console.error(`[TranscriptWatcher] Error parsing ${filePath}:`, error);
      }
      this.debounceTimers.delete(filePath);
    }, config.watchDebounceMs);

    this.debounceTimers.set(filePath, timer);
  }

  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }
}
