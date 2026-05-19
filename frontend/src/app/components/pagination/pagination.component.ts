import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-pagination',
  standalone: true,
  templateUrl: './pagination.component.html',
  styleUrl: './pagination.component.scss',
})
export class PaginationComponent {
  @Input({ required: true }) page = 1;
  @Input({ required: true }) total = 0;
  @Input({ required: true }) pageSize = 20;
  @Output() readonly pageChange = new EventEmitter<number>();

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.total / this.pageSize));
  }

  get previousDisabled(): boolean {
    return this.page <= 1;
  }

  get nextDisabled(): boolean {
    return this.page >= this.totalPages;
  }

  previous(): void {
    if (!this.previousDisabled) this.pageChange.emit(this.page - 1);
  }

  next(): void {
    if (!this.nextDisabled) this.pageChange.emit(this.page + 1);
  }
}
