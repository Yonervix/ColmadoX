import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { ReportesService, type ResumenReportes, type VentaReporte } from './reportes.service';

export interface Periodo {
  key: string;
  label: string;
}

const PERIODOS: Periodo[] = [
  { key: 'hoy', label: 'Hoy' },
  { key: '7d', label: '7 días' },
  { key: '30d', label: '30 días' },
  { key: 'mes', label: 'Este mes' },
  { key: '6m', label: '6 meses' },
  { key: '1a', label: '1 año' },
];

function iso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dia}`;
}

@Component({
  selector: 'app-reportes',
  imports: [DatePipe, DecimalPipe],
  templateUrl: './reportes.component.html',
})
export class ReportesComponent implements OnInit {
  private servicio = inject(ReportesService);

  protected readonly periodos = PERIODOS;
  protected readonly periodo = signal('30d');
  protected readonly resumen = signal<ResumenReportes | null>(null);
  protected readonly ventas = signal<VentaReporte[]>([]);
  protected readonly cargando = signal(true);
  protected readonly error = signal('');
  protected readonly exportando = signal(false);

  protected readonly rangoLabel = computed(() => {
    const [desde, hasta] = this.fechas();
    return `${this.formatearFecha(desde)} → ${this.formatearFecha(hasta)}`;
  });

  protected readonly maxDia = computed(() => {
    const dias = this.resumen()?.por_dia ?? [];
    return Math.max(...dias.map((d) => d.total), 0);
  });

  async ngOnInit() {
    await this.cargar();
  }

  protected fechas(): [string, string] {
    const hoy = new Date();
    const hoyIso = iso(hoy);
    switch (this.periodo()) {
      case 'hoy':
        return [hoyIso, hoyIso];
      case '7d': {
        const d = new Date(hoy);
        d.setDate(d.getDate() - 6);
        return [iso(d), hoyIso];
      }
      case '30d': {
        const d = new Date(hoy);
        d.setDate(d.getDate() - 29);
        return [iso(d), hoyIso];
      }
      case 'mes': {
        const primero = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
        const ultimo = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
        return [iso(primero), iso(ultimo)];
      }
      case '6m': {
        const d = new Date(hoy);
        d.setMonth(d.getMonth() - 5);
        return [iso(d), hoyIso];
      }
      case '1a': {
        const d = new Date(hoy);
        d.setMonth(d.getMonth() - 11);
        return [iso(d), hoyIso];
      }
      default:
        return [hoyIso, hoyIso];
    }
  }

  protected async cargar(nuevoPeriodo?: string) {
    if (nuevoPeriodo) this.periodo.set(nuevoPeriodo);
    this.cargando.set(true);
    this.error.set('');
    try {
      const [desde, hasta] = this.fechas();
      const [resumen, ventas] = await Promise.all([
        this.servicio.resumen(desde, hasta),
        this.servicio.ventas(desde, hasta),
      ]);
      this.resumen.set(resumen);
      this.ventas.set(ventas);
    } catch (e) {
      this.error.set((e as Error).message);
    }
    this.cargando.set(false);
  }

  protected altura(dia: { fecha: string; total: number }): string {
    const max = this.maxDia();
    if (!max) return '2%';
    return `${Math.max((dia.total / max) * 100, 2).toFixed(1)}%`;
  }

  protected etiquetaTipo(t: string): string {
    return t === 'fiado' ? 'A fiado' : 'Contado';
  }

  protected exportarCSV() {
    const filas = this.ventas();
    if (filas.length === 0) return;
    this.exportando.set(true);
    const cabecera = ['fecha', 'numero', 'tipo', 'cliente', 'total', 'ganancia', 'anulada'];
    const lineas = filas.map((v) =>
      [
        this.formatearFechaDia(v.created_at),
        v.numero,
        v.tipo,
        `"${(v.cliente ?? '').replace(/"/g, '""')}"`,
        v.total.toFixed(2),
        v.ganancia.toFixed(2),
        v.anulada ? 'si' : 'no',
      ].join(','),
    );
    const csv = '\uFEFF' + [cabecera.join(','), ...lineas].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ventas_${iso(new Date())}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    this.exportando.set(false);
  }

  private formatearFecha(isoFecha: string): string {
    return isoFecha.split('-').reverse().join('/');
  }

  private formatearFechaDia(createdAt: string): string {
    const d = new Date(createdAt);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  }
}