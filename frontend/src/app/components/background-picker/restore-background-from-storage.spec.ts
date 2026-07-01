import assert from 'node:assert/strict';
import { signal } from '@angular/core';

// --- in-memory localStorage shim (node has no localStorage); same pattern as diagnostics-prefs.spec.ts ---
class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) as string) : null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
}

const g = globalThis as unknown as { localStorage: MemoryStorage; window: { localStorage: MemoryStorage } };
const memory = new MemoryStorage();
g.localStorage = memory;
g.window = { localStorage: memory };

function reset(): void {
  memory.clear();
}

// Import AFTER the shim is installed. background-restore.ts has zero Angular runtime imports
// (only `import type`s) so it loads cleanly under plain node — the component file pulls in
// @angular/common/http, which needs a real platform/JIT context and can't run here.
const { restoreBackgroundFromStorage, STORAGE_KEY } = await import('./background-restore.js');

// A hand-rolled fake of BackgroundEffectsService's used surface — mirrors the real service's
// signal-and-method shape closely enough to exercise restoreBackgroundFromStorage's control flow
// without needing Angular's injection context (inject(NgZone) can't run outside DI in a plain
// node script). Thumbnail generation itself (canvas/Image) needs a real browser and is proven by
// the e2e test instead; these fakes only cover mode/descriptor/broadcastImage/idempotency.
function createFakeEffects() {
  const mode = signal<'none' | 'blur' | 'image'>('none');
  const backgroundDescriptor = signal<{ kind: string; id?: string }>({ kind: 'none' });
  const broadcastImage = signal<string | null>(null);
  const restoredFromStorage = signal(false);
  const setBackgroundDescriptor = (descriptor: { kind: string; id?: string }): void => {
    backgroundDescriptor.set(descriptor);
  };
  return {
    mode,
    backgroundDescriptor,
    broadcastImage,
    restoredFromStorage,
    setBackgroundDescriptor,
    setBroadcastImage: (image: string | null) => broadcastImage.set(image),
    setBackgroundImage: async () => undefined,
    setMode: async (next: 'none' | 'blur' | 'image') => {
      mode.set(next);
      if (next === 'none') setBackgroundDescriptor({ kind: 'none' });
    },
  };
}

function createFakeLibrary(backgrounds: { id: string; label: string }[] = []) {
  return {
    imageUrl: (id: string) => `/api/account/backgrounds/${id}/image`,
    list: async () => ({ backgrounds, used: 0, quota: null, isAdmin: false }),
  };
}

// S-1 — no stored selection: settles without touching mode, marks restoredFromStorage.
{
  reset();
  const effects = createFakeEffects();
  await restoreBackgroundFromStorage(effects as any, createFakeLibrary() as any, false);
  assert.strictEqual(effects.mode(), 'none', 'no stored selection leaves mode untouched');
  assert.strictEqual(effects.restoredFromStorage(), true, 'flag set even when there is nothing to restore');
}

// S-2 — stored 'blur' is applied.
{
  reset();
  memory.setItem(STORAGE_KEY, JSON.stringify({ mode: 'blur' }));
  const effects = createFakeEffects();
  await restoreBackgroundFromStorage(effects as any, createFakeLibrary() as any, false);
  assert.strictEqual(effects.mode(), 'blur', 'persisted blur mode auto-applies on join (R8a)');
  assert.deepStrictEqual(effects.backgroundDescriptor(), { kind: 'blur' });
}

// S-3 — stored builtin image is applied, no broadcast thumbnail needed (already a public static asset).
{
  reset();
  memory.setItem(STORAGE_KEY, JSON.stringify({ mode: 'image', asset: 'city' }));
  const effects = createFakeEffects();
  await restoreBackgroundFromStorage(effects as any, createFakeLibrary() as any, false);
  assert.strictEqual(effects.mode(), 'image', 'persisted builtin background auto-applies on join (R8a)');
  assert.deepStrictEqual(effects.backgroundDescriptor(), { kind: 'image', id: 'city' });
  assert.strictEqual(effects.broadcastImage(), null, 'builtins are peer-resolvable via static asset URL — no broadcast payload needed');
}

// S-4 — mobile without opt-in forces 'none' regardless of what's stored.
{
  reset();
  memory.setItem(STORAGE_KEY, JSON.stringify({ mode: 'image', asset: 'city' }));
  const effects = createFakeEffects();
  await restoreBackgroundFromStorage(effects as any, createFakeLibrary() as any, true);
  assert.strictEqual(effects.mode(), 'none', 'mobile without prior opt-in stays off even with a persisted image selection');
}

// S-5 — idempotency (NAIL THESE #4): a second caller (e.g. the lazily-mounted picker's
// constructor racing the room page's join-time call) must be a no-op, even if storage changed
// in between — this is what prevents flicker between the two restore paths.
{
  reset();
  memory.setItem(STORAGE_KEY, JSON.stringify({ mode: 'blur' }));
  const effects = createFakeEffects();
  await restoreBackgroundFromStorage(effects as any, createFakeLibrary() as any, false);
  assert.strictEqual(effects.mode(), 'blur', 'first caller applies the persisted selection');

  memory.setItem(STORAGE_KEY, JSON.stringify({ mode: 'image', asset: 'city' }));
  await restoreBackgroundFromStorage(effects as any, createFakeLibrary() as any, false);
  assert.strictEqual(effects.mode(), 'blur', 'second caller is a no-op — restoredFromStorage guard prevents re-applying/flicker');
}

// S-6 — an unresolvable stored asset (e.g. account background deleted elsewhere) clears
// gracefully to 'none' instead of leaving a dangling reference.
{
  reset();
  memory.setItem(STORAGE_KEY, JSON.stringify({ mode: 'image', asset: 'acct:missing-id' }));
  const effects = createFakeEffects();
  await restoreBackgroundFromStorage(effects as any, createFakeLibrary([]) as any, false);
  assert.strictEqual(effects.mode(), 'none', 'unresolvable account background falls back to none');
}

console.log('restore-background-from-storage: all assertions passed');
