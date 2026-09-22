import { createHash } from 'node:crypto';
import type { ProviderCredentials } from './payment-provider';
import { WompiProvider } from './wompi.provider';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

describe('WompiProvider', () => {
  const wompi = new WompiProvider();
  const creds: ProviderCredentials = {
    environment: 'SANDBOX',
    publicKey: 'pub_test_abc',
    secrets: {
      integritySecret: 'test_integrity_x',
      eventsSecret: 'test_events_y',
      privateKey: 'prv_test_z',
    },
  };

  it('firma de integridad = SHA256(referencia + centavos + moneda + secreto)', () => {
    expect(wompi.integritySignature('SB-1', 3500000, 'COP', 'test_integrity_x')).toBe(
      sha('SB-13500000COPtest_integrity_x'),
    );
  });

  it('arma la URL del Web Checkout con monto, referencia, firma y retorno', () => {
    const { url } = wompi.createCheckout(creds, {
      reference: 'SB-1',
      amountCents: 3500000,
      currency: 'COP',
      redirectUrl: 'http://localhost:3000/cita/tok?pago=1',
      customer: { fullName: 'Juan Pérez', phone: '+573001234567', email: 'juan@correo.com' },
    });
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe('https://checkout.wompi.co/p/');
    expect(u.searchParams.get('public-key')).toBe('pub_test_abc');
    expect(u.searchParams.get('amount-in-cents')).toBe('3500000');
    expect(u.searchParams.get('signature:integrity')).toBe(sha('SB-13500000COPtest_integrity_x'));
    expect(u.searchParams.get('redirect-url')).toBe('http://localhost:3000/cita/tok?pago=1');
    expect(u.searchParams.get('customer-data:phone-number')).toBe('3001234567');
    // Nunca viajan secretos en la URL
    expect(url).not.toContain('test_integrity_x');
    expect(url).not.toContain('prv_test_z');
  });

  it('sin secreto de integridad no genera pagos', () => {
    expect(() =>
      wompi.createCheckout(
        { ...creds, secrets: {} },
        {
          reference: 'x',
          amountCents: 1,
          currency: 'COP',
          redirectUrl: 'http://x',
          customer: { fullName: 'a', phone: '1' },
        },
      ),
    ).toThrow();
  });

  const event = (status = 'APPROVED') => {
    const transaction = {
      id: '1234-5678',
      reference: 'SB-1',
      status,
      amount_in_cents: 3500000,
      currency: 'COP',
    };
    const properties = ['transaction.id', 'transaction.status', 'transaction.amount_in_cents'];
    const timestamp = 1726990000;
    return {
      event: 'transaction.updated',
      data: { transaction },
      signature: {
        properties,
        checksum: sha(`1234-5678${status}3500000${timestamp}test_events_y`),
      },
      timestamp,
    };
  };

  it('acepta un webhook con firma válida', () => {
    const tx = wompi.parseWebhook(creds, event());
    expect(tx).toMatchObject({
      transactionId: '1234-5678',
      reference: 'SB-1',
      status: 'PAID',
      amountCents: 3500000,
    });
    expect(wompi.referenceFromWebhook(event())).toBe('SB-1');
  });

  it('mapea rechazos a FAILED', () => {
    expect(wompi.parseWebhook(creds, event('DECLINED')).status).toBe('FAILED');
    expect(wompi.parseWebhook(creds, event('PENDING')).status).toBe('PENDING');
  });

  it('rechaza eventos alterados o con otro secreto', () => {
    const tampered = event();
    tampered.data.transaction.amount_in_cents = 100;
    expect(() => wompi.parseWebhook(creds, tampered)).toThrow('Firma del evento inválida');
    expect(() =>
      wompi.parseWebhook({ ...creds, secrets: { eventsSecret: 'otro' } }, event()),
    ).toThrow();
    expect(() => wompi.parseWebhook(creds, { data: {} })).toThrow('Evento inválido');
  });
});
