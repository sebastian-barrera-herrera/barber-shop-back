import {
  button,
  escapeHtml,
  INK,
  LINE,
  PAPER,
  SANS,
  SERIF,
  STONE,
  type RenderedEmail,
} from './templates';

/**
 * Correos de la plataforma al equipo de cada empresa (no a sus clientes):
 * bienvenida y recuperar contraseña. Llevan la marca de la plataforma, no la del negocio.
 */

function platformLayout(platform: string, preheader: string, content: string) {
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(platform)}</title></head>
<body style="margin:0;padding:0;background:${PAPER};">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER};">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
<tr><td style="font-family:${SERIF};font-size:22px;letter-spacing:6px;color:${INK};padding-bottom:18px;border-bottom:1px solid ${INK};">${escapeHtml(platform.toUpperCase())}</td></tr>
<tr><td style="padding-top:28px;">${content}</td></tr>
<tr><td style="padding-top:32px;font-family:${SANS};font-size:12px;line-height:18px;color:${STONE};border-top:1px solid ${LINE};">
Recibes este correo porque tu negocio usa ${escapeHtml(platform)}. Si no fuiste tú, ignóralo.
</td></tr>
</table></td></tr></table></body></html>`;
}

const h1 = (t: string) =>
  `<h1 style="margin:0;font-family:${SERIF};font-weight:normal;font-size:32px;line-height:36px;color:${INK};">${escapeHtml(t)}</h1>`;
const p = (t: string) =>
  `<p style="margin:14px 0 0;font-family:${SANS};font-size:16px;line-height:24px;color:${STONE};">${t}</p>`;

export function welcomeEmail(o: {
  platform: string;
  ownerName: string;
  businessName: string;
  pageUrl: string;
  panelUrl: string;
}): RenderedEmail {
  const first = o.ownerName.trim().split(/\s+/)[0];
  const title = `${o.businessName} ya está en línea.`;
  return {
    subject: `Bienvenido a ${o.platform}: tu página es ${o.pageUrl.replace(/^https?:\/\//, '')}`,
    html: platformLayout(
      o.platform,
      `Tu página: ${o.pageUrl}`,
      h1(title) +
        p(`Hola, ${escapeHtml(first)}. Tus clientes ya pueden reservar en:`) +
        p(
          `<a href="${escapeHtml(o.pageUrl)}" style="color:${INK};font-weight:bold;">${escapeHtml(o.pageUrl.replace(/^https?:\/\//, ''))}</a>`,
        ) +
        p(
          'Antes de compartirla, revisa en tu panel los servicios, los precios y tu horario: dejamos unos de ejemplo para que no empezaras en blanco.',
        ) +
        button('Ir a mi panel', o.panelUrl),
    ),
    text: [
      title,
      '',
      `Hola, ${first}. Tus clientes ya pueden reservar en: ${o.pageUrl}`,
      '',
      'Antes de compartirla, revisa en tu panel los servicios, los precios y tu horario.',
      `Tu panel: ${o.panelUrl}`,
    ].join('\n'),
  };
}

export function passwordResetEmail(o: {
  platform: string;
  name: string;
  url: string;
}): RenderedEmail {
  const first = o.name.trim().split(/\s+/)[0];
  return {
    subject: `Restablece tu contraseña de ${o.platform}`,
    html: platformLayout(
      o.platform,
      'El enlace dura 1 hora.',
      h1('Nueva contraseña') +
        p(
          `Hola, ${escapeHtml(first)}. Pediste cambiar tu contraseña. El enlace sirve una sola vez y dura 1 hora.`,
        ) +
        button('Elegir contraseña nueva', o.url) +
        p('Si no lo pediste, no hagas nada: tu contraseña actual sigue igual.'),
    ),
    text: [
      `Hola, ${first}. Pediste cambiar tu contraseña de ${o.platform}.`,
      `Elige una nueva aquí (sirve una vez, dura 1 hora): ${o.url}`,
      '',
      'Si no lo pediste, no hagas nada: tu contraseña actual sigue igual.',
    ].join('\n'),
  };
}

/** Invitación a un profesional para que entre al panel del negocio. */
export function invitationEmail(o: {
  platform: string;
  name: string;
  businessName: string;
  url: string;
}): RenderedEmail {
  const first = o.name.trim().split(/\s+/)[0];
  const title = `${o.businessName} te dio acceso a su agenda`;
  return {
    subject: `${o.businessName} te invitó a su panel`,
    html: platformLayout(
      o.platform,
      'Crea tu contraseña y entra.',
      h1(title) +
        p(
          `Hola, ${escapeHtml(first)}. Desde el panel ves tus citas, tu calendario y tu horario, desde el celular o el computador.`,
        ) +
        button('Crear mi contraseña', o.url) +
        p('El enlace dura 1 hora y sirve una sola vez. Si vence, pide otro al negocio.'),
    ),
    text: [
      title,
      '',
      `Hola, ${first}. Desde el panel ves tus citas, tu calendario y tu horario.`,
      `Crea tu contraseña aquí (dura 1 hora, sirve una vez): ${o.url}`,
    ].join('\n'),
  };
}
