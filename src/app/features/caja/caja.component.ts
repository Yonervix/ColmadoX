import { Component, inject, OnInit, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CajaService, type Gasto, type ResumenCaja, type VentaDia } from './caja.service';

@Component({
  selector: 'app-caja',
  imports: [FormsModule, DatePipe, DecimalPipe],
  templateUrl: './caja.component.html',
})
export class CajaComponent implements OnInit {
  private servicio = inject(CajaService);

  protected readonly resumen = signal<ResumenCaja | null>(null);
  protected readonly gastos = signal<Gasto[]>([]);
  protected readonly ventas = signal<VentaDia[]>([]);
  protected readonly cargando = signal(true);
  protected readonly error = signal('');
  protected readonly ocupado = signal(false);

  protected fondo = 100;
  protected gastoDesc = '';
  protected gastoMonto = 0;
  protected fisico = 0;

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
    const resumen = await this.servicio.resumen();
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

  protected async anular(venta: VentaDia) {
    if (!confirm(`¿Anular la venta #${venta.numero}? Se devolverá el stock.`)) return;
    this.ocupado.set(true);
    this.error.set('');
    try {
      await this.servicio.anularVenta(venta.id);
      await this.cargarTodo();
    } catch (e) {
      this.error.set((e as Error).message);
    }
    this.ocupado.set(false);
  }

  protected async cerrar() {
    const esperado = this.resumen()?.esperado ?? 0;
    const ganancia = this.resumen()?.ganancia ?? 0;
    if (this.fisico < 0) {
      this.error.set('El dinero físico no puede ser negativo.');
      return;
    }
    if (!confirm(`Arqueo: debe haber $${esperado.toFixed(2)} · contaste $${this.fisico.toFixed(2)}. ¿Cerrar la caja?`)) return;
    this.ocupado.set(true);
    this.error.set('');
    try {
      await this.servicio.cerrarCaja(this.fisico);
      await this.cargarTodo();
    } catch (e) {
      this.error.set((e as Error).message);
    }
    this.ocupado.set(false);
  }

  protected etiquetaDiferencia(diferencia: number): string {
    if (diferencia === 0) return 'Caja cuadrada';
    if (diferencia > 0) return `Sobran $${diferencia.toFixed(2)}`;
    return `Faltan $${Math.abs(diferencia).toFixed(2)}`;
  }
}