/** Datos del usuario autenticado, derivados del ID token de Firebase. */
export interface AuthUser {
  uid: string;
  email: string;
  name: string;
  picture: string;
}
