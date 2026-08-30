import { inject, Injectable } from '@angular/core';
import { SupabaseService } from '../../core/services/supabase.service';
import type { Categoria, Producto } from './inventario.types';

@Injectable({ providedIn: 'root' })
export class InventarioService {
  private supabase = inject(SupabaseService);
  private get db() {
    return this.supabase.client;
  }

  async listarCategorias(): Promise<Categoria[]> {
    const { data, error } = await this.db
      .from('categorias')
      .select('id, nombre')
      .order('nombre');
    if (error) throw new Error(error.message);
    return (data ?? []) as Categoria[];
  }

  async crearCategoria(nombre: string): Promise<Categoria> {
    const { data, error } = await this.db
      .from('categorias')
      .insert({ nombre })
      .select('id, nombre')
      .single();
    if (error) throw new Error(error.message);
    return data as Categoria;
  }

  async listarProductos(): Promise<Producto[]> {
    const { data, error } = await this.db
      .from('productos')
      .select('*, categorias(nombre)')
      .eq('activo', true)
      .order('nombre');
    if (error) throw new Error(error.message);
    return (data ?? []) as Producto[];
  }

  async crearProducto(datos: Partial<Producto>): Promise<Producto> {
    const { data, error } = await this.db
      .from('productos')
      .insert(datos)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as Producto;
  }

  async actualizarProducto(id: string, cambios: Partial<Producto>): Promise<void> {
    const { error } = await this.db.from('productos').update(cambios).eq('id', id);
    if (error) throw new Error(error.message);
  }

  async desactivarProducto(id: string): Promise<void> {
    await this.actualizarProducto(id, { activo: false });
  }

  async subirFoto(file: File, productoId: string): Promise<void> {
    const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase();
    const path = `${productoId}/foto.${ext}`;
    const { error } = await this.db.storage
      .from('productos')
      .upload(path, file, { upsert: true });
    if (error) throw new Error(error.message);
    const { data } = this.db.storage.from('productos').getPublicUrl(path);
    await this.actualizarProducto(productoId, { foto_url: data.publicUrl });
  }
}