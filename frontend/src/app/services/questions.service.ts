import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export type LlmProviderId = 'claude' | 'codex' | 'ollama';
export type TranscriberModel = 'small' | 'medium' | 'large-v3';

export type Question = {
  id: string;
  name: string;
  prompt: string;
  autoRun: boolean;
  providerOverride: LlmProviderId | null;
  isDefault: boolean;
  ownerEmail: string;
  createdAt: number;
  updatedAt: number;
};

export type LlmSettings = {
  defaultProvider: LlmProviderId;
  defaultOllamaModel: string;
  transcriberModel: TranscriberModel;
};

export type Analysis = {
  schemaVersion: 1;
  filename: string;
  questionId: string;
  questionName: string;
  questionSlug: string;
  provider: LlmProviderId;
  model: string;
  ranAtIso: string;
  text: string;
  latencyMs: number;
};

export type QuestionPayload = {
  name: string;
  prompt: string;
  autoRun: boolean;
  providerOverride: LlmProviderId | null;
};

@Injectable({ providedIn: 'root' })
export class QuestionsService {
  private readonly http = inject(HttpClient);

  async list(): Promise<Question[]> {
    const res = await firstValueFrom(this.http.get<{ questions: Question[] }>('/api/questions'));
    return res.questions;
  }

  async create(payload: QuestionPayload): Promise<Question> {
    const res = await firstValueFrom(this.http.post<{ question: Question }>('/api/questions', payload));
    return res.question;
  }

  async update(id: string, payload: QuestionPayload): Promise<Question> {
    const res = await firstValueFrom(this.http.put<{ question: Question }>(`/api/questions/${encodeURIComponent(id)}`, payload));
    return res.question;
  }

  async delete(id: string): Promise<void> {
    await firstValueFrom(this.http.delete<void>(`/api/questions/${encodeURIComponent(id)}`));
  }

  async star(id: string): Promise<Question> {
    const res = await firstValueFrom(this.http.post<{ question: Question }>(`/api/questions/${encodeURIComponent(id)}/star`, {}));
    return res.question;
  }

  async settings(): Promise<LlmSettings> {
    return firstValueFrom(this.http.get<LlmSettings>('/api/llm/settings'));
  }

  async updateSettings(payload: Partial<Pick<LlmSettings, 'defaultProvider' | 'transcriberModel'>>): Promise<LlmSettings> {
    return firstValueFrom(this.http.put<LlmSettings>('/api/llm/settings', payload));
  }

  async analyze(filename: string, questionId: string, providerOverride?: LlmProviderId | null): Promise<Analysis> {
    const res = await firstValueFrom(
      this.http.post<{ analysis: Analysis }>(`/api/recordings/${encodeURIComponent(filename)}/analyze`, {
        questionId,
        providerOverride: providerOverride || undefined,
      }),
    );
    return res.analysis;
  }

  async listAnalyses(filename: string): Promise<Analysis[]> {
    const res = await firstValueFrom(
      this.http.get<{ analyses: Analysis[] }>(`/api/recordings/${encodeURIComponent(filename)}/analysis`),
    );
    return res.analyses;
  }
}
