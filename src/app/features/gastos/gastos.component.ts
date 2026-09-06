import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GastosService, type GastoRegistro, type FilaPresupuesto, CATEGORIAS_SUGERIDAS } from './gastos.service';
import { EncabezadoPaginaComponent } from '../../componentes/encabezado-pagina/encabezado-pagina.component';

type Periodo = 'hoy' | '7d' | '30d' | 'mes' | 'año';

function hoyRD(): string {
  return new Date(Date.now() - 4 * 3600 * 1000).toISOString().slice(0, 10);
}

function desdeLocal(ymd: string): Date {
  return new Date(`${ymd}T00:00:00-04:00`);
}

interface Rango {
  desde: Date;
  hasta: Date;
}

@Component({
  selector: 'app-gastos',
  imports: [DatePipe, DecimalPipe, FormsModule, EncabezadoPaginaComponent],
  templateUrl: './gastos.component.html',
})
export class GastosComponent implements OnInit {
  private servicio = inject(GastosService);

  protected readonly tab = signal<'gastos' | 'presupuesto'>('gastos');
  protected readonly periodo = signal<Periodo>('mes');

  protected readonly gastos = signal<GastoRegistro[]>([]);
  protected readonly cargando = signal(true);
  protected readonly error = signal('');
  protected readonly sinCaja = signal(false);

  protected descripcion = '';
  protected monto: number | null = null;
  protected categoria = 'general';
  protected readonly sugeridas = CATEGORIAS_SUGERIDAS;

  protected readonly mes = signal(hoyRD().slice(0, 7));
  protected readonly presupuesto = signal<{ total_presupuesto: number; total_gastado: number; filas: FilaPresupuesto[] } | null>(null);
  protected readonly guardandoPres = signal(false);
  protected readonly ediciones = signal<Record<string, number>>({});
  protected nuevaCat = '';
  protected nuevoMonto: number | null = null;

  protected readonly totalGastado = computed(() =>
    this.gastos().reduce((acc, g) => acc + g.monto, 0),
  );

  protected readonly diferencias = computed(() => {
    const p = this.presupuesto();
    if (!p) return null;
    return p.total_presupuesto - p.total_gastado;
  });

  ngOnInit() {
    this.cargarGastos();
    this.cargarPresupuesto();
  }

  protected rango(): Rango {
    const hoy = hoyRD();
    const partes = hoy.split('-');
    const y = Number(partes[0]);
    const m = Number(partes[1]);
    const d = Number(partes[2]);
    let desde = desdeLocal(hoy);
    switch (this.periodo()) {
      case 'hoy':
        break;
      case '7d': {
        const ini = new Date(Date.UTC(y, m - 1, d - 6));
        desde = desdeLocal(ini.toISOString().slice(0, 10));
        break;
      }
      case '30d': {
        const ini = new Date(Date.UTC(y, m - 1, d - 29));
        desde = desdeLocal(ini.toISOString().slice(0, 10));
        break;
      }
      case 'mes': {
        const ini = new Date(Date.UTC(y, m - 1, 1));
        desde = desdeLocal(ini.toISOString().slice(0, 10));
        break;
      }
      case 'año': {
        const ini = new Date(Date.UTC(y, 0, 1));
        desde = desdeLocal(ini.toISOString().slice(0, 10));
        break;
      }
    }
    const manana = new Date(Date.UTC(y, m - 1, d + 1));
    const hasta = desdeLocal(manana.toISOString().slice(0, 10));
    return { desde, hasta };
  }

  async cargarGastos() {
    this.cargando.set(true);
    this.error.set('');
    try {
      const { desde, hasta } = this.rango();
      const [lista, ok] = await Promise.all([
        this.servicio.listar(desde, hasta),
        this.servicio.cajaAbierta(),
      ]);
      this.gastos.set(lista);
      this.sinCaja.set(!ok);
    } catch (e) {
      this.error.set((e as Error).message);
    }
    this.cargando.set(false);
  }

  protected cambiarPeriodo(p: string) {
    this.periodo.set(p as Periodo);
    void this.cargarGastos();
  }

  protected registrar() {
    if (!this.descripcion.trim()) {
      this.error.set('Describe el gasto.');
      return;
    }
    if (!this.monto || this.monto <= 0) {
      this.error.set('Indica un monto mayor a cero.');
      return;
    }
    this.error.set('');
    this.servicio
      .registrar(this.descripcion.trim(), this.monto, this.categoria)
      .then(() => {
        this.descripcion = '';
        this.monto = null;
        this.categoria = 'general';
        return this.cargarGastos();
      })
      .catch((e) => this.error.set((e as Error).message));
  }

  ponerMes(nuevo: string) {
    this.mes.set(nuevo);
    void this.cargarPresupuesto();
  }

  async cargarPresupuesto() {
    this.error.set('');
    const first = `${this.mes()}-01`;
    try {
      const datos = await this.servicio.presupuesto(first);
      this.presupuesto.set(datos);
      const ed: Record<string, number> = {};
      for (const f of datos.filas) ed[f.categoria] = f.presupuesto;
      this.ediciones.set(ed);
    } catch (e) {
      this.error.set((e as Error).message);
      this.presupuesto.set(null);
    }
  }

  setEdicion(cat: string, valor: string | number) {
    const n = Number(valor);
    if (Number.isNaN(n)) return;
    this.ediciones.update((e) => ({ ...e, [cat]: n }));
  }

  guardarFila(cat: string) {
    const valor = this.ediciones()[cat];
    if (valor == null || valor < 0) return;
    this.guardandoPres.set(true);
    this.error.set('');
    this.servicio
      .guardarPresupuesto(`${this.mes()}-01`, cat, valor)
      .then(() => this.cargarPresupuesto())
      .catch((e) => this.error.set((e as Error).message))
      .finally(() => this.guardandoPres.set(false));
  }

  agregarCategoria() {
    if (!this.nuevaCat.trim() || !this.nuevoMonto || this.nuevoMonto < 0) {
      this.error.set('Indica categoría y monto.');
      return;
    }
    this.guardandoPres.set(true);
    this.error.set('');
    this.servicio
      .guardarPresupuesto(`${this.mes()}-01`, this.nuevaCat.trim(), this.nuevoMonto)
      .then(() => {
        this.nuevaCat = '';
        this.nuevoMonto = null;
        return this.cargarPresupuesto();
      })
      .catch((e) => this.error.set((e as Error).message))
      .finally(() => this.guardandoPres.set(false));
  }
}