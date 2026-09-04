import { Component, input } from '@angular/core';

@Component({
  selector: 'app-boton-cargando',
  template: `
    <button
      [disabled]="cargando() || disabled()"
      [class]="clasesBase() + ' ' + (cargando() ? 'opacity-70 cursor-wait' : '')"
    >
      @if (cargando()) {
        <svg class="h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
        </svg>
        {{ textoCargando() }}
      } @else {
        <ng-content />
      }
    </button>
  `,
})
export class BotonCargandoComponent {
  readonly cargando = input<boolean>(false);
  readonly disabled = input<boolean>(false);
  readonly textoCargando = input<string>('Procesando...');
  readonly clasesBase = input<string>(
    'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50'
  );
}
