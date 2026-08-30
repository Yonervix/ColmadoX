import { Routes } from '@angular/router';
import { authGuard, jefeGuard, sinSesionGuard } from './core/guards/auth.guard';

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
        canActivate: [jefeGuard],
        loadComponent: () =>
          import('./features/inventario/inventario.component').then((m) => m.InventarioComponent),
      },
      {
        path: 'ventas',
        loadComponent: () => import('./features/ventas/ventas.component').then((m) => m.VentasComponent),
      },
      {
        path: 'compras',
        canActivate: [jefeGuard],
        loadComponent: () => import('./features/compras/compras.component').then((m) => m.ComprasComponent),
      },
      {
        path: 'mermas',
        canActivate: [jefeGuard],
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
        path: 'gastos',
        canActivate: [jefeGuard],
        loadComponent: () => import('./features/gastos/gastos.component').then((m) => m.GastosComponent),
      },
      {
        path: 'info',
        loadComponent: () => import('./features/info/info.component').then((m) => m.InfoComponent),
      },
      {
        path: 'reportes',
        canActivate: [jefeGuard],
        loadComponent: () => import('./features/reportes/reportes.component').then((m) => m.ReportesComponent),
      },
    ],
  },
  { path: '**', redirectTo: 'inicio' },
];