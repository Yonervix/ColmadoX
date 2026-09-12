import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.listo;
  await auth.esperarPerfil();
  if (!auth.session()) return router.createUrlTree(['/login']);
  if (!auth.tieneColmado()) return router.createUrlTree(['/onboarding']);
  return true;
};

export const sinSesionGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.listo;
  if (auth.session()) return router.createUrlTree(['/inicio']);
  return true;
};

export const sinColmadoGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.listo;
  await auth.esperarPerfil();
  if (!auth.session()) return router.createUrlTree(['/login']);
  if (auth.tieneColmado()) return router.createUrlTree(['/inicio']);
  return true;
};

export const jefeGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.listo;
  if (auth.isJefe()) return true;
  return router.createUrlTree(['/ventas']);
};