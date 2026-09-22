import type { TransactionStatus } from '@prisma/client';

/**
 * Contrato de una pasarela de pago. El resto del sistema solo conoce PaymentsService;
 * agregar Stripe/PayU = implementar esta interfaz y registrarla en PaymentsModule.
 */
export interface ProviderCredentials {
  environment: 'SANDBOX' | 'PRODUCTION';
  publicKey: string;
  /** Secretos propios del proveedor (llave privada, secreto de integridad, de eventos…) */
  secrets: Record<string, string | undefined>;
}

export interface CheckoutRequest {
  reference: string;
  amountCents: number;
  currency: string;
  redirectUrl: string;
  customer: { fullName: string; phone: string; email?: string | null };
}

export interface CheckoutSession {
  /** URL a la que se envía al cliente para pagar */
  url: string;
}

export interface ProviderTransaction {
  transactionId: string;
  reference: string;
  status: TransactionStatus;
  amountCents: number;
  currency: string;
  raw: unknown;
}

export interface PaymentProvider {
  readonly id: string;
  /** Qué secretos hacen falta para operar (se muestran en el panel) */
  readonly requiredSecrets: readonly string[];
  createCheckout(creds: ProviderCredentials, req: CheckoutRequest): CheckoutSession;
  getTransaction(creds: ProviderCredentials, transactionId: string): Promise<ProviderTransaction>;
  /** Verifica la firma del evento y devuelve la transacción. Lanza si la firma no es válida. */
  parseWebhook(creds: ProviderCredentials, body: unknown): ProviderTransaction;
  /** Referencia del pago dentro del evento, para saber de qué negocio es antes de verificar */
  referenceFromWebhook(body: unknown): string | null;
}

export const PAYMENT_PROVIDERS = Symbol('PAYMENT_PROVIDERS');
