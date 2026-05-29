import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const adminGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const user = await auth.ensureSession();
  if (!user) return router.createUrlTree(['/login']);
  return user.isAdmin ? true : router.createUrlTree(['/app/rooms']);
};
