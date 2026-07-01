import type { BackgroundEffectMode, BackgroundEffectsService } from '../../services/background-effects.service';
import type { BackgroundLibraryService } from '../../services/background-library.service';

// Pure storage/resolution logic for the background picker, deliberately free of Angular runtime
// imports (only `import type`s above) so it can be unit-tested with plain node/tsx — no DI
// context, no @angular/common/http chain to bootstrap.

export const STORAGE_KEY = 'meet-poc:bg:selected';
export const MOBILE_OPT_IN_KEY = 'meet-poc:bg:mobile-opt-in';
const CUSTOM_INDEX_KEY = 'meet-poc:bg:custom:index';
const CUSTOM_STORAGE_PREFIX = 'meet-poc:bg:custom:';
export const MAX_CUSTOM_BACKGROUNDS = 5;
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const MAX_PROCESSED_BYTES = 1_000_000;
const MAX_CUSTOM_WIDTH = 1280;
const MAX_CUSTOM_HEIGHT = 720;
const JPEG_QUALITIES = [0.85, 0.7, 0.6, 0.5] as const;
// Broadcast thumbnail: what gets sent to peers over signaling so a custom/account
// background renders on their cam-off tile. Deliberately much smaller than the
// full-res asset used for local compositing — keeps the WS fan-out cheap.
const BROADCAST_MAX_WIDTH = 320;
const BROADCAST_MAX_HEIGHT = 180;
const BROADCAST_MAX_BYTES = 120_000;

export type BackgroundOption =
  | { id: 'none'; label: string; mode: 'none'; assetUrl?: never }
  | { id: 'blur'; label: string; mode: 'blur'; assetUrl?: never }
  | ImageBackgroundOption;

export type ImageBackgroundOption = { id: string; label: string; mode: 'image'; assetUrl: string };
export type CustomBackground = { id: string; label: string; mode: 'image'; assetUrl: string; isCustom: true };

export type SelectableBackgroundOption = BackgroundOption | CustomBackground;
type StoredSelection = { mode: BackgroundEffectMode; asset?: string; custom?: boolean };

export const IMAGE_OPTIONS: ImageBackgroundOption[] = [
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

export const OPTIONS: BackgroundOption[] = [{ id: 'none', label: 'None', mode: 'none' }, { id: 'blur', label: 'Blur', mode: 'blur' }, ...IMAGE_OPTIONS];

export function isCustomBackground(option: SelectableBackgroundOption): option is CustomBackground {
  return 'isCustom' in option && option.isCustom;
}

type BroadcastThumbnailSource = { kind: 'data-url' | 'url'; source: string } | null;

export async function applyImageSelection(
  effects: BackgroundEffectsService,
  option: { id: string; assetUrl: string },
  thumbnailSource: BroadcastThumbnailSource,
): Promise<void> {
  await effects.setBackgroundImage(option.assetUrl);
  await effects.setMode('image');
  effects.setBackgroundDescriptor({ kind: 'image', id: option.id }, option.assetUrl);
  effects.setBroadcastImage(null);
  if (!thumbnailSource) return;
  try {
    const thumbnail =
      thumbnailSource.kind === 'data-url'
        ? await createBroadcastThumbnailFromDataUrl(thumbnailSource.source)
        : await createBroadcastThumbnailFromUrl(thumbnailSource.source);
    effects.setBroadcastImage(thumbnail);
  } catch {
    // Non-fatal: peers fall back to the existing initials/builtin resolution if the thumbnail can't be made.
  }
}

/**
 * R8a: reads the persisted picker selection and applies it to the effects service directly,
 * independent of whether BackgroundPickerComponent (lazily mounted) is on screen. Callable from
 * both the room page (at join) and the component's own constructor (if it mounts first) —
 * `effects.restoredFromStorage` makes the two callers converge on a single idempotent apply.
 */
export async function restoreBackgroundFromStorage(
  effects: BackgroundEffectsService,
  library: BackgroundLibraryService,
  isMobile: boolean,
): Promise<void> {
  if (effects.restoredFromStorage()) return;
  effects.restoredFromStorage.set(true);

  if (isMobile && !readMobileOptIn()) {
    await effects.setMode('none');
    return;
  }

  const stored = readStoredSelection();
  if (!stored) return;

  if (stored.mode !== 'image') {
    await effects.setMode(stored.mode);
    effects.setBackgroundDescriptor({ kind: stored.mode });
    return;
  }

  const builtin = IMAGE_OPTIONS.find((item) => item.id === stored.asset);
  if (builtin) {
    await applyImageSelection(effects, builtin, null);
    return;
  }

  const localCustom = readCustomBackgrounds().find((item) => item.id === stored.asset);
  if (localCustom) {
    await applyImageSelection(effects, localCustom, { kind: 'data-url', source: localCustom.assetUrl });
    return;
  }

  if (stored.asset?.startsWith('acct:')) {
    try {
      const list = await library.list();
      const match = list.backgrounds.find((bg) => `acct:${bg.id}` === stored.asset);
      if (match) {
        const assetUrl = library.imageUrl(match.id);
        await applyImageSelection(effects, { id: stored.asset, assetUrl }, { kind: 'url', source: assetUrl });
        return;
      }
    } catch {
      // Non-fatal: account backgrounds unavailable (offline/signed-out) — fall through to clearing below.
    }
  }

  writeStoredSelection({ mode: 'none' });
  await effects.setMode('none');
}

export function initialSelectedId(isMobile: boolean): string {
  if (isMobile && !readMobileOptIn()) return 'none';
  const stored = readStoredSelection();
  return stored?.asset ?? stored?.mode ?? 'none';
}

export function readMobileOptIn(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(MOBILE_OPT_IN_KEY) === 'true';
}

export function writeMobileOptIn(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(MOBILE_OPT_IN_KEY, 'true');
}

export function readStoredSelection(): StoredSelection | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSelection>;
    if (parsed.mode === 'none' || parsed.mode === 'blur') return { mode: parsed.mode };
    if (parsed.mode === 'image' && typeof parsed.asset === 'string') {
      return { mode: 'image', asset: parsed.asset, custom: parsed.custom === true };
    }
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
  }
  return null;
}

export function writeStoredSelection(selection: StoredSelection): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(selection));
}

export function readCustomBackgrounds(): CustomBackground[] {
  const ids = readCustomIds();
  const validIds: string[] = [];
  const customs: CustomBackground[] = [];

  for (const id of ids) {
    const assetUrl = readCustomData(id);
    if (!assetUrl) continue;
    validIds.push(id);
    customs.push({ id, label: `Custom ${customs.length + 1}`, mode: 'image', assetUrl, isCustom: true });
  }

  if (validIds.length !== ids.length) writeCustomIds(validIds);
  return customs;
}

export function saveCustomBackground(assetUrl: string): CustomBackground {
  if (typeof window === 'undefined') throw new Error('Custom backgrounds require a browser.');

  const id = createCustomId();
  const nextIds = [...readCustomIds(), id];
  const evictedIds: string[] = [];

  while (nextIds.length > MAX_CUSTOM_BACKGROUNDS) {
    const evictedId = nextIds.shift();
    if (evictedId) evictedIds.push(evictedId);
  }

  try {
    window.localStorage.setItem(customStorageKey(id), assetUrl);
    for (const evictedId of evictedIds) window.localStorage.removeItem(customStorageKey(evictedId));
    writeCustomIds(nextIds);
  } catch {
    window.localStorage.removeItem(customStorageKey(id));
    throw new Error('Could not save image. Browser storage is full.');
  }

  return { id, label: `Custom ${nextIds.length}`, mode: 'image', assetUrl, isCustom: true };
}

export function removeCustomBackground(id: string): void {
  if (typeof window === 'undefined') return;
  const nextIds = readCustomIds().filter((item) => item !== id);
  window.localStorage.removeItem(customStorageKey(id));
  writeCustomIds(nextIds);
}

function readCustomIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(CUSTOM_INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('Invalid custom background index');
    const ids = parsed.filter((id): id is string => typeof id === 'string');
    if (ids.length !== parsed.length) writeCustomIds(ids);
    return ids;
  } catch {
    window.localStorage.removeItem(CUSTOM_INDEX_KEY);
    return [];
  }
}

function writeCustomIds(ids: string[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(CUSTOM_INDEX_KEY, JSON.stringify(ids));
}

function readCustomData(id: string): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(customStorageKey(id));
}

function customStorageKey(id: string): string {
  return `${CUSTOM_STORAGE_PREFIX}${id}`;
}

function createCustomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error('Could not read image file.'));
    };
    reader.onerror = () => reject(new Error('Could not read image file.'));
    reader.readAsDataURL(file);
  });
}

export function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not load image file.'));
    image.src = dataUrl;
  });
}

export function resizeAndEncode(
  image: HTMLImageElement,
  maxWidth = MAX_CUSTOM_WIDTH,
  maxHeight = MAX_CUSTOM_HEIGHT,
  maxBytes = MAX_PROCESSED_BYTES,
): string {
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  if (!sourceWidth || !sourceHeight) throw new Error('Could not determine image size.');

  const scale = Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight, 1);
  const outputWidth = Math.max(1, Math.round(sourceWidth * scale));
  const outputHeight = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = outputWidth;
  canvas.height = outputHeight;

  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not process image.');
  context.drawImage(image, 0, 0, outputWidth, outputHeight);

  for (const quality of JPEG_QUALITIES) {
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    if (approximateDataUrlBytes(dataUrl) <= maxBytes) return dataUrl;
  }

  throw new Error('Image too large after compression');
}

/** Small peer-broadcast thumbnail for a data URL already held in memory (anonymous customs, restore-from-storage). */
async function createBroadcastThumbnailFromDataUrl(dataUrl: string): Promise<string> {
  const image = await loadImage(dataUrl);
  return resizeAndEncode(image, BROADCAST_MAX_WIDTH, BROADCAST_MAX_HEIGHT, BROADCAST_MAX_BYTES);
}

/**
 * Small peer-broadcast thumbnail for a same-origin, cookie-authed account-background URL. The
 * fetch runs in the owner's own browser (has the session cookie) — the resulting thumbnail is
 * what gets relayed to peers, never the private URL itself.
 */
async function createBroadcastThumbnailFromUrl(url: string): Promise<string> {
  const image = await loadImage(url);
  return resizeAndEncode(image, BROADCAST_MAX_WIDTH, BROADCAST_MAX_HEIGHT, BROADCAST_MAX_BYTES);
}

function approximateDataUrlBytes(dataUrl: string): number {
  return Math.ceil(dataUrl.length * 0.75);
}

function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg.replace(/\s+/g, ' ').trim())}`;
}
