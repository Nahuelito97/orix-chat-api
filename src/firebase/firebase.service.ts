import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as admin from 'firebase-admin';

/** Forma del service account JSON (snake_case, como lo da la consola). */
interface ServiceAccountFile {
  project_id: string;
  client_email: string;
  private_key: string;
}

/**
 * Inicializa el Admin SDK con el service account JSON y expone la
 * verificación de ID tokens que manda el front (login de Firebase).
 */
@Injectable()
export class FirebaseService implements OnModuleInit {
  private readonly logger = new Logger(FirebaseService.name);

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    if (admin.apps.length) return;

    const path = this.config.get<string>(
      'FIREBASE_ADMIN_CREDENTIALS',
      './firebase-admin.json',
    );
    const serviceAccount = JSON.parse(
      readFileSync(resolve(process.cwd(), path), 'utf8'),
    ) as ServiceAccountFile;
    admin.initializeApp({
      credential: admin.credential.cert(
        serviceAccount as unknown as admin.ServiceAccount,
      ),
    });
    this.logger.log(
      `Firebase Admin listo (project ${serviceAccount.project_id})`,
    );
  }

  /** Verifica el ID token; devuelve el token decodificado o lanza. */
  verifyIdToken(idToken: string): Promise<admin.auth.DecodedIdToken> {
    return admin.auth().verifyIdToken(idToken);
  }
}
