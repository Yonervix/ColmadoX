import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { CajaService, type ResumenCaja } from '../caja/caja.service';
import { FiadoService, type Deudor } from '../fiado/fiado.service';
import { VentaService, type ProductoVenta } from '../ventas/venta.service';
import { ReportesService } from '../reportes/reportes.service';
import { LayoutIconComponent } from '../../layout/layout-icon.component';

function hoyYmd(): string {
  return new Date(Date.now() - 4 * 3600 * 1000).toISOString().slice(0, 10);
}

function sumarDia(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00-04:00`);
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

@Component({
  selector: 'app-inicio',
  imports: [DecimalPipe, LayoutIconComponent],
  templateUrl: './inicio.component.html',
})
export class InicioComponent implements OnInit {
  protected auth = inject(AuthService);
  private cajaServ = inject(CajaService);
  private fiadoServ = inject(FiadoService);
  private ventaServ = inject(VentaService);
  private reportesServ = inject(ReportesService);
  private router = inject(Router);

  protected readonly perfil = this.auth.perfil;
  protected readonly cargando = signal(true);
  protected readonly error = signal('');

  protected readonly resumen = signal<ResumenCaja | null>(null);
  protected readonly deudores = signal<Deudor[]>([]);
  protected readonly stockBajo = signal<ProductoVenta[]>([]);
  protected readonly ventasHoy = signal(0);
  protected readonly gananciaHoy = signal(0);
  protected readonly ticketsHoy = signal(0);

  protected readonly fechaLarga = computed(() => {
    const hoy = new Date(new Date(Date.now() - 4 * 3600 * 1000).toISOString());
    return new Intl.DateTimeFormat('es-DO', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(hoy);
  });

  protected readonly saludo = computed(() => {
    const h = new Date(Date.now() - 4 * 3600 * 1000).getUTCHours() + 4;
    const hora = h >= 24 ? h - 24 : h;
    if (hora < 12) return 'Buenos días';
    if (hora < 18) return 'Buenas tardes';
    return 'Buenas noches';
  });

  protected readonly cajaAbierta = computed(() => this.resumen()?.caja?.estado === 'abierta');
  protected readonly debeHaber = computed(() => this.resumen()?.esperado ?? 0);

  protected readonly saldoDeudores = computed(() =>
    this.deudores().reduce((acc, d) => acc + d.saldo, 0),
  );

  protected readonly nombreStockBajo = computed(() =>
    this.stockBajo()
      .slice(0, 3)
      .map((p) => p.nombre)
      .join(', '),
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
    const hoy = hoyYmd();
    const manana = sumarDia(hoy);
    const [resumen, deudores, productos] = await Promise.all([
      this.cajaServ.resumen(),
      this.fiadoServ.deudores(),
      this.ventaServ.listarProductos(),
    ]);
    this.resumen.set(resumen);
    this.deudores.set(deudores);
    this.stockBajo.set(productos.filter((p) => p.stock <= (p.stock_minimo ?? 0)));

    if (this.auth.isJefe()) {
      const r = await this.reportesServ.resumen(hoy, manana);
      this.ventasHoy.set(r.ventas ?? 0);
      this.gananciaHoy.set(r.ganancia ?? 0);
      this.ticketsHoy.set(r.tickets ?? 0);
    } else if (resumen.caja?.estado === 'abierta') {
      this.ventasHoy.set(resumen.ventas_contado + resumen.cobros_fiado);
      this.ticketsHoy.set(0);
    }
  }

  protected ir(path: string) {
    this.router.navigate([path]);
  }
}