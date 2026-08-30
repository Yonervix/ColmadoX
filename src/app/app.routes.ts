import { Routes } from '@angular/router';
import { authGuard, sinSesionGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [sinSesionGuard],
    loadComponent: () => import('./login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/layout.component').then((m) => m.LayoutComponent),
    children: [
      { path: '', redirectTo: 'inicio', pathMatch: 'full' },
      {
        path: 'inicio',
        loadComponent: () => import('./features/inicio/inicio.component').then((m) => m.InicioComponent),
      },
      {
        path: 'inventario',
        loadComponent: () =>
          import('./features/inventario/inventario.component').then((m) => m.InventarioComponent),
      },
      {
        path: 'ventas',
        loadComponent: () => import('./features/ventas/ventas.component').then((m) => m.VentasComponent),
      },
      {
        path: 'compras',
        loadComponent: () => import('./features/compras/compras.component').then((m) => m.ComprasComponent),
      },
      {
        path: 'mermas',
        loadComponent: () => import('./features/mermas/mermas.component').then((m) => m.MermasComponent),
      },
      {
        path: 'caja',
        loadComponent: () => import('./features/caja/caja.component').then((m) => m.CajaComponent),
      },
      {
        path: 'fiado',
        loadComponent: () => import('./features/fiado/fiado.component').then((m) => m.FiadoComponent),
      },
      {
        path: 'reportes',
        loadComponent: () => import('./features/reportes/reportes.component').then((m) => m.ReportesComponent),
      },
    ],
  },
  { path: '**', redirectTo: 'inicio' },
];