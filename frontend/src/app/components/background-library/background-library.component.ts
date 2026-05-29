import { CUSTOM_ELEMENTS_SCHEMA, Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { addIcons } from 'ionicons';
import { cloudUploadOutline, trashOutline } from 'ionicons/icons';
import { AccountBackground, BackgroundLibraryService } from '../../services/background-library.service';
import { resizeImageToDataUrl } from '../../utils/image-resize';

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

@Component({
  selector: 'app-background-library',
  standalone: true,
  imports: [],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './background-library.component.html',
  styleUrl: './background-library.component.scss',
})
export class BackgroundLibraryComponent implements OnInit {
  private readonly library = inject(BackgroundLibraryService);

  readonly backgrounds = signal<AccountBackground[]>([]);
  readonly used = signal(0);
  readonly quota = signal<number | null>(null);
  readonly isAdmin = signal(false);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly status = signal<string | null>(null);

  readonly usedLabel = computed(() => formatBytes(this.used()));
  readonly quotaLabel = computed(() => {
    const q = this.quota();
    return q == null ? 'Unlimited' : formatBytes(q);
  });
  readonly usedPct = computed(() => {
    const q = this.quota();
    if (q == null || q === 0) return 0;
    return Math.min(100, Math.round((this.used() / q) * 100));
  });

  constructor() {
    addIcons({ cloudUploadOutline, trashOutline });
  }

  ngOnInit(): void {
    void this.load();
  }

  imageUrl(id: string): string {
    return this.library.imageUrl(id);
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const res = await this.library.list();
      this.backgrounds.set(res.backgrounds);
      this.used.set(res.used);
      this.quota.set(res.quota);
      this.isAdmin.set(res.isAdmin);
    } catch {
      this.error.set('Backgrounds could not be loaded.');
    } finally {
      this.loading.set(false);
    }
  }

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.error.set(null);
    this.status.set(null);
    if (!file.type.startsWith('image/')) {
      this.error.set('Choose an image file.');
      return;
    }
    // Admins are unlimited; only guard non-admins (and even then this is a
    // browser-memory safety cap — the image is downscaled to 720p before upload).
    if (!this.isAdmin() && file.size > MAX_UPLOAD_BYTES) {
      this.error.set('Image must be 100MB or smaller.');
      return;
    }
    this.busy.set(true);
    try {
      // JPEG: universally encodable (iOS Safari can't toDataURL webp) and small.
      const dataUrl = await resizeImageToDataUrl(file, 1280, 720, 'image/jpeg', 0.85);
      const label = file.name.replace(/\.[^.]+$/, '').slice(0, 64) || 'Background';
      const res = await this.library.upload(label, dataUrl);
      this.backgrounds.update((list) => [res.background, ...list]);
      this.used.set(res.used);
      this.status.set('Background uploaded');
    } catch (err) {
      // 413 from our route = real quota hit (server sends an error message);
      // a 413 without our message body is an upstream body-size limit.
      const serverMsg = err instanceof HttpErrorResponse && typeof err.error?.error === 'string' ? err.error.error : null;
      const message = serverMsg
        ? serverMsg
        : err instanceof HttpErrorResponse && err.status === 413
          ? 'That image is too large to upload. Try a smaller one.'
          : 'Background could not be uploaded.';
      this.error.set(message);
    } finally {
      this.busy.set(false);
    }
  }

  async remove(bg: AccountBackground): Promise<void> {
    if (!window.confirm(`Delete "${bg.label}"?`)) return;
    this.busy.set(true);
    this.error.set(null);
    this.status.set(null);
    try {
      const res = await this.library.remove(bg.id);
      this.backgrounds.update((list) => list.filter((b) => b.id !== bg.id));
      this.used.set(res.used);
      this.status.set('Background deleted');
    } catch {
      this.error.set('Background could not be deleted.');
    } finally {
      this.busy.set(false);
    }
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
