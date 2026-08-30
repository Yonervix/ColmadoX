import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InventarioService } from './inventario.service';
import type { Categoria, Producto, ProductoForm, TipoProducto } from './inventario.types';

@Component({
  selector: 'app-inventario',
  imports: [FormsModule, DecimalPipe],
  templateUrl: './inventario.component.html',
})
export class InventarioComponent implements OnInit {
  private servicio = inject(InventarioService);

  protected readonly productos = signal<Producto[]>([]);
  protected readonly categorias = signal<Categoria[]>([]);
  protected readonly cargando = signal(true);
  protected readonly guardando = signal(false);
  protected readonly error = signal('');
  protected readonly modalAbierto = signal(false);
  protected readonly editandoId = signal<string | null>(null);
  protected readonly fotoPreview = signal<string | null>(null);

  protected form: ProductoForm = this.formVacio();
  protected nuevaCategoria = '';
  protected fotoFile: File | null = null;

  private destroyRef = inject(DestroyRef);

  constructor() {
    this.destroyRef.onDestroy(() => {
      const url = this.fotoPreview();
      if (url && url.startsWith('blob:')) URL.revokeObjectURL(url);
    });
  }

  async ngOnInit() {
    await this.cargarTodo();
  }

  private async cargarTodo() {
    this.cargando.set(true);
    this.error.set('');
    try {
      const [prods, cats] = await Promise.all([
        this.servicio.listarProductos(),
        this.servicio.listarCategorias(),
      ]);
      this.productos.set(prods);
      this.categorias.set(cats);
    } catch (e) {
      this.error.set((e as Error).message);
    }
    this.cargando.set(false);
  }

  protected margen(de: Producto): number {
    if (!de.precio_venta) return 0;
    return ((de.precio_venta - de.precio_compra) / de.precio_venta) * 100;
  }

  protected margenForm(): number {
    if (!this.form.precio_venta) return 0;
    return ((this.form.precio_venta - this.form.precio_compra) / this.form.precio_venta) * 100;
  }

  protected stockBajo(p: Producto): boolean {
    return p.stock_minimo > 0 && p.stock <= p.stock_minimo;
  }

  protected etiquetaTipo(t: TipoProducto): string {
    return { unidad: 'Suelto', paquete: 'Paquete', caja: 'Caja' }[t];
  }

  protected abrirNuevo() {
    this.editandoId.set(null);
    this.form = this.formVacio();
    this.fotoFile = null;
    this.fotoPreview.set(null);
    this.modalAbierto.set(true);
  }

  protected abrirEditar(p: Producto) {
    this.editandoId.set(p.id);
    this.form = {
      nombre: p.nombre,
      categoria_id: p.categoria_id,
      tipo: p.tipo,
      stock: p.stock,
      stock_minimo: p.stock_minimo,
      precio_compra: Number(p.precio_compra),
      precio_venta: Number(p.precio_venta),
    };
    this.fotoFile = null;
    this.fotoPreview.set(p.foto_url);
    this.modalAbierto.set(true);
  }

  protected cerrarModal() {
    this.modalAbierto.set(false);
  }

  protected onFoto(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.fotoFile = file;
    const prev = this.fotoPreview();
    if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
    this.fotoPreview.set(URL.createObjectURL(file));
  }

  protected async agregarCategoria() {
    const nombre = this.nuevaCategoria.trim();
    if (!nombre) return;
    try {
      const creada = await this.servicio.crearCategoria(nombre);
      this.categorias.set([...this.categorias(), creada]);
      this.form.categoria_id = creada.id;
      this.nuevaCategoria = '';
    } catch (e) {
      this.error.set((e as Error).message);
    }
  }

  protected async guardar() {
    if (!this.form.nombre.trim()) return;
    this.guardando.set(true);
    this.error.set('');
    try {
      if (this.editandoId()) {
        const id = this.editandoId()!;
        await this.servicio.actualizarProducto(id, { ...this.form });
        if (this.fotoFile) await this.servicio.subirFoto(this.fotoFile, id);
      } else {
        const creado = await this.servicio.crearProducto({ ...this.form });
        if (this.fotoFile) await this.servicio.subirFoto(this.fotoFile, creado.id);
      }
      this.cerrarModal();
      await this.cargarTodo();
    } catch (e) {
      this.error.set((e as Error).message);
    }
    this.guardando.set(false);
  }

  protected async desactivar(p: Producto) {
    const ok = confirm(`¿Desactivar "${p.nombre}"? No aparecerá en ventas.`);
    if (!ok) return;
    await this.servicio.desactivarProducto(p.id);
    await this.cargarTodo();
  }

  private formVacio(): ProductoForm {
    return {
      nombre: '',
      categoria_id: null,
      tipo: 'unidad',
      stock: 0,
      stock_minimo: 0,
      precio_compra: 0,
      precio_venta: 0,
    };
  }
}