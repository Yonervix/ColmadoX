import { Injectable, inject } from '@angular/core';

export type TipoNotificacion = 'exito' | 'error' | 'info' | 'aviso';

@Injectable({ providedIn: 'root' })
export class NotificacionesServicio {
  private container: HTMLDivElement | null = null;

  private obtenerContainer(): HTMLDivElement {
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.className = 'xide-notificaciones-container';
      document.body.appendChild(this.container);
    }
    return this.container;
  }

  private obtenerColor(tipo: TipoNotificacion): string {
    const colores: Record<TipoNotificacion, string> = {
      exito: 'bg-emerald-600 text-white',
      error: 'bg-red-600 text-white',
      info: 'bg-slate-800 text-white',
      aviso: 'bg-amber-500 text-white',
    };
    return colores[tipo];
  }

  mostrar(mensaje: string, tipo: TipoNotificacion = 'info', duracionMs = 3000) {
    const container = this.obtenerContainer();

    const toast = document.createElement('div');
    toast.className = `xide-toast ${this.obtenerColor(tipo)}`;
    toast.textContent = mensaje;

    container.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('xide-toast-visible'));

    setTimeout(() => {
      toast.classList.remove('xide-toast-visible');
      setTimeout(() => toast.remove(), 300);
    }, duracionMs);
  }

  exito(mensaje: string, duracionMs = 3000) {
    this.mostrar(mensaje, 'exito', duracionMs);
  }

  error(mensaje: string, duracionMs = 4000) {
    this.mostrar(mensaje, 'error', duracionMs);
  }

  info(mensaje: string, duracionMs = 3000) {
    this.mostrar(mensaje, 'info', duracionMs);
  }

  aviso(mensaje: string, duracionMs = 3500) {
    this.mostrar(mensaje, 'aviso', duracionMs);
  }
}
