import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { FirebaseService } from '../firebase/firebase.service';
import { AuthUser } from './auth-user';

/** Protege rutas HTTP: exige `Authorization: Bearer <firebase-id-token>`. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly firebase: FirebaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const header = req.headers.authorization ?? '';
    const [scheme, token] = header.split(' ');

    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException('Falta el token de autenticación');
    }

    try {
      const decoded = await this.firebase.verifyIdToken(token);
      const user: AuthUser = {
        uid: decoded.uid,
        email: decoded.email ?? '',
        name: (decoded.name as string | undefined) ?? '',
        picture: decoded.picture ?? '',
      };
      (req as Request & { user: AuthUser }).user = user;
      return true;
    } catch {
      throw new UnauthorizedException('Token inválido o expirado');
    }
  }
}
