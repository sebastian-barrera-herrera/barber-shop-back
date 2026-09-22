# Integraciones futuras

La arquitectura deja puntos de extensión para que cada integración sea "implementar una interfaz y registrarla".

| Integración | Punto de extensión | Qué implementar |
|---|---|---|
| **WhatsApp / Instagram / Messenger / Telegram** (chat) | `ChannelAdapter` en `src/modules/chat/channels/` | `deliver()` para enviar por la API del proveedor; un webhook que llame a `ChatService.receiveFromChannel()` con el cliente y el `externalId` |
| **WhatsApp / SMS** (avisos al cliente) | `NotificationChannel` en `src/modules/notifications/channels/` | `supports()` para la audiencia `CUSTOMER` y `send()`. Al registrar un canal así, los recordatorios 24 h / 2 h empiezan a salir (con `REMINDERS_ENABLED=true`) |
| **Push** (avisos al equipo) | `NotificationChannel` con audiencia `STAFF` | Web Push con claves VAPID |
| **Stripe / PayU** | `PaymentProvider` en `src/modules/payments/providers/` | checkout, consulta de transacción y verificación de webhook |
| **Google Calendar** | Evento `appointment.created` / `appointment.cancelled` | Un listener (`@OnEvent`) que cree o borre el evento en el calendario del profesional |
| **Google Maps** | `Business.latitude/longitude` (ya se configuran en el panel) | Un mapa embebido en la sección "Visítanos" del front |
| **Google Analytics / Meta Pixel** | Front: `src/app/layout.tsx` | Cargar el script con `next/script` solo si el negocio lo configura y con consentimiento |
| **Almacenamiento S3 / R2** | `StorageProvider` en `src/modules/uploads/storage.ts` | `save()` que suba el archivo y devuelva la URL pública |
| **Multi-tenant avanzado** (SaaS) | `businessId` en todas las tablas, slug por negocio | Resolución por dominio/subdominio, rol `PLATFORM_ADMIN`, planes y suscripciones |

Todas las integraciones reaccionan a **eventos de dominio** (`src/common/events.ts`), así que no hay que tocar
el módulo de citas ni el de pagos para agregarlas.

## Ya implementado: correo

`EmailChannel` (`src/modules/notifications/channels/email.channel.ts`) sirve de ejemplo de canal hacia el cliente.
Usa SMTP detrás de `MailTransport` (`MAIL_TRANSPORT`), así que cambiar a la API de Resend o SES es
implementar `send()` y registrarlo con ese token. Los tests lo reemplazan por un transporte en memoria.
