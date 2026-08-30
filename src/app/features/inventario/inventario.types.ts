export interface Categoria {
  id: number;
  nombre: string;
}

export type TipoProducto = 'unidad' | 'paquete' | 'caja';

export interface Producto {
  id: string;
  nombre: string;
  categoria_id: number | null;
  tipo: TipoProducto;
  foto_url: string | null;
  stock: number;
  stock_minimo: number;
  precio_compra: number;
  precio_venta: number;
  activo: boolean;
  created_at: string;
  categorias: { nombre: string } | null;
}

export interface ProductoForm {
  nombre: string;
  categoria_id: number | null;
  tipo: TipoProducto;
  stock: number;
  stock_minimo: number;
  precio_compra: number;
  precio_venta: number;
}