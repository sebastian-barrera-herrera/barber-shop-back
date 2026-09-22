/**
 * Correos al cliente con la estética de la web ("la libreta del salón"): papel, tinta y un ticket.
 * HTML con tablas y estilos en línea (lo que entienden Gmail, Outlook y Apple Mail) + versión de texto.
 * Todo contenido que viene del usuario se escapa.
 */

export interface EmailBusiness {
  name: string;
  address?: string | null;
  city?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  timezone: string;
  currency: string;
  accent: string;
  cancellationWindowHours: number;
}

export interface EmailAppointment {
  customerName: string;
  serviceName: string;
  professionalName: string;
  startsAt: Date;
  durationMinutes: number;
  priceCents: number;
  status: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const PAPER = '#F4F0E8';
const PAPER_2 = '#ECE6DA';
const INK = '#141412';
const STONE = '#6D675D';
const LINE = '#D9D2C5';
const SERIF = "Georgia, 'Iowan Old Style', 'Times New Roman', serif";
const SANS = "'Helvetica Neue', Helvetica, Arial, sans-serif";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** "+573001234567" → "300 123 4567" */
function prettyPhone(e164: string) {
  const d = e164.replace(/[^0-9]/g, '');
  return d.length === 12 && d.startsWith('57')
    ? `${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8)}`
    : e164;
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

function fmtDate(d: Date, tz: string) {
  const s = new Intl.DateTimeFormat('es-CO', {
    timeZone: tz,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(d);
  return s.charAt(0).toUpperCase() + s.slice(1);
}
const fmtTime = (d: Date, tz: string) =>
  new Intl.DateTimeFormat('es-CO', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(d);
const fmtMoney = (cents: number, currency: string) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency,
    maximumFractionDigits: ['COP', 'CLP'].includes(currency) ? 0 : 2,
  })
    .format(cents / 100)
    .replace(/\s/g, '');
const fmtDuration = (m: number) =>
  m < 60 ? `${m} min` : m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} h`;

// ───────────── piezas ─────────────

function layout(b: EmailBusiness, preheader: string, content: string): string {
  const contact = [
    b.whatsapp ? `WhatsApp ${escapeHtml(prettyPhone(b.whatsapp))}` : '',
    b.phone && b.phone !== b.whatsapp ? escapeHtml(prettyPhone(b.phone)) : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const where = [b.address, b.city]
    .filter(Boolean)
    .map((x) => escapeHtml(String(x)))
    .join(', ');
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(b.name)}</title></head>
<body style="margin:0;padding:0;background:${PAPER};">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER};">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
<tr><td style="font-family:${SANS};font-size:12px;letter-spacing:2px;text-transform:uppercase;color:${STONE};padding-bottom:20px;border-bottom:1px solid ${INK};">${escapeHtml(b.name)}</td></tr>
<tr><td style="padding-top:28px;">${content}</td></tr>
<tr><td style="padding-top:32px;font-family:${SANS};font-size:13px;line-height:20px;color:${STONE};border-top:1px solid ${LINE};">
${where ? `${where}<br>` : ''}${contact}
</td></tr>
</table></td></tr></table></body></html>`;
}

function heading(title: string, lead: string, b: EmailBusiness) {
  const words = escapeHtml(title).split(' ');
  const last = words.pop();
  return `<h1 style="margin:0;font-family:${SERIF};font-weight:normal;font-size:34px;line-height:38px;color:${INK};">${words.join(' ')} <em style="color:${b.accent};">${last}</em></h1>
<p style="margin:14px 0 0;font-family:${SANS};font-size:16px;line-height:24px;color:${STONE};">${escapeHtml(lead)}</p>`;
}

function ticket(b: EmailBusiness, a: EmailAppointment, withTotal = true) {
  const rows: [string, string][] = [
    ['Fecha', fmtDate(a.startsAt, b.timezone)],
    ['Hora', fmtTime(a.startsAt, b.timezone)],
    ['Con', a.professionalName],
    ['Duración', fmtDuration(a.durationMinutes)],
  ];
  if (b.address) rows.push(['Dónde', [b.address, b.city].filter(Boolean).join(', ')]);
  const cells = rows
    .map(
      ([k, v]) => `<tr>
<td style="padding:10px 0;border-bottom:1px solid ${LINE};font-family:${SANS};font-size:14px;color:${STONE};">${k}</td>
<td align="right" style="padding:10px 0;border-bottom:1px solid ${LINE};font-family:${SANS};font-size:15px;color:${INK};">${escapeHtml(v)}</td></tr>`,
    )
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:28px;border:1px solid ${INK};border-radius:14px;background:${PAPER};">
<tr><td style="padding:18px 20px 6px;font-family:${SERIF};font-size:24px;color:${INK};">${escapeHtml(a.serviceName)}</td></tr>
<tr><td style="padding:0 20px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${cells}</table></td></tr>
${
  withTotal
    ? `<tr><td style="padding:14px 20px 18px;background:${PAPER_2};border-top:1px dashed ${STONE};border-radius:0 0 14px 14px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td style="font-family:${SANS};font-size:14px;color:${STONE};">Total</td>
<td align="right" style="font-family:${SERIF};font-size:22px;color:${INK};">${fmtMoney(a.priceCents, b.currency)}</td>
</tr></table></td></tr>`
    : ''
}
</table>`;
}

function button(label: string, href: string) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:28px;"><tr>
<td style="background:${INK};border-radius:999px;"><a href="${escapeHtml(href)}" style="display:inline-block;padding:14px 26px;font-family:${SANS};font-size:15px;color:${PAPER};text-decoration:none;">${escapeHtml(label)}</a></td>
</tr></table>`;
}

const note = (text: string) =>
  `<p style="margin:20px 0 0;font-family:${SANS};font-size:13px;line-height:20px;color:${STONE};">${escapeHtml(text)}</p>`;

function textTicket(b: EmailBusiness, a: EmailAppointment) {
  return [
    a.serviceName,
    `Fecha: ${fmtDate(a.startsAt, b.timezone)}`,
    `Hora: ${fmtTime(a.startsAt, b.timezone)}`,
    `Con: ${a.professionalName}`,
    `Duración: ${fmtDuration(a.durationMinutes)}`,
    ...(b.address ? [`Dónde: ${[b.address, b.city].filter(Boolean).join(', ')}`] : []),
    `Total: ${fmtMoney(a.priceCents, b.currency)}`,
  ].join('\n');
}

// ───────────── correos ─────────────

/** Al reservar (web o panel): confirmada o "recibimos tu reserva", con enlace para ver/cancelar. */
export function bookingEmail(
  b: EmailBusiness,
  a: EmailAppointment,
  manageUrl?: string,
): RenderedEmail {
  const confirmed = a.status === 'CONFIRMED';
  const when = `${fmtDate(a.startsAt, b.timezone).toLowerCase()}, ${fmtTime(a.startsAt, b.timezone)}`;
  const title = confirmed
    ? `Te esperamos, ${firstName(a.customerName)}.`
    : `Recibimos tu reserva, ${firstName(a.customerName)}.`;
  const lead = confirmed
    ? `Tu cita en ${b.name} está confirmada.`
    : `${b.name} la confirmará pronto. Te avisaremos por aquí.`;
  const policy =
    b.cancellationWindowHours > 0
      ? `Puedes cancelar sin costo hasta ${b.cancellationWindowHours} h antes desde el enlace.`
      : 'Puedes cancelar desde el enlace cuando lo necesites.';

  const html = layout(
    b,
    `${a.serviceName} · ${when}`,
    heading(title, lead, b) +
      ticket(b, a) +
      (manageUrl
        ? button('Ver o cancelar mi cita', manageUrl) +
          note(`${policy} También puedes escribirnos desde ahí.`)
        : '') +
      note('Adjuntamos el evento para que lo agregues a tu calendario.'),
  );
  const text = [
    title,
    lead,
    '',
    textTicket(b, a),
    '',
    ...(manageUrl ? [`Ver o cancelar tu cita: ${manageUrl}`, policy] : []),
  ].join('\n');
  return {
    subject: confirmed ? `Tu cita en ${b.name}: ${when}` : `Recibimos tu reserva en ${b.name}`,
    html,
    text,
  };
}

/** Cuando el negocio confirma una cita que estaba pendiente. */
export function confirmedEmail(b: EmailBusiness, a: EmailAppointment): RenderedEmail {
  const when = `${fmtDate(a.startsAt, b.timezone).toLowerCase()}, ${fmtTime(a.startsAt, b.timezone)}`;
  const title = `Tu cita está confirmada, ${firstName(a.customerName)}.`;
  const lead = 'Te esperamos. Si necesitas cambiarla, usa el enlace del correo de tu reserva.';
  return {
    subject: `Confirmada: tu cita en ${b.name} (${when})`,
    html: layout(b, `${a.serviceName} · ${when}`, heading(title, lead, b) + ticket(b, a)),
    text: [title, lead, '', textTicket(b, a)].join('\n'),
  };
}

/** Cuando el negocio mueve la cita a otra hora. El .ics adjunto actualiza el evento del calendario. */
export function rescheduledEmail(
  b: EmailBusiness,
  a: EmailAppointment,
  previous: Date,
): RenderedEmail {
  const before = `${fmtDate(previous, b.timezone).toLowerCase()} a las ${fmtTime(previous, b.timezone)}`;
  const now = `${fmtDate(a.startsAt, b.timezone).toLowerCase()} a las ${fmtTime(a.startsAt, b.timezone)}`;
  const title = `Tu cita cambió de hora, ${firstName(a.customerName)}.`;
  const lead = `Antes: ${before} · Ahora: ${now}`;
  const help = 'Si la nueva hora no te sirve, escríbenos desde el enlace del correo de tu reserva.';
  return {
    subject: `Tu cita en ${b.name} cambió: ${now}`,
    html: layout(b, lead, heading(title, lead, b) + ticket(b, a) + note(help)),
    text: [title, lead, '', textTicket(b, a), '', help].join('\n'),
  };
}

/** Cuando el negocio cancela. */
export function cancelledEmail(
  b: EmailBusiness,
  a: EmailAppointment,
  reason: string | null,
  bookUrl: string,
): RenderedEmail {
  const when = `${fmtDate(a.startsAt, b.timezone).toLowerCase()} a las ${fmtTime(a.startsAt, b.timezone)}`;
  const title = 'Tu cita fue cancelada.';
  const lead = `${b.name} canceló tu cita de ${a.serviceName} del ${when}.`;
  return {
    subject: `Cancelada: tu cita en ${b.name} del ${fmtDate(a.startsAt, b.timezone).toLowerCase()}`,
    html: layout(
      b,
      lead,
      heading(title, lead, b) +
        (reason ? note(`Motivo: ${reason}`) : '') +
        note('Lamentamos el cambio. Puedes reservar otra hora cuando quieras.') +
        button('Reservar otra cita', bookUrl),
    ),
    text: [
      title,
      lead,
      ...(reason ? [`Motivo: ${reason}`] : []),
      '',
      `Reservar otra cita: ${bookUrl}`,
    ].join('\n'),
  };
}

/** Recordatorio 24 h / 2 h antes. */
export function reminderEmail(
  b: EmailBusiness,
  a: EmailAppointment,
  label: 'mañana' | 'en 2 horas',
): RenderedEmail {
  const time = fmtTime(a.startsAt, b.timezone);
  const title = `Tu cita es ${label}.`;
  const lead = `${a.serviceName} con ${a.professionalName} a las ${time}. ¡Te esperamos!`;
  return {
    subject: `Recordatorio: tu cita en ${b.name} es ${label} a las ${time}`,
    html: layout(b, lead, heading(title, lead, b) + ticket(b, a, false)),
    text: [title, lead, '', textTicket(b, a)].join('\n'),
  };
}
