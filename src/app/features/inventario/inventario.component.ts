import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InventarioService } from './inventario.service';
import type { Categoria, Producto, ProductoForm } from './inventario.types';

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
  protected readonly buscando = signal('');

  protected readonly grupos = computed(() => {
    const texto = this.buscando().trim().toLowerCase();
    const porCat = new Map<string, Producto[]>();
    for (const p of this.productos()) {
      if (texto) {
        const coincide =
          p.nombre.toLowerCase().includes(texto) ||
          (p.categorias?.nombre ?? '').toLowerCase().includes(texto);
        if (!coincide) continue;
      }
      const clave = p.categorias?.nombre ?? 'Sin categoría';
      const lista = porCat.get(clave) ?? [];
      lista.push(p);
      porCat.set(clave, lista);
    }
    return [...porCat.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], 'es'))
      .map(([categoria, productos]) => ({
        categoria,
        productos: [...productos].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
      }));
  });

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

  protected etiquetaTipo(p: Producto): string {
    const base = { unidad: 'Suelto', paquete: 'Paquete', caja: 'Caja' }[p.tipo];
    if (p.tipo !== 'unidad' && p.unidades_por_paquete && p.unidades_por_paquete > 0) {
      return `${base} · ${p.unidades_por_paquete} c/u`;
    }
    if (p.tipo !== 'unidad') return base + ' · sin conteo';
    return base;
  }

  protected esSinConteo(p: Producto): boolean {
    return p.tipo !== 'unidad' && !(p.unidades_por_paquete && p.unidades_por_paquete > 0);
  }

  protected unidadStock(p: Producto): string {
    return this.esSinConteo(p) ? (p.tipo === 'caja' ? 'cajas' : 'paq') : 'uds';
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
      unidades_por_paquete: p.unidades_por_paquete,
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
    const datos: ProductoForm = {
      ...this.form,
      unidades_por_paquete:
        this.form.tipo === 'unidad' ? null : (this.form.unidades_por_paquete || null),
    };
    try {
      if (this.editandoId()) {
        const id = this.editandoId()!;
        await this.servicio.actualizarProducto(id, datos);
        if (this.fotoFile) await this.servicio.subirFoto(this.fotoFile, id);
      } else {
        const creado = await this.servicio.crearProducto(datos);
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
      unidades_por_paquete: null,
      stock: 0,
      stock_minimo: 0,
      precio_compra: 0,
      precio_venta: 0,
    };
  }
}