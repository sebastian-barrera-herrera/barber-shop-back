# Studio Booking — API

Backend de la plataforma de reservas para barberías, salones de belleza, spa y estudios de uñas.
**NestJS 11 · Prisma 6 · PostgreSQL 16 · TypeScript.**

- Web (landing, reserva y panel): [Barber-shop-front](https://github.com/sebastian-barrera-herrera/Barber-shop-front)
- Arquitectura y decisiones: [docs/PLAN_TECNICO.md](docs/PLAN_TECNICO.md)
- Guías: [Wompi](docs/WOMPI.md) · [Despliegue](docs/DESPLIEGUE.md) · [Integraciones futuras](docs/INTEGRACIONES.md)

## Qué incluye

| Área | Estado |
|---|---|
| Negocio multi-tenant (todas las tablas con `businessId`), auth con roles | ✅ |
| Registro libre de empresas (`/platform/register`), direcciones libres y reservadas | ✅ |
| Recuperar contraseña por correo (enlace de un solo uso, 1 h) | ✅ |
| Invitación de profesionales por correo y permisos por profesional | ✅ |
| Suscripción del negocio: 14 días de prueba, plan mensual/anual y panel de solo lectura si vence | ✅ |
| Servicios, categorías, profesionales, horarios, bloqueos | ✅ |
| Motor de disponibilidad (zona horaria, pausas, margen, anticipación) | ✅ |
| Citas: reserva pública sin cuenta, manual, mover, estados, enlace privado | ✅ |
| Clientes (sin duplicados por teléfono), dashboard, reportes, buscador | ✅ |
| Chat cliente ↔ negocio (preparado para WhatsApp/Instagram/Messenger/Telegram) | ✅ |
| Pagos con Wompi detrás de `PaymentProvider` (preparado para Stripe/PayU) | ✅ |
| Notificaciones internas por eventos (preparado para WhatsApp/SMS/push) | ✅ |
| Correos al cliente por SMTP: reserva, confirmada, cambió de hora, cancelada; con `.ics` | ✅ |
| Recordatorios 24 h / 2 h por correo (con `REMINDERS_ENABLED=true`) | ✅ |
| Configuración del negocio (marca, redes, horario, reservas), subida de imágenes | ✅ |

---

## 1. Requisitos

- **Node.js 20+** (probado con 22 y 25)
- **Docker** (para PostgreSQL) o un PostgreSQL 16 propio
- npm 10+ (con npm 11, los scripts de instalación necesarios ya están aprobados en `allowScripts`)

## 2. Instalación

```bash
git clone git@github.com:sebastian-barrera-herrera/barber-shop-back.git
cd barber-shop-back
cp .env.example .env
npm install
```

## 3. Variables de entorno

Todas están en [.env.example](.env.example). La app las valida al arrancar y se detiene con un mensaje claro si falta alguna.

| Variable | Obligatoria | Para qué |
|---|---|---|
| `DATABASE_URL` | Sí | Conexión a PostgreSQL |
| `JWT_ACCESS_SECRET` | Sí | Firma de sesiones, mínimo 32 caracteres |
| `ENCRYPTION_KEY` | Para pagos | Cifra las llaves de Wompi guardadas (32 bytes en base64) |
| `CORS_ORIGINS` | Sí | Dominio(s) de la web, separados por coma |
| `WEB_URL` / `API_PUBLIC_URL` | Sí | URLs públicas (retorno del pago, URLs de imágenes) |
| `COOKIE_SECURE` | Producción | `true` con HTTPS |
| `COOKIE_DOMAIN` | Opcional | `.tudominio.com` si web y API usan subdominios |
| `WOMPI_*` | Opcional | Llaves de respaldo si el negocio no las configura en el panel |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASS` | Opcional | Servidor de correo (Gmail, Resend, SES, Mailgun…). Sin `SMTP_HOST` no se envían correos |
| `MAIL_FROM` | Opcional | Remitente, p. ej. `FILO <reservas@tudominio.com>` |
| `PLATFORM_NAME` | Opcional | Marca de la plataforma en los correos propios (por defecto `FILO`) |
| `REMINDERS_ENABLED` | Opcional | Recordatorios automáticos por correo (requieren SMTP) |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | Para el seed | Usuario administrador inicial |

Generar secretos:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"   # JWT_ACCESS_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"      # ENCRYPTION_KEY
```

> El `.env` real nunca se sube al repositorio (`.gitignore` lo excluye).

## 4. Base de datos

```bash
docker compose up -d db     # PostgreSQL en localhost:5432
```

Reglas del modelo ([prisma/schema.prisma](prisma/schema.prisma)):
- Todas las tablas del negocio llevan `businessId`: cada negocio está aislado.
- Fechas en UTC (`timestamptz`); cada negocio define su zona horaria.
- Dinero en enteros (centavos): `$35.000 COP` → `priceCents: 3500000`.
- Una **restricción de exclusión** de PostgreSQL impide que un profesional tenga dos citas activas que se crucen,
  aunque dos personas reserven al mismo tiempo.

## 5. Migraciones

```bash
npm run prisma:deploy    # aplica las migraciones (primera vez, producción, CI)
npm run prisma:migrate   # crea una migración nueva tras cambiar el schema (desarrollo)
npm run prisma:studio    # explorador visual de datos
npm run db:reset         # borra TODO y recrea la base de desarrollo (pide confirmación)
```

## 6. Ejecución

```bash
npm run start:dev            # desarrollo con recarga: http://localhost:4000/api/v1
npm run build && npm start   # producción
```

- Documentación interactiva (Swagger): http://localhost:4000/api/docs
- Salud: http://localhost:4000/health

## 7. Docker

En desarrollo, `docker compose up -d` también levanta **Mailpit**: atrapa todos los correos
(no sale nada a internet). Con `SMTP_HOST=localhost` y `SMTP_PORT=1025` en el `.env`,
se ven en http://localhost:8025.

```bash
docker compose up -d --build                  # PostgreSQL + API (migra al arrancar)
docker compose exec api npx prisma db seed
```

Todo el proyecto (base de datos + API + web), con el front clonado como carpeta hermana `../front-barber`:

```bash
docker compose -f docker-compose.yml -f docker-compose.full.yml up -d --build
# Puertos: API_PORT=4000 WEB_PORT=3000 (configurables)
```

## 8. Frontend

Vive en su propio repositorio: [Barber-shop-front](https://github.com/sebastian-barrera-herrera/Barber-shop-front).
Necesita `NEXT_PUBLIC_API_URL` apuntando a esta API y el dominio de la web en `CORS_ORIGINS`.

## 9. Backend: estructura

```
src/
  config/        variables validadas (zod)
  common/        guards (JWT, roles), decoradores, eventos, utilidades (tiempo, teléfono, cifrado)
  prisma/        cliente de base de datos
  modules/
    auth  business  settings  categories  services  professionals  availability
    appointments  customers  dashboard  reports  search  chat  payments  notifications  uploads
```

Cada módulo expone un servicio; ninguno toca las tablas de otro directamente. Los módulos se comunican con
**eventos de dominio** (`appointment.created`, `message.received`, `payment.updated`…), así agregar un canal
de notificación no toca el código de citas.

**API:** REST bajo `/api/v1`. Rutas públicas por negocio en `/public/:slug/...` (sin sesión, con límite de
peticiones); el resto requiere sesión y toma el negocio del token, nunca del cuerpo de la petición.
Detalle completo en Swagger.

**Roles:** `OWNER` (todo) · `ADMIN` (operación diaria, sin configuración ni llaves de pago) ·
`PROFESSIONAL` (su agenda, sus clientes, estados de sus citas, su horario).

**Seguridad:** argon2id, sesión de 15 min con renovación rotativa en cookie httpOnly (detecta reutilización),
helmet, CORS con lista blanca, límite de peticiones (login 5/min), validación estricta (rechaza campos no
esperados), imágenes verificadas por contenido, secretos de pago cifrados (AES-256-GCM) y webhooks firmados.

## 10. Usuario administrador inicial

```bash
npm run db:seed        # negocio "Studio Demo" (studio-demo)
npm run db:seed:demo   # opcional: 18 clientes y ~270 citas de ejemplo para ver el panel con vida
```

| Usuario | Rol |
|---|---|
| `admin@studio.local` (o `SEED_ADMIN_EMAIL`) | Dueño |
| `carlos@studio.local` · `maria@studio.local` · `laura@studio.local` | Profesional |

Todos con la contraseña de `SEED_ADMIN_PASSWORD`. Incluye 4 categorías, 17 servicios y horarios semanales.
Ambos scripts son idempotentes: si los datos ya existen, no modifican nada.

## 11. Wompi

Resumen (guía completa en [docs/WOMPI.md](docs/WOMPI.md)):
1. En el panel → **Pagos**: pega llave pública, privada, secreto de integridad y secreto de eventos.
2. Copia la **URL de eventos** que muestra el panel en tu cuenta de Wompi.
3. En **Configuración → Reservas** elige: no cobrar en línea, opcional u obligatorio.

El cliente paga desde el enlace de su cita. El backend firma la operación, Wompi procesa, el backend verifica
el estado (webhook firmado y consulta directa) y la cita pasa a **pagada**. Con pago obligatorio, pagar confirma
la cita. Las llaves privadas nunca llegan al navegador.

## 12. Despliegue

Resumen (guía completa en [docs/DESPLIEGUE.md](docs/DESPLIEGUE.md)):
PostgreSQL administrado + la imagen de `docker/Dockerfile` (migra al arrancar) + variables de producción
(`NODE_ENV=production`, `COOKIE_SECURE=true`, secretos nuevos, `CORS_ORIGINS` y URLs reales) + HTTPS delante.
Si hay más de un servidor, mover las imágenes a un almacenamiento S3 compatible (`StorageProvider`).

---

## Tests

```bash
npm test            # unitarios: motor de disponibilidad, firma Wompi, cifrado, recordatorios, tiempo, teléfono…
npm run test:e2e    # extremo a extremo contra una base "<db>_test" que se crea sola (nunca la de desarrollo)
```

El motor de disponibilidad cubre: cita normal, cruces, profesional ocupado, día no laboral, bloqueos,
servicios de 30/60 min, pausas, margen, anticipación y zona horaria con cambio de horario. Hay un test de
6 reservas simultáneas de la misma hora (solo una gana) y pruebas de aislamiento entre negocios.
