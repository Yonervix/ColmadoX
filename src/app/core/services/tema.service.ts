import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class TemaService {
  readonly oscuro = signal(false);

  constructor() {
    this.oscuro.set(localStorage.getItem('colmadox-tema') === 'oscuro');
    this.aplicar(this.oscuro());
  }

  alternar() {
    this.aplicar(!this.oscuro());
  }

  private aplicar(oscuro: boolean) {
    document.documentElement.classList.toggle('dark', oscuro);
    this.oscuro.set(oscuro);
    localStorage.setItem('colmadox-tema', oscuro ? 'oscuro' : 'claro');
  }
}