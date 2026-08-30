import { inject, Injectable } from '@angular/core';
import { SupabaseService } from '../../core/services/supabase.service';

export interface GastoRegistro {
  id: string;
  descripcion: string;
  monto: number;
  categoria: string;
  fecha: string;
  caja_id: string | null;
}

export interface FilaPresupuesto {
  categoria: string;
  presupuesto: number;
  gastado: number;
}

export interface PresupuestoMes {
  total_presupuesto: number;
  total_gastado: number;
  filas: FilaPresupuesto[];
}

export const CATEGORIAS_SUGERIDAS = [
  'general',
  'transporte',
  'electricidad',
  'agua',
  'telefono',
  'internet',
  'reparaciones',
  'limpieza',
  'otro',
];

@Injectable({ providedIn: 'root' })
export class GastosService {
  private supabase = inject(SupabaseService);

  private get db() {
    return this.supabase.client;
  }

  async listar(desde: Date, hasta: Date): Promise<GastoRegistro[]> {
    const { data, error } = await this.db
      .from('gastos')
      .select('id, descripcion, monto, categoria, fecha, caja_id')
      .gte('fecha', desde.toISOString())
      .lt('fecha', hasta.toISOString())
      .order('fecha', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as GastoRegistro[];
  }

  async registrar(descripcion: string, monto: number, categoria: string): Promise<void> {
    const { error } = await this.db.rpc('registrar_gasto', {
      p_descripcion: descripcion,
      p_monto: monto,
      p_categoria: categoria || 'general',
    });
    if (error) throw new Error(error.message);
  }

  async cajaAbierta(): Promise<boolean> {
    const { data, error } = await this.db.rpc('caja_abierta_hoy');
    if (error) throw new Error(error.message);
    return !!data;
  }

  async presupuesto(mes: string): Promise<PresupuestoMes> {
    const { data, error } = await this.db.rpc('presupuesto_mes', { p_mes: mes });
    if (error) throw new Error(error.message);
    return (
      (data as PresupuestoMes) ?? { total_presupuesto: 0, total_gastado: 0, filas: [] }
    );
  }

  async guardarPresupuesto(mes: string, categoria: string, monto: number): Promise<void> {
    const { error } = await this.db
      .from('presupuestos')
      .upsert(
        { mes, categoria: categoria.trim().toLowerCase(), monto },
        { onConflict: 'mes,categoria' },
      );
    if (error) throw new Error(error.message);
  }
}