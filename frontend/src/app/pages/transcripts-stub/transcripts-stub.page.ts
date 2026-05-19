import { Component } from '@angular/core';

@Component({
  selector: 'app-transcripts-stub-page',
  standalone: true,
  template: `
    <section class="stub-panel">
      <h2>Transcripts</h2>
      <p>Transcripts — coming in v2 Run 2.</p>
    </section>
  `,
  styles: [`
    .stub-panel { border: 1px solid var(--line-soft); border-radius: 8px; background: var(--panel-bg); padding: 20px; }
    h2 { margin: 0 0 8px; font-size: 17px; }
    p { margin: 0; color: var(--text); }
  `],
})
export class TranscriptsStubPage {}
