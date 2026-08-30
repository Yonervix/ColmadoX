import { inject, Injectable } from '@angular/core';
import { SupabaseService } from '../../core/services/supabase.service';

export interface CajaDia {
  id: string;
  fecha: string;
  fondo_inicial: number;
  estado: 'abierta' | 'cerrada';
  esperado: number | null;
  dinero_fisico: number | null;
  diferencia: number | null;
  ganancia: number | null;
  cerrada_at: string | null;
}

export interface ResumenCaja {
  caja: CajaDia | null;
  ventas_contado: number;
  cobros_fiado: number;
  gastos: number;
  ganancia: number;
  esperado: number;
}

export interface Gasto {
  id: string;
  descripcion: string;
  monto: number;
  fecha: string;
}

export interface VentaDia {
  id: string;
  numero: number;
  tipo: string;
  total: number;
  anulada: boolean;
  created_at: string;
  cliente: string | null;
  ganancia: number;
}

@Injectable({ providedIn: 'root' })
export class CajaService {
  private supabase = inject(SupabaseService);

  private get db() {
    return this.supabase.client;
  }

  async resumen(): Promise<ResumenCaja> {
    const { data, error } = await this.db.rpc('resumen_caja');
    if (error) throw new Error(error.message);
    return data as ResumenCaja;
  }

  async abrirCaja(fondo: number): Promise<string> {
    const { data, error } = await this.db.rpc('abrir_caja', { p_fondo_inicial: fondo });
    if (error) throw new Error(error.message);
    return (data as CajaDia).id;
  }

  async registrarGasto(descripcion: string, monto: number, cajaId: string): Promise<void> {
    const { error } = await this.db.from('gastos').insert({ descripcion, monto, caja_id: cajaId });
    if (error) throw new Error(error.message);
  }

  async listarGastos(cajaId: string): Promise<Gasto[]> {
    const { data, error } = await this.db
      .from('gastos')
      .select('id, descripcion, monto, fecha')
      .eq('caja_id', cajaId)
      .order('fecha', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as Gasto[];
  }

  async listarVentas(cajaId: string): Promise<VentaDia[]> {
    const { data, error } = await this.db.rpc('lista_ventas_caja', { p_caja_id: cajaId });
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown) as VentaDia[];
  }

  async anularVenta(ventaId: string): Promise<void> {
    const { error } = await this.db.rpc('anular_venta', { p_venta_id: ventaId });
    if (error) throw new Error(error.message);
  }

  async cerrarCaja(dineroFisico: number): Promise<void> {
    const { error } = await this.db.rpc('cerrar_caja', { p_dinero_fisico: dineroFisico });
    if (error) throw new Error(error.message);
  }
}