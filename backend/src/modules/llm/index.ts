import { Router } from 'express';
import type Database from 'better-sqlite3';
import { getDb } from '../../db.js';
import { requireAuth } from '../auth/middleware.js';
import { AvailabilityCache } from './availability-check.js';
import { ClaudeProvider } from './claude-provider.js';
import { CodexProvider } from './codex-provider.js';
import { OllamaProvider } from './ollama-provider.js';
import type { LlmAvailability, LlmProvider, LlmProviderId } from './types.js';

interface LlmServiceOptions {
  providers?: LlmProvider[];
  availabilityTtlMs?: number;
}

export class LlmService {
  private readonly providers: Map<LlmProviderId, LlmProvider>;
  private readonly availabilityCache: AvailabilityCache;

  constructor(options: LlmServiceOptions = {}) {
    const providers = options.providers ?? [new ClaudeProvider(), new CodexProvider(), new OllamaProvider()];
    this.providers = new Map(providers.map((provider) => [provider.id, provider]));
    this.availabilityCache = new AvailabilityCache(this.providers, options.availabilityTtlMs);
  }

  get(id: LlmProviderId): LlmProvider {
    const provider = this.providers.get(id);
    if (!provider) throw new Error(`Unknown LLM provider: ${id}`);
    return provider;
  }

  availability(force = false): Promise<LlmAvailability> {
    return this.availabilityCache.get(force);
  }
}

export function llmRouter(
  database: Database.Database = getDb(),
  service: Pick<LlmService, 'availability'> = new LlmService(),
): Router {
  const router = Router();
  const auth = requireAuth(database);

  router.get('/llm/health', auth, async (_req, res) => {
    try {
      return res.json(await service.availability());
    } catch {
      return res.json({ claude: false, codex: false, ollama: false });
    }
  });

  return router;
}

export type { LlmAvailability, LlmProvider, LlmProviderId, LlmRequest, LlmResponse } from './types.js';
export { logBootAvailability } from './availability-check.js';
export { ClaudeProvider } from './claude-provider.js';
export { CodexProvider } from './codex-provider.js';
export { OllamaProvider } from './ollama-provider.js';
