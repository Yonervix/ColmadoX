import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/services/auth.service';
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

  protected readonly perfil = this.auth.perfil;
  protected readonly menuAbierto = signal(false);

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
    ],
  },
  {
    titulo: 'Otros',
    items: [{ path: '/info', label: 'Sobre mí', icon: 'info' }],
  },
];