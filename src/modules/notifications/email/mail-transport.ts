import { Injectable, Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import { AppConfig } from '../../../config/app-config.service';

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  attachments?: { filename: string; content: string; contentType: string }[];
}

/** Cómo sale un correo. SMTP en producción; en tests se reemplaza por uno en memoria. */
export interface MailTransport {
  readonly enabled: boolean;
  send(message: MailMessage): Promise<void>;
}

export const MAIL_TRANSPORT = Symbol('MAIL_TRANSPORT');

/** SMTP genérico: sirve para Gmail, Resend, Amazon SES, Mailgun, Mailpit (desarrollo)… */
@Injectable()
export class SmtpTransport implements MailTransport {
  private readonly logger = new Logger(SmtpTransport.name);
  private readonly transporter: Transporter | null;
  private readonly from: string;

  constructor(config: AppConfig) {
    const host = config.get('SMTP_HOST');
    this.from = config.get('MAIL_FROM');
    this.transporter = host
      ? nodemailer.createTransport({
          host,
          port: config.get('SMTP_PORT'),
          secure: config.get('SMTP_SECURE'),
          auth: config.get('SMTP_USER')
            ? { user: config.get('SMTP_USER'), pass: config.get('SMTP_PASS') }
            : undefined,
          connectionTimeout: 10_000,
        })
      : null;
    if (!host) this.logger.log('SMTP no configurado: no se enviarán correos.');
  }

  get enabled() {
    return this.transporter !== null;
  }

  async send(message: MailMessage) {
    if (!this.transporter) return;
    await this.transporter.sendMail({ from: this.from, ...message });
  }
}
