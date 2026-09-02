import { inject, Injectable } from '@angular/core';
import { SupabaseService } from '../../core/services/supabase.service';
import type { TipoProducto } from '../inventario/inventario.types';

export interface ProductoVenta {
  id: string;
  nombre: string;
  tipo: TipoProducto;
  unidades_por_paquete: number | null;
  foto_url: string | null;
  stock: number;
  stock_minimo: number;
  precio_venta: number;
}

export interface Cliente {
  id: string;
  nombre: string;
  telefono: string | null;
}

export interface VentaRegistrada {
  id: string;
  numero: number;
  tipo: 'contado' | 'fiado';
  cliente_id: string | null;
  total: number;
  descuento: number;
  pago_con: number | null;
  cambio: number | null;
}

export interface ItemVenta {
  producto_id: string;
  cantidad: number;
  precio_venta: number;
}

@Injectable({ providedIn: 'root' })
export class VentaService {
  private supabase = inject(SupabaseService);

  private get db() {
    return this.supabase.client;
  }

  async listarProductos(): Promise<ProductoVenta[]> {
    const { data, error } = await this.db
      .from('productos_venta')
      .select('*')
      .order('nombre');
    if (error) throw new Error(error.message);
    return (data ?? []) as ProductoVenta[];
  }

  async listarClientes(): Promise<Cliente[]> {
    const { data, error } = await this.db
      .from('clientes')
      .select('id, nombre, telefono')
      .order('nombre');
    if (error) throw new Error(error.message);
    return (data ?? []) as Cliente[];
  }

  async cajaAbierta(): Promise<boolean> {
    const { data, error } = await this.db.rpc('caja_abierta_hoy');
    if (error) throw new Error(error.message);
    return !!data;
  }

  async crearCliente(nombre: string, telefono?: string): Promise<Cliente> {
    const { data, error } = await this.db
      .from('clientes')
      .insert({ nombre, telefono: telefono || null })
      .select('id, nombre, telefono')
      .single();
    if (error) throw new Error(error.message);
    return data as Cliente;
  }

  async registrarVenta(args: {
    tipo: 'contado' | 'fiado';
    cliente_id?: string | null;
    pago_con?: number | null;
    descuento?: number;
    items: ItemVenta[];
  }): Promise<VentaRegistrada> {
    const { data, error } = await this.db.rpc('registrar_venta', {
      p_tipo: args.tipo,
      p_cliente_id: args.cliente_id ?? null,
      p_pago_con: args.pago_con ?? null,
      p_descuento: args.descuento ?? 0,
      p_items: args.items,
    });
    if (error) throw new Error(error.message);
    return data as VentaRegistrada;
  }
}