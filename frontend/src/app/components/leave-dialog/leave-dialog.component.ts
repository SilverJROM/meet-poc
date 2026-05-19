import { Component, output, signal } from '@angular/core';

@Component({
  selector: 'app-leave-dialog',
  standalone: true,
  templateUrl: './leave-dialog.component.html',
  styleUrl: './leave-dialog.component.scss',
})
export class LeaveDialogComponent {
  readonly busy = signal(false);
  readonly endForAll = output<void>();
  readonly justLeave = output<void>();
  readonly cancel = output<void>();

  end(): void {
    this.busy.set(true);
    this.endForAll.emit();
  }
}
