import { Component } from '@angular/core';

@Component({
  selector: 'app-ongoing-stub-page',
  standalone: true,
  template: `
    <section class="stub-panel">
      <h2>Ongoing meetings</h2>
      <p>Ongoing meetings — populated by v2-B4. Coming soon.</p>
    </section>
  `,
  styles: [`
    .stub-panel { border: 1px solid var(--line-soft); border-radius: 8px; background: var(--panel-bg); padding: 20px; }
    h2 { margin: 0 0 8px; font-size: 17px; }
    p { margin: 0; color: var(--muted); }
  `],
})
export class OngoingStubPage {}
