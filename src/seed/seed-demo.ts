/**
 * Citas de demostración para ver el dashboard y el calendario con vida:
 * 14 días hacia atrás (la mayoría completadas) y 7 hacia adelante (pendientes/confirmadas),
 * respetando el horario de cada profesional y los servicios que realiza.
 * Idempotente: si ya existen clientes demo, no hace nada.
 *
 *   npm run db:seed:demo
 */
import { AppointmentStatus, PrismaClient } from '@prisma/client';
import { addDays, toLocalDate, weekdayOf, zonedToUtc } from '../common/utils/time';

const prisma = new PrismaClient();
const SLUG = process.env.SEED_BUSINESS_SLUG || 'studio-demo';
const DEMO_DOMAIN = '@demo.studio';

/** PRNG determinista: los mismos datos en cada máquina. */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

const NAMES = [
  'Andrés Gómez',
  'Valentina Ríos',
  'Santiago Herrera',
  'Camila Duarte',
  'Mateo Rojas',
  'Isabella Castro',
  'Juan Pablo Mejía',
  'Mariana López',
  'Daniel Ortiz',
  'Sofía Vargas',
  'Nicolás Pardo',
  'Gabriela Suárez',
  'Felipe Cárdenas',
  'Lucía Moreno',
  'Sebastián Niño',
  'Paula Restrepo',
  'Tomás Beltrán',
  'Laura Salazar',
];

async function main() {
  const business = await prisma.business.findUnique({ where: { slug: SLUG } });
  if (!business) throw new Error(`No existe el negocio "${SLUG}". Corre primero: npm run db:seed`);

  if (
    await prisma.customer.count({
      where: { businessId: business.id, email: { endsWith: DEMO_DOMAIN } },
    })
  ) {
    console.log('Las citas demo ya existen; no se modificó nada.');
    return;
  }

  const random = rng(42);
  const pick = <T>(list: T[]) => list[Math.floor(random() * list.length)];
  const tz = business.timezone;
  const now = new Date();
  const today = toLocalDate(now, tz);

  const customers = await Promise.all(
    NAMES.map((name, i) =>
      prisma.customer.create({
        data: {
          businessId: business.id,
          name,
          phone: `+57310${String(4000000 + i * 7919).padStart(7, '0')}`,
          email: `${name
            .split(' ')[0]
            .toLowerCase()
            .normalize('NFD')
            .replace(/\p{Diacritic}/gu, '')}${i}${DEMO_DOMAIN}`,
          // Algunos clientes "nuevos" esta semana para el dashboard
          createdAt: i < 3 ? now : new Date(now.getTime() - (20 + i) * 86_400_000),
        },
      }),
    ),
  );

  const professionals = await prisma.professional.findMany({
    where: { businessId: business.id, isActive: true, deletedAt: null },
    include: {
      workingHours: true,
      services: { include: { service: true } },
    },
  });

  let created = 0;
  for (let offset = -14; offset <= 7; offset++) {
    const date = addDays(today, offset);
    const weekday = weekdayOf(date);
    for (const p of professionals) {
      const services = p.services.map((s) => s.service).filter((s) => s.isActive && !s.deletedAt);
      if (!services.length) continue;
      const occupancy = offset < 0 ? 0.62 : offset === 0 ? 0.55 : 0.35;

      for (const range of p.workingHours.filter((w) => w.weekday === weekday)) {
        let minute = range.startMinute;
        while (minute < range.endMinute) {
          const service = pick(services);
          if (minute + service.durationMinutes > range.endMinute) break;
          if (random() > occupancy) {
            minute += 30;
            continue;
          }
          const startsAt = zonedToUtc(date, minute, tz);
          const endsAt = new Date(startsAt.getTime() + service.durationMinutes * 60_000);
          const past = endsAt < now;
          const roll = random();
          const status: AppointmentStatus = past
            ? roll < 0.85
              ? 'COMPLETED'
              : roll < 0.93
                ? 'NO_SHOW'
                : 'CANCELLED'
            : roll < 0.6
              ? 'CONFIRMED'
              : roll < 0.95
                ? 'PENDING'
                : 'CANCELLED';

          try {
            await prisma.appointment.create({
              data: {
                businessId: business.id,
                customerId: pick(customers).id,
                professionalId: p.id,
                serviceId: service.id,
                startsAt,
                endsAt,
                status,
                source: random() < 0.7 ? 'WEB' : 'ADMIN',
                serviceNameSnapshot: service.name,
                priceCents: service.priceCents,
                durationMinutes: service.durationMinutes,
                paymentStatus: status === 'COMPLETED' ? 'PAID' : 'UNPAID',
                paymentMethod:
                  status === 'COMPLETED' ? pick(['CASH', 'CARD', 'TRANSFER'] as const) : null,
                ...(status === 'CANCELLED'
                  ? {
                      cancelledAt: new Date(startsAt.getTime() - 86_400_000),
                      cancelReason: 'Cancelada por el cliente',
                    }
                  : {}),
              },
            });
            created++;
          } catch {
            // Se cruza con una cita real existente: se omite.
          }
          minute += service.durationMinutes + (random() < 0.3 ? 15 : 0);
        }
      }
    }
  }

  console.log(`Listo: ${customers.length} clientes y ${created} citas de demostración.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
