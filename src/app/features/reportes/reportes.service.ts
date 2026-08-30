import { inject, Injectable } from '@angular/core';
import { SupabaseService } from '../../core/services/supabase.service';

export interface VentaReporte {
  id: string;
  numero: number;
  tipo: string;
  total: number;
  anulada: boolean;
  created_at: string;
  cliente: string | null;
  ganancia: number;
}

export interface DiaVentas {
  fecha: string;
  total: number;
  ganancia: number;
}

export interface ResumenReportes {
  ventas: number;
  ganancia: number;
  gastos: number;
  mermas_costo: number;
  cobros_fiado: number;
  tickets: number;
  por_dia: DiaVentas[];
  top: { nombre: string; cantidad: number; total: number }[];
  por_tipo: { tipo: string; total: number }[];
}

@Injectable({ providedIn: 'root' })
export class ReportesService {
  private supabase = inject(SupabaseService);

  private get db() {
    return this.supabase.client;
  }

  async resumen(desde: string, hasta: string): Promise<ResumenReportes> {
    const { data, error } = await this.db.rpc('resumen_reportes', {
      p_desde: desde,
      p_hasta: hasta,
    });
    if (error) throw new Error(error.message);
    return (data as ResumenReportes) ?? ({} as ResumenReportes);
  }

  async ventas(desde: string, hasta: string): Promise<VentaReporte[]> {
    const { data, error } = await this.db.rpc('lista_ventas_rango', {
      p_desde: desde,
      p_hasta: hasta,
    });
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown) as VentaReporte[];
  }
}