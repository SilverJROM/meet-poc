export const DIAGNOSTICS_COLLECT_TIMEOUT_MS = 3_000;
export const DIAGNOSTICS_POST_TIMEOUT_MS = 5_000;

export type DiagnosticsPostResult = 'posted' | 'busy' | 'timeout' | 'failed';

export class DiagnosticsPostGate {
  private inFlight = false;

  constructor(private readonly timeoutMs = DIAGNOSTICS_POST_TIMEOUT_MS) {}

  clear(): void {
    this.inFlight = false;
  }

  async run(post: () => Promise<void>): Promise<DiagnosticsPostResult> {
    if (this.inFlight) return 'busy';
    this.inFlight = true;
    try {
      const result = await settleWithTimeout(post(), this.timeoutMs);
      return result === 'timeout' ? 'timeout' : 'posted';
    } catch {
      return 'failed';
    } finally {
      this.inFlight = false;
    }
  }
}

export async function collectWithTimeout<T>(collect: () => Promise<T | null>, timeoutMs = DIAGNOSTICS_COLLECT_TIMEOUT_MS): Promise<T | undefined> {
  try {
    const result = await settleWithTimeout(collect(), timeoutMs);
    return result === 'timeout' ? undefined : result ?? undefined;
  } catch {
    return undefined;
  }
}

async function settleWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | 'timeout'> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<'timeout'>((resolve) => {
        timer = setTimeout(() => resolve('timeout'), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
