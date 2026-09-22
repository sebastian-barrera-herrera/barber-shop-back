import { BadRequestException, ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { normalizePhone } from '../../common/utils/phone';
import { slugify, uniqueSlug } from '../../common/utils/slug';
import { AppConfig } from '../../config/app-config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService, type SessionMeta } from '../auth/auth.service';
import { hashPassword } from '../auth/password';
import { MAIL_TRANSPORT, type MailTransport } from '../notifications/email/mail-transport';
import { welcomeEmail } from '../notifications/email/platform-templates';
import type { RegisterBusinessDto } from './dto/register.dto';
import { RESERVED_SLUGS, slugProblem } from './reserved-slugs';
import { defaultType, starterKit } from './starter-kits';

const hm = (h: number) => h * 60;

@Injectable()
export class PlatformService {
  private readonly logger = new Logger(PlatformService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly config: AppConfig,
    @Inject(MAIL_TRANSPORT) private readonly mail: MailTransport,
  ) {}

  private async slugTaken(slug: string) {
    if (RESERVED_SLUGS.has(slug)) return true;
    return !!(await this.prisma.business.findUnique({ where: { slug }, select: { id: true } }));
  }

  /** Para el formulario de registro: ¿está libre esta dirección? Si no, propone una. */
  async checkSlug(input: { slug?: string; name?: string }) {
    const slug = input.slug
      ? input.slug.trim().toLowerCase()
      : slugify(input.name ?? '').slice(0, 40);
    const problem = slugProblem(slug);
    const taken = !problem && (await this.slugTaken(slug));
    const available = !problem && !taken;
    const base = slugify(input.name || slug).slice(0, 36);
    const suggestion = available
      ? slug
      : await uniqueSlug(base.length >= 3 ? base : 'mi-negocio', (s) => this.slugTaken(s));
    return {
      slug,
      available,
      reason: problem ?? (taken ? 'Esa dirección ya la tiene otro negocio' : null),
      suggestion,
    };
  }

  /**
   * Registro libre de una empresa: negocio + dueño (que también atiende) + carta de ejemplo
   * según el estilo. Todo en una transacción; al final abre sesión.
   */
  async register(dto: RegisterBusinessDto, meta: SessionMeta) {
    const problem = slugProblem(dto.slug);
    if (problem) throw new BadRequestException(problem);
    const phone = dto.phone ? normalizePhone(dto.phone, 'CO') : null;
    if (dto.phone && !phone) throw new BadRequestException('Revisa el teléfono');

    const kit = starterKit(dto.style);
    const passwordHash = await hashPassword(dto.password);
    let userId: string;
    try {
      userId = await this.prisma.$transaction(
        async (tx) => {
          if (await tx.user.findUnique({ where: { email: dto.email }, select: { id: true } })) {
            throw new ConflictException('Ya hay una cuenta con ese correo. ¿Quieres entrar?');
          }
          if (await tx.business.findUnique({ where: { slug: dto.slug }, select: { id: true } })) {
            throw new ConflictException('Esa dirección ya la tiene otro negocio');
          }
          const business = await tx.business.create({
            data: {
              slug: dto.slug,
              name: dto.businessName,
              style: dto.style,
              type: dto.type ?? defaultType(dto.style),
              phone,
              whatsapp: phone,
              email: dto.email,
              city: dto.city || null,
              settings: {
                create: {
                  // Sin colores propios: manda la paleta del estilo hasta que el dueño la cambie.
                  branding: {
                    preset: kit.preset,
                    heroTitle: kit.heroTitle,
                    heroSubtitle: kit.heroSubtitle,
                  },
                  social: phone ? { whatsapp: phone } : {},
                },
              },
            },
          });
          const user = await tx.user.create({
            data: {
              businessId: business.id,
              email: dto.email,
              passwordHash,
              name: dto.ownerName,
              role: Role.OWNER,
            },
          });

          const serviceIds: string[] = [];
          for (const [ci, category] of kit.categories.entries()) {
            const cat = await tx.category.create({
              data: {
                businessId: business.id,
                name: category.name,
                slug: slugify(category.name),
                sortOrder: ci,
              },
            });
            for (const [si, [name, description, pesos, minutes]] of category.services.entries()) {
              const service = await tx.service.create({
                data: {
                  businessId: business.id,
                  categoryId: cat.id,
                  name,
                  slug: slugify(name),
                  description,
                  priceCents: pesos * 100,
                  durationMinutes: minutes,
                  sortOrder: si,
                },
              });
              serviceIds.push(service.id);
            }
          }

          // El dueño también atiende: así la página acepta reservas desde el primer minuto.
          await tx.professional.create({
            data: {
              businessId: business.id,
              userId: user.id,
              name: dto.ownerName,
              slug: slugify(dto.ownerName),
              title: kit.ownerTitle,
              services: { create: serviceIds.map((serviceId) => ({ serviceId })) },
              workingHours: {
                create: [
                  ...[1, 2, 3, 4, 5].map((weekday) => ({
                    weekday,
                    startMinute: hm(9),
                    endMinute: hm(19),
                  })),
                  { weekday: 6, startMinute: hm(9), endMinute: hm(17) },
                ],
              },
            },
          });
          return user.id;
        },
        { timeout: 20_000 },
      );
    } catch (err) {
      // Dos registros simultáneos con el mismo correo o la misma dirección.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(
          'Ese correo o esa dirección acaban de registrarse. Prueba con otros',
        );
      }
      throw err;
    }

    void this.sendWelcome(dto);
    const session = await this.auth.startSession(userId, meta);
    return { session, business: { slug: dto.slug, style: dto.style } };
  }

  private async sendWelcome(dto: RegisterBusinessDto) {
    if (!this.mail.enabled) return;
    const web = this.config.get('WEB_URL');
    const email = welcomeEmail({
      platform: this.config.get('PLATFORM_NAME'),
      ownerName: dto.ownerName,
      businessName: dto.businessName,
      pageUrl: `${web}/${dto.slug}`,
      panelUrl: `${web}/admin`,
    });
    await this.mail.send({ to: dto.email, ...email }).catch((err: Error) => {
      this.logger.error(`No se pudo enviar la bienvenida: ${err.message}`);
    });
  }
}
