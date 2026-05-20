import { Component, CUSTOM_ELEMENTS_SCHEMA, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { addIcons } from 'ionicons';
import { closeOutline, createOutline, saveOutline, star, starOutline, trashOutline } from 'ionicons/icons';
import { LlmProviderId, Question, QuestionPayload, QuestionsService, TranscriberModel } from '../../services/questions.service';

type QuestionForm = QuestionPayload & { id: string | null };

const EMPTY_FORM: QuestionForm = {
  id: null,
  name: '',
  prompt: '',
  autoRun: false,
  providerOverride: null,
};

@Component({
  selector: 'app-settings-page',
  standalone: true,
  imports: [FormsModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './settings.page.html',
  styleUrl: './settings.page.scss',
})
export class SettingsPage {
  private readonly questionsService = inject(QuestionsService);

  readonly providers: { id: LlmProviderId; label: string; detail: string }[] = [
    { id: 'claude', label: 'Claude Sonnet', detail: 'CLI provider' },
    { id: 'codex', label: 'Codex gpt-5.3-codex-spark', detail: 'CLI provider' },
    { id: 'ollama', label: 'Ollama mistral-nemo:12b', detail: 'Local HTTP provider' },
  ];
  readonly transcriberModels: { id: TranscriberModel; label: string; detail: string }[] = [
    { id: 'small', label: 'small', detail: 'Faster first pass; lower accuracy' },
    { id: 'medium', label: 'medium', detail: 'Current default balance' },
    { id: 'large-v3', label: 'large-v3', detail: 'Highest accuracy; downloads on first use' },
  ];
  readonly questions = signal<Question[]>([]);
  readonly defaultProvider = signal<LlmProviderId>('ollama');
  readonly defaultOllamaModel = signal('mistral-nemo:12b');
  readonly transcriberModel = signal<TranscriberModel>('medium');
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly status = signal<string | null>(null);
  readonly form = signal<QuestionForm>({ ...EMPTY_FORM });
  readonly editing = computed(() => this.form().id != null);

  constructor() {
    addIcons({ closeOutline, createOutline, saveOutline, star, starOutline, trashOutline });
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const [settings, questions] = await Promise.all([this.questionsService.settings(), this.questionsService.list()]);
      this.defaultProvider.set(settings.defaultProvider);
      this.defaultOllamaModel.set(settings.defaultOllamaModel);
      this.transcriberModel.set(settings.transcriberModel);
      this.questions.set(questions);
    } catch {
      this.error.set('Settings could not be loaded');
    } finally {
      this.loading.set(false);
    }
  }

  async setDefaultProvider(provider: LlmProviderId): Promise<void> {
    this.saving.set(true);
    this.error.set(null);
    this.status.set(null);
    try {
      const settings = await this.questionsService.updateSettings({ defaultProvider: provider });
      this.defaultProvider.set(settings.defaultProvider);
      this.defaultOllamaModel.set(settings.defaultOllamaModel);
      this.transcriberModel.set(settings.transcriberModel);
      this.status.set('Default provider saved');
    } catch {
      this.error.set('Default provider could not be saved');
    } finally {
      this.saving.set(false);
    }
  }

  async setTranscriberModel(model: TranscriberModel): Promise<void> {
    this.saving.set(true);
    this.error.set(null);
    this.status.set(null);
    try {
      const settings = await this.questionsService.updateSettings({ transcriberModel: model });
      this.defaultProvider.set(settings.defaultProvider);
      this.defaultOllamaModel.set(settings.defaultOllamaModel);
      this.transcriberModel.set(settings.transcriberModel);
      this.status.set('Transcriber model saved');
    } catch {
      this.error.set('Transcriber model could not be saved');
    } finally {
      this.saving.set(false);
    }
  }

  edit(question: Question): void {
    this.form.set({
      id: question.id,
      name: question.name,
      prompt: question.prompt,
      autoRun: question.autoRun,
      providerOverride: question.providerOverride,
    });
  }

  resetForm(): void {
    this.form.set({ ...EMPTY_FORM });
  }

  async saveQuestion(): Promise<void> {
    const form = this.form();
    if (!form.name.trim() || !form.prompt.trim()) return;
    this.saving.set(true);
    this.error.set(null);
    this.status.set(null);
    const payload: QuestionPayload = {
      name: form.name.trim(),
      prompt: form.prompt.trim(),
      autoRun: form.autoRun,
      providerOverride: form.providerOverride || null,
    };
    try {
      if (form.id) {
        await this.questionsService.update(form.id, payload);
        this.status.set('Question updated');
      } else {
        await this.questionsService.create(payload);
        this.status.set('Question created');
      }
      this.resetForm();
      this.questions.set(await this.questionsService.list());
    } catch {
      this.error.set('Question could not be saved');
    } finally {
      this.saving.set(false);
    }
  }

  async starQuestion(question: Question): Promise<void> {
    this.saving.set(true);
    this.error.set(null);
    this.status.set(null);
    try {
      await this.questionsService.star(question.id);
      this.questions.set(await this.questionsService.list());
      this.status.set('Default question saved');
    } catch {
      this.error.set('Default question could not be saved');
    } finally {
      this.saving.set(false);
    }
  }

  async deleteQuestion(question: Question): Promise<void> {
    if (!window.confirm(`Delete ${question.name}?`)) return;
    this.saving.set(true);
    this.error.set(null);
    this.status.set(null);
    try {
      await this.questionsService.delete(question.id);
      if (this.form().id === question.id) this.resetForm();
      this.questions.set(await this.questionsService.list());
      this.status.set('Question deleted');
    } catch {
      this.error.set('Question could not be deleted');
    } finally {
      this.saving.set(false);
    }
  }

  providerLabel(provider: LlmProviderId | null): string {
    if (!provider) return 'Default';
    return this.providers.find((item) => item.id === provider)?.label ?? provider;
  }

  updateForm<K extends keyof QuestionForm>(key: K, value: QuestionForm[K]): void {
    this.form.update((current) => ({ ...current, [key]: value }));
  }
}
