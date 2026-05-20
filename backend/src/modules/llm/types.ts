export type LlmProviderId = 'claude' | 'codex' | 'ollama';

export interface LlmRequest {
  prompt: string;
  model?: string;
  timeoutMs?: number;
}

export interface LlmResponse {
  text: string;
  provider: LlmProviderId;
  model: string;
  latencyMs: number;
}

export interface LlmProvider {
  readonly id: LlmProviderId;
  available(): Promise<boolean>;
  invoke(req: LlmRequest): Promise<LlmResponse>;
}

export type LlmAvailability = Record<LlmProviderId, boolean>;
