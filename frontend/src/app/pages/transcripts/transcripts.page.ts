import { DatePipe } from '@angular/common';
import { Component, CUSTOM_ELEMENTS_SCHEMA, OnDestroy, computed, inject, signal } from '@angular/core';
import { addIcons } from 'ionicons';
import {
  addCircleOutline,
  downloadOutline,
  eyeOutline,
  playCircleOutline,
  refreshOutline,
  sparklesOutline,
  starOutline,
  trashOutline,
} from 'ionicons/icons';
import { Analysis, Question, QuestionsService } from '../../services/questions.service';
import {
  groupRecordingsByMeeting,
  MeetingGroup,
  NamedTranscript,
  Recording,
  RecordingsService,
  Transcript,
  TranscriptProvider,
  TranscriptVersion,
} from '../../services/recordings.service';

const LOCAL_MODELS = ['small', 'medium', 'large-v3'] as const;
const OPENROUTER_MODELS = ['openai/whisper-1', 'openai/gpt-4o-transcribe'] as const;

function buildMeetingTranscriptFilename(roomTitle: string, whenIso: string | null): string {
  const safeTitle = roomTitle.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_') || 'Meeting';
  const date = whenIso ? new Date(whenIso) : null;
  const pad = (value: number) => String(value).padStart(2, '0');
  const stamp = date && !Number.isNaN(date.getTime())
    ? `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}`
    : 'unknown-date';
  return `${safeTitle}_${stamp}.txt`;
}

@Component({
  selector: 'app-transcripts-page',
  standalone: true,
  imports: [DatePipe],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './transcripts.page.html',
  styleUrl: './transcripts.page.scss',
})
export class TranscriptsPage implements OnDestroy {
  private readonly recordingsService = inject(RecordingsService);
  private readonly questionsService = inject(QuestionsService);
  private pollTimer: number | null = null;

  readonly recordings = signal<Recording[]>([]);
  readonly questions = signal<Question[]>([]);
  readonly analyses = signal<Analysis[]>([]);
  readonly selectedFilename = signal<string | null>(null);
  readonly selectedSessionId = signal<string | null>(null);
  readonly selectedTranscript = signal<Transcript | null>(null);
  readonly selectedNamedTranscript = signal<NamedTranscript | null>(null);
  readonly transcriptVersions = signal<TranscriptVersion[]>([]);
  readonly loading = signal(true);
  readonly busyFilename = signal<string | null>(null);
  readonly busyQuestionId = signal<string | null>(null);
  readonly busyVersionKey = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly status = signal<string | null>(null);
  readonly addProvider = signal<TranscriptProvider>('local');
  readonly addModel = signal<string>(LOCAL_MODELS[0]);
  readonly hasRows = computed(() => this.recordings().length > 0);
  readonly localModels = LOCAL_MODELS;
  readonly openrouterModels = OPENROUTER_MODELS;
  readonly analysisByQuestionId = computed(() => {
    const map = new Map<string, Analysis>();
    for (const analysis of this.analyses()) map.set(analysis.questionId, analysis);
    return map;
  });
  readonly meetingGroups = computed<MeetingGroup[]>(() => groupRecordingsByMeeting(this.recordings()));
  readonly selectedGroup = computed<MeetingGroup | null>(() => {
    const sessionId = this.selectedSessionId();
    if (!sessionId) return null;
    return this.meetingGroups().find((group) => group.sessionId === sessionId) ?? null;
  });

  constructor() {
    addIcons({
      addCircleOutline,
      downloadOutline,
      eyeOutline,
      playCircleOutline,
      refreshOutline,
      sparklesOutline,
      starOutline,
      trashOutline,
    });
    void this.refreshRecordings();
    void this.loadQuestions();
  }

  ngOnDestroy(): void {
    this.stopPolling();
  }

  async refreshRecordings(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const result = await this.recordingsService.list({ page: 1, pageSize: 100 });
      this.recordings.set(result.recordings);
      this.updatePolling();
    } catch {
      this.recordings.set([]);
      this.error.set('Transcripts could not be loaded');
      this.stopPolling();
    } finally {
      this.loading.set(false);
    }
  }

  async viewTranscript(recording: Recording): Promise<void> {
    this.busyFilename.set(recording.filename);
    this.error.set(null);
    this.status.set(null);
    try {
      const [transcript, versions] = await Promise.all([
        this.recordingsService.getTranscript(recording.filename),
        this.recordingsService.listTranscriptVersions(recording.filename),
      ]);
      this.selectedFilename.set(recording.filename);
      this.selectedSessionId.set(null);
      this.selectedNamedTranscript.set(null);
      this.selectedTranscript.set(transcript);
      this.transcriptVersions.set(versions.versions);
      await this.refreshAnalyses(recording.filename);
    } catch {
      this.error.set('Transcript could not be opened');
    } finally {
      this.busyFilename.set(null);
    }
  }

  async viewMeetingTranscript(recording: Recording): Promise<void> {
    if (!recording.sessionId) return;
    this.busyFilename.set(recording.filename);
    this.error.set(null);
    this.status.set(null);
    try {
      const named = await this.recordingsService.getNamedTranscript(recording.sessionId);
      this.selectedFilename.set(null);
      this.selectedSessionId.set(recording.sessionId);
      this.selectedTranscript.set(null);
      this.selectedNamedTranscript.set(named);
      this.transcriptVersions.set([]);
      this.analyses.set([]);
    } catch {
      this.error.set('Meeting transcript could not be opened');
    } finally {
      this.busyFilename.set(null);
    }
  }

  async downloadNamedTranscript(): Promise<void> {
    const named = this.selectedNamedTranscript();
    if (!named) return;
    const group = this.selectedGroup();
    const filename = buildMeetingTranscriptFilename(group?.roomTitle ?? 'Meeting', group?.whenIso ?? null);
    this.error.set(null);
    this.status.set(null);
    try {
      await this.recordingsService.downloadNamedTranscriptTxt(named.sessionId, filename);
      this.status.set('Meeting transcript download started');
    } catch {
      this.error.set('Meeting transcript could not be downloaded');
    }
  }

  async deleteMeetingTranscript(): Promise<void> {
    const named = this.selectedNamedTranscript();
    if (!named) return;
    if (!window.confirm('Delete this meeting transcript? The recordings themselves will stay available.')) return;
    this.error.set(null);
    this.status.set(null);
    try {
      await this.recordingsService.deleteNamedTranscript(named.sessionId);
      this.clearSelectedTranscript();
      this.status.set('Meeting transcript deleted');
      await this.refreshRecordings();
    } catch {
      this.error.set('Meeting transcript could not be deleted');
    }
  }

  async transcribe(recording: Recording): Promise<void> {
    this.busyFilename.set(recording.filename);
    this.error.set(null);
    this.status.set(null);
    try {
      await this.recordingsService.transcribe(recording.filename, recording.transcribeStatus === 'failed');
      this.status.set('Transcription started');
      await this.refreshRecordings();
    } catch {
      this.error.set('Transcription could not be started');
    } finally {
      this.busyFilename.set(null);
    }
  }

  onAddProviderChange(provider: TranscriptProvider): void {
    this.addProvider.set(provider);
    this.addModel.set(provider === 'local' ? LOCAL_MODELS[0] : OPENROUTER_MODELS[0]);
  }

  async addTranscription(): Promise<void> {
    const filename = this.selectedFilename();
    if (!filename) return;
    const provider = this.addProvider();
    const model = this.addModel();
    this.busyFilename.set(filename);
    this.error.set(null);
    this.status.set(null);
    try {
      await this.recordingsService.transcribe(filename, { force: true, provider, model });
      this.status.set(`Transcription started (${provider} / ${model})`);
      await this.refreshRecordings();
      this.updatePolling();
    } catch {
      this.error.set('Transcription could not be started');
    } finally {
      this.busyFilename.set(null);
    }
  }

  async deleteVersion(version: TranscriptVersion): Promise<void> {
    const filename = this.selectedFilename();
    if (!filename) return;
    const label = `${version.provider} / ${version.model}`;
    if (!window.confirm(`Delete transcript version ${label}? Other versions will stay available.`)) return;
    this.busyVersionKey.set(this.versionKey(version));
    this.error.set(null);
    this.status.set(null);
    try {
      await this.recordingsService.deleteTranscriptVersion(filename, version.provider, version.model);
      await this.reloadSelectedTranscript(filename);
      this.status.set(`Deleted ${label}`);
      await this.refreshRecordings();
    } catch {
      this.error.set('Transcript version could not be deleted');
    } finally {
      this.busyVersionKey.set(null);
    }
  }

  async setPrimary(version: TranscriptVersion): Promise<void> {
    const filename = this.selectedFilename();
    if (!filename || version.isPrimary) return;
    this.busyVersionKey.set(this.versionKey(version));
    this.error.set(null);
    this.status.set(null);
    try {
      await this.recordingsService.setPrimaryTranscript(filename, version.provider, version.model);
      await this.reloadSelectedTranscript(filename);
      this.status.set(`Primary set to ${version.provider} / ${version.model}`);
    } catch {
      this.error.set('Primary transcript could not be updated');
    } finally {
      this.busyVersionKey.set(null);
    }
  }

  async downloadTranscript(recording: Recording): Promise<void> {
    this.busyFilename.set(recording.filename);
    this.error.set(null);
    this.status.set(null);
    try {
      await this.recordingsService.downloadTranscriptTxt(recording.filename);
      this.status.set('Transcript download started');
    } catch {
      this.error.set('Transcript could not be downloaded');
    } finally {
      this.busyFilename.set(null);
    }
  }

  async deleteTranscript(recording: Recording): Promise<void> {
    if (!window.confirm(`Delete transcript for ${recording.roomTitle}? The recording audio will stay available.`)) return;
    this.busyFilename.set(recording.filename);
    this.error.set(null);
    this.status.set(null);
    try {
      await this.recordingsService.deleteTranscript(recording.filename);
      if (this.selectedFilename() === recording.filename) {
        this.clearSelectedTranscript();
      }
      this.status.set('Transcript deleted');
      await this.refreshRecordings();
    } catch {
      this.error.set('Transcript could not be deleted');
    } finally {
      this.busyFilename.set(null);
    }
  }

  formatDuration(durationMs: number | null): string {
    if (durationMs == null) return 'Duration unknown';
    const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }

  timestamp(ms: number): string {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  speakerColor(name: string): string {
    let hash = 0;
    for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) % 360;
    return `hsl(${hash} 64% 42%)`;
  }

  versionLabel(version: TranscriptVersion): string {
    return `${version.provider} / ${version.model}`;
  }

  versionKey(version: TranscriptVersion): string {
    return `${version.provider}:${version.model}`;
  }

  async runAnalysis(question: Question): Promise<void> {
    const filename = this.selectedFilename();
    if (!filename) return;
    this.busyQuestionId.set(question.id);
    this.error.set(null);
    this.status.set(null);
    try {
      const analysis = await this.questionsService.analyze(filename, question.id);
      this.analyses.update((current) => [...current.filter((item) => item.questionId !== question.id), analysis]);
      this.status.set('Analysis saved');
    } catch {
      this.error.set('Analysis could not be completed');
    } finally {
      this.busyQuestionId.set(null);
    }
  }

  private async loadQuestions(): Promise<void> {
    try {
      this.questions.set(await this.questionsService.list());
    } catch {
      this.questions.set([]);
    }
  }

  private async refreshAnalyses(filename: string): Promise<void> {
    try {
      this.analyses.set(await this.questionsService.listAnalyses(filename));
    } catch {
      this.analyses.set([]);
    }
  }

  private async reloadSelectedTranscript(filename: string): Promise<void> {
    const [transcript, versions] = await Promise.all([
      this.recordingsService.getTranscript(filename),
      this.recordingsService.listTranscriptVersions(filename),
    ]);
    this.selectedTranscript.set(transcript);
    this.transcriptVersions.set(versions.versions);
  }

  private clearSelectedTranscript(): void {
    this.selectedFilename.set(null);
    this.selectedSessionId.set(null);
    this.selectedTranscript.set(null);
    this.selectedNamedTranscript.set(null);
    this.transcriptVersions.set([]);
    this.analyses.set([]);
  }

  private updatePolling(): void {
    const hasPending = this.recordings().some((recording) => recording.transcribeStatus === 'pending');
    if (hasPending && !this.pollTimer) {
      this.pollTimer = window.setInterval(() => {
        void this.refreshRecordings();
        const filename = this.selectedFilename();
        if (filename) {
          void this.refreshAnalyses(filename);
          void this.reloadSelectedTranscript(filename);
        }
      }, 5000);
    } else if (!hasPending) {
      this.stopPolling();
    }
  }

  private stopPolling(): void {
    if (!this.pollTimer) return;
    window.clearInterval(this.pollTimer);
    this.pollTimer = null;
  }
}