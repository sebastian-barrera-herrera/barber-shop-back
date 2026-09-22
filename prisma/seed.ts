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
  await seedBarberia();
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

/**
 * Segunda empresa demo, con el estilo Barbería: sirve para ver los dos diseños
 * y comprobar que cada empresa solo ve lo suyo.
 */
const BARBER_SLUG = 'barberia-demo';
const BARBER_CATALOG = [
  {
    name: 'Cortes',
    services: [
      ['Corte clásico', 'Tijera y máquina, lavado y peinado con pomada.', 38_000, 45],
      ['Fade', 'Degradado a máquina con acabado a navaja.', 42_000, 45],
      ['Corte infantil', 'Para niños hasta 12 años.', 30_000, 30],
    ],
  },
  {
    name: 'Barba y afeitado',
    services: [
      ['Corte + barba', 'Corte completo y perfilado de barba con toalla caliente.', 55_000, 60],
      ['Arreglo de barba', 'Perfilado, rebajado y aceite.', 25_000, 30],
      ['Afeitado con toalla caliente', 'Espuma tibia, navaja y bálsamo.', 32_000, 30],
    ],
  },
] as const;
const BARBERS = [
  {
    name: 'Julián',
    title: 'Barbero principal',
    bio: 'Quince años de oficio. Cortes clásicos y afeitado a navaja.',
    specialties: ['Clásico', 'Navaja'],
    color: '#7A2E2E',
    email: 'julian@barberia.local',
  },
  {
    name: 'Esteban',
    title: 'Barbero',
    bio: 'Fades limpios y diseño de barba.',
    specialties: ['Fade', 'Barba'],
    color: '#2F3E35',
    email: 'esteban@barberia.local',
  },
] as const;

async function seedBarberia() {
  if (await prisma.business.findUnique({ where: { slug: BARBER_SLUG } })) return;
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password || password.length < 8) return;
  const passwordHash = await hashPassword(password);

  await prisma.$transaction(
    async (tx) => {
      const business = await tx.business.create({
        data: {
          slug: BARBER_SLUG,
          name: 'Barbería Demo',
          style: 'BARBER',
          type: 'BARBERSHOP',
          description: 'Barbería clásica: cortes, barba y afeitado con toalla caliente.',
          phone: '+573005550100',
          whatsapp: '+573005550100',
          email: 'hola@barberia.local',
          address: 'Carrera 43A # 9-50',
          city: 'Medellín',
          settings: {
            create: {
              branding: {
                preset: 'clasico',
                primaryColor: '#1C1B1A',
                secondaryColor: '#B23A3A',
                heroTitle: 'El buen corte no pasa de moda.',
                heroSubtitle: 'Reserva tu silla en un minuto. Sin llamadas, sin esperas.',
              },
              social: { instagram: 'https://instagram.com/barberia', whatsapp: '+573005550100' },
              booking: { slotStepMinutes: 15, autoConfirm: true },
            },
          },
        },
      });
      await tx.user.create({
        data: {
          businessId: business.id,
          email: 'barberia@studio.local',
          passwordHash,
          name: 'Dueño Barbería',
          role: Role.OWNER,
        },
      });
      const serviceIds: string[] = [];
      for (const [ci, category] of BARBER_CATALOG.entries()) {
        const cat = await tx.category.create({
          data: {
            businessId: business.id,
            name: category.name,
            slug: slugify(category.name),
            sortOrder: ci,
          },
        });
        for (const [si, [name, description, price, duration]] of category.services.entries()) {
          const service = await tx.service.create({
            data: {
              businessId: business.id,
              categoryId: cat.id,
              name,
              slug: slugify(name),
              description,
              priceCents: pesos(price),
              durationMinutes: duration,
              sortOrder: si,
            },
          });
          serviceIds.push(service.id);
        }
      }
      for (const [pi, b] of BARBERS.entries()) {
        const user = await tx.user.create({
          data: {
            businessId: business.id,
            email: b.email,
            passwordHash,
            name: b.name,
            role: Role.PROFESSIONAL,
          },
        });
        await tx.professional.create({
          data: {
            businessId: business.id,
            userId: user.id,
            name: b.name,
            slug: slugify(b.name),
            title: b.title,
            bio: b.bio,
            specialties: [...b.specialties],
            color: b.color,
            sortOrder: pi,
            services: { create: serviceIds.map((serviceId) => ({ serviceId })) },
            workingHours: {
              create: [1, 2, 3, 4, 5, 6].map((weekday) => ({
                weekday,
                startMinute: hm(weekday === 6 ? 9 : 10),
                endMinute: hm(weekday === 6 ? 16 : 20),
              })),
            },
          },
        });
      }
    },
    { timeout: 30_000 },
  );
  console.log('  Barbería Demo (slug "barberia-demo"): barberia@studio.local');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
