import { Component, input } from '@angular/core';
import { BotonVolverComponent } from '../boton-volver/boton-volver.component';

@Component({
  selector: 'app-encabezado-pagina',
  imports: [BotonVolverComponent],
  template: `
    <div class="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div class="space-y-2">
        <app-boton-volver />
        <h1 class="font-display text-3xl font-bold tracking-tight text-timon-900">{{ titulo() }}</h1>
        @if (subtitulo()) {
          <p class="max-w-2xl text-sm text-stone-500">{{ subtitulo() }}</p>
        }
      </div>
      @if (conAcciones()) {
        <div class="flex shrink-0 items-center gap-2">
          <ng-content select="[acciones]" />
        </div>
      }
    </div>
  `,
})
export class EncabezadoPaginaComponent {
  readonly titulo = input.required<string>();
  readonly subtitulo = input<string>();
  readonly conAcciones = input<boolean>(false);
}
