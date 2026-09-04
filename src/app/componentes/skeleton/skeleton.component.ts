import { Component, input } from '@angular/core';

@Component({
  selector: 'app-skeleton',
  template: `
    <div class="animate-pulse space-y-3">
      @for (item of items(); track item) {
        <div class="h-4 rounded-lg bg-slate-200" [style.width]="ancho()"></div>
      }
    </div>
  `,
})
export class SkeletonComponent {
  readonly items = input<number[]>([1, 2, 3]);
  readonly ancho = input<string>('100%');
}
