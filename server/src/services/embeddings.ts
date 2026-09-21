/**
 * Embedding service for adaptive mode
 * Uses Ollama with qwen3-embedding model for local embeddings
 */

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'qwen3-embedding';

export interface SimilarMatch {
  id: number;
  similarity: number;
  approvalCount: number;
  denialCount: number;
  toolInputText: string;
  projectPath: string | null;
}

/**
 * Generate embedding for a tool call using Ollama
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        prompt: text,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as { embedding: number[] };
    return data.embedding;
  } catch (error) {
    console.error('[Embeddings] Failed to generate embedding:', error);
    throw error;
  }
}

/**
 * Normalize tool input to searchable text
 * Extracts meaningful information based on tool type
 */
export function normalizeToolInput(
  toolName: string,
  toolInput: Record<string, unknown>
): string {
  const parts: string[] = [toolName];

  // File operation tools
  if (['Read', 'Write', 'Edit', 'Glob'].includes(toolName)) {
    const filePath = (toolInput.file_path || toolInput.path || toolInput.pattern) as string;
    if (filePath) {
      // Extract relative path (remove home directory and common prefixes)
      const normalized = filePath
        .replace(/^\/Users\/[^/]+\//, '')
        .replace(/^\/home\/[^/]+\//, '')
        .replace(/^~\//, '');
      parts.push('file', normalized);
    }

    // For Write/Edit, note if it's a config file or test file
    if (filePath) {
      if (filePath.includes('config') || filePath.includes('.env')) {
        parts.push('config');
      }
      if (filePath.includes('test') || filePath.includes('spec')) {
        parts.push('test');
      }
    }
  }

  // Bash commands
  if (toolName === 'Bash') {
    const command = toolInput.command as string;
    if (command) {
      // Extract base command and key arguments
      const normalized = normalizeCommand(command);
      parts.push(normalized);
    }
  }

  // Grep tool
  if (toolName === 'Grep') {
    const pattern = toolInput.pattern as string;
    if (pattern) {
      parts.push('pattern', pattern);
    }
    const path = toolInput.path as string;
    if (path) {
      parts.push('in', path);
    }
  }

  // Task tool (agent spawning)
  if (toolName === 'Task') {
    const description = toolInput.description as string;
    const subagentType = toolInput.subagent_type as string;
    if (subagentType) {
      parts.push('agent', subagentType);
    }
    if (description) {
      parts.push(description);
    }
  }

  // MCP tools - include full tool name
  if (toolName.startsWith('mcp__')) {
    // Already have the tool name, add any key parameters
    const keys = Object.keys(toolInput).slice(0, 3);
    for (const key of keys) {
      const value = toolInput[key];
      if (typeof value === 'string' && value.length < 100) {
        parts.push(`${key}:${value}`);
      }
    }
  }

  // WebFetch / WebSearch
  if (toolName === 'WebFetch' || toolName === 'WebSearch') {
    const url = toolInput.url as string;
    const query = toolInput.query as string;
    if (url) {
      // Extract domain
      try {
        const domain = new URL(url).hostname;
        parts.push('url', domain);
      } catch {
        parts.push('url', url.slice(0, 50));
      }
    }
    if (query) {
      parts.push('search', query);
    }
  }

  return parts.join(' ');
}

/**
 * Normalize bash command to a canonical form
 * Extracts the command base and important flags
 */
function normalizeCommand(command: string): string {
  const trimmed = command.trim();
  const parts = trimmed.split(/\s+/);

  if (parts.length === 0) return '';

  const baseCmd = parts[0];

  // Package managers - include action
  if (['npm', 'yarn', 'pnpm', 'bun'].includes(baseCmd)) {
    const action = parts[1] || '';
    if (['install', 'add', 'remove', 'uninstall', 'run', 'test', 'build', 'start'].includes(action)) {
      // Include package name if it's an install/add
      if (['install', 'add'].includes(action) && parts[2] && !parts[2].startsWith('-')) {
        return `${baseCmd} ${action} ${parts[2]}`;
      }
      return `${baseCmd} ${action}`;
    }
    return `${baseCmd} ${action}`;
  }

  // Git commands - include subcommand
  if (baseCmd === 'git') {
    const subCmd = parts[1] || '';
    // For dangerous commands, include more context
    if (['push', 'reset', 'checkout', 'branch', 'merge', 'rebase'].includes(subCmd)) {
      return parts.slice(0, 4).join(' ');
    }
    return `git ${subCmd}`;
  }

  // Docker commands
  if (baseCmd === 'docker' || baseCmd === 'docker-compose') {
    return parts.slice(0, 3).join(' ');
  }

  // kubectl commands
  if (baseCmd === 'kubectl') {
    return parts.slice(0, 3).join(' ');
  }

  // File operations - include target
  if (['rm', 'mv', 'cp', 'mkdir', 'touch', 'chmod', 'chown'].includes(baseCmd)) {
    // Include flags and first path argument
    const relevantParts = parts.filter(p => p.startsWith('-') || !p.includes('/') || parts.indexOf(p) < 4);
    return relevantParts.slice(0, 4).join(' ');
  }

  // For other commands, take first 3 parts
  return parts.slice(0, 3).join(' ');
}

/**
 * Calculate cosine similarity between two embedding vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Embedding dimension mismatch: ${a.length} vs ${b.length}`);
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}

/**
 * Convert embedding array to Buffer for SQLite storage
 */
export function embeddingToBuffer(embedding: number[]): Buffer {
  const float64Array = new Float64Array(embedding);
  return Buffer.from(float64Array.buffer);
}

/**
 * Convert Buffer back to embedding array
 */
export function bufferToEmbedding(buffer: Buffer): number[] {
  const float64Array = new Float64Array(buffer.buffer, buffer.byteOffset, buffer.length / 8);
  return Array.from(float64Array);
}

/**
 * Check if Ollama is available and the model is loaded
 */
export async function checkOllamaHealth(): Promise<{
  available: boolean;
  modelLoaded: boolean;
  error?: string;
}> {
  try {
    // Check if Ollama is running
    const response = await fetch(`${OLLAMA_URL}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      return { available: false, modelLoaded: false, error: 'Ollama not responding' };
    }

    const data = await response.json() as { models: { name: string }[] };
    const models = data.models || [];
    const modelLoaded = models.some(m => m.name.includes(EMBEDDING_MODEL.split(':')[0]));

    return { available: true, modelLoaded };
  } catch (error) {
    return {
      available: false,
      modelLoaded: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
