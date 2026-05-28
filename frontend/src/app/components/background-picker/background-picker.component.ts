import { CommonModule } from '@angular/common';
import { Component, HostListener, inject, input, output, signal } from '@angular/core';
import { BackgroundEffectsService, type BackgroundEffectMode } from '../../services/background-effects.service';

const STORAGE_KEY = 'meet-poc:bg:selected';

type BackgroundOption =
  | { id: 'none'; label: string; mode: 'none'; assetUrl?: never }
  | { id: 'blur'; label: string; mode: 'blur'; assetUrl?: never }
  | ImageBackgroundOption;

type ImageBackgroundOption = { id: string; label: string; mode: 'image'; assetUrl: string };

type StoredSelection = { mode: BackgroundEffectMode; asset?: string };

const IMAGE_OPTIONS: ImageBackgroundOption[] = [
  {
    id: 'city',
    label: 'City',
    mode: 'image',
    assetUrl: svgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
        <linearGradient id="s" x1="0" x2="0" y1="0" y2="1"><stop stop-color="#6aa9d8"/><stop offset=".58" stop-color="#f3b27a"/><stop offset="1" stop-color="#273244"/></linearGradient>
        <rect width="1280" height="720" fill="url(#s)"/><circle cx="970" cy="150" r="72" fill="#ffd58f" opacity=".82"/>
        <path d="M0 455 C160 415 270 445 390 405 C560 350 680 425 820 380 C995 324 1100 390 1280 342 L1280 720 L0 720 Z" fill="#283447" opacity=".52"/>
        <rect y="520" width="1280" height="200" fill="#0b0f17"/>
        <g fill="#172033"><rect x="28" y="340" width="84" height="230"/><rect x="126" y="282" width="116" height="288"/><rect x="352" y="250" width="128" height="320"/><rect x="610" y="205" width="150" height="365"/><rect x="898" y="265" width="126" height="305"/><rect x="1138" y="238" width="116" height="332"/></g>
        <g fill="#d9f1ff" opacity=".55"><rect x="150" y="314" width="18" height="18"/><rect x="386" y="282" width="20" height="20"/><rect x="648" y="242" width="22" height="22"/><rect x="978" y="376" width="20" height="20"/><rect x="1210" y="354" width="18" height="18"/></g>
      </svg>`),
  },
  {
    id: 'library',
    label: 'Library',
    mode: 'image',
    assetUrl: svgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
        <linearGradient id="w" x1="0" x2="0" y1="0" y2="1"><stop stop-color="#f4e7d0"/><stop offset="1" stop-color="#9a6d43"/></linearGradient>
        <rect width="1280" height="720" fill="url(#w)"/><rect y="505" width="1280" height="215" fill="#4a2f20"/>
        <g fill="#5a351f"><rect x="56" y="96" width="346" height="420" rx="6"/><rect x="467" y="72" width="346" height="444" rx="6"/><rect x="878" y="110" width="346" height="406" rx="6"/></g>
        <g fill="#7b4a2a"><rect x="84" y="134" width="290" height="14"/><rect x="84" y="238" width="290" height="14"/><rect x="84" y="342" width="290" height="14"/><rect x="495" y="114" width="290" height="14"/><rect x="495" y="222" width="290" height="14"/><rect x="906" y="150" width="290" height="14"/><rect x="906" y="254" width="290" height="14"/></g>
        <g><rect x="100" y="154" width="28" height="76" fill="#245b5f"/><rect x="132" y="166" width="22" height="64" fill="#b2463d"/><rect x="160" y="148" width="34" height="82" fill="#d6a13c"/><rect x="204" y="160" width="26" height="70" fill="#2f5f9e"/><rect x="236" y="152" width="42" height="78" fill="#3b7a55"/><rect x="511" y="132" width="30" height="82" fill="#2f5f9e"/><rect x="584" y="124" width="44" height="90" fill="#3b7a55"/><rect x="914" y="170" width="34" height="76" fill="#804f8f"/><rect x="988" y="160" width="42" height="86" fill="#d6a13c"/><rect x="1074" y="164" width="40" height="82" fill="#b2463d"/></g>
      </svg>`),
  },
  {
    id: 'beach',
    label: 'Beach',
    mode: 'image',
    assetUrl: svgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
        <linearGradient id="b" x1="0" x2="0" y1="0" y2="1"><stop stop-color="#7ed0f2"/><stop offset=".7" stop-color="#dff7ff"/><stop offset="1" stop-color="#fff1bc"/></linearGradient>
        <rect width="1280" height="720" fill="url(#b)"/><circle cx="1048" cy="116" r="64" fill="#ffd47d"/>
        <path d="M0 306 C155 286 285 320 430 300 C610 276 728 332 910 302 C1055 278 1168 292 1280 260 L1280 530 L0 530 Z" fill="#27a7c8"/>
        <path d="M0 430 C168 410 300 470 470 442 C660 412 795 486 980 454 C1115 432 1190 448 1280 420 L1280 720 L0 720 Z" fill="#f5d98b"/>
        <path d="M0 465 C150 448 305 492 500 472 C690 452 780 506 990 486 C1120 474 1210 482 1280 466" fill="none" stroke="#fff" stroke-width="18" opacity=".8"/>
        <path d="M100 588 L172 410 L245 588 Z" fill="#8b5e34"/><path d="M172 410 C130 448 110 492 106 540 C142 506 180 485 222 476 C210 438 194 418 172 410 Z" fill="#2f8f5b"/>
      </svg>`),
  },
  {
    id: 'mountain',
    label: 'Mountain',
    mode: 'image',
    assetUrl: svgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
        <linearGradient id="m" x1="0" x2="0" y1="0" y2="1"><stop stop-color="#8fb7e6"/><stop offset=".65" stop-color="#d8e8fb"/><stop offset="1" stop-color="#f6f0d8"/></linearGradient>
        <rect width="1280" height="720" fill="url(#m)"/><circle cx="176" cy="122" r="58" fill="#fff3bc"/>
        <path d="M0 430 L205 168 L390 430 Z" fill="#62748c"/><path d="M250 430 L590 110 L925 430 Z" fill="#4f6177"/><path d="M760 430 L1050 190 L1280 430 Z" fill="#687a8f"/>
        <path d="M590 110 L688 244 L620 218 L552 284 L490 268 Z" fill="#f2f8ff"/><path d="M188 190 L242 268 L208 250 L174 300 L128 286 Z" fill="#eef6ff"/>
        <path d="M0 430 C170 398 350 452 514 420 C732 378 890 452 1280 398 L1280 720 L0 720 Z" fill="#315d76"/>
        <path d="M0 598 C238 560 444 626 650 590 C870 552 1020 628 1280 574 L1280 720 L0 720 Z" fill="#1e3a2b"/>
      </svg>`),
  },
  {
    id: 'gradient',
    label: 'Gradient',
    mode: 'image',
    assetUrl: svgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
        <linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#f5f7fb"/><stop offset=".45" stop-color="#b7d7d4"/><stop offset="1" stop-color="#586f8f"/></linearGradient>
        <radialGradient id="w" cx=".2" cy=".25" r=".55"><stop stop-color="#f4c78b" stop-opacity=".9"/><stop offset="1" stop-color="#f4c78b" stop-opacity="0"/></radialGradient>
        <radialGradient id="c" cx=".82" cy=".72" r=".62"><stop stop-color="#395f73" stop-opacity=".75"/><stop offset="1" stop-color="#395f73" stop-opacity="0"/></radialGradient>
        <rect width="1280" height="720" fill="url(#g)"/><rect width="1280" height="720" fill="url(#w)"/><rect width="1280" height="720" fill="url(#c)"/>
        <path d="M-80 520 C155 410 310 570 525 460 C710 365 880 406 1035 315 C1165 238 1258 248 1360 288 L1360 720 L-80 720 Z" fill="#fff" opacity=".2"/>
      </svg>`),
  },
];

const OPTIONS: BackgroundOption[] = [{ id: 'none', label: 'None', mode: 'none' }, { id: 'blur', label: 'Blur', mode: 'blur' }, ...IMAGE_OPTIONS];

@Component({
  selector: 'app-background-picker',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './background-picker.component.html',
  styleUrl: './background-picker.component.scss',
  host: {
    '[class.overlay]': 'presentation() === "overlay"',
  },
})
export class BackgroundPickerComponent {
  readonly backgroundEffects = inject(BackgroundEffectsService);
  readonly closeRequested = output<void>();
  readonly presentation = input<'inline' | 'overlay'>('inline');
  readonly options = OPTIONS;
  readonly selectedId = signal(readStoredSelection()?.asset ?? readStoredSelection()?.mode ?? 'none');
  readonly busyId = signal<string | null>(null);

  private restored = false;

  constructor() {
    void this.restoreSelection();
  }

  async select(option: BackgroundOption): Promise<void> {
    this.selectedId.set(option.id);
    this.busyId.set(option.id);
    try {
      if (option.mode === 'image') {
        writeStoredSelection({ mode: 'image', asset: option.id });
        await this.backgroundEffects.setBackgroundImage(option.assetUrl);
        await this.backgroundEffects.setMode('image');
        return;
      }
      writeStoredSelection({ mode: option.mode });
      await this.backgroundEffects.setMode(option.mode);
    } finally {
      this.busyId.set(null);
    }
  }

  onTileKeydown(event: KeyboardEvent, index: number): void {
    const key = event.key;
    if (key !== 'ArrowRight' && key !== 'ArrowDown' && key !== 'ArrowLeft' && key !== 'ArrowUp') return;
    event.preventDefault();
    const direction = key === 'ArrowRight' || key === 'ArrowDown' ? 1 : -1;
    const nextIndex = (index + direction + this.options.length) % this.options.length;
    const target = (event.currentTarget as HTMLElement).parentElement?.children.item(nextIndex) as HTMLElement | null;
    target?.focus();
  }

  requestClose(): void {
    this.closeRequested.emit();
  }

  @HostListener('document:keydown.escape')
  closeOnEscape(): void {
    if (this.presentation() === 'overlay') this.closeRequested.emit();
  }

  private async restoreSelection(): Promise<void> {
    if (this.restored) return;
    this.restored = true;
    const stored = readStoredSelection();
    if (!stored) return;
    if (stored.mode === 'image') {
      const option = IMAGE_OPTIONS.find((item) => item.id === stored.asset);
      if (!option) return;
      this.selectedId.set(option.id);
      await this.backgroundEffects.setBackgroundImage(option.assetUrl);
      await this.backgroundEffects.setMode('image');
      return;
    }
    this.selectedId.set(stored.mode);
    await this.backgroundEffects.setMode(stored.mode);
  }
}

function readStoredSelection(): StoredSelection | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSelection>;
    if (parsed.mode === 'none' || parsed.mode === 'blur') return { mode: parsed.mode };
    if (parsed.mode === 'image' && typeof parsed.asset === 'string') return { mode: 'image', asset: parsed.asset };
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
  }
  return null;
}

function writeStoredSelection(selection: StoredSelection): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(selection));
}

function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg.replace(/\s+/g, ' ').trim())}`;
}
