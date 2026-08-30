import { inject, Injectable } from '@angular/core';
import { InventarioService } from '../inventario/inventario.service';
import type { Producto } from '../inventario/inventario.types';
import { SupabaseService } from '../../core/services/supabase.service';

export interface ItemCompra {
  producto_id: string;
  nombre: string;
  cantidad: number;
  costo_unitario: number;
}

export interface Compra {
  id: string;
  proveedor: string;
  fecha: string;
  total: number;
  compra_items: {
    id: number;
    producto_id: string;
    cantidad: number;
    costo_unitario: number;
  }[];
}

@Injectable({ providedIn: 'root' })
export class ComprasService {
  private supabase = inject(SupabaseService);
  private inventario = inject(InventarioService);

  private get db() {
    return this.supabase.client;
  }

  listarProductos(): Promise<Producto[]> {
    return this.inventario.listarProductos();
  }

  async registrarCompra(proveedor: string, items: ItemCompra[]): Promise<void> {
    const { error } = await this.db.rpc('registrar_compra', {
      p_proveedor: proveedor.trim(),
      p_items: items.map((i) => ({
        producto_id: i.producto_id,
        cantidad: i.cantidad,
        costo_unitario: i.costo_unitario,
      })),
    });
    if (error) throw new Error(error.message);
  }

  async listarCompras(): Promise<Compra[]> {
    const { data, error } = await this.db
      .from('compras')
      .select('*, compra_items(*)')
      .order('fecha', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as Compra[];
  }
}