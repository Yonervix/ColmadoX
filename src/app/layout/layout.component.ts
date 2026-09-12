import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/services/auth.service';
import { ColmadoService } from '../core/services/colmado.service';
import { TemaService } from '../core/services/tema.service';
import { LayoutIconComponent } from './layout-icon.component';

interface NavItem {
  path: string;
  label: string;
  icon: string;
  jefe?: boolean;
}

interface GrupoNav {
  titulo: string;
  items: NavItem[];
}

@Component({
  selector: 'app-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, LayoutIconComponent],
  styleUrl: './layout.component.css',
  templateUrl: './layout.component.html',
})
export class LayoutComponent {
  private auth = inject(AuthService);
  private router = inject(Router);
  private tema = inject(TemaService);
  private colmados = inject(ColmadoService);

  protected readonly perfil = this.auth.perfil;
  protected readonly colmado = this.colmados.info;
  protected readonly menuAbierto = signal(false);
  protected readonly oscuro = this.tema.oscuro;
  protected readonly codigoCopiado = signal(false);

  constructor() {
    void this.colmados.cargar();
  }

  protected copiarCodigo() {
    const codigo = this.colmados.info()?.codigo;
    if (!codigo) return;
    void navigator.clipboard.writeText(codigo).then(() => {
      this.codigoCopiado.set(true);
      setTimeout(() => this.codigoCopiado.set(false), 1500);
    });
  }

  protected alternarTema() {
    this.tema.alternar();
  }

  protected readonly grupos = computed<GrupoNav[]>(() => {
    const esJefe = !!this.auth.perfil()?.rol && this.auth.isJefe();
    return grupos.map((g) => ({
      ...g,
      items: g.items.filter((item) => !item.jefe || esJefe),
    }));
  });

  protected ir(path: string) {
    this.menuAbierto.set(false);
    this.router.navigate([path]);
  }

  protected async salir() {
    await this.auth.cerrarSesion();
    this.router.navigate(['/login']);
  }
}

const grupos: GrupoNav[] = [
  {
    titulo: 'Principal',
    items: [{ path: '/inicio', label: 'Inicio', icon: 'inicio' }],
  },
  {
    titulo: 'Punto de venta',
    items: [
      { path: '/ventas', label: 'Vender', icon: 'vender' },
      { path: '/caja', label: 'Caja', icon: 'caja' },
      { path: '/fiado', label: 'Fiado', icon: 'fiado' },
    ],
  },
  {
    titulo: 'Gestión',
    items: [
      { path: '/inventario', label: 'Inventario', icon: 'inventario', jefe: true },
      { path: '/compras', label: 'Compras', icon: 'compras', jefe: true },
      { path: '/mermas', label: 'Mermas', icon: 'mermas', jefe: true },
      { path: '/gastos', label: 'Gastos', icon: 'gastos', jefe: true },
      { path: '/reportes', label: 'Reportes', icon: 'reportes', jefe: true },
      { path: '/equipo', label: 'Equipo', icon: 'equipo', jefe: true },
    ],
  },
  {
    titulo: 'Otros',
    items: [{ path: '/info', label: 'Sobre mí', icon: 'info' }],
  },
];