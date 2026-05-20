import type { LlmAvailability, LlmProvider, LlmProviderId } from './types.js';

const PROVIDER_IDS: LlmProviderId[] = ['claude', 'codex', 'ollama'];

export function emptyAvailability(): LlmAvailability {
  return { claude: false, codex: false, ollama: false };
}

export class AvailabilityCache {
  private cached: { value: LlmAvailability; expiresAt: number } | null = null;

  constructor(
    private readonly providers: Map<LlmProviderId, LlmProvider>,
    private readonly ttlMs = 30_000,
  ) {}

  async get(force = false): Promise<LlmAvailability> {
    const now = Date.now();
    if (!force && this.cached && this.cached.expiresAt > now) return this.cached.value;

    const entries = await Promise.all(
      PROVIDER_IDS.map(async (id) => {
        const provider = this.providers.get(id);
        if (!provider) return [id, false] as const;
        try {
          return [id, await provider.available()] as const;
        } catch {
          return [id, false] as const;
        }
      }),
    );
    const value = entries.reduce<LlmAvailability>((acc, [id, available]) => {
      acc[id] = available;
      return acc;
    }, emptyAvailability());
    this.cached = { value, expiresAt: now + this.ttlMs };
    return value;
  }
}

export async function logBootAvailability(service: { availability(force?: boolean): Promise<LlmAvailability> }): Promise<void> {
  const availability = await service.availability(true);
  console.log(
    `[llm] availability claude=${availability.claude} codex=${availability.codex} ollama=${availability.ollama}`,
  );
}
