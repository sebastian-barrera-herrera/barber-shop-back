/**
 * Datos demo: "Studio Demo" con 3 profesionales, 4 categorías y servicios reales.
 * Idempotente: si el negocio ya existe, no modifica nada.
 *
 *   npm run db:seed
 */
import { PrismaClient, Role } from '@prisma/client';
import { slugify } from '../src/common/utils/slug';
import { hashPassword } from '../src/modules/auth/password';

const prisma = new PrismaClient();
const SLUG = 'studio-demo';

const pesos = (cop: number) => cop * 100; // precios en centavos
const hm = (h: number, m = 0) => h * 60 + m; // minutos desde medianoche

const CATALOG = [
  {
    name: 'Barbería',
    services: [
      ['Corte clásico', 'Tijera y máquina, lavado y peinado.', 35_000, 45],
      ['Corte + barba', 'Corte completo y perfilado de barba con toalla caliente.', 50_000, 60],
      ['Barba', 'Perfilado, rebajado y acabado a navaja.', 25_000, 30],
      ['Corte infantil', 'Para niños hasta 12 años.', 28_000, 30],
      ['Afeitado clásico', 'Afeitado a navaja con toalla caliente.', 30_000, 30],
    ],
  },
  {
    name: 'Cabello',
    services: [
      ['Corte dama', 'Corte, lavado y secado.', 45_000, 60],
      ['Cepillado', 'Lavado y cepillado con protector térmico.', 35_000, 45],
      ['Color', 'Tinte completo. El precio puede variar según el largo.', 120_000, 120],
      ['Tratamiento hidratante', 'Mascarilla nutritiva y masaje capilar.', 60_000, 45],
    ],
  },
  {
    name: 'Uñas',
    services: [
      ['Manicure', 'Limado, cutícula y esmaltado tradicional.', 25_000, 45],
      ['Pedicure', 'Limpieza, exfoliación y esmaltado.', 35_000, 60],
      ['Manicure semipermanente', 'Esmaltado en gel que dura hasta 3 semanas.', 45_000, 60],
      ['Uñas acrílicas', 'Set completo de uñas acrílicas.', 90_000, 120],
      ['Uñas en gel', 'Set completo en gel con diseño sencillo.', 80_000, 90],
    ],
  },
  {
    name: 'Spa',
    services: [
      ['Limpieza facial', 'Limpieza profunda, extracción e hidratación.', 80_000, 60],
      ['Masaje relajante', 'Masaje de cuerpo completo con aceites.', 110_000, 60],
      ['Depilación con cera', 'Zona a elegir en el local.', 30_000, 30],
    ],
  },
] as const;

const PROFESSIONALS = [
  {
    name: 'Carlos',
    title: 'Barbero',
    bio: 'Doce años detrás de la silla. Fades limpios y barbas bien trabajadas.',
    specialties: ['Fade', 'Corte clásico', 'Barba'],
    color: '#3B4A5A',
    categories: ['Barbería'],
    email: 'carlos@studio.local',
    // Descansa los miércoles
    hours: {
      1: [
        [9, 13],
        [14, 19],
      ],
      2: [
        [9, 13],
        [14, 19],
      ],
      4: [
        [9, 13],
        [14, 19],
      ],
      5: [
        [9, 13],
        [14, 19],
      ],
      6: [[9, 15]],
    },
  },
  {
    name: 'María',
    title: 'Manicurista',
    bio: 'Uñas prolijas y diseños a mano alzada.',
    specialties: ['Semipermanente', 'Uñas en gel', 'Nail art'],
    color: '#8A3B4A',
    categories: ['Uñas'],
    email: 'maria@studio.local',
    hours: {
      1: [[10, 19]],
      2: [[10, 19]],
      3: [[10, 19]],
      4: [[10, 19]],
      5: [[10, 19]],
      6: [[9, 16]],
    },
  },
  {
    name: 'Laura',
    title: 'Estilista y terapeuta',
    bio: 'Color, cortes y rituales de spa para desconectarse.',
    specialties: ['Color', 'Cepillado', 'Masajes'],
    color: '#5B6B4E',
    categories: ['Cabello', 'Spa'],
    email: 'laura@studio.local',
    // Descansa los lunes
    hours: {
      2: [
        [9, 13],
        [14, 18],
      ],
      3: [
        [9, 13],
        [14, 18],
      ],
      4: [
        [9, 13],
        [14, 18],
      ],
      5: [
        [9, 13],
        [14, 18],
      ],
      6: [[9, 17]],
    },
  },
] as const;

async function main() {
  const existing = await prisma.business.findUnique({ where: { slug: SLUG } });
  if (existing) {
    console.log(`"${SLUG}" ya existe; no se modificó nada. Para empezar de cero: npm run db:reset`);
    return;
  }

  const adminEmail = (process.env.SEED_ADMIN_EMAIL || 'admin@studio.local').toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  if (!adminPassword || adminPassword.length < 8) {
    throw new Error(
      'Define SEED_ADMIN_PASSWORD (mínimo 8 caracteres) en .env antes de correr el seed',
    );
  }
  const passwordHash = await hashPassword(adminPassword);

  await prisma.$transaction(
    async (tx) => {
      const business = await tx.business.create({
        data: {
          slug: SLUG,
          name: 'Studio Demo',
          type: 'OTHER',
          description: 'Barbería, peluquería, uñas y spa en un solo lugar.',
          phone: '+573001234567',
          whatsapp: '+573001234567',
          email: 'hola@studio.local',
          address: 'Calle 85 # 11-20',
          city: 'Bogotá',
          country: 'CO',
          latitude: 4.6697,
          longitude: -74.0521,
          settings: {
            create: {
              branding: { preset: 'studio' },
              social: { instagram: 'https://instagram.com/studio', whatsapp: '+573001234567' },
              booking: {
                slotStepMinutes: 15,
                minAdvanceMinutes: 60,
                maxAdvanceDays: 30,
                autoConfirm: false,
              },
            },
          },
        },
      });

      await tx.user.create({
        data: {
          businessId: business.id,
          email: adminEmail,
          passwordHash,
          name: 'Administrador',
          role: Role.OWNER,
        },
      });

      const servicesByCategory = new Map<string, string[]>();
      for (const [ci, category] of CATALOG.entries()) {
        const created = await tx.category.create({
          data: {
            businessId: business.id,
            name: category.name,
            slug: slugify(category.name),
            sortOrder: ci,
          },
        });
        const ids: string[] = [];
        for (const [si, [name, description, price, duration]] of category.services.entries()) {
          const service = await tx.service.create({
            data: {
              businessId: business.id,
              categoryId: created.id,
              name,
              slug: slugify(name),
              description,
              priceCents: pesos(price),
              durationMinutes: duration,
              sortOrder: si,
            },
          });
          ids.push(service.id);
        }
        servicesByCategory.set(category.name, ids);
      }

      for (const [pi, p] of PROFESSIONALS.entries()) {
        const user = await tx.user.create({
          data: {
            businessId: business.id,
            email: p.email,
            passwordHash,
            name: p.name,
            role: Role.PROFESSIONAL,
          },
        });
        await tx.professional.create({
          data: {
            businessId: business.id,
            userId: user.id,
            name: p.name,
            slug: slugify(p.name),
            title: p.title,
            bio: p.bio,
            specialties: [...p.specialties],
            color: p.color,
            sortOrder: pi,
            services: {
              create: p.categories
                .flatMap((c) => servicesByCategory.get(c) ?? [])
                .map((serviceId) => ({ serviceId })),
            },
            workingHours: {
              create: Object.entries(p.hours).flatMap(([weekday, ranges]) =>
                (ranges as readonly (readonly [number, number])[]).map(([from, to]) => ({
                  weekday: Number(weekday),
                  startMinute: hm(from),
                  endMinute: hm(to),
                })),
              ),
            },
          },
        });
      }
    },
    { timeout: 30_000 },
  );

  console.log('Datos demo creados.');
  console.log(`  Negocio: Studio Demo (slug "${SLUG}")`);
  console.log(`  Dueño:   ${adminEmail} (contraseña: SEED_ADMIN_PASSWORD)`);
  console.log('  Profesionales: carlos@, maria@, laura@studio.local (misma contraseña)');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
