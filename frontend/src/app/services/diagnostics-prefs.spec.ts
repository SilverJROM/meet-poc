import assert from 'node:assert/strict';

// --- in-memory localStorage shim (node has no localStorage) ---
// The module under test reads/writes `window.localStorage`, so install the same
// shim on both globalThis.localStorage and globalThis.window.localStorage.
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

// Import AFTER the shim is installed so module-level access (if any) is safe.
const {
  DIAGNOSTICS_LOGGING_STORAGE_KEY,
  readDiagnosticsLoggingEnabled,
  writeDiagnosticsLoggingEnabled,
} = await import('./diagnostics-prefs.js');

const KEY = DIAGNOSTICS_LOGGING_STORAGE_KEY;
assert.strictEqual(KEY, 'meet-poc.diagnosticsLogging', 'shared key constant is the single source of truth');

// S-1 — absent key -> enabled (true)
{
  reset();
  assert.strictEqual(memory.getItem(KEY), null, 'precondition: key absent');
  assert.strictEqual(readDiagnosticsLoggingEnabled(), true, 'absent key -> true');
}

// S-2 — key '0' -> disabled (false)
{
  reset();
  memory.setItem(KEY, '0');
  assert.strictEqual(readDiagnosticsLoggingEnabled(), false, "key '0' -> false");
}

// S-3 — key '1' -> enabled (true)
{
  reset();
  memory.setItem(KEY, '1');
  assert.strictEqual(readDiagnosticsLoggingEnabled(), true, "key '1' -> true");
}

// S-4 — any non-'0' value -> enabled (true)
{
  reset();
  memory.setItem(KEY, 'yes');
  assert.strictEqual(readDiagnosticsLoggingEnabled(), true, "non-'0' string -> true");
}

// S-5 — localStorage throws -> defaults true, no throw propagated
{
  reset();
  const realGetItem = memory.getItem.bind(memory);
  memory.getItem = () => {
    throw new Error('SecurityError');
  };
  assert.doesNotThrow(() => readDiagnosticsLoggingEnabled(), 'must not throw when localStorage inaccessible');
  assert.strictEqual(readDiagnosticsLoggingEnabled(), true, 'throws -> defaults true');
  memory.getItem = realGetItem;
}

// S-6 — write(false): persists '0', next read returns false
{
  reset();
  writeDiagnosticsLoggingEnabled(false);
  assert.strictEqual(memory.getItem(KEY), '0', 'write(false) stores "0"');
  assert.strictEqual(readDiagnosticsLoggingEnabled(), false, 'write(false) -> next read false');
}

// S-7 — write(true): persists non-'0', next read returns true
{
  reset();
  writeDiagnosticsLoggingEnabled(false); // known disabled state
  writeDiagnosticsLoggingEnabled(true);
  assert.notStrictEqual(memory.getItem(KEY), '0', 'write(true) clears the "0" sentinel');
  assert.strictEqual(readDiagnosticsLoggingEnabled(), true, 'write(true) -> next read true');
}

// S-8 — round-trip false -> true -> false is stable
{
  reset();
  writeDiagnosticsLoggingEnabled(false);
  assert.strictEqual(readDiagnosticsLoggingEnabled(), false, 'write(false) round-trip');
  writeDiagnosticsLoggingEnabled(true);
  assert.strictEqual(readDiagnosticsLoggingEnabled(), true, 'write(true) round-trip');
  writeDiagnosticsLoggingEnabled(false);
  assert.strictEqual(readDiagnosticsLoggingEnabled(), false, 'write(false) again round-trip');
}

// writer error-safety: setItem throws -> no throw to caller
{
  reset();
  const realSetItem = memory.setItem.bind(memory);
  memory.setItem = () => {
    throw new Error('SecurityError');
  };
  assert.doesNotThrow(() => writeDiagnosticsLoggingEnabled(false), 'writer must not throw when localStorage inaccessible');
  memory.setItem = realSetItem;
}

console.log('diagnostics-prefs: all assertions passed');
