import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { CUSTOM_ELEMENTS_SCHEMA, Component, ElementRef, HostListener, ViewChild, computed, inject, input, output, signal } from '@angular/core';
import { addIcons } from 'ionicons';
import { closeOutline } from 'ionicons/icons';
import { BackgroundEffectsService } from '../../services/background-effects.service';
import { ViewportService } from '../../services/viewport.service';
import { AuthService } from '../../services/auth.service';
import { BackgroundLibraryService } from '../../services/background-library.service';
import { resizeImageToDataUrl } from '../../utils/image-resize';
import {
  applyImageSelection,
  IMAGE_OPTIONS,
  initialSelectedId,
  isCustomBackground,
  loadImage,
  MAX_UPLOAD_BYTES,
  OPTIONS,
  readCustomBackgrounds,
  readFileAsDataUrl,
  removeCustomBackground,
  resizeAndEncode,
  restoreBackgroundFromStorage,
  saveCustomBackground,
  writeMobileOptIn,
  writeStoredSelection,
  type BackgroundOption,
  type CustomBackground,
  type ImageBackgroundOption,
  type SelectableBackgroundOption,
} from './background-restore';

type OverlayPosition = { left: number; top: number };
type DragState = { pointerId: number; offsetX: number; offsetY: number };

let sessionOverlayPosition: OverlayPosition | null = null;

@Component({
  selector: 'app-background-picker',
  standalone: true,
  imports: [CommonModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './background-picker.component.html',
  styleUrl: './background-picker.component.scss',
  host: {
    '[class.overlay]': 'presentation() === "overlay"',
  },
})
export class BackgroundPickerComponent {
  @ViewChild('fileInput') private fileInput?: ElementRef<HTMLInputElement>;
  @ViewChild('pickerPanel') private pickerPanel?: ElementRef<HTMLElement>;

  readonly backgroundEffects = inject(BackgroundEffectsService);
  private readonly viewport = inject(ViewportService);
  private readonly auth = inject(AuthService);
  private readonly library = inject(BackgroundLibraryService);
  readonly isMobile = this.viewport.isMobile;
  readonly signedIn = computed(() => !!this.auth.user());
  readonly accountBackgrounds = signal<ImageBackgroundOption[]>([]);
  readonly closeRequested = output<void>();
  readonly presentation = input<'inline' | 'overlay'>('inline');
  readonly options: BackgroundOption[] = OPTIONS;
  readonly selectedId = signal(initialSelectedId(this.isMobile()));
  readonly busyId = signal<string | null>(null);
  readonly customs = signal<CustomBackground[]>(readCustomBackgrounds());
  readonly uploadBusy = signal(false);
  readonly uploadError = signal<string | null>(null);
  readonly overlayPosition = signal<OverlayPosition | null>(sessionOverlayPosition);
  readonly desktopOverlayPosition = computed(() => (this.presentation() === 'overlay' && !this.isMobile() ? this.overlayPosition() : null));
  readonly dragging = signal(false);

  private dragState: DragState | null = null;

  constructor() {
    addIcons({ closeOutline });
    void this.loadAccountBackgrounds();
    void restoreBackgroundFromStorage(this.backgroundEffects, this.library, this.isMobile());
  }

  private async loadAccountBackgrounds(): Promise<void> {
    if (!this.signedIn()) return;
    try {
      const res = await this.library.list();
      this.accountBackgrounds.set(
        res.backgrounds.map((bg) => ({
          id: `acct:${bg.id}`,
          label: bg.label,
          mode: 'image' as const,
          assetUrl: this.library.imageUrl(bg.id),
        })),
      );
    } catch {
      // Non-fatal: built-in options still work if account backgrounds fail to load.
    }
  }

  async select(option: SelectableBackgroundOption): Promise<void> {
    if (this.isMobile() && option.mode !== 'none') writeMobileOptIn();
    this.selectedId.set(option.id);
    this.busyId.set(option.id);
    try {
      if (option.mode === 'image') {
        writeStoredSelection({ mode: 'image', asset: option.id, custom: isCustomBackground(option) || undefined });
        const thumbnailSource = isCustomBackground(option)
          ? { kind: 'data-url' as const, source: option.assetUrl }
          : option.id.startsWith('acct:')
            ? { kind: 'url' as const, source: option.assetUrl }
            : null;
        await applyImageSelection(this.backgroundEffects, option, thumbnailSource);
      } else {
        writeStoredSelection({ mode: option.mode });
        await this.backgroundEffects.setMode(option.mode);
        this.backgroundEffects.setBackgroundDescriptor({ kind: option.mode });
        this.backgroundEffects.setBroadcastImage(null);
      }
      if (option.mode !== 'none' && this.backgroundEffects.mode() === 'none') {
        this.selectedId.set('none');
        writeStoredSelection({ mode: 'none' });
        this.backgroundEffects.setBroadcastImage(null);
      }
    } finally {
      this.busyId.set(null);
    }
  }

  onTileKeydown(event: KeyboardEvent, index: number): void {
    const key = event.key;
    if (key !== 'ArrowRight' && key !== 'ArrowDown' && key !== 'ArrowLeft' && key !== 'ArrowUp') return;
    event.preventDefault();
    const direction = key === 'ArrowRight' || key === 'ArrowDown' ? 1 : -1;
    const tiles = Array.from(
      (event.currentTarget as HTMLElement).closest('.picker-grid')?.querySelectorAll<HTMLElement>('.background-tile') ?? [],
    );
    if (!tiles.length) return;
    const nextIndex = (index + direction + tiles.length) % tiles.length;
    const target = tiles.at(nextIndex);
    target?.focus();
  }

  requestUpload(): void {
    this.uploadError.set(null);
    this.fileInput?.nativeElement.click();
  }

  async onFileSelected(event: Event): Promise<void> {
    const inputEl = event.target as HTMLInputElement;
    const file = inputEl.files?.item(0);
    inputEl.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      this.uploadError.set('Choose an image file.');
      return;
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      this.uploadError.set('Image must be 20MB or smaller.');
      return;
    }

    this.uploadBusy.set(true);
    this.busyId.set('upload-custom');
    this.uploadError.set(null);

    try {
      if (this.signedIn()) {
        // Signed-in: upload to the account (cross-device). Resize to 720p JPEG
        // (iOS-safe, small) first, then POST and refresh the account list.
        const dataUrl = await resizeImageToDataUrl(file, 1280, 720, 'image/jpeg', 0.85);
        const label = file.name.replace(/\.[^.]+$/, '').slice(0, 64) || 'Background';
        const res = await this.library.upload(label, dataUrl);
        await this.loadAccountBackgrounds();
        const added = this.accountBackgrounds().find((b) => b.id === `acct:${res.background.id}`);
        if (added) await this.select(added);
      } else {
        const sourceDataUrl = await readFileAsDataUrl(file);
        const sourceImage = await loadImage(sourceDataUrl);
        const processedDataUrl = resizeAndEncode(sourceImage);
        const addedCustom = saveCustomBackground(processedDataUrl);
        this.customs.set(readCustomBackgrounds());
        await this.select(addedCustom);
      }
    } catch (error) {
      const message = error instanceof HttpErrorResponse && error.status === 413
        ? 'Storage quota exceeded. Manage backgrounds in Settings → Backgrounds.'
        : error instanceof Error ? error.message : 'Could not upload image.';
      this.uploadError.set(message);
    } finally {
      this.uploadBusy.set(false);
      if (this.busyId() === 'upload-custom') this.busyId.set(null);
    }
  }

  async deleteCustom(event: MouseEvent, custom: CustomBackground): Promise<void> {
    event.stopPropagation();
    this.uploadError.set(null);
    removeCustomBackground(custom.id);
    this.customs.set(readCustomBackgrounds());

    if (this.selectedId() !== custom.id) return;

    this.selectedId.set('none');
    this.busyId.set('none');
    try {
      writeStoredSelection({ mode: 'none' });
      await this.backgroundEffects.setMode('none');
      this.backgroundEffects.setBroadcastImage(null);
    } finally {
      this.busyId.set(null);
    }
  }

  requestClose(): void {
    this.closeRequested.emit();
  }

  startDrag(event: PointerEvent): void {
    if (this.presentation() !== 'overlay') return;
    // Disable drag only on true phone-sized viewports where the panel takes
    // most of the screen anyway; let narrow desktop windows still drag.
    if (typeof window !== 'undefined' && window.innerWidth <= 600) return;
    if ((event.target as HTMLElement).closest('button')) return;

    const panel = this.pickerPanel?.nativeElement;
    if (!panel) return;

    const rect = panel.getBoundingClientRect();
    this.dragState = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    };
    this.dragging.set(true);
    event.preventDefault();
  }

  @HostListener('document:keydown.escape')
  closeOnEscape(): void {
    if (this.presentation() === 'overlay') this.closeRequested.emit();
  }

  @HostListener('document:pointermove', ['$event'])
  dragOverlay(event: PointerEvent): void {
    if (!this.dragState || event.pointerId !== this.dragState.pointerId) return;
    event.preventDefault();
    this.updateOverlayPosition(event.clientX - this.dragState.offsetX, event.clientY - this.dragState.offsetY);
  }

  @HostListener('document:pointerup', ['$event'])
  stopDrag(event: PointerEvent): void {
    if (!this.dragState || event.pointerId !== this.dragState.pointerId) return;
    this.dragState = null;
    this.dragging.set(false);
  }

  @HostListener('window:resize')
  clampOverlayOnResize(): void {
    const current = this.overlayPosition();
    if (!current) return;
    this.updateOverlayPosition(current.left, current.top);
  }

  private updateOverlayPosition(left: number, top: number): void {
    const panel = this.pickerPanel?.nativeElement;
    if (!panel || typeof window === 'undefined') return;

    const rect = panel.getBoundingClientRect();
    const margin = 12;
    const maxLeft = Math.max(margin, window.innerWidth - rect.width - margin);
    const maxTop = Math.max(margin, window.innerHeight - rect.height - margin);
    const nextPosition = {
      left: clamp(left, margin, maxLeft),
      top: clamp(top, margin, maxTop),
    };
    sessionOverlayPosition = nextPosition;
    this.overlayPosition.set(nextPosition);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
