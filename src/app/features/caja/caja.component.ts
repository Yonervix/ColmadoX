import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CajaService, type CajaHistoria, type Gasto, type ResumenCaja, type VentaDia } from './caja.service';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-caja',
  imports: [FormsModule, DatePipe, DecimalPipe],
  templateUrl: './caja.component.html',
})
export class CajaComponent implements OnInit {
  private servicio = inject(CajaService);
  protected auth = inject(AuthService);

  protected readonly resumen = signal<ResumenCaja | null>(null);
  protected readonly gastos = signal<Gasto[]>([]);
  protected readonly ventas = signal<VentaDia[]>([]);
  protected readonly historial = signal<CajaHistoria[]>([]);
  protected readonly seleccionada = signal<CajaHistoria | null>(null);
  protected readonly gastosSel = signal<Gasto[]>([]);
  protected readonly ventasSel = signal<VentaDia[]>([]);
  protected readonly detalleCargando = signal(false);
  protected readonly modalCerrar = signal(false);
  protected readonly cargando = signal(true);
  protected readonly error = signal('');
  protected readonly ocupado = signal(false);

  protected fondo = 100;
  protected gastoDesc = '';
  protected gastoMonto = 0;
  protected fisico = 0;

  protected readonly cajasCerradas = computed(() =>
    this.historial().filter((c) => c.estado === 'cerrada' && c.id !== this.resumen()?.caja?.id),
  );

  async ngOnInit() {
    this.cargando.set(true);
    try {
      await this.cargarTodo();
    } catch (e) {
      this.error.set((e as Error).message);
    }
    this.cargando.set(false);
  }

  private async cargarTodo() {
    const [resumen, historial] = await Promise.all([
      this.servicio.resumen(),
      this.auth.isJefe() ? this.servicio.listarCajas() : Promise.resolve([] as CajaHistoria[]),
    ]);
    let gastos: Gasto[] = [];
    let ventas: VentaDia[] = [];
    if (resumen.caja?.estado === 'abierta') {
      [gastos, ventas] = await Promise.all([
        this.servicio.listarGastos(resumen.caja.id),
        this.servicio.listarVentas(resumen.caja.id),
      ]);
    }
    this.resumen.set(resumen);
    this.gastos.set(gastos);
    this.ventas.set(ventas);
    this.historial.set(historial);
    this.fisico = 0;
  }

  protected async abrir() {
    this.ocupado.set(true);
    this.error.set('');
    try {
      await this.servicio.abrirCaja(this.fondo);
      await this.cargarTodo();
    } catch (e) {
      this.error.set((e as Error).message);
    }
    this.ocupado.set(false);
  }

  protected async agregarGasto() {
    const caja = this.resumen()?.caja;
    if (!caja || caja.estado !== 'abierta') return;
    if (!this.gastoDesc.trim() || this.gastoMonto <= 0) {
      this.error.set('Escribe la descripción y un monto válido.');
      return;
    }
    this.ocupado.set(true);
    this.error.set('');
    try {
      await this.servicio.registrarGasto(this.gastoDesc.trim(), this.gastoMonto, caja.id);
      this.gastoDesc = '';
      this.gastoMonto = 0;
      await this.cargarTodo();
    } catch (e) {
      this.error.set((e as Error).message);
    }
    this.ocupado.set(false);
  }

  protected readonly ventaAnular = signal<VentaDia | null>(null);

  protected abrirModalAnular(venta: VentaDia) {
    this.error.set('');
    this.ventaAnular.set(venta);
  }

  protected cerrarModalAnular() {
    this.ventaAnular.set(null);
  }

  protected async confirmarAnulacion() {
    const venta = this.ventaAnular();
    if (!venta) return;
    this.ocupado.set(true);
    this.error.set('');
    try {
      await this.servicio.anularVenta(venta.id);
      this.ventaAnular.set(null);
      await this.cargarTodo();
    } catch (e) {
      this.error.set((e as Error).message);
    }
    this.ocupado.set(false);
  }

  protected abrirModalCerrar() {
    this.fisico = 0;
    this.modalCerrar.set(true);
  }

  protected cerrarModal() {
    if (!this.ocupado()) this.modalCerrar.set(false);
  }

  protected async confirmarCierre() {
    if (this.fisico < 0) {
      this.error.set('El dinero físico no puede ser negativo.');
      return;
    }
    this.ocupado.set(true);
    this.error.set('');
    try {
      await this.servicio.cerrarCaja(this.fisico);
      this.modalCerrar.set(false);
      await this.cargarTodo();
    } catch (e) {
      this.error.set((e as Error).message);
    }
    this.ocupado.set(false);
  }

  protected async verDetalle(caja: CajaHistoria) {
    if (this.seleccionada()?.id === caja.id) {
      this.seleccionada.set(null);
      return;
    }
    this.seleccionada.set(caja);
    this.detalleCargando.set(true);
    this.error.set('');
    try {
      const [gastos, ventas] = await Promise.all([
        this.servicio.listarGastos(caja.id),
        this.servicio.listarVentas(caja.id),
      ]);
      this.gastosSel.set(gastos);
      this.ventasSel.set(ventas);
    } catch (e) {
      this.error.set((e as Error).message);
    }
    this.detalleCargando.set(false);
  }

  protected totalVentasSel(): number {
    return this.ventasSel().reduce((acc, v) => acc + v.total, 0);
  }

  protected etiquetaDiferencia(diferencia: number): string {
    if (diferencia === 0) return 'Caja cuadrada';
    if (diferencia > 0) return `Sobran $${diferencia.toFixed(2)}`;
    return `Faltan $${Math.abs(diferencia).toFixed(2)}`;
  }
}