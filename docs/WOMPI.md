# Pagos con Wompi

## Cómo funciona

```
Cliente abre su cita ─▶ "Pagar"                (web)
      │
      ▼
POST /public/:slug/appointments/by-token/:token/payments
      │  el backend crea el Payment (PENDING), arma la firma de integridad
      │  SHA256(referencia + monto_en_centavos + moneda + secreto_integridad)
      ▼
Web Checkout de Wompi (tarjeta, PSE, Nequi…)
      │
      ├─▶ Wompi avisa al webhook  POST /api/v1/payments/webhooks/wompi
      │     firma verificada: SHA256(valores de signature.properties + timestamp + secreto_eventos)
      │
      └─▶ el cliente vuelve a /cita/:token?pago=1&id=<transacción>
            el servidor consulta GET /transactions/:id a Wompi (no se confía en la URL)
      ▼
Payment → PAID | FAILED   ·   Cita → paymentStatus PAID (y CONFIRMED si el pago era obligatorio)
```

Protecciones:
- Las llaves privadas y secretos se guardan **cifrados** (AES-256-GCM con `ENCRYPTION_KEY`) y nunca salen del backend.
- El monto lo decide el servidor: si Wompi reporta un monto o moneda distintos al de la cita, el pago se marca **rechazado**.
- El webhook es **idempotente**: el mismo evento dos veces no cambia nada; un pago aprobado o reembolsado no retrocede.
- Cada negocio tiene sus propias llaves: el webhook identifica al negocio por la referencia del pago y verifica con sus secretos.

## Configurar

1. Crea tu cuenta en [comercios.wompi.co](https://comercios.wompi.co).
2. En **Desarrolladores** copia: llave pública (`pub_test_…` / `pub_prod_…`), llave privada (`prv_…`),
   **secreto de integridad** y **secreto de eventos**.
3. En el panel → **Pagos → Cobrar en línea con Wompi**: elige el ambiente, pega las llaves y activa.
4. Copia la **URL de eventos** que muestra el panel y pégala en Wompi → *Desarrolladores → URL de eventos*.
   Debe ser pública y con HTTPS (en local puedes usar un túnel como `cloudflared` o `ngrok`).
5. En **Configuración → Reservas** elige cuándo cobrar:
   - *No cobrar en línea*: se paga en el local (se registra desde la cita).
   - *Opcional*: el cliente ve "Pagar ahora" en su cita.
   - *Obligatorio*: la cita queda pendiente y se confirma al aprobarse el pago.

Primero prueba en **sandbox** con las [tarjetas de prueba de Wompi](https://docs.wompi.co/docs/colombia/datos-de-prueba-en-sandbox/); luego cambia a producción.

## Reembolsos

Se hacen desde el panel de Wompi. Después, en **Pagos → Registrar reembolso**, para que las cuentas cuadren.

## Instalación de un solo negocio

Si no quieres configurar llaves en el panel, puedes definir `WOMPI_ENVIRONMENT`, `WOMPI_PUBLIC_KEY`,
`WOMPI_PRIVATE_KEY`, `WOMPI_INTEGRITY_SECRET` y `WOMPI_EVENTS_SECRET` en el `.env`. Se usan solo si el negocio
no tiene configuración propia.

## Agregar otra pasarela (Stripe, PayU…)

Implementa `PaymentProvider` ([src/modules/payments/providers/payment-provider.ts](../src/modules/payments/providers/payment-provider.ts))
y regístrala en `PaymentsModule`. El resto del sistema no cambia: solo conoce `PaymentsService`.
