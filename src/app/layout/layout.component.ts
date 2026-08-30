import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/services/auth.service';

interface NavItem {
  path: string;
  label: string;
  jefe?: boolean;
}

@Component({
  selector: 'app-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  styleUrl: './layout.component.css',
  templateUrl: './layout.component.html',
})
export class LayoutComponent {
  private auth = inject(AuthService);
  private router = inject(Router);

  protected readonly perfil = this.auth.perfil;

  protected readonly nav = computed(() => {
    const esJefe = !!this.auth.perfil()?.rol && this.auth.isJefe();
    return todas.filter((item) => !item.jefe || esJefe);
  });

  protected async salir() {
    await this.auth.cerrarSesion();
    this.router.navigate(['/login']);
  }
}

const todas: NavItem[] = [
  { path: 'inicio', label: 'Inicio' },
  { path: 'ventas', label: 'Vender' },
  { path: 'inventario', label: 'Inventario', jefe: true },
  { path: 'compras', label: 'Compras', jefe: true },
  { path: 'mermas', label: 'Mermas', jefe: true },
  { path: 'caja', label: 'Caja' },
  { path: 'fiado', label: 'Fiado' },
  { path: 'gastos', label: 'Gastos', jefe: true },
  { path: 'reportes', label: 'Reportes', jefe: true },
  { path: 'info', label: 'Sobre mí' },
];