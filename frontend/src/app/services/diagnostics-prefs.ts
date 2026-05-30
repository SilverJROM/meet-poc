/**
 * Shared diagnostics-logging preference (R4 / B3a).
 *
 * Single source of truth for the localStorage flag that gates whether this
 * client collects AND uploads call diagnostics. Read by room.page.ts (to seed
 * the in-call signal that gates start/queue/flush) and read+written by the
 * Settings toggle.
 *
 * Reader contract (preserved verbatim from the original room.page.ts reader):
 *   - key absent        -> true  (default ON)
 *   - value exactly '0' -> false (explicitly disabled)
 *   - any other value   -> true
 *   - localStorage throws (e.g. private-browsing SecurityError) -> true
 */
export const DIAGNOSTICS_LOGGING_STORAGE_KEY = 'meet-poc.diagnosticsLogging';

/**
 * Returns whether diagnostics logging is enabled for this client.
 * Defaults to true unless the flag is explicitly set to '0'.
 */
export function readDiagnosticsLoggingEnabled(): boolean {
  try {
    return window.localStorage.getItem(DIAGNOSTICS_LOGGING_STORAGE_KEY) !== '0';
  } catch {
    return true;
  }
}

/**
 * Persists the diagnostics-logging preference so it round-trips through the
 * reader: false -> stores '0' (reader returns false); true -> stores '1'
 * (reader returns true). localStorage access is guarded; failures are swallowed
 * so callers (e.g. a UI change handler) never throw.
 */
export function writeDiagnosticsLoggingEnabled(enabled: boolean): void {
  try {
    window.localStorage.setItem(DIAGNOSTICS_LOGGING_STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    // localStorage inaccessible (private browsing / blocked): preference is
    // simply not persisted this session. No throw to callers.
  }
}
