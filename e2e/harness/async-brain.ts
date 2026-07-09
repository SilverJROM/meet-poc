// Fire-and-forget LLM brain: dispatches queries without blocking the speech scheduler.
// Never awaited; responses settle asynchronously and are retrieved on demand.

export interface AsyncBrainState {
  lastUserUtterance?: string;
  transcriptSoFar: string;
  pendingReply?: {
    promise: Promise<string>;
    settled: boolean;
  };
  settledReply?: string;
}

export interface LLMInvoker {
  invoke(userText: string, transcriptSoFar: string): Promise<string>;
}

export class AsyncBrain {
  private state: AsyncBrainState = {
    transcriptSoFar: '',
  };

  constructor(private llmInvoker?: LLMInvoker) {}

  /**
   * Dispatch an async LLM query. Returns immediately without waiting for reply.
   * The response settles in the background and can be retrieved via getSettledReply().
   */
  dispatch(userText: string, transcriptSoFar: string): void {
    this.state.lastUserUtterance = userText;
    this.state.transcriptSoFar = transcriptSoFar;

    // If no invoker (mock mode), resolve to a mock response
    if (!this.llmInvoker) {
      const mockReply = `[Mock reply to: "${userText.substring(0, 20)}"]`;
      this.state.settledReply = mockReply;
      return;
    }

    // Fire off the LLM query in background using setImmediate to ensure
    // we return to caller before the promise chain starts
    setImmediate(() => {
      const promise = this.llmInvoker!.invoke(userText, transcriptSoFar);

      this.state.pendingReply = {
        promise,
        settled: false,
      };

      // Attachment: capture result when ready (never blocks dispatch)
      promise
        .then((text) => {
          if (this.state.pendingReply?.promise === promise) {
            this.state.settledReply = text;
            this.state.pendingReply.settled = true;
          }
        })
        .catch(() => {
          // Silence errors; next dispatch or getSettledReply() will handle gracefully
          if (this.state.pendingReply?.promise === promise) {
            this.state.settledReply = '[LLM error; no reply]';
            this.state.pendingReply.settled = true;
          }
        });
    });
  }

  /**
   * Retrieve the most recently settled LLM reply, or undefined if not yet settled.
   * Never blocks.
   */
  getSettledReply(): string | undefined {
    return this.state.settledReply;
  }

  getState(): AsyncBrainState {
    return { ...this.state };
  }

  reset(): void {
    this.state = {
      transcriptSoFar: '',
    };
  }
}
