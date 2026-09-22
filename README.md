# Studio Booking — API

Backend de la plataforma de reservas para barberías, salones, spa y estudios de uñas.
NestJS 11 · Prisma 6 · PostgreSQL 16 · TypeScript.

El frontend vive en [Barber-shop-front](https://github.com/sebastian-barrera-herrera/Barber-shop-front).
Arquitectura y decisiones: [docs/PLAN_TECNICO.md](docs/PLAN_TECNICO.md).

## Estado

| Paso | Módulo | Estado |
|---|---|---|
| 1 | Arquitectura | ✅ |
| 2 | Modelo de datos (todas las entidades + restricción anti doble reserva) | ✅ |
| 3 | Backend base (config validada, guards globales, errores, Swagger, helmet, rate limit) | ✅ |
| 4 | Autenticación (login, refresh rotativo, logout, roles) | ✅ |
| 5 | Categorías y servicios (CRUD + catálogo público) | ✅ |
| 6+ | Profesionales, disponibilidad, citas, clientes… | Pendiente |

## Requisitos

- Node.js 20 o superior
- Docker (para PostgreSQL), o un PostgreSQL 16 propio

## Puesta en marcha

```bash
cp .env.example .env          # completa JWT_ACCESS_SECRET y SEED_ADMIN_PASSWORD
npm install
docker compose up -d db       # PostgreSQL en localhost:5432
npm run prisma:deploy         # aplica migraciones
npm run db:seed               # datos demo
npm run start:dev             # http://localhost:4000/api/v1
```

- Documentación interactiva: http://localhost:4000/api/docs
- Salud: http://localhost:4000/health

> npm 11 bloquea los scripts de instalación por defecto. `package.json` ya aprueba los necesarios
> (`argon2`, `prisma`, `@prisma/client`, `@prisma/engines`) en `allowScripts`.

## Variables de entorno

Ver [.env.example](.env.example). Las importantes:

| Variable | Para qué |
|---|---|
| `DATABASE_URL` | Conexión a PostgreSQL |
| `JWT_ACCESS_SECRET` | Firma de los tokens (mínimo 32 caracteres). Genera uno: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `CORS_ORIGINS` | Orígenes del frontend permitidos, separados por coma |
| `COOKIE_SECURE` | `true` en producción (HTTPS) |
| `ENCRYPTION_KEY` | Cifra las credenciales de pago guardadas en BD (fase 2) |
| `SEED_ADMIN_PASSWORD` | Contraseña de los usuarios demo |

La app valida las variables al arrancar y se detiene con un mensaje claro si falta alguna.
El `.env` real nunca se sube al repositorio.

## Base de datos

```bash
npm run prisma:migrate   # crea una migración nueva tras cambiar prisma/schema.prisma (desarrollo)
npm run prisma:deploy    # aplica migraciones pendientes (producción / CI)
npm run prisma:studio    # explorador visual de datos
npm run db:reset         # borra TODO y vuelve a crear la base de desarrollo (pide confirmación)
```

Reglas del modelo:
- Todas las tablas del negocio llevan `businessId` (multi-negocio con esquema compartido).
- Fechas en UTC (`timestamptz`); cada negocio define su `timezone`.
- Dinero en enteros (centavos): `$35.000 COP` → `priceCents: 3500000`.
- Una restricción de exclusión en PostgreSQL impide que un profesional tenga dos citas activas que se crucen.

## Usuario administrador inicial

`npm run db:seed` crea el negocio **Studio Demo** (`studio-demo`) con:

| Usuario | Rol |
|---|---|
| `admin@studio.local` (o `SEED_ADMIN_EMAIL`) | Dueño |
| `carlos@studio.local` · `maria@studio.local` · `laura@studio.local` | Profesional |

Todos con la contraseña de `SEED_ADMIN_PASSWORD`. Incluye 4 categorías, 17 servicios y horarios semanales
(Carlos descansa los miércoles, Laura los lunes). Si el negocio ya existe, el seed no modifica nada.

## Autenticación

- `POST /api/v1/auth/login` → `{ accessToken, user }` + cookie `sb_rt` (httpOnly, SameSite=Lax).
- El `accessToken` (15 min) va en `Authorization: Bearer …`.
- `POST /api/v1/auth/refresh` usa la cookie, entrega un token nuevo y **rota** la cookie. Si alguien reutiliza
  una cookie vieja, se cierran todas las sesiones del usuario.
- Contraseñas con argon2id. Login limitado a 5 intentos por minuto por IP.

Roles: `OWNER` (todo) · `ADMIN` (operación diaria) · `PROFESSIONAL` (sus citas y horario).

## API disponible

Pública (sin login), por negocio:

```
GET /api/v1/public/:slug/business              perfil, marca, horario, redes
GET /api/v1/public/:slug/catalog               carta de servicios agrupada por categoría
GET /api/v1/public/:slug/services?category=    servicios activos
GET /api/v1/public/:slug/services/:serviceSlug detalle y profesionales que lo realizan
```

Privada (JWT; el negocio sale del token, nunca del cuerpo de la petición):

```
POST /auth/login · POST /auth/refresh · POST /auth/logout · GET /auth/me
GET/PATCH /business
GET/POST/PATCH/DELETE /categories
GET/POST/PATCH/DELETE /services      (DELETE es suave: conserva el historial de citas)
```

## Tests

```bash
npm test            # unitarios
npm run test:e2e    # e2e contra una base "<db>_test" que se crea sola (nunca la de desarrollo)
```

Cubren: login, refresh con rotación y detección de reuso, logout, validación, permisos por rol,
aislamiento entre negocios, CRUD de servicios y catálogo público.

## Docker

```bash
docker compose up -d --build   # PostgreSQL + API (aplica migraciones al arrancar)
docker compose exec api npx prisma db seed   # opcional: datos demo
```

## Deployment

1. PostgreSQL 16 administrado (Neon, Render, RDS…).
2. Variables de entorno de producción: `NODE_ENV=production`, `COOKIE_SECURE=true`, `CORS_ORIGINS` con el dominio real,
   secretos nuevos para `JWT_ACCESS_SECRET` y `ENCRYPTION_KEY`.
3. Construir con `docker/Dockerfile`. Al arrancar corre `prisma migrate deploy`.
4. Swagger queda apagado en producción salvo `SWAGGER_ENABLED=true`.

## Wompi

Se integra en la fase 2 detrás de la interfaz `PaymentProvider` (ver plan técnico, sección 7).
Las variables `WOMPI_*` ya están reservadas en `.env.example`.
