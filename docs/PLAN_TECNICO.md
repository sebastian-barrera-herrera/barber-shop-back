# Studio Booking — Plan técnico

> Estado: **aprobado e implementado (fases 1 y 2)** · Plan: 2026-09-21 · Actualizado: 2026-09-22
> Repos: `barber-shop-back` (API) · `Barber-shop-front` (web). Ramas: `main` (estable) · `develop` (integración) · `feature/*`.


## Estado de implementación (2026-09-22)

| Fase | Hecho | Pendiente |
|---|---|---|
| **1 · MVP** | Todo: modelo, auth y roles, CRUD completo, disponibilidad (con tests), citas, clientes, landing + SEO, reserva, "mi cita", dashboard, calendario, configuración, Docker, README | — |
| **2** | Chat web · pagos Wompi (sandbox/producción, webhook firmado, verificación activa) · notificaciones internas · recordatorios (listos, esperan un canal) · reportes · buscador global | **Arrastrar citas en el calendario** (hoy se mueven desde el detalle) · **email de confirmación** (necesita un proveedor de correo: se agrega como `NotificationChannel`) |
| **3** | Solo interfaces preparadas, como estaba previsto: `ChannelAdapter` (WhatsApp/Instagram/Messenger/Telegram), `NotificationChannel` (email/SMS/push), `PaymentProvider` (Stripe/PayU), `StorageProvider` (S3/R2), eventos de dominio para Google Calendar, lat/lng para Google Maps | Las integraciones en sí |

Cambios frente a este plan, decididos durante la implementación:
- **Next.js 16** (estable al momento de construir) en lugar de 15; **Prisma 6** y **NestJS 11** fijados (las versiones más nuevas eran demasiado recientes).
- **Reserva en 4 pantallas** en lugar de 6 (fecha y hora juntas; datos y confirmación juntos).
- Validación de formularios del front sin `react-hook-form`/`zod`: los formularios son cortos y el backend valida todo.
- Animaciones críticas (título del hero, apariciones al hacer scroll) en **CSS puro** para no ocultar contenido esperando JavaScript.
- Tonos secundarios de 4 estilos oscurecidos levemente para cumplir contraste AA sobre fondos de tarjeta.
- Zonas horarias con `Intl` del propio runtime (sin `date-fns-tz`), en back y front, con tests de cambio de horario.

---

## 1. Análisis y riesgos de arquitectura detectados

| # | Problema | Decisión propuesta |
|---|----------|--------------------|
| 1 | **Doble reserva** por concurrencia (dos clientes toman el mismo horario al mismo tiempo). Validar solo en código no basta. | Restricción de exclusión en PostgreSQL (`btree_gist` + `tstzrange`) sobre `(professional_id, rango)` para citas activas. La BD rechaza el solapamiento aunque dos requests lleguen a la vez. |
| 2 | **Zonas horarias**. Un servidor en UTC y un negocio en Bogotá generan citas corridas 5 horas. | Todo se guarda en `timestamptz` (UTC). Cada negocio tiene `timezone` (`America/Bogota` por defecto). La disponibilidad se calcula en la zona del negocio con `date-fns-tz`. |
| 3 | **Cambios de precio/duración** alteran el historial y los reportes. | La cita guarda una *copia* (`priceSnapshot`, `durationSnapshot`, `serviceNameSnapshot`). |
| 4 | **Chat sin cuenta de cliente**: si el cliente no inicia sesión, ¿cómo se identifica? | Al reservar se genera un enlace privado `/cita/{token}` (token aleatorio, guardado como hash). Desde ahí el cliente ve su cita, la cancela y chatea. Sin contraseñas. |
| 5 | **Clientes duplicados** al reservar sin cuenta. | Cliente único por `(businessId, teléfono normalizado E.164)`. Si reserva de nuevo con el mismo teléfono, se reutiliza. |
| 6 | **Credenciales Wompi por negocio** (futuro SaaS) no pueden vivir solo en `.env`. | Se guardan cifradas (AES-256-GCM, clave en `ENCRYPTION_KEY`). En modo un solo negocio se permite fallback a variables de entorno. Nunca salen del backend. |
| 7 | **Imágenes** (logo, fotos, servicios): el requerimiento no define almacenamiento. | Interfaz `StorageProvider`: disco local en desarrollo, S3/R2 compatible después. |
| 8 | **Dos repos separados** vs. `docker-compose` único. | `docker-compose.yml` vive en el repo back (Postgres + API) y un `docker-compose.full.yml` que además construye el front si está como carpeta hermana `../front-barber`. |
| 9 | **Rol "Super Admin"**: en el requerimiento es el dueño del negocio, pero en un SaaS existe también el dueño de la plataforma. | Roles por negocio: `OWNER` (= Super Admin del requerimiento), `ADMIN`, `PROFESSIONAL`. Se reserva `PLATFORM_ADMIN` para la fase SaaS (no se implementa ahora). |
| 10 | **Three.js pesado** puede arruinar la velocidad móvil. | Se carga con `next/dynamic` sin SSR, solo en el hero, solo si hay WebGL, no hay `prefers-reduced-motion` y el dispositivo no es de gama baja. Siempre hay un fondo estático equivalente. |

---

## 2. Tecnologías (y por qué)

| Capa | Elección | Motivo |
|------|----------|--------|
| Frontend | **Next.js 15 (App Router) + TypeScript** | SSR/SSG para SEO de la landing, rutas amigables, `next/image`, metadata API. |
| Estilos | **Tailwind CSS v4** con tokens CSS (`--color-*`) | Los colores del negocio se inyectan como variables CSS en runtime → cambia la marca sin recompilar. |
| Animación | **Motion (Framer Motion)** + CSS | Transiciones y scroll suaves; respeta `useReducedMotion`. |
| 3D | **three** (sin react-three-fiber) | Un solo objeto en el hero: menos peso que r3f + drei. |
| Formularios | **react-hook-form + zod** | Validación compartida en cliente, poco JS. |
| Datos admin | **TanStack Query** | Caché, reintentos e invalidación tras mutaciones (la cita nueva aparece sola en el dashboard). |
| Backend | **NestJS 11 + TypeScript** | Módulos, DI, guards, pipes de validación y Swagger nativo. |
| ORM | **Prisma** (única opción en todo el proyecto) | Esquema legible, migraciones versionadas, tipos generados. La restricción de exclusión se agrega con SQL en la migración. |
| BD | **PostgreSQL 16** | Rangos de tiempo, `btree_gist`, JSONB para configuración. |
| Auth | JWT de acceso (15 min) + refresh token rotativo en cookie `httpOnly` | Hash con **argon2**. Refresh guardado hasheado en BD, revocable. |
| Validación | `class-validator` + `ValidationPipe({ whitelist, forbidNonWhitelisted })` | Rechaza campos no esperados. |
| Seguridad | `helmet`, `@nestjs/throttler`, CORS por lista blanca | Rate limit más estricto en login y en reserva pública. |
| Eventos | `@nestjs/event-emitter` | `appointment.created` → notificación interna, sin acoplar módulos. |
| Tareas | `@nestjs/schedule` (fase 2) | Recordatorios 24 h / 2 h. |
| Tests | **Jest** (unit + e2e con Postgres de prueba) | Foco en disponibilidad y citas. |

Deliberadamente **no** se usa: microservicios, Redis, colas, GraphQL, FullCalendar (pesado y con licencia para vistas por recurso), librerías de UI completas.

---

## 3. Arquitectura general

```
┌────────────── Front (Next.js) ──────────────┐        ┌──────────── API (NestJS) ────────────┐
│ (public)  landing · servicios · reservar    │  REST  │ /api/v1/public/:slug/*  (sin login)   │
│ (booking) /cita/[token]  gestión + chat     │ ─────► │ /api/v1/*               (JWT + rol)   │
│ (admin)   /admin/*  panel                    │  JSON  │ Swagger en /api/docs                  │
└──────────────────────────────────────────────┘        │  ├ dominio (services, appointments…) │
                                                         │  ├ availability (lógica pura)        │
                                                         │  ├ payments → PaymentProvider        │
                                                         │  ├ notifications → Channel           │
                                                         │  └ Prisma → PostgreSQL               │
                                                         └───────────────────────────────────────┘
```

**Monolito modular.** Cada módulo expone un service; ningún módulo toca tablas de otro directamente.

---

## 4. Multi-negocio (multi-tenant)

- **Una base de datos, columna `businessId`** en todas las tablas del negocio (patrón *shared schema*). Es lo más simple y escala a miles de negocios.
- **Resolución del negocio:**
  - Panel admin → `businessId` sale del JWT (nunca del body).
  - Público → `slug` en la ruta (`/api/v1/public/studio-demo/services`). El front resuelve el slug por variable `NEXT_PUBLIC_BUSINESS_SLUG` hoy; mañana por dominio/subdominio.
- **Aislamiento:** un `TenantGuard` + un helper `scoped(businessId)` en cada repositorio. Tests e2e verifican que el negocio A no lee datos del B.
- **Índices únicos compuestos**: `(businessId, slug)`, `(businessId, phone)`, etc.
- Preparado para después: `Subscription`, `Plan`, dominio propio, Row Level Security de Postgres.

---

## 5. Modelo de datos

```
Business ─┬─ BusinessSettings (1:1)
          ├─ User ── (opcional 1:1) Professional
          ├─ Category ── Service
          ├─ Professional ─┬─ ProfessionalService (N:M con Service)
          │                ├─ WorkingHours   (horario semanal)
          │                └─ TimeOff        (bloqueos, vacaciones, pausas puntuales)
          ├─ Customer ── Appointment ─┬─ Payment (1:N, intentos)
          │                           └─ (Service, Professional)
          ├─ Conversation ── Message
          ├─ Notification
          └─ PaymentProviderConfig (credenciales cifradas)
```

### Entidades (campos principales)

**Business** `id, slug, name, type (BARBERSHOP|SALON|SPA|NAILS|AESTHETICS|OTHER), description, phone, email, whatsapp, address, city, country, lat, lng, timezone, currency ('COP'), locale ('es-CO'), logoUrl, heroImageUrl, isActive, createdAt`

**BusinessSettings** (1:1, agrupado en JSONB tipado por zod)
- `branding`: primaryColor, secondaryColor, fontPreset, heroStyle
- `social`: instagram, facebook, tiktok, whatsapp, website
- `openingHours`: 7 días `{ open, close, closed }`
- `booking`: slotStepMinutes (15), minAdvanceMinutes (60), maxAdvanceDays (30), cancellationWindowHours (4), bufferMinutes (0), autoConfirm (bool), paymentMode (`NONE | OPTIONAL | REQUIRED`)

**User** `id, businessId, email, passwordHash, name, role (OWNER|ADMIN|PROFESSIONAL), isActive, lastLoginAt`
**RefreshToken** `id, userId, tokenHash, expiresAt, revokedAt, userAgent`

**Category** `id, businessId, name, slug, sortOrder`
**Service** `id, businessId, categoryId, name, slug, description, priceCents, durationMinutes, imageUrl, isActive, sortOrder`
> Dinero siempre en **enteros (centavos)** — nunca `float`.

**Professional** `id, businessId, userId?, name, role/title ("Barbero"), bio, photoUrl, specialties text[], social jsonb, color (para el calendario), isActive, sortOrder`
**ProfessionalService** `professionalId, serviceId` (PK compuesta)
**WorkingHours** `id, professionalId, weekday 0-6, startTime 'HH:mm', endTime 'HH:mm'` — varias filas por día permiten pausas (9–13 y 14–18).
**TimeOff** `id, businessId, professionalId? (null = todo el negocio), startsAt, endsAt, reason`

**Customer** `id, businessId, name, phone (E.164), email?, notes, createdAt` — `appointmentsCount` y `lastAppointmentAt` se calculan en consulta (sin columnas desnormalizadas en el MVP).

**Appointment** `id, businessId, customerId, professionalId, serviceId, startsAt, endsAt, status, serviceNameSnapshot, priceCents, durationMinutes, paymentStatus (UNPAID|PENDING|PAID|FAILED|REFUNDED), paymentMethod (CASH|WOMPI|OTHER|null), notes, source (WEB|ADMIN), accessTokenHash, cancelledAt, cancelReason, createdAt, updatedAt`
- `status`: `PENDING | CONFIRMED | IN_PROGRESS | COMPLETED | CANCELLED | NO_SHOW`
- Restricción: `EXCLUDE USING gist (professional_id WITH =, tstzrange(starts_at, ends_at) WITH &&) WHERE (status NOT IN ('CANCELLED','NO_SHOW'))`

**Payment** `id, businessId, appointmentId, provider ('wompi'), providerReference, providerTransactionId, amountCents, currency, status (PENDING|PAID|FAILED|REFUNDED), rawPayload jsonb, createdAt`
**PaymentProviderConfig** `id, businessId, provider, environment (SANDBOX|PRODUCTION), publicKey, encryptedSecrets, isEnabled`

**Conversation** `id, businessId, customerId, channel ('WEB'|'WHATSAPP'|…), externalId?, lastMessageAt, unreadForBusiness int`
**Message** `id, conversationId, sender (CUSTOMER|STAFF|SYSTEM), userId?, body, readAt, createdAt`

**Notification** (internas) `id, businessId, userId?, type, title, body, data jsonb, readAt, createdAt`

---

## 6. Estrategia de disponibilidad

Función **pura** (sin BD) en `availability/engine.ts`, fácil de testear:

```
entrada: fecha, duración del servicio, zona horaria,
         horario del negocio del día, horario del profesional del día (intervalos),
         bloqueos (TimeOff), citas activas, buffer, paso (15 min),
         anticipación mínima/máxima, "ahora"
salida:  lista de horas de inicio ["09:00","09:15",…]
```

Algoritmo:
1. Si la fecha está fuera de `[hoy + minAdvance, hoy + maxAdvanceDays]` → `[]`.
2. **Intervalos libres** = (horario profesional ∩ horario del negocio) − TimeOff − (citas activas ± buffer).
3. Para cada intervalo libre, generar inicios cada `slotStep` mientras `inicio + duración ≤ fin del intervalo`.
4. Descartar inicios anteriores a `ahora + minAdvance`.
5. Opción **"Cualquier profesional"**: unión de slots de todos los que realizan el servicio; al confirmar se asigna al primero libre (el de menos citas ese día).

Al crear la cita se **recalcula** en servidor dentro de una transacción; la restricción de exclusión es la red de seguridad final (error 409 → "Esa hora acaba de ocuparse, elige otra").

Casos de test obligatorios: cita normal · cita que se cruza · profesional ocupado · día no laboral · horario bloqueado · servicio de 30 min · servicio de 60 min que no cabe al final del día · cita cancelada libera el horario · pausa de almuerzo · anticipación mínima · cambio de zona horaria.

---

## 7. Estrategia de pagos

```ts
interface PaymentProvider {
  readonly id: 'wompi' | 'stripe' | 'payu';
  createCheckout(input: { reference; amountCents; currency; customer; redirectUrl }): Promise<CheckoutSession>;
  parseWebhook(headers, rawBody): Promise<PaymentEvent>;   // verifica firma
  getTransaction(id): Promise<PaymentStatusResult>;         // verificación activa
  refund?(transactionId, amountCents): Promise<void>;
}
```

`PaymentsService` elige el proveedor desde `PaymentProviderConfig` del negocio (registro `PaymentProviderRegistry`). El resto del sistema solo conoce `PaymentsService`.

**Flujo Wompi:**
1. Cliente confirma la cita → `POST /public/:slug/appointments/:id/payments`.
2. Backend crea `Payment(PENDING)` con referencia única y firma de integridad `SHA256(reference + amountInCents + currency + integritySecret)`.
3. Front abre el Web Checkout / widget de Wompi solo con `publicKey` + firma (sin secretos).
4. Wompi notifica al webhook `POST /api/v1/payments/webhooks/wompi` → se valida el checksum con el *events secret*.
5. Backend consulta la transacción con la llave privada para confirmar el estado (no confía solo en el redirect).
6. `Payment` y `Appointment.paymentStatus` pasan a `PAID/FAILED`. Idempotente por `providerTransactionId`.

---

## 8. Notificaciones y canales (preparado, no integrado)

- `NotificationService.notify(event)` → despacha a canales registrados: `InAppChannel` (MVP), luego `EmailChannel`, `WhatsAppChannel`, `SmsChannel`, `PushChannel`.
- Chat: `MessagingChannel` con adaptador `WebChatAdapter` (MVP). WhatsApp/Instagram/Messenger/Telegram serán adaptadores que traducen a `Conversation/Message` con `channel` y `externalId`.
- Tiempo real: el MVP usa *polling* ligero (10 s) para mensajes y contador; se puede cambiar a SSE sin tocar el modelo.
- Recordatorios (fase 2): job cada 5 min busca citas en ventana 24 h / 2 h sin recordatorio enviado.

---

## 9. Estructura de API (REST, `/api/v1`, Swagger en `/api/docs`)

**Pública (sin login, rate-limited)** — `/public/:slug`
```
GET  /business                      datos, marca, horario, redes
GET  /categories                    con servicios activos
GET  /services  ·  /services/:slug
GET  /professionals?serviceId=      solo quienes realizan el servicio
GET  /availability?serviceId&professionalId|any&date=YYYY-MM-DD
GET  /availability/days?serviceId&professionalId&month=YYYY-MM   días con cupo (para el calendario)
POST /appointments                  crea cita + cliente → { appointment, manageToken }
GET  /appointments/by-token/:token  · POST …/:token/cancel
GET  /appointments/by-token/:token/messages · POST …/messages
POST /appointments/:id/payments     (fase 2)
```

**Privada (JWT, businessId del token)**
```
POST   /auth/login · /auth/refresh · /auth/logout · GET /auth/me
CRUD   /categories · /services · /professionals
PUT    /professionals/:id/services        asignar servicios
PUT    /professionals/:id/working-hours   definir horario semanal
CRUD   /time-off
GET    /appointments?from&to&professionalId&status&serviceId&q
POST   /appointments                      reserva manual
PATCH  /appointments/:id                  mover / editar
POST   /appointments/:id/status           { status } con reglas de transición
GET    /availability                      (misma lógica, sin anticipación mínima para admin)
GET    /customers?q · GET/PATCH /customers/:id · GET /customers/:id/appointments
GET    /dashboard/today · GET /reports/summary?from&to
GET    /conversations · GET /conversations/:id/messages · POST /conversations/:id/messages · POST /conversations/:id/read
GET    /notifications · POST /notifications/read
GET    /payments · PUT /settings/payments/wompi
GET/PATCH /business · /settings
POST   /uploads                           imágenes (tipo y tamaño validados)
GET    /search?q=                         clientes, citas, profesionales, servicios
POST   /payments/webhooks/wompi           (público, firmado)
```

**Permisos:** `OWNER` todo · `ADMIN` todo menos configuración de pagos, usuarios y datos del negocio · `PROFESSIONAL` solo sus citas, sus clientes, cambiar estado y su propio horario/bloqueos. Implementado con `@Roles()` + filtros por `professionalId` en el service.

---

## 10. Flujo de reserva (cliente)

Una sola página `/reservar` con pasos en la misma vista (sin recargar), y un **"ticket" resumen** que se va llenando (lateral en desktop, barra inferior en móvil):

```
1 ¿Qué servicio?     lista tipo "carta" agrupada por categoría → 1 toque
2 ¿Con quién?        avatares + "Me da igual" (primero disponible) → 1 toque
3 ¿Cuándo?           tira horizontal de 14 días (días sin cupo atenuados) + "ver mes"
4 ¿A qué hora?       horas agrupadas Mañana / Tarde / Noche → 1 toque
5 Tus datos          Nombre · Teléfono (+57 por defecto) · Email opcional · Nota opcional
6 Confirmar          resumen del ticket → [Confirmar cita]
   (pago opcional si el negocio lo activó)
7 Listo              "Te esperamos el jueves 25 a las 4:00 p. m." + agregar a calendario (.ics)
                     + enlace para gestionar la cita + botón WhatsApp
```
- Desde una tarjeta de servicio de la landing se entra con el paso 1 ya resuelto (`/reservar?servicio=corte-clasico`).
- Si solo hay un profesional para ese servicio, el paso 2 se salta.
- Estado del flujo en la URL (se puede volver atrás con el botón del teléfono).

## 11. Flujo administrativo

```
Login → Dashboard "Hoy"
  ├ Resumen: citas de hoy · ingresos del día · pendientes por confirmar · clientes nuevos
  ├ Línea de tiempo de próximas citas con acciones rápidas (Confirmar · Empezar · Completar · No vino)
  └ Botón fijo "Nueva cita" (drawer de 1 pantalla: cliente con autocompletar → servicio → profesional → hora)
Citas       lista con filtros (fecha, profesional, estado, servicio) + buscador
Calendario  Día (columnas por profesional) · Semana · Mes; clic en hueco = nueva cita; clic en cita = drawer; arrastrar para mover (desktop)
Servicios   tarjetas por categoría, "Agregar servicio", toggle activo
Profesionales  tarjeta con foto; dentro: Servicios que realiza (checkboxes) · Horario (editor semanal visual) · Días libres
Clientes    buscador + ficha (citas, notas)
Mensajes    bandeja con contador sin leer
Pagos       (fase 2) listado + "Conectar Wompi"
Configuración  Negocio · Horario · Redes · Apariencia (vista previa en vivo) · Reservas (toggles)
```
Móvil: menú inferior con 4 accesos (Hoy · Calendario · Mensajes · Más).

---

## 12. Dirección de diseño

**Concepto: "La libreta del salón".** Toda barbería y salón real funciona con dos objetos: la **carta de precios** colgada en la pared y la **libreta de citas**. El diseño parte de ahí en vez de parecer un SaaS:

- **Carta de servicios tipográfica** (nombre ······ precio, con duración) en lugar de una grilla de tarjetas. Es como se ven los precios en una barbería o spa de verdad.
- **El ticket**: la reserva construye un comprobante con perforación y número de turno; al final "se imprime" (microanimación de 400 ms).
- **Tipografía editorial**: serif de alto contraste para títulos (*Fraunces* o *Instrument Serif*) + grotesca sobria para UI (*Hanken Grotesk*) + números tabulares para horas y precios.
- **Paleta neutra cálida por defecto**: papel `#F4F0E8`, tinta `#141412`, piedra `#8A8378`, línea `#D9D2C5`, acento latón `#A8854A` (solo en detalles). Modo oscuro "noche" para barberías.
- **Retícula visible**: líneas finas de 1 px como reglas de libreta; mucho aire; nada de glassmorphism ni gradientes.
- **Three.js con propósito**: un solo objeto abstracto en el hero cuyo **material cambia según el tipo de negocio** — acero cepillado (barbería), piedra húmeda (spa), laca brillante (uñas), seda (belleza) — que reacciona suavemente al cursor. Se reemplaza por una imagen estática si no hay WebGL o hay `prefers-reduced-motion`.
- **Movimiento**: entradas por máscara de texto en el hero, revelado de filas de la carta al hacer scroll, transiciones de paso en la reserva. Máximo 300–500 ms, easing suave.
- **Presets de marca** configurables: `BARBER CLUB` (noche + latón), `ALMA SPA` (arena + salvia), `NAIL STUDIO` (hueso + cereza), `BEAUTY HOUSE` (papel + terracota). El admin elige un preset y puede ajustar color principal/secundario; el contraste se valida automáticamente (AA).
- **Estados de cita**: punto de color + texto (nunca solo color). Pendiente ámbar · Confirmada tinta · En curso azul · Completada verde · Cancelada gris tachado · No asistió rojo apagado.
- **Panel admin**: mismo lenguaje pero más silencioso — superficies papel, una sola acción primaria por pantalla.

---

## 13. Estructura de carpetas

### Back (`barber-shop-back`)
```
src/
  main.ts · app.module.ts
  config/            configuration.ts, env.validation.ts (zod)
  common/            guards (jwt, roles, tenant), decorators, filters, pipes, utils (money, phone, time)
  prisma/            prisma.module.ts, prisma.service.ts
  modules/
    auth/ users/ business/ settings/ categories/ services/ professionals/
    availability/    engine.ts (puro) + engine.spec.ts + availability.service.ts
    appointments/ customers/ dashboard/ reports/ search/
    chat/            channels/web-chat.adapter.ts
    payments/        providers/payment-provider.interface.ts, providers/wompi/
    notifications/   channels/in-app.channel.ts
    uploads/         storage/local.storage.ts
prisma/  schema.prisma · migrations/ · seed.ts
test/    e2e
docs/    PLAN_TECNICO.md · API.md
docker/  Dockerfile
docker-compose.yml · docker-compose.full.yml · .env.example · README.md
```

### Front (`Barber-shop-front`)
```
src/
  app/
    (public)/  page.tsx · servicios/ · profesionales/ · contacto/ · reservar/ · cita/[token]/
    (admin)/admin/  login/ · page.tsx (hoy) · citas/ · calendario/ · servicios/ · profesionales/ · clientes/ · mensajes/ · pagos/ · configuracion/
    sitemap.ts · robots.ts · opengraph-image.tsx · layout.tsx
  components/
    ui/        Button Input Select Modal Drawer Card Badge Avatar Toast TimeSlot Calendar
    booking/   ServicePicker ProfessionalPicker DateStrip TimeGrid CustomerForm Ticket
    landing/   Hero HeroCanvas(three) ServiceMenu ProfessionalCard Navbar Footer WhatsAppButton
    admin/     AppointmentCard DayTimeline CalendarDay/Week/Month StatTile ChatWindow
  lib/         api client, auth, format (moneda/fecha), theme (tokens desde BusinessSettings)
  hooks/ · types/ · styles/
.env.example · Dockerfile · README.md
```

---

## 14. Alcance por fases

| Fase | Incluye | Estado |
|------|---------|--------|
| **1 · MVP** | Modelo de datos + migraciones + seed · Auth y roles · CRUD servicios/categorías/profesionales/horarios/bloqueos · Motor de disponibilidad (con tests) · Citas (público + manual + estados) · Clientes · Landing + SEO · Flujo de reserva · Página "gestionar mi cita" · Dashboard · Calendario día/semana/mes · Configuración básica (negocio, horario, redes, apariencia, reservas) · Docker · README | Construir |
| **2** | Chat web · Pagos Wompi (sandbox/producción) · Notificaciones internas + email de confirmación · Recordatorios · Reportes simples · Buscador global · Arrastrar citas | Construir después |
| **3** | WhatsApp Business · Google Calendar · Google Maps · Instagram/Messenger · Push · Multi-tenant avanzado (dominios, planes, suscripciones) · Stripe/PayU | Solo interfaces preparadas |

Orden de trabajo dentro de la fase 1: arquitectura → modelo → backend base → auth → servicios → profesionales → disponibilidad → citas → clientes → landing → reserva → dashboard → calendario → configuración → optimización → tests → Docker → documentación.

---

## 15. Flujo Git

- `main`: solo versiones estables (merge al cerrar cada fase).
- `develop`: integración continua de la fase.
- `feature/<modulo>` → PR a `develop`.
- Commits convencionales (`feat:`, `fix:`, `chore:`, `docs:`, `test:`).
- `.env` nunca se sube; solo `.env.example`.
