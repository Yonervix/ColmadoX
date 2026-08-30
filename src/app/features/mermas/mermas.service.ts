import { inject, Injectable } from '@angular/core';
import { AuthService } from '../../core/services/auth.service';
import { InventarioService } from '../inventario/inventario.service';
import type { Producto } from '../inventario/inventario.types';
import { SupabaseService } from '../../core/services/supabase.service';

export interface Merma {
  id: string;
  producto_id: string;
  cantidad: number;
  motivo: string;
  origen: string;
  fecha: string;
  productos: { nombre: string } | null;
}

export interface ItemConteo {
  producto_id: string;
  nombre: string;
  stock_sistema: number;
  stock_fisico: number;
}

@Injectable({ providedIn: 'root' })
export class MermasService {
  private supabase = inject(SupabaseService);
  private auth = inject(AuthService);
  private inventario = inject(InventarioService);

  private get db() {
    return this.supabase.client;
  }

  listarProductos(): Promise<Producto[]> {
    return this.inventario.listarProductos();
  }

  async listarMermas(): Promise<Merma[]> {
    const { data, error } = await this.db
      .from('mermas')
      .select('*, productos(nombre)')
      .order('fecha', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as Merma[];
  }

  async registrarMerma(producto_id: string, cantidad: number, motivo: string): Promise<void> {
    const { error } = await this.db.rpc('registrar_merma', {
      p_producto_id: producto_id,
      p_cantidad: cantidad,
      p_motivo: motivo,
    });
    if (error) throw new Error(error.message);
  }

  async iniciarConteo(): Promise<string> {
    const { data, error } = await this.db
      .from('conteos')
      .insert({ created_by: this.auth.session()?.user.id ?? null })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    return data.id as string;
  }

  async cerrarConteo(conteoId: string, items: ItemConteo[]): Promise<void> {
    const { error } = await this.db.rpc('cerrar_conteo', {
      p_conteo_id: conteoId,
      p_items: items.map((i) => ({
        producto_id: i.producto_id,
        stock_sistema: i.stock_sistema,
        stock_fisico: i.stock_fisico,
      })),
    });
    if (error) throw new Error(error.message);
  }
}