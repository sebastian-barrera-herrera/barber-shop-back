/** Archivo .ics adjunto a los correos: "Agregar a mi calendario". */

const stamp = (d: Date) =>
  d
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
const BACKSLASH = String.fromCharCode(92);
const escape = (s: string) =>
  s
    .split(BACKSLASH)
    .join(BACKSLASH + BACKSLASH)
    .replace(/([,;])/g, `${BACKSLASH}$1`)
    .split('\n')
    .join(`${BACKSLASH}n`);

export function buildIcs(e: {
  uid: string;
  title: string;
  start: Date;
  end: Date;
  location?: string;
  description?: string;
}): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Studio Booking//ES',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${e.uid}@studio-booking`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(e.start)}`,
    `DTEND:${stamp(e.end)}`,
    `SUMMARY:${escape(e.title)}`,
    ...(e.location ? [`LOCATION:${escape(e.location)}`] : []),
    ...(e.description ? [`DESCRIPTION:${escape(e.description)}`] : []),
    'BEGIN:VALARM',
    'TRIGGER:-PT2H',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escape(e.title)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}
