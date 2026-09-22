import { BadGatewayException, Injectable, UnauthorizedException } from '@nestjs/common';
import type { TransactionStatus } from '@prisma/client';
import { safeEqual, sha256Hex } from '../../../common/utils/crypto';
import type {
  CheckoutRequest,
  CheckoutSession,
  PaymentProvider,
  ProviderCredentials,
  ProviderTransaction,
} from './payment-provider';

const API = {
  SANDBOX: 'https://sandbox.wompi.co/v1',
  PRODUCTION: 'https://production.wompi.co/v1',
} as const;
const CHECKOUT_URL = 'https://checkout.wompi.co/p/';

/** Estados de Wompi → estados internos. */
const STATUS: Record<string, TransactionStatus> = {
  APPROVED: 'PAID',
  PENDING: 'PENDING',
  DECLINED: 'FAILED',
  ERROR: 'FAILED',
  VOIDED: 'FAILED',
};

interface WompiTransaction {
  id: string;
  reference: string;
  status: string;
  amount_in_cents: number;
  currency: string;
}

interface WompiEvent {
  event?: string;
  data?: { transaction?: WompiTransaction };
  signature?: { properties?: string[]; checksum?: string };
  timestamp?: number;
}

/**
 * Wompi (Colombia) con Web Checkout:
 *  - Firma de integridad: SHA256(referencia + monto_en_centavos + moneda + secreto_integridad)
 *  - Webhook: SHA256(valores de signature.properties + timestamp + secreto_eventos) = checksum
 * Documentación: https://docs.wompi.co
 */
@Injectable()
export class WompiProvider implements PaymentProvider {
  readonly id = 'wompi';
  readonly requiredSecrets = ['integritySecret', 'eventsSecret', 'privateKey'] as const;

  integritySignature(
    reference: string,
    amountCents: number,
    currency: string,
    integritySecret: string,
  ) {
    return sha256Hex(`${reference}${amountCents}${currency}${integritySecret}`);
  }

  createCheckout(creds: ProviderCredentials, req: CheckoutRequest): CheckoutSession {
    const integrity = creds.secrets.integritySecret;
    if (!creds.publicKey || !integrity)
      throw new BadGatewayException('Los pagos en línea no están configurados');

    const params = new URLSearchParams({
      'public-key': creds.publicKey,
      currency: req.currency,
      'amount-in-cents': String(req.amountCents),
      reference: req.reference,
      'signature:integrity': this.integritySignature(
        req.reference,
        req.amountCents,
        req.currency,
        integrity,
      ),
      'redirect-url': req.redirectUrl,
      'customer-data:full-name': req.customer.fullName,
      'customer-data:phone-number': req.customer.phone.replace(/^\+57/, ''),
      'customer-data:phone-number-prefix': req.customer.phone.startsWith('+57') ? '+57' : '',
    });
    if (req.customer.email) params.set('customer-data:email', req.customer.email);
    return { url: `${CHECKOUT_URL}?${params.toString()}` };
  }

  async getTransaction(
    creds: ProviderCredentials,
    transactionId: string,
  ): Promise<ProviderTransaction> {
    if (!/^[\w-]{1,64}$/.test(transactionId)) throw new BadGatewayException('Transacción inválida');
    const res = await fetch(`${API[creds.environment]}/transactions/${transactionId}`, {
      headers: creds.secrets.privateKey
        ? { Authorization: `Bearer ${creds.secrets.privateKey}` }
        : {},
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new BadGatewayException('No pudimos consultar el pago en Wompi');
    const body = (await res.json()) as { data: WompiTransaction };
    return this.toTransaction(body.data, body);
  }

  referenceFromWebhook(body: unknown): string | null {
    return (body as WompiEvent)?.data?.transaction?.reference ?? null;
  }

  parseWebhook(creds: ProviderCredentials, body: unknown): ProviderTransaction {
    const event = body as WompiEvent;
    const secret = creds.secrets.eventsSecret;
    const tx = event?.data?.transaction;
    const props = event?.signature?.properties;
    if (
      !secret ||
      !tx ||
      !props?.length ||
      !event.signature?.checksum ||
      event.timestamp === undefined
    ) {
      throw new UnauthorizedException('Evento inválido');
    }
    const values = props.map((path) => String(this.pick(event.data, path) ?? ''));
    const expected = sha256Hex(`${values.join('')}${event.timestamp}${secret}`);
    if (!safeEqual(expected, event.signature.checksum.toLowerCase())) {
      throw new UnauthorizedException('Firma del evento inválida');
    }
    return this.toTransaction(tx, body);
  }

  private toTransaction(tx: WompiTransaction, raw: unknown): ProviderTransaction {
    return {
      transactionId: tx.id,
      reference: tx.reference,
      status: STATUS[tx.status] ?? 'PENDING',
      amountCents: tx.amount_in_cents,
      currency: tx.currency,
      raw,
    };
  }

  /** "transaction.amount_in_cents" → data.transaction.amount_in_cents */
  private pick(obj: unknown, path: string): unknown {
    return path
      .split('.')
      .reduce<unknown>(
        (acc, key) =>
          acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[key] : undefined,
        obj,
      );
  }
}
