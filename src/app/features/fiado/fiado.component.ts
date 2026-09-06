import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { DecimalPipe, DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { FiadoService, type Deudor, type HistorialCli } from './fiado.service';
import { AuthService } from '../../core/services/auth.service';
import { EncabezadoPaginaComponent } from '../../componentes/encabezado-pagina/encabezado-pagina.component';

@Component({
  selector: 'app-fiado',
  imports: [DecimalPipe, DatePipe, FormsModule, EncabezadoPaginaComponent],
  templateUrl: './fiado.component.html',
})
export class FiadoComponent implements OnInit {
  private servicio = inject(FiadoService);
  private router = inject(Router);
  protected auth = inject(AuthService);

  protected readonly deudores = signal<Deudor[]>([]);
  protected readonly cargando = signal(true);
  protected readonly error = signal('');
  protected readonly sinCaja = signal(false);

  protected readonly abono = signal<{ cliente: Deudor } | null>(null);
  protected readonly abonoMonto = signal<number | null>(null);
  protected readonly guardando = signal(false);
  protected readonly abonoError = signal('');

  protected readonly expandido = signal<string | null>(null);
  protected readonly historial = signal<Record<string, HistorialCli>>({});
  protected readonly cargandoHist = signal(false);

  protected readonly totalPendiente = computed(() =>
    this.deudores().reduce((acc, d) => acc + Math.max(d.saldo, 0), 0),
  );

  protected readonly deudoresActivos = computed(
    () => this.deudores().filter((d) => d.saldo > 0).length,
  );

  ngOnInit() {
    void this.cargar();
  }

  async cargar() {
    this.cargando.set(true);
    this.error.set('');
    try {
      const [lista, ok] = await Promise.all([
        this.servicio.deudores(),
        this.servicio.cajaAbierta(),
      ]);
      this.deudores.set(lista);
      this.sinCaja.set(!ok);
    } catch (e) {
      this.error.set((e as Error).message);
    }
    this.cargando.set(false);
  }

  protected irACaja() {
    this.router.navigate(['/caja']);
  }

  protected abrirAbono(d: Deudor) {
    this.abono.set({ cliente: d });
    this.abonoMonto.set(d.saldo);
    this.abonoError.set('');
  }

  protected cerrarAbono() {
    this.abono.set(null);
    this.abonoMonto.set(null);
  }

  protected confirmarAbono() {
    const a = this.abono();
    if (!a) return;
    const monto = this.abonoMonto();
    if (monto == null || monto <= 0) {
      this.abonoError.set('Indica un monto válido.');
      return;
    }
    if (monto > a.cliente.saldo) {
      this.abonoError.set('El abono no puede superar el saldo del cliente.');
      return;
    }
    this.guardando.set(true);
    this.abonoError.set('');
    this.servicio
      .pagar(a.cliente.id, monto)
      .then(() => {
        this.cerrarAbono();
        return this.cargar();
      })
      .catch((e) => {
        this.abonoError.set((e as Error).message);
      })
      .finally(() => this.guardando.set(false));
  }

  protected verDetalle(id: string) {
    const actual = this.expandido();
    if (actual === id) {
      this.expandido.set(null);
      return;
    }
    this.expandido.set(id);
    if (this.historial()[id]) return;
    this.cargandoHist.set(true);
    this.servicio
      .historial(id)
      .then((h) => this.historial.update((m) => ({ ...m, [id]: h })))
      .catch((e) => this.error.set((e as Error).message))
      .finally(() => this.cargandoHist.set(false));
  }
}