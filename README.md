# OrixChat API 🛰️

Backend del chat en tiempo real **OrixChat**: **NestJS + Prisma + PostgreSQL + Socket.IO**, con autenticación delegada a **Firebase Auth** (verificada vía Firebase Admin).

Frontend en [orix-chat](https://github.com/Nahuelito97/orix-chat).

## Arquitectura

```
Front (Firebase Auth) ──ID token (Bearer)──▶ NestJS
                                              ├─ AuthGuard verifica el token (Firebase Admin)
                                              ├─ Prisma + PostgreSQL (datos relacionales)
                                              └─ Socket.IO gateway (realtime)
```

- **Auth:** el front envía el ID token de Firebase; el guard lo verifica con el Admin SDK y hace *upsert* del usuario en Postgres.
- **Realtime:** gateway Socket.IO con rooms `user:<uid>` (lista de chats) y `chat:<id>` (conversación abierta).

## Stack

NestJS 11 · Prisma 6 · PostgreSQL 16 (Docker) · Socket.IO · firebase-admin · class-validator.

## Modelo de datos

`User` · `Chat` (1-a-1 / grupo) · `Participant` (rol, `lastReadAt`, `lastDeliveredAt`, `muted`) · `Message` (texto/imagen/archivo, `replyTo`, `pinnedAt`, `editedAt`, `deletedAt`) · `Reaction`.

## API

**REST** (requiere `Authorization: Bearer <firebase-id-token>`):

| Método | Ruta | Descripción |
| --- | --- | --- |
| POST | `/users/sync` | Crea/actualiza el usuario al loguear |
| GET/PATCH | `/users/me` | Perfil propio |
| GET | `/users/search?q=` | Buscar usuarios |
| GET | `/chats` | Lista de chats |
| POST | `/chats/direct` · `/chats/group` | Crear chat 1-a-1 / grupo |
| GET | `/chats/:id/messages?cursor=` | Historial paginado |
| GET | `/chats/:id/search?q=` | Buscar mensajes en el chat |

**Socket.IO** (token en `handshake.auth.token`): `message:send/edit/delete/pin`, `reaction:toggle`, `typing`, `read`, `delivered`, `chat:mute`, `group:update/addMembers/removeMember`, `chat:leaveGroup`, `chat:delete`. Emite: `message:new/update`, `presence`, `typing`, `read`, `delivered`, `chat:bump`, `chat:gone`.

## Arranque

```bash
npm install
cp .env.example .env                 # DATABASE_URL, FIREBASE_ADMIN_CREDENTIALS, CORS_ORIGIN
# colocar el service account JSON como ./firebase-admin.json (NO se commitea)
docker compose up -d                 # PostgreSQL en localhost:5433
npx prisma migrate dev               # aplica migraciones
npm run start:dev                    # http://localhost:3000
```

### Variables de entorno

```
DATABASE_URL="postgresql://orix:orix@localhost:5433/orixchat?schema=public"
FIREBASE_ADMIN_CREDENTIALS="./firebase-admin.json"
PORT=3000
CORS_ORIGIN="http://localhost:5173"
```

> `firebase-admin.json` y `.env` están en `.gitignore` — nunca se suben al repo.

## Scripts

| Script | Qué hace |
| --- | --- |
| `npm run start:dev` | Dev con watch |
| `npm run build` | Compila a `dist/` |
| `npm run lint` | ESLint |
| `npx prisma studio` | Explorador de la base |
