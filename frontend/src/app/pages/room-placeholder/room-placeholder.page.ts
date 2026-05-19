import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { RoomsService } from '../../services/rooms.service';

@Component({
  selector: 'app-room-placeholder',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './room-placeholder.page.html',
  styleUrl: './room-placeholder.page.scss',
})
export class RoomPlaceholderPage {
  private readonly route = inject(ActivatedRoute);
  private readonly rooms = inject(RoomsService);

  readonly loading = signal(true);
  readonly exists = signal<boolean | null>(null);
  readonly title = signal('');

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id') || '';
    try {
      const result = await this.rooms.exists(id);
      this.exists.set(result.exists);
      this.title.set(result.title || '');
    } catch {
      this.exists.set(false);
    } finally {
      this.loading.set(false);
    }
  }
}
